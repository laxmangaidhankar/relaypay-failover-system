class InsufficientBalanceError extends Error {
    constructor() {
        super();

        this.name = "InsufficientBalanceError";

        this.statusCode = 400;
    }
}

class WalletInactiveError extends Error {
  constructor() {
    super();

    this.name = "WalletInactiveError";
    this.statusCode = 400;
  }
}

class DuplicateTransactionError extends Error {
  constructor() {
    super();

    this.name = "DuplicateTransactionError";
    this.statusCode = 400;
  }
}

class ConcurrencyConflictError extends Error{
  constructor(message = "Concurrency conflict detected") {
    super(message);

    this.name = "ConcurrencyConflictError";
    this.statusCode = 400;
  }
}


module.exports = {
  InsufficientBalanceError,
  WalletInactiveError,
  DuplicateTransactionError,
  ConcurrencyConflictError

};