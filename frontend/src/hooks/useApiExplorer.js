import { useMemo, useState } from "react";

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function useApiExplorer(endpoints = []) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return endpoints.filter((ep) => {
      if (moduleFilter !== "all" && ep.module !== moduleFilter) return false;
      if (methodFilter !== "all" && ep.method !== methodFilter) return false;
      if (!q) return true;
      const haystack = [ep.name, ep.method, ep.path, ep.summary, ep.description, ...(ep.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [endpoints, search, moduleFilter, methodFilter]);

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return {
    search,
    setSearch,
    moduleFilter,
    setModuleFilter,
    methodFilter,
    setMethodFilter,
    expandedId,
    toggleExpanded,
    filtered,
    allMethods: ALL_METHODS,
  };
}
