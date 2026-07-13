// Failover state machine will live here.

const Transaction = require("../models/Transaction");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const {
  moveFunds,
  reconcileWalletBalance,
} = require("../services/ledgerService");

const relayService = require("../services/relayService");

const notificationService = require("../services/notificationService");

const MockBankAdapter = require("../services/bankAdapter/MockBankAdapter");

const { BankError } = require("../utils/errors");

const bankAdapter = new MockBankAdapter();

const ledgerService = require("../services/ledgerService");

const ALLOWED_TRANSITIONS = {
  INITIATED: ["PRIMARY_ATTEMPTED"],
  PRIMARY_ATTEMPTED: ["SETTLED", "PRIMARY_FAILED", "REVERSED"],
  PRIMARY_FAILED: ["RELAY_REQUESTED", "REVERSED"],
  RELAY_REQUESTED: ["RELAY_APPROVED", "RELAY_DECLINED", "RELAY_TIMEOUT"],
  RELAY_APPROVED: ["SETTLED"],
  RELAY_DECLINED: ["REVERSED"],
  RELAY_TIMEOUT: ["REVERSED"],
  SETTLED: [],
  REVERSED: [],
};

async function transitionState(
  transaction,
  toStatus,
  { actorId = null, metadata = {} } = {},
) {
  const fromStatus = transaction.status;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(
      `Illegal transition: ${fromStatus} -> ${toStatus} for transaction ${transaction._id}`,
    );
  }

  transaction.status = toStatus;

  if (toStatus === "PRIMARY_FAILED") transaction.failedAt = new Date();

  if (toStatus === "SETTLED") transaction.settledAt = new Date();

  await transaction.save();

  await AuditLog.create({
    eventType: eventTypeForTransition(toStatus),
    actorId,
    transactionId: transaction._id,
    fromStatus,
    toStatus,
    metadata,
  });

  return transaction;
}

function eventTypeForTransition(toStatus) {
  const map = {
    PRIMARY_ATTEMPTED: "TRANSACTION_INITIATED",
    PRIMARY_FAILED: "PRIMARY_ATTEMPT_FAILED",
    RELAY_REQUESTED: "RELAY_REQUESTED",
    RELAY_APPROVED: "RELAY_APPROVED",
    RELAY_DECLINED: "RELAY_DECLINED",
    RELAY_TIMEOUT: "RELAY_TIMEOUT",
    SETTLED: "TRANSACTION_SETTLED",
    REVERSED: "TRANSACTION_REVERSED",
  };
  return map[toStatus] || "TRANSACTION_SETTLED";
}

async function initiatePayment({
  senderId,
  senderWalletId,
  receiverId,
  receiverWalletId,
  amount,
  idempotencyKey,
  note,
}) {
  const transaction = await Transaction.create({
    idempotencyKey,
    senderId,
    senderWalletId,
    receiverId,
    receiverWalletId,
    amount,
    note,
    status: "INITIATED",
  });

  await AuditLog.create({
    eventType: "TRANSACTION_INITIATED",
    actorId: senderId,
    transactionId: transaction._id,
    fromStatus: null,
    toStatus: "INITIATED",
  });

  await transitionState(transaction, "PRIMARY_ATTEMPTED", {
    actorId: senderId,
  });

  try {
    await bankAdapter.initiateTransfer({
      fromAccountId: senderWalletId,
      toAccountId: receiverWalletId,
      amount,
      transactionId: transaction._id,
    });

    // Primary succeeded — settle directly.
    const result = await ledgerService.moveFunds({
      fromWalletId: senderWalletId,
      toWalletId: receiverWalletId,
      amount,
      transactionId: transaction._id,
      idempotencyKey: `${idempotencyKey}:primary`,
      entryReason: "PAYMENT",
    });

    transaction.ledgerEntryIds = [result.debitEntryId, result.creditEntryId];
    await transitionState(transaction, "SETTLED", { actorId: senderId });

    notificationService.notifyTransactionSettled(senderId, {
      transactionId: transaction._id,
      amount,
      newBalance: result.fromBalance,
    });

    return transaction;
  } catch (err) {
    console.log(err);
    console.log(err.name);
    console.log(err.message);
    console.log(err.stack);

    return handlePrimaryFailure(transaction, err);
  }
}

