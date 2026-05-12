export default function AuditWidget({ entries = [] }) {
  const rows = entries.slice(0, 5);
  return (
    <article className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Recent Audit Activity</h3>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((entry, idx) => (
            <div key={`${entry.action || "action"}-${idx}`} className="text-sm text-[#d7e3f7] border-b border-[#22324f] pb-2">
              <div className="font-medium">{entry.action || "Action"}</div>
              <div className="text-xs text-[#7f95b6]">{entry.created_at || "Unknown time"}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#7f95b6]">No audit events available.</p>
        )}
      </div>
    </article>
  );
}
