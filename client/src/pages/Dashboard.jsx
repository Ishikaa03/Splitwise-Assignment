import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import CreateGroupModal from '../components/modals/CreateGroupModal';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState({ owe: 0, owed: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      const gs = res.data.data.groups;
      setGroups(gs);

      let totalOwe = 0, totalOwed = 0;
      await Promise.all(gs.map(async (g) => {
        try {
          const bRes = await api.get(`/groups/${g.id}/balances`);
          for (const b of bRes.data.data.balances) {
            if (b.fromUserId === user.id) totalOwe += b.amount;
            if (b.toUserId === user.id) totalOwed += b.amount;
          }
        } catch {}
      }));
      setBalanceSummary({ owe: totalOwe, owed: totalOwed });
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGroups(); }, []);

  const net = balanceSummary.owed - balanceSummary.owe;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Balance summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">You owe</p>
            <p className="text-xl font-bold text-red-600">₹{balanceSummary.owe.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">You are owed</p>
            <p className="text-xl font-bold text-green-600">₹{balanceSummary.owed.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Net balance</p>
            <p className={`text-xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {net >= 0 ? '+' : ''}₹{Math.abs(net).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Groups */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">My Groups</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Create group
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 text-sm">No groups yet.</p>
            <p className="text-gray-400 text-xs mt-1">Create one to start splitting expenses.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/groups/${g.id}`)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-green-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{g.name}</p>
                    {g.description && <p className="text-xs text-gray-400 mt-0.5">{g.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{g.members?.length || 0} members</p>
                  </div>
                  <span className="text-gray-300 text-lg">→</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchGroups(); }}
        />
      )}
    </div>
  );
}
