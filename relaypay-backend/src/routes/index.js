//express
const express = require('express');

//router
const router = express.Router();
 
//controllers 
const authRoutes = require('./v1/authRoutes');
const transactionRoutes = require('./v1/transactionRoutes');
const walletRoutes = require('./v1/walletRoutes');
const familyCircleRoutes = require('./v1/familyCircleRoutes');
const relayRoutes = require('./v1/relayRoutes');
 
//routes
router.use('/auth', authRoutes);
router.use('/transactions', transactionRoutes);
router.use('/wallet', walletRoutes);
router.use('/family-circle', familyCircleRoutes);
router.use('/relay', relayRoutes);
 
module.exports = router;