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

export async function enterpriseGovernanceDatasetPreview(datasetId) {
  return apiClient.get(`/api/enterprise/governance/datasets/${datasetId}/preview`);
}

/** Open ydata-profiling HTML report in a new browser tab with premium load screen. */
export async function openGovernanceDatasetEdaReport(datasetId) {
  const newWindow = window.open("about:blank", "_blank");
  if (newWindow) {
    newWindow.document.title = "Generating EDA Report...";
    newWindow.document.body.innerHTML = `
      <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f8fafc; margin: 0;">
        <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">Generating EDA Profiling Report...</div>
        <div style="color: #94a3b8; font-size: 0.875rem;">This might take 10-30 seconds depending on dataset size. Please keep this tab open.</div>
        <div style="margin-top: 1.5rem; border: 4px solid #334155; border-top: 4px solid #3b82f6; border-radius: 50%; width: 36px; height: 36px; animation: spin 1s linear infinite;"></div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
  }

  try {
    const res = await apiClient.get(`/api/enterprise/governance/datasets/${datasetId}/eda-report`, {
      responseType: "text",
    });
    const html = typeof res?.data === "string" ? res.data : "";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    if (newWindow && !newWindow.closed) {
      newWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    let errorDetail = "";
    if (err?.response?.data) {
      if (typeof err.response.data === "string") {
        try {
          const parsed = JSON.parse(err.response.data);
          errorDetail = parsed.detail || parsed.message;
        } catch {
          errorDetail = err.response.data;
        }
      } else {
        errorDetail = err.response.data.detail || err.response.data.message;
      }
    }
    if (!errorDetail) {
      errorDetail = err.message || "An unexpected error occurred.";
    }

    if (newWindow && !newWindow.closed) {
      newWindow.document.body.innerHTML = `
        <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f8fafc; padding: 20px; text-align: center; margin: 0;">
          <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: #f87171;">Failed to generate EDA Report</div>
          <div style="color: #94a3b8; font-size: 0.875rem; max-width: 500px; margin-bottom: 1.5rem;">
            ${errorDetail}
          </div>
          <button onclick="window.close()" style="background-color: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 0.875rem; hover: opacity-95">Close Tab</button>
        </div>
      `;
    }
    throw err;
  }
}

export async function enterpriseGovernanceAccessRequests(params) {
  const res = await apiClient.get("/api/enterprise/governance/access-requests", { params });
  return { data: unwrapList(res) };
}

export async function enterpriseGovernanceAccessRequestApprove(requestId) {
  return apiClient.post(`/api/enterprise/governance/access-requests/${requestId}/approve`);
}

export async function enterpriseGovernanceAccessRequestReject(requestId) {
  return apiClient.post(`/api/enterprise/governance/access-requests/${requestId}/reject`);
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

export async function enterpriseBusinessCatalogDetail(datasetId) {
  return apiClient.get(`/api/enterprise/business/catalog/${datasetId}/detail`);
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
