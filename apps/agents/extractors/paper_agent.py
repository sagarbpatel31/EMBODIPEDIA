"""Paper/arXiv extractor — LLM extracts claim memories from research paper text."""
from __future__ import annotations

import hashlib
import re
from typing import Any

from ..hydradb_client import SUB_TENANT_CANONICAL, add_claim_memory
from ..llm import chat_json as chat_extract

SYSTEM = """\
You are an evidence extractor for Embodipedia, a Wikipedia of humanoid robotics.
Given research paper text (title, abstract, or section), extract factual claims about humanoid robots.

Return JSON: {"claims": [...]} where each claim has:
- subject_entity: canonical robot/company name (e.g. "Figure 02", "Tesla Optimus", "π0")
- claim_type: one of capability|benchmark|architecture|deployment|timeline|funding|partnership|metric
- claim_text: one factual sentence, precise, with numbers if stated
- confidence: float 0-1 (1.0 for measured results, 0.85 for stated specs, 0.7 for claims)
- perspective: "neutral" for papers (empirical results are neutral)
- evidence_strength: "primary" for direct measurements, "secondary" for cited prior work

Extract 3-8 claims. Focus on concrete numbers, benchmarks, and architecture facts.
"""


def ingest_paper(
    paper: dict[str, Any],
    *,
    write_to_hydradb: bool = True,
) -> list[dict[str, Any]]:
    """Extract claims from a research paper dict.

    paper keys: title, url, authors, published_at, abstract, text (optional full text)
    """
    title = paper.get("title", "Unknown Paper")
    url = paper.get("url", "")
    authors = paper.get("authors", "")
    published_at = paper.get("published_at", "")
    abstract = paper.get("abstract", paper.get("text", ""))

    user_msg = f"""Paper: {title}
Authors: {authors}
Published: {published_at}
URL: {url}

Abstract / Text:
{abstract[:3000]}

Extract claims about humanoid robots from this paper."""

    raw = chat_extract(system=SYSTEM, user=user_msg)
    claims_raw = raw.get("claims") or []

    source_prefix = hashlib.md5(url.encode()).hexdigest()[:8]

    results: list[dict[str, Any]] = []
    for i, c in enumerate(claims_raw):
        subj = c.get("subject_entity") or "Unknown"
        slug = re.sub(r"[^a-z0-9]+", "_", subj.lower()).strip("_")
        source_id = f"claim_{slug}_paper_{source_prefix}_{i:02d}"

        conf_raw = c.get("confidence", 0.8)
        conf = f"{float(conf_raw):.2f}"

        meta: dict[str, Any] = {
            "memory_id": source_id,
            "subject_entity": subj,
            "claim_type": c.get("claim_type", "capability"),
            "claim_text": c.get("claim_text", ""),
            "confidence": conf,
            "perspective": c.get("perspective", "neutral"),
            "evidence_strength": c.get("evidence_strength", "primary"),
            "source_type": "paper",
            "source_url": url,
            "actor_entity": authors.split(",")[0].strip() if authors else "",
            "published_at": published_at,
            "ingested_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        if write_to_hydradb:
            # HYDRADB: canonical sub-tenant — papers are empirical evidence, always neutral
            add_claim_memory(
                sub_tenant=SUB_TENANT_CANONICAL,
                source_id=source_id,
                title=f"{subj} — {meta['claim_type']} (paper)",
                text=meta["claim_text"],
                metadata=meta,
            )

        results.append(meta)

    return results
