import { useCallback, useEffect, useState } from "react";
import { fetchOpenApiSchema } from "@/services/developerToolsService";

export function useOpenApiSchema() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const parsed = await fetchOpenApiSchema();
      setData(parsed);
    } catch (err) {
      setData(null);
      setError(err?.response?.data?.detail || err?.message || "Failed to load OpenAPI schema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, endpoints: data?.endpoints ?? [], info: data?.info ?? {}, loading, error, refresh: load };
}
