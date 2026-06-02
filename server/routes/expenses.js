const router = require('express').Router();
const prisma = require('../lib/prisma');
const { calculateSplits } = require('../lib/splitCalculator');

async function requireActiveMember(userId, groupId) {
  const m = await prisma.groupMember.findFirst({ where: { groupId, userId, leftAt: null } });
  if (!m) throw { status: 403, message: 'You are not an active member of this group' };
}

// GET /api/v1/expenses/group/:groupId
router.get('/group/:groupId', async (req, res, next) => {
  try {
    await requireActiveMember(req.userId, req.params.groupId);
    const expenses = await prisma.expense.findMany({
      where: { groupId: req.params.groupId, deletedAt: null },
      include: {
        paidBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
        messages: { select: { id: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: { expenses } });
  } catch (err) { next(err); }
});

// POST /api/v1/expenses/group/:groupId
router.post('/group/:groupId', async (req, res, next) => {
  try {
    await requireActiveMember(req.userId, req.params.groupId);
    const { description, amount, paidById, splitType, splits: rawSplits, expenseDate, notes } = req.body;

    if (!description || !amount || !paidById || !splitType) {
      return res.status(400).json({ success: false, error: 'description, amount, paidById, splitType are required' });
    }

    const computedSplits = calculateSplits(splitType, amount, [], rawSplits || []);

    const expense = await prisma.expense.create({
      data: {
        groupId: req.params.groupId,
        description,
        amount,
        paidById,
        createdById: req.userId,
        splitType,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        notes: notes || null,
        splits: { create: computedSplits },
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    res.status(201).json({ success: true, data: { expense } });
  } catch (err) { next(err); }
});

// GET /api/v1/expenses/:id
router.get('/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        paidBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!expense || expense.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });
    await requireActiveMember(req.userId, expense.groupId);
    res.json({ success: true, data: { expense } });
  } catch (err) { next(err); }
});

// PUT /api/v1/expenses/:id
router.put('/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense || expense.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });

    const group = await prisma.group.findUnique({ where: { id: expense.groupId } });
    const canEdit = expense.createdById === req.userId || group.createdBy === req.userId;
    if (!canEdit) return res.status(403).json({ success: false, error: 'Only expense creator or group admin can edit' });

    const { description, amount, paidById, splitType, splits: rawSplits, expenseDate, notes } = req.body;
    const newAmount = amount || expense.amount;
    const newSplitType = splitType || expense.splitType;

    const computedSplits = calculateSplits(newSplitType, newAmount, [], rawSplits || []);

    await prisma.expenseSplit.deleteMany({ where: { expenseId: req.params.id } });

    const updated = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        description: description || expense.description,
        amount: newAmount,
        paidById: paidById || expense.paidById,
        splitType: newSplitType,
        expenseDate: expenseDate ? new Date(expenseDate) : expense.expenseDate,
        notes: notes !== undefined ? notes : expense.notes,
        splits: { create: computedSplits },
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    await prisma.message.create({
      data: {
        expenseId: req.params.id,
        userId: null,
        content: `Expense updated by ${updated.createdBy.name}`,
        type: 'system',
      },
    });

    res.json({ success: true, data: { expense: updated } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense || expense.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });

    const group = await prisma.group.findUnique({ where: { id: expense.groupId } });
    const canDelete = expense.createdById === req.userId || group.createdBy === req.userId;
    if (!canDelete) return res.status(403).json({ success: false, error: 'Only expense creator or group admin can delete' });

    const relatedPayments = await prisma.payment.count({ where: { groupId: expense.groupId } });

    await prisma.expense.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });

    res.json({
      success: true,
      warning: relatedPayments > 0 ? 'Expense deleted. Existing payments may affect balance calculations.' : null,
    });
  } catch (err) { next(err); }
});

module.exports = router;
