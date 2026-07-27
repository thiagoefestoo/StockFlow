import api from '../services/api';

export function biErrorMessage(error, fallback = 'Não foi possível carregar o BI.') {
  if (error?.code === 'ERR_CANCELED') return '';
  if (error?.code === 'ECONNABORTED') return 'O servidor demorou mais que o esperado. Tente atualizar novamente.';
  if (error?.code === 'ERR_NETWORK') return 'Não foi possível conectar ao servidor. Confirme se o backend do Render está online e tente novamente.';
  return error?.response?.data?.message || error?.message || fallback;
}

export async function requestBi(path, filters, { force = false, timeout = 60000, ttlMs = 15000 } = {}) {
  if (force) api.clearGetCache(path);
  return api.getCached(path, { params: filters, timeout }, ttlMs);
}
