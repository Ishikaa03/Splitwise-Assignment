const router = require('express').Router();
const prisma = require('../lib/prisma');

// GET /api/v1/messages/expense/:expenseId — last 50 messages
router.get('/expense/:expenseId', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
    if (!expense || expense.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });

    const messages = await prisma.message.findMany({
      where: { expenseId: req.params.expenseId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    res.json({ success: true, data: { messages } });
  } catch (err) { next(err); }
});

// POST /api/v1/messages/expense/:expenseId
router.post('/expense/:expenseId', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

    const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
    if (!expense || expense.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });

    const message = await prisma.message.create({
      data: { expenseId: req.params.expenseId, userId: req.userId, content, type: 'user' },
      include: { user: { select: { id: true, name: true } } },
    });

    // Emit via socket if io is available
    const io = req.app.get('io');
    if (io) {
      io.to(`expense:${req.params.expenseId}`).emit('new_message', {
        id: message.id,
        userId: message.userId,
        userName: message.user?.name,
        content: message.content,
        type: message.type,
        createdAt: message.createdAt,
      });
    }

    res.status(201).json({ success: true, data: { message } });
  } catch (err) { next(err); }
});

module.exports = router;
