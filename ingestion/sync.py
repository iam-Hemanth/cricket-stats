#!/usr/bin/env python3
"""
Cricsheet sync script.

Downloads new matches from Cricsheet, diffs against the database,
and ingests only new matches.  Uses the 30-day zip when the last sync
was recent, and the full zip otherwise.

Usage:
    python ingestion/sync.py
"""

import io
import json
import os
import sys
import time
import zipfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from tqdm import tqdm
from match_filter import should_ingest_match

# Reuse the batch-optimised ingestion function
from ingest_all import ingest_match

# ── Paths & URLs ─────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

LAST_SYNC_FILE = Path(__file__).resolve().parent / ".last_sync"
FULL_ZIP_URL   = "https://cricsheet.org/downloads/all_male_json.zip"
RECENT_ZIP_URL = "https://cricsheet.org/downloads/recently_played_30_male_json.zip"

MAX_RECENT_DAYS = 25  # use recent zip if last sync was within this many days


# ── Helpers ──────────────────────────────────────────────────

def load_sync_state() -> dict | None:
    """Read .last_sync and return a dict, or None if missing/invalid."""
    if not LAST_SYNC_FILE.exists():
        return None

    raw = LAST_SYNC_FILE.read_text().strip()
    if not raw:
        return None

    # Backward compat: old format was a plain Last-Modified string
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Old plain-string format — treat as first run
        return None


def save_sync_state(last_modified: str, zip_used: str):
    """Write the sync state as JSON."""
    state = {
        "last_modified": last_modified,
        "last_run": datetime.now(timezone.utc).isoformat(),
        "zip_used": zip_used,
    }
    LAST_SYNC_FILE.write_text(json.dumps(state, indent=2) + "\n")


def choose_zip_url(state: dict | None) -> tuple[str, str]:
    """
    Decide which zip to download.

    Returns (url, label) where label is 'recent' or 'full'.
    """
    if state is None:
        print("Using full zip (first run or unreadable .last_sync)\n")
        return FULL_ZIP_URL, "full"

    # Parse last_run to figure out how many days ago
    last_run_str = state.get("last_run")
    if not last_run_str:
        print("Using full zip (no last_run in .last_sync)\n")
        return FULL_ZIP_URL, "full"

    try:
        last_run = datetime.fromisoformat(last_run_str)
        # Ensure timezone-aware comparison
        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=timezone.utc)
        days_ago = (datetime.now(timezone.utc) - last_run).days
    except (ValueError, TypeError):
        print("Using full zip (could not parse last_run)\n")
        return FULL_ZIP_URL, "full"

    if days_ago <= MAX_RECENT_DAYS:
        print(f"Using 30-day zip (last sync was {days_ago} days ago)\n")
        return RECENT_ZIP_URL, "recent"
    else:
        print(f"Using full zip (first run or sync gap > {MAX_RECENT_DAYS} days — "
              f"last sync was {days_ago} days ago)\n")
        return FULL_ZIP_URL, "full"


# ── Main ─────────────────────────────────────────────────────

