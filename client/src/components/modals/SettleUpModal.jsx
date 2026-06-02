import { useState } from 'react';
import api from '../../lib/axios';

export default function SettleUpModal({ groupId, fromUserId, toUserId, toUserName, maxAmount, onClose, onSettled }) {
  const [amount, setAmount] = useState(String(maxAmount));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const parsed = parseFloat(amount) || 0;
  const remaining = Math.round((maxAmount - parsed) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (parsed <= 0) return setError('Amount must be greater than 0');
    if (parsed > maxAmount + 0.01) return setError(`Cannot pay more than ₹${maxAmount}`);
    setError('');
    setLoading(true);
    try {
      await api.post('/payments', {
        groupId,
        payerId: fromUserId,
        receiverId: toUserId,
        amount: parsed,
        note: note || undefined,
      });
      onSettled();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Settle up</h2>
        <p className="text-sm text-gray-500 mb-4">Paying {toUserName}</p>
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
            <input type="number" required min="0.01" step="0.01" max={maxAmount}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            {remaining > 0.01 && (
              <p className="text-xs text-orange-500 mt-1">Remaining after this: ₹{remaining.toFixed(2)}</p>
            )}
            {remaining <= 0.01 && parsed > 0 && (
              <p className="text-xs text-green-600 mt-1">This will fully settle your balance ✓</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400">(optional)</span></label>
            <input type="text" maxLength={255} placeholder="e.g. Cash payment"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || parsed <= 0}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 rounded-lg text-sm transition-colors">
              {loading ? 'Recording…' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
