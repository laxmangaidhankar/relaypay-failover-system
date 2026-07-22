const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Keyed by IP + phone where possible so one abusive phone number can't be
// used to spam a shared IP's limit into blocking everyone else, and vice versa.
function keyByIpAndPhone(req) {
  const phone = req.body?.mobile || req.body?.phone || "unknown";
  return `${req.ip}:${phone}`;
}

// SMS costs money and can be used to bomb a number — keep this tight.
const requestOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 3,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: "Too many OTP requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// A 6-digit OTP has 1e6 possibilities; cap guesses well below that per window.
const verifyOtpLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // matches OTP validity window
  max: 5,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: "Too many attempts, please request a new OTP" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Enumeration guard on the phone-lookup endpoint.
const checkMobileLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login already has account-level lockout after 5 failures, but this stops
// distributed guessing across many different phone numbers from one IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  requestOtpLimiter,
  verifyOtpLimiter,
  checkMobileLimiter,
  loginLimiter,
};