function calculateSplits(splitType, amount, members, customSplits) {
  const total = Number(amount);
  let splits = [];

  if (splitType === 'equal') {
    const selectedIds = customSplits.map((s) => s.userId);
    if (selectedIds.length === 0) throw { status: 400, message: 'At least one member must be in the split' };
    const base = Math.floor((total / selectedIds.length) * 100) / 100;
    const remainder = Math.round((total - base * selectedIds.length) * 100) / 100;
    splits = selectedIds.map((userId, i) => ({
      userId,
      amountOwed: i === 0 ? Math.round((base + remainder) * 100) / 100 : base,
    }));
  } else if (splitType === 'unequal') {
    const sum = customSplits.reduce((acc, s) => acc + Number(s.amount), 0);
    if (Math.abs(sum - total) > 0.01) throw { status: 400, message: `Split amounts must sum to ${total}` };
    splits = customSplits.map((s) => ({ userId: s.userId, amountOwed: Number(s.amount) }));
  } else if (splitType === 'percentage') {
    const sumPct = customSplits.reduce((acc, s) => acc + Number(s.percentage), 0);
    if (Math.abs(sumPct - 100) > 0.01) throw { status: 400, message: 'Percentages must sum to 100' };
    splits = customSplits.map((s) => ({
      userId: s.userId,
      amountOwed: Math.round(((Number(s.percentage) / 100) * total) * 100) / 100,
    }));
  } else if (splitType === 'share') {
    const totalShares = customSplits.reduce((acc, s) => acc + Number(s.shares), 0);
    if (totalShares <= 0) throw { status: 400, message: 'Total shares must be greater than 0' };
    splits = customSplits.map((s) => ({
      userId: s.userId,
      amountOwed: Math.round(((Number(s.shares) / totalShares) * total) * 100) / 100,
    }));
  } else {
    throw { status: 400, message: 'Invalid split type' };
  }

  return splits;
}

module.exports = { calculateSplits };
