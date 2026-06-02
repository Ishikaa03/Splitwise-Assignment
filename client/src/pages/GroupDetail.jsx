import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import AddExpenseModal from '../components/modals/AddExpenseModal';
import SettleUpModal from '../components/modals/SettleUpModal';

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const fetchAll = async () => {
    try {
      const [gRes, eRes, bRes, pRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/expenses/group/${groupId}`),
        api.get(`/groups/${groupId}/balances`),
        api.get(`/payments/group/${groupId}`),
      ]);
      setGroup(gRes.data.data.group);
      setExpenses(eRes.data.data.expenses);
      setBalances(bRes.data.data.balances);
      setPayments(pRes.data.data.payments);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 403) {
        setError('Group not found or you do not have access.');
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [groupId]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAddMemberError('');
    setAddMemberLoading(true);
    try {
      await api.post(`/groups/${groupId}/members`, { email: addMemberEmail });
      setAddMemberEmail('');
      setShowAddMember(false);
      fetchAll();
    } catch (err) {
      setAddMemberError(err.response?.data?.error || 'Failed to add member');
    } finally { setAddMemberLoading(false); }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await api.delete(`/groups/${groupId}/members/${memberId}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot remove member');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Delete this payment?')) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot delete payment');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense? Balances will update.')) return;
    try {
      await api.delete(`/expenses/${expenseId}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot delete expense');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50"><Navbar />
      <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50"><Navbar />
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-green-600 font-medium hover:underline">Back to dashboard</button>
      </div>
    </div>
  );

  const isAdmin = group?.createdBy === user?.id;
  const myBalances = balances.filter((b) => b.fromUserId === user?.id);
  const owedToMe = balances.filter((b) => b.toUserId === user?.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Group header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{group?.name}</h1>
              {group?.description && <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddExpense(true)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                + Add expense
              </button>
            </div>
          </div>
        </div>

        {/* Balances */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-green-600 font-medium">All balances cleared ✓</p>
          ) : (
            <div className="space-y-2">
              {myBalances.map((b) => (
                <div key={`${b.fromUserId}-${b.toUserId}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">
                    You owe <span className="font-medium">{b.toUserName}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-600">₹{b.amount.toFixed(2)}</span>
                    <button
                      onClick={() => setSettleTarget({ toUserId: b.toUserId, toUserName: b.toUserName, amount: b.amount })}
                      className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-1 rounded-lg transition-colors">
                      Settle up
                    </button>
                  </div>
                </div>
              ))}
              {owedToMe.map((b) => (
                <div key={`${b.fromUserId}-${b.toUserId}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{b.fromUserName}</span> owes you
                  </span>
                  <span className="text-sm font-bold text-green-600">₹{b.amount.toFixed(2)}</span>
                </div>
              ))}
              {balances.filter((b) => b.fromUserId !== user?.id && b.toUserId !== user?.id).map((b) => (
                <div key={`${b.fromUserId}-${b.toUserId}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500">
                    {b.fromUserName} owes {b.toUserName}
                  </span>
                  <span className="text-sm text-gray-600">₹{b.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Members</h2>
            {isAdmin && (
              <button onClick={() => setShowAddMember(!showAddMember)}
                className="text-xs text-green-600 font-medium hover:underline">
                + Add member
              </button>
            )}
          </div>
          {showAddMember && (
            <form onSubmit={handleAddMember} className="mb-3 flex gap-2">
              <input type="email" required placeholder="Email address"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={addMemberEmail} onChange={(e) => setAddMemberEmail(e.target.value)} />
              <button type="submit" disabled={addMemberLoading}
                className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                Add
              </button>
            </form>
          )}
          {addMemberError && <p className="text-sm text-red-600 mb-2">{addMemberError}</p>}
          <div className="flex flex-wrap gap-3">
            {group?.members?.map((m) => (
              <div key={m.userId} className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">
                  {m.user.name[0].toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{m.user.name}</span>
                {m.userId === group.createdBy && <span className="text-xs text-gray-400">(admin)</span>}
                {isAdmin && m.userId !== user?.id && m.userId !== group.createdBy && (
                  <button onClick={() => handleRemoveMember(m.userId)} className="text-gray-300 hover:text-red-400 text-xs ml-1">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Expenses</h2>
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-400">No expenses yet. Add one to get started.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 group">
                  <Link to={`/groups/${groupId}/expenses/${exp.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{exp.description}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize shrink-0">{exp.splitType}</span>
                      {exp.messages?.length > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
                          💬 {exp.messages.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Paid by {exp.paidBy?.name} · {new Date(exp.expenseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-sm font-bold text-gray-800">₹{Number(exp.amount).toFixed(2)}</span>
                    {(exp.createdById === user?.id || isAdmin) && (
                      <button onClick={() => handleDeleteExpense(exp.id)}
                        className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment history */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Payment History</h2>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 group">
                  <div>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{p.payer?.name}</span> paid <span className="font-medium">{p.receiver?.name}</span>
                    </p>
                    {p.note && <p className="text-xs text-gray-400">{p.note}</p>}
                    <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green-600">₹{Number(p.amount).toFixed(2)}</span>
                    {(p.payerId === user?.id || isAdmin) && (
                      <button onClick={() => handleDeletePayment(p.id)}
                        className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddExpense && (
        <AddExpenseModal
          groupId={groupId}
          members={group?.members || []}
          onClose={() => setShowAddExpense(false)}
          onSaved={() => { setShowAddExpense(false); fetchAll(); }}
        />
      )}

      {settleTarget && (
        <SettleUpModal
          groupId={groupId}
          fromUserId={user?.id}
          toUserId={settleTarget.toUserId}
          toUserName={settleTarget.toUserName}
          maxAmount={settleTarget.amount}
          onClose={() => setSettleTarget(null)}
          onSettled={() => { setSettleTarget(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
