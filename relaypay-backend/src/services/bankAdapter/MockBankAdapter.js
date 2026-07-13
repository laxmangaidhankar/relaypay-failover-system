const { v4: uuidv4 } = require("uuid");

const BankAdapter = require("./BankAdapter");
const Wallet = require("../../models/Wallet");

const {
  BankInsufficientBalanceError,
  BankTimeoutError,
  BankServerError,
  DailyLimitExceededError,
  WalletFrozenError,
  InsufficientBalanceError,
} = require("../../utils/errors");

const DEFAULT_CONFIG = {
  simulatedFailureRate: 0.15, // chance of NETWORK_TIMEOUT / BANK_SERVER_ERROR, applied only when real checks pass
  minLatencyMs: 200,
  maxLatencyMs: 2000,
  forceFailure: null,

  simulatedFailureWeights: {
    NETWORK_TIMEOUT: 0.6,
    BANK_SERVER_ERROR: 0.4,
  },
};

class MockBankAdapter extends BankAdapter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async _injectLatency() {
    const { minLatencyMs, maxLatencyMs } = this.config;
    const delay = minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  _pickWeightedSimulatedFailure() {
    const weights = this.config.simulatedFailureWeights;
    const roll = Math.random();
    let cumulative = 0;
    for (const [type, weight] of Object.entries(weights)) {
      cumulative += weight;
      if (roll <= cumulative) return type;
    }
    return "NETWORK_TIMEOUT"; // fallback
  }

  async checkBalance(accountId) {
    const wallet = await Wallet.findById(accountId);
    if (!wallet)
      throw new Error(`MockBankAdapter: wallet ${accountId} not found`);
    return wallet.balance;
  }

  async initiateTransfer({
    fromAccountId,
    toAccountId,
    amount,
    transactionId,
  }) {
    await this._injectLatency();

    if (this.config.forceFailure) {
      throw this._buildError(this.config.forceFailure);
    }

    const fromWallet = await Wallet.findById(fromAccountId);

    if (!fromWallet) {
      throw new Error(`${fromAccountId} not found`);
    }

    if (fromWallet.status !== "ACTIVE") {
      throw new Error(
        `wallet ${fromAccountId} is ${fromWallet.status} status `,
      );
    }

    if (fromWallet.balance < amount) {
      throw new InsufficientBalanceError(
        ` wallet ${fromAccountId} balance ${fromWallet.balance} is less than requested ${amount}`,
      );
    }

    this._resetDailyCounterIfNeeded(fromWallet);

    if (fromWallet.dailySpent + amount > fromWallet.dailyLimit) {
      throw new DailyLimitExceededError(
        ` Transfer of ${amount} would exceed daily limit ${fromWallet.dailyLimit}`,
      );
    }

    const shouldSimulateFailure =
      Math.random() < this.config.simulatedFailureRate;
    if (shouldSimulateFailure) {
      const failureType = this._pickWeightedSimulatedFailure();
      throw this._buildError(failureType);
    }

    // --- Success path ---
    return {
      bankReferenceId: `MOCKBANK-${uuidv4()}`,
      status: "SUCCESS",
      processedAt: new Date(),
    };
  }

  async getTransferStatus(bankReferenceId) {
    return { status: "SUCCESS", bankReferenceId };
  }

  _resetDailyCounterIfNeeded(wallet) {
    const now = new Date();
    const resetAt = new Date(wallet.dailyResetAt);
    const isNewDay = now.toDateString() !== resetAt.toDateString();
    if (isNewDay) {
      wallet.dailySpent = 0;
      wallet.dailyResetAt = now;
    }
  }

  _buildError(failureType) {
    switch (failureType) {
      case "INSUFFICIENT_BALANCE":
        return new BankInsufficientBalanceError();
      case "NETWORK_TIMEOUT":
        return new BankTimeoutError();
      case "BANK_SERVER_ERROR":
        return new BankServerError();
      case "DAILY_LIMIT_EXCEEDED":
        return new DailyLimitExceededError();
      case "WALLET_FROZEN":
        return new WalletFrozenError();
      default:
        return new BankServerError(
          `Unknown forced failure type: ${failureType}`,
        );
    }
  }
}

module.exports = MockBankAdapter;
