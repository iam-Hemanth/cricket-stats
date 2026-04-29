import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    print("DATABASE_URL not found in .env")
    exit(1)

try:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    print("Truncating tables...")
    cur.execute("TRUNCATE deliveries, innings, matches, competitions CASCADE;")
    print("Done!")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
