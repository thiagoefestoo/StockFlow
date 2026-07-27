const TOKEN_KEY = 'telecomstock_token';
const USER_KEY = 'telecomstock_user';
const LAST_ACTIVITY_KEY = 'telecomstock_last_activity_at';
const SESSION_STARTED_KEY = 'telecomstock_session_started_at';
const HANDOFF_KEY = 'telecomstock_session_handoff';

export const AUTH_SESSION_EXPIRED_EVENT = 'superinfra:session-expired';

const configuredIdleMinutes = Number(process.env.REACT_APP_SESSION_IDLE_MINUTES || 480);
export const AUTH_SESSION_IDLE_MINUTES = Number.isFinite(configuredIdleMinutes)
  ? Math.min(1440, Math.max(30, configuredIdleMinutes))
  : 480;

const IDLE_TIMEOUT_MS = AUTH_SESSION_IDLE_MINUTES * 60 * 1000;
const HANDOFF_TTL_MS = 15000;
const ACTIVITY_WRITE_INTERVAL_MS = 30000;
let lastActivityWriteAt = 0;

function safeSessionStorage() {
  try {
    return window.sessionStorage;
  } catch (_) {
    return null;
  }
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch (_) {
    return null;
  }
}

function tokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() >= Number(payload.exp) * 1000;
}

function removeLegacyPersistentAuth() {
  const storage = safeLocalStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
  storage?.removeItem(LAST_ACTIVITY_KEY);
  storage?.removeItem(SESSION_STARTED_KEY);
}

function consumeSessionHandoff() {
  const local = safeLocalStorage();
  const session = safeSessionStorage();
  if (!local || !session) return false;

  const handoff = parseJson(local.getItem(HANDOFF_KEY));
  local.removeItem(HANDOFF_KEY);

  if (!handoff || Number(handoff.expiresAt || 0) < Date.now()) return false;
  if (!handoff.token || !handoff.user || tokenExpired(handoff.token)) return false;

  session.setItem(TOKEN_KEY, handoff.token);
  session.setItem(USER_KEY, JSON.stringify(handoff.user));
  session.setItem(SESSION_STARTED_KEY, String(Date.now()));
  session.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  return true;
}

export function clearAuthSession() {
  const session = safeSessionStorage();
  const local = safeLocalStorage();

  [TOKEN_KEY, USER_KEY, LAST_ACTIVITY_KEY, SESSION_STARTED_KEY].forEach((key) => {
    session?.removeItem(key);
  });

  local?.removeItem(HANDOFF_KEY);
  removeLegacyPersistentAuth();
  lastActivityWriteAt = 0;
}

export function saveAuthSession(token, user) {
  const session = safeSessionStorage();
  if (!session) throw new Error('O navegador bloqueou o armazenamento seguro da sessão.');

  removeLegacyPersistentAuth();
  session.setItem(TOKEN_KEY, token);
  session.setItem(USER_KEY, JSON.stringify(user));
  session.setItem(SESSION_STARTED_KEY, String(Date.now()));
  session.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  lastActivityWriteAt = Date.now();
}

export function updateAuthSessionUser(user) {
  const session = safeSessionStorage();
  if (!session || !session.getItem(TOKEN_KEY)) return;
  session.setItem(USER_KEY, JSON.stringify(user));
}

export function markAuthSessionActivity(force = false) {
  const session = safeSessionStorage();
  if (!session?.getItem(TOKEN_KEY)) return;

  const now = Date.now();
  if (!force && now - lastActivityWriteAt < ACTIVITY_WRITE_INTERVAL_MS) return;

  session.setItem(LAST_ACTIVITY_KEY, String(now));
  lastActivityWriteAt = now;
}

export function isAuthSessionExpired() {
  const session = safeSessionStorage();
  const token = session?.getItem(TOKEN_KEY);
  const user = parseJson(session?.getItem(USER_KEY));

  if (!token || !user) return true;
  if (tokenExpired(token)) return true;

  const lastActivityAt = Number(session.getItem(LAST_ACTIVITY_KEY) || 0);
  if (!lastActivityAt) return true;

  return Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS;
}

export function getAuthToken() {
  const session = safeSessionStorage();
  const token = session?.getItem(TOKEN_KEY) || '';
  if (!token) return '';

  if (isAuthSessionExpired()) {
    clearAuthSession();
    return '';
  }

  return token;
}

export function initializeAuthSession() {
  removeLegacyPersistentAuth();

  const session = safeSessionStorage();
  let hadSession = !!session?.getItem(TOKEN_KEY) || !!session?.getItem(USER_KEY);

  if (!hadSession) {
    hadSession = consumeSessionHandoff();
  }

  const user = parseJson(session?.getItem(USER_KEY));
  const token = session?.getItem(TOKEN_KEY);

  if (!user || !token) {
    clearAuthSession();
    return { user: null, expired: false };
  }

  if (isAuthSessionExpired()) {
    clearAuthSession();
    return { user: null, expired: true };
  }

  markAuthSessionActivity(true);
  return { user, expired: false };
}

export function prepareAuthSessionHandoff() {
  const session = safeSessionStorage();
  const local = safeLocalStorage();
  if (!session || !local || isAuthSessionExpired()) return false;

  const token = session.getItem(TOKEN_KEY);
  const user = parseJson(session.getItem(USER_KEY));
  if (!token || !user) return false;

  local.setItem(HANDOFF_KEY, JSON.stringify({
    token,
    user,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  }));

  return true;
}
