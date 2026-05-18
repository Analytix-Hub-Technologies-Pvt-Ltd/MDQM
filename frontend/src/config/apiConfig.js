/** Production FastAPI backend (Render). */
export const PRODUCTION_API_URL = 'https://mdqm-backend.onrender.com';

const LOCAL_API_URL = 'http://127.0.0.1:8000';

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * API base URL for axios (no trailing slash).
 * Set VITE_API_URL in .env.development / .env.production or at build time.
 */
export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_API_URL : LOCAL_API_URL),
);
