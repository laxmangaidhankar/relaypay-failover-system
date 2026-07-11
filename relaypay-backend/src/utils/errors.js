class AppError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
 
// --- Ledger-level errors ---
class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance') {
    super(message, 'INSUFFICIENT_BALANCE');
  }
}
 
class WalletInactiveError extends AppError {
  constructor(message = 'Wallet is not active') {
    super(message, 'WALLET_INACTIVE');
  }
}
 
class DuplicateTransactionError extends AppError {
  constructor(message = 'Duplicate transaction') {
    super(message, 'DUPLICATE_TRANSACTION');
  }
}
 
class ConcurrencyConflictError extends AppError {
  constructor(message = 'Concurrent modification detected, retry') {
    super(message, 'CONCURRENCY_CONFLICT');
  }
}



class BankError extends AppError {
  constructor(message, code, relayEligible = true) {
    super(message, code);
    this.relayEligible = relayEligible;
  }
}
 
class BankInsufficientBalanceError extends BankError {
  constructor(message = 'Insufficient balance in source account') {
    super(message, 'INSUFFICIENT_BALANCE', true); // relay-eligible: backup contact can cover it
  }
}
 
class BankTimeoutError extends BankError {
  constructor(message = 'Bank network timeout') {
    super(message, 'NETWORK_TIMEOUT', true);
  }
}
 
class BankServerError extends BankError {
  constructor(message = 'Bank server error') {
    super(message, 'BANK_SERVER_ERROR', true);
  }
}
 
class DailyLimitExceededError extends BankError {
  constructor(message = 'Daily transaction limit exceeded') {
    super(message, 'DAILY_LIMIT_EXCEEDED', true);
  }
}
 
class WalletFrozenError extends BankError {
  constructor(message = 'Wallet is frozen or closed') {
    // Not relay-eligible: a backup contact paying doesn't fix a frozen sender account.
    super(message, 'WALLET_FROZEN', false);
  }
}

module.exports = {
  AppError,
  InsufficientBalanceError,
  WalletInactiveError,
  DuplicateTransactionError,
  ConcurrencyConflictError,
  BankError,
  BankInsufficientBalanceError,
  BankTimeoutError,
  BankServerError,
  DailyLimitExceededError,
  WalletFrozenError,
};