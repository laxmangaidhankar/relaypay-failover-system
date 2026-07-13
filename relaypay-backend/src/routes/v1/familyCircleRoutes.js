const express = require('express');
const { getMyCircle, inviteMember, respondToInvite, removeMember  } = require('../../controllers/familyCircleController');


const { requireAuth } = require('../../middleware/auth');
const router = express.Router();


router.use(requireAuth);

router.get('/', getMyCircle);

router.post('/invite', inviteMember);

router.post('/:ownerId/respond', respondToInvite);

router.delete('/:memberUserId', removeMember);


module.exports = router;
