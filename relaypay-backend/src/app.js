// Express app assembly will live here.
const express = require("express");
const cookieParser = require("cookie-parser");

const router = require("./routes/index");
const {
  requestOtpLimiter, verifyOtpLimiter, checkMobileLimiter, loginLimiter
} = require("./middleware/rateLimiter");

const app = express();

app.use(express.json());
app.use(cookieParser());

const mongoSanitize = require("express-mongo-sanitize");
app.use(mongoSanitize());
// app.use("/api/v1",  requestOtpLimiter, verifyOtpLimiter, checkMobileLimiter, loginLimiter);

app.use("/api/v1", router);

module.exports = app;
