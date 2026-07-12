const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  virtualAccountId: {
    type: String,
    required: true,
    unique: true,
    default: () => `RP${Date.now()}${Math.floor(Math.random() * 10000)}`,
  },

  balance: { type: Number, required: true, default: 0, min: 0 },
  currency: { type: String, default: "INR" },

  version: { type: Number, default: 0 },

  walletType: { type: String, enum: ["PRIMARY", "BACKUP"], default: "PRIMARY" },
  status: {
    type: String,
    enum: ["ACTIVE", "FROZEN", "CLOSED"],
    default: "ACTIVE",
  },

  dailyLimit: { type: Number, default: 50000 },
  dailySpent: { type: Number, default: 0 },
  dailyResetAt: { type: Date, default: Date.now },

  lastTransactionAt: { type: Date },
  transactionCountToday: { type: Number, default: 0 },
});

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
