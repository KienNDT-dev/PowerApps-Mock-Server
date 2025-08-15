const { AppError } = require("./AppError");
const { CODES } = require("../constants/errorCodes");

function mapDvCodeToApp(code) {
  switch ((code || "").toLowerCase()) {
    case "0x80040220":
      return CODES.DV_FORBIDDEN; // privilege missing
    case "0x80048d19":
      return CODES.DV_BAD_PAYLOAD; // invalid property/payload
    case "0x80060888":
      return CODES.DV_SCHEMA_MISMATCH; // property not found
    case "0x8004f507":
      return CODES.DV_FIELD_SECURED; // secured field
    default:
      return CODES.INTERNAL_ERROR;
  }
}

// Convert axios error to AppError
function toAppErrorFromAxios(err, fallbackCode = CODES.INTERNAL_ERROR) {
  const status = err.response?.status;
  const dvCode = err.response?.data?.error?.code;
  const dvMsg = err.response?.data?.error?.message;

  const code =
    status === 401
      ? CODES.UNAUTHORIZED
      : status === 403
      ? CODES.FORBIDDEN
      : dvCode
      ? mapDvCodeToApp(dvCode)
      : fallbackCode;

  return new AppError({
    code,
    message: dvMsg || err.message || "Dataverse error",
    httpStatus: status,
    details: {
      status,
      dvCode,
      dvMsg,
      url: err.config?.url,
      method: err.config?.method,
      payload: err.config?.data,
    },
  });
}

module.exports = { toAppErrorFromAxios };
