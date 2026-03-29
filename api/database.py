"""
Database connection pool for the FastAPI application.

Uses psycopg2 ThreadedConnectionPool with RealDictCursor so query
results come back as dicts (ready for JSON serialization).

Usage:
    from database import db_cursor

    with db_cursor() as cur:
        cur.execute("SELECT * FROM players LIMIT 5")
        rows = cur.fetchall()
        # rows = [{"player_id": "ba607b88", "name": "V Kohli"}, ...]
"""

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Create a .env file in the project root with:\n"
        "  DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>"
    )

# ── Connection pool ──────────────────────────────────────────
pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=DATABASE_URL)


def get_conn():
    """Get a connection from the pool."""
    return pool.getconn()


def release_conn(conn):
    """Return a connection to the pool."""
    pool.putconn(conn)


@contextmanager
def db_cursor():
    """
    Context manager that yields a RealDictCursor.

    - Gets a connection from the pool
    - Yields a cursor with dict-style rows
    - Commits on clean exit, rolls back on exception
    - Always returns the connection to the pool

    Usage:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM players WHERE name = %s", ("V Kohli",))
            row = cur.fetchone()
            # row = {"player_id": "ba607b88", "name": "V Kohli", ...}
    """
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        release_conn(conn)
