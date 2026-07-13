const FamilyCircle = require("../models/FamilyCircle");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const AuditLog = require("../models/AuditLog");

/**
 * GET /api/v1/family-circle
 * Returns the current user's own circle (contacts they've added as backups).
 */

async function getMyCircle(req, res) {
  try {
    const circle = await FamilyCircle.findOne({
      ownerId: req.user.id,
    }).populate("members.userId", "name email phone");
    return res
      .status(200)
      .json({ circle: circle || { ownerId: req.user.id, members: [] } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/family-circle/invite
 * Invites a user (by email/phone) as a backup contact. Status starts PENDING —
 * they must explicitly accept before they can ever be relayed to.
 */

async function inviteMember(req, res, next) {
  try {
    const { identifier, priority, maxRelayAmount, dailyRelayLimit } = req.body;
    if (!identifier) {
      return res.status(400).json({
        error: "Phone Number is required",
      });
    }

    const contact = await User.findOne({
      phone: identifier
    });

    if (!contact) {
      return res.status(400).json({
        err: "User not found",
      });
    }

    if (String(contact._id) === req.user.id) {
      return res
        .status(400)
        .json({ error: "Cannot add yourself as a backup contact" });
    }

    let circle = await FamilyCircle.findOne({ ownerId: req.user.id });

    if (!circle) {
      circle = await FamilyCircle.create({ ownerId: req.user.id, members: [] });
    }

    const alreadyMember = circle.members.some(
      (m) => String(m.userId) === String(contact._id),
    );
    if (alreadyMember) {
      return res
        .status(409)
        .json({ error: "This user is already in your family circle" });
    }

    circle.members.push({
      userId: contact._id,
      walletId: contact.walletId,
      priority: priority || circle.members.length + 1,
      maxRelayAmount: maxRelayAmount || 5000,
      dailyRelayLimit: dailyRelayLimit || 10000,
      status: "PENDING",
    });
    await circle.save();

    await AuditLog.create({
      eventType: "FAMILY_MEMBER_INVITED",
      actorId: req.user.id,
      metadata: { invitedUserId: contact._id },
    });

    return res.status(201).json({ circle });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/family-circle/:ownerId/respond
 * The invited contact accepts or declines. Only the invited user may respond
 * to their own invitation
 */

async function respondToInvite(req, res) {
  try {
    const { ownerId } = req.params;
    const { decision } = req.body;

    if (!["ACCEPT", "DECLINE"].includes(decision)) {
      return res
        .status(400)
        .json({ error: "decision must be 'ACCEPT' or 'DECLINE'" });
    }
    const circle = await FamilyCircle.findOne({ ownerId });
    if (!circle)
      return res.status(404).json({ error: "Family circle not found" });

    const member = circle.members.find((m) => String(m.userId) === req.user.id);
    if (!member)
      return res
        .status(404)
        .json({ error: "You were not invited to this circle" });
    if (member.status !== "PENDING") {
      return res
        .status(409)
        .json({ error: `Invitation already ${member.status.toLowerCase()}` });
    }

    member.status = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    member.respondedAt = new Date();
    await circle.save();

    await AuditLog.create({
      eventType:
        member.status === "ACCEPTED"
          ? "FAMILY_MEMBER_ACCEPTED"
          : "FAMILY_MEMBER_INVITED",
      actorId: req.user.id,
      metadata: { ownerId, decision },
    });

    return res.status(200).json({ circle });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/family-circle/:memberUserId
 * Owner removes a backup contact (or member revokes themselves — checked below).
 */
async function removeMember(req, res, next) {
  try {
    const { memberUserId } = req.params;

    const circle = await FamilyCircle.findOne({ ownerId: req.user.id });
    if (!circle)
      return res.status(404).json({ error: "Family circle not found" });

    const before = circle.members.length;
    circle.members = circle.members.filter(
      (m) => String(m.userId) !== memberUserId,
    );

    if (circle.members.length === before) {
      return res.status(404).json({ error: "Member not found in your circle" });
    }

    await circle.save();
    return res.status(200).json({ circle });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyCircle, inviteMember, respondToInvite, removeMember };
