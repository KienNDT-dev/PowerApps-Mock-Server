const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:5173,https://power-apps-mock-client.vercel.app"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  isProd,
  port: Number(process.env.PORT || 5000),
  cookieSecret: process.env.COOKIE_SECRET || "change_me",
  allowedOrigins,
  // Rate limit defaults
  rate: {
    windowMs: 60_000,
    maxGlobal: 120, // per minute per IP
    maxAuth: 30, // tighter for /auth routes
  },
};
