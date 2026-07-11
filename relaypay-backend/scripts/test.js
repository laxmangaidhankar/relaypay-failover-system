const mongoose = require("mongoose");
const env = require('../src/config/env');
async function test() {
  await mongoose.connect(env.MONGO_TEST_URI);

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    console.log("Transaction started");

    await session.commitTransaction();

    console.log("Committed");
  } catch (err) {
    console.error(err);
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

test();