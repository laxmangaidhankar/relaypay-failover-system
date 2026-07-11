// Express app assembly will live here.
const express = require("express");
const cookieParser = require("cookie-parser");

const { authRouter } = require("./routes/v1/authRoutes");
const {
  authRateLimiter,
  defaultRateLimiter,
  approvalRateLimiter,
} = require("./middleware/rateLimiter");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use("/api/v1", authRateLimiter, defaultRateLimiter, approvalRateLimiter);

app.use("/api/v1/auth", authRouter);

module.exports = {
  app,
};
