const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },

    // Which wallet this entry affects
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Double-entry core
    entryType: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: "INR" },

    // Snapshot — balance AFTER this entry was applied (critical for auditability)
    balanceAfter: { type: Number, required: true },

    // Links this entry to its opposite pair (every debit has exactly one linked credit, and vice versa)
    linkedEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
    },

    // What kind of movement this was — helps you filter/report later
    entryReason: {
      type: String,
      enum: ["PAYMENT", "RELAY_SETTLEMENT", "REVERSAL", "ADJUSTMENT"],
      required: true,
    },

    // Idempotency at the ledger level too — belt and suspenders with Transaction's key
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

// A wallet's history should always be queryable fast, in order
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });
ledgerEntrySchema.index({ transactionId: 1 });
ledgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true });

const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);

module.exports = LedgerEntry;
