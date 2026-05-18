"""Wipe all sub-tenant memories and re-ingest from seed data.

Run from repo root:
    python3 scripts/wipe_and_reingest.py
"""
import os
import sys

# Explicit .env path — avoids find_dotenv() frame assertion errors
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from apps.agents import hydradb_client as hc

SUB_TENANTS = ("canonical", "bull", "bear", "agents")


def wipe():
    print("=== Wiping all sub-tenants ===")
    for sub in SUB_TENANTS:
        ids = hc.list_memory_ids(sub)
        print(f"  {sub}: {len(ids)} memories → deleting...")
        for mid in ids:
            hc.delete_memory(sub, mid)
        print(f"  {sub}: done")
    print("Wipe complete.\n")


if __name__ == "__main__":
    wipe()
    print("Now run:")
    print("  python3 -m scripts.ingest_seed_claims")
    print("  python3 -m scripts.ingest_tweets")
    print("  python3 -m scripts.ingest_sources")
