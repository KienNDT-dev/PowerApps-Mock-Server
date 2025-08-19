const jwt = require("jsonwebtoken");
const {
  getBidPackageById,
  updateBid,
  submitOrUpdateBid,
} = require("./bid.service");

class WebSocketService {
  constructor() {
    this.io = null;
    this.userRooms = new Map();
  }

  init(io) {
    this.io = io;

    io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.sub;
        socket.userEmail = decoded.email;
        socket.contractorAuthId = decoded.sub; // Ensure this is always set
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
        this.broadcastViewerCount(bidPackageId);
        callback?.({ success: true, roomName });
      });

      socket.on(
        "bid:create",
        async ({ bidPackageId, bidPrice, bidName }, callback) => {
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
            this.broadcastViewerCount(bidPackageId);
          });
          this.userRooms.delete(socket.userId);
        }
      });
    });
  }

  async getRoomClientCount(bidPackageId) {
    if (!this.io) return 0;
    const roomName = `bidPackage:${bidPackageId}`;
    const sockets = await this.io.in(roomName).fetchSockets();
    return sockets.length;
  }

  async broadcastViewerCount(bidPackageId) {
    const count = await this.getRoomClientCount(bidPackageId);
    console.log(count);
    const roomName = `bidPackage:${bidPackageId}`;
    this.io.to(roomName).emit("viewer:count", {
      bidPackageId,
      viewers: count,
    });
  }
}

module.exports = new WebSocketService();
