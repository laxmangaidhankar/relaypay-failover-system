
const rateLimit = require('express-rate-limit');
 
// Tighter limit on auth endpoints — these are the highest-value abuse surface
// (credential stuffing, brute force). General API routes can use a looser default elsewhere.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
 
// Looser default for general authenticated API routes.
const defaultRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
 
// Stricter than default, looser than auth — for approval/decline actions specifically.
const approvalRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many approval actions, please slow down' },
});
 
module.exports = { authRateLimiter, defaultRateLimiter, approvalRateLimiter };