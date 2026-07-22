const express = require('express');
const authRouter = express.Router();

const {checkIfExist, loginMpin, registerMpin, refresh, logout, requestOtp, verifyOtp} = require('../../controllers/authController');
const { requestOtpLimiter, verifyOtpLimiter, checkMobileLimiter, loginLimiter } = require("../../middleware/rateLimiter");



authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);

authRouter.post("/request-otp", requestOtpLimiter, requestOtp);
authRouter.post("/verify-otp", verifyOtpLimiter, verifyOtp);
authRouter.post("/check-mobile", checkMobileLimiter, checkIfExist);

authRouter.post("/login", loginLimiter, loginMpin);

authRouter.post("/register", registerMpin);


module.exports = authRouter;
