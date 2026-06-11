#!/usr/bin/env python3
"""
Backfills existing matches and innings with canonical IDs and names.
Uses the EntityResolver to process all rows currently in the database.
"""
import os
import sys
from pathlib import Path

import psycopg2
from tqdm import tqdm
from dotenv import load_dotenv

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from ingestion.entity_resolver import EntityResolver

load_dotenv(PROJECT_ROOT / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")

def backfill():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.")
        sys.exit(1)

    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        cur = conn.cursor()
        print("Connected to database.")
    except Exception as e:
        print(f"ERROR: Connection failed: {e}")
        sys.exit(1)

    resolver = EntityResolver()

    # 1. Backfill Matches
    print("Backfilling matches...")
    cur.execute("SELECT match_id, team1, team2, winner, toss_winner, venue, city FROM matches")
    rows = cur.fetchall()
    
    for row in tqdm(rows, desc="Updating matches"):
        m_id, t1, t2, win, toss, ven, city = row
        
        res_t1 = resolver.resolve_team(t1)
        res_t2 = resolver.resolve_team(t2)
        res_win = resolver.resolve_team(win)
        res_toss = resolver.resolve_team(toss)
        res_ven = resolver.resolve_venue(ven, city)

        cur.execute("""
            UPDATE matches
            SET 
                team1 = %s, team1_id = %s, team1_raw = %s,
                team2 = %s, team2_id = %s, team2_raw = %s,
                winner = %s, winner_id = %s, winner_raw = %s,
                toss_winner = %s, toss_winner_id = %s, toss_winner_raw = %s,
                venue = %s, venue_id = %s, venue_raw = %s
            WHERE match_id = %s
        """, (
            res_t1.canonical_name, res_t1.team_id, t1,
            res_t2.canonical_name, res_t2.team_id, t2,
            res_win.canonical_name, res_win.team_id, win,
            res_toss.canonical_name, res_toss.team_id, toss,
            res_ven.canonical_name, res_ven.venue_id, ven,
            m_id
        ))

    # 2. Backfill Innings
    print("Backfilling innings...")
    cur.execute("SELECT innings_id, batting_team, bowling_team FROM innings")
    rows = cur.fetchall()
    
    for row in tqdm(rows, desc="Updating innings"):
        i_id, bat, bowl = row
        
        res_bat = resolver.resolve_team(bat)
        res_bowl = resolver.resolve_team(bowl)

        cur.execute("""
            UPDATE innings
            SET 
                batting_team = %s, batting_team_id = %s, batting_team_raw = %s,
                bowling_team = %s, bowling_team_id = %s, bowling_team_raw = %s
            WHERE innings_id = %s
        """, (
            res_bat.canonical_name, res_bat.team_id, bat,
            res_bowl.canonical_name, res_bowl.team_id, bowl,
            i_id
        ))

    conn.commit()
    cur.close()
    conn.close()
    print("Backfill complete.")

if __name__ == "__main__":
    backfill()
