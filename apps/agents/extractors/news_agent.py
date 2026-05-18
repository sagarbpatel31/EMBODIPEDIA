"""News extractor — LLM extracts reported facts vs quoted claims from news articles."""
from __future__ import annotations

import hashlib
import re
from typing import Any

from ..hydradb_client import SUB_TENANT_CANONICAL, add_claim_memory
from ..llm import chat_extract

SYSTEM = """\
You are an evidence extractor for Embodipedia, a Wikipedia of humanoid robotics.
Given a news article, extract factual claims about humanoid robots.

Return JSON: {"claims": [...]} where each claim has:
- subject_entity: canonical robot/company name (e.g. "Figure 02", "Tesla Optimus", "π0")
- claim_type: one of capability|deployment|timeline|funding|partnership|milestone|metric
- claim_text: one factual sentence (for reported facts) or attributed quote (for quotes)
- is_reported_fact: true if the journalist states it as fact, false if quoting a source
- quoted_source: name of quoted person/company if is_reported_fact=false
- confidence: float 0-1 (0.9 for reported facts with multiple sources, 0.75 for single-source, 0.65 for company statements)
- perspective: "neutral" for reported facts, "bull" for company PR statements

Extract 3-8 claims. Distinguish reported journalism from company/PR statements.
"""


def ingest_news(
    article: dict[str, Any],
    *,
    write_to_hydradb: bool = True,
) -> list[dict[str, Any]]:
    """Extract claims from a news article dict.

    article keys: title, url, publication, author, published_at, text
    """
    title = article.get("title", "Unknown Article")
    url = article.get("url", "")
    publication = article.get("publication", "")
    author = article.get("author", "")
    published_at = article.get("published_at", "")
    text = article.get("text", "")

    user_msg = f"""Article: {title}
Publication: {publication}
Author: {author}
Published: {published_at}
URL: {url}

Article text:
{text[:4000]}

Extract claims about humanoid robots from this article."""

    raw = chat_extract(SYSTEM, user_msg)
    claims_raw = raw.get("claims") or []

    source_prefix = hashlib.md5(url.encode()).hexdigest()[:8]

    results: list[dict[str, Any]] = []
    for i, c in enumerate(claims_raw):
        subj = c.get("subject_entity") or "Unknown"
        slug = re.sub(r"[^a-z0-9]+", "_", subj.lower()).strip("_")
        source_id = f"claim_{slug}_news_{source_prefix}_{i:02d}"

        conf_raw = c.get("confidence", 0.8)
        conf = f"{float(conf_raw):.2f}"

        meta: dict[str, Any] = {
            "memory_id": source_id,
            "subject_entity": subj,
            "claim_type": c.get("claim_type", "milestone"),
            "claim_text": c.get("claim_text", ""),
            "confidence": conf,
            "perspective": c.get("perspective", "neutral"),
            "evidence_strength": "primary" if c.get("is_reported_fact") else "secondary",
            "source_type": "news",
            "source_url": url,
            "actor_entity": c.get("quoted_source") or author or publication,
            "published_at": published_at,
            "ingested_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        if write_to_hydradb:
            # HYDRADB: canonical sub-tenant — news reporting is grounded evidence
            add_claim_memory(
                sub_tenant=SUB_TENANT_CANONICAL,
                source_id=source_id,
                title=f"{subj} — {meta['claim_type']} (news)",
                text=meta["claim_text"],
                metadata=meta,
            )

        results.append(meta)

    return results
