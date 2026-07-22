// models/AuditLog.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // What happened
    eventType: {
      type: String,
      required: true,
      enum: [
        "TRANSACTION_INITIATED",
        "PRIMARY_ATTEMPT_FAILED",
        "RELAY_REQUESTED",
        "RELAY_APPROVED",
        "RELAY_DECLINED",
        "RELAY_TIMEOUT",
        "TRANSACTION_SETTLED",
        "TRANSACTION_REVERSED",
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "REFRESH_TOKEN_REUSE_DETECTED",
        "FAMILY_MEMBER_INVITED",
        "FAMILY_MEMBER_ACCEPTED",
        "WALLET_FROZEN",
        "REGISTER_SUCCESS",
      ],
    },

    // Who/what it relates to
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    // State transition record (for FSM events specifically)
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },

    // Freeform but bounded context — never store raw sensitive data here
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Request context — useful for security investigation
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Immutability marker — never actually updated after insert
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: false },
); // deliberately no updatedAt — this collection is append-only

auditLogSchema.index({ transactionId: 1, createdAt: 1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ eventType: 1, createdAt: -1 });

// No update/delete operations should ever be exposed on this model. Enforce append-only at the service layer.

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
