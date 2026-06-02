require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'demo1@test.com' } });
  if (existing) {
    console.log('Seed data already exists. Skipping.');
    return;
  }

  const hash = await bcrypt.hash('password123', 10);

  const [u1, u2, u3] = await Promise.all([
    prisma.user.create({ data: { name: 'Priya', email: 'demo1@test.com', passwordHash: hash } }),
    prisma.user.create({ data: { name: 'Rahul', email: 'demo2@test.com', passwordHash: hash } }),
    prisma.user.create({ data: { name: 'Amit', email: 'demo3@test.com', passwordHash: hash } }),
  ]);

  const group = await prisma.group.create({
    data: {
      name: 'Goa Trip',
      description: 'June 2026 trip expenses',
      createdBy: u1.id,
      members: { create: [{ userId: u1.id }, { userId: u2.id }, { userId: u3.id }] },
    },
  });

  // Expense 1: Equal — Rahul paid dinner ₹2400 (Priya and Amit each owe ₹800)
  const e1 = await prisma.expense.create({
    data: {
      groupId: group.id,
      description: 'Dinner at Beach Shack',
      amount: 2400,
      paidById: u2.id,
      createdById: u2.id,
      splitType: 'equal',
      expenseDate: new Date('2026-06-15'),
      splits: { create: [{ userId: u1.id, amountOwed: 800 }, { userId: u3.id, amountOwed: 800 }] },
    },
  });

  // Expense 2: Unequal — Priya paid hotel ₹6000
  await prisma.expense.create({
    data: {
      groupId: group.id,
      description: 'Hotel (2 nights)',
      amount: 6000,
      paidById: u1.id,
      createdById: u1.id,
      splitType: 'unequal',
      expenseDate: new Date('2026-06-15'),
      splits: { create: [{ userId: u2.id, amountOwed: 2500 }, { userId: u3.id, amountOwed: 2000 }] },
    },
  });

  // Expense 3: Percentage — Amit paid cabs ₹1500 (Priya 40%, Rahul 30%, Amit keeps 30%)
  await prisma.expense.create({
    data: {
      groupId: group.id,
      description: 'Airport cabs',
      amount: 1500,
      paidById: u3.id,
      createdById: u3.id,
      splitType: 'percentage',
      expenseDate: new Date('2026-06-16'),
      splits: { create: [{ userId: u1.id, amountOwed: 600 }, { userId: u2.id, amountOwed: 450 }] },
    },
  });

  // Expense 4: Shares — Rahul paid groceries ₹900 (Priya 2 shares, Amit 1 share; Rahul keeps 1 share)
  await prisma.expense.create({
    data: {
      groupId: group.id,
      description: 'Groceries',
      amount: 900,
      paidById: u2.id,
      createdById: u1.id,
      splitType: 'share',
      expenseDate: new Date('2026-06-17'),
      notes: 'Snacks and drinks for the trip',
      splits: { create: [{ userId: u1.id, amountOwed: 450 }, { userId: u3.id, amountOwed: 225 }] },
    },
  });

  // Chat messages on expense 1
  await prisma.message.createMany({
    data: [
      { expenseId: e1.id, userId: u1.id, content: 'Amazing dinner! Worth every rupee 🍤', type: 'user' },
      { expenseId: e1.id, userId: u3.id, content: 'Totally agree. Will settle up next week.', type: 'user' },
      { expenseId: e1.id, userId: u2.id, content: 'No rush, enjoy the trip first!', type: 'user' },
    ],
  });

  // Partial settlement: Amit pays Priya ₹500
  await prisma.payment.create({
    data: { groupId: group.id, payerId: u3.id, receiverId: u1.id, amount: 500, note: 'Partial hotel payment' },
  });

  console.log('Seed complete! Demo users created:');
  console.log('  demo1@test.com / password123 (Priya)');
  console.log('  demo2@test.com / password123 (Rahul)');
  console.log('  demo3@test.com / password123 (Amit)');
  console.log('  Group: Goa Trip with 4 expenses and 1 partial settlement');
}

main().catch(console.error).finally(() => prisma.$disconnect());
