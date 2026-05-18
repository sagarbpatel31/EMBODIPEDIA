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
def get_wiki_article(slug: str, as_of: str | None = None) -> dict[str, Any]:
    """Synthesize an entity article. Optional as_of=YYYY-MM-DD enables time-travel
    by filtering claims to those whose published_at <= as_of before synthesis.
    """
    from .synthesis_agent import synthesize_article

    entity = _slug_to_entity(slug)
    try:
        result = synthesize_article(entity, as_of=as_of)
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

    Uses a global recall for the entity name and groups returned chunks by their
    subject_entity. Filters out self-matches.
    """
    from . import hydradb_client as hc

    entity = _slug_to_entity(slug)
    try:
        chunks = hc.recall_global(query=entity, max_results=40)
    except Exception:
        chunks = []

    by_entity: dict[str, list[dict[str, Any]]] = {}
    for c in chunks:
        meta = c.get("metadata") or {}
        subj = meta.get("subject_entity")
        claim = meta.get("claim_text") or c.get("content") or ""
        if not subj or subj.lower() == entity.lower():
            continue
        if entity.lower() not in claim.lower():
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
    # so we get entity_paths back for multi-hop questions.
    chunks = hc.recall_global(q, max_results=k)

    if not chunks:
        return {"answer": "_No matching claims found in Embodipedia._", "chunks": [], "entity_paths": []}

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
        "entity_paths": [],  # Phase 5 — populated from HydraDB graph_context
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
def recent_changes(limit: int = 30) -> dict[str, Any]:
    """Recent claim ingestions across all sub-tenants."""
    from . import hydradb_client as hc

    # HYDRADB: list memories from canonical (where most claims land) and sort
    # by ingested_at desc on the metadata side.
    out: list[dict[str, Any]] = []
    for sub in (hc.SUB_TENANT_CANONICAL, hc.SUB_TENANT_BULL, hc.SUB_TENANT_BEAR):
        try:
            ids = hc.list_memory_ids(sub)
        except Exception:
            ids = []
        for mid in ids[:limit]:
            out.append({"memory_id": mid, "sub_tenant": sub})
    return {"count": len(out), "items": out[:limit]}


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
