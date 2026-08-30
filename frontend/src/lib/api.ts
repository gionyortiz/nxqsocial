import axios from 'axios';

export const api = axios.create({
  // Keep local browser traffic same-origin. next.config.ts proxies /api to the
  // local Nest backend in development, avoiding CORS and localhost/IPv6
  // collisions with unrelated services.
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '/api',
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
      const publicPaths = ['/login', '/register', '/verify-email', '/', '/terms', '/privacy', '/community-guidelines', '/forgot-password', '/reset-password'];
      if (!publicPaths.includes(path)) {
        window.location.replace(new URL('/login', window.location.origin).toString());
      }
    }
    return Promise.reject(err);
  },
);
