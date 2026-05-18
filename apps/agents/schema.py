"""Memory metadata schema for Embodipedia.

Phase 0 lays down the type surface. Phase 1 fills in extraction + writes these
shapes to HydraDB. See EMBODIPEDIA_PLAN.md §7 for the canonical spec.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Sub-tenants we route memories to. See plan §5.
SubTenant = Literal["canonical", "bull", "bear", "articles", "agents"]

EntityType = Literal["claim", "source", "event", "benchmark_result", "function"]
SourceType = Literal[
    "tweet", "paper", "blog", "podcast", "news", "filing", "demo_video", "dev_report"
]
EvidenceStrength = Literal["primary", "secondary", "tertiary"]
Perspective = Literal["bull", "bear", "neutral"]
ClaimPolarity = Literal["positive", "negative", "uncertain"]
ClaimType = Literal[
    "capability",
    "timeline",
    "metric",
    "quote",
    "benchmark_result",
    "valuation",
    "deployment",
    "partnership",
    "personnel",
    "funding",
    "architecture",
    "limitation",
    "comparison",
    "opinion",
    "strategy",
]
VerificationStatus = Literal["verified", "unverified", "disputed", "refuted"]


class ClaimMetadata(BaseModel):
    """Metadata block attached to every claim memory written to HydraDB.

    Phase 0: type-only placeholder. Phase 1: populated by tweet_agent and friends.
    """

    # Identity
    memory_id: str
    entity_type: EntityType = "claim"
    subject_entity: str
    actor_entity: Optional[str] = None

    # Provenance
    source_url: str
    source_type: SourceType
    evidence_strength: EvidenceStrength
    source_publisher: Optional[str] = None

    # Temporality
    published_at: datetime
    ingested_at: datetime = Field(default_factory=datetime.utcnow)
    superseded_by: Optional[str] = None
    supersedes: Optional[str] = None
    stale_at: Optional[datetime] = None

    # Perspective routing
    perspective: Perspective
    confidence: float = Field(ge=0.0, le=1.0)

    # Claim semantics
    claim_type: ClaimType
    claim_polarity: ClaimPolarity
    claim_text: str

    # Quality
    verification_status: VerificationStatus = "unverified"
    verified_by_source_id: Optional[str] = None


class HiveLesson(BaseModel):
    """A lesson written to the `agents` sub-tenant for cross-agent learning."""

    lesson_id: str
    subject: str  # author/publication/topic this lesson is about
    lesson_type: Literal[
        "source_reliability", "claim_pattern", "extraction_difficulty"
    ]
    lesson_text: str
    confidence_adjustment: float = 0.0
    observed_in_batch: int = 0
