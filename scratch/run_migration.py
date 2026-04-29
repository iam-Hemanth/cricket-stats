import psycopg2
import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
MIGRATION_FILE = PROJECT_ROOT / "db" / "migrate_matchcard.sql"

def run_migration():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.")
        return

    print(f"Connecting to {DATABASE_URL}...")
    try:
        # Try default connection string (TCP)
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"TCP connection failed: {e}. Trying Unix socket...")
        try:
            # Try Unix socket at /tmp
            conn = psycopg2.connect(dbname="cricketdb", user="postgres", password="2355", host="/tmp")
        except Exception as e2:
            print(f"Unix socket connection failed: {e2}")
            return

    try:
        cur = conn.cursor()
        
        with open(MIGRATION_FILE, "r") as f:
            sql = f.read()
            
        print("Applying migration...")
        cur.execute(sql)
        conn.commit()
        print("Migration applied successfully!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    run_migration()
