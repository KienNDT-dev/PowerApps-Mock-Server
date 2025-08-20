const jwt = require("jsonwebtoken");
const {
  getBidPackageById,
  updateBid,
  submitOrUpdateBid,
} = require("./bid.service");
const { validateSocketAuth } = require("../utils/validateSocketAuth");

class WebSocketService {
  constructor() {
    this.io = null;
    this.userRooms = new Map();
    this.roomParticipants = new Map();
  }

  init(io) {
    this.io = io;

    io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.access_token;
      if (!token) return next(new Error("No token provided"));
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.sub;
        socket.userEmail = decoded.email;
        socket.contractorAuthId = decoded.sub;
        next();
      } catch {
        next(new Error("Invalid token"));
      }
    });

    io.on("connection", (socket) => {
      socket.on("health-check", (_, callback) => {
        callback?.({
          ok: true,
          serverTime: new Date().toISOString(),
          user: socket.userEmail || null,
        });
      });

      socket.on("join:bidPackage", async ({ bidPackageId }, callback) => {
        if (!validateSocketAuth(socket)) return;
        try {
          const bidPackage = await getBidPackageById(bidPackageId);
          if (!bidPackage || bidPackage.error || bidPackage.code) {
            return callback?.({
              success: false,
              message: "Bid package not found",
            });
          }

          const roomName = `bidPackage:${bidPackageId}`;
          await socket.join(roomName);

          const rooms = this.userRooms.get(socket.userId) || [];
          if (!rooms.includes(bidPackageId)) rooms.push(bidPackageId);
          this.userRooms.set(socket.userId, rooms);

          if (!this.roomParticipants.has(bidPackageId)) {
            this.roomParticipants.set(bidPackageId, new Set());
          }
          this.roomParticipants.get(bidPackageId).add(socket.userId);

          this.broadcastViewerCount(bidPackageId);
          callback?.({ success: true, roomName });
        } catch {
          callback?.({
            success: false,
            message: "Error validating bid package",
          });
        }
      });

      socket.on("leave:bidPackage", ({ bidPackageId }, callback) => {
        const roomName = `bidPackage:${bidPackageId}`;
        socket.leave(roomName);

        const rooms = this.userRooms.get(socket.userId) || [];
        this.userRooms.set(
          socket.userId,
          rooms.filter((id) => id !== bidPackageId)
        );

        this.updateRoomParticipants(bidPackageId);
        this.broadcastViewerCount(bidPackageId);
        callback?.({ success: true, roomName });
      });

      socket.on(
        "bid:create",
        async ({ bidPackageId, bidPrice, bidName }, callback) => {
          if (!validateSocketAuth(socket)) return;
          try {
            const roomName = `bidPackage:${bidPackageId}`;
            if (!socket.rooms.has(roomName)) {
              return callback?.({
                success: false,
                message:
                  "You must join this bid package room before creating a bid",
              });
            }
            const bidRecord = await submitOrUpdateBid({
              bidPackageId,
              contractorAuthId: socket.userId,
              bidPrice,
              bidName,
            });
            this.io.to(roomName).emit("bid:new", bidRecord);
            callback?.({ success: true, bid: bidRecord });
          } catch (err) {
            callback?.({
              success: false,
              message: err.message || "Server error",
            });
          }
        }
      );

      socket.on(
        "bid:update",
        async ({ bidId, bidPackageId, updateFields }, callback) => {
          if (!validateSocketAuth(socket)) return;
          try {
            const roomName = `bidPackage:${bidPackageId}`;
            if (!socket.rooms.has(roomName)) {
              return callback?.({
                success: false,
                message:
                  "You must join this bid package room before updating a bid",
              });
            }

            const updatedBid = await updateBid(
              bidId,
              updateFields,
              socket.contractorAuthId
            );

            this.io.to(roomName).emit("bid:updated", updatedBid);
            callback?.({ success: true, bid: updatedBid });
          } catch (err) {
            callback?.({
              success: false,
              message: err.message || "Server error",
            });
          }
        }
      );

      socket.on("disconnect", () => {
        if (this.userRooms.has(socket.userId)) {
          const rooms = this.userRooms.get(socket.userId);
          rooms.forEach((bidPackageId) => {
            // Update participants and broadcast new count
            this.updateRoomParticipants(bidPackageId);
            this.broadcastViewerCount(bidPackageId);
          });
          this.userRooms.delete(socket.userId);
        }
      });
    });
  }

  logRoomStats(bidPackageId) {
    const participants = this.roomParticipants.get(bidPackageId);
    const userRoomsList = Array.from(this.userRooms.entries())
      .filter(([userId, rooms]) => rooms.includes(bidPackageId))
      .map(([userId]) => userId);

    console.log(`📊 Room Stats for ${bidPackageId}:`);
    console.log(`   👥 Participants: ${participants ? participants.size : 0}`);
    console.log(
      `   🔗 User IDs: ${
        participants ? Array.from(participants).join(", ") : "none"
      }`
    );
    console.log(`   📋 Users in room tracking: ${userRoomsList.join(", ")}`);
  }

  // Update room participants based on actual connected sockets
  async updateRoomParticipants(bidPackageId) {
    if (!this.io) return;

    const roomName = `bidPackage:${bidPackageId}`;
    const sockets = await this.io.in(roomName).fetchSockets();
    const activeUserIds = new Set(sockets.map((socket) => socket.userId));

    // Update the participants set with only active users
    this.roomParticipants.set(bidPackageId, activeUserIds);
  }

  // Get count of unique participants (not connections)
  async getRoomParticipantCount(bidPackageId) {
    if (!this.io) return 0;

    // Update participants first to ensure accuracy
    await this.updateRoomParticipants(bidPackageId);

    const participants = this.roomParticipants.get(bidPackageId);
    return participants ? participants.size : 0;
  }

  // Keep old method for backward compatibility, but use participant count
  async getRoomClientCount(bidPackageId) {
    return this.getRoomParticipantCount(bidPackageId);
  }

  async broadcastViewerCount(bidPackageId) {
    const participants = await this.getRoomParticipantCount(bidPackageId);
    console.log(`Room ${bidPackageId}: ${participants} unique participants`);
    this.logRoomStats(bidPackageId);
    const roomName = `bidPackage:${bidPackageId}`;
    this.io.to(roomName).emit("viewer:count", {
      bidPackageId,
      viewers: participants,
    });
  }

  async disconnectUser(userId) {
    if (!this.io) return;

    try {
      const sockets = await this.io.fetchSockets();
      const userSockets = sockets.filter((socket) => socket.userId === userId);

      userSockets.forEach((socket) => {
        socket.emit("auth:logout", {
          message: "You have been logged out from another session",
        });
        socket.disconnect(true);
      });

      // Clean up tracking and update participant counts
      if (this.userRooms.has(userId)) {
        const rooms = this.userRooms.get(userId);
        rooms.forEach((bidPackageId) => {
          this.updateRoomParticipants(bidPackageId);
          this.broadcastViewerCount(bidPackageId);
        });
      }
      this.userRooms.delete(userId);

      console.log(
        `Disconnected ${userSockets.length} WebSocket connections for user ${userId}`
      );
    } catch (error) {
      console.error("Error disconnecting user WebSocket connections:", error);
    }
  }
}

module.exports = new WebSocketService();
