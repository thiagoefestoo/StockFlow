import React, { createContext, useContext, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('telecomstock_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  async function login(email, password) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('telecomstock_token', data.data.token);
      localStorage.setItem('telecomstock_user', JSON.stringify(data.data.user));
      setUser(data.data.user);
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }

  function updateUser(nextUser) {
    localStorage.setItem('telecomstock_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  async function refreshUser() {
    const { data } = await api.get('/auth/me');
    updateUser(data.data.user);
    return data.data.user;
  }

  function logout() {
    localStorage.removeItem('telecomstock_token');
    localStorage.removeItem('telecomstock_user');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout, updateUser, refreshUser, loading, isAdmin: user?.role === 'admin', isSupervisor: ['admin', 'supervisor'].includes(user?.role), isTechnician: user?.role === 'tecnico' }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
