const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const { port } = require("./config");
const { instrument } = require("@socket.io/admin-ui");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://admin.socket.io"],
    credentials: true,
    methods: ["GET", "POST"],
  },
});

try {
  const wsService = require("./services/ws.service");
  wsService.init(io);
} catch (err) {
  console.warn(
    "⚠️ WebSocket service not found, continuing without Socket.IO features"
  );
}

instrument(io, {
  auth: false,
  mode: "development",
});

server.listen(port, () => {
  console.log(`🚀 API listening on http://localhost:${port}`);
  console.log(`🔌 Socket.IO listening at ws://localhost:${port}/socket.io/`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received. Closing server...`);

  io.close(() => {
    console.log("🛑 Socket.IO connections closed");

    server.close((err) => {
      if (err) {
        console.error("Error closing server", err);
        process.exit(1);
      }
      console.log("✅ Server closed gracefully");
      process.exit(0);
    });
  });
}

["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  shutdown("unhandledRejection");
});
