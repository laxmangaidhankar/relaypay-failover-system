const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const LinkedBank = require("../models/LinkedBank");
const User = require("../models/User");

const SUPPORTED_BANKS = [
  "HDFC Bank",
  "State Bank of India",
  "ICICI Bank",
  "Axis Bank",
];

// Mock data only — no real money involved. Every newly linked bank starts
// funded so the demo is usable immediately.
const MOCK_STARTING_BALANCE = 5000;

// Product decision for now: keep the account model simple, cap at two
// linked banks per user (one PRIMARY, one BACKUP-eligible).
const MAX_LINKED_BANKS = 2;

const MOBILE_NUMBER_REGEX = /^[6-9]\d{9}$/; // Indian 10-digit mobile
const PIN_REGEX = /^\d{6}$/; // 6 digit numeric PIN

const PIN_SALT_ROUNDS = 10;

/**
 * POST /api/banks/link
 *
 * Frontend must send (all required, single combined form):
 *   - bankName      — must match one of SUPPORTED_BANKS
 *   - fullName      — name as it appears on the account (manual input,
 *                      not auto-filled from the profile — can legally differ)
 *   - mobileNumber  — 10-digit mobile this account is linked against
 *   - pin           — 4–6 digit numeric payment PIN for THIS bank
 *                      (each linked bank has its own PIN, set once here)
 *
 * Frontend must NOT send:
 *   - isPrimary, balance, status, version, accountId, accountNumber,
 *     ifscCode — all server-owned/generated
 *
 * The PIN is hashed immediately and never appears in any response —
 * `pinHash` is stripped from the returned document below regardless of
 * the schema's `select: false`, since a freshly-created doc still has
 * the field in memory until explicitly removed.
 */
async function linkBank(req, res) {
  const userId = req.user.id;
  const { bankName, fullName, pin } = req.body;

  const existing = await LinkedBank.findOne({
    userId: req.user.id,
    bankName,
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "This bank is already linked.",
    });
  }

  if (!bankName || !fullName || !pin) {
    return res.status(400).json({
      error: "MISSING_FIELDS",
      message: "bankName, fullName, and pin are all required",
    });
  }
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      error: "USER_NOT_FOUND",
      message: "User not found",
    });
  }
  const mobileNumber = user.phone;

  if (!SUPPORTED_BANKS.includes(bankName)) {
    return res.status(400).json({
      error: "UNSUPPORTED_BANK",
      message: `bankName must be one of: ${SUPPORTED_BANKS.join(", ")}`,
    });
  }

  if (!MOBILE_NUMBER_REGEX.test(mobileNumber)) {
    return res.status(400).json({
      error: "INVALID_MOBILE_NUMBER",
      message: "mobileNumber must be a valid 10-digit number",
    });
  }

  if (!PIN_REGEX.test(pin)) {
    return res.status(400).json({
      error: "INVALID_PIN",
      message: "pin must be 4 to 6 digits",
    });
  }

  try {
    const existingCount = await LinkedBank.countDocuments({
      userId,
      status: { $ne: "UNLINKED" },
    });

    if (existingCount >= MAX_LINKED_BANKS) {
      return res.status(400).json({
        error: "MAX_BANKS_REACHED",
        message: `You can link up to ${MAX_LINKED_BANKS} bank accounts`,
      });
    }

    const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);

    const linkedBank = await LinkedBank.create({
      userId,
      bankName,
      fullName: fullName.trim(),
      mobileNumber: mobileNumber.trim(),
      pinHash,
      isPrimary: existingCount === 0, // first bank linked becomes primary
      balance: MOCK_STARTING_BALANCE,
      paymentAddress: mobileNumber + "@relaypay",
    });

    const safeBank = linkedBank.toObject();
    delete safeBank.pinHash;

    return res.status(201).json({ linkedBank: safeBank });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "DUPLICATE_ACCOUNT_ID",
        message: "Could not generate a unique account — please try again",
      });
    }
    console.error(err);
    return res.status(500).json({ error: "LINK_BANK_FAILED" });
  }
}

/**
 * GET /api/banks
 * pinHash is excluded by the schema's select:false by default — no need
 * to strip it manually here.
 */
async function getLinkedBanks(req, res) {
  const userId = req.user.id;

  const banks = await LinkedBank.find({
    userId,
    status: { $ne: "UNLINKED" },
  }).sort({ isPrimary: -1, linkedAt: 1 });

  return res.json({ banks });
}

