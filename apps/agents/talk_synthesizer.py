"""Phase 3 — Talk page content synthesizer.

Recalls bull-side and bear-side claims for an entity, then asks the LLM to
draft Open Questions, Active Debates, and Supersession Log sections.

If bull/bear sub-tenants are empty, falls back to extracting debate signal
from canonical claims based on confidence + perspective metadata.
"""
from __future__ import annotations

from typing import Any

from . import hydradb_client as hc
from .llm import SYNTHESIS_MODEL, chat_text

TALK_PROMPT = """\
You are a Wikipedia Talk page editor for Embodipedia (humanoid robotics).

Given a set of BULL-side and BEAR-side claim memories about an entity, draft
three sections in clean Wikipedia Talk-page voice:

## Open Questions
3-5 sharply-worded questions about claims where neither side has strong
evidence. Each one labelled by claim_type. Cite at most one footnote per item.
End each question with the relevant footnote [^N] if any.

## Active Debates
The 2-3 strongest disagreements between bull and bear claims. Format each as:

### Debate: [topic]
**Bull view:** one-sentence summary [^N]
**Bear view:** one-sentence summary [^N]
**Status:** unresolved | leaning bull | leaning bear (with a brief why)

## Supersession Log
List 1-3 claims that have been weakened by newer or stronger evidence.
Each item: "Earlier claim that X [^N] — superseded by Y [^M] (published YYYY-MM-DD)."
If no clear supersession candidates exist, write: "*No claims have been
superseded yet.*"

Rules:
- Every assertion needs a footnote [^N] from the provided claims.
- Do not invent debates the claims don't support.
- If a section has no material, write a one-sentence italic note saying so.
- Output Markdown only, no preamble.
"""


def _fmt_claims_for_prompt(label: str, claims: list[dict[str, Any]], offset: int) -> str:
    if not claims:
        return f"{label} claims: (none)\n"
    out = [f"{label} claims:"]
    for i, c in enumerate(claims, start=offset):
        meta = c.get("metadata") or {}
        text = meta.get("claim_text") or c.get("content") or ""
        try:
            conf = float(meta.get("confidence", 0.5))
        except (TypeError, ValueError):
            conf = 0.5
        src = meta.get("source_type", "?")
        actor = meta.get("actor_entity", "")
        date = (meta.get("published_at") or "")[:10]
        out.append(
            f"[{i}] footnote_id={i} | conf={conf:.2f} | {src} | {actor} | {date}\n"
            f"    {text}"
        )
    return "\n".join(out) + "\n"


def synthesize_talk_page(entity: str, *, max_per_side: int = 15) -> dict[str, Any]:
    """Build Talk page content for an entity.

    Returns {'entity', 'markdown', 'references': [...], 'bull_count', 'bear_count'}.
    """
    # HYDRADB: pull bull-side and bear-side recalls separately. Different
    # sub-tenants = different lanes; we keep their footnote numbering disjoint
    # so the rendered Talk page lets users trace each side back to source.
    bull = hc.recall_subtenant(
        sub_tenant=hc.SUB_TENANT_BULL,
        query=f"forward-looking optimistic claims about {entity}",
        max_results=max_per_side,
    )
    bear = hc.recall_subtenant(
        sub_tenant=hc.SUB_TENANT_BEAR,
        query=f"skepticism, missed timelines, contradictions about {entity}",
        max_results=max_per_side,
    )

    # Fallback: if bull/bear lanes are empty, harvest debate signal from canonical.
    if not bull and not bear:
        canon = hc.recall_subtenant(
            sub_tenant=hc.SUB_TENANT_CANONICAL,
            query=f"everything known about {entity}",
            max_results=max_per_side * 2,
        )
        for c in canon:
            meta = c.get("metadata") or {}
            p = (meta.get("perspective") or "").lower()
            if p == "bull":
                bull.append(c)
            elif p == "bear":
                bear.append(c)

    bull_off = 1
    bear_off = bull_off + len(bull)

    for i, c in enumerate(bull, start=bull_off):
        meta = c.get("metadata") or {}
        meta["footnote_id"] = i
        c["metadata"] = meta
    for i, c in enumerate(bear, start=bear_off):
        meta = c.get("metadata") or {}
        meta["footnote_id"] = i
        c["metadata"] = meta

    if not bull and not bear:
        return {
            "entity": entity,
            "markdown": (
                f"## Open Questions\n\n*No contested claims have surfaced for "
                f"{entity} yet — agents are still routing perspectives.*\n\n"
                f"## Active Debates\n\n*Debates appear here once bull/bear "
                f"sub-tenants accumulate disagreeing claims.*\n\n"
                f"## Supersession Log\n\n*No supersessions logged.*\n"
            ),
            "references": [],
            "bull_count": 0,
            "bear_count": 0,
        }

    user = (
        f"Entity: {entity}\n\n"
        + _fmt_claims_for_prompt("BULL", bull, bull_off)
        + "\n"
        + _fmt_claims_for_prompt("BEAR", bear, bear_off)
        + "\n\nDraft the Talk page sections per the rules."
    )

    markdown = chat_text(
        system=TALK_PROMPT,
        user=user,
        model=SYNTHESIS_MODEL,
        temperature=0.3,
    )

    references: list[dict[str, Any]] = []
    for c in bull + bear:
        meta = c.get("metadata") or {}
        references.append(
            {
                "footnote_id": meta.get("footnote_id"),
                "actor_entity": meta.get("actor_entity"),
                "source_url": meta.get("source_url"),
                "source_type": meta.get("source_type"),
                "published_at": meta.get("published_at"),
                "confidence": meta.get("confidence"),
                "claim_text": meta.get("claim_text"),
                "perspective": meta.get("perspective"),
            }
        )

    return {
        "entity": entity,
        "markdown": markdown,
        "references": references,
        "bull_count": len(bull),
        "bear_count": len(bear),
    }
