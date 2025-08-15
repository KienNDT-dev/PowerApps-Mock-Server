const { MSG } = require("../constants/messages.en");
const { CODES } = require("../constants/errorCodes");

function errorHandler(err, req, res, next) {
  const code = err.code || CODES.INTERNAL_ERROR;
  const http = err.httpStatus || 500;

  // Use dynamic message if provided, otherwise fallback to defaults
  const friendly = err.message || MSG[code] || MSG.INTERNAL_ERROR;

  // Log server-side
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      code,
      http,
      traceId: err.traceId,
      msg: err.message,
      details: err.details,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    })
  );

  // Send response
  res.status(http).json({
    error: { code, message: friendly },
  });
}

module.exports = { errorHandler };
