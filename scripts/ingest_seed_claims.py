"""Ingest pre-cooked claim memories from data/seed_claims.yaml into HydraDB.

These are hand-curated factual claims for the 6 hero demo entities (Phase 2 pre-cooking).
No LLM extraction — claims go directly to HydraDB canonical sub-tenant.

Usage:
    python -m scripts.ingest_seed_claims
    python -m scripts.ingest_seed_claims --dry-run
    python -m scripts.ingest_seed_claims --entity "Tesla Optimus"
    python -m scripts.ingest_seed_claims --wipe
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()

from apps.agents import hydradb_client as hc  # noqa: E402
from apps.agents.perspective_router import route_claim  # noqa: E402

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_claims.yaml"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--entity", help="Only ingest claims for this entity")
    parser.add_argument("--wipe", action="store_true", help="Wipe canonical sub-tenant first")
    args = parser.parse_args()

    raw = yaml.safe_load(SEED_PATH.read_text()) or {}
    all_claims: list[dict] = raw.get("claims") or []

    if args.entity:
        all_claims = [c for c in all_claims if c.get("subject_entity") == args.entity]
        print(f"filtered to {len(all_claims)} claims for '{args.entity}'")
    else:
        print(f"loaded {len(all_claims)} seed claims from {SEED_PATH.name}")

    if not args.dry_run:
        try:
            hc.ensure_tenant()
        except Exception as err:
            print(f"tenant setup failed: {err}", file=sys.stderr)
            return 1

    if args.wipe and not args.dry_run:
        existing = hc.list_memory_ids(hc.SUB_TENANT_CANONICAL)
        print(f"wiping {len(existing)} existing memories...")
        for mid in existing:
            hc.delete_memory(hc.SUB_TENANT_CANONICAL, mid)
        print("wipe complete")

    entities: dict[str, int] = {}
    written = 0
    for c in all_claims:
        subj = c.get("subject_entity", "Unknown")
        slug = re.sub(r"[^a-z0-9]+", "_", subj.lower()).strip("_")

        # Build deterministic source_id from entity + claim_type + first 40 chars of text
        text_key = re.sub(r"[^a-z0-9]+", "_", c.get("claim_text", "")[:40].lower())
        source_id = f"claim_{slug}_{c.get('claim_type', 'misc')}_{text_key[:20]}"

        conf_raw = c.get("confidence", 0.8)
        conf = f"{float(conf_raw):.2f}"

        meta = {
            "memory_id": source_id,
            "subject_entity": subj,
            "claim_type": c.get("claim_type", "misc"),
            "claim_text": c.get("claim_text", ""),
            "confidence": conf,
            "perspective": c.get("perspective", "neutral"),
            "evidence_strength": c.get("evidence_strength", "primary"),
            "source_type": c.get("source_type", "news"),
            "source_url": c.get("source_url", ""),
            "actor_entity": c.get("actor_entity", ""),
            "published_at": c.get("published_at", ""),
            "ingested_at": datetime.utcnow().isoformat() + "Z",
        }

        title = f"{subj} — {meta['claim_type']} ({meta['source_type']})"

        targets = route_claim(
            claim_text=meta["claim_text"],
            perspective=meta["perspective"],
            confidence=float(conf),
            evidence_strength=meta["evidence_strength"],
            source_type=meta["source_type"],
        )

        if args.dry_run:
            print(f"  [DRY] {source_id} → {sorted(targets)}: {meta['claim_text'][:70]}...")
        else:
            ok = False
            for target in targets:
                try:
                    hc.add_claim_memory(
                        sub_tenant=target,
                        source_id=source_id,
                        title=title,
                        text=meta["claim_text"],
                        metadata=meta,
                    )
                    ok = True
                except Exception as err:
                    print(f"  FAILED {source_id} → {target}: {err}", file=sys.stderr)
            if ok:
                written += 1
                entities[subj] = entities.get(subj, 0) + 1
                print(f"  ✓ [{conf}] {sorted(targets)} {subj}: {meta['claim_text'][:70]}...")

    if args.dry_run:
        print(f"\ndry-run: would write {len(all_claims)} claims")
    else:
        print(f"\nwritten {written} claim memories")
        for entity, count in sorted(entities.items()):
            print(f"  {entity}: {count} claims")
        print("\nHydraDB indexes async — wait ~60s then hit /api/wiki/<entity>")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
