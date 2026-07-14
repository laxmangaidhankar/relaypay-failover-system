const http = require('http');


const initSocket = require('./src/config/socket');
const relayTimeoutWorker = require('./src/workers/relayTimeoutWorker');


const env = require('./src/config/env');

const {connectDB, disconnectDB} = require('./src/config/db');
const logger  = require('./src/utils/logger');
const app = require('./src/app');


async function start(){
  try{
    await connectDB();

    const httpServer = http.createServer(app);
    initSocket(httpServer);


     httpServer.listen(env.PORT, () => {
      logger.info(`RelayPay server listening on port ${env.PORT}`);
    });

    relayTimeoutWorker.start();

    const shutdown = async (signal) => {
       logger.info(`${signal} received, shutting down gracefully`);

       relayTimeoutWorker.stop();

        httpServer.close(async () => {
        await disconnectDB();
        logger.info('Shutdown complete');
        process.exit(0);
      });

       setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000).unref();
    };
 
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    }
catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}
 
start();
 