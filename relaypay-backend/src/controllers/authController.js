const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const env = require("../config/env");

const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Otp = require("../models/Otp");

const generateOtp = require("../services/otpService");
const sendOtp = require("../services/smsService");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTokenFamily,
} = require("../utils/tokens");

const SALT_ROUNDS = 12;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const OTP_REGEX = /^\d{6}$/;
const PIN_REGEX = /^\d{4}$/;

function isValidPhone(phone) {
  return typeof phone === "string" && PHONE_REGEX.test(phone);
}

function isValidOtp(otp) {
  return typeof otp === "string" && OTP_REGEX.test(otp);
}

function isValidPin(pin) {
  if (typeof pin !== "string" || !PIN_REGEX.test(pin)) return false;
  const trivial = [
    "0000",
    "1234",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
  ];
  return !trivial.includes(pin);
}

// --- Cookie config -------------------------------------------------------
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const OTP_VERIFICATION_EXPIRY = "5m";

function issueOtpVerificationToken(phone, purpose) {
  return jwt.sign({ phone, purpose }, env.OTP_VERIFICATION_SECRET, {
    expiresIn: OTP_VERIFICATION_EXPIRY,
  });
}

function consumeOtpVerificationToken(token, mobile, expectedPurpose) {
  let payload;
  try {
    payload = jwt.verify(token, env.OTP_VERIFICATION_SECRET);
  } catch {
    return false;
  }
  return payload.phone === mobile && payload.purpose === expectedPurpose;
}

/**
 * POST /api/v1/auth/request-otp
 * NOTE: apply a per-phone + per-IP rate limiter on this route (e.g.
 * express-rate-limit) — otherwise it's an open SMS-bombing / cost-abuse
 * endpoint. Something like 3 requests / 10 min per phone is reasonable.
 */
async function requestOtp(req, res) {
  try {
    const phone = req.body?.phone;

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "Valid mobile number is required" });
    }

    const user = await User.findOne({ phone });
    const purpose = user ? "LOGIN" : "REGISTER";

    if (purpose === "LOGIN") {
      return res.status(409).json({
      success: false,
      error: "User already registered"
      });
    }
    const otp = await generateOtp();

    await Otp.findOneAndUpdate(
      { phone },
      {
        phone,
        otp,
        purpose,
        attempts: 0,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
      { upsert: true },
    );

    await sendOtp(phone, otp);

    return res.json({ success: true, purpose });
  } catch (err) {
    console.error("requestOtp error:", err);
    return res
      .status(500)
      .json({ error: "Could not send OTP, please try again" });
  }
}

/**
 * POST /api/v1/auth/verify-otp
 * NOTE: also rate-limit this route per-phone (e.g. 5 attempts per OTP
 * window) — a 6-digit OTP is brute-forceable within 2 minutes if unthrottled.
 */
async function verifyOtp(req, res) {
  try {
    const phone = req.body?.phone;
    const otp = req.body?.otp;

    if (!isValidPhone(phone) || !isValidOtp(otp)) {
      return res
        .status(400)
        .json({ error: "Valid mobile number and OTP are required" });
    }

    const record = await Otp.findOne({
      phone,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      return res
        .status(400)
        .json({ error: "OTP expired, please request a new one" });
    }

    if (record.otp !== otp) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await Otp.deleteOne({ _id: record._id });

    const verificationToken = issueOtpVerificationToken(phone, record.purpose);

    return res.json({
      success: true,
      purpose: record.purpose,
      verificationToken,
    });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res
      .status(500)
      .json({ error: "Could not verify OTP, please try again" });
  }
}

/**
 * POST /api/v1/auth/check-mobile
 * NOTE: rate-limit per-IP — this endpoint tells the caller whether a phone
 * number is registered, which is a user-enumeration oracle if left open.
 */
async function checkIfExist(req, res) {
  try {
    const phone = req.body?.phone?.trim();

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "Valid mobile number is required" });
    }

    const existing = await User.findOne({ phone });

    return res.status(200).json({
      success: true,
      userExists: !!existing,
      nextScreen: existing ? "ENTER_MPIN" : "VERIFY_OTP",
    });
  } catch (err) {
    console.error("checkIfExist error:", err);
    return res.status(500).json({ error: "Request failed" });
  }
}

/**
 * POST /api/v1/auth/login
 */
