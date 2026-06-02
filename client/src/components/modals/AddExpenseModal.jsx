import { useState } from 'react';
import api from '../../lib/axios';

const SPLIT_TYPES = ['equal', 'unequal', 'percentage', 'share'];

export default function AddExpenseModal({ groupId, members, onClose, onSaved, editingExpense }) {
  const today = new Date().toISOString().split('T')[0];
  const isEdit = !!editingExpense;

  const buildInitialSplits = () => {
    if (isEdit && editingExpense.splits) {
      return members.map((m) => {
        const s = editingExpense.splits.find((sp) => sp.userId === m.user.id);
        return { userId: m.user.id, name: m.user.name, amount: s ? String(s.amountOwed) : '0', percentage: '0', shares: '1', included: !!s };
      });
    }
    return members.map((m) => ({ userId: m.user.id, name: m.user.name, amount: '0', percentage: '0', shares: '1', included: true }));
  };

  const [form, setForm] = useState({
    description: editingExpense?.description || '',
    amount: editingExpense ? String(editingExpense.amount) : '',
    paidById: editingExpense?.paidById || members[0]?.user.id || '',
    splitType: editingExpense?.splitType || 'equal',
    expenseDate: editingExpense?.expenseDate ? editingExpense.expenseDate.split('T')[0] : today,
    notes: editingExpense?.notes || '',
  });
  const [splits, setSplits] = useState(buildInitialSplits);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const totalAmount = parseFloat(form.amount) || 0;

  const equalCount = splits.filter((s) => s.included).length;
  const equalPer = equalCount > 0 ? (totalAmount / equalCount).toFixed(2) : '0.00';

  const unequalSum = splits.reduce((a, s) => a + (parseFloat(s.amount) || 0), 0);
  const unequalRemaining = (totalAmount - unequalSum).toFixed(2);

  const pctSum = splits.reduce((a, s) => a + (parseFloat(s.percentage) || 0), 0);
  const pctRemaining = (100 - pctSum).toFixed(2);

  const totalShares = splits.reduce((a, s) => a + (parseFloat(s.shares) || 0), 0);

  const isValid = () => {
    if (!form.description || !form.amount || parseFloat(form.amount) <= 0) return false;
    if (form.splitType === 'equal') return splits.some((s) => s.included);
    if (form.splitType === 'unequal') return Math.abs(parseFloat(unequalRemaining)) < 0.01;
    if (form.splitType === 'percentage') return Math.abs(parseFloat(pctRemaining)) < 0.01;
    if (form.splitType === 'share') return totalShares > 0;
    return false;
  };

  const buildSplitsPayload = () => {
    if (form.splitType === 'equal') {
      const included = splits.filter((s) => s.included);
      return included.map((s) => ({ userId: s.userId }));
    }
    if (form.splitType === 'unequal') {
      return splits.filter((s) => parseFloat(s.amount) > 0).map((s) => ({ userId: s.userId, amount: s.amount }));
    }
    if (form.splitType === 'percentage') {
      return splits.filter((s) => parseFloat(s.percentage) > 0).map((s) => ({ userId: s.userId, percentage: s.percentage }));
    }
    if (form.splitType === 'share') {
      return splits.filter((s) => parseFloat(s.shares) > 0).map((s) => ({ userId: s.userId, shares: s.shares }));
    }
    return [];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValid()) return setError('Please check all required fields.');
    setLoading(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        splits: buildSplitsPayload(),
        notes: form.notes || undefined,
      };
      if (isEdit) {
        await api.put(`/expenses/${editingExpense.id}`, payload);
      } else {
        await api.post(`/expenses/group/${groupId}`, payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const updateSplit = (idx, field, value) => {
    setSplits((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit expense' : 'Add expense'}</h2>
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input type="text" required placeholder="What was this expense for?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Amount + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
              <input type="number" required min="0.01" step="0.01" placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" max={today}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </div>
          </div>

          {/* Paid by */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid by</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={form.paidById} onChange={(e) => setForm({ ...form, paidById: e.target.value })}>
              {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </div>

          {/* Split type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Split type</label>
            <div className="flex gap-2 flex-wrap">
              {SPLIT_TYPES.map((t) => (
                <button key={t} type="button"
                  onClick={() => setForm({ ...form, splitType: t })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    form.splitType === t ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic split section */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-2">
            {form.splitType === 'equal' && (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {equalCount > 0 ? `₹${equalPer} per person (${equalCount} people)` : 'Select at least one person'}
                </p>
                {splits.map((s, i) => (
                  <label key={s.userId} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={s.included} onChange={(e) => updateSplit(i, 'included', e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                    <span className="text-gray-700">{s.name}</span>
                    {s.included && <span className="ml-auto text-gray-500 text-xs">₹{equalPer}</span>}
                  </label>
                ))}
              </>
            )}

            {form.splitType === 'unequal' && (
              <>
                <div className={`text-xs font-medium mb-2 ${Math.abs(parseFloat(unequalRemaining)) < 0.01 ? 'text-green-600' : 'text-orange-500'}`}>
                  Remaining: ₹{unequalRemaining} of ₹{totalAmount.toFixed(2)}
                </div>
                {splits.map((s, i) => (
                  <div key={s.userId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-24 shrink-0">{s.name}</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={s.amount} onChange={(e) => updateSplit(i, 'amount', e.target.value)} />
                    <span className="text-xs text-gray-400">₹</span>
                  </div>
                ))}
              </>
            )}

            {form.splitType === 'percentage' && (
              <>
                <div className={`text-xs font-medium mb-2 ${Math.abs(parseFloat(pctRemaining)) < 0.01 ? 'text-green-600' : 'text-orange-500'}`}>
                  Remaining: {pctRemaining}% of 100%
                </div>
                {splits.map((s, i) => (
                  <div key={s.userId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-24 shrink-0">{s.name}</span>
                    <input type="number" min="0" max="100" step="0.01" placeholder="0"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={s.percentage} onChange={(e) => updateSplit(i, 'percentage', e.target.value)} />
                    <span className="text-xs text-gray-400">%</span>
                    <span className="text-xs text-gray-500 w-16 text-right">
                      ₹{totalAmount > 0 ? ((parseFloat(s.percentage) || 0) / 100 * totalAmount).toFixed(2) : '0.00'}
                    </span>
                  </div>
                ))}
              </>
            )}

            {form.splitType === 'share' && (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {totalShares > 0 && totalAmount > 0 ? `₹${(totalAmount / totalShares).toFixed(2)} per share` : 'Enter shares'}
                </p>
                {splits.map((s, i) => (
                  <div key={s.userId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-24 shrink-0">{s.name}</span>
                    <input type="number" min="0" step="1" placeholder="1"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={s.shares} onChange={(e) => updateSplit(i, 'shares', e.target.value)} />
                    <span className="text-xs text-gray-400">shares</span>
                    <span className="text-xs text-gray-500 w-16 text-right">
                      {totalShares > 0 && totalAmount > 0
                        ? `₹${((parseFloat(s.shares) || 0) / totalShares * totalAmount).toFixed(2)}`
                        : '₹0.00'}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
            <input type="text" maxLength={255} placeholder="Any extra context..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !isValid()}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg text-sm transition-colors">
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
