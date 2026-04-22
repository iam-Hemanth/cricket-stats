#!/usr/bin/env python3
"""
Create (or recreate) all materialized views defined in db/materialized_views.sql.

Usage:
    python db/create_views.py
"""

import os
import re
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

SCHEMA_PATH = Path(__file__).resolve().parent / "materialized_views.sql"

VIEW_NAMES = [
    "mv_player_batting",
    "mv_player_bowling",
    "mv_batter_vs_bowler",
    "mv_player_vs_team",
    "mv_venue_stats",
    "mv_partnerships",
    "mv_team_vs_team",
    "mv_team_vs_team_seasons",
    "mv_team_recent_matches",
    "mv_stat_cards",
]


def apply_required_fixes(sql_text: str) -> str:
    """Apply targeted SQL fixes required for materialized view rebuild."""
    # FIX 1: Make all CREATE INDEX / CREATE UNIQUE INDEX idempotent.
    sql_text = re.sub(
        r"CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)(\w+)\s+ON",
        r"CREATE \1INDEX IF NOT EXISTS \2 ON",
        sql_text,
        flags=re.IGNORECASE,
    )
    sql_text = sql_text.replace(
        "CREATE INDEX ON mv_partnerships (player_id);",
        "CREATE INDEX IF NOT EXISTS idx_mv_partnerships_player_id ON mv_partnerships (player_id);",
    )
    sql_text = sql_text.replace(
        "CREATE INDEX ON mv_partnerships (player_id, format_bucket);",
        "CREATE INDEX IF NOT EXISTS idx_mv_partnerships_player_format ON mv_partnerships (player_id, format_bucket);",
    )

    # FIX 2: Replace normalise_team() function body with $func$ delimiter.
    sql_text = sql_text.replace(
        """CREATE OR REPLACE FUNCTION normalise_team(team_name TEXT) 
RETURNS TEXT AS $$
BEGIN
    RETURN CASE team_name
        WHEN 'Royal Challengers Bangalore' 
            THEN 'Royal Challengers Bengaluru'
        WHEN 'Delhi Daredevils' 
            THEN 'Delhi Capitals'
        WHEN 'Deccan Chargers' 
            THEN 'Sunrisers Hyderabad'
        WHEN 'Rising Pune Supergiant' 
            THEN 'Rising Pune Supergiants'
        WHEN 'Pune Warriors' 
            THEN 'Pune Warriors India'
        ELSE team_name
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;""",
        """CREATE OR REPLACE FUNCTION normalise_team(team_name TEXT)
RETURNS TEXT AS $func$
BEGIN
    RETURN CASE team_name
        WHEN 'Royal Challengers Bangalore'
            THEN 'Royal Challengers Bengaluru'
        WHEN 'Delhi Daredevils'
            THEN 'Delhi Capitals'
        WHEN 'Deccan Chargers'
            THEN 'Sunrisers Hyderabad'
        WHEN 'Rising Pune Supergiant'
            THEN 'Rising Pune Supergiants'
        WHEN 'Pune Warriors'
            THEN 'Pune Warriors India'
        ELSE team_name
    END;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;""",
    )

    # FIX 3: Add missing non-aggregate columns to GROUP BY in mv_team_recent_matches.
    sql_text = sql_text.replace(
        """GROUP BY
    m.match_id, m.date, m.venue,
    normalise_team(i1.batting_team), normalise_team(i1.bowling_team),
    m.winner, m.win_by_runs, m.win_by_wickets,
    c.name, m.format;""",
        """GROUP BY
    m.match_id, m.date, m.venue,
    i1.batting_team, i1.bowling_team,
    normalise_team(i1.batting_team), normalise_team(i1.bowling_team),
    m.winner, m.win_by_runs, m.win_by_wickets,
    c.name, m.format;""",
    )

    return sql_text


