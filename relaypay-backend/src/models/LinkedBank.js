const mongoose = require("mongoose");

const linkedBankSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  fullName: {
    type: String,
    required: true,
    trim: true,
  },

  bankName: {
    type: String,
    required: true,
  },

  accountId: {
    type: String,
    required: true,
    unique: true,
    default: () => `RP${Date.now()}${Math.floor(Math.random() * 10000)}`,
  },

  accountNumber: {
    type: String,
    required: true,
    default: () => `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
  },
  ifscCode: {
    type: String,
    required: true,
    default: () => `MOCK0${Math.floor(100000 + Math.random() * 899999)}`,
  },
  
  pinHash: {
    type: String,
    required: true,
    select: false,
  },

  balance: { type: Number, required: true, default: 0, min: 0 },
  currency: { type: String, default: "INR" },

  version: { type: Number, default: 0 },

  walletType: { type: String, enum: ["PRIMARY", "BACKUP"], default: "PRIMARY" },
  isPrimary: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ["ACTIVE", "FROZEN", "CLOSED", "UNLINKED"],
    default: "ACTIVE",
  },

  dailyLimit: { type: Number, default: 50000 },
  dailySpent: { type: Number, default: 0 },
  dailyResetAt: { type: Date, default: Date.now },

  lastTransactionAt: { type: Date },
  transactionCountToday: { type: Number, default: 0 },

  linkedAt: { type: Date, default: Date.now },
});

linkedBankSchema.index({ userId: 1 });

linkedBankSchema.index(
  { userId: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true } },
);

const LinkedBank = mongoose.model("LinkedBank", linkedBankSchema);

module.exports = LinkedBank;