import { useCallback, useEffect, useState } from "react";
import { fetchSystemHealth } from "@/services/developerToolsService";

export function useSystemHealth({ autoRefreshMs = 60000 } = {}) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSystemHealth();
      setHealth(result);
    } catch (err) {
      setError(err?.message || "Failed to load system health.");
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

  return { health, loading, error, refresh };
}
