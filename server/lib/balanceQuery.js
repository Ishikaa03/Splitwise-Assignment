const prisma = require('./prisma');

async function getGroupBalances(groupId) {
  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    include: {
      splits: true,
      paidBy: { select: { id: true, name: true } },
    },
  });

  const payments = await prisma.payment.findMany({
    where: { groupId },
  });

  // debt[debtorId][creditorId] = amount owed
  const debt = {};

  for (const expense of expenses) {
    const creditorId = expense.paidById;
    for (const split of expense.splits) {
      const debtorId = split.userId;
      if (debtorId === creditorId) continue;
      if (!debt[debtorId]) debt[debtorId] = {};
      debt[debtorId][creditorId] = (debt[debtorId][creditorId] || 0) + Number(split.amountOwed);
    }
  }

  for (const payment of payments) {
    const { payerId, receiverId, amount } = payment;
    if (!debt[payerId]) debt[payerId] = {};
    debt[payerId][receiverId] = (debt[payerId][receiverId] || 0) - Number(amount);
  }

  const result = [];
  for (const debtorId of Object.keys(debt)) {
    for (const creditorId of Object.keys(debt[debtorId])) {
      const net = debt[debtorId][creditorId];
      if (net > 0.01) {
        result.push({ fromUserId: debtorId, toUserId: creditorId, amount: Math.round(net * 100) / 100 });
      }
    }
  }

  return result;
}

module.exports = { getGroupBalances };
