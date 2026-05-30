import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      // Stale/expired token: clear saved session so background polls stop failing.
      localStorage.removeItem('access_token');
      localStorage.removeItem('nxqsocial-auth');
      const path = window.location.pathname;
      // Only bounce to login from protected pages, and never loop on public pages.
      const publicPaths = ['/login', '/register', '/', '/terms', '/privacy', '/community-guidelines'];
      if (!publicPaths.includes(path)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);
