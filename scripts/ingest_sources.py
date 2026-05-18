"""Ingest Phase 2 sources (papers, transcripts, news) via LLM extraction into HydraDB.

Usage:
    python -m scripts.ingest_sources
    python -m scripts.ingest_sources --dry-run
    python -m scripts.ingest_sources --type paper      # only papers
    python -m scripts.ingest_sources --type transcript
    python -m scripts.ingest_sources --type news
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()

from apps.agents import hydradb_client as hc  # noqa: E402
from apps.agents.extractors.paper_agent import ingest_paper  # noqa: E402
from apps.agents.extractors.transcript_agent import ingest_transcript  # noqa: E402
from apps.agents.extractors.news_agent import ingest_news  # noqa: E402

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_sources_phase2.yaml"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--type", choices=["paper", "transcript", "news"], help="Only ingest this source type")
    args = parser.parse_args()

    raw = yaml.safe_load(SEED_PATH.read_text()) or {}

    if not args.dry_run:
        try:
            hc.ensure_tenant()
            print(f"tenant '{hc.TENANT_ID}' ready")
        except Exception as err:
            print(f"tenant setup failed: {err}", file=sys.stderr)
            return 1

    all_claims: list[dict] = []

    # Papers
    if not args.type or args.type == "paper":
        papers = raw.get("papers") or []
        print(f"\n=== Papers ({len(papers)}) ===")
        for paper in papers:
            print(f"\n  [{paper.get('published_at', '?')[:10]}] {paper.get('title', '?')[:60]}")
            try:
                claims = ingest_paper(paper, write_to_hydradb=not args.dry_run)
                print(f"  → {len(claims)} claims extracted")
                for c in claims:
                    print(f"    [{c['claim_type']}/conf={c['confidence']}] {c['claim_text'][:70]}")
                all_claims.extend(claims)
            except Exception as err:
                print(f"  FAILED: {err}", file=sys.stderr)

    # Transcripts
    if not args.type or args.type == "transcript":
        transcripts = raw.get("transcripts") or []
        print(f"\n=== Transcripts ({len(transcripts)}) ===")
        for t in transcripts:
            print(f"\n  [{t.get('published_at', '?')[:10]}] {t.get('speaker', '?')}: {t.get('title', '?')[:50]}")
            try:
                claims = ingest_transcript(t, write_to_hydradb=not args.dry_run)
                print(f"  → {len(claims)} claims extracted")
                for c in claims:
                    print(f"    [{c['claim_type']}/conf={c['confidence']}] {c['claim_text'][:70]}")
                all_claims.extend(claims)
            except Exception as err:
                print(f"  FAILED: {err}", file=sys.stderr)

    # News
    if not args.type or args.type == "news":
        news = raw.get("news") or []
        print(f"\n=== News ({len(news)}) ===")
        for article in news:
            print(f"\n  [{article.get('published_at', '?')[:10]}] {article.get('title', '?')[:60]}")
            try:
                claims = ingest_news(article, write_to_hydradb=not args.dry_run)
                print(f"  → {len(claims)} claims extracted")
                for c in claims:
                    print(f"    [{c['claim_type']}/conf={c['confidence']}] {c['claim_text'][:70]}")
                all_claims.extend(claims)
            except Exception as err:
                print(f"  FAILED: {err}", file=sys.stderr)

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Total: {len(all_claims)} claims")

    if args.dry_run and all_claims:
        Path("data/last_extraction_phase2.json").write_text(json.dumps(all_claims, indent=2))
        print("dry-run results → data/last_extraction_phase2.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
