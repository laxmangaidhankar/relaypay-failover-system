const env = require("../src/config/env");

const mongoose = require("mongoose");

const { Wallet } = require("../src/models/Wallet");
const { User } = require("../src/models/User");
const { moveFunds } = require("../src/services/ledgerService");

async function connectToTestDB() {
  try {
    await mongoose.connect(env.MONGO_TEST_URI);
    console.log("Connected to Test DB");
  } catch (err) {
    console.log("Error while connecting to test DB", err.message);
    process.exit(1);
  }
}

async function main() {
  await connectToTestDB();

  await User.deleteMany({});
  await Wallet.deleteMany({});

  const userA = await User.create({
    fullName: "ABC",
    email: "abc@gmail.com",
    phone: "123",
    passwordHash: "abc",
  });

  const userB = await User.create({
    fullName: "XYz",
    email: "xyz@gmail.com",
    phone: "568",
    passwordHash: "xyz",
  });

  const walletA = await Wallet.create({
    userId: userA._id,
    virtualAccountId: "abc",
    balance: 5000,
    status: "ACTIVE",
  });

  const walletB = await Wallet.create({
    userId: userB._id,
    virtualAccountId: "xyz",
    balance: 10000,
    status: "ACTIVE",
  });

  console.log("Before:");
  console.log(walletA.balance, walletB.balance);

  const result = await moveFunds({
    fromWalletId: walletA._id,
    toWalletId: walletB._id,
    amount: 500,
    transactionId: new mongoose.Types.ObjectId(),
    idempotencyKey: "abc-suz",
    entryReason: "REVERSAL",
  });

  console.log(result);

  const updatedA = await Wallet.findById(walletA._id);
  const updatedB = await Wallet.findById(walletB._id);

  console.log("After:");
  console.log(updatedA.balance, updatedB.balance);

  await mongoose.disconnect();
}

try {
  main();
} catch (err) {
  console.log("Error connecting", err.message);
}
