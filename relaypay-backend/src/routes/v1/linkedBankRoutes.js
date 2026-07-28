const express = require('express');

const { linkBank,
  getLinkedBanks,
  setPrimaryBank,
  unlinkBank,
  verifyPin } = require('../../controllers/LinkedbankController');
  const { requireAuth } = require('../../middleware/auth');
const LinkedBank = require('../../models/LinkedBank');


const router = express();

router.use(requireAuth); 
router.post('/link', linkBank);
router.get('/linked-banks', getLinkedBanks);

module.exports = router;