// Environment loading and validation will live here.
const dotenv = require("dotenv");
dotenv.config();

const requiredEnvVariables = [
  "PORT",
  "MONGO_URI",
  "MONGO_TEST_URI",
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
};