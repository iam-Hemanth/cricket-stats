"""
ingestion/full_trim.py
─────────────────────────────────────────────────────────────────────────────
Replacement for trim_for_deployment.py.

Root cause of previous failures: psycopg2 %(param)s substitution inside
CREATE TEMP TABLE AS statements silently failed — the CASE logic never
evaluated correctly. This script hardcodes ALL values directly into the SQL
string. No psycopg2 parameter substitution is used anywhere.

PHASES
──────
0  Cleanup  — drop any leftover _new / _old / temp tables
1  Identify — build matches_to_keep temp table via pure hardcoded SQL
              print verification queries
              prompt user: "YES" to continue, anything else aborts
2  Swap     — create *_new tables, INSERT kept rows, rename, drop old
3  VACUUM   — VACUUM ANALYZE all 4 tables (autocommit=True required)
4  Report   — print final DB size + per-format count

MODES
──────
   --dry-run   Phase 0 + Phase 1 only. No data changed. (default)
   --execute   All 4 phases. 5-second abort countdown first.

USAGE
──────
   source .venv/bin/activate
   python ingestion/full_trim.py --dry-run    # review first
   python ingestion/full_trim.py --execute    # only after reviewing
"""

import argparse
import sys
import os
import time

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    sys.exit("psycopg2 not found. Run: pip install psycopg2-binary")

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("python-dotenv not found. Run: pip install python-dotenv")


# ─────────────────────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────────────────────

