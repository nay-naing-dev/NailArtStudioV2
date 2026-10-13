import axios from 'axios';

const TOKEN_KEY = 'nail_studio_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) */
    }
  },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Human-readable message from an API error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data?.error;
  if (data?.details?.length) return `${data.message}: ${data.details.map((d) => d.message).join(', ')}`;
  return data?.message || err?.message || fallback;
}

// ---------- endpoints ----------

export const authApi = {
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
};

export const designsApi = {
  list: (params) => api.get('/designs', { params }).then((r) => r.data),
  get: (id) => api.get(`/designs/${id}`).then((r) => r.data.design),
  create: (formData) => api.post('/designs', formData).then((r) => r.data.design),
  update: (id, data) => api.patch(`/designs/${id}`, data).then((r) => r.data.design),
  reprocess: (id, skinTolerance) => api.post(`/designs/${id}/reprocess`, { skinTolerance }).then((r) => r.data.design),
  archive: (id) => api.delete(`/designs/${id}`).then((r) => r.data.design),
};

export const artistsApi = {
  list: () => api.get('/artists').then((r) => r.data),
};

export const appointmentsApi = {
  availability: (date) => api.get('/appointments/availability', { params: { date } }).then((r) => r.data),
  create: (body) => api.post('/appointments', body).then((r) => r.data.appointment),
  mine: () => api.get('/appointments/mine').then((r) => r.data.items),
  cancel: (id) => api.patch(`/appointments/${id}/cancel`).then((r) => r.data.appointment),
  list: (params) => api.get('/appointments', { params }).then((r) => r.data),
  stats: () => api.get('/appointments/stats').then((r) => r.data),
  updateStatus: (id, body) => api.patch(`/appointments/${id}/status`, body).then((r) => r.data.appointment),
};

export const tryonApi = {
  config: () => api.get('/tryon/config').then((r) => r.data),
  create: (formData) => api.post('/tryon', formData).then((r) => r.data.tryOn),
  get: (id) => api.get(`/tryon/${id}`).then((r) => r.data.tryOn),
};
