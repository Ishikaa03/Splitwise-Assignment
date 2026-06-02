const prisma = require('./prisma');

async function canExitGroup(userId, groupId) {
  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);

  const splits = await prisma.expenseSplit.findMany({
    where: {
      userId,
      expense: { groupId, deletedAt: null },
    },
    select: { amountOwed: true, expense: { select: { paidById: true } } },
  });

  const expensesPaidByUser = await prisma.expense.findMany({
    where: { groupId, paidById: userId, deletedAt: null },
    include: { splits: { where: { userId: { not: userId } } } },
  });

  const paymentsMade = await prisma.payment.findMany({
    where: { groupId, payerId: userId },
    select: { receiverId: true, amount: true },
  });

  const paymentsReceived = await prisma.payment.findMany({
    where: { groupId, receiverId: userId },
    select: { payerId: true, amount: true },
  });

  let totalOwes = 0;
  let totalIsOwed = 0;

  for (const split of splits) {
    if (split.expense.paidById !== userId) {
      totalOwes += Number(split.amountOwed);
    }
  }

  for (const exp of expensesPaidByUser) {
    for (const split of exp.splits) {
      totalIsOwed += Number(split.amountOwed);
    }
  }

  for (const p of paymentsMade) {
    totalOwes -= Number(p.amount);
  }

  for (const p of paymentsReceived) {
    totalIsOwed -= Number(p.amount);
  }

  const owes = Math.max(0, totalOwes);
  const owed = Math.max(0, totalIsOwed);

  if (owes > 0.01 || owed > 0.01) {
    return { allowed: false, owes, owed };
  }
  return { allowed: true };
}

module.exports = { canExitGroup };
