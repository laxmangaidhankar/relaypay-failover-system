// MongoDB / Mongoose connection setup will live here.
const mongoose = require('mongoose');
const env = require("./env");
const logger = require('../utils/logger');

const MONGO_TEST_URI = process.env.MONGO_TEST_URI;


async function connectToMongoDB() {
  try {
    await mongoose.connect(env.MONGO_TEST_URI);
    logger.info("Database Connected");
  } catch (err) {
    logger.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }
}

module.exports = connectToMongoDB;