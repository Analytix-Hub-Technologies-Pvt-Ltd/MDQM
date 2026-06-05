"""Generate business-friendly column descriptions via Groq LLM."""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"
GROQ_TIMEOUT_SECONDS = 15.0

_SYSTEM_PROMPT = """You write concise business-friendly data dictionary descriptions for database columns.
Rules:
- One sentence only, under 120 characters when possible.
- Plain language for business users, not technical jargon.
- Do not mention SQL, snapshots, ingestion, or MDQM.
- Return only the description text, no quotes, labels, or prefix."""

_EXAMPLE_LINES = (
    "CUSTOMER_ID -> Unique identifier assigned to each customer.\n"
    "ORDER_DATE -> Date when the order was created.\n"
    "EMAIL -> Customer email address used for communication."
)


def _build_user_prompt(column_name: str, data_type: str | None, table_name: str | None) -> str:
    lines = [f"Column: {column_name}"]
    if data_type:
        lines.append(f"Data type: {data_type}")
    if table_name:
        lines.append(f"Table: {table_name}")
    lines.append(f"Examples:\n{_EXAMPLE_LINES}")
    return "\n".join(lines)


def _normalize_description(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r'^["\']|["\']$', "", cleaned)
    cleaned = re.sub(r"^(description|answer)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def generate_column_description(
    column_name: str,
    data_type: str | None,
    table_name: str | None = None,
) -> str:
    """
    Call Groq chat completions to produce a short business-friendly column description.
    Raises on missing API key, timeout, or empty response.
    """
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    from groq import Groq

    model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
    client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS, max_retries=0)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(column_name, data_type, table_name)},
        ],
        temperature=0.2,
        max_tokens=80,
    )

    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()

    description = _normalize_description(raw)
    if not description:
        raise ValueError("Empty response from Groq")

    return description
