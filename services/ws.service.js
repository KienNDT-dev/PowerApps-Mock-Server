const jwt = require("jsonwebtoken");
const {
  getBidPackageById,
  updateBid,
  submitOrUpdateBid,
} = require("./bid.service");
const { validateSocketAuth } = require("../utils/validateSocketAuth");
const { getContractorByAuthId } = require("./invitations.service");

class WebSocketService {
  constructor() {
    this.io = null;
    this.userRooms = new Map();
    this.roomParticipants = new Map();
    this.notifications = new Map();
  }

  init(io) {
    this.io = io;

    io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.access_token;
      console.log("Token received:", token);
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

          const roomName = `bidPackage:${bidPackageId}`; // Move this line up
          console.log(`Socket ${socket.id} joined room:`, roomName);
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
        } catch (error) {
          console.error("Error joining bid package room:", error); // Add error logging
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

            const contractorInfo = await this.getContractorInfo(socket.userId);
            const notification = {
              id: `notif_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 11)}`,
              type: "bid_submitted",
              message: `${
                contractorInfo.name
              } has submitted a new bid of ${bidPrice.toLocaleString()} VND`,
              contractorName: contractorInfo.name,
              bidPrice: bidPrice,
              timestamp: new Date().toISOString(),
              timeAgo: "just now",
              bidPackageId: bidPackageId,
              contractorId: socket.userId,
            };

            this.addNotification(bidPackageId, notification);

            socket.to(roomName).emit("notification:new", notification);
            console.log(
              "Notification emitted to room:",
              roomName,
              notification
            );
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

            // Get contractor info for notification
            const contractorInfo = await this.getContractorInfo(socket.userId);

            // Create notification for bid update
            const notification = {
              id: `notif_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 11)}`,
              type: "bid_updated",
              message: `${contractorInfo.name} has updated their bid to ${
                updateFields.bidPrice?.toLocaleString() || "new amount"
              } VND`,
              contractorName: contractorInfo.name,
              bidPrice: updateFields.bidPrice,
              timestamp: new Date().toISOString(),
              timeAgo: "just now",
              bidPackageId: bidPackageId,
              contractorId: socket.userId,
            };

            // Store notification
            this.addNotification(bidPackageId, notification);

            // Broadcast to room (excluding the sender)
            socket.to(roomName).emit("notification:new", notification);

            // Broadcast bid update to everyone
            this.io.to(roomName).emit("bid:updated", updatedBid);
            console.log(
              "Notification emitted to room:",
              roomName,
              notification
            );
            callback?.({ success: true, bid: updatedBid });
          } catch (err) {
            callback?.({
              success: false,
              message: err.message || "Server error",
            });
          }
        }
      );

      // Add handler to get notifications when joining a room
      socket.on("notifications:get", ({ bidPackageId }, callback) => {
        if (!validateSocketAuth(socket)) return;

        const notifications = this.getNotifications(bidPackageId);
        callback?.({
          success: true,
          notifications: notifications,
        });
      });

      socket.on("viewer:count:request", async ({ bidPackageId }, callback) => {
        if (!validateSocketAuth(socket)) return;

        try {
          const count = await this.getRoomParticipantCount(bidPackageId);
          console.log(`Viewer count requested for ${bidPackageId}: ${count}`);

          socket.emit("viewer:count", {
            bidPackageId,
            viewers: count,
          });

          callback?.({ success: true, viewers: count });
        } catch (error) {
          console.error("Error getting viewer count:", error);
          callback?.({ success: false, error: error.message });
        }
      });

      socket.on("disconnect", () => {
        if (this.userRooms.has(socket.userId)) {
          const rooms = this.userRooms.get(socket.userId);
          rooms.forEach((bidPackageId) => {
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

    this.roomParticipants.set(bidPackageId, activeUserIds);
  }

  async getRoomParticipantCount(bidPackageId) {
    if (!this.io) return 0;

    await this.updateRoomParticipants(bidPackageId);

    const participants = this.roomParticipants.get(bidPackageId);
    return participants ? participants.size : 0;
  }
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

  async getContractorInfo(contractorAuthId) {
    try {
      const contractor = await getContractorByAuthId(contractorAuthId);
      return {
        name:
          contractor?.cr97b_name || `Contractor ${contractorAuthId.slice(-4)}`,
        id: contractorAuthId,
      };
    } catch (error) {
      console.error("Error getting contractor info:", error);
      return {
        name: `Contractor ${contractorAuthId.slice(-4)}`,
        id: contractorAuthId,
      };
    }
  }

  addNotification(bidPackageId, notification) {
    if (!this.notifications.has(bidPackageId)) {
      this.notifications.set(bidPackageId, []);
    }

    const roomNotifications = this.notifications.get(bidPackageId);
    roomNotifications.unshift(notification);

    if (roomNotifications.length > 50) {
      roomNotifications.splice(50);
    }

    this.notifications.set(bidPackageId, roomNotifications);
  }

  getNotifications(bidPackageId) {
    const notifications = this.notifications.get(bidPackageId) || [];
    return notifications.map((notif) => ({
      ...notif,
      timeAgo: this.getTimeAgo(notif.timestamp),
    }));
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  async cleanupEmptyRoomNotifications(bidPackageId) {
    const count = await this.getRoomParticipantCount(bidPackageId);
    if (count === 0) {
      this.notifications.delete(bidPackageId);
      console.log(
        `🧹 Cleaned up notifications for empty room: ${bidPackageId}`
      );
    }
  }
}

module.exports = new WebSocketService();
