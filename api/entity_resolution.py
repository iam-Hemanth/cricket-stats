"""
API-layer entity resolution.
Used to resolve user input (team/venue names) into canonical IDs and names
before passing them to the database layer.
"""
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
import sys

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from ingestion.entity_resolver import EntityResolver

@lru_cache(maxsize=1)
def get_resolver() -> EntityResolver:
    """Return a singleton instance of the EntityResolver."""
    return EntityResolver()

def resolve_team_input(name: str | None) -> str | None:
    """
    Resolve a team name input to its canonical name.
    Example: 'Bangalore' -> 'Royal Challengers Bengaluru'
    """
    if not name:
        return None
    res = get_resolver().resolve_team(name)
    return res.canonical_name

def resolve_venue_input(name: str | None) -> str | None:
    """Resolve a venue name input to its canonical name."""
    if not name:
        return None
    res = get_resolver().resolve_venue(name)
    return res.canonical_name

def resolve_team_id(name: str | None) -> str | None:
    """Resolve a team name to its canonical team_id."""
    if not name:
        return None
    res = get_resolver().resolve_team(name)
    return res.team_id
