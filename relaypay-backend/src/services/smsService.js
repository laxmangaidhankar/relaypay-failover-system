// services/smsService.js

const sendOtp = async (mobile, otp) => {

    // Twilio / MSG91 / Fast2SMS

    console.log(`OTP for ${mobile} is ${otp}`);

};

module.exports = sendOtp;
