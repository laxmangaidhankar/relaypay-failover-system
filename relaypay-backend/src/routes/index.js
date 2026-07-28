//express
const express = require('express');

//router
const router = express.Router();
 
//controllers 
const authRoutes = require('./v1/authRoutes');
const transactionRoutes = require('./v1/transactionRoutes');
const familyCircleRoutes = require('./v1/familyCircleRoutes');
const relayRoutes = require('./v1/relayRoutes');
 
const linkBankRoutes = require('./v1/linkedBankRoutes');

//routes
router.use('/auth', authRoutes);
router.use('/transactions', transactionRoutes);
router.use('/family-circle', familyCircleRoutes);
router.use('/relay', relayRoutes);
router.use('/check-balance', linkBankRoutes)

router.use('/banks', linkBankRoutes);
 
module.exports = router;