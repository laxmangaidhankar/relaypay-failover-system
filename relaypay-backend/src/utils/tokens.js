const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const env = require('../config/env');

const ACCESS_TOKEN_SECRET = env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = env.REFRESH_TOKEN_SECRET;

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';



function generateAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user, tokenFamily, version) {
  return jwt.sign(
    { sub: user._id.toString(), family: tokenFamily, version },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET); // throws on invalid/expired
}
 
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET); // throws on invalid/expired
}
 
function generateTokenFamily() {
  return crypto.randomUUID();
}


module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenFamily,
  REFRESH_TOKEN_EXPIRY,
}