//random uuid
const { v4: uuidv4 } = require('uuid');

//models
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');


//services
const LedgerService = require('../services/ledgerService');
const failoverEngine = require('../services/failoverEngine');


/**
 * POST /api/v1/transactions
 * Initiates a payment. senderId is always req.user.id — never trust a client-supplied sender.
 */

async function initiateTransaction(req, res, next) {
  try{


    const { receiverId, amount, note, idempotencyKey } = req.body;
    
    if (!receiverId || !amount) {
      return res.status(400).json({ error: 'receiverIdentifier and amount are required' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid amount");
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const sender = await User.findById(req.user.id);
    if (!sender?.walletId) {
      return res.status(400).json({ error: 'Sender has no wallet' });
    }

    const receiver = await User.findOne({
      $or: [{ email: receiverId }, { phone: receiverId }],
    });

    if (!receiver?.walletId) {
      return res.status(404).json({ error: 'Receiver not found or has no wallet' });
    }

    if (String(receiver._id) === String(sender._id)) {
      return res.status(400).json({ error: 'Cannot send a payment to yourself' });
    }




    const transaction = await failoverEngine.initiatePayment({
      senderId: sender._id,
      senderWalletId: sender.walletId,
      receiverId: receiver._id,
      receiverWalletId: receiver.walletId,
      amount,
      note,
      idempotencyKey: idempotencyKey || uuidv4(), 
    });

    // await transaction.save();
    

    return res.status(201).json({ transaction });

  }catch (err) {
    next(err); 
  }
}


/**
 * GET /api/v1/transactions/:id
 * Only the sender or receiver may view a transaction.
 */

async function getTransaction(req, res, next){
  try{
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const isParty = [transaction.senderId, transaction.receiverId, transaction.relay?.backupContactId]
      .map(String)
      .includes(req.user.id);
    if (!isParty) return res.status(403).json({ error: 'Not authorized to view this transaction' });
 
    return res.status(200).json({ transaction });
 
  } catch (err) {
    next(err);
  }
}


/**
 * GET /api/v1/transactions
 * Lists transactions where the current user is sender or receiver, most recent first.
 */
async function listTransactions(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const transactions = await Transaction.find({
      $or: [{ senderId: req.user.id }, { receiverId: req.user.id }],
    })
      .sort({ createdAt: -1 })
      .limit(limit);
 
    return res.status(200).json({ 
      message: "Transaction fetch",
      transactions
     });
 
  } catch (err) {
    next(err);
  }
}
 
module.exports = { initiateTransaction, getTransaction, listTransactions };