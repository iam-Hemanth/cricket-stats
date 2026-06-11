#!/usr/bin/env python3
"""
Populates the teams, team_aliases, venues, and venue_aliases tables
from the canonical ingestion/entity_aliases.json file.
"""
import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Load environment
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
ALIASES_JSON = PROJECT_ROOT / "ingestion" / "entity_aliases.json"

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found.")
    sys.exit(1)

def make_key(name):
    import re
    import unicodedata
    if not name: return None
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.casefold().strip()
    normalized = normalized.replace("'", "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip() or None

def populate():
    if not ALIASES_JSON.exists():
        print(f"ERROR: {ALIASES_JSON} not found.")
        sys.exit(1)

    with open(ALIASES_JSON, "r") as f:
        data = json.load(f)

    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        cur = conn.cursor()
        print("Connected to database.")
    except Exception as e:
        print(f"ERROR: Connection failed: {e}")
        sys.exit(1)

    # 1. Teams
    print("Populating teams...")
    for team in data.get("teams", []):
        team_id = team["team_id"]
        canonical_name = team["canonical_name"]
        canonical_key = make_key(canonical_name)
        country = team.get("country")
        
        cur.execute("""
            INSERT INTO teams (team_id, canonical_name, canonical_key, country)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (team_id) DO UPDATE SET
                canonical_name = EXCLUDED.canonical_name,
                canonical_key = EXCLUDED.canonical_key,
                country = EXCLUDED.country
        """, (team_id, canonical_name, canonical_key, country))

        for alias in team.get("aliases", []):
            alias_key = make_key(alias)
            if alias_key:
                cur.execute("""
                    INSERT INTO team_aliases (team_id, alias_name, alias_key, source)
                    VALUES (%s, %s, %s, 'seed')
                    ON CONFLICT (alias_key) DO UPDATE SET
                        team_id = EXCLUDED.team_id,
                        alias_name = EXCLUDED.alias_name
                """, (team_id, alias, alias_key))

    # 2. Venues
    print("Populating venues...")
    for venue in data.get("venues", []):
        venue_id = venue["venue_id"]
        canonical_name = venue["canonical_name"]
        canonical_key = make_key(canonical_name)
        city = venue.get("city")
        country = venue.get("country")

        cur.execute("""
            INSERT INTO venues (venue_id, canonical_name, canonical_key, city, country)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (venue_id) DO UPDATE SET
                canonical_name = EXCLUDED.canonical_name,
                canonical_key = EXCLUDED.canonical_key,
                city = EXCLUDED.city,
                country = EXCLUDED.country
        """, (venue_id, canonical_name, canonical_key, city, country))

        for alias in venue.get("aliases", []):
            alias_key = make_key(alias)
            if alias_key:
                cur.execute("""
                    INSERT INTO venue_aliases (venue_id, alias_name, alias_key, source)
                    VALUES (%s, %s, %s, 'seed')
                    ON CONFLICT (alias_key) DO UPDATE SET
                        venue_id = EXCLUDED.venue_id,
                        alias_name = EXCLUDED.alias_name
                """, (venue_id, alias, alias_key))

    cur.close()
    conn.close()
    print("Population complete.")

if __name__ == "__main__":
    populate()
