// Atomic double-entry ledger operations will live here.
const mongoose = require("mongoose");
const LedgerEntry = require("../models/LedgerEntry");
const Wallet = require("../models/Wallet");

const {
  InsufficientBalanceError,
  WalletInactiveError,
  DuplicateTransactionError,
  ConcurrencyConflictError,
} = require("../utils/errors");

const MAX_RETRIES = 3;

async function moveFunds({
  fromWalletId,
  toWalletId,
  amount,
  transactionId,
  idempotencyKey,
  entryReason,
}) {
  if (!amount || amount <= 0) {
    throw new Error("moveFunds: amount must be a positive number");
  }

  if (String(fromWalletId) == String(toWalletId)) {
    throw new Error("moveFunds: fromWalletId and toWalletId must differ");
  }

  const existing = await LedgerEntry.findOne({ idempotencyKey }).lean();
  if (existing) {
    const pair = await LedgerEntry.find({ idempotencyKey }).lean();
    const debitEntry = pair.find((e) => e.entryType === "DEBIT");
    const creditEntry = pair.find((e) => e.entryType === "CREDIT");
    return {
      debitEntryId: debitEntry?._id,
      creditEntryId: creditEntry?._id,
      fromBalance: debitEntry?.balanceAfter,
      toBalance: creditEntry?.balanceAfter,
      idempotent: true,
    };
  }

  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt += 1;

    const session = await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(async () => {
        console.log("fromWalletId:", fromWalletId);
        console.log("toWalletId:", toWalletId);

        const [fromWallet, toWallet] = await Promise.all([
          Wallet.findById(fromWalletId).session(session),
          Wallet.findById(toWalletId).session(session),
        ]);


        if (!fromWallet || !toWallet) {
          throw new Error("moveFunds: one or both wallets not found");
        }

        if (fromWallet.status !== "ACTIVE" || toWallet.status !== "ACTIVE") {
          throw new WalletInactiveError("One or both wallets are not ACTIVE");
        }

        if (fromWallet.balance < amount) {
          throw new InsufficientBalanceError(
            `Wallet ${fromWalletId} has insufficient balance`,
          );
        }

        const fromVersionAtRead = fromWallet.version;
        const toVersionAtRead = toWallet.version;

        const newFromBalance = fromWallet.balance - amount;
        const newToBalance = toWallet.balance + amount;


       
        const fromUpdateResult = await Wallet.updateOne(
          { _id: fromWalletId, version: fromVersionAtRead },
          { $set: { balance: newFromBalance }, $inc: { version: 1 } },
          { session },
        );
        const toUpdateResult = await Wallet.updateOne(
          { _id: toWalletId, version: toVersionAtRead },
          { $set: { balance: newToBalance }, $inc: { version: 1 } },
          { session },
        );

        if (
          fromUpdateResult.modifiedCount === 0 ||
          toUpdateResult.modifiedCount === 0
        ) {
          throw new ConcurrencyConflictError(
            "Wallet version mismatch, concurrent write detected",
          );
        }

        const debitEntry = await LedgerEntry.create(
          [
            {
              transactionId,
              walletId: fromWalletId,
              userId: fromWallet.userId,
              entryType: "DEBIT",
              amount,
              balanceAfter: newFromBalance,
              entryReason,
              idempotencyKey: `${idempotencyKey}:debit`,
            },
          ],
          { session },
        );

        const creditEntry = await LedgerEntry.create(
          [
            {
              transactionId,
              walletId: toWalletId,
              userId: toWallet.userId,
              entryType: "CREDIT",
              amount,
              balanceAfter: newToBalance,
              entryReason,
              idempotencyKey: `${idempotencyKey}:credit`,
              linkedEntryId: debitEntry[0]._id,
            },
          ],
          { session },
        );

        await LedgerEntry.updateOne(
          { _id: debitEntry[0]._id },
          { $set: { linkedEntryId: creditEntry[0]._id } },
          { session },
        );

        result = {
          debitEntryId: debitEntry[0]._id,
          creditEntryId: creditEntry[0]._id,
          fromBalance: newFromBalance,
          toBalance: newToBalance,
          idempotent: false,
        };
      });

      await session.endSession();
      return result;
    } catch (err) {
      await session.endSession();
      lastError = err;

      // Only retry on concurrency conflicts — everything else (insufficient balance,
      // inactive wallet, not found) is a real failure, fail immediately.
      if (err instanceof ConcurrencyConflictError && attempt < MAX_RETRIES) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("moveFunds: exhausted retries without success");
}

async function reconcileWalletBalance(walletId) {
  const lastEntry = await LedgerEntry.findOne({ walletId })
    .sort({ createdAt: -1 })
    .lean();
  return lastEntry ? lastEntry.balanceAfter : 0;
}

module.exports = { moveFunds, reconcileWalletBalance };
