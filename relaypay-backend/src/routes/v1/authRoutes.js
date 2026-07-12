const express = require('express');
const authRouter = express.Router();

const { register, login, refresh, logout } = require('../../controllers/authController');
const { authRateLimiter } = require('../../middleware/rateLimiter');

authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter,  login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);


module.exports = authRouter;
