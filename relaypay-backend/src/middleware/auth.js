const { verifyAccessToken } = require('../utils/tokens');
const {User} = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }
 
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token); // throws if invalid/expired
 
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
 
    req.user = { id: user._id.toString(), email: user.email };
    next();
 
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
 
module.exports = { requireAuth };