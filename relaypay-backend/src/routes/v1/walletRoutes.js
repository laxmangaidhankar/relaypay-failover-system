const express = require('express');

const {getMyWallet, getMyLedger} = require('../../controllers/walletController');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth); 
router.get('/', getMyWallet);
router.get('/ledger', getMyLedger);



module.exports = router;
