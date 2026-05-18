"""OpenAI client wrapper — GPT-4o for extraction + synthesis.

Cheapest fast tier per Sagar's hackathon pick. Uses JSON-mode for extractors.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Optional

EXTRACTION_MODEL = "gpt-4o-mini"  # cheap + fast for per-tweet extraction
SYNTHESIS_MODEL = "gpt-4o"         # slightly larger for article-quality prose


@lru_cache(maxsize=1)
def _client() -> Any:
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set — add it to .env")
    return OpenAI(api_key=api_key)


def chat_json(
    *,
    system: str,
    user: str,
    model: str = EXTRACTION_MODEL,
    temperature: float = 0.2,
) -> Any:
    """Single-shot chat completion returning parsed JSON. Empty list on failure."""
    resp = _client().chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def chat_text(
    *,
    system: str,
    user: str,
    model: str = SYNTHESIS_MODEL,
    temperature: float = 0.3,
) -> str:
    resp = _client().chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""
