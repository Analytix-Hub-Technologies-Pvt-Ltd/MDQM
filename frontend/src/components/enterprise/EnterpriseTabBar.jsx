/**
 * Horizontal enterprise tab strip (dark theme, keyboard-friendly).
 */
export default function EnterpriseTabBar({ tabs, activeId, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-[#0c1524] border border-[#22324f]">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`px-3 py-2 text-[11px] uppercase tracking-wider rounded-md transition-colors ${
              active ? "bg-[#4f8cff] text-white shadow" : "text-[#9ab0d1] hover:bg-[#13223c] hover:text-[#d7e3f7]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
