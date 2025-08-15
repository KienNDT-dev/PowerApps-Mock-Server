const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { rate } = require("../config");

const keyGen = (req, res) => {
  const ipKey = ipKeyGenerator(req, res);
  return ipKey || req.headers["x-forwarded-for"] || "unknown";
};

const globalLimiter = rateLimit({
  windowMs: rate.windowMs,
  max: rate.maxGlobal,
  keyGenerator: keyGen,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: rate.windowMs,
  max: rate.maxAuth,
  keyGenerator: keyGen,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

module.exports = { globalLimiter, authLimiter };