def main():
    conn = None
    cur = None

    try:
        # ── 1. Load DATABASE_URL ─────────────────────────────
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("ERROR: DATABASE_URL not set. Check your .env file.")
            sys.exit(1)

        # ── 2. Decide which zip to use ───────────────────────
        state = load_sync_state()
        zip_url, zip_label = choose_zip_url(state)

        # Check Last-Modified via HEAD request
        saved_last_modified = state.get("last_modified") if state else None

        print("Checking Cricsheet for updates...")
        head = requests.head(zip_url, timeout=15)
        head.raise_for_status()
        remote_last_modified = head.headers.get("Last-Modified", "")

        if saved_last_modified and saved_last_modified == remote_last_modified:
            print("Cricsheet has not updated since last sync. Exiting.")
            return

        print(f"Remote Last-Modified: {remote_last_modified}")
        if saved_last_modified:
            print(f"Local  Last-Modified: {saved_last_modified}")
        print()

        # ── 3. Download zip into memory ──────────────────────
        filename = zip_url.rsplit("/", 1)[-1]
        print(f"Downloading {filename} ...")
        resp = requests.get(zip_url, timeout=300)
        resp.raise_for_status()
        size_mb = len(resp.content) / (1024 * 1024)
        print(f"Downloaded {size_mb:.1f} MB\n")

        zf = zipfile.ZipFile(io.BytesIO(resp.content))

        # ── 4. Connect & get existing IDs ────────────────────
        conn = psycopg2.connect(database_url)
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute("SET synchronous_commit = OFF")

        cur.execute("SELECT match_id FROM matches")
        existing_ids = {row[0] for row in cur.fetchall()}

        # ── 5. Filter to new matches ─────────────────────────
        all_json = [n for n in zf.namelist() if n.endswith(".json")]
        new_entries = [
            n for n in all_json
            if Path(n).stem not in existing_ids
        ]

        print(f"Found {len(all_json)} files in zip. "
              f"{len(existing_ids)} already in database.")
        print(f"Found {len(new_entries)} new matches to ingest.\n")

        if not new_entries:
            save_sync_state(remote_last_modified, zip_label)
            print("Nothing to do. Last-sync timestamp updated.")
            cur.close()
            conn.close()
            return

        # ── 6. Ingest new matches ────────────────────────────
        successes = 0
        failures = []

        for entry_name in tqdm(new_entries, desc="Syncing", unit="match"):
            match_id = Path(entry_name).stem
            try:
                raw = zf.read(entry_name)
                data = json.loads(raw)

                filename = entry_name
                match_data = data
                should_ingest, skip_reason = should_ingest_match(
                    match_data.get('info', {})
                )
                if not should_ingest:
                    print(f"  Skipped: {filename} — {skip_reason}")
                    continue

                ingest_match(cur, data, match_id)
                conn.commit()
                successes += 1

            except Exception as e:
                conn.rollback()
                error_msg = f"{entry_name}: {e}"
                failures.append(error_msg)
                tqdm.write(f"  ✗ {error_msg}")

        # ── 7. Write to sync_log ─────────────────────────────
        if failures:
            status = "partial"
            error_summary = f"{len(failures)} failures:\n" + "\n".join(failures[:20])
            if len(failures) > 20:
                error_summary += f"\n... and {len(failures) - 20} more"
        else:
            status = "success"
            error_summary = None

        cur.execute(
            """
            INSERT INTO sync_log (matches_added, status, error_msg)
            VALUES (%s, %s, %s)
            """,
            (successes, status, error_summary),
        )
        conn.commit()

        # ── 8. Refresh materialized views ────────────────────
        if successes > 0:
            views = [
                "mv_player_batting",
                "mv_player_bowling",
                "mv_batter_vs_bowler",
                "mv_player_vs_team",
                "mv_venue_stats",
                "mv_stat_cards",
            ]
            print("\nRefreshing materialized views...")
            t0_all = time.time()
            conn.autocommit = True
            for vname in views:
                t0 = time.time()
                try:
                    cur.execute(f"REFRESH MATERIALIZED VIEW {vname}")
                    elapsed = time.time() - t0
                    print(f"  ✓ {vname} ({elapsed:.1f}s)")
                except Exception as e:
                    elapsed = time.time() - t0
                    print(f"  ✗ {vname} — {e} ({elapsed:.1f}s)")
            conn.autocommit = False
            total_time = time.time() - t0_all
            print(f"All views refreshed in {total_time:.1f}s")

        # ── 9. Save sync state ───────────────────────────────
        save_sync_state(remote_last_modified, zip_label)

        # ── 9. Summary ───────────────────────────────────────
        print(f"\nSync complete. {successes} new matches added. "
              f"{len(failures)} failed.")

        if failures:
            print("\n── Failed files ──")
            for line in failures:
                print(f"  • {line}")

    except Exception as exc:
        # Top-level catch: record the crash in sync_log if possible
        print(f"\nFATAL ERROR: {exc}")
        if conn and cur:
            try:
                conn.rollback()
                cur.execute(
                    """
                    INSERT INTO sync_log (matches_added, status, error_msg)
                    VALUES (0, 'error', %s)
                    """,
                    (str(exc),),
                )
                conn.commit()
                print("Error recorded in sync_log.")
            except Exception:
                print("Could not write error to sync_log.")
        sys.exit(1)

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
