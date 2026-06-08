import { apiClient } from "@/api";
import { parseOpenApiSchema } from "@/utils/openapiParser";
import { OPENAPI_JSON_URL } from "@/utils/apiDocsUrl";

const MOCK_DATABASE_STATUS = {
  connected: true,
  databaseType: "PostgreSQL",
  host: "localhost",
  lastHealthCheck: new Date().toISOString(),
  connectionPool: "active",
  source: "mock",
};

const MOCK_SYSTEM_INFO = {
  environment: import.meta.env.MODE || "development",
  version: import.meta.env.VITE_APP_VERSION || "1.0.0",
};

/**
 * Fetch and parse the OpenAPI schema from the backend.
 */
export async function fetchOpenApiSchema() {
  const response = await apiClient.get(OPENAPI_JSON_URL, {
    headers: { Accept: "application/json" },
  });
  return parseOpenApiSchema(response.data);
}

/**
 * Check basic backend health (public /health endpoint).
 */
export async function fetchBackendHealth() {
  const response = await apiClient.get("/health");
  return {
    status: response.data?.status || "unknown",
    reachable: true,
    timestamp: new Date().toISOString(),
    data: response.data,
  };
}

/**
 * Fetch enterprise monitoring health (authenticated).
 */
export async function fetchMonitoringHealth() {
  const response = await apiClient.get("/api/enterprise/monitoring/health");
  return response.data;
}

/**
 * Probe database connectivity via a lightweight authenticated endpoint.
 * Falls back to mock data when unavailable.
 */
export async function fetchDatabaseStatus() {
  const checkedAt = new Date().toISOString();
  try {
    const response = await apiClient.get("/db/connections", { timeout: 8000 });
    const connections = Array.isArray(response.data) ? response.data : response.data?.items || [];
    return {
      connected: true,
      databaseType: "PostgreSQL",
      lastHealthCheck: checkedAt,
      connectionCount: connections.length,
      source: "live",
      message: "Database connection pool is responding.",
    };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return {
        ...MOCK_DATABASE_STATUS,
        lastHealthCheck: checkedAt,
        source: "estimated",
        message: "Authenticated DB probe unavailable; showing estimated status.",
      };
    }
    return {
      connected: false,
      databaseType: "PostgreSQL",
      lastHealthCheck: checkedAt,
      source: "error",
      message: error?.response?.data?.detail || error?.message || "Database health check failed.",
    };
  }
}

/**
 * Aggregate system health from multiple probes.
 */
export async function fetchSystemHealth() {
  const checkedAt = new Date().toISOString();
  let backend = { status: "unknown", reachable: false };
  let monitoring = null;
  let openapiReachable = false;

  try {
    backend = await fetchBackendHealth();
  } catch {
    backend = { status: "down", reachable: false, timestamp: checkedAt };
  }

  try {
    monitoring = await fetchMonitoringHealth();
  } catch {
    monitoring = null;
  }

  try {
    await apiClient.head(OPENAPI_JSON_URL, { timeout: 5000 });
    openapiReachable = true;
  } catch {
    try {
      await apiClient.get(OPENAPI_JSON_URL, { timeout: 5000 });
      openapiReachable = true;
    } catch {
      openapiReachable = false;
    }
  }

  return {
    backend,
    monitoring,
    openapiReachable,
    environment: MOCK_SYSTEM_INFO.environment,
    version: MOCK_SYSTEM_INFO.version,
    checkedAt,
  };
}
