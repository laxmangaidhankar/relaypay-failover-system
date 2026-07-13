const express = require('express');

const { requireAuth } = require('../../middleware/auth');
const { listPendingRelays, respondToRelay } = require('../../controllers/relayController');

const router = express.Router();


router.use(requireAuth);

router.get('/pending', listPendingRelays );

router.post('/:transactionId/respond', respondToRelay);


module.exports = router;
