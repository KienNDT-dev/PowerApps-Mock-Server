const jwt = require("jsonwebtoken");

class WebSocketService {
  constructor() {
    this.io = null;
  }

  init(io) {
    this.io = io;

    // JWT Authentication middleware
    io.use((socket, next) => {
      const token = socket.handshake.headers.access_token;
      if (!token) {
        return next(new Error("No token provided"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.sub;
        socket.userEmail = decoded.email;
        next();
      } catch {
        next(new Error("Invalid token"));
      }
    });

    io.on("connection", (socket) => {
      console.log(`🔌 Client connected: ${socket.id} (${socket.userEmail})`);

      // ✅ Health check event for Postman or client testing
      socket.on("health-check", (payload, callback) => {
        console.log(`📥 Health check from ${socket.id}:`, payload);
        // socket.emit("health-response", {
        //   ok: true,
        //   serverTime: new Date().toISOString(),
        //   user: socket.userEmail || null,
        // });
        callback({
          ok: true,
          serverTime: new Date().toISOString(),
          user: socket.userEmail || null,
          receivedPayload: payload,
        });
      });

      socket.on("join:bidPackage", ({ bidPackageId }) => {
        const roomName = `bidPackage:${bidPackageId}`;
        socket.join(roomName);
        console.log(`📦 ${socket.id} joined room ${roomName}`);
        socket.emit("room:joined", { bidPackageId, roomName });
      });

      socket.on("leave:bidPackage", ({ bidPackageId }) => {
        const roomName = `bidPackage:${bidPackageId}`;
        socket.leave(roomName);
        console.log(`📦 ${socket.id} left room ${roomName}`);
        socket.emit("room:left", { bidPackageId, roomName });
      });

      socket.on("disconnect", (reason) => {
        console.log(`❌ Client disconnected: ${socket.id} (${reason})`);
      });
    });

    console.log("✅ WebSocket service initialized");
  }

  // Broadcast bid update
  publishBidUpdate({ bidPackageId, bidId, fieldsChanged, updatedBy }) {
    if (!this.io) return;
    const roomName = `bidPackage:${bidPackageId}`;
    this.io.to(roomName).emit("bid:updated", {
      bidPackageId,
      bidId,
      fieldsChanged,
      updatedBy,
      timestamp: new Date().toISOString(),
    });
    console.log(`📡 Bid update sent to ${roomName} (Bid: ${bidId})`);
  }

  // Broadcast new bid
  publishNewBid({ bidPackageId, bidId, submittedBy }) {
    if (!this.io) return;
    const roomName = `bidPackage:${bidPackageId}`;
    this.io.to(roomName).emit("bid:new", {
      bidPackageId,
      bidId,
      submittedBy,
      timestamp: new Date().toISOString(),
    });
    console.log(`📡 New bid sent to ${roomName} (Bid: ${bidId})`);
  }

  // Get number of connected clients in a room
  async getRoomClientCount(bidPackageId) {
    if (!this.io) return 0;
    const roomName = `bidPackage:${bidPackageId}`;
    const sockets = await this.io.in(roomName).fetchSockets();
    return sockets.length;
  }
}

module.exports = new WebSocketService();
