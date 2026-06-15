export const TASK_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const TASK_CREATE_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
];

export const TASK_SEVERITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const FILTER_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...TASK_STATUS_OPTIONS,
];

export const FILTER_SEVERITY_OPTIONS = [
  { value: "all", label: "All severities" },
  ...TASK_SEVERITY_OPTIONS,
];

export const SEVERITY_SORT_ORDER = { high: 0, medium: 1, low: 2 };
