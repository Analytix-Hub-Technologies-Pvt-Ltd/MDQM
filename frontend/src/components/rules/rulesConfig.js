export const RULE_TYPES = {
  Integer: [
    "is_positive",
    "is_negative",
    "range",
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
  ],
  String: [
    "is_email",
    "is_url",
    "is_alpha",
    "is_alphanumeric",
    "length_match",
    "fuzzy_match",
    "regex_pattern",
    "exact_values",
    "contains",
    "starts_with",
    "ends_with",
  ],
  Float: [
    "is_positive",
    "is_negative",
    "range",
    "decimal_precision",
    "greater_than",
    "less_than",
  ],
  Date: [
    "is_future",
    "is_past",
    "is_weekend",
    "date_format_check",
    "before_date",
    "after_date",
  ],
  Boolean: ["is_true", "is_false"],
};

export const RULES_REQUIRING_INPUT = [
  "range",
  "equals",
  "not_equals",
  "exact_values",
  "greater_than",
  "less_than",
  "length_match",
  "regex_pattern",
  "contains",
  "starts_with",
  "ends_with",
  "decimal_precision",
  "date_format_check",
  "before_date",
  "after_date",
];

export function getRulePlaceholder(type) {
  switch (type) {
    case "starts_with":
      return "e.g. 'EMP-'";
    case "ends_with":
      return "e.g. '.com'";
    case "exact_values":
    case "equals":
      return "e.g. Male or Male,Female";
    case "contains":
      return "e.g. 'urgent'";
    case "regex_pattern":
      return "e.g. ^[A-Z]{3}-[0-9]{4}$";
    case "length_match":
      return "e.g. 10";
    case "greater_than":
      return "e.g. 18";
    case "less_than":
      return "e.g. 100";
    case "decimal_precision":
      return "e.g. 2";
    case "date_format_check":
      return "e.g. %Y-%m-%d";
    case "before_date":
      return "YYYY-MM-DD";
    case "after_date":
      return "YYYY-MM-DD";
    default:
      return "Enter value...";
  }
}
