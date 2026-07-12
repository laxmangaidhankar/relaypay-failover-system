const express = require('express');

const router = express.Router();

const { requireAuth }  = require('../../middleware/auth');

const { initiateTransaction, getTransaction, listTransactions } = require('../../controllers/transactionController');


router.use(requireAuth); 

router.post('/', initiateTransaction);
router.get('/', listTransactions);
router.get('/:id', getTransaction);


module.exports = router;