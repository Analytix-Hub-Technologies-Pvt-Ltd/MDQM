/** Canonical module names for grouping OpenAPI endpoints. */
export const API_MODULES = [
  "Governance",
  "Data Quality",
  "Glossary",
  "Users",
  "Authentication",
  "Stewardship",
  "Lineage",
  "Monitoring",
  "Alerts",
  "Administration",
];

const MODULE_RULES = [
  {
    module: "Authentication",
    tags: ["auth"],
    paths: ["/auth"],
    keywords: ["login", "token", "invite", "password"],
  },
  {
    module: "Users",
    tags: ["admin", "access", "platform-admin"],
    paths: ["/admin", "/access-request", "/api/platform-admin"],
    keywords: ["user", "role", "access request", "invite"],
  },
  {
    module: "Governance",
    tags: ["governance"],
    paths: ["/api/governance", "/governance"],
    keywords: ["governance", "policy", "catalog"],
  },
  {
    module: "Data Quality",
    tags: ["jobs", "rules", "quarantine", "validation", "tables", "files", "schedules"],
    paths: ["/jobs", "/rules", "/quarantine", "/tables", "/files", "/schedules", "/schedule-job", "/validation"],
    keywords: ["job", "rule", "quarantine", "validation", "dataset", "table", "schedule"],
  },
  {
    module: "Glossary",
    tags: ["glossary", "master-data"],
    paths: ["/glossary", "/api/glossary", "/master-data"],
    keywords: ["glossary", "term", "definition", "master data"],
  },
  {
    module: "Stewardship",
    tags: ["stewardship"],
    paths: ["/api/stewardship", "/stewardship"],
    keywords: ["steward", "remediation", "assignment"],
  },
  {
    module: "Lineage",
    tags: ["lineage"],
    paths: ["/api/lineage", "/lineage"],
    keywords: ["lineage", "graph", "dependency"],
  },
  {
    module: "Alerts",
    tags: ["alerts", "notifications"],
    paths: ["/api/enterprise/notifications", "/alerts"],
    keywords: ["alert", "notification"],
  },
  {
    module: "Monitoring",
    tags: ["enterprise", "monitoring", "dashboard"],
    paths: ["/api/enterprise/monitoring", "/health", "/dashboard", "/api/dashboard"],
    keywords: ["monitor", "health", "metric", "log", "dashboard"],
  },
  {
    module: "Administration",
    tags: ["audit", "compliance", "reports"],
    paths: ["/api/audit", "/api/compliance", "/api/reports", "/db"],
    keywords: ["audit", "compliance", "report", "connection"],
  },
];

function matchesPath(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function matchesKeyword(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Resolve a single endpoint to one of the canonical API modules.
 */
export function resolveEndpointModule(endpoint) {
  const path = endpoint.path || "";
  const tags = (endpoint.tags || []).map((t) => String(t).toLowerCase());
  const text = [endpoint.summary, endpoint.description, endpoint.operationId, path].join(" ");

  for (const rule of MODULE_RULES) {
    if (rule.tags.some((t) => tags.includes(t))) return rule.module;
    if (matchesPath(path, rule.paths)) return rule.module;
    if (matchesKeyword(text, rule.keywords)) return rule.module;
  }

  return "Administration";
}

/**
 * Group endpoints by module and return sorted module map.
 */
export function groupEndpointsByModule(endpoints = []) {
  const grouped = Object.fromEntries(API_MODULES.map((m) => [m, []]));

  for (const endpoint of endpoints) {
    const module = resolveEndpointModule(endpoint);
    grouped[module].push({ ...endpoint, module });
  }

  for (const module of API_MODULES) {
    grouped[module].sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      return pathCmp !== 0 ? pathCmp : a.method.localeCompare(b.method);
    });
  }

  return grouped;
}
