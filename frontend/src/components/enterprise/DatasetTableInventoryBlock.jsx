import { modalLabelClass } from "@/components/layout/AppModal";
import DatasetSampleRowsGrid from "@/components/enterprise/DatasetSampleRowsGrid";
import { cn } from "@/lib/utils";

export function resolveTableColumns(table) {
  const meta = table?.columns || [];
  if (meta.length) return meta;
  const rows = table?.sample_rows || [];
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((name) => ({
    name,
    data_type: "String",
    description: "—",
  }));
}

/**
 * Per dataset table: column schema as rows (Column | Type | Description), then optional sample data.
 */
export default function DatasetTableInventoryBlock({
  table,
  maxSampleRows = 15,
  showSampleRows = true,
  embedded = false,
  datasetId = null,
  serverSideSampleRows = false,
}) {
  const columns = resolveTableColumns(table);
  const sampleRows = (table?.sample_rows || []).slice(0, maxSampleRows);
  const useServerGrid = Boolean(serverSideSampleRows && datasetId != null && table?.table_id != null);

  const columnsTable = (
    <div>
      <p className={cn(modalLabelClass, "mb-1.5")}>Columns (type)</p>
      {columns.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-[11px]">
            <thead className="bg-[var(--table-header-bg)] text-[var(--table-header-fg)]">
              <tr>
                <th className="p-2 text-left font-bold uppercase tracking-wide">Column</th>
                <th className="p-2 text-left font-bold uppercase tracking-wide">Type</th>
                <th className="p-2 text-left font-bold uppercase tracking-wide">Description</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="p-2 font-mono font-medium text-foreground">{c.name}</td>
                  <td className="p-2 text-foreground">{c.data_type || "—"}</td>
                  <td className="max-w-[320px] p-2 text-muted-foreground" title={c.description || ""}>
                    {c.description?.trim() ? c.description : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No columns registered yet — run import or refresh to load schema from the data file.
        </p>
      )}
    </div>
  );

  const sampleSection = useServerGrid ? (
    <DatasetSampleRowsGrid
      datasetId={datasetId}
      tableId={table.table_id}
      columns={columns}
      enabled={showSampleRows}
    />
  ) : showSampleRows && sampleRows.length ? (
      <div>
        <p className={cn(modalLabelClass, "mb-1.5")}>Data</p>
        <div className="mdqm-scroll-x max-h-56 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[400px] text-[11px]">
            <thead className="sticky top-0 bg-[var(--table-header-bg)] text-[var(--table-header-fg)]">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.name}
                    className="whitespace-nowrap border-b border-border p-2 text-left font-bold uppercase tracking-wide"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, ri) => (
                <tr key={ri} className="border-b border-border">
                  {columns.map((c) => (
                    <td
                      key={c.name}
                      className="max-w-[220px] truncate p-2 align-top text-foreground"
                      title={String(row[c.name] ?? "")}
                    >
                      {row[c.name] != null && row[c.name] !== "" ? String(row[c.name]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : showSampleRows ? (
      <p className="text-xs text-muted-foreground">Run import to load data from the database.</p>
    ) : null;

  const body = (
    <div className={embedded ? "space-y-4" : "space-y-4 p-3"}>
      {columnsTable}
      {sampleSection}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <span className="font-mono font-semibold text-foreground">{table?.table_name || "—"}</span>
        <span className="text-[11px] text-muted-foreground">
          {table?.row_count != null ? `${table.row_count} rows stored` : "—"}
          {table?.source_file ? ` · ${table.source_file}` : ""}
        </span>
      </div>
      {body}
    </div>
  );
}
