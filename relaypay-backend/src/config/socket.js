// Socket.io setup and auth handshake will live here.
const { Server } = require('socket.io');

const env = require('./env');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');

const {verifyAccessToken} = require('../utils/tokens');

function initSocket(httpServer){
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try{
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const payload = verifyAccessToken(token);

      socket.userId = payload.sub;
      next();
    }catch(err){
       next(new Error('Invalid or expired token'));
    }
  });
  io.on('connection', (socket) => {
  
    socket.join(`user:${socket.userId}`);
    logger.info(`Socket connected: user ${socket.userId}`);
 
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: user ${socket.userId}`);
    });
  });
 
  notificationService.registerSocketServer(io);
  return io;
}

module.exports = initSocket;