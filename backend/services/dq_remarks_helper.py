"""Build and parse categorized DQ failure remarks (Validation vs Fuzzy)."""

from __future__ import annotations

import re

DQ_CATEGORIES = ("Validation", "Fuzzy")
_CATEGORY_PREFIX = re.compile(r"^\[(Validation|Fuzzy)\]\s*", re.IGNORECASE)


def build_categorized_dq_remarks(row_errors: list[dict]) -> tuple[str | None, list[dict]]:
    """Return (flat categorized string, structured remark list) from row_errors."""
    if not row_errors:
        return None, []

    by_type: dict[str, list[dict]] = {}
    for err in row_errors:
        cat = err.get("type") or "Validation"
        if cat not in DQ_CATEGORIES:
            cat = "Validation"
        by_type.setdefault(cat, []).append(err)

    parts: list[str] = []
    structured: list[dict] = []
    for cat in DQ_CATEGORIES:
        items = by_type.get(cat, [])
        if not items:
            continue
        cat_parts = [f"{e['col']}: {e['msg']}" for e in items]
        parts.append(f"[{cat}] " + "; ".join(cat_parts))
        for e in items:
            structured.append(
                {
                    "category": cat,
                    "column": e["col"],
                    "message": e["msg"],
                    "value": e.get("val"),
                }
            )

    return " | ".join(parts), structured


def build_dq_remarks_from_column_flags(column_flags: dict) -> tuple[str | None, list[dict]]:
    """Fallback when only per-column flags are available (legacy apply path)."""
    row_errors = []
    for col, flag in column_flags.items():
        if flag.get("passed", True):
            continue
        cat = flag.get("category") or "Validation"
        row_errors.append(
            {
                "col": col,
                "type": cat,
                "msg": flag.get("remark") or "fail",
                "val": None,
            }
        )
    return build_categorized_dq_remarks(row_errors)


def parse_dq_remarks(dq_remarks: str | None) -> list[dict]:
    """Parse stored dq_remarks into structured items (supports old and new formats)."""
    if not dq_remarks or not str(dq_remarks).strip():
        return []

    text = str(dq_remarks).strip()
    if "[Validation]" in text or "[Fuzzy]" in text:
        structured: list[dict] = []
        for segment in text.split(" | "):
            segment = segment.strip()
            if not segment:
                continue
            m = _CATEGORY_PREFIX.match(segment)
            if not m:
                continue
            cat = m.group(1).capitalize()
            if cat == "Fuzzy":
                cat = "Fuzzy"
            body = segment[m.end() :]
            for part in body.split("; "):
                part = part.strip()
                if not part or ":" not in part:
                    continue
                col, msg = part.split(":", 1)
                structured.append(
                    {
                        "category": cat,
                        "column": col.strip(),
                        "message": msg.strip(),
                        "value": None,
                    }
                )
        return structured

    # Legacy flat format: "col: msg; col2: msg2"
    structured = []
    for part in text.split("; "):
        part = part.strip()
        if not part or ":" not in part:
            continue
        col, msg = part.split(":", 1)
        structured.append(
            {
                "category": "Validation",
                "column": col.strip(),
                "message": msg.strip(),
                "value": None,
            }
        )
    return structured


def attach_dq_remark_fields(row_out: dict, dq_remarks: str | None) -> None:
    """Add dq_remarks string and dq_failed_remarks list to a row dict."""
    row_out["dq_remarks"] = str(dq_remarks) if dq_remarks is not None else ""
    row_out["dq_failed_remarks"] = parse_dq_remarks(dq_remarks)
