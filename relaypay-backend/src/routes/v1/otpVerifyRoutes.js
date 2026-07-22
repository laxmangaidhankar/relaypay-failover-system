const express = require('express');

const router = express();

router.post('verify-otp', verifyOtpController);

module.exports = router;
