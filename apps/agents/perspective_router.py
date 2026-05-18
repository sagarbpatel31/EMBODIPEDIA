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

    Routing rules (CLAUDE.md §7 derivative):
    - LLM-provided `perspective` is the primary signal
    - Keyword heuristics catch obvious bull/bear language the LLM missed
    - Strong evidence (primary + conf >= 0.85) always goes to canonical too
    """
    targets: set[SubTenant] = set()
    text_lower = (claim_text or "").lower()

    explicit = (perspective or "").lower()
    if explicit == "bull":
        targets.add("bull")
    elif explicit == "bear":
        targets.add("bear")
    elif explicit in ("neutral", "canonical", ""):
        targets.add("canonical")

    # Keyword fallback augments explicit perspective.
    if any(kw in text_lower for kw in BULL_KEYWORDS):
        targets.add("bull")
    if any(kw in text_lower for kw in BEAR_KEYWORDS):
        targets.add("bear")

    # Strong evidence always lands in canonical for the main article.
    if (evidence_strength == "primary" and confidence >= 0.85) or source_type == "paper":
        targets.add("canonical")

    # Safety: every claim goes somewhere.
    if not targets:
        targets.add("canonical")

    return targets


def routes_summary(targets: Iterable[SubTenant]) -> str:
    """Human-readable routing summary for logs."""
    return "+".join(sorted(targets))