/**
 * PATCH /api/banks/:bankId/set-primary
 */
async function setPrimaryBank(req, res) {
  const userId = req.user.id;
  const { bankId } = req.params;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const target = await LinkedBank.findOne({
      _id: bankId,
      userId,
      status: "ACTIVE",
    }).session(session);

    if (!target) {
      await session.abortTransaction();
      return res.status(404).json({ error: "BANK_NOT_FOUND" });
    }

    if (!target.isPrimary) {
      await LinkedBank.updateOne(
        { userId, isPrimary: true },
        { $set: { isPrimary: false } },
      ).session(session);

      target.isPrimary = true;
      await target.save({ session });
    }

    await session.commitTransaction();
    return res.json({ linkedBank: target });
  } catch (err) {
    await session.abortTransaction();
    console.error(err);
    return res.status(500).json({ error: "SET_PRIMARY_FAILED" });
  } finally {
    session.endSession();
  }
}

/**
 * DELETE /api/banks/:bankId
 */
async function unlinkBank(req, res) {
  const userId = req.user.id;
  const { bankId } = req.params;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const bank = await LinkedBank.findOne({
      _id: bankId,
      userId,
      status: { $ne: "UNLINKED" },
    }).session(session);

    if (!bank) {
      await session.abortTransaction();
      return res.status(404).json({ error: "BANK_NOT_FOUND" });
    }

    const wasPrimary = bank.isPrimary;
    bank.status = "UNLINKED";
    bank.isPrimary = false;
    await bank.save({ session });

    if (wasPrimary) {
      const nextBank = await LinkedBank.findOne({
        userId,
        status: "ACTIVE",
      })
        .sort({ linkedAt: 1 })
        .session(session);

      if (nextBank) {
        nextBank.isPrimary = true;
        await nextBank.save({ session });
      }
    }

    await session.commitTransaction();
    return res.json({ unlinked: true });
  } catch (err) {
    await session.abortTransaction();
    console.error(err);
    return res.status(500).json({ error: "UNLINK_BANK_FAILED" });
  } finally {
    session.endSession();
  }
}

/**
 * POST /api/banks/:bankId/verify-pin
 * Not part of the link flow — this is the piece initiatePayment will need
 * later to confirm the PIN before debiting a specific bank.
 */
async function verifyPin(req, res) {
  const userId = req.user.id;
  const { bankId } = req.params;
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: "MISSING_PIN" });
  }

  const bank = await LinkedBank.findOne({ _id: bankId, userId }).select(
    "+pinHash",
  );
  if (!bank) {
    return res.status(404).json({ error: "BANK_NOT_FOUND" });
  }

  const isValid = await bcrypt.compare(pin, bank.pinHash);
  return res.json({ valid: isValid });
}

/* api/v1/banks/:id/check-balance
 */

async function checkBalance(req, res) {
  try {
    const { accId, Tpin } = req.body;

    if (!accId || !Tpin) {
      return res.status(400).json({
        status: false,
        message: "Account number is required",
      });
    }

    const linkedBank = await LinkedBank.findOne({
      accId: accId,
    });

    if (!linkedBank) {
      return res.status(404).json({
        status: false,
        message: "Bank account not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Balance fetched successfully",
      bank: {
        accountId: linkedBank.accountId,

        bankName: linkedBank.bankName,
        fullName: linkedBank.fullName,
        accountNumber: linkedBank.accountNumber,
        ifscCode: linkedBank.ifscCode,
        balance: linkedBank.balance,
        bankType: linkedBank.bankType,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      status: false,
      message: "Server error. Please try again.",
    });
  }
}

// /* api/v1/banks/linked-banks
// */

// async function getLinkedBanks(req, res){
//   try{
//     const userId = req.user.id;

//     if(!userId){
//       return res.status(400).json({
//         msg: "user id not found",
//       });
//     }

//     const linkedBanks = await LinkedBank.findOne({
//       userId:userId,
//       status: "ACTIVE"
//     });

//     if(!linkdBanks){
//       return res.status(400).json({
//         msg:"No Link Bank found"
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       linkedBanks
//     })
//   }catch(err){
//     return res.status(400).json({
//       msg: "not found"
//     })
//   }

// }
module.exports = {
  linkBank,
  getLinkedBanks,
  setPrimaryBank,
  unlinkBank,
  verifyPin,
  checkBalance,
  SUPPORTED_BANKS,
  MAX_LINKED_BANKS,
};
