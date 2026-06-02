/** Production FastAPI backend (Render). */
export const PRODUCTION_API_URL = 'https://mdqm-backend.onrender.com';

const LOCAL_API_URL = 'http://127.0.0.1:8000';

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * API base URL for axios (no trailing slash).
 * Dev default: empty string → same origin as Vite (localhost:5173) + proxy in vite.config.js (no CORS).
 * Override with VITE_API_URL=http://127.0.0.1:8000 to call the API directly.
 */
export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : import.meta.env.PROD
      ? PRODUCTION_API_URL
      : '',
);
