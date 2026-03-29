#!/usr/bin/env python3
"""
Cricsheet JSON ingestion module.

Usage:
    python ingestion/ingest_all.py data/all_male_json/
"""

import json
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from tqdm import tqdm
from match_filter import should_ingest_match

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def ingest_match(cur, data: dict, match_id: str) -> str:
    """
    Insert all data from a parsed Cricsheet JSON object into the database.

    Args:
        cur: psycopg2 cursor (connection should have autocommit=False so
             the caller can commit/rollback the whole match as one tx).
        data: parsed JSON dict from a Cricsheet .json file.
        match_id: the Cricsheet numeric match ID (e.g. '1473511').

    Returns:
        The match_id on success.
    """
    info = data.get("info", {})
    registry = info.get("registry", {}).get("people", {})

    # ── 1. Players ───────────────────────────────────────────
    for name, player_id in registry.items():
        cur.execute(
            """
            INSERT INTO players (player_id, name)
            VALUES (%s, %s)
            ON CONFLICT (player_id) DO NOTHING
            """,
            (player_id, name),
        )

    # ── 2. Competition ───────────────────────────────────────
    event = info.get("event", {})
    comp_name = event.get("name")
    comp_id = None

    if comp_name:
        match_type = info.get("match_type")
        gender = info.get("gender")

        # Upsert-style: insert if missing, then fetch id
        cur.execute(
            """
            INSERT INTO competitions (name, type, gender)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (comp_name, match_type, gender),
        )
        cur.execute(
            "SELECT competition_id FROM competitions WHERE name = %s",
            (comp_name,),
        )
        row = cur.fetchone()
        if row:
            comp_id = row[0]

    # ── 3. Match ─────────────────────────────────────────────
    dates = info.get("dates", [])
    match_date = dates[0] if dates else None

    teams = info.get("teams", [])
    team1 = teams[0] if len(teams) > 0 else None
    team2 = teams[1] if len(teams) > 1 else None

    outcome = info.get("outcome", {})
    winner = outcome.get("winner")
    by = outcome.get("by", {})
    win_by_runs = by.get("runs")
    win_by_wickets = by.get("wickets")

    toss = info.get("toss", {})
    pom_list = info.get("player_of_match", [])
    player_of_match = pom_list[0] if pom_list else None

    cur.execute(
        """
        INSERT INTO matches (
            match_id, date, season, venue, city,
            team1, team2, winner, win_by_runs, win_by_wickets,
            toss_winner, toss_decision, format, competition_id,
            player_of_match, gender
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s
        )
        """,
        (
            match_id,
            match_date,
            info.get("season"),
            info.get("venue"),
            info.get("city"),
            team1,
            team2,
            winner,
            win_by_runs,
            win_by_wickets,
            toss.get("winner"),
            toss.get("decision"),
            info.get("match_type"),
            comp_id,
            player_of_match,
            info.get("gender"),
        ),
    )

    # ── 4. Innings, deliveries, wickets ──────────────────────
    match_format = info.get("match_type", "")

    delivery_rows = []   # collected for batch insert
    wicket_map = {}      # delivery_index → list of wicket tuples
    delivery_index = 0

    for idx, inn in enumerate(data.get("innings", [])):
        innings_number = idx + 1
        batting_team = inn.get("team")

        # Determine bowling team (the other team)
        bowling_team = None
        if batting_team and len(teams) == 2:
            bowling_team = team2 if batting_team == team1 else team1

        cur.execute(
            """
            INSERT INTO innings (match_id, innings_number, batting_team, bowling_team)
            VALUES (%s, %s, %s, %s)
            RETURNING innings_id
            """,
            (match_id, innings_number, batting_team, bowling_team),
        )
        innings_id = cur.fetchone()[0]

        # Walk overs → deliveries, collecting rows
        for over_obj in inn.get("overs", []):
            over_number = over_obj.get("over", 0)

            # Phase calculation
            if match_format in ("Test", "MDM"):
                phase = "test"
            elif over_number <= 5:
                phase = "powerplay"
            elif over_number <= 14:
                phase = "middle"
            else:
                phase = "death"

            for ball_idx, delivery in enumerate(over_obj.get("deliveries", [])):
                ball_number = ball_idx + 1

                batter_id = registry.get(delivery.get("batter"))
                bowler_id = registry.get(delivery.get("bowler"))
                non_striker_id = registry.get(delivery.get("non_striker"))

                runs = delivery.get("runs", {})
                extras = delivery.get("extras", {})

                delivery_rows.append((
                    innings_id,
                    over_number,
                    ball_number,
                    batter_id,
                    bowler_id,
                    non_striker_id,
                    runs.get("batter", 0),
                    runs.get("extras", 0),
                    runs.get("total", 0),
                    "wides" in extras,
                    "noballs" in extras,
                    "byes" in extras,
                    "legbyes" in extras,
                    phase,
                ))

                # Track wickets against this delivery's index
                for wicket in delivery.get("wickets", []):
                    player_out_id = registry.get(wicket.get("player_out"))
                    fielders = wicket.get("fielders", [])
                    fielder1_id = registry.get(fielders[0].get("name")) if len(fielders) >= 1 else None
                    fielder2_id = registry.get(fielders[1].get("name")) if len(fielders) >= 2 else None

                    wicket_map.setdefault(delivery_index, []).append(
                        (player_out_id, wicket.get("kind"), fielder1_id, fielder2_id)
                    )

                delivery_index += 1

    # ── 5. Batch-insert deliveries ───────────────────────────
    if delivery_rows:
        returned = execute_values(
            cur,
            """
            INSERT INTO deliveries (
                innings_id, over_number, ball_number,
                batter_id, bowler_id, non_striker_id,
                runs_batter, runs_extras, runs_total,
                is_wide, is_noball, is_bye, is_legbye,
                phase
            ) VALUES %s
            RETURNING delivery_id
            """,
            delivery_rows,
            fetch=True,
        )
        delivery_ids = [row[0] for row in returned]

        # ── 6. Batch-insert wickets ──────────────────────────
        if wicket_map:
            wicket_rows = []
            for del_idx, wickets in wicket_map.items():
                del_id = delivery_ids[del_idx]
                for player_out_id, kind, f1, f2 in wickets:
                    wicket_rows.append((del_id, player_out_id, kind, f1, f2))

            execute_values(
                cur,
                """
                INSERT INTO wickets (
                    delivery_id, player_out_id, kind,
                    fielder1_id, fielder2_id
                ) VALUES %s
                """,
                wicket_rows,
            )

    return match_id


# ─────────────────────────────────────────────────────────────
# CLI entry-point
# ─────────────────────────────────────────────────────────────

PROGRESS_LOG = PROJECT_ROOT / "ingestion" / "progress.log"


def main():
    # ── 1. Parse CLI args ────────────────────────────────────
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv

    if not args:
        print("Usage:  python ingestion/ingest_all.py <folder_with_json_files> [--force]")
        sys.exit(1)

    folder = Path(args[0])
    if not folder.is_dir():
        print(f"ERROR: '{folder}' is not a directory.")
        sys.exit(1)

    if force:
        print("⚠  --force mode: re-processing ALL files.\n")

    # ── 2. Connect ───────────────────────────────────────────
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set. Check your .env file.")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = False  # we manage transactions per-match
        cur = conn.cursor()
        cur.execute("SET synchronous_commit = OFF")
        print("Connected to database.\n")
    except psycopg2.OperationalError as e:
        print(f"ERROR: Could not connect to PostgreSQL.\n{e}")
        sys.exit(1)

    # ── 3. Gather JSON files ─────────────────────────────────
    all_files = sorted(folder.glob("*.json"))
    total_files = len(all_files)

    # ── 4. Skip already-ingested matches ─────────────────────
    if force:
        existing_ids = set()
    else:
        # IDs already in the database
        cur.execute("SELECT match_id FROM matches")
        existing_ids = {row[0] for row in cur.fetchall()}

        # IDs recorded in progress.log (backup safety net)
        if PROGRESS_LOG.exists():
            for line in PROGRESS_LOG.read_text().splitlines():
                line = line.strip()
                if line:
                    existing_ids.add(line)

    new_files = [f for f in all_files if f.stem not in existing_ids]
    skipped = total_files - len(new_files)

    print(f"Found {total_files} files. "
          f"{skipped} already in database. "
          f"Processing {len(new_files)} new files.\n")

    if not new_files:
        print("Nothing to do.")
        cur.close()
        conn.close()
        return

    # ── 5. Ingest with progress bar ──────────────────────────
    successes = 0
    failures = []

    for filepath in tqdm(new_files, desc="Ingesting", unit="match"):
        match_id = filepath.stem
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            should_ingest, skip_reason = should_ingest_match(
                data.get('info', {})
            )
            if not should_ingest:
                print(f"  Skipped: {filepath.name} — {skip_reason}")
                continue

            ingest_match(cur, data, match_id)
            conn.commit()
            successes += 1

            # Record to progress log
            with open(PROGRESS_LOG, "a") as plog:
                plog.write(f"{match_id}\n")

        except Exception as e:
            conn.rollback()
            error_msg = f"{filepath.name}: {e}"
            failures.append(error_msg)
            tqdm.write(f"  ✗ {error_msg}")

    # ── 6. Summary ───────────────────────────────────────────
    print(f"\nIngestion complete.")
    print(f"Successfully inserted: {successes} matches")
    print(f"Failed: {len(failures)} matches")

    if failures:
        print("\n── Failed files ──")
        for line in failures:
            print(f"  • {line}")

        # Write log
        log_path = PROJECT_ROOT / "ingestion" / "failed_matches.log"
        with open(log_path, "a") as log:
            log.write(f"\n── Run at {datetime.now().isoformat()} ──\n")
            for line in failures:
                log.write(f"{line}\n")
        print(f"\nFailures written to {log_path}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()

