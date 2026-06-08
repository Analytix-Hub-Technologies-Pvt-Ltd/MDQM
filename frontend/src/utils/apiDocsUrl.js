import { API_BASE_URL } from "@/config/apiConfig";

/**
 * Build absolute URL for Swagger UI, ReDoc, or OpenAPI JSON.
 * In dev with Vite proxy, API_BASE_URL is empty → same-origin relative paths work.
 */
export function getApiDocsUrl(path = "/docs") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalized}`;
  }
  return normalized;
}

export const SWAGGER_DOCS_URL = getApiDocsUrl("/docs");
export const OPENAPI_JSON_URL = getApiDocsUrl("/openapi.json");
export const REDOC_URL = getApiDocsUrl("/redoc");
