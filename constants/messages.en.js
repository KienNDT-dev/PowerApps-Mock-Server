const MSG = {
  OK: "OK",
  BAD_REQUEST: "Bad request. Please check your input.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  FORBIDDEN: "Access denied.",
  NOT_FOUND: "The requested resource could not be found.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  VALIDATION_ERROR: "Validation failed.",
  CONFLICT: "A conflict occurred.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again.",

  // Auth/login
  INVALID_CREDENTIALS: "The username or password provided is incorrect.",
  TOKEN_MISSING: "Authentication token is missing.",
  TOKEN_INVALID: "Authentication token is invalid.",
  TOKEN_EXPIRED: "Authentication token has expired.",

  // Dataverse-specific
  DV_FORBIDDEN: "You do not have permission to access this Dataverse resource.",
  DV_BAD_PAYLOAD: "The payload sent to Dataverse was invalid.",
  DV_SCHEMA_MISMATCH: "The Dataverse schema does not match the request.",
  DV_FIELD_SECURED: "You cannot access a secured field in Dataverse.",
};

module.exports = { MSG };
