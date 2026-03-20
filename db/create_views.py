#!/usr/bin/env python3
"""
Create (or recreate) all materialized views defined in db/materialized_views.sql.

Usage:
    python db/create_views.py
"""

import os
import sys
import re
import time
from pathlib import Path

import psycopg2
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
]


def split_statements(sql: str) -> list[str]:
    """Split SQL text into individual statements, ignoring empty ones."""
    stmts = []
    for s in sql.split(";"):
        # Keep only lines that aren't pure comments
        lines = [l for l in s.splitlines() if not l.strip().startswith("--")]
        body = "".join(lines).strip()
        if body:
            stmts.append(s.strip())
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
        cur.execute(f"DROP MATERIALIZED VIEW IF EXISTS {vname} CASCADE")
        print(f"  dropped {vname}")
    print()

    # ── 2. Read and split the SQL file ───────────────────────
    sql_text = SCHEMA_PATH.read_text()
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
                cur.execute(f"SELECT COUNT(*) FROM {vname}")
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
            cur.execute(f"SELECT COUNT(*) FROM {vname}")
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
