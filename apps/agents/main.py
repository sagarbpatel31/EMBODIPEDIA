"""Embodipedia agent backend — FastAPI entry point.

Phase 1 endpoints:
  GET  /health                       — liveness + key presence
  GET  /api/wiki/{slug}              — synthesize a Wikipedia article on demand
  POST /api/ingest/tweet             — ingest a single tweet (debug helper)
"""
from __future__ import annotations

import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Embodipedia Agents", version="0.1.0")

# Next.js dev runs on :3000 — same-origin in prod, CORS-permitted in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "FastAPI up",
        "hydradb_key_set": bool(os.getenv("HYDRADB_API_KEY")),
        "openai_key_set": bool(os.getenv("OPENAI_API_KEY")),
    }


def _slug_to_entity(slug: str) -> str:
    # /wiki/Figure_02 -> "Figure 02"
    return re.sub(r"_+", " ", slug).strip()


@app.get("/api/wiki/{slug}")
def get_wiki_article(
    slug: str,
    as_of: str | None = None,
    perspective: str | None = None,
) -> dict[str, Any]:
    """Synthesize an entity article.
    - as_of=YYYY-MM-DD: time-travel filter
    - perspective=bull|bear|canonical: render from a single sub-tenant POV
    """
    from .synthesis_agent import synthesize_article

    entity = _slug_to_entity(slug)
    try:
        result = synthesize_article(entity, as_of=as_of, perspective=perspective)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))

    # Compute article quality from claim count + primary-source ratio.
    claims = result["claims"]
    n = len(claims)
    primary = sum(
        1
        for c in claims
        if ((c.get("metadata") or {}).get("evidence_strength") or "") == "primary"
    )
    if n >= 8 and primary >= 5:
        quality = "featured"
    elif n >= 4 and primary >= 2:
        quality = "good"
    elif n >= 1:
        quality = "stub"
    else:
        quality = "empty"

    ingested_dates = [
        (c.get("metadata") or {}).get("ingested_at") for c in claims
    ]
    ingested_dates = [d for d in ingested_dates if d]
    last_ingested = max(ingested_dates) if ingested_dates else None

    return {
        "slug": slug,
        "entity": entity,
        "as_of": as_of,
        "perspective": perspective or "canonical",
        "markdown": result["markdown"],
        "citation_needed_count": result["citation_needed_count"],
        "claim_count": n,
        "primary_source_count": primary,
        "quality": quality,
        "last_ingested_at": last_ingested,
        "references": [
            {
                "footnote_id": (c.get("metadata") or {}).get("footnote_id"),
                "source_url": (c.get("metadata") or {}).get("source_url"),
                "claim_text": (c.get("metadata") or {}).get("claim_text") or c.get("content"),
                "source_type": c.get("source_type") or (c.get("metadata") or {}).get("source_type"),
                "published_at": (c.get("metadata") or {}).get("published_at"),
                "confidence": (c.get("metadata") or {}).get("confidence"),
                "actor_entity": (c.get("metadata") or {}).get("actor_entity"),
            }
            for c in claims
        ],
    }


