import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import Navbar from '../components/Navbar';
import AddExpenseModal from '../components/modals/AddExpenseModal';

const SPLIT_LABEL = { equal: 'Equal', unequal: 'Unequal', percentage: 'Percentage', share: 'Shares' };

export default function ExpenseDetail() {
  const { groupId, expenseId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [expense, setExpense] = useState(null);
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const chatBottomRef = useRef(null);

  const fetchData = async () => {
    try {
      const [eRes, mRes] = await Promise.all([
        api.get(`/expenses/${expenseId}`),
        api.get(`/messages/expense/${expenseId}`),
      ]);
      setExpense(eRes.data.data.expense);
      setMessages(mRes.data.data.messages);

      const gRes = await api.get(`/groups/${eRes.data.data.expense.groupId}`);
      setGroup(gRes.data.data.group);
    } catch (err) {
      setError('Expense not found.');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [expenseId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_expense', { expenseId });
    socket.on('new_message', (msg) => setMessages((prev) => [...prev, msg]));
    return () => {
      socket.emit('leave_expense', { expenseId });
      socket.off('new_message');
    };
  }, [socket, expenseId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!msgInput.trim() || !socket) return;
    socket.emit('send_message', { expenseId, content: msgInput.trim() });
    setMsgInput('');
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this expense?')) return;
    await api.delete(`/expenses/${expenseId}`);
    navigate(`/groups/${groupId}`);
  };

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="text-center py-20 text-gray-400">Loading…</div></div>;
  if (error) return (
    <div className="min-h-screen bg-gray-50"><Navbar />
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={() => navigate(`/groups/${groupId}`)} className="text-green-600 font-medium hover:underline">Back to group</button>
      </div>
    </div>
  );

  const isAdmin = group?.createdBy === user?.id;
  const canEdit = expense?.createdById === user?.id || isAdmin;

  const getSplitDetail = (split) => {
    if (!expense) return '';
    const total = Number(expense.amount);
    if (expense.splitType === 'equal') {
      const count = expense.splits?.length || 1;
      return `1/${count}`;
    }
    if (expense.splitType === 'percentage') {
      return `${((Number(split.amountOwed) / total) * 100).toFixed(1)}%`;
    }
    if (expense.splitType === 'share') {
      return 'shares';
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Back link */}
        <button onClick={() => navigate(`/groups/${groupId}`)} className="text-sm text-green-600 hover:underline">← Back to group</button>

        {/* Expense header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{expense?.description}</h1>
              <p className="text-2xl font-bold text-gray-800 mt-1">₹{Number(expense?.amount).toFixed(2)}</p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => setShowEdit(true)} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">Edit</button>
                <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-3 py-1.5 rounded-lg transition-colors">Delete</button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-gray-500">
            <span className="bg-green-50 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
              Paid by {expense?.paidBy?.name}
            </span>
            <span className="bg-gray-100 text-gray-500 text-xs font-medium px-2 py-1 rounded-full capitalize">
              {SPLIT_LABEL[expense?.splitType] || expense?.splitType}
            </span>
            <span className="text-xs text-gray-400 py-1">
              {new Date(expense?.expenseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {expense?.notes && <p className="mt-3 text-sm text-gray-500 italic">{expense.notes}</p>}

          {/* Split breakdown */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Split breakdown</h3>
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Member</th>
                    {expense?.splitType !== 'unequal' && (
                      <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Split</th>
                    )}
                    <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expense?.splits?.map((s) => {
                    const isPayer = s.userId === expense.paidById;
                    const detail = getSplitDetail(s);
                    return (
                      <tr key={s.userId} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {s.user?.name?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-gray-700">{s.user?.name}</span>
                            {isPayer && <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded-full">Paid</span>}
                          </div>
                        </td>
                        {expense?.splitType !== 'unequal' && (
                          <td className="px-3 py-2 text-center text-xs text-gray-400">{detail}</td>
                        )}
                        <td className="px-3 py-2 text-right font-medium text-gray-800">₹{Number(s.amountOwed).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Chat</h3>
          <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-400">No messages yet. Start the conversation.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.type === 'system' ? 'text-center' : ''}>
                  {m.type === 'system' ? (
                    <span className="text-xs text-gray-400 italic">{m.content}</span>
                  ) : (
                    <div className={`flex gap-2 ${m.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {(m.userName || m.user?.name || '?')[0].toUpperCase()}
                      </div>
                      <div className={`max-w-xs ${m.userId === user?.id ? 'items-end' : 'items-start'} flex flex-col`}>
                        <span className="text-xs text-gray-400 mb-0.5">{m.userName || m.user?.name}</span>
                        <div className={`px-3 py-2 rounded-2xl text-sm ${m.userId === user?.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text" placeholder="Send a message…"
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={msgInput} onChange={(e) => setMsgInput(e.target.value)} />
            <button type="submit" disabled={!msgInput.trim() || !socket}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
              Send
            </button>
          </form>
        </div>
      </div>

      {showEdit && expense && (
        <AddExpenseModal
          groupId={groupId}
          members={group?.members || []}
          editingExpense={expense}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); fetchData(); }}
        />
      )}
    </div>
  );
}
