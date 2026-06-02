const router = require('express').Router();
const prisma = require('../lib/prisma');
const { getGroupBalances } = require('../lib/balanceQuery');

// POST /api/v1/payments
router.post('/', async (req, res, next) => {
  try {
    const { groupId, payerId, receiverId, amount, note } = req.body;
    if (!groupId || !payerId || !receiverId || !amount) {
      return res.status(400).json({ success: false, error: 'groupId, payerId, receiverId, amount are required' });
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.deletedAt) return res.status(404).json({ success: false, error: 'Group not found' });

    const isAdmin = group.createdBy === req.userId;
    const isPayer = payerId === req.userId;
    if (!isPayer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the payer or group admin can record this payment' });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }

    const payment = await prisma.payment.create({
      data: { groupId, payerId, receiverId, amount: Number(amount), note: note || null },
      include: {
        payer: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ success: true, data: { payment } });
  } catch (err) { next(err); }
});

// GET /api/v1/payments/group/:groupId
router.get('/group/:groupId', async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { groupId: req.params.groupId },
      include: {
        payer: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { payments } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/payments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    const group = await prisma.group.findUnique({ where: { id: payment.groupId } });
    const isAdmin = group.createdBy === req.userId;
    const isPayer = payment.payerId === req.userId;
    if (!isPayer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the payer or group admin can delete this payment' });
    }

    await prisma.payment.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
