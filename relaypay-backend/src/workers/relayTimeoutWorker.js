const Transaction = require('../models/Transaction');
const failoverEngine = require('../services/failoverEngine');
const logger = require('../utils/logger');
 
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const BATCH_LIMIT = 50;          // safety cap per tick, avoid runaway batch on a backlog
 
let intervalHandle = null;
let isTicking = false; // prevents overlapping ticks if one run takes longer than the interval
 
async function tick() {
  if (isTicking) return; // skip this tick rather than stack up concurrent runs
  isTicking = true;
 
  try {
    const now = new Date();
 
    const expired = await Transaction.find({
      status: 'RELAY_REQUESTED',
      'relay.expiresAt': { $lt: now },
    })
      .limit(BATCH_LIMIT)
      .select('_id')
      .lean();
 
    if (!expired.length) return;
 
    logger.info(`relayTimeoutWorker: processing ${expired.length} expired relay request(s)`);
 
    for (const { _id } of expired) {
      try {
        await failoverEngine.handleRelayTimeout(_id);
      } catch (err) {
        // Log and continue — one bad transaction shouldn't halt the whole batch.
        logger.error(`relayTimeoutWorker: failed to process timeout for ${_id}`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error('relayTimeoutWorker: tick failed', { error: err.message });
  } finally {
    isTicking = false;
  }
}
 
function start() {
  if (intervalHandle) return; // already running, don't double-start
  logger.info(`relayTimeoutWorker: starting, polling every ${POLL_INTERVAL_MS / 1000}s`);
  intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
}
 
function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('relayTimeoutWorker: stopped');
  }
}
 
module.exports = { start, stop, tick }; 