import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { firstAllowedRoute, userCanAccessModule, userCanAccessPath } from '../config/modulePermissions';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_SESSION_IDLE_MINUTES,
  clearAuthSession,
  initializeAuthSession,
  isAuthSessionExpired,
  markAuthSessionActivity,
  saveAuthSession,
  updateAuthSessionUser,
} from '../utils/authSession';

const AuthContext = createContext(null);
const SESSION_EXPIRED_MESSAGE = `Sua sessão foi encerrada por segurança após ${AUTH_SESSION_IDLE_MINUTES / 60} horas sem atividade. Entre novamente.`;

export function AuthProvider({ children }) {
  const [initialSession] = useState(() => initializeAuthSession());
  const [user, setUser] = useState(initialSession.user);
  const [loading, setLoading] = useState(false);
  const [sessionMessage, setSessionMessage] = useState(
    initialSession.expired ? SESSION_EXPIRED_MESSAGE : ''
  );

  const logout = useCallback((message = '') => {
    clearAuthSession();
    api.clearGetCache?.();
    setUser(null);
    if (message) setSessionMessage(message);
  }, []);

  const expireSession = useCallback((message = SESSION_EXPIRED_MESSAGE) => {
    logout(message);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setSessionMessage('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      saveAuthSession(data.data.token, data.data.user);
      api.clearGetCache?.();
      setUser(data.data.user);
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((nextUser) => {
    updateAuthSessionUser(nextUser);
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    updateUser(data.data.user);
    return data.data.user;
  }, [updateUser]);

  useEffect(() => {
    const handleExpired = (event) => {
      expireSession(event.detail?.message || 'Sua sessão expirou. Entre novamente.');
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
  }, [expireSession]);

  useEffect(() => {
    if (!user) return undefined;

    const checkSession = () => {
      if (isAuthSessionExpired()) {
        expireSession();
        return true;
      }
      return false;
    };

    const registerActivity = () => {
      if (!checkSession()) markAuthSessionActivity();
    };

    const handleReturnToApp = () => {
      if (!checkSession()) markAuthSessionActivity(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleReturnToApp();
    };

    const passiveOptions = { passive: true };
    window.addEventListener('pointerdown', registerActivity, passiveOptions);
    window.addEventListener('keydown', registerActivity);
    window.addEventListener('touchstart', registerActivity, passiveOptions);
    window.addEventListener('scroll', registerActivity, passiveOptions);
    window.addEventListener('focus', handleReturnToApp);
    document.addEventListener('visibilitychange', handleVisibility);

    const intervalId = window.setInterval(checkSession, 60000);

    return () => {
      window.removeEventListener('pointerdown', registerActivity, passiveOptions);
      window.removeEventListener('keydown', registerActivity);
      window.removeEventListener('touchstart', registerActivity, passiveOptions);
      window.removeEventListener('scroll', registerActivity, passiveOptions);
      window.removeEventListener('focus', handleReturnToApp);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [user?.id, expireSession]);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    async function superinfraAutoRefreshPermissions() {
      if (document.visibilityState === 'hidden') return;
      if (isAuthSessionExpired()) {
        expireSession();
        return;
      }

      try {
        const { data } = await api.getCached('/auth/me', {}, 120000);
        if (!cancelled && data?.data?.user) updateUser(data.data.user);
      } catch (error) {
        if (error.response?.status === 401) expireSession('Sua sessão expirou. Entre novamente.');
      }
    }

    superinfraAutoRefreshPermissions();
    const id = setInterval(superinfraAutoRefreshPermissions, 300000);
    window.addEventListener('focus', superinfraAutoRefreshPermissions);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', superinfraAutoRefreshPermissions);
    };
  }, [user?.id, updateUser, expireSession]);

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
    sessionMessage,
    dismissSessionMessage: () => setSessionMessage(''),
    sessionIdleMinutes: AUTH_SESSION_IDLE_MINUTES,
    isAdmin: user?.role === 'admin',
    isSupervisor: ['admin', 'supervisor', 'estoquista'].includes(user?.role),
    isTechnician: user?.role === 'tecnico',
    canAccessModule,
    canAccessPath,
    firstAllowedRoute: () => firstAllowedRoute(user),
  }), [user, loading, login, logout, updateUser, refreshUser, sessionMessage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
