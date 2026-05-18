"""Thin Embodipedia wrapper over the HydraDB Python SDK.

SDK install: `pip install hydradb-sdk` (package import: `hydra_db`, class: `HydraDB`).
Signatures + namespaces verified live via inspect on Phase 0 install.

Key shapes used here (Python form — snake_case methods + params):
  HydraDB(token=...)
  client.tenant.create(tenant_id=...)
  client.tenant.get_infra_status(tenant_id=...)
  client.upload.add_memory(
      tenant_id=..., sub_tenant_id=..., upsert=True,
      memories=[MemoryItem(source_id, title, text, is_markdown, infer, metadata={...})]
  )
  client.upload.knowledge(
      tenant_id=..., sub_tenant_id=..., upsert=True,
      files=[(filename, bytes, content_type)],
      file_metadata=json.dumps([{"metadata": {...}}]),
  )
  client.recall.recall_preferences(
      tenant_id, query, sub_tenant_id, max_results,
      alpha, recency_bias, graph_context, metadata_filters={...},
  )
  client.recall.full_recall(  # same kwargs as recall_preferences
      tenant_id, query, sub_tenant_id, ..., metadata_filters={...},
  )
  client.fetch.graph_relations_by_source_id(tenant_id=..., source_id=...)
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional

from .schema import SubTenant

TENANT_ID = "embodipedia"

# Sub-tenant routing constants — see plan §5.
SUB_TENANT_CANONICAL: SubTenant = "canonical"  # evidence-grounded ground truth
SUB_TENANT_BULL: SubTenant = "bull"            # optimistic narrative claims
SUB_TENANT_BEAR: SubTenant = "bear"            # skeptical narrative claims
SUB_TENANT_ARTICLES: SubTenant = "articles"    # synthesized wiki prose
SUB_TENANT_AGENTS: SubTenant = "agents"        # hive memories (cross-agent lessons)


_client: Optional[Any] = None


def _get_client() -> Any:
    """Lazy singleton — defers SDK import until a real call is needed."""
    global _client
    if _client is not None:
        return _client
    from hydra_db import HydraDB

    token = os.environ.get("HYDRADB_API_KEY")
    if not token:
        raise RuntimeError("HYDRADB_API_KEY not set — add it to .env")
    _client = HydraDB(token=token)
    return _client


def _memory_item(**kwargs: Any) -> Any:
    """Build a MemoryItem; isolated so tests can monkey-patch without importing SDK."""
    from hydra_db.types.memory_item import MemoryItem

    return MemoryItem(**kwargs)


# ---------------------------------------------------------------------------
# Tenant lifecycle
# ---------------------------------------------------------------------------


def ensure_tenant() -> None:
    """Create the embodipedia tenant if missing. Idempotent."""
    # HYDRADB: one tenant per project; sub-tenants do the perspective slicing.
    client = _get_client()
    try:
        client.tenant.create(tenant_id=TENANT_ID)
    except Exception as err:
        msg = str(err).lower()
        if any(k in msg for k in ("already exists", "409", "conflict", "plan limit", "403")):
            return
        raise


def check_connection() -> bool:
    try:
        client = _get_client()
        client.tenant.get_infra_status(tenant_id=TENANT_ID)
        return True
    except Exception:
        try:
            ensure_tenant()
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def add_claim_memory(
    sub_tenant: SubTenant,
    source_id: str,
    title: str,
    text: str,
    *,
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """Write a claim memory to a perspective sub-tenant.

    sub_tenant=canonical for neutral evidence-grounded claims; bull/bear for
    perspective-tagged claims (plan §7 routing rules).
    """
    # HYDRADB: add_memory writes to a specific sub-tenant so we get isolated
    # bull/bear/canonical recall lanes downstream. Metadata stored on the
    # MemoryItem.metadata dict — queryable via recall metadata_filters.
    client = _get_client()
    item = _memory_item(
        source_id=source_id,
        title=title,
        text=text,
        is_markdown=True,
        infer=True,
        metadata=metadata or {},
    )
    return client.upload.add_memory(
        tenant_id=TENANT_ID,
        sub_tenant_id=sub_tenant,
        memories=[item],
        upsert=True,
    )


def delete_memory(sub_tenant: SubTenant, memory_id: str) -> None:
    """Wipe a single memory by source_id. Swallows not-found errors."""
    # HYDRADB: upsert preserves old metadata, so when claim shape changes we
    # must delete + re-add to refresh stored fields.
    client = _get_client()
    try:
        client.upload.delete_memory(
            tenant_id=TENANT_ID,
            sub_tenant_id=sub_tenant,
            memory_id=memory_id,
        )
    except Exception as err:
        msg = str(err).lower()
        if "not found" in msg or "404" in msg:
            return
        # swallow other errors — best-effort cleanup


def list_memory_ids(sub_tenant: SubTenant) -> list[str]:
    """List every memory_id in a sub-tenant. Paginates through all pages."""
    # HYDRADB: list_data returns 50 per page with pagination metadata.
    # Must iterate pages until has_next=False to get all IDs.
    client = _get_client()
    ids: list[str] = []
    page = 1
    while True:
        try:
            result = client.fetch.list_data(
                tenant_id=TENANT_ID,
                sub_tenant_id=sub_tenant,
                kind="memories",
                page=page,
            )
        except Exception:
            break
        data = _as_dict(result) if not isinstance(result, dict) else result
        memories = data.get("user_memories") or data.get("memories") or data.get("sources") or []
        for m in memories:
            md = _as_dict(m) if not isinstance(m, dict) else m
            mid = md.get("memory_id") or md.get("id") or md.get("source_id")
            if mid:
                ids.append(mid)
        pagination = data.get("pagination") or {}
        if not pagination.get("has_next"):
            break
        page += 1
    return ids


def add_hive_lesson(lesson_id: str, title: str, text: str, *, metadata: Optional[dict[str, Any]] = None) -> Any:
    """Write a cross-agent lesson to the `agents` sub-tenant."""
    # HYDRADB: agents sub-tenant is the hive — every extractor reads from here
    # before processing, and writes lessons back after each batch.
    return add_claim_memory(
        sub_tenant=SUB_TENANT_AGENTS,
        source_id=lesson_id,
        title=title,
        text=text,
        metadata=metadata,
    )


def upload_article(source_id: str, title: str, markdown: str, metadata: Optional[dict[str, Any]] = None) -> Any:
    """Upload a synthesized wiki article body to the `articles` sub-tenant."""
    # HYDRADB: articles sub-tenant stores synthesized prose distinct from raw
    # claim memories — keeps Wikipedia output queryable without polluting evidence.
    client = _get_client()
    body = markdown.encode("utf-8")
    file_metadata = json.dumps([{"metadata": metadata or {"title": title}}])
    return client.upload.knowledge(
        tenant_id=TENANT_ID,
        sub_tenant_id=SUB_TENANT_ARTICLES,
        files=[(f"{source_id}.md", body, "text/markdown")],
        file_metadata=file_metadata,
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Recalls
# ---------------------------------------------------------------------------


def recall_subtenant(
    sub_tenant: SubTenant,
    query: str,
    *,
    max_results: int = 20,
    metadata_filters: Optional[dict[str, Any]] = None,
    graph_context: bool = False,
) -> list[dict[str, Any]]:
    """Sub-tenant scoped recall — workhorse for bull/bear/canonical lanes."""
    # HYDRADB: recall_preferences is preference-optimised for sub-tenant scope.
    # metadata_filters powers Phase 4 time-travel slider (filter on published_at).
    client = _get_client()
    kwargs: dict[str, Any] = dict(
        tenant_id=TENANT_ID,
        sub_tenant_id=sub_tenant,
        query=query,
        max_results=max_results,
    )
    if metadata_filters:
        kwargs["metadata_filters"] = metadata_filters
    if graph_context:
        kwargs["graph_context"] = True
    result = client.recall.recall_preferences(**kwargs)
    return _normalize_chunks(result)


def recall_global(
    query: str,
    *,
    max_results: int = 20,
    sub_tenant: Optional[SubTenant] = None,
    metadata_filters: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    """Full hybrid recall — for Cmd+K "Ask Embodipedia" + entity_paths queries."""
    # HYDRADB: full_recall is hybrid (vector + lexical) w/ graph_context=True
    # so entity_paths come back for multi-hop questions.
    client = _get_client()
    kwargs: dict[str, Any] = dict(
        tenant_id=TENANT_ID,
        query=query,
        max_results=max_results,
        alpha=0.7,
        recency_bias=0.3,
        graph_context=True,
    )
    if sub_tenant:
        kwargs["sub_tenant_id"] = sub_tenant
    if metadata_filters:
        kwargs["metadata_filters"] = metadata_filters
    result = client.recall.full_recall(**kwargs)
    return _normalize_chunks(result)


def graph_relations(source_id: str) -> dict[str, list[dict[str, Any]]]:
    """Fetch the entity graph centred on a single source memory."""
    # HYDRADB: powers "What Links Here" + Cmd+K entity-path visualization.
    client = _get_client()
    try:
        result = client.fetch.graph_relations_by_source_id(
            tenant_id=TENANT_ID,
            source_id=source_id,
        )
        return _transform_graph(result)
    except Exception:
        return {"nodes": [], "edges": []}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return {k: getattr(obj, k) for k in dir(obj) if not k.startswith("_")}


def _normalize_chunks(body: Any) -> list[dict[str, Any]]:
    """Join chunks ↔ sources. Source-level metadata holds our claim schema;
    chunk-level metadata is empty in the current SDK response."""
    data = _as_dict(body) if not isinstance(body, dict) else body
    chunks = data.get("chunks") or []
    sources = data.get("sources") or []
    source_meta: dict[str, dict[str, Any]] = {}
    for s in sources:
        sd = _as_dict(s) if not isinstance(s, dict) else s
        sid = sd.get("id") or sd.get("source_id")
        if sid:
            source_meta[sid] = sd
    out: list[dict[str, Any]] = []
    for c in chunks:
        cd = _as_dict(c) if not isinstance(c, dict) else c
        sid = cd.get("source_id") or ""
        sd = source_meta.get(sid, {})
        title = cd.get("source_title") or sd.get("title") or sid or "Memory item"
        content = cd.get("chunk_content") or ""
        metadata = sd.get("metadata") or cd.get("metadata") or cd.get("document_metadata")
        out.append(
            {
                "id": cd.get("chunk_uuid") or sid or "unknown",
                "source_id": sid,
                "title": title,
                "content": content,
                "score": cd.get("relevancy_score") or 0,
                "source_type": cd.get("source_type") or (metadata or {}).get("source_type"),
                "metadata": metadata,
            }
        )
    return out


def _transform_graph(body: Any) -> dict[str, list[dict[str, Any]]]:
    data = _as_dict(body) if not isinstance(body, dict) else body
    relations = data.get("relations") or data.get("triplets") or []
    node_map: dict[str, dict[str, str]] = {}
    edges: list[dict[str, Any]] = []
    for rel in relations:
        rd = _as_dict(rel) if not isinstance(rel, dict) else rel
        triplets = rd.get("triplets") or [rd]
        for t in triplets:
            td = _as_dict(t) if not isinstance(t, dict) else t
            subject = td.get("subject") or td.get("head") or "unknown"
            obj = td.get("object") or td.get("tail") or "unknown"
            predicate = td.get("predicate") or td.get("relation") or "related_to"
            node_map.setdefault(subject, {"id": subject, "label": subject, "type": "entity"})
            node_map.setdefault(obj, {"id": obj, "label": obj, "type": "entity"})
            edges.append({"source": subject, "target": obj, "relation": predicate})
    return {"nodes": list(node_map.values()), "edges": edges}
