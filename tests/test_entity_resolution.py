"""
Tests for the entity resolution layer (Task 1 + Task 4).

Runs entirely without a database — pure unit tests against the Python
resolver module that lives in ingestion/entity_resolver.py.
"""
from __future__ import annotations

import pytest


# ── make_name_key unit tests ─────────────────────────────────────────

def test_name_key_collapses_case_punctuation_and_city_suffixes():
    """Test that make_name_key normalizes venue name variants correctly."""
    from ingestion.entity_resolver import make_name_key

    assert make_name_key("Arun Jaitley Stadium, Delhi") == make_name_key(
        "arun jaitley stadium delhi"
    )
    assert make_name_key(" Feroz Shah Kotla ") == "feroz shah kotla"


def test_name_key_none_returns_none():
    from ingestion.entity_resolver import make_name_key

    assert make_name_key(None) is None


def test_name_key_empty_string_returns_none():
    from ingestion.entity_resolver import make_name_key

    result = make_name_key("  ")
    assert result is None


def test_name_key_strips_accents():
    from ingestion.entity_resolver import make_name_key

    # Accent characters should collapse to ASCII equivalents
    key = make_name_key("Köln Stadium")
    assert "koln" in key or "kln" in key  # accent stripped


def test_name_key_collapses_multiple_spaces():
    from ingestion.entity_resolver import make_name_key

    assert make_name_key("Eden  Gardens") == "eden gardens"


def test_name_key_removes_punctuation():
    from ingestion.entity_resolver import make_name_key

    assert make_name_key("Lord's Cricket Ground") == "lords cricket ground"


# ── EntityResolver — known team aliases ─────────────────────────────

def test_resolver_resolves_rcb_old_name():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team("Royal Challengers Bangalore")
    assert result.canonical_name == "Royal Challengers Bengaluru"
    assert result.team_id == "royal-challengers-bengaluru"
    assert result.was_aliased is True


def test_resolver_resolves_dd_to_dc():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team("Delhi Daredevils")
    assert result.canonical_name == "Delhi Capitals"
    assert result.was_aliased is True


def test_resolver_resolves_kxip_to_pk():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team("Kings XI Punjab")
    assert result.canonical_name == "Punjab Kings"
    assert result.was_aliased is True


def test_resolver_canonical_name_resolves_to_itself():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team("Royal Challengers Bengaluru")
    assert result.canonical_name == "Royal Challengers Bengaluru"
    assert result.was_aliased is False


def test_resolver_unknown_team_uses_raw_fallback():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team("Hobbiton Hobbits XI")
    assert result.canonical_name == "Hobbiton Hobbits XI"
    assert result.team_id is not None  # slug created
    assert result.was_aliased is False


# ── EntityResolver — known venue aliases ─────────────────────────────

def test_resolver_resolves_feroz_shah_kotla():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_venue("Feroz Shah Kotla")
    assert result.canonical_name == "Arun Jaitley Stadium"
    assert result.was_aliased is True


def test_resolver_resolves_arun_jaitley_with_city_suffix():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_venue("Arun Jaitley Stadium, Delhi")
    assert result.canonical_name == "Arun Jaitley Stadium"
    assert result.was_aliased is True


def test_resolver_unknown_venue_uses_raw_fallback():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_venue("Imaginary Ground, Neverland", city="Neverland")
    assert result.canonical_name == "Imaginary Ground, Neverland"
    assert result.venue_id is not None
    assert result.was_aliased is False


def test_resolver_none_team_returns_none_canonical():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_team(None)
    assert result.canonical_name is None
    assert result.team_id is None


def test_resolver_none_venue_returns_none_canonical():
    from ingestion.entity_resolver import EntityResolver

    resolver = EntityResolver()
    result = resolver.resolve_venue(None)
    assert result.canonical_name is None
    assert result.venue_id is None
