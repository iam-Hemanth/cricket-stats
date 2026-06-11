"""
Entity resolver for cricket team and venue name canonicalization.

Loads ingestion/entity_aliases.json and resolves raw Cricsheet names
to canonical display names and entity IDs at ingestion time.
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

_ALIASES_PATH = Path(__file__).parent / "entity_aliases.json"
_VENUE_COUNTRY_PATH = Path(__file__).parent / "venue_to_country.json"


# ── Key normalisation ────────────────────────────────────────────────

def make_name_key(value: str | None) -> str | None:
    """
    Collapse a raw name to a lowercase ASCII key for alias matching.

    Steps:
      1. NFKD normalise + strip accents
      2. casefold + strip
      3. strip apostrophes (e.g. Lord's -> Lords)
      4. replace non-alphanumeric runs with single space
      5. return None for empty/None input
    """
    if value is None:
        return None
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.casefold().strip()
    normalized = normalized.replace("'", "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    result = re.sub(r"\s+", " ", normalized).strip()
    return result or None


def _slug(value: str) -> str:
    """Create a URL-safe slug from a raw name."""
    key = make_name_key(value) or "unknown"
    return re.sub(r"\s+", "-", key)


# ── Result types ────────────────────────────────────────────────────

@dataclass
class ResolvedEntity:
    canonical_name: Optional[str]
    team_id: Optional[str] = None        # for teams
    venue_id: Optional[str] = None       # for venues
    country: Optional[str] = None
    city: Optional[str] = None
    was_aliased: bool = False            # True when raw != canonical
    is_new_candidate: bool = False       # True when not found in catalog


# ── Resolver ────────────────────────────────────────────────────────

class EntityResolver:
    """
    Resolves raw Cricsheet team and venue strings to canonical entities.

    Usage::

        resolver = EntityResolver()
        result = resolver.resolve_team("Royal Challengers Bangalore")
        # result.canonical_name == "Royal Challengers Bengaluru"
        # result.team_id == "royal-challengers-bengaluru"
        # result.was_aliased == True
    """

    def __init__(self, aliases_path: Path = _ALIASES_PATH) -> None:
        self._team_map: dict[str, dict] = {}    # alias_key -> team record
        self._venue_map: dict[str, dict] = {}   # alias_key -> venue record
        self._venue_country: dict[str, str] = {}
        self._load(aliases_path)
        self._load_venue_country()

    # ── Loading ──────────────────────────────────────────────────────

    def _load(self, path: Path) -> None:
        if not path.exists():
            return
        data = json.loads(path.read_text())

        for team in data.get("teams", []):
            for alias in team.get("aliases", []):
                key = make_name_key(alias)
                if key:
                    self._team_map[key] = team
            # Also index by canonical_key directly
            ck = make_name_key(team["canonical_name"])
            if ck:
                self._team_map[ck] = team

        for venue in data.get("venues", []):
            for alias in venue.get("aliases", []):
                key = make_name_key(alias)
                if key:
                    self._venue_map[key] = venue
            ck = make_name_key(venue["canonical_name"])
            if ck:
                self._venue_map[ck] = venue

    def _load_venue_country(self) -> None:
        if _VENUE_COUNTRY_PATH.exists():
            self._venue_country = json.loads(_VENUE_COUNTRY_PATH.read_text())

    # ── Team resolution ──────────────────────────────────────────────

    def resolve_team(self, raw_name: str | None) -> ResolvedEntity:
        """Resolve a raw team string to its canonical form."""
        if raw_name is None:
            return ResolvedEntity(canonical_name=None, team_id=None)

        key = make_name_key(raw_name)
        record = self._team_map.get(key) if key else None

        if record:
            canonical = record["canonical_name"]
            return ResolvedEntity(
                canonical_name=canonical,
                team_id=record["team_id"],
                country=record.get("country"),
                was_aliased=(make_name_key(canonical) != key),
            )

        # Fallback: use raw name as canonical, create a slug
        return ResolvedEntity(
            canonical_name=raw_name,
            team_id=_slug(raw_name),
            was_aliased=False,
            is_new_candidate=True,
        )

    # ── Venue resolution ─────────────────────────────────────────────

    def resolve_venue(
        self,
        raw_name: str | None,
        city: str | None = None,
    ) -> ResolvedEntity:
        """Resolve a raw venue string to its canonical form."""
        if raw_name is None:
            return ResolvedEntity(canonical_name=None, venue_id=None)

        key = make_name_key(raw_name)
        record = self._venue_map.get(key) if key else None

        if record:
            canonical = record["canonical_name"]
            return ResolvedEntity(
                canonical_name=canonical,
                venue_id=record["venue_id"],
                city=record.get("city"),
                country=record.get("country"),
                was_aliased=(make_name_key(canonical) != key),
            )

        # Try stripping city suffix, e.g. "Basin Reserve, Wellington"
        if raw_name and "," in raw_name:
            stripped = raw_name.split(",")[0].strip()
            stripped_key = make_name_key(stripped)
            record = self._venue_map.get(stripped_key) if stripped_key else None
            if record:
                canonical = record["canonical_name"]
                return ResolvedEntity(
                    canonical_name=canonical,
                    venue_id=record["venue_id"],
                    city=record.get("city") or city,
                    country=record.get("country"),
                    was_aliased=True,
                )

        # Fallback: use raw name, derive country from venue_to_country.json
        country = self._venue_country.get(raw_name)
        venue_id = _slug(raw_name) + ("-" + _slug(city) if city else "")
        return ResolvedEntity(
            canonical_name=raw_name,
            venue_id=venue_id,
            city=city,
            country=country,
            was_aliased=False,
            is_new_candidate=True,  # Flag for logging
        )

    def log_candidate(self, cur, entity_type: str, raw_name: str | None):
        """Log an unresolved entity to the candidates table for manual review."""
        if not raw_name or not cur:
            return
        
        raw_key = make_name_key(raw_name)
        if not raw_key:
            return
        
        # Use a SAVEPOINT so that if logging fails (due to schema drift, missing table, etc.),
        # we can roll back only the savepoint and not abort the entire match transaction.
        try:
            cur.execute("SAVEPOINT log_candidate_sp")
            
            # Check if this candidate already exists to avoid duplicate inserts
            cur.execute("""
                SELECT 1 FROM entity_alias_candidates 
                WHERE entity_type = %s AND raw_key = %s
                LIMIT 1
            """, (entity_type, raw_key))
            exists = cur.fetchone()
            
            if not exists:
                cur.execute("""
                    INSERT INTO entity_alias_candidates (entity_type, raw_name, raw_key)
                    VALUES (%s, %s, %s)
                """, (entity_type, raw_name, raw_key))
                
            cur.execute("RELEASE SAVEPOINT log_candidate_sp")
        except Exception:
            try:
                cur.execute("ROLLBACK TO SAVEPOINT log_candidate_sp")
            except Exception:
                pass
