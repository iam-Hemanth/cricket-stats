#!/usr/bin/env python3
"""
Data validation script for Cricket Statistics Platform.
Runs integrity checks, prints summaries, and spot-checks known stats.

Usage:
    python ingestion/validate_data.py
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def hr(title: str = ""):
    """Print a horizontal rule with optional title."""
    if title:
        print(f"\n{'═' * 60}")
        print(f"  {title}")
        print(f"{'═' * 60}")
    else:
        print(f"{'─' * 60}")


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

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. Row counts
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("1. ROW COUNTS")
    for table in ["matches", "innings", "deliveries", "wickets", "players"]:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"  {table.capitalize():<14} {count:>10,}")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. Matches by format
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("2. MATCHES BY FORMAT")
    cur.execute("""
        SELECT format, COUNT(*) AS cnt
        FROM matches
        GROUP BY format
        ORDER BY cnt DESC
    """)
    rows = cur.fetchall()
    print(f"  {'Format':<14} {'Count':>8}")
    print(f"  {'─' * 14} {'─' * 8}")
    for fmt, cnt in rows:
        print(f"  {fmt or 'Unknown':<14} {cnt:>8,}")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3. Top 5 run scorers
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("3. TOP 5 RUN SCORERS (all formats)")
    cur.execute("""
        SELECT p.name, SUM(d.runs_batter) AS total_runs
        FROM deliveries d
        JOIN players p ON p.player_id = d.batter_id
        GROUP BY p.player_id, p.name
        ORDER BY total_runs DESC
        LIMIT 5
    """)
    rows = cur.fetchall()
    print(f"  {'Player':<30} {'Runs':>10}")
    print(f"  {'─' * 30} {'─' * 10}")
    for name, runs in rows:
        print(f"  {name:<30} {runs:>10,}")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 4. Top 5 wicket takers
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("4. TOP 5 WICKET TAKERS (all formats)")
    cur.execute("""
        SELECT p.name, COUNT(*) AS total_wickets
        FROM wickets w
        JOIN deliveries d ON d.delivery_id = w.delivery_id
        JOIN players p ON p.player_id = d.bowler_id
        WHERE w.kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')
        GROUP BY p.player_id, p.name
        ORDER BY total_wickets DESC
        LIMIT 5
    """)
    rows = cur.fetchall()
    print(f"  {'Player':<30} {'Wickets':>10}")
    print(f"  {'─' * 30} {'─' * 10}")
    for name, wkts in rows:
        print(f"  {name:<30} {wkts:>10,}")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 5. Data integrity checks
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("5. DATA INTEGRITY CHECKS")

    checks = [
        (
            "No null batter_ids in deliveries",
            "SELECT COUNT(*) FROM deliveries WHERE batter_id IS NULL",
            lambda c: c == 0,
        ),
        (
            "No null bowler_ids in deliveries",
            "SELECT COUNT(*) FROM deliveries WHERE bowler_id IS NULL",
            lambda c: c == 0,
        ),
        (
            "All wicket delivery_ids exist in deliveries table",
            """
            SELECT COUNT(*) FROM wickets w
            LEFT JOIN deliveries d ON d.delivery_id = w.delivery_id
            WHERE d.delivery_id IS NULL
            """,
            lambda c: c == 0,
        ),
        (
            "No matches with zero innings (abandoned before start)",
            """
            SELECT COUNT(*) FROM matches m
            WHERE NOT EXISTS (
                SELECT 1 FROM innings i WHERE i.match_id = m.match_id
            )
            """,
            # Up to ~20 abandoned/rain-affected matches is expected and fine
            lambda c: c <= 20,
        ),
        (
            "No completed matches with suspiciously few deliveries",
            """
            SELECT COUNT(*) FROM (
                SELECT m.format, m.match_id, COUNT(d.delivery_id) AS balls
                FROM matches m
                JOIN innings i    ON i.match_id   = m.match_id
                JOIN deliveries d ON d.innings_id = i.innings_id
                WHERE m.winner IS NOT NULL
                GROUP BY m.format, m.match_id
                HAVING
                    (m.format IN ('T20', 'IT20') AND COUNT(d.delivery_id) < 10) OR
                    (m.format IN ('ODI', 'ODM')  AND COUNT(d.delivery_id) < 20) OR
                    (m.format IN ('Test', 'MDM') AND COUNT(d.delivery_id) < 30)
            ) AS suspicious
            """,
            lambda c: c == 0,
        ),
    ]

    all_pass = True
    for label, query, check_fn in checks:
        cur.execute(query)
        count = cur.fetchone()[0]
        passed = check_fn(count)
        status = "✅ PASS" if passed else f"❌ FAIL ({count:,} issues)"
        print(f"  {status}  {label}")
        if not passed:
            all_pass = False

    if all_pass:
        print("\n  All integrity checks passed!")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 6. Kohli spot-check
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    hr("6. SPOT-CHECK: VIRAT KOHLI")

    cur.execute("SELECT player_id FROM players WHERE name = 'V Kohli'")
    row = cur.fetchone()

    if not row:
        print("  Kohli not found in database — not enough data loaded yet.")
    else:
        kohli_id = row[0]
        print(f"  player_id: {kohli_id}\n")

        # NOTE: Cricsheet stores ALL T20 matches (IPL, international, domestic)
        # under format='T20'. There is no separate 'IT20' label in this dataset.
        # Kohli's T20 total therefore includes both IPL and international T20 runs.
        for fmt, label, expected_min in [
            ("T20",  "IPL + all T20 internationals combined", 10_000),
            ("ODI",  "~13,800+ career ODI runs",              13_000),
            ("Test", "~9,000+ career Test runs",               8_500),
        ]:
            cur.execute("""
                SELECT COALESCE(SUM(d.runs_batter), 0)
                FROM deliveries d
                JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches m ON m.match_id = i.match_id
                WHERE d.batter_id = %s AND m.format = %s
            """, (kohli_id, fmt))
            runs = cur.fetchone()[0]
            ok     = runs >= expected_min
            status = "✅" if ok else "❌"
            print(f"  {status} Kohli {fmt:<5} runs: {runs:>8,}  (expected ≥ {expected_min:,} — {label})")

    hr()
    print("\nValidation complete.\n")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()