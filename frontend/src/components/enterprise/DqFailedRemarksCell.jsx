import { cn } from "@/lib/utils";

const CATEGORY_STYLES = {
  Validation: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  Fuzzy: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
};

export function normalizeDqFailedRemarks(row) {
  if (Array.isArray(row?.dq_failed_remarks) && row.dq_failed_remarks.length) {
    return row.dq_failed_remarks;
  }
  const text = row?.dq_remarks || "";
  if (!text.trim()) return [];

  if (text.includes("[Validation]") || text.includes("[Fuzzy]")) {
    const items = [];
    for (const segment of text.split(" | ")) {
      const trimmed = segment.trim();
      const match = trimmed.match(/^\[(Validation|Fuzzy)\]\s*(.*)$/i);
      if (!match) continue;
      const category = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      const body = match[2] || "";
      for (const part of body.split("; ")) {
        const piece = part.trim();
        if (!piece || !piece.includes(":")) continue;
        const colon = piece.indexOf(":");
        items.push({
          category: category === "Fuzzy" ? "Fuzzy" : "Validation",
          column: piece.slice(0, colon).trim(),
          message: piece.slice(colon + 1).trim(),
        });
      }
    }
    return items;
  }

  return text.split("; ").reduce((acc, part) => {
    const piece = part.trim();
    if (!piece || !piece.includes(":")) return acc;
    const colon = piece.indexOf(":");
    acc.push({
      category: "Validation",
      column: piece.slice(0, colon).trim(),
      message: piece.slice(colon + 1).trim(),
    });
    return acc;
  }, []);
}

export function groupDqFailedRemarks(remarks) {
  const grouped = {};
  for (const item of remarks) {
    const cat = item.category || "Validation";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }
  return grouped;
}

export function DqFailedRemarksCell({ row, className }) {
  const remarks = normalizeDqFailedRemarks(row);
  if (!remarks.length) {
    return <span className={cn("block px-1.5 text-[11px] text-muted-foreground/40", className)}> </span>;
  }

  const grouped = groupDqFailedRemarks(remarks);

  return (
    <div className={cn("space-y-1 px-1.5 py-0.5", className)}>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-0.5">
          <span
            className={cn(
              "inline-block rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider leading-none",
              CATEGORY_STYLES[category] || "bg-muted text-muted-foreground",
            )}
          >
            {category}
          </span>
          <div className="space-y-0.5">
            {items.map((item, idx) => (
              <p
                key={`${category}-${item.column}-${idx}`}
                className="text-[10px] leading-snug text-destructive"
                title={`${item.column}: ${item.message}`}
              >
                <span className="font-mono text-foreground/80">{item.column}</span>
                <span className="text-muted-foreground"> — </span>
                {item.message}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
