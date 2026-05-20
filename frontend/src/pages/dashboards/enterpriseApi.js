import { apiClient } from "../../api";

/** Standard paginated list shape from /api/enterprise/* */
function unwrapList(res) {
  const d = res?.data ?? res;
  return { items: d.items ?? [], total: d.total ?? 0, page: d.page ?? 1, page_size: d.page_size ?? 20 };
}

export async function enterpriseSchedulerHistory(params) {
  const res = await apiClient.get("/api/enterprise/scheduler/history", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseSchedulerSchedules(params) {
  const res = await apiClient.get("/api/enterprise/scheduler/schedules", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseSchedulerCreate(body) {
  return apiClient.post("/api/enterprise/scheduler/create", body);
}

export async function enterpriseSchedulerPause(body) {
  return apiClient.post("/api/enterprise/scheduler/pause", body);
}

export async function enterpriseSchedulerResume(body) {
  return apiClient.post("/api/enterprise/scheduler/resume", body);
}

export async function enterpriseMonitoringHealth() {
  return apiClient.get("/api/enterprise/monitoring/health");
}

export async function enterpriseMonitoringLogs(params) {
  const res = await apiClient.get("/api/enterprise/monitoring/logs", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseMonitoringMetrics() {
  return apiClient.get("/api/enterprise/monitoring/metrics");
}

export async function enterpriseValidationRun(body) {
  return apiClient.post("/api/enterprise/validation/run", body);
}

export async function enterpriseValidationResults(params) {
  const res = await apiClient.get("/api/enterprise/validation/results", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseQuarantineRecords(params) {
  const res = await apiClient.get("/api/enterprise/quarantine/records", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseRefreshQuarantine() {
  return apiClient.post("/api/enterprise/quarantine/refresh-summaries");
}

export async function enterpriseStewardshipIssues(params) {
  const res = await apiClient.get("/api/enterprise/stewardship/issues", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseAuditAccess(params) {
  const res = await apiClient.get("/api/enterprise/audit/access", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseSecurityEvents(params) {
  const res = await apiClient.get("/api/enterprise/audit/security-events", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernancePolicies(params) {
  const res = await apiClient.get("/api/enterprise/governance/policies", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernancePolicyCreate(body) {
  return apiClient.post("/api/enterprise/governance/policies", body);
}

export async function enterpriseGovernanceDatasets(params) {
  const res = await apiClient.get("/api/enterprise/governance/datasets", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernanceDatasetCreate(body) {
  return apiClient.post("/api/enterprise/governance/datasets", body);
}

export async function enterpriseGovernanceAccessRequests(params) {
  const res = await apiClient.get("/api/enterprise/governance/access-requests", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernanceGlossary(params) {
  const res = await apiClient.get("/api/enterprise/governance/glossary", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernanceGlossaryCreate(body) {
  return apiClient.post("/api/enterprise/governance/glossary", body);
}

export async function enterpriseComplianceReports(params) {
  const res = await apiClient.get("/api/enterprise/compliance/reports", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseAnalyticsMetrics(params) {
  const res = await apiClient.get("/api/enterprise/analytics/metrics", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseAnalyticsMetricCreate(body) {
  return apiClient.post("/api/enterprise/analytics/metrics", body);
}

export async function enterpriseNotifications(params) {
  const res = await apiClient.get("/api/enterprise/notifications", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseNotificationMarkRead(notifId) {
  return apiClient.post(`/api/enterprise/notifications/${notifId}/read`);
}

export async function enterpriseReportsExports(params) {
  const res = await apiClient.get("/api/enterprise/reports", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseBusinessDataRequests(params) {
  const res = await apiClient.get("/api/enterprise/business/data-requests", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseBusinessDataRequestsSummary() {
  return apiClient.get("/api/enterprise/business/data-requests/summary");
}

export async function enterpriseBusinessDataRequestCreate(body) {
  return apiClient.post("/api/enterprise/business/data-requests", body);
}

export async function enterpriseBusinessOverview() {
  return apiClient.get("/api/enterprise/business/overview");
}

export async function enterpriseBusinessCatalog(params) {
  const res = await apiClient.get("/api/enterprise/business/catalog", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseBusinessQualityScores(params) {
  return apiClient.get("/api/enterprise/business/quality-scores", { params });
}

export async function enterpriseBusinessGlossary(params) {
  const res = await apiClient.get("/api/enterprise/business/glossary", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseBusinessReports(params) {
  return apiClient.get("/api/enterprise/business/reports", { params });
}

export async function enterpriseGovernanceBusinessReports(params) {
  const res = await apiClient.get("/api/enterprise/governance/business-reports", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernanceBusinessReportPublish(body) {
  return apiClient.post("/api/enterprise/governance/business-reports", body);
}

export async function enterpriseGovernanceBusinessReportDelete(reportId) {
  return apiClient.delete(`/api/enterprise/governance/business-reports/${reportId}`);
}

export async function enterpriseBusinessAlertSubscriptions() {
  return apiClient.get("/api/enterprise/business/alert-subscriptions");
}

export async function enterpriseBusinessAlertSubscriptionCreate(body) {
  return apiClient.post("/api/enterprise/business/alert-subscriptions", body);
}

export async function enterpriseBusinessAlertSubscriptionDelete(subId) {
  return apiClient.delete(`/api/enterprise/business/alert-subscriptions/${subId}`);
}

export async function enterpriseBusinessAlertSubscriptionUpdate(subId, body) {
  return apiClient.patch(`/api/enterprise/business/alert-subscriptions/${subId}`, body);
}

export async function enterpriseBusinessDataRequestCancel(requestId) {
  return apiClient.delete(`/api/enterprise/business/data-requests/${requestId}`);
}

function readFilenameFromDisposition(header, fallback) {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header || "");
  return match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallback;
}

/** POST export — returns blob + filename for browser download. */
export async function enterpriseReportsExportDownload(body) {
  const res = await apiClient.post("/api/enterprise/reports/export", body, { responseType: "blob" });
  const title = body?.payload?.title || "report";
  const fallback = `${String(title).replace(/[^\w\-]+/g, "_") || "report"}.csv`;
  const filename = readFilenameFromDisposition(res.headers?.["content-disposition"], fallback);
  return { blob: res.data, filename };
}

export async function lineageGraph() {
  return apiClient.get("/api/lineage/graph");
}

export async function enterpriseBusinessLineage(params) {
  return apiClient.get("/api/enterprise/business/lineage", { params });
}

export async function enterpriseBusinessLineageSeed(force = false) {
  return apiClient.post("/api/enterprise/business/lineage/seed", null, { params: { force } });
}

export async function getAuditLogsPaged({ page = 1, pageSize = 20 } = {}) {
  const limit = pageSize;
  const offset = (page - 1) * limit;
  const res = await apiClient.get("/api/audit/logs", { params: { limit, offset } });
  const rows = Array.isArray(res.data) ? res.data : [];
  const hasMore = rows.length === limit;
  const total = hasMore ? offset + rows.length + 1 : offset + rows.length;
  return { data: { items: rows, total, page, page_size: limit } };
}
