import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true
  // No blanket Content-Type: axios sets it when there is a body, and sending
  // it on a bodyless request makes strict servers reject the request.
});

let accessToken: string | null = localStorage.getItem('accessToken');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('accessToken', token);
  else localStorage.removeItem('accessToken');
  listeners.forEach((fn) => fn(token));
}

export function getAccessToken() {
  return accessToken;
}

const listeners = new Set<(token: string | null) => void>();
export function onTokenChange(fn: (token: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * A single in-flight refresh shared by every 401.
 *
 * Without this, a screen that fires five requests at once triggers five
 * parallel refreshes — and because the server rotates refresh tokens and
 * treats reuse as theft, four of them would be replays and the member would
 * be signed out of every device.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= axios
    .post('/api/auth/refresh', {}, { withCredentials: true })
    .then((res) => {
      const token = res.data.accessToken as string;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const isRefreshCall = original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionLost?.();
      }
    }

    return Promise.reject(error);
  }
);

/** Pulls the human-readable message the API sends, with a sensible fallback. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string })?.error ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export { refreshAccessToken };
export default api;