async function loginMpin(req, res) {
  try {
    const phone = req.body?.phone;
    const loginPin = req.body?.loginPin;

    if (!isValidPhone(phone) || typeof loginPin !== "string" || !loginPin) {
      return res.status(400).json({ error: "Phone and MPIN are required" });
    }

    const user = await User.findOne({ phone }).select("+loginPin");

    const invalidCredentials = () =>
      res.status(401).json({ error: "Invalid credentials" });

    if (!user) {
      return invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        error: "Account temporarily locked due to repeated failed logins",
      });
    }

    const isMatch = await bcrypt.compare(loginPin, user.loginPin);

    if (!isMatch) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await user.save();

      await AuditLog.create({
        eventType: "LOGIN_FAILED",
        actorId: user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return invalidCredentials();
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    await AuditLog.create({
      eventType: "LOGIN_SUCCESS",
      actorId: user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { accessToken, refreshToken } = await issueTokenPair(user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        phone: user.phone,
      },
      accessToken,
      refreshToken,
      expiresIn: 800,
    });
  } catch (err) {
    console.error("loginMpin error:", err);
    return res.status(500).json({ error: "Login failed, please try again" });
  }
}

/**
 * POST /api/v1/auth/register
 * Requires a verificationToken proving the phone number was just confirmed
 * via OTP (see verifyOtp). Without this, registration could be called
 * directly for any unverified phone number.
 */
async function registerMpin(req, res) {
  try {
    const { phone, loginPin, verificationToken } = req.body || {};

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "Valid mobile number is required" });
    }

    if (!isValidPin(loginPin)) {
      return res.status(400).json({
        error: "MPIN must be 4 or 6 digits and not a common/trivial pattern",
      });
    }

    if (
      typeof verificationToken !== "string" ||
      !consumeOtpVerificationToken(verificationToken, phone, "REGISTER")
    ) {
      return res.status(401).json({
        error: "Mobile number not verified, please verify OTP again",
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        error: "User already exists",
      });
    }

    const loginPinHash = await bcrypt.hash(loginPin, SALT_ROUNDS);

    const user = await User.create({
      phone,
      loginPin: loginPinHash,
      isVerified: true,
    });


    await AuditLog.create({
      eventType: "REGISTER_SUCCESS",
      actorId: user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { accessToken, refreshToken } = await issueTokenPair(user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: {
        id: user._id,
        phone: user.phone,
      },
      accessToken,
      refreshToken,
      expiresIn: 900,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
}

/**
 * POST /api/v1/auth/refresh
 * Rotates the refresh token on every use. If a stale/reused token is presented
 * (version mismatch), kills the entire token family — forces re-login everywhere.
 */
async function refresh(req, res) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({ error: "Refresh token not provided" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isReuse =
      user.refreshTokenFamily !== payload.family ||
      user.refreshTokenVersion !== payload.version;

    if (isReuse) {
      // Reuse detected — someone presented an old/stolen token. Kill the whole family.
      user.refreshTokenFamily = null;
      user.refreshTokenVersion += 1;
      await user.save();

      await AuditLog.create({
        eventType: "REFRESH_TOKEN_REUSE_DETECTED",
        actorId: user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
      return res
        .status(401)
        .json({ error: "Session invalidated, please log in again" });
    }

    const { accessToken, refreshToken } = await issueTokenPair(
      user,
      user.refreshTokenFamily,
    );
    return res.status(200).json({
      success: true, 
      accessToken,
      refreshToken,
      expiresIn: 900
     });
  } catch (err) {
    console.error("refresh error:", err);
    return res.status(500).json({ error: "Token refresh failed" });
  }
}

/**
 * POST /api/v1/auth/logout
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);

        const user = await User.findById(payload.sub);

        if (user) {
          user.refreshTokenFamily = null;
          user.refreshTokenVersion += 1;
          await user.save();
        }

      } catch {
        
      }
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (err) {
    console.error("logout error:", err);

    return res.status(500).json({
      success: false,
      error: "Logout failed"
    });
  }
}

/**
 * Issues a fresh access + refresh token pair. Pass an existing tokenFamily to
 * rotate within the same family (refresh flow); omit it to start a new family (login/register).
 */
async function issueTokenPair(user, existingFamily = null) {
  const tokenFamily = existingFamily || generateTokenFamily();

  user.refreshTokenFamily = tokenFamily;
  user.refreshTokenVersion += 1;
  await user.save();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(
    user,
    tokenFamily,
    user.refreshTokenVersion,
  );

  return { accessToken, refreshToken };
}

module.exports = {
  checkIfExist,
  loginMpin,
  registerMpin,
  refresh,
  logout,
  requestOtp,
  verifyOtp,
};
