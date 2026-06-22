"""Natural-language smart search for dataset preview rows (Groq LLM)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

MAX_SCAN_ROWS = 5000
_ALLOWED_OPS = frozenset(
    {
        "equals",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        "gt",
        "lt",
        "gte",
        "lte",
        "is_empty",
        "is_not_empty",
    }
)

_SYSTEM_PROMPT = """You translate natural-language questions about a data table into JSON row filters.
Rules:
- Use only column names from the provided list (match case-insensitively; underscores and spaces are equivalent).
- Return ONLY valid JSON, no markdown.
- Schema:
  {"filters":[{"column":"name","operator":"contains","value":"rita"}],"summary":"Rows where name contains Rita"}
- Operators: equals, contains, not_contains, starts_with, ends_with, gt, lt, gte, lte, is_empty, is_not_empty
- For "list names of rita" / "find rita" / "show rita" use column name (or NAME) with operator contains.
- For empty filters (show all), return {"filters":[],"summary":"All rows"}
- summary is one short sentence for the user."""


def _parse_llm_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return {}
        try:
            payload = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_key(name: str) -> str:
    return re.sub(r"[\s_]+", "", (name or "").strip().lower())


def _resolve_column(name: str, available: list[str]) -> str | None:
    if not name or not available:
        return None
    target = _normalize_key(name)
    for col in available:
        if _normalize_key(col) == target:
            return col
    for col in available:
        if target in _normalize_key(col) or _normalize_key(col) in target:
            return col
    return None


def _heuristic_parse(query: str, columns: list[str]) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {"filters": [], "summary": "All rows", "source": "heuristic"}

    lowered = q.lower()
    value = q
    for prefix in (
        "list out the names of",
        "list the names of",
        "list names of",
        "list out names of",
        "show names of",
        "show me",
        "find",
        "list",
        "get",
        "where",
        "filter",
    ):
        if lowered.startswith(prefix):
            value = q[len(prefix) :].strip(" .,:;")
            break

    value = re.sub(r"^(the|a|an)\s+", "", value, flags=re.IGNORECASE).strip()
    if not value:
        return {"filters": [], "summary": "All rows", "source": "heuristic"}

    name_col = _resolve_column("name", columns) or _resolve_column("NAME", columns)
    if name_col:
        return {
            "filters": [{"column": name_col, "operator": "contains", "value": value}],
            "summary": f'Rows where {name_col} contains "{value}"',
            "source": "heuristic",
        }

    return {
        "filters": [{"column": columns[0], "operator": "contains", "value": value}] if columns else [],
        "summary": f'Searching for "{value}"',
        "source": "heuristic",
    }


def parse_smart_search_query(query: str, columns: list[dict[str, Any]]) -> dict[str, Any]:
    """Parse NL query into filter spec. Falls back to heuristics if Groq unavailable."""
    col_names = [str(c.get("name") or "").strip() for c in columns if c.get("name")]
    col_names = [c for c in col_names if c]
    q = (query or "").strip()
    if not q:
        return {"filters": [], "summary": "All rows", "source": "none"}

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return _heuristic_parse(q, col_names)

    try:
        from groq import Groq

        from services.groq_description_service import GROQ_DEFAULT_MODEL, GROQ_TIMEOUT_SECONDS

        model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
        client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS + 5, max_retries=0)

        user_lines = [f"User question: {q}", "Available columns:"]
        for c in columns:
            name = c.get("name")
            if not name:
                continue
            dtype = c.get("data_type") or "String"
            user_lines.append(f"- {name} ({dtype})")

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(user_lines)},
            ],
            temperature=0.1,
            max_tokens=300,
        )
        raw = ""
        if response.choices:
            raw = (response.choices[0].message.content or "").strip()
        payload = _parse_llm_json(raw)
        filters_in = payload.get("filters") if isinstance(payload.get("filters"), list) else []
        filters_out: list[dict[str, Any]] = []
        for item in filters_in:
            if not isinstance(item, dict):
                continue
            col = _resolve_column(str(item.get("column") or ""), col_names)
            if not col:
                continue
            op = str(item.get("operator") or "contains").lower().strip()
            if op not in _ALLOWED_OPS:
                op = "contains"
            filters_out.append(
                {
                    "column": col,
                    "operator": op,
                    "value": str(item.get("value") or "").strip(),
                }
            )
        summary = str(payload.get("summary") or "").strip() or "Filtered rows"
        if not filters_out:
            return _heuristic_parse(q, col_names)
        return {"filters": filters_out, "summary": summary, "source": "llm"}
    except Exception as exc:
        logger.info("Smart search LLM fallback: %s", exc)
        out = _heuristic_parse(q, col_names)
        out["llm_unavailable"] = str(exc)
        return out


def _cell_value(row: dict[str, Any], column: str) -> str:
    val = row.get(column)
    if val is None:
        return ""
    return str(val).strip()


def _row_matches_filter(row: dict[str, Any], flt: dict[str, Any]) -> bool:
    column = flt.get("column") or ""
    op = str(flt.get("operator") or "contains").lower()
    raw_value = flt.get("value")
    cell = _cell_value(row, column)
    cmp_val = str(raw_value or "").strip()
    cell_l = cell.lower()
    cmp_l = cmp_val.lower()

    if op == "is_empty":
        return cell == ""
    if op == "is_not_empty":
        return cell != ""
    if op == "equals":
        return cell_l == cmp_l
    if op == "contains":
        return cmp_l in cell_l if cmp_l else True
    if op == "not_contains":
        return cmp_l not in cell_l if cmp_l else True
    if op == "starts_with":
        return cell_l.startswith(cmp_l) if cmp_l else True
    if op == "ends_with":
        return cell_l.endswith(cmp_l) if cmp_l else True

    try:
        left = float(cell) if cell else 0.0
        right = float(cmp_val) if cmp_val else 0.0
    except ValueError:
        left, right = cell_l, cmp_l
    if op == "gt":
        return left > right
    if op == "lt":
        return left < right
    if op == "gte":
        return left >= right
    if op == "lte":
        return left <= right
    return cmp_l in cell_l if cmp_l else True


def apply_smart_filters(rows: list[dict[str, Any]], filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not filters:
        return rows
    out: list[dict[str, Any]] = []
    for row in rows:
        if all(_row_matches_filter(row, flt) for flt in filters):
            out.append(row)
    return out