@app.get("/api/links/{slug}")
def what_links_here(slug: str, max_per_entity: int = 3) -> dict[str, Any]:
    """Find other entities whose claims mention this entity.

    Uses sub-tenant recall with the entity name as query, then fuzzy-matches
    the entity name in claim text. Global recall is unreliable on free tier,
    so we rely on per-sub-tenant recall with a high max_results budget.
    """
    from . import hydradb_client as hc

    entity = _slug_to_entity(slug)
    # Build short-name variants for fuzzy matching (e.g. "Figure 03" → also match "Figure")
    entity_lower = entity.lower()
    entity_parts = [w for w in entity_lower.split() if len(w) > 2]

    chunks: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    # HYDRADB: recall canonical with the entity name to surface cross-entity mentions.
    # Using max_results=250 gets the full corpus; we post-filter by claim text.
    for sub in (hc.SUB_TENANT_CANONICAL, hc.SUB_TENANT_BULL, hc.SUB_TENANT_BEAR):
        try:
            for c in hc.recall_subtenant(sub_tenant=sub, query=entity, max_results=250):
                mid = (c.get("metadata") or {}).get("memory_id") or c.get("id") or ""
                if mid and mid not in seen_ids:
                    seen_ids.add(mid)
                    chunks.append(c)
        except Exception:
            continue

    by_entity: dict[str, list[dict[str, Any]]] = {}
    for c in chunks:
        meta = c.get("metadata") or {}
        subj = meta.get("subject_entity") or ""
        claim = meta.get("claim_text") or c.get("content") or ""
        claim_lower = claim.lower()
        subj_lower = subj.lower()

        # Skip: no subject, or subject IS the entity we're looking up
        if not subj or subj_lower == entity_lower:
            continue
        # Skip: claim doesn't actually mention the entity (full name OR key parts)
        full_name_match = entity_lower in claim_lower
        parts_match = len(entity_parts) > 0 and all(p in claim_lower for p in entity_parts[:2])
        if not (full_name_match or parts_match):
            continue

        by_entity.setdefault(subj, []).append(
            {
                "claim_text": claim,
                "source_url": meta.get("source_url"),
                "source_type": meta.get("source_type"),
                "perspective": meta.get("perspective"),
                "confidence": meta.get("confidence"),
            }
        )

    incoming = [
        {
            "subject_entity": k,
            "slug": k.replace(" ", "_"),
            "mentions": v[:max_per_entity],
            "count": len(v),
        }
        for k, v in by_entity.items()
    ]
    incoming.sort(key=lambda e: e["count"], reverse=True)
    return {"entity": entity, "slug": slug, "incoming": incoming, "total": sum(e["count"] for e in incoming)}


@app.post("/api/refresh/{slug}")
def refresh_entity(slug: str) -> dict[str, Any]:
    """Self-healing trigger — refresh an entity's claim memories.

    Phase 5 minimal: re-runs the seed_claims ingestion for the specific entity
    so all metadata is freshly written. Phase 6 will fan out to fresh source
    fetching + re-extraction.
    """
    import yaml
    from pathlib import Path
    from .extractors.tweet_agent import _slugify  # noqa
    from .perspective_router import route_claim
    from datetime import datetime

    entity = _slug_to_entity(slug)
    seed_path = Path(__file__).resolve().parent.parent.parent / "data" / "seed_claims.yaml"
    if not seed_path.exists():
        raise HTTPException(status_code=500, detail="seed_claims.yaml missing")

    raw = yaml.safe_load(seed_path.read_text()) or {}
    all_claims = raw.get("claims") or []
    matched = [c for c in all_claims if c.get("subject_entity") == entity]

    from . import hydradb_client as hc

    written = 0
    for c in matched:
        subj = c["subject_entity"]
        sid = f"claim_{_slugify(subj)}_{c.get('claim_type', 'misc')}_{abs(hash(c.get('claim_text', ''))) % 100000}"
        conf = float(c.get("confidence", 0.8))
        meta = {
            "memory_id": sid,
            "subject_entity": subj,
            "claim_type": c.get("claim_type"),
            "claim_text": c.get("claim_text"),
            "confidence": f"{conf:.2f}",
            "perspective": c.get("perspective", "neutral"),
            "evidence_strength": c.get("evidence_strength", "primary"),
            "source_type": c.get("source_type", "news"),
            "source_url": c.get("source_url", ""),
            "actor_entity": c.get("actor_entity", ""),
            "published_at": c.get("published_at", ""),
            "ingested_at": datetime.utcnow().isoformat() + "Z",
        }
        targets = route_claim(
            claim_text=meta["claim_text"],
            perspective=meta["perspective"],
            confidence=conf,
            evidence_strength=meta["evidence_strength"],
            source_type=meta["source_type"],
        )
        for target in targets:
            try:
                hc.add_claim_memory(
                    sub_tenant=target,
                    source_id=sid,
                    title=f"{subj} — {meta['claim_type']}",
                    text=meta["claim_text"],
                    metadata=meta,
                )
                written += 1
            except Exception:
                pass

    return {"entity": entity, "refreshed_claims": written}


