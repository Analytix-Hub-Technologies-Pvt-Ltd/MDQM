import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import {
  fetchGovernanceDatasetEdaReportHtml,
  getCachedEdaReportHtml,
} from "../enterpriseApi";
import { AppModal } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";

function edaReportFilename(datasetName) {
  const safe = String(datasetName || "dataset")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${safe || "dataset"}_eda_report.html`;
}

function formatDetail(err) {
  const d = err?.response?.data;
  if (typeof d === "string") {
    try {
      const parsed = JSON.parse(d);
      return parsed.detail || parsed.message || d;
    } catch {
      return d;
    }
  }
  if (d && typeof d === "object") {
    return d.detail || d.message || err?.message;
  }
  return err?.message || "EDA report failed.";
}

/** Keep ydata navbar visible + scroll sections below it inside the iframe. */
function prepareEdaReportHtml(html) {
  if (!html || typeof html !== "string") return html;
  const style = `<style id="mdqm-eda-embed-fix">
html { scroll-behavior: smooth; }
nav.navbar.sticky-top,
nav.navbar {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  z-index: 1050 !important;
  background: var(--bs-body-bg, #f8f9fa) !important;
  box-shadow: 0 1px 6px rgba(0,0,0,.08);
}
body {
  padding-top: var(--navbar-height, 56px) !important;
}
.anchor-pos, .section-header, [id] {
  scroll-margin-top: calc(var(--navbar-height, 56px) + 12px);
}
</style>`;
  const script = `<script>
(function(){
  function navHeight() {
    var nav = document.querySelector("nav.navbar");
    return nav ? Math.ceil(nav.getBoundingClientRect().height) : 56;
  }
  function scrollToHash(hash) {
    if (!hash || hash === "#") return;
    if (hash === "#top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    var id = hash.replace(/^#/, "");
    var el = document.getElementById(id) || document.querySelector('[id="' + id + '"]');
    if (!el) return;
    var offset = navHeight() + 8;
    var top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  function closeOffcanvas() {
    document.querySelectorAll(".offcanvas.show").forEach(function(panel) {
      if (window.bootstrap && bootstrap.Offcanvas) {
        try { bootstrap.Offcanvas.getOrCreateInstance(panel).hide(); } catch (e) {}
      } else {
        panel.classList.remove("show");
      }
    });
    document.querySelectorAll(".offcanvas-backdrop").forEach(function(b) { b.remove(); });
    document.body.classList.remove("offcanvas-backdrop", "modal-open");
    document.body.style.overflow = "";
  }
  document.addEventListener("click", function(e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
    if (!a || !a.getAttribute("href")) return;
    var href = a.getAttribute("href");
    if (href.charAt(0) !== "#") return;
    e.preventDefault();
    closeOffcanvas();
    if (history.pushState) history.pushState(null, "", href);
    else location.hash = href;
    scrollToHash(href);
  }, true);
  window.addEventListener("hashchange", function() { scrollToHash(location.hash); });
  window.addEventListener("load", function() {
    document.body.style.paddingTop = navHeight() + "px";
    if (location.hash) scrollToHash(location.hash);
  });
})();
</script>`;
  let out = html;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${style}</head>`);
  } else {
    out = style + out;
  }
  if (out.includes("</body>")) {
    return out.replace("</body>", `${script}</body>`);
  }
  return out + script;
}

export default function DatasetEdaReportModal({ datasetId, datasetName, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [reportHtml, setReportHtml] = useState("");
  const [reportFrameUrl, setReportFrameUrl] = useState(null);
  const frameUrlRef = useRef(null);

  const revokeFrameUrl = useCallback(() => {
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = null;
    }
    setReportFrameUrl(null);
  }, []);

  const applyHtml = useCallback(
    (html) => {
      const prepared = prepareEdaReportHtml(html);
      setReportHtml(prepared);
      revokeFrameUrl();
      const blob = new Blob([prepared], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      frameUrlRef.current = url;
      setReportFrameUrl(url);
    },
    [revokeFrameUrl]
  );

  const clearReport = useCallback(() => {
    setReportHtml("");
    revokeFrameUrl();
  }, [revokeFrameUrl]);

  const handleDownload = useCallback(() => {
    if (!reportHtml.trim()) return;
    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = edaReportFilename(datasetName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [reportHtml, datasetName]);

  useEffect(() => {
    if (!open || datasetId == null) {
      clearReport();
      setErr("");
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setErr("");

    const cached = getCachedEdaReportHtml(datasetId);
    if (cached) {
      applyHtml(cached);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    clearReport();

    (async () => {
      try {
        const html = await fetchGovernanceDatasetEdaReportHtml(datasetId);
        if (cancelled) return;
        applyHtml(html);
      } catch (e) {
        if (!cancelled) setErr(formatDetail(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, datasetId, clearReport, applyHtml]);

  useEffect(() => {
    if (!open) clearReport();
  }, [open, clearReport]);

  const title = datasetName ? `EDA report — ${datasetName}` : "EDA report";

  return (
    <AppModal
      open={open}
      onClose={onClose}
      headerContent={
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="app-modal-title" className="text-sm font-bold uppercase tracking-wider text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Exploratory profiling (ydata-profiling). Large datasets may take up to a minute to generate.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs uppercase tracking-wide"
            disabled={loading || !reportHtml.trim()}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
        </div>
      }
      maxWidth="max-w-[min(96rem,calc(100vw-2rem))]"
      className="h-[min(92vh,calc(100dvh-2rem))]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      showDefaultFooter={false}
      footer={
        <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div
              className="h-9 w-9 animate-spin rounded-full border-4 border-muted border-t-primary"
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">Generating EDA profiling report…</p>
            <p className="text-xs text-muted-foreground max-w-md">
              First open may take 10–60 seconds. Re-opening the same dataset is cached and loads faster.
            </p>
          </div>
        ) : null}
        {err && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-destructive">Failed to generate EDA report</p>
            <p className="text-xs text-muted-foreground max-w-lg">{err}</p>
          </div>
        ) : null}
        {reportFrameUrl && !loading && !err ? (
          <iframe
            title={title}
            src={reportFrameUrl}
            className="min-h-0 w-full flex-1 border-0 bg-white"
            style={{ minHeight: "calc(92vh - 8rem)" }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        ) : null}
      </div>
    </AppModal>
  );
}
