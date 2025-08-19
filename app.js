require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const routes = require("./routes");
const requestId = require("./middlewares/requestId");
const cors = require("./middlewares/cors");
const { globalLimiter } = require("./middlewares/rateLimit");
const requestLogger = require("./middlewares/requestLogger");
const { notFound } = require("./middlewares/notFound");
const { errorHandler } = require("./middlewares/errorHandler");
const { isProd, cookieSecret } = require("./config");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    hsts: isProd,
  })
);
app.use(cors);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(cookieSecret));
app.use(requestId);
app.use(globalLimiter);
app.use(requestLogger);
app.get("/", (req, res) => {
  res.json({ success: true, message: "API is running" });
});
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
