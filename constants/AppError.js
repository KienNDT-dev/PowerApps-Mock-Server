const { randomUUID } = require("crypto");
const { CODE_TO_HTTP, CODES } = require("../constants/errorCodes");
const { MSG } = require("../constants/messages.en");

class AppError extends Error {
  constructor({ code = CODES.INTERNAL_ERROR, message, httpStatus, details }) {
    super(message || MSG[code] || MSG.INTERNAL_ERROR);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus || CODE_TO_HTTP[code] || 500;
    this.details = details;
    this.traceId = randomUUID();
    Error.captureStackTrace?.(this, AppError);
  }
}

module.exports = { AppError };
