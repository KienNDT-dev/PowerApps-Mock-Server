const { AppError } = require("../constants/AppError");
const { CODES } = require("../constants/errorCodes");

function notFound(req, res, next) {
  next(new AppError({ code: CODES.NOT_FOUND, message: "Route not found" }));
}

module.exports = { notFound };
