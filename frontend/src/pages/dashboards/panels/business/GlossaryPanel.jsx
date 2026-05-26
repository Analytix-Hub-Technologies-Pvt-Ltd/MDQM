import { useCallback, useEffect, useState } from "react";
import { enterpriseBusinessGlossary } from "../../enterpriseApi";

export default function GlossaryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enterpriseBusinessGlossary({ page: 1, page_size: 50, q: debounced || undefined });
      setItems(res.data?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <input
        className="w-full max-w-md rounded border border-slate-200 dark:border-[#2a3f63] bg-white dark:bg-[#0a1220] px-3 py-2 text-sm text-slate-900 dark:text-[#d7e3f7] placeholder:text-slate-400 dark:placeholder:text-[#5c6d8a] focus:outline-none focus:ring-2 focus:ring-sky-500/50"
        placeholder="Search approved terms…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="enterprise-card p-4">
        <h3 className="enterprise-title mb-1">Business glossary</h3>
        <p className="text-xs text-slate-500 dark:text-[#7f95b6] mb-4">{items.length} approved terms</p>
        {loading ? <p className="text-sm text-slate-500 dark:text-[#7f95b6]">Loading…</p> : null}
        <ul className="divide-y divide-slate-100 dark:divide-[#22324f]/60">
          {items.map((g) => (
            <li key={g.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-sky-600 dark:text-sky-400">{g.term}</span>
                  {g.domain ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium">
                      {g.domain}
                    </span>
                  ) : null}
                  {(g.tags || []).map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-medium">
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] uppercase text-emerald-650 dark:text-emerald-400 font-semibold">Approved</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-[#9ab0d1] leading-relaxed">{g.definition}</p>
              {(g.related_terms || []).length > 0 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-[#5c6d8a]">
                  Related:{" "}
                  {g.related_terms.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="text-sky-600 dark:text-sky-400 mr-3 underline hover:text-sky-500 dark:hover:text-sky-300"
                      onClick={() => setQ(t)}
                    >
                      {t}
                    </button>
                  ))}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500 dark:text-[#5c6d8a]">Owner: {g.owner}</p>
            </li>
          ))}
        </ul>
        {!loading && !items.length ? <p className="text-xs text-slate-500 dark:text-[#7f95b6]">No approved terms found.</p> : null}
      </div>
    </div>
  );
}
