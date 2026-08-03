"""Recommend column mappings between base dataset and a joined data source (Groq + heuristics)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You map columns from a BASE dataset to columns in a NEW joined data source.
Rules:
- Use ONLY column names from the provided base and source lists.
- Return ONLY valid JSON, no markdown.
- Schema:
  {"column_mappings":[{"base_column":"customer_id","source_column":"Customer_id","confidence":0.95,"reason":"Same customer identifier"}],"summary":"Mapped id and name fields"}
- Map as many clear semantic matches as possible (same meaning, even if casing/spacing differs).
- confidence is 0.0-1.0. reason is one short sentence.
- Do not invent column names.
- If no good match, return {"column_mappings":[],"summary":"No confident column mappings found"}"""


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
    return re.sub(r"[\s_\-]+", "", (name or "").strip().lower())


def _resolve_column(name: str, available: list[str]) -> str | None:
    if not name or not available:
        return None
    target = _normalize_key(name)
    for col in available:
        if _normalize_key(col) == target:
            return col
    for col in available:
        nc = _normalize_key(col)
        if target and (target in nc or nc in target) and abs(len(nc) - len(target)) <= 4:
            return col
    return None


def _score_pair(base: str, source: str) -> float:
    nb, ns = _normalize_key(base), _normalize_key(source)
    if not nb or not ns:
        return 0.0
    if nb == ns:
        return 1.0
    if nb.endswith(ns) or ns.endswith(nb):
        return 0.88
    if nb in ns or ns in nb:
        return 0.75
    return 0.0


def _heuristic_recommend(base_columns: list[str], source_columns: list[str]) -> dict[str, Any]:
    pairs: list[dict[str, Any]] = []
    used_source: set[str] = set()
    scored: list[tuple[float, str, str]] = []
    for bc in base_columns:
        for sc in source_columns:
            score = _score_pair(bc, sc)
            if score >= 0.75:
                scored.append((score, bc, sc))
    scored.sort(key=lambda x: (-x[0], x[1], x[2]))
    for score, bc, sc in scored:
        if sc in used_source:
            continue
        pairs.append(
            {
                "base_column": bc,
                "source_column": sc,
                "confidence": round(score, 2),
                "reason": "Column names match or align",
            }
        )
        used_source.add(sc)
    summary = (
        f"Suggested {len(pairs)} column mapping(s) from name matching"
        if pairs
        else "No confident column mappings found from column names"
    )
    return {"column_mappings": pairs, "summary": summary, "source": "heuristic"}


def recommend_column_mappings(
    *,
    base_columns: list[str],
    source_columns: list[str],
    base_sample: list[dict[str, Any]] | None = None,
    source_sample: list[dict[str, Any]] | None = None,
    base_label: str = "base dataset",
    source_label: str = "joined source",
) -> dict[str, Any]:
    base_cols = [str(c).strip() for c in base_columns if str(c).strip()]
    source_cols = [str(c).strip() for c in source_columns if str(c).strip()]
    if not base_cols or not source_cols:
        return {
            "column_mappings": [],
            "summary": "Both datasets need columns before suggesting mappings.",
            "source": "none",
        }

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return _heuristic_recommend(base_cols, source_cols)

    try:
        from groq import Groq

        from services.groq_description_service import GROQ_DEFAULT_MODEL, GROQ_TIMEOUT_SECONDS

        model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
        client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS + 5, max_retries=0)
        lines = [
            f"Base dataset ({base_label}) columns:",
            *[f"- {c}" for c in base_cols],
            f"Joined source ({source_label}) columns:",
            *[f"- {c}" for c in source_cols],
        ]
        if base_sample:
            lines.append("Base sample rows:")
            lines.append(json.dumps(base_sample[:5], default=str)[:2000])
        if source_sample:
            lines.append("Joined source sample rows:")
            lines.append(json.dumps(source_sample[:5], default=str)[:2000])

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(lines)},
            ],
            temperature=0.1,
            max_tokens=800,
        )
        raw = (response.choices[0].message.content or "").strip() if response.choices else ""
        payload = _parse_llm_json(raw)
        mapped_in = payload.get("column_mappings") if isinstance(payload.get("column_mappings"), list) else []
        mapped_out: list[dict[str, Any]] = []
        used_source: set[str] = set()
        for item in mapped_in:
            if not isinstance(item, dict):
                continue
            bc = _resolve_column(str(item.get("base_column") or ""), base_cols)
            sc = _resolve_column(str(item.get("source_column") or ""), source_cols)
            if not bc or not sc or sc in used_source:
                continue
            used_source.add(sc)
            mapped_out.append(
                {
                    "base_column": bc,
                    "source_column": sc,
                    "confidence": float(item.get("confidence") or 0.8),
                    "reason": str(item.get("reason") or "").strip() or "Suggested by AI",
                }
            )
        if not mapped_out:
            return _heuristic_recommend(base_cols, source_cols)
        return {
            "column_mappings": mapped_out,
            "summary": str(payload.get("summary") or "").strip()
            or f"Suggested {len(mapped_out)} column mapping(s)",
            "source": "llm",
        }
    except Exception as exc:
        logger.info("Column mapping LLM fallback: %s", exc)
        out = _heuristic_recommend(base_cols, source_cols)
        out["llm_unavailable"] = str(exc)
        return out
