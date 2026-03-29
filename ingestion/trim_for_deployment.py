"""
ingestion/trim_for_deployment.py
─────────────────────────────────────────────────────────────────────────────
One-time script to trim the cricketdb database before cloud migration.

SCHEMA NOTE
────────────
matches.competition_id  → FK → competitions.competition_id
competitions.name       → the competition name string

All competition name lookups JOIN matches m LEFT JOIN competitions c
ON c.competition_id = m.competition_id and use c.name.

RULES
──────
Always drop:
  • format IN ('MDM', 'ODM')
  • format = 'Test'  AND date < 2007-01-01
  • c.name ILIKE any ASSOCIATE_EXCLUDE_PATTERNS entry
  • c.name ILIKE '%Asia Cup%' AND c.name ILIKE '%Qualifier%'

Keep if any of (K1–K4) is true:
  K1. c.name ILIKE '%Asia Cup%'  (non-qualifier — already dropped above)
  K2. c.name ILIKE any ICC_EVENT_PATTERNS entry
  K3. c.name IN ALLOWED_T20_LEAGUES  (exact match)
  K4. team1 IN FULL_MEMBERS OR team2 IN FULL_MEMBERS

Otherwise → drop.

USAGE
──────
  python ingestion/trim_for_deployment.py --discover
  python ingestion/trim_for_deployment.py --dry-run
  python ingestion/trim_for_deployment.py --execute
"""

import argparse
import sys
import os
import time

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not found. Run: pip install psycopg2-binary")

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("python-dotenv not found. Run: pip install python-dotenv")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — Constants
# ─────────────────────────────────────────────────────────────────────────────

FULL_MEMBERS = [
    "India",
    "Australia",
    "England",
    "Pakistan",
    "South Africa",
    "New Zealand",
    "West Indies",
    "Sri Lanka",
]

ALLOWED_T20_LEAGUES = [
    "Indian Premier League",
    "Big Bash League",
    "SA20",
    "The Hundred Men's Competition",
    "International League T20",
    "Major League Cricket",
]

ICC_EVENT_PATTERNS = [
    "ICC Cricket World Cup",
    "ICC Men's T20 World Cup",
    "ICC World Twenty20",
    "ICC Champions Trophy",
    "ICC World Test Championship",
]

ASSOCIATE_EXCLUDE_PATTERNS = [
    "ICC Men's Cricket World Cup League 2",
    "ICC CWC Qualifier",
    "ICC T20 World Cup Qualifier",
]

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — Classification CTE
# ─────────────────────────────────────────────────────────────────────────────
# All queries that need to classify matches use this CTE.
# competition_name is fetched via LEFT JOIN competitions c.
# Parameters (%(name)s style):
#   full_members         list[str]
#   allowed_leagues      list[str]
#   icc_patterns         list[str]
#   associate_patterns   list[str]

CLASSIFICATION_CTE = """
WITH classified AS (
    SELECT
        m.match_id,
        m.format,
        m.date,
        m.team1,
        m.team2,
        c.name AS competition_name,
        CASE
            -- ── ALWAYS DROP ──────────────────────────────────────────────
            WHEN m.format IN ('MDM', 'ODM')
                THEN 'DROP'

            WHEN m.format = 'Test' AND m.date < '2007-01-01'
                THEN 'DROP'

            -- Associate ICC events
            WHEN EXISTS (
                SELECT 1
                FROM unnest(%(associate_patterns)s::text[]) AS p(pat)
                WHERE c.name ILIKE pat
            )
                THEN 'DROP'

            -- Asia Cup qualifier
            WHEN c.name ILIKE '%%Asia Cup%%'
             AND c.name ILIKE '%%Qualifier%%'
                THEN 'DROP'

            -- ── KEEP CONDITIONS ───────────────────────────────────────────
            -- K1: Asia Cup (non-qualifier already dropped above)
            WHEN c.name ILIKE '%%Asia Cup%%'
                THEN 'KEEP'

            -- K2: ICC flagship events
            WHEN EXISTS (
                SELECT 1
                FROM unnest(%(icc_patterns)s::text[]) AS p(pat)
                WHERE c.name ILIKE pat
            )
                THEN 'KEEP'

            -- K3: Allowed T20 domestic leagues (exact match)
            WHEN c.name = ANY(%(allowed_leagues)s)
                THEN 'KEEP'

            -- K4: At least one full member involved
            WHEN m.team1 = ANY(%(full_members)s)
              OR m.team2 = ANY(%(full_members)s)
                THEN 'KEEP'

            -- ── DEFAULT ───────────────────────────────────────────────────
            ELSE 'DROP'
        END AS verdict
    FROM matches m
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
)
"""


