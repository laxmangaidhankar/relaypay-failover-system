const pino = require('pino');
const env = require('../config/env');
const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'passwordHash',
      'transactionPin',
      'req.headers.authorization',
      '*.password',
      '*.pin',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  transport: env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
 
module.exports = logger;
 