import { useMemo } from "react";
import { computeDeveloperMetrics } from "@/utils/openapiParser";
import { groupEndpointsByModule } from "@/utils/moduleMapper";

export function useDeveloperMetrics(endpoints = []) {
  return useMemo(() => {
    const metrics = computeDeveloperMetrics(endpoints);
    const grouped = groupEndpointsByModule(endpoints);
    return { ...metrics, grouped };
  }, [endpoints]);
}
