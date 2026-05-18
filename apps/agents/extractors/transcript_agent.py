"""Transcript extractor — LLM extracts speaker-attributed claims from podcast/talk transcripts."""
from __future__ import annotations

import hashlib
import re
from typing import Any

from ..hydradb_client import SUB_TENANT_CANONICAL, add_claim_memory
from ..llm import chat_extract

SYSTEM = """\
You are an evidence extractor for Embodipedia, a Wikipedia of humanoid robotics.
Given a podcast, interview, or talk transcript, extract factual claims about humanoid robots.

Return JSON: {"claims": [...]} where each claim has:
- subject_entity: canonical robot/company name (e.g. "Figure 02", "Tesla Optimus", "π0")
- speaker: the person who made this claim
- claim_type: one of capability|deployment|timeline|funding|partnership|strategy|vision
- claim_text: one factual sentence, attributed to speaker if a forward-looking claim
- confidence: float 0-1 (0.85 for exec statements, 0.7 for vague/aspirational claims)
- perspective: "bull" if optimistic/promotional, "bear" if skeptical/critical, "neutral" if factual

Extract 4-10 claims. Include speaker attribution in claim_text for forward-looking statements.
Flag confidence < 0.7 for unsubstantiated forward-looking claims.
"""


def ingest_transcript(
    transcript: dict[str, Any],
    *,
    write_to_hydradb: bool = True,
) -> list[dict[str, Any]]:
    """Extract claims from a transcript dict.

    transcript keys: title, url, speaker, role, published_at, text
    """
    title = transcript.get("title", "Unknown Transcript")
    url = transcript.get("url", "")
    speaker = transcript.get("speaker", "")
    role = transcript.get("role", "")
    published_at = transcript.get("published_at", "")
    text = transcript.get("text", "")

    user_msg = f"""Source: {title}
Speaker: {speaker} ({role})
Published: {published_at}
URL: {url}

Transcript excerpt:
{text[:4000]}

Extract claims about humanoid robots made in this transcript."""

    raw = chat_extract(SYSTEM, user_msg)
    claims_raw = raw.get("claims") or []

    source_prefix = hashlib.md5(url.encode()).hexdigest()[:8]

    results: list[dict[str, Any]] = []
    for i, c in enumerate(claims_raw):
        subj = c.get("subject_entity") or "Unknown"
        slug = re.sub(r"[^a-z0-9]+", "_", subj.lower()).strip("_")
        source_id = f"claim_{slug}_transcript_{source_prefix}_{i:02d}"

        conf_raw = c.get("confidence", 0.75)
        conf = f"{float(conf_raw):.2f}"

        perspective = c.get("perspective", "neutral")

        meta: dict[str, Any] = {
            "memory_id": source_id,
            "subject_entity": subj,
            "claim_type": c.get("claim_type", "strategy"),
            "claim_text": c.get("claim_text", ""),
            "confidence": conf,
            "perspective": perspective,
            "evidence_strength": "secondary",
            "source_type": "transcript",
            "source_url": url,
            "actor_entity": c.get("speaker") or speaker,
            "published_at": published_at,
            "ingested_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        if write_to_hydradb:
            # HYDRADB: canonical sub-tenant for all transcripts in Phase 1-2;
            # bull/bear routing added in Phase 3
            add_claim_memory(
                sub_tenant=SUB_TENANT_CANONICAL,
                source_id=source_id,
                title=f"{subj} — {meta['claim_type']} (transcript)",
                text=meta["claim_text"],
                metadata=meta,
            )

        results.append(meta)

    return results
