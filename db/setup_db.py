#!/usr/bin/env python3
"""
Database setup script for Cricket Statistics Platform.
Creates all tables defined in db/schema.sql.

Usage:
    python db/setup_db.py
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Load .env from project root (parent of db/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found.")
    print("Please set it in your .env file at the project root.")
    print("Example:  DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/cricketdb")
    sys.exit(1)

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def run_setup():
    # ── Connect ──────────────────────────────────────────────
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        cur = conn.cursor()
        print(f"Connected to database successfully.\n")
    except psycopg2.OperationalError as e:
        print("ERROR: Could not connect to PostgreSQL.")
        print("Please check your DATABASE_URL in the .env file.")
        print(f"  Current value: {DATABASE_URL}")
        print(f"\nDetails: {e}")
        sys.exit(1)

    # ── Read schema.sql ─────────────────────────────────────
    sql = SCHEMA_PATH.read_text()

    # Split into individual statements
    statements = [s.strip() for s in sql.split(";") if s.strip()]

    # ── Execute each statement ───────────────────────────────
    for stmt in statements:
        # Skip pure comments
        lines = [l for l in stmt.splitlines() if not l.strip().startswith("--")]
        if not "".join(lines).strip():
            continue

        # Detect the object name for friendly logging
        upper = stmt.upper()
        if "CREATE TABLE" in upper:
            # Extract table name
            name = _extract_name(stmt, "CREATE TABLE")
            try:
                cur.execute(stmt)
                print(f"  ✓  Table '{name}' created.")
            except psycopg2.errors.DuplicateTable:
                print(f"  ⏭  Table '{name}' already exists – skipping.")
                conn.rollback()
                conn.autocommit = True
        elif "CREATE INDEX" in upper:
            name = _extract_name(stmt, "CREATE INDEX")
            try:
                cur.execute(stmt)
                print(f"  ✓  Index '{name}' created.")
            except psycopg2.errors.DuplicateTable:
                # Postgres raises DuplicateTable for duplicate indexes too
                print(f"  ⏭  Index '{name}' already exists – skipping.")
                conn.rollback()
                conn.autocommit = True
        else:
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f"  ⚠  Skipped statement: {e}")
                conn.rollback()
                conn.autocommit = True

    cur.close()
    conn.close()
    print(f"\nSetup complete – database is ready.")


def _extract_name(stmt: str, keyword: str) -> str:
    """Pull the object name out of a CREATE TABLE / CREATE INDEX statement."""
    upper = stmt.upper()
    idx = upper.index(keyword) + len(keyword)
    rest = stmt[idx:].strip()
    # skip IF NOT EXISTS if present
    if rest.upper().startswith("IF NOT EXISTS"):
        rest = rest[len("IF NOT EXISTS"):].strip()
    # first token is the name
    name = rest.split("(")[0].split()[0].strip()
    return name


if __name__ == "__main__":
    run_setup()
