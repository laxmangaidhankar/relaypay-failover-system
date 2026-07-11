// Decides WHO to relay a failed payment to. Knows nothing about the FSM itself —
// just answers "given this sender, who is the next eligible backup contact?"

const FamilyCircle = require('../models/FamilyCircle');


async function findBackupContact(senderId, amount, excludeUserIds = []) {
  const circle = await FamilyCircle.findOne({ ownerId: senderId, isActive: true });
  if (!circle || !circle.members?.length) return null;

  const eligible = circle.members
    .filter(m => m.status === 'ACCEPTED')
    .filter(m => !excludeUserIds.map(String).includes(String(m.userId)))
    .filter(m => amount <= m.maxRelayAmount)
    .filter(m => (m.dailyRelayUsed + amount) <= m.dailyRelayLimit)
    .sort((a, b) => a.priority - b.priority);

  if (!eligible.length) return null;

  const chosen = eligible[0];
  return {
    userId: chosen.userId,
    walletId: chosen.walletId,
    priority: chosen.priority,
    maxRelayAmount: chosen.maxRelayAmount,
  };
}

/**
 * Updates a member's dailyRelayUsed after a relay settles successfully.
 * Resets the counter first if it's a new day (mirrors Wallet's own daily-reset pattern).
 */
async function recordRelayUsage(ownerId, backupUserId, amount) {
  const circle = await FamilyCircle.findOne({ ownerId, isActive: true });
  if (!circle) return;

  const member = circle.members.find(m => String(m.userId) === String(backupUserId));
  if (!member) return;

  member.dailyRelayUsed += amount;
  await circle.save();
}

/**
 * Returns the configured relay response timeout (seconds) for a sender's circle.
 * Falls back to a sane default if no circle/setting exists.
 */
async function getRelayTimeoutSeconds(senderId) {
  const circle = await FamilyCircle.findOne({ ownerId: senderId, isActive: true });
  return circle?.relayTimeoutSeconds || 60;
}

module.exports = { findBackupContact, recordRelayUsage, getRelayTimeoutSeconds };