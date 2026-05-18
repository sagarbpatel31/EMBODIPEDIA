"""End-to-end pipeline smoke with HydraDB + OpenAI mocked.

Validates that ingest_tweet builds the right MemoryItem metadata shape, and
synthesize_article_from_claims renders footnotes + [citation needed] tags.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import patch


def test_ingest_tweet_writes_canonical(monkeypatch: Any) -> None:
    from apps.agents.extractors import tweet_agent

    captured: dict[str, Any] = {}

    def fake_chat_json(*, system: str, user: str, **_: Any) -> dict[str, Any]:
        return {
            "claims": [
                {
                    "claim_text": "Figure 02 was unveiled on August 6, 2024.",
                    "subject_entity": "Figure 02",
                    "actor_entity": "Brett Adcock",
                    "claim_type": "capability",
                    "claim_polarity": "positive",
                    "perspective": "neutral",
                    "confidence": 0.9,
                    "evidence_strength": "primary",
                    "verifiability": "high",
                },
                {
                    "claim_text": "Figure plans to deploy 100,000 units by 2027.",
                    "subject_entity": "Figure 02",
                    "actor_entity": "Brett Adcock",
                    "claim_type": "timeline",
                    "claim_polarity": "positive",
                    "perspective": "bull",
                    "confidence": 0.55,
                    "evidence_strength": "primary",
                    "verifiability": "low",
                },
            ]
        }

    def fake_add_claim_memory(**kwargs: Any) -> None:
        captured.setdefault("calls", []).append(kwargs)

    monkeypatch.setattr(tweet_agent, "chat_json", fake_chat_json)
    monkeypatch.setattr(tweet_agent.hc, "add_claim_memory", fake_add_claim_memory)

    tweet = {
        "url": "https://x.com/adcock_brett/status/1234",
        "author": "Brett Adcock",
        "author_role": "Figure AI CEO",
        "published_at": "2024-08-06T14:00:00Z",
        "text": "Meet Figure 02. We will deploy 100k units by 2027.",
    }
    claims = tweet_agent.ingest_tweet(tweet, write_to_hydradb=True)

    assert len(claims) == 2
    assert all(c["subject_entity"] == "Figure 02" for c in claims)
    assert claims[0]["perspective"] == "neutral"
    assert claims[1]["confidence"] == "0.55"
    assert len(captured["calls"]) == 2
    assert captured["calls"][0]["sub_tenant"] == "canonical"
    assert captured["calls"][0]["metadata"]["memory_id"].startswith("claim_figure_02_")


def test_synthesis_renders_footnotes_and_citation_needed(monkeypatch: Any) -> None:
    from apps.agents import synthesis_agent

    def fake_chat_text(*, system: str, user: str, **_: Any) -> str:
        # Simulated synthesised prose using two footnote markers + a citation needed.
        return (
            "# Figure 02\n\n"
            "Figure 02 is a humanoid robot from Figure AI [^1]. "
            "The company plans to deploy 100,000 units by 2027 [^2] [citation needed]."
        )

    monkeypatch.setattr(synthesis_agent, "chat_text", fake_chat_text)

    claims = [
        {"metadata": {"claim_text": "Figure 02 was unveiled.", "confidence": 0.9,
                       "source_url": "https://x.com/a/1", "evidence_strength": "primary"}},
        {"metadata": {"claim_text": "100k units by 2027.", "confidence": 0.55,
                       "source_url": "https://x.com/a/2", "evidence_strength": "primary"}},
    ]
    result = synthesis_agent.synthesize_article_from_claims("Figure 02", claims)

    assert "[^1]" in result["markdown"]
    assert "[^2]" in result["markdown"]
    assert result["citation_needed_count"] == 1
    assert result["claims"][0]["metadata"]["footnote_id"] == 1
    assert result["claims"][1]["metadata"]["footnote_id"] == 2