@app.get("/api/talk/{slug}")
def get_talk_page(slug: str) -> dict[str, Any]:
    from .talk_synthesizer import synthesize_talk_page

    entity = _slug_to_entity(slug)
    try:
        result = synthesize_talk_page(entity)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
    return {
        "slug": slug,
        "entity": entity,
        "markdown": result["markdown"],
        "references": result["references"],
        "bull_count": result["bull_count"],
        "bear_count": result["bear_count"],
    }


@app.get("/api/ask")
def ask_embodipedia(q: str, k: int = 10) -> dict[str, Any]:
    """Cmd+K command palette backend — global hybrid recall with synthesis."""
    from . import hydradb_client as hc
    from .llm import SYNTHESIS_MODEL, chat_text

    if not q.strip():
        raise HTTPException(status_code=400, detail="empty query")

    # HYDRADB: full_recall is hybrid (vector + lexical) with graph_context=True
    # for multi-hop questions. Falls back to per-sub-tenant recall if global
    # comes back empty (free-tier HydraDB indexer can be flaky).
    chunks: list[dict[str, Any]] = []
    try:
        chunks = hc.recall_global(q, max_results=k)
    except Exception:
        chunks = []
    if not chunks:
        seen: set[str] = set()
        for sub in (hc.SUB_TENANT_CANONICAL, hc.SUB_TENANT_BULL, hc.SUB_TENANT_BEAR):
            try:
                sub_chunks = hc.recall_subtenant(sub_tenant=sub, query=q, max_results=k)
            except Exception:
                continue
            for c in sub_chunks:
                sid = (c.get("metadata") or {}).get("memory_id") or c.get("id")
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                chunks.append(c)
        # Take top-k by score after merging.
        chunks.sort(key=lambda c: c.get("score") or 0, reverse=True)
        chunks = chunks[:k]

    if not chunks:
        return {
            "answer": "_No matching claims found in Embodipedia. The HydraDB indexer may still be catching up — try again in 30 seconds._",
            "chunks": [],
            "entity_paths": {"nodes": [], "edges": []},
        }

    # Build a compact context block for the LLM.
    ctx_lines = ["Answer the question using ONLY the provided claims. Cite each fact as [^N] referencing the claim number. If the claims don't answer, say so."]
    ctx_lines.append(f"\nQuestion: {q}\n\nClaims:")
    for i, c in enumerate(chunks, start=1):
        meta = c.get("metadata") or {}
        ctx_lines.append(
            f"[{i}] {meta.get('subject_entity', '?')}: {meta.get('claim_text') or c.get('content', '')[:300]}"
        )

    answer = chat_text(
        system="You are Embodipedia's question-answering agent. Be concise, cite every fact with [^N], and never invent claims.",
        user="\n".join(ctx_lines),
        model=SYNTHESIS_MODEL,
        temperature=0.2,
    )

    # Build entity graph for visualization: nodes = entities + actors,
    # edges = "actor claims about entity" derived from chunks themselves.
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    for c in chunks:
        meta = c.get("metadata") or {}
        subj = (meta.get("subject_entity") or "").strip()
        actor = (meta.get("actor_entity") or "").strip()
        if subj:
            nodes.setdefault(subj, {"id": subj, "label": subj, "kind": "entity"})
        if actor and actor != subj:
            nodes.setdefault(actor, {"id": actor, "label": actor, "kind": "actor"})
            if subj:
                edges.append({"source": actor, "target": subj, "relation": "claims about"})

    return {
        "answer": answer,
        "chunks": [
            {
                "footnote_id": i + 1,
                "subject_entity": (c.get("metadata") or {}).get("subject_entity"),
                "claim_text": (c.get("metadata") or {}).get("claim_text") or c.get("content"),
                "source_url": (c.get("metadata") or {}).get("source_url"),
                "source_type": (c.get("metadata") or {}).get("source_type"),
                "actor_entity": (c.get("metadata") or {}).get("actor_entity"),
            }
            for i, c in enumerate(chunks)
        ],
        "entity_paths": {"nodes": list(nodes.values()), "edges": edges},
    }


