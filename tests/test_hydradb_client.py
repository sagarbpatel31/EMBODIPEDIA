"""Smoke tests for the HydraDB wrapper.

Phase 0: import + constants only. Phase 1 will add live integration tests
against a real HydraDB tenant.
"""
from __future__ import annotations


def test_module_imports() -> None:
    from apps.agents import hydradb_client

    assert hydradb_client.TENANT_ID == "embodipedia"


def test_sub_tenant_constants_distinct() -> None:
    from apps.agents.hydradb_client import (
        SUB_TENANT_AGENTS,
        SUB_TENANT_ARTICLES,
        SUB_TENANT_BEAR,
        SUB_TENANT_BULL,
        SUB_TENANT_CANONICAL,
    )

    subs = {
        SUB_TENANT_CANONICAL,
        SUB_TENANT_BULL,
        SUB_TENANT_BEAR,
        SUB_TENANT_ARTICLES,
        SUB_TENANT_AGENTS,
    }
    assert subs == {"canonical", "bull", "bear", "articles", "agents"}


def test_schema_model_loads() -> None:
    from apps.agents.schema import ClaimMetadata, HiveLesson

    assert ClaimMetadata.model_fields["perspective"] is not None
    assert HiveLesson.model_fields["lesson_type"] is not None
