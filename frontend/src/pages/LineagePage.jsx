import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LineageGraphView from "../components/business/LineageGraphView";
import EnterpriseDataPanel, { StatusBadge } from "../components/enterprise/EnterpriseDataPanel";
import { lineageGraph } from "./dashboards/enterpriseApi";

/**
 * Full-page lineage explorer accessible from the sidebar / "Open Lineage explorer" links.
 * Fetches real lineage data from /api/lineage/graph and renders an interactive SVG graph.
 */
export default function LineagePage() {
  const [searchParams] = useSearchParams();
  const focusDataset = searchParams.get("dataset") || "";

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(focusDataset);

  const fetchLineage = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await lineageGraph();
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not load lineage graph");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLineage();
  }, []);

  const allNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const allEdges = Array.isArray(data?.edges) ? data.edges : [];

  /* Client-side filter for quick focus */
  const lowerFilter = filter.trim().toLowerCase();
  let nodes = allNodes;
  let edges = allEdges;
  if (lowerFilter) {
    const matchIds = new Set();
    allNodes.forEach((n) => {
      if (
        (n.label || "").toLowerCase().includes(lowerFilter) ||
        (n.key || "").toLowerCase().includes(lowerFilter) ||
        (n.domain || "").toLowerCase().includes(lowerFilter)
      ) {
        matchIds.add(n.id);
      }
    });
    /* Keep direct neighbours for context */
    const contextIds = new Set(matchIds);
    allEdges.forEach((e) => {
      if (matchIds.has(e.from) || matchIds.has(e.to)) {
        contextIds.add(e.from);
        contextIds.add(e.to);
      }
    });
    nodes = allNodes.filter((n) => contextIds.has(n.id));
    edges = allEdges.filter((e) => contextIds.has(e.from) && contextIds.has(e.to));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data Lineage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          End-to-end data flow across sources, datasets, reports, and consumers — generated from your registered datasets.
        </p>
      </div>

      {err ? <p className="text-sm text-amber-400">{err}</p> : null}

      <div className="enterprise-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="enterprise-title mb-1">Lineage graph</h3>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading lineage…"
                : `${allNodes.length} nodes, ${allEdges.length} edges`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="rounded border border-slate-200 dark:border-[#2a3f63] bg-white dark:bg-[#0a1220] px-2 py-1.5 text-xs text-slate-900 dark:text-[#d7e3f7] placeholder:text-slate-400 dark:placeholder:text-[#5c6d8a] focus:outline-none focus:ring-1 focus:ring-[#4f8cff]/40 w-56"
              placeholder="Filter by name, key, or domain…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              onClick={fetchLineage}
              disabled={loading}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        {!loading && nodes.length > 0 ? (
          <LineageGraphView nodes={nodes} edges={edges} />
        ) : !loading && !err ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No lineage data yet. Register datasets and run imports — lineage is generated automatically.
          </p>
        ) : null}
      </div>

      {allNodes.length > 0 && (
        <EnterpriseDataPanel
          title="Lineage nodes"
          columns={[
            { key: "label", label: "Name" },
            { key: "type", label: "Type", render: (v) => <StatusBadge status={v || "—"} /> },
            { key: "domain", label: "Domain" },
            { key: "key", label: "Key" },
          ]}
          pageSize={15}
          fetchPage={async ({ page, pageSize, query }) => {
            let items = allNodes;
            if (query) {
              const q = query.toLowerCase();
              items = items.filter(
                (n) =>
                  (n.label || "").toLowerCase().includes(q) ||
                  (n.key || "").toLowerCase().includes(q) ||
                  (n.domain || "").toLowerCase().includes(q)
              );
            }
            const start = (page - 1) * pageSize;
            const slice = items.slice(start, start + pageSize);
            return { data: { items: slice, total: items.length, page, page_size: pageSize } };
          }}
        />
      )}
    </div>
  );
}
