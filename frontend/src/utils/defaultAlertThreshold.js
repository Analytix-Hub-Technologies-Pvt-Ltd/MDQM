export function defaultAlertThresholdForTier(tier) {
  const t = String(tier || "").toLowerCase();
  if (t === "gold") return 85;
  if (t === "silver") return 75;
  return 75;
}
