# CricStats — Cricket Analytics Platform

> Ball-by-ball cricket analytics built on Cricsheet data. Player profiles, matchups, partnerships, team head-to-head, and live form tracking across all formats.

---

## Tech Stack

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3+-0F172A?style=flat&logo=tailwindcss)](https://tailwindcss.com/)

---

## Overview

CricStats is a comprehensive cricket statistics platform powered by 17,174 matches from Cricsheet. It features ball-by-ball analysis of 9.69 million deliveries across 10,943 players, covering all international and domestic formats. Unlike mainstream cricket sites, CricStats specializes in **granular matchup analytics** — player vs player head-to-heads with format, phase, and year-by-year breakdowns — alongside traditional career statistics and team analytics.

The platform is built as a full-stack application with a PostgreSQL backend, FastAPI REST API, and modern Next.js frontend with TypeScript and Tailwind CSS.

---

## Features

- **Player Profiles** — Comprehensive career statistics with year-wise batting/bowling records. IPL separated from other T20 formats for cleaner analytics.
- **Batter vs Bowler Matchups** — Head-to-head matchup cards showing format, phase (powerplay/middle/death), and year-by-year breakdowns.
- **Batting Partnerships** — Career records between any two batters with total runs, average partnership, and best partnership scores.
- **Phase Specialist Stats** — Powerplay/middle/death breakdown for T20 formats showing strike rate and consistency by phase.
- **Form Guide** — Last 10 innings displayed as a colour-coded visual strip showing runs and opposition.
- **Team Head-to-Head** — Win records, season-by-season results, and recent match history between any two teams.
- **Player Comparison** — Side-by-side career statistics comparison with shareable URL.
- **Homepage Highlights** — Rotating stat cards, "on fire right now" players, and rivalry of the day insights with 24-hour caching.

---

## Architecture

```
┌────────────────┐
│   Cricsheet    │  ← Open ball-by-ball cricket data
│  (cricsheet.org)
└────────┬───────┘
         │
         ▼
┌─────────────────────┐
│  Python ETL Layer   │  ← Smart sync (full zip vs 30-day zip)
│ (ingestion/*.py)    │    Automatic stats aggregation
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   PostgreSQL DB     │  ← 7 tables + 8 materialized views
│   (17,174 matches)  │    Pre-aggregated analytics
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  FastAPI Backend    │  ← 12+ RESTful endpoints
│  (api/main.py)      │    Sub-100ms response times
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Next.js Frontend   │  ← App Router, TypeScript, Tailwind
│  (web/app/*)        │    Real-time search with debouncing
└─────────────────────┘
```

**Database Layer**: PostgreSQL with normalized schema for matches, innings, deliveries, and wickets. Eight materialized views pre-aggregate player stats, partnerships, and team matchups to achieve sub-100ms query response times.

**Ingestion Layer**: Python ETL pipeline with smart sync logic—first run downloads the full Cricsheet zip (~80MB), subsequent runs only grab the 30-day zip (~3MB). Automatically refreshes all materialized views after each sync and logs sync status.

**API Layer**: FastAPI with Pydantic models for type safety and automatic OpenAPI documentation. All SQL queries centralized in `queries.py` module.

**Frontend Layer**: Next.js 14 with App Router pattern, TypeScript for type safety, and Tailwind CSS for styling. Debounced player search with dropdown results and real-time form validation.

---

## Database Schema

### Core Tables (7)

| Table | Purpose |
|-------|---------|
| `players` | Player metadata (name, player_id hash) |
| `competitions` | Competition names and types (T20, ODI, Test, etc.) |
| `matches` | Match metadata (date, venue, teams, result, format) |
| `innings` | Innings data (batting_team, bowling_team per match) |
| `deliveries` | Ball-by-ball records (batter, bowler, runs, phase) |
| `wickets` | Wicket details (player_out, kind, fielders) |
| `sync_log` | Ingestion history (run_at, matches_added, status) |

### Materialized Views (8)

Pre-aggregated analytics tables refreshed after each sync:

- `mv_player_batting` — Career batting stats by format (runs, avg, SR, centuries)
- `mv_player_bowling` — Career bowling stats by format (wickets, economy, avg, 5-wicket hauls)
- `mv_batter_vs_bowler` — Head-to-head matchup stats with format/phase/year breakdown
- `mv_partnerships` — Batting partnership records between any two batters
- `mv_player_vs_team` — Player performance vs specific teams
- `mv_venue_stats` — Venue-specific player statistics
- `mv_team_vs_team` — Team head-to-head records (all-time)
- `mv_team_vs_team_seasons` — Team head-to-head by season
- `mv_team_recent_matches` — Last 20 matches for trending/recent results

---

## Local Setup

### Prerequisites

- **Python** 3.11 or higher
- **PostgreSQL** 14 or higher
- **Node.js** 18 or higher
- **Git**

### Installation Steps

#### 1. Clone the Repository

```bash
git clone https://github.com/iam-Hemanth/cricket-stats.git
cd cricket-stats
```

#### 2. Set Up Python Environment

```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

#### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 4. Configure Database

Create a `.env` file in the project root:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/cricketdb
```

Replace `username`, `password`, and `cricketdb` with your PostgreSQL credentials.

#### 5. Create Database Schema

```bash
psql $DATABASE_URL -f db/schema.sql
```

This creates all 7 core tables.

#### 6. Ingest Data

```bash
python3 ingestion/ingest_all.py
```

This downloads ~80MB of data from Cricsheet and loads 17,174 matches (this takes ~5–10 minutes on first run).

#### 7. Create Materialized Views

```bash
psql $DATABASE_URL -f db/materialized_views.sql
python3 db/create_views.py
```

The first command creates the view definitions; the second populates them from the ingested data.

#### 8. Start the API Server

```bash
python3 -m uvicorn api.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. View interactive API docs at `http://localhost:8000/docs`.

#### 9. Install Frontend Dependencies

```bash
cd web
npm install
```

#### 10. Create Frontend Environment

Create `web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 11. Start the Frontend

```bash
npm run dev
```

#### 12. Open in Browser

Navigate to **http://localhost:3000**

---

## Data Sync

CricStats uses an automated sync pipeline to keep match data updated with new Cricsheet releases.

### Manual Sync

Run the sync command:

```bash
python3 ingestion/sync.py
```

### Smart Sync Logic

- **First run**: Downloads the full Cricsheet zip (~80MB) with all 17,174 matches
- **Subsequent runs**: Downloads only the 30-day zip (~3MB) containing recent matches and corrections
- **View refresh**: Automatically refreshes all 8 materialized views after sync completes
- **Status tracking**: Every sync is logged to `sync_log` table with timestamp, matches added, and status

### Automated Sync (GitHub Actions)

A GitHub Actions workflow can be enabled to run sync automatically on a schedule:

- See `.github/workflows/sync.yml` (configured for deployment stage)
- Default: Runs daily at 12:00 AM UTC
- Pushes updates via git commit if new matches are found

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/players/search?q=kohli` | Search players by name/partial match |
| `GET` | `/api/v1/players/{player_id}/batting` | Batting statistics (career, IPL, format breakdown) |
| `GET` | `/api/v1/players/{player_id}/bowling` | Bowling statistics (career, IPL, format breakdown) |
| `GET` | `/api/v1/players/{player_id}/partnerships` | Batting partnership records with other players |
| `GET` | `/api/v1/players/{player_id}/phases` | Phase breakdown stats (powerplay/middle/death T20s) |
| `GET` | `/api/v1/players/{player_id}/form` | Last 10 innings as form guide |
| `GET` | `/api/v1/matchup?batter_id={id}&bowler_id={id}` | Batter vs bowler head-to-head (format/phase/year breakdown) |
| `GET` | `/api/v1/teams/search?q=india` | Search teams by name |
| `GET` | `/api/v1/teams/h2h?team1=India&team2=Australia` | Team head-to-head (win records, season history) |
| `GET` | `/api/v1/highlights` | Homepage highlights (cached 24 hours) — on fire players, rivalry of day |
| `GET` | `/api/v1/health` | Health check (returns `{"status": "ok"}`) |

All endpoints return JSON with standardized response models (see `api/models.py`).

---

## Project Structure

```
cricket-stats/
├── api/                      # FastAPI backend
│   ├── main.py               # Route handlers & app setup
│   ├── database.py           # PostgreSQL connection pool
│   ├── models.py             # Pydantic response models
│   ├── queries.py            # SQL query constants
│   └── test_api.py           # Endpoint tests
│
├── db/                       # Schema & materialized views
│   ├── schema.sql            # Table definitions
│   ├── materialized_views.sql # View creation SQL
│   ├── create_views.py       # View population script
│   └── test_views.sql        # SQL integrity checks
│
├── ingestion/                # ETL pipeline & sync
│   ├── ingest_all.py         # Bulk ingestion (17,174 matches)
│   ├── sync.py               # Smart sync (30-day zip logic)
│   ├── sync_status.py        # Display last 10 sync runs
│   ├── validate_data.py      # Data integrity validation
│   ├── retry_failed.py       # Retry failed matches
│   └── progress.log          # Successfully ingested match IDs
│
├── web/                      # Next.js 14 frontend
│   ├── app/                  # App Router pages
│   │   ├── layout.tsx        # Root layout (header, footer)
│   │   ├── page.tsx          # Homepage
│   │   ├── players/
│   │   │   └── [player_id]/  # Player profile page
│   │   └── ...
│   ├── components/           # React components
│   └── lib/
│       └── api.ts            # Typed API client
│
├── .github/
│   └── workflows/
│       └── sync.yml          # GitHub Actions sync schedule
│
├── COPILOT_CONTEXT.md        # Project context for AI assistants
├── POST_DEPLOYMENT_ROADMAP.md # Planned features
├── requirements.txt          # Python dependencies
├── .env                      # PostgreSQL connection (not in git)
└── README.md                 # This file
```

---

## Key Technical Decisions

**Why Materialized Views**: The dataset contains 9.69 million deliveries. Computing career/partnership stats on-the-fly would take 2–5 seconds. Materialized views pre-aggregate at the player/team level, reducing query time to sub-100ms. Trade-off: 5–10 minutes refresh time after each sync.

**Why Smart Sync**: First ingestion takes ~5 minutes to download and parse 80MB. Cricsheet's 30-day zip contains only recent matches and corrections. By switching to the 30-day zip on subsequent syncs, we reduce routine sync from 80MB to 3MB (1-minute runtime).

**Why Local PostgreSQL**: A cloud alternative like Supabase free tier offers only 500MB, insufficient for our 1.48GB dataset. Self-hosted allows unlimited storage while keeping costs near zero.

**Why `format_bucket`**: Cricsheet inconsistently labels formats: international T20s are `'IT20'`, domestic T20s are `'T20'`, and IPL is `'T20'` with competition filter. CricStats normalizes this into `format_bucket` (IPL, T20, IT20, ODI, Test, etc.) for clearer analytics separation.

**Why UNION ALL in Views**: The `mv_player_batting` and `mv_player_bowling` views use `UNION ALL` to separate IPL rows from other T20 rows, allowing filtering like "Compare Kohli's IPL SR vs his other T20 SR." This provides cleaner analytics without cluttering the data model.

---

## Screenshots

Coming soon — will add after deployment.

---

## Roadmap

See [POST_DEPLOYMENT_ROADMAP.md](POST_DEPLOYMENT_ROADMAP.md) for a complete feature backlog.

### Top 5 Post-Deployment Priorities

1. **Full player name display** — Add `display_name` column to display "Virat Kohli" instead of "V Kohli"
2. **Top run scorers/wicket takers in team matchups** — New endpoints for India vs Australia: who scored most, who took most wickets
3. **Phase specialist badges** — Automatic badge: "Death overs specialist" if death SR is 20+ points higher than powerplay
4. **Player comparison improvements** — Career overlap indicator, quick stat summary cards, multi-format comparison
5. **Cloud database migration** — Migrate to Supabase/AWS with `CONCURRENTLY` refresh for zero-downtime view updates

---

## Data Source

Data sourced from **[Cricsheet](https://cricsheet.org/)** — an open, public repository of ball-by-ball cricket data. All credit for raw data goes to Cricsheet. This project is a personal analytics tool built on top of their freely available dataset.

---

## Author

**Hemanth Gowda J**

- **GitHub**: [github.com/iam-Hemanth](https://github.com/iam-Hemanth)
- **LinkedIn**: [linkedin.com/in/he4manth](https://www.linkedin.com/in/he4manth)

---

## License

This project uses publicly available data from Cricsheet. For licensing details, refer to Cricsheet's terms at [cricsheet.org](https://cricsheet.org/).
