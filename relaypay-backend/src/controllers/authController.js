const bcrypt = require("bcrypt");
const env = require("../config/env");

const User  = require("../models/User");
const Wallet = require("../models/Wallet");
const AuditLog = require("../models/AuditLog");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTokenFamily,
} = require("../utils/tokens");

const SALT_ROUNDS = 12;
const SEED_WALLET_BALANCE = 10000;

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: env.NODE_ENV,
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * POST /api/v1/auth/register
 */

async function register(req, res) {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const phone = req.body.phone?.trim();
    const password = req.body.password;
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof phone !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "All fields must be strings",
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "Name is required",
      });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        message: "Name must be between 2 and 100 characters",
      });
    }

    if (!/^[A-Za-z\s'-]+$/.test(name)) {
      return res.status(400).json({
        message: "Name contains invalid characters",
      });
    }
    const htmlRegex = /<[^>]*>/;

    if (htmlRegex.test(name)) {
      return res.status(400).json({
        message: "Invalid name",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required",
      });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        message: "Invalid phone number",
      });
    }
    if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,64}$/.test(password)
    ) {
      return res.status(400).json({
        message:
          "Password must contain uppercase, lowercase, number and special character",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        message: "password must be atlest 8 characters long",
      });
    }

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({
        message: "A user with this email or phone already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      name,
      email,
      phone,
      password: passwordHash,
    });

    const wallet = await Wallet.create({
      userId: user._id,
      balance: SEED_WALLET_BALANCE,
    });

    user.walletId = wallet._id;

    await user.save();

    await AuditLog.create({
      eventType: "LOGIN_SUCCESS",
      actorId: user._id,
      metadata: { event: "REGISTER" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { accessToken, refreshToken } = await issueTokenPair(user);

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        walletId: wallet._id,
      },
      accessToken,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Registration failed",
      detail: err.message,
    });
  }
}

/**
 * POST /api/v1/auth/login
 */

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email or password required",
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        message: " invalid email or password",
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        message: " Account temporarily locked due to repeated failed logins ,",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
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

      return res.status(401).json({
        message: "Invalid email or password",
      });
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
      message: "Login successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        walletId: user.walletId,
      },
      accessToken,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Login failed",
      detail: err.message,
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
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        message: "Refresh token not provided",
      });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(400).json({
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(400).json({
        message: "User not found ",
      });
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
      return res.status(401).json({
        error: "Session invalidated, please log in again",
      });
    }

    const { accessToken, refreshToken } = await issueTokenPair(
      user,
      user.refreshTokenFamily,
    );
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(200).json({ accessToken });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Token refresh failed", detail: err.message });
  }
}

/**
 * POST /api/v1/auth/logout
 */
async function logout(req, res) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const user = await User.findById(payload.sub);
        if (user) {
          user.refreshTokenFamily = null;
          user.refreshTokenVersion += 1;
          await user.save();
        }
      } catch {}
    }
    res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Logout failed", detail: err.message });
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

module.exports = { register, login, refresh, logout };
