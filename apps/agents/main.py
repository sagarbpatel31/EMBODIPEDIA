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
def get_wiki_article(slug: str) -> dict[str, Any]:
    from .synthesis_agent import synthesize_article

    entity = _slug_to_entity(slug)
    try:
        result = synthesize_article(entity)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
    return {
        "slug": slug,
        "entity": entity,
        "markdown": result["markdown"],
        "citation_needed_count": result["citation_needed_count"],
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
            for c in result["claims"]
        ],
    }


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
