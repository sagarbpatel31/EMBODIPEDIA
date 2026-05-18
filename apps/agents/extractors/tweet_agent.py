"""Tweet extractor — LLM extracts claim memories from a single tweet.

Prompt mirrors docs/agent_prompts.md §1. Phase 1 writes to `canonical` only;
Phase 3 enables perspective routing (bull/bear).
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Optional

from .. import hydradb_client as hc
from ..llm import EXTRACTION_MODEL, chat_json

SYSTEM_PROMPT = """\
You are an editorial agent for Embodipedia, an AI-maintained Wikipedia of the
humanoid robotics industry. Your role: extract verifiable factual claims from
a tweet and structure them as encyclopedia source entries.

You ONLY extract claims that are:
1. About a humanoid robotics company, product, person, or capability
2. Specific enough to be cited in an encyclopedia article
3. Verifiable in principle (not pure opinion or speculation)

You IGNORE:
- Vague hype ("we're going to change the world")
- Pure marketing language without specifics
- Memes, jokes, off-topic content

Output JSON object with key "claims" containing an array. Empty array if nothing extractable.

Each claim object:
{
  "claim_text": "complete sentence",
  "subject_entity": "canonical entity name (e.g. 'Figure 02')",
  "actor_entity": "who made the claim (usually tweet author)",
  "claim_type": "capability | timeline | metric | quote | benchmark_result | valuation | deployment | partnership | personnel | funding",
  "claim_polarity": "positive | negative | uncertain",
  "perspective": "bull | bear | neutral",
  "confidence": 0.0-1.0,
  "evidence_strength": "primary | secondary | tertiary",
  "verifiability": "high | medium | low"
}

Confidence calibration:
- 0.9+: Direct quote, specific number, clear timestamp
- 0.7-0.9: Specific claim, some interpretation needed
- 0.5-0.7: Implied claim, vague but extractable
- <0.5: Don't extract

Perspective:
- neutral: Verifiable fact / dated event
- bull: Optimistic capability/timeline/market claim
- bear: Skeptical, critical, admission of difficulty

Evidence:
- primary: First-person claim from a relevant actor
- secondary: Third-party report
- tertiary: Aggregator
"""


def _user_prompt(tweet: dict[str, Any]) -> str:
    return (
        f"Tweet author: {tweet.get('author', 'unknown')}\n"
        f"Tweet author's role: {tweet.get('author_role', 'unknown')}\n"
        f"Tweet URL: {tweet.get('url', '')}\n"
        f"Tweet date: {tweet.get('published_at', '')}\n"
        f'Tweet text:\n"""\n{tweet.get("text", "")}\n"""\n\n'
        'Output: JSON object with key "claims" (array of claim objects).'
    )


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")[:40] or "x"


def _memory_id(subject: str, url: str, idx: int) -> str:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"claim_{_slugify(subject)}_{h}_{idx:02d}"


def extract_claims_from_tweet(tweet: dict[str, Any]) -> list[dict[str, Any]]:
    """Run LLM extraction. Returns raw claim dicts (not yet written to HydraDB)."""
    payload = chat_json(
        system=SYSTEM_PROMPT,
        user=_user_prompt(tweet),
        model=EXTRACTION_MODEL,
        temperature=0.2,
    )
    raw_claims = payload.get("claims") if isinstance(payload, dict) else None
    if not isinstance(raw_claims, list):
        return []
    return [c for c in raw_claims if isinstance(c, dict) and c.get("claim_text")]


def ingest_tweet(
    tweet: dict[str, Any],
    *,
    write_to_hydradb: bool = True,
    sub_tenant: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Extract + (optionally) write claim memories to HydraDB. Returns the metadata
    dicts that were (or would be) written.

    Phase 1 forces sub_tenant=canonical regardless of perspective tag.
    Phase 3 will route on `perspective` per plan §7.
    """
    claims = extract_claims_from_tweet(tweet)
    written: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()
    url = tweet.get("url", "")
    published_at = tweet.get("published_at", "")

    for idx, c in enumerate(claims):
        subject = c.get("subject_entity") or "unknown"
        memory_id = _memory_id(subject, url, idx)
        target_sub_tenant = sub_tenant or hc.SUB_TENANT_CANONICAL
        metadata = {
            "memory_id": memory_id,
            "entity_type": "claim",
            "subject_entity": subject,
            "actor_entity": c.get("actor_entity") or tweet.get("author"),
            "source_url": url,
            "source_type": "tweet",
            "evidence_strength": c.get("evidence_strength") or "primary",
            "source_publisher": tweet.get("author"),
            "published_at": published_at,
            "ingested_at": now,
            "perspective": c.get("perspective") or "neutral",
            # HydraDB metadata strips non-string values — store confidence as string.
            "confidence": f"{float(c.get('confidence') or 0.5):.2f}",
            "claim_type": c.get("claim_type") or "capability",
            "claim_polarity": c.get("claim_polarity") or "positive",
            "claim_text": c["claim_text"],
            "verification_status": "unverified",
        }
        if write_to_hydradb:
            hc.add_claim_memory(
                sub_tenant=target_sub_tenant,
                source_id=memory_id,
                title=f"{subject} — {c.get('claim_type', 'claim')}",
                text=c["claim_text"],
                metadata=metadata,
            )
        written.append(metadata)
    return written
