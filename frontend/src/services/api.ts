import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
};

api.interceptors.request.use((config) => {
  // Don't send token on login/refresh — an expired token would cause 401
  const isAuthEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh');
  if (!isAuthEndpoint) {
    const token = localStorage.getItem('bk_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't intercept login or refresh requests
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      const refreshToken = localStorage.getItem('bk_refreshToken');

      if (!refreshToken) {
        localStorage.removeItem('bk_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (res.data.success) {
          const newToken = res.data.data.token;
          const newRefresh = res.data.data.refreshToken;
          localStorage.setItem('bk_token', newToken);
          localStorage.setItem('bk_refreshToken', newRefresh);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch {
        processQueue(error, null);
        localStorage.removeItem('bk_token');
        localStorage.removeItem('bk_refreshToken');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('bk_token');
      localStorage.removeItem('bk_refreshToken');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
