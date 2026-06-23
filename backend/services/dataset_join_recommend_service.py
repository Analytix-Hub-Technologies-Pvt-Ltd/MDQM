"""Recommend join key pairs between a base dataset and a new data source (Groq + heuristics)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You recommend SQL-style join key column pairs between two datasets.
Rules:
- Use ONLY column names from the provided left (base) and right (new source) lists.
- Return ONLY valid JSON, no markdown.
- Schema:
  {"join_keys":[{"left_key":"CUSTOMER_ID","right_key":"customer_id","confidence":0.95,"reason":"Same identifier"}],"summary":"Join on customer id"}
- Suggest 1-4 pairs when composite keys are likely (e.g. order_id + line_no).
- Prefer columns with matching semantics: id, code, key, foreign keys, natural keys.
- confidence is 0.0-1.0. reason is one short sentence.
- If no good match, return {"join_keys":[],"summary":"No confident join keys found"}"""


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
        nc = _normalize_key(col)
        if target in nc or nc in target:
            return col
    return None


def _score_pair(left: str, right: str) -> float:
    nl, nr = _normalize_key(left), _normalize_key(right)
    if not nl or not nr:
        return 0.0
    if nl == nr:
        return 1.0
    if nl.endswith(nr) or nr.endswith(nl):
        return 0.85
    if nl in nr or nr in nl:
        return 0.7
    id_markers = ("id", "code", "key", "num", "no", "number", "ref")
    if any(m in nl for m in id_markers) and any(m in nr for m in id_markers):
        return 0.55
    return 0.0


def _heuristic_recommend(left_columns: list[str], right_columns: list[str]) -> dict[str, Any]:
    pairs: list[dict[str, Any]] = []
    used_right: set[str] = set()
    scored: list[tuple[float, str, str]] = []
    for lc in left_columns:
        for rc in right_columns:
            score = _score_pair(lc, rc)
            if score >= 0.55:
                scored.append((score, lc, rc))
    scored.sort(key=lambda x: (-x[0], x[1], x[2]))
    for score, lc, rc in scored:
        if rc in used_right:
            continue
        pairs.append(
            {
                "left_key": lc,
                "right_key": rc,
                "confidence": round(score, 2),
                "reason": "Column names match or align semantically",
            }
        )
        used_right.add(rc)
        if len(pairs) >= 4:
            break
    summary = (
        f"Suggested {len(pairs)} join key pair(s) from column name matching"
        if pairs
        else "No confident join keys found from column names"
    )
    return {"join_keys": pairs, "summary": summary, "source": "heuristic"}


def recommend_join_keys(
    *,
    left_columns: list[str],
    right_columns: list[str],
    left_sample: list[dict[str, Any]] | None = None,
    right_sample: list[dict[str, Any]] | None = None,
    left_label: str = "base dataset",
    right_label: str = "new source",
) -> dict[str, Any]:
    left_cols = [str(c).strip() for c in left_columns if str(c).strip()]
    right_cols = [str(c).strip() for c in right_columns if str(c).strip()]
    if not left_cols or not right_cols:
        return {"join_keys": [], "summary": "Both datasets need columns before suggesting join keys.", "source": "none"}

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return _heuristic_recommend(left_cols, right_cols)

    try:
        from groq import Groq

        from services.groq_description_service import GROQ_DEFAULT_MODEL, GROQ_TIMEOUT_SECONDS

        model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
        client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS + 5, max_retries=0)
        lines = [
            f"Base dataset ({left_label}) columns:",
            *[f"- {c}" for c in left_cols],
            f"New source ({right_label}) columns:",
            *[f"- {c}" for c in right_cols],
        ]
        if left_sample:
            lines.append("Base sample rows:")
            lines.append(json.dumps(left_sample[:5], default=str)[:2000])
        if right_sample:
            lines.append("New source sample rows:")
            lines.append(json.dumps(right_sample[:5], default=str)[:2000])

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(lines)},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        raw = (response.choices[0].message.content or "").strip() if response.choices else ""
        payload = _parse_llm_json(raw)
        keys_in = payload.get("join_keys") if isinstance(payload.get("join_keys"), list) else []
        keys_out: list[dict[str, Any]] = []
        used_right: set[str] = set()
        for item in keys_in:
            if not isinstance(item, dict):
                continue
            lk = _resolve_column(str(item.get("left_key") or ""), left_cols)
            rk = _resolve_column(str(item.get("right_key") or ""), right_cols)
            if not lk or not rk or rk in used_right:
                continue
            used_right.add(rk)
            keys_out.append(
                {
                    "left_key": lk,
                    "right_key": rk,
                    "confidence": float(item.get("confidence") or 0.8),
                    "reason": str(item.get("reason") or "").strip() or "Suggested by AI",
                }
            )
            if len(keys_out) >= 4:
                break
        if not keys_out:
            return _heuristic_recommend(left_cols, right_cols)
        return {
            "join_keys": keys_out,
            "summary": str(payload.get("summary") or "").strip() or f"Suggested {len(keys_out)} join key pair(s)",
            "source": "llm",
        }
    except Exception as exc:
        logger.info("Join recommend LLM fallback: %s", exc)
        out = _heuristic_recommend(left_cols, right_cols)
        out["llm_unavailable"] = str(exc)
        return out
