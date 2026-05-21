import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import {
  enterpriseComplianceReports,
  enterpriseStewardshipIssues,
  enterpriseBusinessLineage,
} from "../enterpriseApi";
import CatalogPanel from "./business/CatalogPanel";
import QualityPanel from "./business/QualityPanel";
import GlossaryPanel from "./business/GlossaryPanel";
import ReportsPanel from "./business/ReportsPanel";
import AlertsPanel from "./business/AlertsPanel";
import LineageGraphView from "../../../components/business/LineageGraphView";

const complianceCols = [
  { key: "title", label: "Title" },
  { key: "framework", label: "Framework" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

const issueCols = [
  { key: "dataset_name", label: "Dataset" },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Opened" },
];

function LineagePanel() {
  const [searchParams] = useSearchParams();
  const focusDataset = searchParams.get("dataset") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await enterpriseBusinessLineage(focusDataset ? { dataset: focusDataset } : undefined);
        if (on) setData(res.data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Could not load lineage");
      }
    })();
    return () => {
      on = false;
    };
  }, [focusDataset]);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  return (
    <div className="space-y-4">
      {err ? <p className="text-sm text-amber-400">{err}</p> : null}
      <div className="enterprise-card p-4">
        <h3 className="enterprise-title mb-2">Data flow overview</h3>
        <p className="text-xs text-[#7f95b6] mb-4">
          {focusDataset ? (
            <>
              Focus: <span className="text-[#d7e3f7]">{focusDataset}</span> — {nodes.length} nodes, {edges.length} edges
            </>
          ) : (
            <>Read-only lineage — {nodes.length} nodes, {edges.length} edges</>
          )}
        </p>
        <LineageGraphView nodes={nodes} edges={edges} />
      </div>
      <EnterpriseDataPanel
        title="Nodes"
        columns={[
          { key: "key", label: "Key" },
          { key: "type", label: "Type" },
          { key: "domain", label: "Domain" },
        ]}
        pageSize={15}
        fetchPage={async ({ page, pageSize }) => {
          const start = (page - 1) * pageSize;
          const slice = nodes.slice(start, start + pageSize);
          return { data: { items: slice, total: nodes.length, page, page_size: pageSize } };
        }}
      />
    </div>
  );
}

export function renderBusinessUserTab(tabId) {
  switch (tabId) {
    case "catalog":
      return <CatalogPanel />;
    case "quality":
      return <QualityPanel />;
    case "glossary":
      return <GlossaryPanel />;
    case "lineage":
      return <LineagePanel />;
    case "reports":
      return <ReportsPanel />;
    case "compliance":
      return (
        <div className="space-y-3">
          <p className="text-xs text-[#7f95b6]">Regulatory and framework attestations published by your governance team.</p>
          <EnterpriseDataPanel
            title="Compliance reports"
            columns={complianceCols}
            emptyMessage="No compliance reports yet. Your CDO or auditor can publish reports from the compliance workspace."
            fetchPage={({ page, pageSize }) => enterpriseComplianceReports({ page, page_size: pageSize })}
          />
        </div>
      );
    case "issues":
      return (
        <div className="space-y-3">
          <p className="text-xs text-[#7f95b6]">Open data quality issues tracked by stewards (read-only).</p>
          <EnterpriseDataPanel
            title="Stewardship issues (read-only)"
            columns={issueCols}
            emptyMessage="No open issues in the queue. Issues appear when stewards log remediation tasks."
            fetchPage={({ page, pageSize, query }) => enterpriseStewardshipIssues({ page, page_size: pageSize, q: query || undefined })}
          />
        </div>
      );
    case "alerts":
      return <AlertsPanel />;
    default:
      return <p className="text-sm text-[#9ab0d1]">Unknown tab.</p>;
  }
}
