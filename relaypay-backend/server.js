const app = require("./src/app");

const port = process.env.PORT || 3000;

if (require.main === module) {
  console.log(`Relaypay backend scaffold ready on port ${port}.`);
}

module.exports = { app, port };
