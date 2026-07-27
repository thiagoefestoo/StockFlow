import axios from 'axios';
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession, getAuthToken } from '../utils/authSession';

function normalizeApiUrl(value) {
  const isProduction = process.env.NODE_ENV === 'production';
  const useDirectApi = String(process.env.REACT_APP_API_MODE || '').toLowerCase() === 'direct';

  // Em produção, o navegador usa /api no mesmo domínio da Vercel. A Vercel encaminha
  // a requisição ao Render, eliminando dependência de CORS e melhorando a estabilidade.
  if (isProduction && !useDirectApi) return '/api';

  const fallback = isProduction
    ? 'https://stockflow-backend-6gxl.onrender.com/api'
    : 'http://localhost:3000/api';
  const raw = String(value || fallback || '/api').trim();
  return raw.replace(/\/$/, '');
}


function normalizeDirectApiUrl(value) {
  const raw = String(value || 'https://stockflow-backend-6gxl.onrender.com/api').trim();
  return raw.replace(/\/$/, '');
}

function estimatedPayloadBytes(payload) {
  if (payload === undefined || payload === null) return 0;
  try {
    if (typeof payload === 'string') return new Blob([payload]).size;
    return new Blob([JSON.stringify(payload)]).size;
  } catch (_) {
    return 0;
  }
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
const directApiURL = normalizeDirectApiUrl(process.env.REACT_APP_API_URL);

if (
  process.env.NODE_ENV === 'production' &&
  String(process.env.REACT_APP_API_MODE || '').toLowerCase() === 'direct' &&
  !process.env.REACT_APP_API_URL
) {
  // eslint-disable-next-line no-console
  console.warn('REACT_APP_API_MODE=direct exige REACT_APP_API_URL com a URL do backend.');
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
  const method = String(config.method || 'get').toLowerCase();
  config.__hadAuthToken = !!token;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Requisições comuns usam o proxy /api da Vercel, evitando CORS. Documentos grandes
  // seguem diretamente ao Render para não depender do limite de corpo do proxy.
  if (
    process.env.NODE_ENV === 'production' &&
    baseURL === '/api' &&
    method !== 'get' &&
    estimatedPayloadBytes(config.data) > 3 * 1024 * 1024
  ) {
    config.baseURL = directApiURL;
  }

  if (method !== 'get') api.clearGetCache();
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
export { baseURL as API_BASE_URL, directApiURL as DIRECT_API_BASE_URL };
