"""Synthesis agent — compose Wikipedia article prose from HydraDB claim memories.

Phase 1: query canonical sub-tenant for an entity, generate one prose paragraph
with footnoted citations, apply [citation needed] tag on low-confidence claims.
Phase 3: extend to query bull/bear and weave debate hints.
"""
from __future__ import annotations

from typing import Any

from . import hydradb_client as hc
from .llm import SYNTHESIS_MODEL, chat_text

CONFIDENCE_THRESHOLD = 0.7   # plan rule 8 — below this triggers [citation needed]

SYNTHESIS_SYSTEM_PROMPT = """\
You are a Wikipedia editor for Embodipedia. Your role: take a set of claim
memories about an entity and write a Wikipedia article body.

Editorial rules (non-negotiable):

1. Every prose sentence MUST be groundable in the provided claims. Do not
   invent facts. Do not synthesize content unsupported by the claims.

2. Every claim in your prose MUST end with a footnote marker [^N] referencing
   the claim's `footnote_id` value.

3. If a claim has confidence < 0.7 OR no primary-source support, append the
   inline tag [citation needed] AFTER the footnote marker. Example:
   "Figure 02 will ship 100k units by 2027 [^4] [citation needed]."

4. Write in Wikipedia's encyclopedic voice: third person, neutral tone, no
   hype words ("revolutionary", "groundbreaking"), no marketing language,
   specific over general, past tense for events, present tense for ongoing
   facts.

5. Structure: lead paragraph (2-4 sentences defining the entity + key facts),
   then optional sections (History, Capabilities, Deployments) only if claims
   support them. Use `##` for section headers.

6. Output Markdown only. Do not include References section — generated separately.
"""


def _build_user_prompt(entity: str, claims: list[dict[str, Any]]) -> str:
    lines = [
        f"Write a Wikipedia article body for the entity: {entity}",
        "",
        "Available claim memories (use only these — invent nothing):",
        "",
    ]
    for i, c in enumerate(claims, start=1):
        meta = c.get("metadata") or {}
        text = meta.get("claim_text") or c.get("content") or ""
        try:
            confidence = float(meta.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        evidence = meta.get("evidence_strength", "secondary")
        source_url = meta.get("source_url", "")
        lines.append(
            f"[{i}] footnote_id={i} | confidence={confidence} | evidence={evidence}\n"
            f"    claim: {text}\n"
            f"    source: {source_url}"
        )
    lines += [
        "",
        "Output the Wikipedia article body. Use [^N] for footnotes and "
        "[citation needed] after low-confidence claims per the rules.",
    ]
    return "\n".join(lines)


def synthesize_article(entity: str, *, max_claims: int = 30) -> dict[str, Any]:
    """Recall claims for an entity and synthesize an article body.

    Returns a dict with `entity`, `markdown`, `claims` (the source claims used,
    each with footnote_id), and `citation_needed_count` (post-render count).
    """
    # HYDRADB: query canonical sub-tenant for this entity. Phase 3 will fan out
    # to bull/bear and weave the debate hints into the prose.
    # NOTE: metadata_filters shape on HydraDB recall is not yet pinned down —
    # initial test returned 0 results even when metadata clearly matched.
    # For Phase 1's small corpus we trust relevance ranking + post-filter on
    # subject_entity. Re-enable filter in Phase 4 once shape is confirmed.
    raw = hc.recall_subtenant(
        sub_tenant=hc.SUB_TENANT_CANONICAL,
        query=f"everything known about {entity}",
        max_results=max_claims,
    )
    # Post-filter on subject_entity for precision.
    chunks = [
        c for c in raw
        if (c.get("metadata") or {}).get("subject_entity", "").lower() == entity.lower()
    ] or raw

    # Attach footnote IDs in stable order.
    for i, chunk in enumerate(chunks, start=1):
        meta = chunk.get("metadata") or {}
        meta["footnote_id"] = i
        chunk["metadata"] = meta

    if not chunks:
        return {
            "entity": entity,
            "markdown": f"# {entity}\n\nNo claims available yet. [citation needed]\n",
            "claims": [],
            "citation_needed_count": 1,
        }

    markdown = chat_text(
        system=SYNTHESIS_SYSTEM_PROMPT,
        user=_build_user_prompt(entity, chunks),
        model=SYNTHESIS_MODEL,
        temperature=0.3,
    )

    citation_needed_count = markdown.count("[citation needed]")
    return {
        "entity": entity,
        "markdown": markdown,
        "claims": chunks,
        "citation_needed_count": citation_needed_count,
    }


def synthesize_article_from_claims(
    entity: str, claims: list[dict[str, Any]]
) -> dict[str, Any]:
    """Synthesis path that bypasses HydraDB recall — useful for tests + dev mode.

    `claims` is a list of dicts shaped like {"metadata": {...claim metadata}}.
    """
    for i, chunk in enumerate(claims, start=1):
        meta = chunk.setdefault("metadata", {})
        meta["footnote_id"] = i

    if not claims:
        return {
            "entity": entity,
            "markdown": f"# {entity}\n\nNo claims available yet. [citation needed]\n",
            "claims": [],
            "citation_needed_count": 1,
        }

    markdown = chat_text(
        system=SYNTHESIS_SYSTEM_PROMPT,
        user=_build_user_prompt(entity, claims),
        model=SYNTHESIS_MODEL,
        temperature=0.3,
    )
    return {
        "entity": entity,
        "markdown": markdown,
        "claims": claims,
        "citation_needed_count": markdown.count("[citation needed]"),
    }
