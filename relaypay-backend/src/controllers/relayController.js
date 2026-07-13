const Transaction = require('../models/Transaction');

const failoverEngine  = require('../services/failoverEngine');


/**
 * GET /api/v1/relay/pending
 * Lists relay requests currently awaiting THIS user's response.
 */
async function listPendingRelays(req, res, next){
  try{


    
    
    console.log(req.user);
    
    const transactions = await Transaction.findOne({
      status : "RELAY_REQUESTED",
      'relay.backupContactId': req.user.id,
    }).sort({ 'relay.requestedAt': -1 });

    console.log(transactions);

    // console.log(transactions.idempotencyKey);

    if(!transactions){
      return res.status(400).json({
        err: "Relay Requested Trasaction Not Found"
      });
    }


    return res.status(200).json({
      msg: "Transaction with status Relay Requested found",
      transactions: {
        transactions
      }
    });
  }catch(err){
    next(err);
  }


}


/**
 * POST /api/v1/relay/:transactionId/respond
 * failoverEngine.handleRelayResponse() itself verifies the responder is the
 * invited backup contact — this controller just passes the request through.
 */

async function respondToRelay(req, res, next){
  try{
    const { transactionId } = req.params;
    const { decision } = req.body;

    if(!['APPROVE', 'DECLINE'].includes(decision)){
      return res.status(400).json({
        err: "decision must be approve or the decline",
      });
    }

    const transaction = await failoverEngine.handleRelayResponse(
        transactionId,
        req.user.id, 
        decision === 'APPROVE' ? 'APPROVE' : 'DECLINE'
    );

    return res.status(200).json({
      msg: " Responded",
      transaction: {
        transaction
      }
    });

  }catch(err){
    if (err.message.includes('not awaiting relay response')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message.includes('Only the invited backup contact')) {
      return res.status(403).json({ error: err.message });
    }
    next(err);
  }


}


module.exports = { listPendingRelays, respondToRelay };
