"""Ingest hand-pasted Adcock tweets from data/seed_tweets.yaml into HydraDB.

Usage:
    python -m scripts.ingest_tweets
    python -m scripts.ingest_tweets --dry-run         # extract but don't write
    python -m scripts.ingest_tweets --downgrade-last  # force a [citation needed] test
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
from apps.agents.extractors.tweet_agent import ingest_tweet  # noqa: E402


SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_tweets.yaml"


def load_tweets(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"missing {path}")
    raw = yaml.safe_load(path.read_text()) or {}
    tweets = raw.get("tweets") or []
    if not tweets:
        raise SystemExit(
            f"no tweets in {path} — hand-paste 5 Adcock tweets per the file header"
        )
    return tweets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="extract but don't write to HydraDB")
    parser.add_argument(
        "--downgrade-last",
        action="store_true",
        help="manually downgrade confidence on the last extracted claim to test [citation needed]",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="delete every existing memory in the canonical sub-tenant before re-ingesting",
    )
    args = parser.parse_args()

    tweets = load_tweets(SEED_PATH)
    print(f"loaded {len(tweets)} tweets from {SEED_PATH.name}")

    if not args.dry_run:
        try:
            hc.ensure_tenant()
            print(f"tenant '{hc.TENANT_ID}' ready")
        except Exception as err:
            print(f"tenant setup failed: {err}", file=sys.stderr)
            return 1

    if args.wipe and not args.dry_run:
        existing = hc.list_memory_ids(hc.SUB_TENANT_CANONICAL)
        print(f"wiping {len(existing)} existing memories from canonical...")
        for mid in existing:
            hc.delete_memory(hc.SUB_TENANT_CANONICAL, mid)
        print("wipe complete")

    all_claims: list[dict] = []
    for i, tweet in enumerate(tweets, start=1):
        author = tweet.get("author", "?")
        url = tweet.get("url", "?")
        print(f"\n[{i}/{len(tweets)}] {author}: {url}")
        try:
            claims = ingest_tweet(tweet, write_to_hydradb=not args.dry_run)
        except Exception as err:
            print(f"  EXTRACT FAILED: {err}", file=sys.stderr)
            continue
        print(f"  extracted {len(claims)} claims")
        for c in claims:
            print(f"    - [{c['claim_type']}/{c['perspective']}/conf={c['confidence']}] {c['claim_text'][:80]}")
        all_claims.extend(claims)

    if args.downgrade_last and all_claims and not args.dry_run:
        last = all_claims[-1]
        last["confidence"] = "0.50"  # below 0.7 threshold → triggers [citation needed]
        try:
            hc.add_claim_memory(
                sub_tenant=hc.SUB_TENANT_CANONICAL,
                source_id=last["memory_id"],
                title=f"{last['subject_entity']} — {last['claim_type']}",
                text=last["claim_text"],
                metadata=last,
            )
            print(f"\n[downgrade] forced confidence=0.5 on {last['memory_id']} for [citation needed] test")
        except Exception as err:
            print(f"  DOWNGRADE FAILED: {err}", file=sys.stderr)

    print(f"\ntotal: {len(all_claims)} claim memories {'(dry-run)' if args.dry_run else 'written'}")
    if all_claims and args.dry_run:
        Path("data/last_extraction.json").write_text(json.dumps(all_claims, indent=2))
        print("dry-run results dumped to data/last_extraction.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
