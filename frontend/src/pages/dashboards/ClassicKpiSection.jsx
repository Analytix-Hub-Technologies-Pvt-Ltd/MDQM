import { useState } from "react";
import LegacyKpiDashboard from "../Dashboard";

/**
 * @param {boolean} [defaultOpen] - Start expanded on the Overview tab.
 */
export default function ClassicKpiSection({ defaultOpen = false }) {
  const [show, setShow] = useState(defaultOpen);

  return (
    <section className="enterprise-card mt-6">
      <div className="px-4 py-3 border-b border-[#22324f] flex items-center justify-between">
        <h2 className="enterprise-title">Classic KPI Analytics (All Jobs)</h2>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-xs border border-[#2a3f63] px-3 py-1 text-[#9ab0d1] uppercase tracking-wider rounded-sm"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {show ? <LegacyKpiDashboard embedded /> : null}
    </section>
  );
}
