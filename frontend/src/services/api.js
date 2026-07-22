import axios from 'axios';

function normalizeApiUrl(value) {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://stockflow-backend-6gxl.onrender.com/api' : 'http://localhost:3000/api';
  const raw = (value || fallback || '/api').trim();
  return raw.replace(/\/$/, '');
}


function isQuantityField(key) {
  const normalized = String(key || '').toLowerCase();
  return (
    normalized === 'qtd' ||
    normalized === 'totalitems' ||
    normalized === 'totalquantity' ||
    normalized === 'approvedquantity' ||
    normalized === 'requestedquantity' ||
    normalized === 'availablequantity' ||
    normalized.includes('quantity')
  );
}

function normalizeQuantityValue(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : value;
  if (typeof value !== 'string') return value;

  const raw = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return value;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : value;
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('telecomstock_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    response.data = normalizeQuantityPayload(response.data);
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('telecomstock_token');
      localStorage.removeItem('telecomstock_user');
    }
    if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent('superinfra:permission-denied', { detail: error.response?.data }));
    }
    return Promise.reject(error);
  }
);

export default api;
export { baseURL as API_BASE_URL };
