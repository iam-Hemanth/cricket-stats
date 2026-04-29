import sys
import os
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.database import db_cursor

with db_cursor() as cur:
    cur.execute("""
        SELECT match_id, winner, win_by_runs, win_by_wickets, outcome
        FROM matches
        WHERE winner IS NULL OR winner ILIKE 'tie%'
        LIMIT 5;
    """)
    print("No winner / Tie matches:", cur.fetchall())

    cur.execute("""
        SELECT match_id, winner, win_by_runs, win_by_wickets, outcome
        FROM matches
        WHERE win_by_runs IS NULL AND win_by_wickets IS NULL AND winner IS NOT NULL AND winner NOT ILIKE 'draw%' AND winner NOT ILIKE 'tie%'
        LIMIT 5;
    """)
    print("Winner but no runs/wickets:", cur.fetchall())
