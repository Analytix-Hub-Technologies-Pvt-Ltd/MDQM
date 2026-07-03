import { useState, useEffect, useCallback } from "react";
import {
  goldenConfig,
  goldenConfigSave,
  goldenAnalyze,
  goldenCandidates,
  goldenResolve,
} from "../../pages/dashboards/enterpriseApi";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./EnterpriseDataPanel";

export default function GoldenMergePanel({ datasetId, jobId, joinSources, readOnly = false }) {
  const [activeTab, setActiveTab] = useState("review");
  const [autoRunAttempted, setAutoRunAttempted] = useState(false);
  const [config, setConfig] = useState(null);
  const [columns, setColumns] = useState([]);
  
  // Config state
  const [priorityList, setPriorityList] = useState([]);
  const [autoMergeThreshold, setAutoMergeThreshold] = useState(95);
  const [reviewThreshold, setReviewThreshold] = useState(70);
  const [columnOverrides, setColumnOverrides] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState(null);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  // Review Queue state
  const [candidates, setCandidates] = useState([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [queueLoading, setQueueLoading] = useState(false);
  const [expandedCandidates, setExpandedCandidates] = useState({});
  const [candidateOverrides, setCandidateOverrides] = useState({}); // { candidateId: { col: source } }
  const [resolveBusy, setResolveBusy] = useState({}); // { candidateId: boolean }

  // Summary state
  const [summaryStats, setSummaryStats] = useState(null);
  const [qualityImprovement, setQualityImprovement] = useState(0);

  const activeLabels = joinSources.map((j) => j.label || j.file_name || j.table_name || "Join source");
  const availableSources = ["Primary", ...activeLabels];

  // Load config on mount
  const loadConfig = useCallback(async () => {
    try {
      setErr("");
      const res = await goldenConfig(datasetId);
      const data = res.data ?? res;
      setConfig(data);
      setColumns(data.columns ?? []);
      setAutoMergeThreshold(data.auto_merge_threshold ?? 95);
      setReviewThreshold(data.review_threshold ?? 70);
      setColumnOverrides(data.column_overrides ?? {});

      // Align priority list
      const dbPriority = data.source_priority ?? [];
      const aligned = [...new Set([...dbPriority, ...availableSources])].filter((s) =>
        availableSources.includes(s)
      );
      setPriorityList(aligned);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load config.");
    }
  }, [datasetId, joinSources]);

  // Load candidates
  const loadCandidates = useCallback(async () => {
    if (datasetId == null) return;
    setQueueLoading(true);
    setErr("");
    try {
      const res = await goldenCandidates(datasetId, {
        page,
        page_size: 20,
        status: statusFilter,
      });
      const data = res.data ?? res;
      setCandidates(data.items ?? []);
      setTotalCandidates(data.total ?? 0);
      setSummaryStats(data.summary ?? null);
      setQualityImprovement(data.quality_improvement_pct ?? 0);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load candidates.");
    } finally {
      setQueueLoading(false);
    }
  }, [datasetId, page, statusFilter]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (
      !readOnly &&
      config !== null &&
      !queueLoading &&
      totalCandidates === 0 &&
      candidates.length === 0 &&
      !autoRunAttempted &&
      datasetId != null &&
      priorityList.length >= 2
    ) {
      setAutoRunAttempted(true);
      const autoRun = async () => {
        setAnalyzeLoading(true);
        setErr("");
        setSuccess("");
        const payload = {
          source_priority: priorityList,
          auto_merge_threshold: autoMergeThreshold,
          review_threshold: reviewThreshold,
          column_overrides: columnOverrides,
        };
        try {
          const res = await goldenAnalyze(datasetId, payload);
          setAnalysisSummary(res.data ?? res);
          setSuccess("Initial merge analysis completed automatically.");
          loadCandidates();
        } catch (e) {
          console.warn("Auto-merge analysis failed:", e);
        } finally {
          setAnalyzeLoading(false);
        }
      };
      autoRun();
    }
  }, [config, queueLoading, totalCandidates, candidates, autoRunAttempted, datasetId, priorityList, readOnly, autoMergeThreshold, reviewThreshold, columnOverrides, loadCandidates]);

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData("text/plain", index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (readOnly) return;
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (sourceIndex === targetIndex) return;

    const newList = [...priorityList];
    const [removed] = newList.splice(sourceIndex, 1);
    newList.splice(targetIndex, 0, removed);
    setPriorityList(newList);
  };

  const handleSaveConfig = async (runAnalysis = false) => {
    setSaveLoading(true);
    setErr("");
    setSuccess("");
    const payload = {
      source_priority: priorityList,
      auto_merge_threshold: autoMergeThreshold,
      review_threshold: reviewThreshold,
      column_overrides: columnOverrides,
    };
    try {
      await goldenConfigSave(datasetId, payload);
      setSuccess("Configuration saved successfully.");
      if (runAnalysis) {
        handleRunAnalysis();
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to save configuration.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalyzeLoading(true);
    setErr("");
    setSuccess("");
    setAnalysisSummary(null);
    const payload = {
      source_priority: priorityList,
      auto_merge_threshold: autoMergeThreshold,
      review_threshold: reviewThreshold,
      column_overrides: columnOverrides,
    };
    try {
      const res = await goldenAnalyze(datasetId, payload);
      setAnalysisSummary(res.data ?? res);
      setSuccess("Analysis completed.");
      loadCandidates();
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to run analysis.");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleToggleExpand = (candId) => {
    setExpandedCandidates((prev) => ({ ...prev, [candId]: !prev[candId] }));
  };

  const handleOverrideWinner = (candId, col, source) => {
    if (readOnly && activeTab === "review" && statusFilter !== "pending") return;
    setCandidateOverrides((prev) => ({
      ...prev,
      [candId]: {
        ...(prev[candId] || {}),
        [col]: source,
      },
    }));
  };

  const handleResolve = async (candidate, action) => {
    const candId = candidate.id;
    setResolveBusy((prev) => ({ ...prev, [candId]: true }));
    setErr("");
    
    // Construct golden values
    const overrides = candidateOverrides[candId] || {};
    const goldenValues = {};
    const sourceA = priorityList[0] || "Primary";
    const sourceB = priorityList[1];

    Object.keys(candidate.column_scores).forEach((col) => {
      const selectedSrc = overrides[col] || candidate.column_scores[col]?.winner_source || sourceA;
      goldenValues[col] = candidate.source_values[selectedSrc]?.[col];
    });

    try {
      await goldenResolve(datasetId, candId, {
        action,
        golden_values: action === "approve" ? goldenValues : {},
      });
      setSuccess(`Record #${candId} resolved successfully.`);
      loadCandidates();
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to resolve candidate.");
    } finally {
      setResolveBusy((prev) => ({ ...prev, [candId]: false }));
    }
  };

  const sourceA = priorityList[0] || "Primary";
  const sourceB = priorityList[1] || activeLabels[0] || "Join source";

  return (
    <div className="enterprise-card p-5 space-y-4 bg-card text-foreground rounded-lg border border-border">
      <div>
        <h3 className="text-base font-bold text-foreground">Golden record auto-merge & review</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Scans and combines joined datasets to build golden master records based on field completeness and priorities.
        </p>
      </div>

      {/* Internal Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {!readOnly && (
            <button
              onClick={() => {
                setActiveTab("config");
                setSuccess("");
                setErr("");
              }}
              className={`py-2 px-1 border-b-2 font-medium text-xs uppercase tracking-wider transition-colors ${
                activeTab === "config"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Advanced Settings
            </button>
          )}
          <button
            onClick={() => {
              setActiveTab("review");
              setSuccess("");
              setErr("");
            }}
            className={`py-2 px-1 border-b-2 font-medium text-xs uppercase tracking-wider transition-colors ${
              activeTab === "review"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Review Queue
          </button>
          <button
            onClick={() => {
              setActiveTab("summary");
              setSuccess("");
              setErr("");
            }}
            className={`py-2 px-1 border-b-2 font-medium text-xs uppercase tracking-wider transition-colors ${
              activeTab === "summary"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Summary
          </button>
        </div>
      </div>

      {err ? <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2.5">{err}</p> : null}
      {success ? <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900/50 rounded p-2.5">{success}</p> : null}

      {/* Tab Contents */}
      {activeTab === "config" && !readOnly && (
        <div className="space-y-4 text-xs">
          {/* Priority reordering */}
          <div className="space-y-1.5">
            <label className="font-bold uppercase tracking-wider text-muted-foreground block">
              Source Priority (Drag to reorder)
            </label>
            <div className="flex flex-wrap gap-2 py-3 border border-dashed border-border rounded-lg px-4 bg-muted/30">
              {priorityList.map((src, index) => (
                <div
                  key={src}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-card hover:bg-muted border border-border rounded-full shadow-sm text-xs font-semibold text-foreground cursor-grab active:cursor-grabbing transition-colors select-none"
                >
                  <span className="text-muted-foreground">☰</span>
                  <span>{src}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Threshold Sliders */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold uppercase tracking-wider text-muted-foreground block">
                  Auto-merge if score ≥
                </label>
                <span className="text-sm font-semibold text-primary">{autoMergeThreshold}%</span>
              </div>
              <input
                type="range"
                min={80}
                max={100}
                value={autoMergeThreshold}
                onChange={(e) => setAutoMergeThreshold(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold uppercase tracking-wider text-muted-foreground block">
                  Queue for review if score ≥
                </label>
                <span className="text-sm font-semibold text-primary">{reviewThreshold}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={95}
                value={reviewThreshold}
                onChange={(e) => setReviewThreshold(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          {/* Overrides Table */}
          {columns.length > 0 && (
            <div className="space-y-1.5">
              <label className="font-bold uppercase tracking-wider text-muted-foreground block">
                Column overrides
              </label>
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="p-3">Column name</th>
                        <th className="p-3">Override rule</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {columns.map((col) => (
                        <tr key={col} className="hover:bg-muted/30">
                          <td className="p-3 font-mono font-medium text-foreground">{col}</td>
                          <td className="p-3">
                            <select
                              value={columnOverrides[col] || "always_compute"}
                              onChange={(e) => {
                                const val = e.target.value;
                                setColumnOverrides((prev) => {
                                  const next = { ...prev };
                                  if (val === "always_compute") {
                                    delete next[col];
                                  } else {
                                    next[col] = val;
                                  }
                                  return next;
                                });
                              }}
                              className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="always_compute">Auto-compute</option>
                              {priorityList.slice(0, 2).map((src) => (
                                <option key={src} value={`always_${src}`}>
                                  Always prefer {src}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saveLoading || analyzeLoading}
              onClick={() => handleSaveConfig(false)}
            >
              {saveLoading ? "Saving…" : "Save Config"}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={saveLoading || analyzeLoading}
              onClick={() => handleSaveConfig(true)}
            >
              {analyzeLoading ? "Running…" : "Run Analysis"}
            </Button>
          </div>

          {analysisSummary && (
            <div className="p-4 bg-muted/40 rounded-lg border border-border space-y-2 mt-4">
              <h4 className="font-bold text-foreground">Last Analysis Result</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mt-2">
                <div className="p-2 bg-card rounded border border-border">
                  <p className="text-lg font-bold text-primary">{analysisSummary.analyzed}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Analyzed</p>
                </div>
                <div className="p-2 bg-card rounded border border-border">
                  <p className="text-lg font-bold text-emerald-600">{analysisSummary.auto_merged}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Auto-merged</p>
                </div>
                <div className="p-2 bg-card rounded border border-border">
                  <p className="text-lg font-bold text-amber-500">{analysisSummary.pending_review}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Pending Review</p>
                </div>
                <div className="p-2 bg-card rounded border border-border">
                  <p className="text-lg font-bold text-red-500">{analysisSummary.conflicts}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Conflicts</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "review" && (
        <div className="space-y-4 text-xs">
          {/* Status filters */}
          <div className="flex flex-wrap gap-2">
            {["all", "pending", "auto_merged", "approved", "rejected", "conflict"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider transition-colors ${
                  statusFilter === status
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Paginated list */}
          {analyzeLoading ? (
            <p className="text-center py-6 text-muted-foreground">Analyzing and merging dataset records automatically…</p>
          ) : queueLoading ? (
            <p className="text-center py-6 text-muted-foreground">Loading queue…</p>
          ) : candidates.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">No candidate records found in this queue.</p>
          ) : (
            <div className="space-y-3">
              {candidates.map((cand) => {
                const isExpanded = expandedCandidates[cand.id];
                const overrides = candidateOverrides[cand.id] || {};
                const isResolved = cand.status === "approved" || cand.status === "rejected" || cand.status === "auto_merged";
                
                return (
                  <div
                    key={cand.id}
                    className="border border-border rounded-lg bg-card overflow-hidden transition-shadow hover:shadow-sm"
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => handleToggleExpand(cand.id)}
                      className="p-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground text-base">{isExpanded ? "▼" : "▶"}</span>
                        <div>
                          <p className="font-bold text-foreground">Record group key: <span className="font-mono">{cand.row_group_key}</span></p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Created at: {new Date(cand.created_at).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Score:</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cand.row_score >= 95
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : cand.row_score >= 70
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                              : "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400"
                          }`}
                        >
                          {cand.row_score.toFixed(1)}
                        </span>
                        <StatusBadge status={cand.status} />
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="border-t border-border p-4 bg-muted/10 space-y-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
                            <thead>
                              <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                                <th className="p-2.5 w-1/4">Column</th>
                                <th className="p-2.5 w-1/4">{sourceA}</th>
                                <th className="p-2.5 w-1/4">{sourceB}</th>
                                <th className="p-2.5 w-1/6">Winner Choice</th>
                                <th className="p-2.5 w-1/12 text-right">Score</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border text-xs">
                              {Object.keys(cand.column_scores).map((col) => {
                                const scoreObj = cand.column_scores[col];
                                const valA = cand.source_values[sourceA]?.[col];
                                const valB = cand.source_values[sourceB]?.[col];
                                const currentWinner = overrides[col] || scoreObj.winner_source;

                                const isOverriddenA = currentWinner === sourceA;
                                const isOverriddenB = currentWinner === sourceB;

                                return (
                                  <tr key={col} className="hover:bg-muted/10">
                                    <td className="p-2.5 font-mono font-medium text-foreground truncate">{col}</td>
                                    {/* Source A value cell */}
                                    <td
                                      onClick={() => !isResolved && handleOverrideWinner(cand.id, col, sourceA)}
                                      className={`p-2.5 cursor-pointer truncate transition-colors ${
                                        isOverriddenA
                                          ? "bg-emerald-50 text-emerald-800 font-semibold border-l-2 border-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400"
                                          : "text-muted-foreground hover:bg-muted/30"
                                      }`}
                                    >
                                      {valA === null || valA === "" ? <span className="text-[10px] text-muted-foreground/40 italic">empty</span> : String(valA)}
                                    </td>
                                    {/* Source B value cell */}
                                    <td
                                      onClick={() => !isResolved && handleOverrideWinner(cand.id, col, sourceB)}
                                      className={`p-2.5 cursor-pointer truncate transition-colors ${
                                        isOverriddenB
                                          ? "bg-emerald-50 text-emerald-800 font-semibold border-l-2 border-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400"
                                          : "text-muted-foreground hover:bg-muted/30"
                                      }`}
                                    >
                                      {valB === null || valB === "" ? <span className="text-[10px] text-muted-foreground/40 italic">empty</span> : String(valB)}
                                    </td>
                                    {/* Action Toggle */}
                                    <td className="p-2.5">
                                      {isResolved ? (
                                        <span className="font-semibold text-foreground text-[11px]">
                                          {currentWinner}
                                        </span>
                                      ) : (
                                        <div className="flex border border-border rounded overflow-hidden w-fit">
                                          <button
                                            type="button"
                                            onClick={() => handleOverrideWinner(cand.id, col, sourceA)}
                                            className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                              isOverriddenA
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-card text-muted-foreground hover:bg-muted"
                                            }`}
                                          >
                                            {sourceA.substring(0, 3)}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleOverrideWinner(cand.id, col, sourceB)}
                                            className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border-l border-border ${
                                              isOverriddenB
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-card text-muted-foreground hover:bg-muted"
                                            }`}
                                          >
                                            {sourceB.substring(0, 3)}
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-medium text-foreground">
                                      {scoreObj.score.toFixed(0)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Approval Action Bar */}
                        {!isResolved && (
                          <div className="flex gap-2 justify-end pt-2 border-t border-border">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={resolveBusy[cand.id]}
                              onClick={() => handleResolve(cand, "reject")}
                              className="text-xs uppercase tracking-wide text-destructive hover:text-destructive"
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              disabled={resolveBusy[cand.id]}
                              onClick={() => handleResolve(cand, "approve")}
                              className="text-xs uppercase tracking-wide bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {resolveBusy[cand.id] ? "Processing…" : "Approve merge"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination controls */}
              {totalCandidates > 20 && (
                <div className="flex justify-between items-center pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, totalCandidates)} of {totalCandidates}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page * 20 >= totalCandidates}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "summary" && (
        <div className="space-y-5 text-xs">
          {/* Summary Stats */}
          {summaryStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-foreground">{summaryStats.total}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Total Candidates</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-amber-500">{summaryStats.pending}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Pending Review</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-emerald-600">{summaryStats.auto_merged}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Auto-merged</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-emerald-700">{summaryStats.approved}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Approved</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-red-500">{summaryStats.rejected}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Rejected</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-center space-y-1">
                <p className="text-xl font-bold text-rose-500">{summaryStats.conflict}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Conflicts</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No summary statistics available. Run analysis first.</p>
          )}

          {/* Quality Impact */}
          {summaryStats && (summaryStats.auto_merged > 0 || summaryStats.approved > 0) && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-lg space-y-2">
              <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">Quality Impact Metrics</h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Completeness of golden values has been improved compared to the base primary values.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <div className="px-3 py-1.5 bg-emerald-600 text-white rounded text-base font-bold">
                  +{qualityImprovement.toFixed(1)}%
                </div>
                <div>
                  <p className="font-bold text-emerald-900 dark:text-emerald-100">Dataset Completeness Improvement</p>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                    Golden records improve your dataset completeness by {qualityImprovement.toFixed(1)}% (non-null golden vs original).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
