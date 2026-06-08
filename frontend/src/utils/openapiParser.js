import { resolveEndpointModule } from "./moduleMapper";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function isSecuredOperation(operation, schema) {
  if (Array.isArray(operation?.security)) {
    if (operation.security.length === 0) return false;
    return true;
  }
  return Array.isArray(schema?.security) && schema.security.length > 0;
}

/**
 * Parse an OpenAPI 3.x schema into a normalized endpoint list.
 */
export function parseOpenApiSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return { info: {}, endpoints: [], raw: null };
  }

  const endpoints = [];
  const paths = schema.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !operation || typeof operation !== "object") continue;

      const tags = Array.isArray(operation.tags) ? operation.tags : [];
      const summary = operation.summary || "";
      const description = operation.description || "";
      const operationId = operation.operationId || null;

      const endpoint = {
        id: `${method.toUpperCase()}:${path}`,
        operationId,
        name: operationId || summary || `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        tags,
        summary,
        description,
        secured: isSecuredOperation(operation, schema),
        deprecated: Boolean(operation.deprecated),
        module: null,
      };

      endpoint.module = resolveEndpointModule(endpoint);
      endpoints.push(endpoint);
    }
  }

  endpoints.sort((a, b) => {
    const mod = a.module.localeCompare(b.module);
    if (mod !== 0) return mod;
    const pathCmp = a.path.localeCompare(b.path);
    return pathCmp !== 0 ? pathCmp : a.method.localeCompare(b.method);
  });

  return {
    info: {
      title: schema.info?.title || "API",
      version: schema.info?.version || "—",
      description: schema.info?.description || "",
    },
    endpoints,
    raw: schema,
  };
}

/**
 * Compute developer metrics from parsed endpoints.
 */
export function computeDeveloperMetrics(endpoints = []) {
  const total = endpoints.length;
  const getCount = endpoints.filter((e) => e.method === "GET").length;
  const postCount = endpoints.filter((e) => e.method === "POST").length;
  const securedCount = endpoints.filter((e) => e.secured).length;

  const byModule = {};
  for (const ep of endpoints) {
    byModule[ep.module] = (byModule[ep.module] || 0) + 1;
  }

  return { total, getCount, postCount, securedCount, byModule };
}
