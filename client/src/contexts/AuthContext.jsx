import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => setUser(res.data.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const channel = new BroadcastChannel('auth');
    channel.onmessage = (e) => {
      if (e.data === 'logout') window.location.href = '/login';
    };
    return () => channel.close();
  }, []);

  const login = (userData) => setUser(userData);

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    new BroadcastChannel('auth').postMessage('logout');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
