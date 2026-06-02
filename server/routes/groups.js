const router = require('express').Router();
const prisma = require('../lib/prisma');
const { canExitGroup } = require('../lib/canExitGroup');
const { getGroupBalances } = require('../lib/balanceQuery');

// GET /api/v1/groups — list my groups
router.get('/', async (req, res, next) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId, leftAt: null },
      include: {
        group: {
          include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true, email: true } } } } },
        },
      },
    });
    const groups = memberships
      .filter((m) => !m.group.deletedAt)
      .map((m) => m.group);
    res.json({ success: true, data: { groups } });
  } catch (err) { next(err); }
});

// POST /api/v1/groups — create group
router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Group name is required' });
    const group = await prisma.group.create({
      data: {
        name,
        description: description || null,
        createdBy: req.userId,
        members: { create: { userId: req.userId } },
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    res.status(201).json({ success: true, data: { group } });
  } catch (err) { next(err); }
});

// GET /api/v1/groups/:id
router.get('/:id', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });
    const isMember = group.members.some((m) => m.userId === req.userId);
    if (!isMember) return res.status(403).json({ success: false, error: 'Access denied' });
    res.json({ success: true, data: { group } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/groups/:id — soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });
    if (group.createdBy !== req.userId) return res.status(403).json({ success: false, error: 'Only the group creator can delete' });
    const balances = await getGroupBalances(req.params.id);
    if (balances.length > 0) {
      return res.status(400).json({ success: false, error: 'All balances must be settled before deletion', details: { unsettled: balances } });
    }
    await prisma.group.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/v1/groups/:id/members — add member by email
router.post('/:id/members', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });
    if (group.createdBy !== req.userId) return res.status(403).json({ success: false, error: 'Only admin can add members' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: req.params.id, userId: user.id } },
    });

    if (existing && !existing.leftAt) {
      return res.status(400).json({ success: false, error: 'User is already a member' });
    }

    if (existing && existing.leftAt) {
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: req.params.id, userId: user.id } },
        data: { leftAt: null },
      });
    } else {
      await prisma.groupMember.create({ data: { groupId: req.params.id, userId: user.id } });
    }

    const updatedGroup = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    res.status(201).json({ success: true, data: { group: updatedGroup } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/groups/:id/members/:userId — remove member
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });

    const isSelf = req.params.userId === req.userId;
    const isAdmin = group.createdBy === req.userId;

    if (!isSelf && !isAdmin) return res.status(403).json({ success: false, error: 'Access denied' });
    if (req.params.userId === group.createdBy) {
      return res.status(400).json({ success: false, error: 'Group creator cannot leave. Delete the group instead.' });
    }

    const check = await canExitGroup(req.params.userId, req.params.id);
    if (!check.allowed) {
      return res.status(400).json({ success: false, error: 'User has unsettled balances', details: check });
    }

    await prisma.groupMember.update({
      where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
      data: { leftAt: new Date() },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /api/v1/groups/:id/balances
router.get('/:id/balances', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });

    const isMember = await prisma.groupMember.findFirst({ where: { groupId: req.params.id, userId: req.userId, leftAt: null } });
    if (!isMember) return res.status(403).json({ success: false, error: 'Access denied' });

    const balances = await getGroupBalances(req.params.id);

    const userIds = [...new Set(balances.flatMap((b) => [b.fromUserId, b.toUserId]))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    const enriched = balances.map((b) => ({
      ...b,
      fromUserName: userMap[b.fromUserId] || 'Unknown',
      toUserName: userMap[b.toUserId] || 'Unknown',
    }));

    res.json({ success: true, data: { balances: enriched } });
  } catch (err) { next(err); }
});

module.exports = router;
