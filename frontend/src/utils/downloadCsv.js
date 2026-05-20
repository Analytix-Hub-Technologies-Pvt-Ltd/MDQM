export function escapeCsvCell(cell) {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Trigger a file save in the browser (works without a server round-trip). */
export function downloadTextFile(content, filename, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 500);
}

export function buildBusinessReportCsv(report) {
  const rows = [
    ["field", "value"],
    ["report_id", report.id ?? ""],
    ["title", report.title ?? ""],
    ["report_type", report.report_type ?? ""],
    ["dataset_name", report.dataset_name ?? ""],
    ["status", report.status ?? ""],
    ["quality_score", report.quality_score ?? ""],
    ["last_refreshed", report.last_refreshed ?? ""],
    ["external_url", report.external_url ?? ""],
    ["exported_at", new Date().toISOString()],
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function businessReportCsvFilename(title) {
  const safe = String(title || "report")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 80);
  return `${safe || "report"}.csv`;
}
