const Wallet = require('../models/Wallet');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');



/**
 * GET /api/v1/wallet
 * Returns the current user's own wallet only — never accepts a walletId param.
 */

async function getMyWallet(req, res, next){
  try{
    const user = await User.findById(req.user.id);
    const wallet = await Wallet.findById(user.walletId);

    console.log(wallet);
    if(!wallet){
      return res.status(400).json({
        err: "wallet not found"
      });
    }


      return res.status(200).json({ wallet });
  }
  
  
  
  catch(err){
    next(err);
  }
}




async function getMyLedger(req, res, next){
  try {
    const user = await User.findById(req.user.id);
    console.log(user);
    if(!user?.walletId){
      return res.status(400).json({
        err: "wallet not found"
      });
    }

     const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
     const entries = await LedgerEntry.find({ walletId: user.walletId })
      .sort({ createdAt: -1 })
      .limit(limit);
 
    return res.status(200).json({ entries });
 
  } catch (err) {
    next(err);
  }
}
 
module.exports = { getMyWallet, getMyLedger };




