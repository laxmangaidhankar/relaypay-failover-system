
const bcrypt = require("bcrypt");
const Otp  = require('../models/Otp');


async function verifyOtp(req, res){
  const {mobile, otp} = req.body;
  if(!mobile || !otp){
    return res.status(400).json({
      err: "Mobile no or otp not provided",
    });
  }

  
}