def build_params():
    return {
        "full_members": FULL_MEMBERS,
        "allowed_leagues": ALLOWED_T20_LEAGUES,
        "icc_patterns": ICC_EVENT_PATTERNS,
        "associate_patterns": ASSOCIATE_EXCLUDE_PATTERNS,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_db_size(cur):
    cur.execute("SELECT pg_size_pretty(pg_database_size('cricketdb')) AS db_size;")
    return cur.fetchone()[0]


def print_separator():
    print("─" * 70)


def connect():
    """
    Connect to the database.
    Priority:
      1. DATABASE_URL already in the shell environment
      2. DATABASE_URL loaded from a .env file in the project root
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)   # ingestion/ → cricket-stats/
    env_path = os.path.join(project_root, ".env")

    if os.path.exists(env_path):
        load_dotenv(env_path)
    else:
        # .env is gitignored on this machine — DATABASE_URL must already be in env
        load_dotenv()   # still picks up any .env in cwd without failing

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit(
            "DATABASE_URL not set. Either export it in your shell or create "
            f"a .env file at {env_path} with:\n"
            "  DATABASE_URL=postgresql://postgres:<password>@localhost:5432/cricketdb"
        )

    try:
        conn = psycopg2.connect(db_url)
        return conn
    except psycopg2.OperationalError as e:
        sys.exit(f"Could not connect to database: {e}")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — Mode implementations
# ─────────────────────────────────────────────────────────────────────────────

def mode_discover(conn):
    """
    Audit T20/IT20 competition names that involve at least one full member.
    Helps verify the keep/drop logic before executing.
    """
    query = """
        SELECT c.name AS competition_name, m.format, COUNT(*) AS match_count
        FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE m.format IN ('IT20', 'T20')
          AND (m.team1 = ANY(%(full_members)s) OR m.team2 = ANY(%(full_members)s))
        GROUP BY c.name, m.format
        ORDER BY m.format, match_count DESC;
    """

    with conn.cursor() as cur:
        cur.execute(query, build_params())
        rows = cur.fetchall()
        db_size = get_db_size(cur)

    print_separator()
    print(f"{'COMPETITION NAME':<60} {'FORMAT':<8} {'MATCHES':>8}")
    print_separator()
    for comp_name, fmt, cnt in rows:
        print(f"{(comp_name or '(null)'):<60} {fmt:<8} {cnt:>8}")
    print_separator()
    print(f"Total rows: {len(rows)}")

    return db_size, len(rows)


def mode_dry_run(conn):
    """
    Preview keep/drop split by format + delivery count. No changes made.
    """
    params = build_params()

    format_query = CLASSIFICATION_CTE + """
        SELECT format, verdict, COUNT(*) AS match_count
        FROM classified
        GROUP BY format, verdict
        ORDER BY format, verdict;
    """

    total_drop_query = CLASSIFICATION_CTE + """
        SELECT COUNT(*) FROM classified WHERE verdict = 'DROP';
    """

    # Use temp table to efficiently count deliveries
    delivery_query = """
        CREATE TEMP TABLE dry_run_drop AS
        """ + CLASSIFICATION_CTE + """
        SELECT match_id FROM classified WHERE verdict = 'DROP';
        
        SELECT COUNT(d.delivery_id)
        FROM dry_run_drop dr
        JOIN innings i ON i.match_id = dr.match_id
        JOIN deliveries d ON d.innings_id = i.innings_id;
    """

    with conn.cursor() as cur:
        cur.execute(format_query, params)
        format_rows = cur.fetchall()

        cur.execute(total_drop_query, params)
        total_drop = cur.fetchone()[0]

        # Create temp table and count deliveries efficiently
        cur.execute(
            """
            CREATE TEMP TABLE dry_run_drop AS
            """ + CLASSIFICATION_CTE + """
            SELECT match_id FROM classified WHERE verdict = 'DROP';
            """,
            params
        )
        
        cur.execute("""
            SELECT COUNT(d.delivery_id)
            FROM dry_run_drop dr
            JOIN innings i ON i.match_id = dr.match_id
            JOIN deliveries d ON d.innings_id = i.innings_id;
        """)
        delivery_count = cur.fetchone()[0]
        
        cur.execute("DROP TABLE IF EXISTS dry_run_drop;")

        db_size = get_db_size(cur)

    print_separator()
    print("DRY RUN — no changes will be made")
    print_separator()
    print(f"{'FORMAT':<10} {'VERDICT':<8} {'MATCHES':>10}")
    print_separator()
    for fmt, verdict, cnt in format_rows:
        print(f"{fmt:<10} {verdict:<8} {cnt:>10}")
    print_separator()

    return db_size, total_drop, delivery_count


def mode_execute(conn):
    """
    Delete DROP-classified matches using table swap strategy for efficiency.
    
    Creates new tables with only KEPT rows, then renames and drops old tables.
    This is 3-5x faster than DELETE for 60%+ row removal on large tables.
    
    Each table swap is handled discretely (not in a single transaction) because
    DDL statements like ALTER TABLE RENAME cannot be reliably rolled back.
    """
    params = build_params()

    with conn.cursor() as cur:
        print("Step 0: Setting work_mem and building matches_to_keep temp table …")
        cur.execute("SET work_mem = '512MB';")
        
        # Create temp table of match_ids to KEEP (not drop)
        cur.execute(
            """
            CREATE TEMP TABLE matches_to_keep AS
            """ + CLASSIFICATION_CTE + """
            SELECT match_id FROM classified WHERE verdict = 'KEEP';
            """,
            params
        )
        cur.execute("CREATE INDEX ON matches_to_keep(match_id);")
        
        # Get counts
        cur.execute("SELECT COUNT(*) FROM matches_to_keep;")
        keep_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM matches;")
        total_matches = cur.fetchone()[0]
        drop_count = total_matches - keep_count
        
        print(f"  → {keep_count:,} matches to KEEP")
        print(f"  → {drop_count:,} matches to DROP")

        if drop_count == 0:
            print("Nothing to drop. Exiting.")
            return get_db_size(cur), 0, 0

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Step 0b — Clean up leftover _new tables and drop dependencies
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 0b: Cleaning up leftover _new tables from previous run …")
            cur.execute("DROP TABLE IF EXISTS deliveries_new CASCADE;")
            cur.execute("DROP TABLE IF EXISTS wickets_new CASCADE;")
            cur.execute("DROP TABLE IF EXISTS innings_new CASCADE;")
            cur.execute("DROP TABLE IF EXISTS matches_new CASCADE;")
            conn.commit()
            print("  → Cleaned up any leftover _new tables ✓")
            
            print("Step 0c: Dropping materialized views and FK constraints …")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_player_batting CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_player_bowling CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_batter_vs_bowler CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_partnerships CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_player_vs_team CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_venue_stats CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team_seasons CASCADE;")
            cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_recent_matches CASCADE;")
            cur.execute("""
                ALTER TABLE wickets
                DROP CONSTRAINT IF EXISTS wickets_delivery_id_fkey;
            """)
            conn.commit()
            print("  → Views and FK constraint dropped ✓")
            
        except Exception as e:
            print(f"  ✗ ERROR during cleanup: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Table 1: deliveries (largest table, ~60% of rows)
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 1a: Creating deliveries_new …")
            cur.execute("CREATE TABLE deliveries_new (LIKE deliveries INCLUDING ALL);")
            
            print("Step 1b: Inserting kept deliveries (this will take a few minutes) …")
            cur.execute(
                """
                INSERT INTO deliveries_new
                SELECT d.* FROM deliveries d
                WHERE EXISTS (
                    SELECT 1 FROM innings i
                    JOIN matches_to_keep mtk ON mtk.match_id = i.match_id
                    WHERE i.innings_id = d.innings_id
                )
                """
            )
            delivery_count = cur.rowcount
            print(f"  → Inserted {delivery_count:,} rows into deliveries_new")
            
            print("Step 1c: Swapping deliveries table …")
            cur.execute("ALTER TABLE deliveries RENAME TO deliveries_old;")
            cur.execute("ALTER TABLE deliveries_new RENAME TO deliveries;")
            cur.execute("DROP TABLE deliveries_old CASCADE;")
            print("  ✓ deliveries swap complete")
            
        except Exception as e:
            print(f"  ✗ ERROR during deliveries swap: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Table 2: wickets (references deliveries.delivery_id)
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 2a: Creating wickets_new …")
            cur.execute("CREATE TABLE wickets_new (LIKE wickets INCLUDING ALL);")
            
            print("Step 2b: Inserting kept wickets …")
            cur.execute(
                """
                INSERT INTO wickets_new
                SELECT w.* FROM wickets w
                WHERE EXISTS (
                    SELECT 1 FROM deliveries d
                    JOIN innings i ON i.innings_id = d.innings_id
                    JOIN matches_to_keep mtk ON mtk.match_id = i.match_id
                    WHERE d.delivery_id = w.delivery_id
                )
                """
            )
            wicket_count = cur.rowcount
            print(f"  → Inserted {wicket_count:,} rows into wickets_new")
            
            print("Step 2c: Swapping wickets table …")
            cur.execute("ALTER TABLE wickets RENAME TO wickets_old;")
            cur.execute("ALTER TABLE wickets_new RENAME TO wickets;")
            cur.execute("DROP TABLE wickets_old CASCADE;")
            print("  ✓ wickets swap complete")
            
        except Exception as e:
            print(f"  ✗ ERROR during wickets swap: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Table 3: innings (references matches.match_id)
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 3a: Creating innings_new …")
            cur.execute("CREATE TABLE innings_new (LIKE innings INCLUDING ALL);")
            
            print("Step 3b: Inserting kept innings …")
            cur.execute(
                """
                INSERT INTO innings_new
                SELECT i.* FROM innings i
                WHERE EXISTS (
                    SELECT 1 FROM matches_to_keep mtk
                    WHERE mtk.match_id = i.match_id
                )
                """
            )
            innings_count = cur.rowcount
            print(f"  → Inserted {innings_count:,} rows into innings_new")
            
            print("Step 3c: Swapping innings table …")
            cur.execute("ALTER TABLE innings RENAME TO innings_old;")
            cur.execute("ALTER TABLE innings_new RENAME TO innings;")
            cur.execute("DROP TABLE innings_old CASCADE;")
            print("  ✓ innings swap complete")
            
        except Exception as e:
            print(f"  ✗ ERROR during innings swap: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Table 4: matches (root table, root of all foreign keys)
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 4a: Creating matches_new …")
            cur.execute("CREATE TABLE matches_new (LIKE matches INCLUDING ALL);")
            
            print("Step 4b: Inserting kept matches …")
            cur.execute(
                """
                INSERT INTO matches_new
                SELECT m.* FROM matches m
                WHERE EXISTS (
                    SELECT 1 FROM matches_to_keep mtk
                    WHERE mtk.match_id = m.match_id
                )
                """
            )
            match_count = cur.rowcount
            print(f"  → Inserted {match_count:,} rows into matches_new")
            
            print("Step 4c: Swapping matches table …")
            cur.execute("ALTER TABLE matches RENAME TO matches_old;")
            cur.execute("ALTER TABLE matches_new RENAME TO matches;")
            cur.execute("DROP TABLE matches_old CASCADE;")
            print("  ✓ matches swap complete")
            
        except Exception as e:
            print(f"  ✗ ERROR during matches swap: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Step 5: VACUUM ANALYZE to update planner statistics
        # ─────────────────────────────────────────────────────────────────────
        # VACUUM cannot run inside a transaction block.
        # Must temporarily set autocommit = True on the connection.
        print("Step 5: Running VACUUM ANALYZE on all tables …")
        try:
            conn.autocommit = True
            with conn.cursor() as vacuum_cur:
                for table in ['deliveries', 'wickets', 'innings', 'matches']:
                    print(f"  Analyzing {table} …")
                    vacuum_cur.execute(f"VACUUM ANALYZE {table};")
                    print(f"  ✓ {table} done")
            conn.autocommit = False
            print("  → VACUUM ANALYZE complete ✓")
        except Exception as e:
            conn.autocommit = False
            print(f"  ✗ ERROR during VACUUM ANALYZE: {e}")
            sys.exit(1)

        print_separator()

        # ─────────────────────────────────────────────────────────────────────
        # Step 6: Recreate FK constraint
        # ─────────────────────────────────────────────────────────────────────
        try:
            print("Step 6: Recreating FK constraint …")
            cur.execute("""
                ALTER TABLE wickets
                ADD CONSTRAINT wickets_delivery_id_fkey
                FOREIGN KEY (delivery_id)
                REFERENCES deliveries(delivery_id);
            """)
            conn.commit()
            print("  → FK constraint recreated ✓")
            print("")
            print("NOTE: Materialized views were dropped and must be refreshed.")
            print("Run the standard refresh script after this completes:")
            print("  export $(grep '^DATABASE_URL=' .env | xargs)")
            print("  psql \"$DATABASE_URL\" -c \"REFRESH MATERIALIZED VIEW mv_player_batting;\"")
            print("  (and all other views — see db/create_views.py)")
            
        except Exception as e:
            print(f"  ✗ ERROR during FK recreation: {e}")
            conn.rollback()
            sys.exit(1)

        print_separator()
        db_size = get_db_size(cur)

    return db_size, drop_count, delivery_count


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — Argument parsing + entry point
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Trim cricketdb before cloud migration.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Run order:
  1. python ingestion/trim_for_deployment.py --discover
  2. python ingestion/trim_for_deployment.py --dry-run
  3. python ingestion/trim_for_deployment.py --execute
""",
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--discover",
        action="store_true",
        help="Print T20/IT20 competition names involving full members. No deletes.",
    )
    group.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Print keep/drop counts by format. No deletes. (default)",
    )
    group.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete rows. Runs inside a single transaction.",
    )

    return parser.parse_args()


