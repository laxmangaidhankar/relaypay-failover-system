const mongoose = require('mongoose');

const OtpSchema = mongoose.Schema({
  phone: {
    type: String,
    required: true
  },

  otp: {
    type:String,
    require:true
  },

   purpose: {
        type: String,
        enum: ["REGISTER", "LOGIN"],
        required: true
    },

  expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 5 * 60 * 1000),
        expires: 0
    }
});

const Otp = mongoose.model("Otp", OtpSchema);

module.exports = Otp;