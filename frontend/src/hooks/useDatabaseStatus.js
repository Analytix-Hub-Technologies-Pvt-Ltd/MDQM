import { useCallback, useEffect, useState } from "react";
import { fetchDatabaseStatus } from "@/services/developerToolsService";

export function useDatabaseStatus({ autoRefreshMs = 90000 } = {}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchDatabaseStatus();
      setStatus(result);
    } catch (err) {
      setError(err?.message || "Failed to check database status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!autoRefreshMs) return undefined;
    const id = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(id);
  }, [refresh, autoRefreshMs]);

  return { status, loading, error, refresh };
}