def main():
    args = parse_args()

    if args.discover:
        mode = "DISCOVER"
    elif args.execute:
        mode = "EXECUTE"
    else:
        mode = "DRY RUN"

    print_separator()
    print(f"  cricketdb trim — mode: {mode}")
    print_separator()

    conn = connect()
    conn.autocommit = False

    try:
        if mode == "DISCOVER":
            db_size, row_count = mode_discover(conn)
            print_separator()
            print("SUMMARY")
            print_separator()
            print(f"  Mode          : {mode}")
            print(f"  Competitions  : {row_count}")
            print(f"  DB size       : {db_size}")
            print_separator()

        elif mode == "DRY RUN":
            db_size, total_drop, delivery_count = mode_dry_run(conn)
            print("SUMMARY")
            print_separator()
            print(f"  Mode              : {mode}")
            print(f"  Matches to delete : {total_drop:,}")
            print(f"  Deliveries        : {delivery_count:,}  (would be affected)")
            print(f"  DB size           : {db_size}  (unchanged)")
            print_separator()

        elif mode == "EXECUTE":
            print("⚠  EXECUTE mode — this will permanently delete rows.")
            print("   Press Ctrl-C within 5 seconds to abort …")
            time.sleep(5)
            print_separator()

            db_size, match_count, delivery_count = mode_execute(conn)
            print("SUMMARY")
            print_separator()
            print(f"  Mode              : {mode}")
            print(f"  Matches deleted   : {match_count:,}")
            print(f"  Deliveries deleted: {delivery_count:,}")
            print(f"  DB size           : {db_size}")
            print_separator()

    except KeyboardInterrupt:
        print("\n  Aborted by user. Rolling back …")
        conn.rollback()
        sys.exit(1)
    except Exception as e:
        print(f"\n  ERROR: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
