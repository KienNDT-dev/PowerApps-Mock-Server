const jwt = require("jsonwebtoken");

const validateSocketAuth = (socket) => {
  try {
    const decoded = jwt.verify(
      socket.handshake.auth?.token || socket.handshake.headers?.access_token,
      process.env.JWT_SECRET
    );
    return decoded;
  } catch (error) {
    console.log(`❌ Socket auth validation failed: ${error.message}`);
    socket.emit("auth:invalid", {
      message: "Session expired. Please login again.",
    });
    socket.disconnect(true);
    return null;
  }
};

module.exports = { validateSocketAuth };
