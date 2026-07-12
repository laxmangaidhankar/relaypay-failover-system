// models/FamilyCircle.js
const mongoose = require("mongoose");

const familyCircleSchema = new mongoose.Schema(
  {
    // The person whose payments this circle backs up
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Backup contacts, ordered by priority — first one tried gets first relay request
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        walletId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Wallet",
          required: true,
        },
        priority: { type: Number, required: true, default: 1 }, // 1 = tried first

        // Consent — never assume, always record explicit opt-in
        status: {
          type: String,
          enum: ["PENDING", "ACCEPTED", "DECLINED", "REVOKED"],
          default: "PENDING",
        },
        invitedAt: { type: Date, default: Date.now },
        respondedAt: { type: Date, default: null },

        // Guardrails per member
        maxRelayAmount: { type: Number, default: 5000 }, // this contact auto-caps at this amount
        dailyRelayLimit: { type: Number, default: 10000 },
        dailyRelayUsed: { type: Number, default: 0 },
      },
    ],

    // Circle-level settings
    autoApproveThreshold: { type: Number, default: 0 }, // 0 = always needs manual approval; >0 = auto-approve under this amount
    relayTimeoutSeconds: { type: Number, default: 60 }, // how long a member has to respond before timeout/next-in-line

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// One circle per owner (keeps the model simple — multiple backup members live inside members[])
familyCircleSchema.index({ ownerId: 1 }, { unique: true });
familyCircleSchema.index({ "members.userId": 1 });

// Guard: prevent A backing up B while B backs up A (circular relay) — enforce in service layer,
// but index here supports the lookup needed to check it fast.

const FamilyCircle = mongoose.model("FamilyCircle", familyCircleSchema);

module.exports = FamilyCircle;
