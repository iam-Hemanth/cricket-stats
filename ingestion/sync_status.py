#!/usr/bin/env python3
"""
Sync status dashboard — shows recent sync_log entries and DB summary.

Usage:
    python ingestion/sync_status.py
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

STATUS_ICONS = {
    "success": "✅",
    "partial": "⚠️ ",
    "error":   "❌",
}


def time_ago(dt: datetime) -> str:
    """Convert a datetime to a human-readable 'X ago' string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    seconds = int(delta.total_seconds())

    if seconds < 60:
        return f"{seconds}s ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    return f"{days} day{'s' if days != 1 else ''} ago"


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set. Check your .env file.")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
    except psycopg2.OperationalError as e:
        print(f"ERROR: Could not connect to PostgreSQL.\n{e}")
        sys.exit(1)

    # ── DB summary ───────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM matches")
    total_matches = cur.fetchone()[0]

    cur.execute("SELECT MAX(date) FROM matches")
    latest_date = cur.fetchone()[0]

    print(f"{'═' * 60}")
    print(f"  CRICKET STATS — SYNC STATUS")
    print(f"{'═' * 60}")
    print(f"  Total matches in DB:     {total_matches:,}")
    print(f"  Most recent match date:  {latest_date or 'N/A'}")
    print()

    # ── Last 10 sync runs ────────────────────────────────────
    cur.execute("""
        SELECT run_at, matches_added, status, error_msg
        FROM sync_log
        ORDER BY run_id DESC
        LIMIT 10
    """)
    rows = cur.fetchall()

    if not rows:
        print("  No sync runs recorded yet.")
    else:
        print(f"  {'When':<16} {'Added':>7}  {'Status'}")
        print(f"  {'─' * 16} {'─' * 7}  {'─' * 30}")
        for run_at, added, status, error_msg in rows:
            icon = STATUS_ICONS.get(status, "?")
            when = time_ago(run_at)
            line = f"  {when:<16} {added:>7,}  {icon} {status}"
            print(line)
            if error_msg:
                truncated = error_msg[:100].replace("\n", " ")
                if len(error_msg) > 100:
                    truncated += "…"
                print(f"  {'':>27}  └─ {truncated}")

    print(f"\n{'─' * 60}\n")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
