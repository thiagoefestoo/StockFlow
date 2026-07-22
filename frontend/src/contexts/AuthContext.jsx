import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { firstAllowedRoute, userCanAccessModule, userCanAccessPath } from '../config/modulePermissions';

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


  useEffect(() => {
    const token = localStorage.getItem('telecomstock_token');
    if (!token || !user) return undefined;

    let cancelled = false;

    async function superinfraAutoRefreshPermissions() {
      try {
        const { data } = await api.get('/auth/me');
        if (!cancelled && data?.data?.user) {
          updateUser(data.data.user);
        }
      } catch (error) {
        if (error.response?.status === 401) logout();
      }
    }

    superinfraAutoRefreshPermissions();
    const id = setInterval(superinfraAutoRefreshPermissions, 60000);
    window.addEventListener('focus', superinfraAutoRefreshPermissions);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', superinfraAutoRefreshPermissions);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function canAccessModule(moduleKey) {
    return userCanAccessModule(user, moduleKey);
  }

  function canAccessPath(pathname) {
    return userCanAccessPath(user, pathname);
  }

  const value = useMemo(() => ({
    user,
    login,
    logout,
    updateUser,
    refreshUser,
    loading,
    isAdmin: user?.role === 'admin',
    isSupervisor: ['admin', 'supervisor', 'estoquista'].includes(user?.role),
    isTechnician: user?.role === 'tecnico',
    canAccessModule,
    canAccessPath,
    firstAllowedRoute: () => firstAllowedRoute(user),
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
