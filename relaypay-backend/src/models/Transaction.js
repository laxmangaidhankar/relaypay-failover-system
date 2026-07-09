// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Idempotency — prevents duplicate submission from creating duplicate transactions
  idempotencyKey: { type: String, required: true, unique: true },

  // Parties
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },

  // Core amount
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'INR' },

  // FSM state 
  status: {
    type: String,
    enum: [
      'INITIATED',
      'PRIMARY_ATTEMPTED',
      'PRIMARY_FAILED',
      'RELAY_REQUESTED',
      'RELAY_APPROVED',
      'RELAY_DECLINED',
      'RELAY_TIMEOUT',
      'SETTLED',
      'REVERSED'
    ],
    default: 'INITIATED',
    required: true
  },

  // Failure details 
  failureReason: {
    type: String,
    enum: ['INSUFFICIENT_BALANCE', 'NETWORK_TIMEOUT', 'BANK_SERVER_ERROR', 'DAILY_LIMIT_EXCEEDED', null],
    default: null
  },
  failureCount: { type: Number, default: 0 }, // how many primary attempts failed before relay

  // Relay-specific fields 
  relay: {
    backupContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    backupWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
    requestedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },        // for the timeout worker to check against
    approvalMethod: { type: String, enum: ['PIN', 'AUTO', null], default: null }
  },

  // Which ledger entries settled this transaction (populated on SETTLED)
  ledgerEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' }],

  // Timing metrics
  initiatedAt: { type: Date, default: Date.now },
  failedAt: { type: Date, default: null },
  settledAt: { type: Date, default: null },

  // Metadata
  note: { type: String, maxlength: 200 },

}, { timestamps: true });

// Indexes that matter
transactionSchema.index({ senderId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, 'relay.expiresAt': 1 }); // timeout worker query

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
  Transaction
}