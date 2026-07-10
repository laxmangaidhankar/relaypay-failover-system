// MongoDB / Mongoose connection setup will live here.
const mongoose = require('mongoose');
const env = require("./env");

const MONGO_TEST_URI = process.env.MONGO_TEST_URI;


async function connectToMongoDB() {
  try {
    await mongoose.connect(env.MONGO_TEST_URI);
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }
}

module.exports = {
  connectToMongoDB
}