async function handlePrimaryFailure(transaction, err) {
  const failureReason =
    err instanceof BankError ? err.code : "BANK_SERVER_ERROR";
  transaction.failureReason = failureReason;
  transaction.failureCount += 1;

  await transitionState(transaction, "PRIMARY_FAILED", {
    metadata: { failureReason, message: err.message },
  });

  const isRelayEligible = err instanceof BankError ? err.relayEligible : true;

  if (!isRelayEligible) {
    await transitionState(transaction, "REVERSED", {
      metadata: { reason: "not_relay_eligible", failureReason },
    });
    notificationService.notifyTransactionFailed(transaction.senderId, {
      transactionId: transaction._id,
      reason: failureReason,
    });
    return transaction;
  }

  return triggerRelay(transaction);
}

async function triggerRelay(transaction) {
  const backup = await relayService.findBackupContact(
    transaction.senderId,
    transaction.amount,
  );

  if (!backup) {
    await transitionState(transaction, "REVERSED", {
      metadata: { reason: "no_eligible_backup_contact" },
    });
    notificationService.notifyTransactionFailed(transaction.senderId, {
      transactionId: transaction._id,
      reason: "NO_BACKUP_AVAILABLE",
    });
    return transaction;
  }

  const timeoutSeconds = await relayService.getRelayTimeoutSeconds(
    transaction.senderId,
  );
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

  transaction.relay = {
    backupContactId: backup.userId,
    backupWalletId: backup.walletId,
    requestedAt: new Date(),
    expiresAt,
    approvalMethod: null,
  };
  await transaction.save();

  await transitionState(transaction, "RELAY_REQUESTED", {
    metadata: { backupContactId: backup.userId },
  });

  const sender = await User.findById(transaction.senderId);
  notificationService.notifyRelayRequested(backup.userId, {
    transactionId: transaction._id,
    amount: transaction.amount,
    senderName: sender?.name,
    expiresAt,
  });

  return transaction;
}

/**
 * Called by the approve/decline controller once the backup contact responds.
 */
async function handleRelayResponse(transactionId, responderId, decision) {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error("Transaction not found");
  if (transaction.status !== "RELAY_REQUESTED") {
    throw new Error(
      `Transaction ${transactionId} is not awaiting relay response (status: ${transaction.status})`,
    );
  }
  if (String(transaction.relay.backupContactId) !== String(responderId)) {
    throw new Error(
      "Only the invited backup contact may respond to this relay request",
    );
  }

  transaction.relay.respondedAt = new Date();
  transaction.relay.approvalMethod = "PIN";

  if (decision === "DECLINE") {
    await transaction.save();
    await transitionState(transaction, "RELAY_DECLINED", {
      actorId: responderId,
    });
    await transitionState(transaction, "REVERSED", {
      actorId: responderId,
      metadata: { reason: "relay_declined" },
    });
    notificationService.notifyRelayResolved(transaction.senderId, {
      transactionId: transaction._id,
      status: "DECLINED",
      amount: transaction.amount,
    });
    return transaction;
  }

  // APPROVED — settle from the backup contact's wallet, not the original sender's.
  await transaction.save();
  await transitionState(transaction, "RELAY_APPROVED", {
    actorId: responderId,
  });

  const result = await ledgerService.moveFunds({
    fromWalletId: transaction.relay.backupWalletId,
    toWalletId: transaction.receiverWalletId,
    amount: transaction.amount,
    transactionId: transaction._id,
    idempotencyKey: `${transaction.idempotencyKey}:relay`,
    entryReason: "RELAY_SETTLEMENT",
  });

  transaction.ledgerEntryIds.push(result.debitEntryId, result.creditEntryId);
  await transitionState(transaction, "SETTLED", { actorId: responderId });

  await relayService.recordRelayUsage(
    transaction.senderId,
    responderId,
    transaction.amount,
  );

  notificationService.notifyRelayResolved(transaction.senderId, {
    transactionId: transaction._id,
    status: "APPROVED",
    amount: transaction.amount,
  });
  notificationService.notifyTransactionSettled(transaction.senderId, {
    transactionId: transaction._id,
    amount: transaction.amount,
    newBalance: null,
  });

  return transaction;
}

/**
 * Called by the timeout worker for any RELAY_REQUESTED transaction past its expiresAt.
 */
async function handleRelayTimeout(transactionId) {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction || transaction.status !== "RELAY_REQUESTED") return null; // already resolved, avoid race

  await transitionState(transaction, "RELAY_TIMEOUT");
  await transitionState(transaction, "REVERSED", {
    metadata: { reason: "relay_timeout" },
  });

  notificationService.notifyTransactionFailed(transaction.senderId, {
    transactionId: transaction._id,
    reason: "RELAY_TIMEOUT",
  });

  return transaction;
}

module.exports = {
  initiatePayment,
  handleRelayResponse,
  handleRelayTimeout,
  transitionState,
};
