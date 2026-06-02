import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <Link to="/dashboard" className="text-lg font-bold text-green-600">SplitWise</Link>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 font-medium">{user?.name}</span>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