def connect():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, ".env")

    if os.path.exists(env_path):
        load_dotenv(env_path)
    else:
        load_dotenv()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit(
            "DATABASE_URL not set. Export it in your shell or create a .env "
            "file at the project root:\n"
            "  DATABASE_URL=postgresql://postgres:<password>@localhost:5432/cricketdb"
        )

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        return conn
    except psycopg2.OperationalError as e:
        sys.exit(f"Could not connect to database: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

SEP = "─" * 72

def sep():
    print(SEP)

def section(title):
    sep()
    print(f"  {title}")
    sep()


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 0 — Cleanup leftover tables
# ─────────────────────────────────────────────────────────────────────────────

CLEANUP_TABLES = [
    "deliveries_new",
    "wickets_new",
    "innings_new",
    "matches_new",
    "deliveries_old",
    "wickets_old",
    "innings_old",
    "matches_old",
    "matches_to_keep",
    "matches_to_delete",
    "dry_run_drop",
]

def phase0_cleanup(conn):
    section("PHASE 0 — Cleanup leftover tables")
    with conn.cursor() as cur:
        for tbl in CLEANUP_TABLES:
            cur.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")
            print(f"  → dropped {tbl} (if existed)")
        conn.commit()
    print("Phase 0 complete: cleaned up leftover tables")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Identify matches to keep
# ─────────────────────────────────────────────────────────────────────────────

# ALL values are hardcoded — no %(param)s substitution anywhere.
BUILD_KEEP_TABLE_SQL = """
CREATE TEMP TABLE matches_to_keep AS
SELECT m.match_id
FROM matches m
LEFT JOIN competitions c ON c.competition_id = m.competition_id
WHERE
    -- Always drop MDM and ODM formats
    m.format NOT IN ('MDM', 'ODM')

    -- Drop all ICC qualifier and regional tournaments
    AND c.name NOT ILIKE '%Qualifier%'
    AND c.name NOT ILIKE '%Region%'
    AND c.name NOT ILIKE '%World Cup Qualifier%'

    -- Drop matches with no competition name (NULL)
    AND c.name IS NOT NULL
    AND m.competition_id IS NOT NULL

    -- Drop regional finals
    AND NOT (c.name ILIKE '%Region Final%')
    AND NOT (c.name ILIKE '%Regional Final%')

    -- Drop pre-2011 Tests
    AND NOT (m.format = 'Test' AND m.date < '2011-01-01')

    AND NOT (m.format = 'ODI' AND m.date < '2007-01-01')

    -- Drop associate-only ICC events and regional qualifiers
    AND (c.name IS NULL
         OR (
             c.name NOT ILIKE '%ICC Men''s Cricket World Cup League 2%'
             AND c.name NOT ILIKE '%ICC CWC Qualifier%'
             AND c.name NOT ILIKE '%ICC T20 World Cup Qualifier%'
             AND c.name NOT ILIKE '%Asia Cup Qualifier%'
             AND c.name NOT ILIKE '%Sub Regional%'
             AND c.name NOT ILIKE '%World Twenty20 Qualifier%'
             AND c.name NOT ILIKE '%WCL%'
             AND c.name NOT ILIKE '%CWC Challenge%'
         )
    )

    -- At least one keep condition must match:
    AND (
        -- K1: Allowed T20 domestic leagues (exact name)
        c.name IN (
            'Indian Premier League',
            'SA20',
            'The Hundred Men''s Competition',
            'International League T20',
            'Major League Cricket'
        )

        -- K2: ICC flagship events
        OR c.name ILIKE '%ICC Cricket World Cup%'
        OR c.name ILIKE '%ICC Men''s T20 World Cup%'
        OR c.name ILIKE '%ICC World Twenty20%'
        OR c.name ILIKE '%ICC Champions Trophy%'
        OR c.name ILIKE '%ICC World Test Championship%'
        OR c.name ILIKE '%ICC World Cup%'

        -- K3: Asia Cup main event (not qualifier — already excluded above)
        OR (c.name ILIKE '%Asia Cup%'
            AND c.name NOT ILIKE '%Qualifier%')

        -- K4: At least one full-member team involved
        -- (covers bilaterals, tri-series, tours in any format)
        OR m.team1 IN (
            'India', 'Australia', 'England', 'Pakistan',
            'South Africa', 'New Zealand', 'West Indies', 'Sri Lanka'
        )
        OR m.team2 IN (
            'India', 'Australia', 'England', 'Pakistan',
            'South Africa', 'New Zealand', 'West Indies', 'Sri Lanka'
        )
    );
"""

def phase1_identify(conn):
    section("PHASE 1 — Identify matches to keep")

    with conn.cursor() as cur:
        print("Building matches_to_keep temp table …")
        cur.execute(BUILD_KEEP_TABLE_SQL)
        cur.execute("CREATE INDEX ON matches_to_keep(match_id);")
        conn.commit()
        print("  → temp table built ✓")
        sep()

        # ── Verification query 1: total count ────────────────────────────────
        print("Verification 1: total keep count")
        cur.execute("SELECT COUNT(*) AS matches_to_keep FROM matches_to_keep;")
        row = cur.fetchone()
        keep_count = row[0]
        cur.execute("SELECT COUNT(*) FROM matches;")
        total = cur.fetchone()[0]
        drop_count = total - keep_count
        print(f"  Total matches in DB : {total:,}")
        print(f"  Will KEEP           : {keep_count:,}")
        print(f"  Will DROP           : {drop_count:,}")
        sep()

        # ── Verification query 2: per-format breakdown ────────────────────────
        print("Verification 2: kept matches by format")
        cur.execute("""
            SELECT m.format, COUNT(*) AS kept
            FROM matches m
            JOIN matches_to_keep mtk ON mtk.match_id = m.match_id
            GROUP BY m.format
            ORDER BY m.format;
        """)
        rows = cur.fetchall()
        print(f"  {'FORMAT':<10} {'KEPT':>8}")
        print(f"  {'-'*10} {'-'*8}")
        for fmt, cnt in rows:
            print(f"  {fmt:<10} {cnt:>8,}")
        sep()

        # ── Verification query 3: top competitions kept ───────────────────────
        print("Verification 3: top 30 competitions kept (by match count)")
        cur.execute("""
            SELECT c.name AS competition, m.format, COUNT(*) AS matches
            FROM matches m
            JOIN matches_to_keep mtk ON mtk.match_id = m.match_id
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            GROUP BY c.name, m.format
            ORDER BY matches DESC
            LIMIT 30;
        """)
        rows = cur.fetchall()
        print(f"  {'COMPETITION':<55} {'FMT':<7} {'MATCHES':>8}")
        print(f"  {'-'*55} {'-'*7} {'-'*8}")
        for comp, fmt, cnt in rows:
            print(f"  {(comp or '(null)'):<55} {fmt:<7} {cnt:>8,}")
        sep()

    return keep_count, drop_count


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — Table swaps
# ─────────────────────────────────────────────────────────────────────────────

def _exec(cur, sql, label=None):
    """Execute a statement, optionally printing a label for clarity."""
    if label:
        print(f"    {label}")
    cur.execute(sql)


def phase2_swap(conn):
    section("PHASE 2 — Table swaps (CREATE new, INSERT kept, rename, drop old)")

    with conn.cursor() as cur:

        # ── Pre-swap: drop materialized views and FK constraint ───────────────
        print("  Pre-swap: dropping materialized views and FK constraint …")
        for mv in [
            "mv_player_batting",
            "mv_player_bowling",
            "mv_batter_vs_bowler",
            "mv_partnerships",
            "mv_player_vs_team",
            "mv_venue_stats",
            "mv_team_vs_team",
            "mv_team_vs_team_seasons",
            "mv_team_recent_matches",
        ]:
            cur.execute(f"DROP MATERIALIZED VIEW IF EXISTS {mv} CASCADE;")
            print(f"    dropped {mv} (if existed)")

        cur.execute("""
            ALTER TABLE wickets
            DROP CONSTRAINT IF EXISTS wickets_delivery_id_fkey;
        """)
        print("    dropped wickets_delivery_id_fkey (if existed)")
        conn.commit()
        print("  → pre-swap cleanup done ✓")
        sep()

        # ── Table 1: deliveries ───────────────────────────────────────────────
        try:
            print("  Swap 1/4: deliveries")
            _exec(cur, "CREATE TABLE deliveries_new (LIKE deliveries INCLUDING ALL);",
                  "CREATE deliveries_new …")
            _exec(cur, """
                INSERT INTO deliveries_new
                SELECT d.*
                FROM deliveries d
                JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches_to_keep mtk ON mtk.match_id = i.match_id;
            """, "INSERT kept deliveries (may take several minutes) …")
            n = cur.rowcount
            print(f"    → {n:,} rows inserted into deliveries_new")
            _exec(cur, "ALTER TABLE deliveries RENAME TO deliveries_old;",
                  "RENAME deliveries → deliveries_old …")
            _exec(cur, "ALTER TABLE deliveries_new RENAME TO deliveries;",
                  "RENAME deliveries_new → deliveries …")
            _exec(cur, "DROP TABLE deliveries_old CASCADE;",
                  "DROP deliveries_old …")
            conn.commit()
            print("  ✓ deliveries swap complete")
            sep()
        except Exception as e:
            conn.rollback()
            print(f"  ✗ ERROR during deliveries swap: {e}")
            sys.exit(1)

        # ── Table 2: wickets ──────────────────────────────────────────────────
        try:
            print("  Swap 2/4: wickets")
            _exec(cur, "CREATE TABLE wickets_new (LIKE wickets INCLUDING ALL);",
                  "CREATE wickets_new …")
            _exec(cur, """
                INSERT INTO wickets_new
                SELECT w.*
                FROM wickets w
                JOIN deliveries d ON d.delivery_id = w.delivery_id
                JOIN innings i    ON i.innings_id  = d.innings_id
                JOIN matches_to_keep mtk ON mtk.match_id = i.match_id;
            """, "INSERT kept wickets …")
            n = cur.rowcount
            print(f"    → {n:,} rows inserted into wickets_new")
            _exec(cur, "ALTER TABLE wickets RENAME TO wickets_old;",
                  "RENAME wickets → wickets_old …")
            _exec(cur, "ALTER TABLE wickets_new RENAME TO wickets;",
                  "RENAME wickets_new → wickets …")
            _exec(cur, "DROP TABLE wickets_old CASCADE;",
                  "DROP wickets_old …")
            conn.commit()
            print("  ✓ wickets swap complete")
            sep()
        except Exception as e:
            conn.rollback()
            print(f"  ✗ ERROR during wickets swap: {e}")
            sys.exit(1)

        # ── Table 3: innings ──────────────────────────────────────────────────
        try:
            print("  Swap 3/4: innings")
            _exec(cur, "CREATE TABLE innings_new (LIKE innings INCLUDING ALL);",
                  "CREATE innings_new …")
            _exec(cur, """
                INSERT INTO innings_new
                SELECT i.*
                FROM innings i
                JOIN matches_to_keep mtk ON mtk.match_id = i.match_id;
            """, "INSERT kept innings …")
            n = cur.rowcount
            print(f"    → {n:,} rows inserted into innings_new")
            _exec(cur, "ALTER TABLE innings RENAME TO innings_old;",
                  "RENAME innings → innings_old …")
            _exec(cur, "ALTER TABLE innings_new RENAME TO innings;",
                  "RENAME innings_new → innings …")
            _exec(cur, "DROP TABLE innings_old CASCADE;",
                  "DROP innings_old …")
            conn.commit()
            print("  ✓ innings swap complete")
            sep()
        except Exception as e:
            conn.rollback()
            print(f"  ✗ ERROR during innings swap: {e}")
            sys.exit(1)

        # ── Table 4: matches ──────────────────────────────────────────────────
        try:
            print("  Swap 4/4: matches")
            _exec(cur, "CREATE TABLE matches_new (LIKE matches INCLUDING ALL);",
                  "CREATE matches_new …")
            _exec(cur, """
                INSERT INTO matches_new
                SELECT m.*
                FROM matches m
                JOIN matches_to_keep mtk ON mtk.match_id = m.match_id;
            """, "INSERT kept matches …")
            n = cur.rowcount
            print(f"    → {n:,} rows inserted into matches_new")
            _exec(cur, "ALTER TABLE matches RENAME TO matches_old;",
                  "RENAME matches → matches_old …")
            _exec(cur, "ALTER TABLE matches_new RENAME TO matches;",
                  "RENAME matches_new → matches …")
            _exec(cur, "DROP TABLE matches_old CASCADE;",
                  "DROP matches_old …")
            conn.commit()
            print("  ✓ matches swap complete")
            sep()
        except Exception as e:
            conn.rollback()
            print(f"  ✗ ERROR during matches swap: {e}")
            sys.exit(1)

        # ── Recreate FK constraint ────────────────────────────────────────────
        try:
            print("  Recreating wickets_delivery_id_fkey …")
            cur.execute("""
                ALTER TABLE wickets
                ADD CONSTRAINT wickets_delivery_id_fkey
                FOREIGN KEY (delivery_id) REFERENCES deliveries(delivery_id);
            """)
            conn.commit()
            print("  ✓ FK constraint recreated")
            sep()
        except Exception as e:
            conn.rollback()
            print(f"  ✗ ERROR recreating FK constraint: {e}")
            sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — VACUUM ANALYZE
# ─────────────────────────────────────────────────────────────────────────────

def phase3_vacuum(conn):
    section("PHASE 3 — VACUUM ANALYZE")
    print("  VACUUM cannot run inside a transaction block.")
    print("  Switching to autocommit=True …")

    tables = ["deliveries", "wickets", "innings", "matches"]

    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            for tbl in tables:
                print(f"  VACUUM ANALYZE {tbl} …")
                cur.execute(f"VACUUM ANALYZE {tbl};")
                print(f"  ✓ {tbl} done")
        print("  → VACUUM ANALYZE complete ✓")
    except Exception as e:
        print(f"  ✗ ERROR during VACUUM ANALYZE: {e}")
        sys.exit(1)
    finally:
        conn.autocommit = False

    sep()


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Final report
# ─────────────────────────────────────────────────────────────────────────────

def phase4_report(conn):
    section("PHASE 4 — Final report")

    with conn.cursor() as cur:
        cur.execute("SELECT pg_size_pretty(pg_database_size('cricketdb'));")
        db_size = cur.fetchone()[0]
        print(f"  DB size: {db_size}")
        sep()

        print(f"  {'FORMAT':<10} {'MATCHES':>10}")
        print(f"  {'-'*10} {'-'*10}")
        cur.execute("""
            SELECT format, COUNT(*) AS cnt
            FROM matches
            GROUP BY format
            ORDER BY format;
        """)
        rows = cur.fetchall()
        total = 0
        for fmt, cnt in rows:
            print(f"  {fmt:<10} {cnt:>10,}")
            total += cnt
        print(f"  {'-'*10} {'-'*10}")
        print(f"  {'TOTAL':<10} {total:>10,}")
        sep()

    print(
        "Trim complete. Materialized views were dropped and must be refreshed.\n"
        "Run the standard refresh script before using the application:\n"
        "\n"
        "   python db/create_views.py\n"
        "\n"
        "Or manually:\n"
        "   psql \"$DATABASE_URL\" -f db/materialized_views.sql\n"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Full trim of cricketdb before cloud migration.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Run order:
  1. python ingestion/full_trim.py --dry-run    # review keep list
  2. python ingestion/full_trim.py --execute    # only after reviewing
""",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        default=True,
        help="Phase 0 + Phase 1 only. No data changed. (default)",
    )
    group.add_argument(
        "--execute",
        action="store_true",
        help="Run all 4 phases. Permanently deletes data.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    mode = "EXECUTE" if args.execute else "DRY RUN"

    sep()
    print(f"  cricketdb full_trim — mode: {mode}")
    sep()

    conn = connect()

    try:
        # ── Phase 0: always run ───────────────────────────────────────────────
        phase0_cleanup(conn)
        sep()

        # ── Phase 1: always run ───────────────────────────────────────────────
        keep_count, drop_count = phase1_identify(conn)

        if mode == "DRY RUN":
            sep()
            print("DRY RUN complete — no data has been changed.")
            print(f"  {keep_count:,} matches will be KEPT")
            print(f"  {drop_count:,} matches will be DROPPED")
            print("")
            print("Review the competition list above carefully, then run:")
            print("  python ingestion/full_trim.py --execute")
            sep()
            return

        # ── Execute mode: confirm before proceeding ───────────────────────────
        sep()
        print("⚠  EXECUTE mode — this will permanently restructure the database.")
        print("   You have 5 seconds to press Ctrl-C to abort …")
        for i in range(5, 0, -1):
            print(f"   {i} …", end="\r", flush=True)
            time.sleep(1)
        print("                     ")
        sep()

        answer = input(
            "Review the keep list above.\n"
            "Confirm:\n"
            "  - MDM, ODM, PSL, Vitality Blast, BPL etc. are NOT in the keep list\n"
            "  - IPL, BBL, SA20, ICC events, Asia Cup, bilateral tours ARE kept\n\n"
            "Type YES to continue or anything else to abort: "
        ).strip()

        if answer != "YES":
            print("Aborted by user. No data changed.")
            conn.rollback()
            return

        # ── Phases 2–4 ────────────────────────────────────────────────────────
        phase2_swap(conn)
        phase3_vacuum(conn)
        phase4_report(conn)

    except KeyboardInterrupt:
        print("\n  Aborted by Ctrl-C. Rolling back …")
        try:
            conn.rollback()
        except Exception:
            pass
        sys.exit(1)
    except Exception as e:
        print(f"\n  UNEXPECTED ERROR: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