def split_statements(sql: str) -> list[str]:
    """Split SQL text into individual statements, ignoring empty ones."""
    stmts = []
    buf = []
    i = 0
    n = len(sql)
    in_single = False
    dollar_tag = None

    while i < n:
        ch = sql[i]

        # Skip -- comments (outside quoted contexts)
        if not in_single and dollar_tag is None and ch == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                i += 1
            continue

        # Single-quoted strings
        if dollar_tag is None and ch == "'":
            if in_single and i + 1 < n and sql[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            in_single = not in_single
            buf.append(ch)
            i += 1
            continue

        # Dollar-quoted blocks
        if not in_single and ch == "$":
            m = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[i:])
            if m:
                tag = m.group(0)
                if dollar_tag is None:
                    dollar_tag = tag
                elif dollar_tag == tag:
                    dollar_tag = None
                buf.append(tag)
                i += len(tag)
                continue

        # Statement boundary
        if ch == ";" and not in_single and dollar_tag is None:
            stmt = "".join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts


def view_name_from_stmt(stmt: str) -> str | None:
    """Extract the view name from a CREATE MATERIALIZED VIEW statement."""
    m = re.search(r"CREATE\s+MATERIALIZED\s+VIEW\s+(\w+)", stmt, re.IGNORECASE)
    return m.group(1) if m else None


def fmt_size(nbytes: int) -> str:
    """Format byte count as human-readable size."""
    if nbytes >= 1024 * 1024:
        return f"{nbytes / (1024 * 1024):.1f} MB"
    if nbytes >= 1024:
        return f"{nbytes / 1024:.1f} KB"
    return f"{nbytes} B"


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set. Check your .env file.")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()
    except psycopg2.OperationalError as e:
        print(f"ERROR: Could not connect to PostgreSQL.\n{e}")
        sys.exit(1)

    print("Connected to database.\n")

    # ── 1. Drop existing views ───────────────────────────────
    print("Dropping existing views (if any)...")
    for vname in reversed(VIEW_NAMES):
        cur.execute(
            sql.SQL("DROP MATERIALIZED VIEW IF EXISTS {} CASCADE").format(
                sql.Identifier(vname)
            )
        )
        print(f"  dropped {vname}")
    print()

    # ── 2. Read and split the SQL file ───────────────────────
    sql_text = SCHEMA_PATH.read_text()
    sql_text = apply_required_fixes(sql_text)
    statements = split_statements(sql_text)

    # ── 3. Execute each statement ────────────────────────────
    errors = {}          # view_name -> error message
    current_view = None

    for stmt in statements:
        # Detect which view this statement belongs to
        vname = view_name_from_stmt(stmt)
        if vname:
            current_view = vname
            print(f"Creating {vname}...", end=" ", flush=True)
            t0 = time.time()

        try:
            cur.execute(stmt)

            # If this was a CREATE MATERIALIZED VIEW, print row count
            if vname:
                elapsed = time.time() - t0
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(vname))
                )
                count = cur.fetchone()[0]
                print(f"Done — {count:,} rows ({elapsed:.1f}s)")

        except Exception as e:
            error_view = vname or current_view or "unknown"
            errors[error_view] = str(e).strip()
            print(f"\n  ✗ Error: {e}")
            # Reset connection state after error
            conn.rollback() if not conn.autocommit else None
            continue

    # ── 4. Summary table ─────────────────────────────────────
    print(f"\n{'═' * 56}")
    print(f"  {'View':<28} {'Rows':>10}  {'Size':>8}")
    print(f"  {'─' * 28} {'─' * 10}  {'─' * 8}")

    for vname in VIEW_NAMES:
        if vname in errors:
            print(f"  {vname:<28} {'FAILED':>10}  {'—':>8}")
            continue
        try:
            cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(vname)))
            count = cur.fetchone()[0]

            cur.execute(
                "SELECT pg_total_relation_size(%s)",
                (vname,),
            )
            size = cur.fetchone()[0]
            print(f"  {vname:<28} {count:>10,}  {fmt_size(size):>8}")
        except Exception:
            print(f"  {vname:<28} {'N/A':>10}  {'N/A':>8}")

    print(f"{'═' * 56}")

    # ── 5. Error details ─────────────────────────────────────
    if errors:
        print(f"\n⚠  {len(errors)} view(s) failed:\n")
        for vname, msg in errors.items():
            print(f"  {vname}: {msg}\n")
    else:
        print("\n✅ All views created successfully.\n")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
