import axios from 'axios';

function normalizeApiUrl(value) {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://stockflow-backend-6gxl.onrender.com/api' : 'http://localhost:3000/api';
  const raw = (value || fallback || '/api').trim();
  return raw.replace(/\/$/, '');
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
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('telecomstock_token');
      localStorage.removeItem('telecomstock_user');
    }
    return Promise.reject(error);
  }
);

export default api;
export { baseURL as API_BASE_URL };
