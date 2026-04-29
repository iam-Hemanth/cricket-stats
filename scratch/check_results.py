import sys
import os

# Add parent dir to path so we can import api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.database import db_cursor

with db_cursor() as cur:
    cur.execute("""
        SELECT winner, win_by_runs, win_by_wickets, match_id, date, format
        FROM matches 
        WHERE winner IS NULL OR winner ILIKE 'Draw%' OR winner ILIKE 'tie%' OR (win_by_runs IS NULL AND win_by_wickets IS NULL)
        LIMIT 20;
    """)
    rows = cur.fetchall()
    for r in rows:
        print(dict(r))
