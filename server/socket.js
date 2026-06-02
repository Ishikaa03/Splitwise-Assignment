const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');

module.exports = (io) => {
  io.use((socket, next) => {
    const raw = socket.request.headers.cookie ?? '';
    const token = raw.split('; ').find((c) => c.startsWith('token='))?.split('=')[1];
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_expense', ({ expenseId }) => {
      socket.join(`expense:${expenseId}`);
    });

    socket.on('leave_expense', ({ expenseId }) => {
      socket.leave(`expense:${expenseId}`);
    });

    socket.on('send_message', async ({ expenseId, content }) => {
      try {
        const message = await prisma.message.create({
          data: { expenseId, userId: socket.user.userId, content, type: 'user' },
          include: { user: { select: { id: true, name: true } } },
        });
        io.to(`expense:${expenseId}`).emit('new_message', {
          id: message.id,
          userId: message.userId,
          userName: message.user?.name,
          content: message.content,
          type: message.type,
          createdAt: message.createdAt,
        });
      } catch (err) {
        console.error('send_message error:', err);
      }
    });
  });
};
