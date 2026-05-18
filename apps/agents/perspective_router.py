"""Phase 3 — perspective router.

Decides which sub-tenants a claim should be written to:
- canonical: evidence-grounded, measured, or widely reported
- bull: optimistic forward-looking claims, exec PR, growth narrative
- bear: skeptical, missed-timelines, layoffs, contradictions

Same claim may land in multiple sub-tenants (e.g., a strong bull claim with
a primary source also goes to canonical so it appears in the main article).
"""
from __future__ import annotations

from typing import Iterable

from .schema import SubTenant

# Keyword heuristics — keep small, deterministic; LLM does the harder cases.
BULL_KEYWORDS = {
    "will ship", "will launch", "will produce", "will deploy",
    "scale to", "scaling to", "by 2026", "by 2027", "by 2028",
    "tens of thousands", "hundreds of thousands", "millions of",
    "revolutionary", "breakthrough", "first ever", "world's first",
    "ahead of schedule", "exceeds expectations", "raised", "valuation",
    "10x", "100x",
}

BEAR_KEYWORDS = {
    "missed", "delay", "delayed", "slipped", "slipping", "behind schedule",
    "layoff", "layoffs", "shut down", "cancelled", "discontinued",
    "lawsuit", "investigation", "recall", "failure", "underperform",
    "skeptical", "concerns about", "questions about", "criticism",
    "didn't meet", "fell short", "missed target",
    # financial / unit-economics skepticism
    "burning through", "burn rate", "unit economics", "deeply negative",
    "no clear path", "path to profitability", "negative roi", "negative return",
    "cost reduction", "too expensive", "overpriced", "unprofitable",
    "impatient", "growing impatient", "investor concern",
    # deployment / timeline skepticism
    "pushed back", "timeline delay", "unlikely before", "years away",
    "not ready", "not yet", "far from", "still far", "safety hurdle",
    "regulatory hurdle", "liability", "safety incident", "safety concern",
    "underweight", "downgrade", "cuts rating", "bear case",
    "10x improvement", "10x cost", "no evidence", "lacks evidence",
}


def route_claim(
    *,
    claim_text: str,
    perspective: str | None,
    confidence: float,
    evidence_strength: str | None,
    source_type: str | None,
) -> set[SubTenant]:
    """Return set of sub-tenants this claim should be written to.

    Design (revised): `canonical` is the *complete evidence corpus*; `bull`
    and `bear` are perspective projections on top of it. Every claim always
    lands in canonical (so the article body has full coverage), and is
    additionally mirrored to bull/bear when its perspective is non-neutral.
    """
    text_lower = (claim_text or "").lower()
    targets: set[SubTenant] = {"canonical"}

    explicit = (perspective or "").lower()
    if explicit == "bull":
        targets.add("bull")
    elif explicit == "bear":
        targets.add("bear")

    # Keyword fallback augments explicit perspective.
    if any(kw in text_lower for kw in BULL_KEYWORDS):
        targets.add("bull")
    if any(kw in text_lower for kw in BEAR_KEYWORDS):
        targets.add("bear")

    return targets


def routes_summary(targets: Iterable[SubTenant]) -> str:
    """Human-readable routing summary for logs."""
    return "+".join(sorted(targets))
