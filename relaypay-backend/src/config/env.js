// Environment loading and validation will live here.
const dotenv = require("dotenv");
dotenv.config();

const requiredEnvVariables = [
  "PORT",
  "MONGO_URI",
  "MONGO_TEST_URI",
  "LOG_LEVEL",
  "NODE_ENV",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "CLIENT_ORIGIN",
];

requiredEnvVariables.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

module.exports = {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  MONGO_TEST_URI: process.env.MONGO_TEST_URI,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NODE_ENV: process.env.NODE_ENV,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
};