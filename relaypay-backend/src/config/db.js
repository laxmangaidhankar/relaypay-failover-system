// MongoDB / Mongoose connection setup will live here.
const mongoose = require('mongoose');
const env = require("./env");
const logger = require('../utils/logger');

const MONGO_TEST_URI = process.env.MONGO_TEST_URI;


async function connectDB() {
  const uri = env.MONGO_TEST_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in env');
 
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { error: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
 
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}
 
async function disconnectDB() {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected gracefully');
}
 
module.exports = { connectDB, disconnectDB };