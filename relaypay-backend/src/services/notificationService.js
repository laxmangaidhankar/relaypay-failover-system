// services/notificationService.js
//
// Thin wrapper so failoverEngine.js never imports Socket.io directly.
// Swappable later for push notifications / email without touching the FSM.

let ioInstance = null;

function registerSocketServer(io) {
  ioInstance = io;
}

function _emitToUser(userId, event, payload) {
  if (!ioInstance) {
    console.warn(`notificationService: socket server not registered, dropped event ${event}`);
    return;
  }
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

function notifyRelayRequested(backupUserId, { transactionId, amount, senderName, expiresAt }) {
  _emitToUser(backupUserId, 'relay:requested', { transactionId, amount, senderName, expiresAt });
}

function notifyRelayResolved(senderId, { transactionId, status, amount }) {
  _emitToUser(senderId, 'relay:resolved', { transactionId, status, amount });
}

function notifyTransactionSettled(userId, { transactionId, amount, newBalance }) {
  _emitToUser(userId, 'transaction:settled', { transactionId, amount, newBalance });
}

function notifyTransactionFailed(userId, { transactionId, reason }) {
  _emitToUser(userId, 'transaction:failed', { transactionId, reason });
}

module.exports = {
  registerSocketServer,
  notifyRelayRequested,
  notifyRelayResolved,
  notifyTransactionSettled,
  notifyTransactionFailed,
};