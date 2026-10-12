import axios from 'axios';

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  if (!import.meta.env.PROD) {
    return 'http://localhost:5000/api';
  }
  console.warn('PayPost: VITE_API_URL is not set in production. REST API requests may fail.');
  return '';
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      // In a real app we might redirect to /login here, but we let AuthContext handle state
    }
    return Promise.reject(error);
  }
);

export default api;
