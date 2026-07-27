import axios from 'axios';
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession, getAuthToken } from '../utils/authSession';

function normalizeApiUrl(value) {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://stockflow-backend-6gxl.onrender.com/api' : 'http://localhost:3000/api';
  const raw = (value || fallback || '/api').trim();
  return raw.replace(/\/$/, '');
}


function isQuantityField(key) {
  const normalized = String(key || '').toLowerCase();
  const exactQuantityKeys = new Set([
    'qtd',
    'totalitems',
    'totalquantity',
    'approvedquantity',
    'requestedquantity',
    'availablequantity',
    'mainstock',
    'technicianstock',
    'installedstock',
    'availableqty',
    'assetscount',
    'consumablelines',
  ]);

  return exactQuantityKeys.has(normalized) || normalized.includes('quantity');
}

function normalizeQuantityValue(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : value;
  if (typeof value !== 'string') return value;

  const raw = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return value;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : value;
}

function normalizeQuantityPayload(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeQuantityPayload);
  if (!payload || typeof payload !== 'object') return payload;

  const next = { ...payload };
  for (const [key, value] of Object.entries(next)) {
    if (isQuantityField(key)) next[key] = normalizeQuantityValue(value);
    else next[key] = normalizeQuantityPayload(value);
  }
  return next;
}

const baseURL = normalizeApiUrl(process.env.REACT_APP_API_URL);

if (process.env.NODE_ENV === 'production' && !process.env.REACT_APP_API_URL) {
  // eslint-disable-next-line no-console
  console.warn('REACT_APP_API_URL não foi configurada. Configure a URL do backend do Render na Vercel.');
}

const api = axios.create({
  baseURL,
  timeout: 30000,
});

// Cache curto e deduplicação de GETs idênticos. Isso evita que componentes globais
// (menu, sino, pulso e permissões) consultem o banco várias vezes para o mesmo dado.
const getCache = new Map();
const getInFlight = new Map();

function stableSerialize(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return String(value);
}

function getCacheKey(url, config = {}) {
  return `${url}|${stableSerialize(config.params || {})}`;
}

api.getCached = function getCached(url, config = {}, ttlMs = 30000) {
  const key = getCacheKey(url, config);
  const now = Date.now();
  const cached = getCache.get(key);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.response);
  if (getInFlight.has(key)) return getInFlight.get(key);

  const request = api.get(url, config)
    .then((response) => {
      getCache.set(key, { response, expiresAt: Date.now() + Math.max(0, Number(ttlMs || 0)) });
      return response;
    })
    .finally(() => getInFlight.delete(key));

  getInFlight.set(key, request);
  return request;
};

api.clearGetCache = function clearGetCache(prefix = '') {
  for (const key of getCache.keys()) {
    if (!prefix || key.startsWith(prefix)) getCache.delete(key);
  }
};

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  config.__hadAuthToken = !!token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (String(config.method || 'get').toLowerCase() !== 'get') api.clearGetCache();
  return config;
});

api.interceptors.response.use(
  (response) => {
    response.data = normalizeQuantityPayload(response.data);
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && error.config?.__hadAuthToken) {
      clearAuthSession();
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT, {
        detail: { message: 'Sua sessão expirou. Entre novamente.' },
      }));
    }
    if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent('superinfra:permission-denied', { detail: error.response?.data }));
    }
    return Promise.reject(error);
  }
);

export default api;
export { baseURL as API_BASE_URL };