@app.get("/api/history/{slug}")
def article_history(slug: str) -> dict[str, Any]:
    """Per-entity history feed — claims sorted by ingested_at desc.

    Sourced from HydraDB recall metadata. Phase 4 will add immutable edit
    log; for now we synthesize history from each claim's ingested_at +
    published_at + confidence.
    """
    from . import hydradb_client as hc

    entity = _slug_to_entity(slug)
    entries: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for sub in (hc.SUB_TENANT_CANONICAL, hc.SUB_TENANT_BULL, hc.SUB_TENANT_BEAR):
        try:
            chunks = hc.recall_subtenant(
                sub_tenant=sub,
                query=f"everything known about {entity}",
                max_results=40,
            )
        except Exception:
            continue
        for c in chunks:
            meta = c.get("metadata") or {}
            mid = meta.get("memory_id") or c.get("source_id")
            if not mid or mid in seen_ids:
                continue
            seen_ids.add(mid)
            entries.append(
                {
                    "memory_id": mid,
                    "sub_tenant": sub,
                    "subject_entity": meta.get("subject_entity"),
                    "claim_type": meta.get("claim_type"),
                    "claim_text": meta.get("claim_text") or c.get("content"),
                    "confidence": meta.get("confidence"),
                    "perspective": meta.get("perspective"),
                    "source_type": meta.get("source_type"),
                    "source_url": meta.get("source_url"),
                    "actor_entity": meta.get("actor_entity"),
                    "published_at": meta.get("published_at"),
                    "ingested_at": meta.get("ingested_at"),
                }
            )

    entries.sort(key=lambda e: e.get("ingested_at") or "", reverse=True)
    return {"entity": entity, "slug": slug, "count": len(entries), "entries": entries}


@app.get("/api/recent")
def recent_changes(limit: int = 80) -> dict[str, Any]:
    """Recent claim ingestions sorted by ingested_at descending.

    Uses recall on canonical with a broad query and high max_results to
    retrieve the full corpus with metadata, then sorts by ingested_at.
    list_data only returns memory_id + empty content, so recall is the
    correct path for metadata-bearing results.
    """
    from . import hydradb_client as hc

    # HYDRADB: recall canonical with max_results=250 to cover the full corpus.
    # The broad humanoid robotics query returns all stored claims ranked by
    # relevance; we then re-sort by ingested_at for the chronological feed.
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        chunks = hc.recall_subtenant(
            sub_tenant=hc.SUB_TENANT_CANONICAL,
            query="humanoid robotics claims",
            max_results=250,
        )
    except Exception:
        chunks = []

    for c in chunks:
        meta = c.get("metadata") or {}
        mid = meta.get("memory_id") or c.get("source_id") or c.get("id")
        if not mid or mid in seen:
            continue
        seen.add(mid)
        items.append(
            {
                "memory_id": mid,
                "sub_tenant": hc.SUB_TENANT_CANONICAL,
                "subject_entity": meta.get("subject_entity"),
                "claim_type": meta.get("claim_type"),
                "claim_text": meta.get("claim_text") or c.get("content"),
                "confidence": meta.get("confidence"),
                "perspective": meta.get("perspective"),
                "source_type": meta.get("source_type"),
                "source_url": meta.get("source_url"),
                "actor_entity": meta.get("actor_entity"),
                "published_at": meta.get("published_at"),
                "ingested_at": meta.get("ingested_at"),
            }
        )

    # Sort: real ingested_at timestamps descending; null timestamps sink to bottom.
    items.sort(
        key=lambda e: e.get("ingested_at") or "0",
        reverse=True,
    )
    return {"count": len(items), "items": items[:limit]}


class TweetIn(BaseModel):
    url: str
    author: str
    author_role: str | None = None
    published_at: str
    text: str


@app.post("/api/ingest/tweet")
def ingest_one_tweet(tweet: TweetIn) -> dict[str, Any]:
    from .extractors.tweet_agent import ingest_tweet

    try:
        claims = ingest_tweet(tweet.model_dump(), write_to_hydradb=True)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
    return {"claims_written": len(claims), "claims": claims}


if __name__ == "__main__":
    import uvicorn

    print("FastAPI up")
    uvicorn.run(
        "apps.agents.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
