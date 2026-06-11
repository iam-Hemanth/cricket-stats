# CricStats — Cricket Analytics Platform

> Ball-by-ball cricket analytics built on Cricsheet data. Player profiles, matchups, match scorecards, team head-to-head, player-vs-team splits, and a custom stat builder across formats.

**🌐 Live at [cricstatsapp.vercel.app](https://cricstatsapp.vercel.app)**

---

## Tech Stack

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16+-000000?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4+-0F172A?style=flat&logo=tailwindcss)](https://tailwindcss.com/)

---

## Overview

CricStats is a comprehensive cricket statistics platform powered by roughly 5.2k curated men's matches from Cricsheet. It features ball-by-ball analysis of about 2.7 million deliveries across nearly 3k players, covering international cricket and major T20 leagues. Unlike mainstream cricket sites, CricStats specializes in **granular matchup analytics** — player vs player head-to-heads, player-vs-team records, match cards, custom filtered stat tables, and team dashboards with format, venue, phase, season, and match-stage breakdowns.

The platform is built as a full-stack application with a PostgreSQL backend, FastAPI REST API, and modern Next.js frontend with TypeScript and Tailwind CSS.

---

## Features

- **Player Profiles** — Comprehensive career statistics with year-wise batting/bowling records, form strips, Test innings splits, phase badges, and IPL separated from other T20 formats for cleaner analytics.
- **Batter vs Bowler Matchups** — Head-to-head matchup cards showing all-format totals, format tabs, phase and venue splits, dismissal breakdowns, year-by-year records, and recent delivery timelines.
- **Player vs Team Splits** — Batting and bowling records for one player against a selected team with format-level breakdowns.
- **Batting Partnerships** — Career records between any two batters with total runs, average partnership, and best partnership scores.
- **Phase Specialist Stats** — Powerplay/middle/death breakdown for T20 formats showing strike rate and consistency by phase.
- **Form Guide** — Last 10 innings displayed as a colour-coded visual strip showing runs and opposition with format filtering.
- **Match Card v3 & Interactive Run Progression Chart** — High-fidelity, interactive 2D SVG run progression graph supporting scroll-to-zoom and drag-to-pan, Fall of Wicket (FOW) annotations, and Super Over-aware match scoring.
- **Matches Archive Page** — Premium three-panel layout featuring a Month Timeline match density widget with side-by-side vertical pillars, series/tournament winner scorelines, canonical host country resolving, and smart team abbreviation search query parsing (e.g. RCB vs CSK).
- **Team Head-to-Head** — Win records, season-by-season results, recent match history, top run scorers, top wicket takers, high/low totals, and historic knockout matches between any two teams.
- **Player Comparison** — Side-by-side career statistics comparison with shareable URL.
- **Stat Builder** — Dynamic batting, bowling, team-results, and head-to-head query builder with multi-select filters for formats, teams, venues, countries, phases, overs, batting position, match stage, date ranges, result state, toss, day/night, thresholds, and grouping modes.
- **Entity Canonicalization** — Ingestion-time team and venue alias resolution keeps historical franchise names and venue variants aligned with canonical display names.
- **Premium Glassmorphic UI/UX & Light Mode** — Responsive layout built using a modern glassmorphic theme with glowing borders, hover micro-animations, animated SVG loaders, and seamless, adaptive Light/Dark mode support.
- **Homepage Highlights** — Rotating stat cards, "on fire right now" players, "On This Day" historical matches carousel, and rivalry of the day insights with 24-hour caching.

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
│   PostgreSQL DB     │  ← 12 tables + 10 materialized views
│   (~5.2k matches)   │    Pre-aggregated analytics
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  FastAPI Backend    │  ← 20+ RESTful endpoints
│  (api/main.py)      │    Sub-100ms response times
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Next.js Frontend   │  ← App Router, TypeScript, Tailwind
│  (web/app/*)        │    Real-time search with debouncing
└─────────────────────┘
```

**Database Layer**: PostgreSQL with normalized schema for matches, innings, deliveries, wickets, and canonical team/venue aliases. Ten materialized views pre-aggregate player stats, partnerships, team matchups, venue splits, and homepage cards to achieve sub-100ms query response times for common dashboards.

**Ingestion Layer**: Python ETL pipeline with smart sync logic—first run downloads the full Cricsheet zip, subsequent runs only grab the 30-day zip when recent enough. The pipeline filters the dataset, resolves team/venue aliases at ingest time, handles ties/draws/no-results and Super Over eliminator winners, refreshes materialized views, and logs sync status.

**API Layer**: FastAPI with Pydantic models for type safety and automatic OpenAPI documentation. SQL lives in shared query modules, with a dedicated dynamic SQL builder for the Stat Builder endpoints.

**Frontend Layer**: Next.js 16 with App Router pattern, TypeScript for type safety, and Tailwind CSS 4 for styling. Includes responsive navigation, debounced search controls, detailed analytics cards, match archive pages, scorecards, and a full-screen Stat Builder workspace.

---

## Database Schema

### Core Event Tables (7)

| Table | Purpose |
|-------|---------|
| `players` | Player metadata (name, player_id hash) |
| `competitions` | Competition names and types (T20, ODI, Test, etc.) |
| `matches` | Match metadata (date, venue/city, teams, result, format, playing XI, stage/group/number, canonical IDs, raw audit names) |
| `innings` | Innings data (batting_team, bowling_team per match) |
| `deliveries` | Ball-by-ball records (batter, bowler, runs, phase) |
| `wickets` | Wicket details (player_out, kind, fielders) |
| `sync_log` | Ingestion history (run_at, matches_added, status) |

### Entity Canonicalization Tables (5)

| Table | Purpose |
|-------|---------|
| `teams` | Canonical team records with stable `team_id` values |
| `team_aliases` | Historical and alternate team names mapped to canonical teams |
| `venues` | Canonical venue records with city/country metadata |
| `venue_aliases` | Venue name variants mapped to canonical venues |
| `entity_alias_candidates` | Unresolved team/venue names discovered during ingestion for manual review |

### Materialized Views (10)

Pre-aggregated analytics tables refreshed after each sync:

- `mv_player_batting` — Career batting stats by format (runs, avg, SR, centuries)
- `mv_player_bowling` — Career bowling stats by format (wickets, economy, avg, 5-wicket hauls)
- `mv_batter_vs_bowler` — Head-to-head matchup stats with format/phase/year breakdown
- `mv_partnerships` — Batting partnership records between any two batters
- `mv_player_vs_team` — Player performance vs specific teams
- `mv_venue_stats` — Venue-specific player statistics
- `mv_team_vs_team` — Team head-to-head records (all-time)
- `mv_team_vs_team_seasons` — Team head-to-head by season
- `mv_team_recent_matches` — Recent team matchup results with city, country, stage, and first-innings score context
- `mv_stat_cards` — Pre-computed homepage stat cards (all-time records)

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
python3 db/setup_db.py
```

This creates the event tables, canonical team/venue alias tables, indexes, and seed entity records. If you prefer raw SQL, `psql $DATABASE_URL -f db/schema.sql` will create the schema, but `db/setup_db.py` also runs entity seed population.

#### 6. Ingest Data

```bash
python3 ingestion/ingest_all.py
```

This downloads Cricsheet's men's JSON data and filters it down to the curated CricStats scope: major ICC events, bilateral series involving top nations, and allowed T20 leagues. Recent local datasets are around 5.2k matches and 2.7M deliveries. The ingest also canonicalizes team/venue names, stores raw audit names, extracts match stage/group/number metadata, and preserves ties, draws, no-results, and Super Over eliminator winners.

#### 7. Create Materialized Views

```bash
python3 db/create_views.py
```

This rebuilds all 10 materialized views and supporting indexes from the ingested data.

#### 7a. Run API Tests

```bash
PYTHONPATH=. pytest tests -q
```

This runs the automated regression tests in `tests/` without collecting scratch scripts. For a quick manual smoke test against a running server, you can also run:

```bash
python api/test_api.py
```

#### 8. Start the API Server

```bash
source .venv/bin/activate
pip install uvicorn fastapi
python -m uvicorn api.main:app --reload --port 8000
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

- **First run / stale state**: Downloads the full Cricsheet zip. Filter in `ingestion/match_filter.py` automatically keeps only allowed matches.
- **Subsequent recent runs**: Downloads the 30-day zip containing recent matches and corrections when the last sync is recent enough
- **Entity resolution**: New teams and venues are resolved through `ingestion/entity_resolver.py`; unresolved names are logged as alias candidates
- **View refresh**: Automatically refreshes all 10 materialized views after sync completes
- **Status tracking**: Every sync is logged to `sync_log` table with timestamp, matches added, and status

### Automated Sync (GitHub Actions)

A GitHub Actions workflow can be enabled to run sync automatically on a schedule:

- See `.github/workflows/sync.yml` (configured for deployment stage)
- Default: Runs every 6 hours
- Syncs directly to production Supabase database

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check with match count and last sync timestamp |
| `GET` | `/api/v1/highlights` | Homepage highlights (cached 24 hours): stat cards, form players, rivalry of the day |
| `GET` | `/api/v1/on-this-day` | Matches that happened on today's month/day in past seasons |
| `GET` | `/api/v1/players/search?q=kohli` | Search players by name/partial match |
| `GET` | `/api/v1/players/{player_id}/batting` | Batting statistics (career, IPL, format breakdown) |
| `GET` | `/api/v1/players/{player_id}/bowling` | Bowling statistics (career, IPL, format breakdown) |
| `GET` | `/api/v1/players/{player_id}/vs-teams?role=batting` | Player batting/bowling records against teams |
| `GET` | `/api/v1/players/{player_id}/partnerships` | Batting partnership records with other players |
| `GET` | `/api/v1/players/{player_id}/phases` | Phase breakdown stats (powerplay/middle/death T20s) |
| `GET` | `/api/v1/players/{player_id}/form` | Last 10 innings as form guide |
| `GET` | `/api/v1/players/{player_id}/test-splits` | Test batting/bowling first-innings vs second-innings splits |
| `GET` | `/api/v1/matchup?batter_id={id}&bowler_id={id}` | Batter vs bowler head-to-head with all-format, phase, venue, dismissal, year, and delivery breakdowns |
| `GET` | `/api/v1/teams/search?q=india` | Search teams by name |
| `GET` | `/api/v1/teams/h2h?team1=India&team2=Australia` | Team head-to-head (win records, season history) |
| `GET` | `/api/v1/teams/h2h/top-batters` | Top run scorers in a team-vs-team matchup |
| `GET` | `/api/v1/teams/h2h/top-bowlers` | Top wicket takers in a team-vs-team matchup |
| `GET` | `/api/v1/venues/search?q=wankhede` | Venue autocomplete, including alias-backed canonical names |
| `GET` | `/api/v1/venues` | Browse venues with optional filters |
| `GET` | `/api/v1/venues/{venue_name}` | Venue-specific player statistics |
| `GET` | `/api/v1/matches` | Match archive with team, H2H, format, competition, year, player, and pagination filters |
| `GET` | `/api/v1/match/{match_id}` | Detailed match scorecard, innings, partnerships, fall of wickets, playing XI, and Super Over-aware result context |
| `GET` | `/api/v1/competitions/search?q=ipl` | Competition/series autocomplete |
| `POST` | `/api/v1/stat-builder/batting` | Dynamic batting stat builder query |
| `POST` | `/api/v1/stat-builder/bowling` | Dynamic bowling stat builder query |
| `POST` | `/api/v1/stat-builder/team-results` | Dynamic team results query |
| `POST` | `/api/v1/stat-builder/h2h` | Composite team H2H dashboard query |
| `POST` | `/api/v1/stat-builder/meta` | Dynamic Stat Builder filter metadata |

Endpoints return JSON; core analytics responses are modeled in `api/models.py`.

---

## Deployment

CricStats runs on a modern cloud stack:

| Service | Provider | Purpose |
|---------|----------|---------|
| Database | Supabase | PostgreSQL (cloud-hosted) |
| API | Render | FastAPI backend |
| Frontend | Vercel | Next.js frontend |
| Sync | GitHub Actions | Automated data sync every 6 hours |

### Environment Variables

**Render (API):**
- `DATABASE_URL` — PostgreSQL connection string
- `CORS_ALLOWED_ORIGINS` — Comma-separated frontend origins (for example `https://cricstatsapp.vercel.app,https://cricket-stats-gamma.vercel.app`)
    If unset outside production, API falls back to `http://localhost:3000` for local development.
- `PYTHON_VERSION` — 3.11.0

**Vercel (Frontend):**
- `NEXT_PUBLIC_API_URL` — API base URL

**GitHub Actions:**
- `DATABASE_URL` — PostgreSQL connection string (repo secret)

---

## Project Structure

```
cricket-stats/
├── api/                      # FastAPI backend
│   ├── main.py               # Route handlers & app setup
│   ├── database.py           # PostgreSQL connection pool
│   ├── entity_resolution.py  # API-boundary team/venue alias helpers
│   ├── models.py             # Pydantic response models
│   ├── queries.py            # SQL query constants
│   ├── stat_builder.py       # Dynamic SQL builder for custom stat queries
│   └── test_api.py           # Manual API smoke script
│
├── db/                       # Schema & materialized views
│   ├── schema.sql            # Table definitions
│   ├── entity_aliases.sql    # Canonical team/venue alias schema
│   ├── materialized_views.sql # View creation SQL
│   ├── create_views.py       # View population script
│   ├── populate_entities.py  # Seed canonical teams/venues from JSON
│   ├── backfill_entities.py  # Backfill canonical IDs for existing rows
│   └── test_views.sql        # SQL integrity checks
│
├── ingestion/                # ETL pipeline & sync
│   ├── ingest_all.py         # Bulk ingestion with match filter
│   ├── sync.py               # Smart sync (30-day zip logic)
│   ├── match_filter.py       # Filter logic (shared by sync + ingest)
│   ├── entity_resolver.py    # Team/venue canonicalization logic
│   ├── entity_aliases.json   # Reviewed alias catalog
│   ├── full_trim.py          # One-time DB trim script
│   ├── sync_status.py        # Display last 10 sync runs
│   ├── validate_data.py      # Data integrity validation
│   └── progress.log          # Successfully ingested match IDs
│
├── tests/                    # Pytest API regression tests
│   ├── test_api_endpoints.py # FastAPI endpoint coverage
│   ├── test_entity_resolution.py # Pure entity resolver regression tests
│   └── test_database_url_configuration.py # DB URL/config safety tests
│
├── web/                      # Next.js 16 frontend
│   ├── app/                  # App Router pages
│   │   ├── layout.tsx        # Root layout (header, footer)
│   │   ├── page.tsx          # Homepage
│   │   ├── matches/          # Match archive
│   │   ├── match/[matchId]/  # Detailed match scorecard
│   │   ├── teams/            # Team H2H dashboard
│   │   ├── matchup/          # Batter-vs-bowler page
│   │   ├── player-vs-team/   # Player-vs-team page
│   │   ├── stat-builder/     # Custom query builder workspace
│   │   ├── players/
│   │   │   └── [player_id]/  # Player profile page
│   │   └── ...
│   ├── components/           # React components
│   │   └── stat-builder/     # Stat Builder filters and result viewers
│   └── lib/
│       └── api.ts            # Typed API client
│
├── .github/
│   └── workflows/
│       ├── sync.yml          # GitHub Actions sync (every 6 hours)
│       └── keepalive.yml     # GitHub Actions API keepalive ping
│
├── COPILOT_CONTEXT.md        # Project context for AI assistants
├── POST_DEPLOYMENT_ROADMAP.md # Planned features
├── requirements.txt          # Python dependencies
├── .env                      # PostgreSQL connection (not in git)
└── README.md                 # This file
```

---

## Key Technical Decisions

**Why Materialized Views**: The curated dataset contains millions of deliveries. Computing career, partnership, matchup, team, and homepage stats on-the-fly would take seconds on common queries. Materialized views pre-aggregate the highest-traffic analytics, reducing query time to sub-100ms. Trade-off: several minutes of refresh time after each sync.

**Why Smart Sync**: First ingestion needs the full Cricsheet archive. Cricsheet's 30-day zip contains only recent matches and corrections. By switching to the recent zip when the last sync is fresh, routine syncs avoid reprocessing the full archive.

**Why curated data scope**: The full Cricsheet dataset is too large for the current free-tier cloud database target. CricStats keeps meaningful men's cricket: ICC events, bilateral series between top nations, and major T20 leagues such as IPL, SA20, The Hundred, ILT20, and MLC. Tests and ODIs are trimmed by date while major recent limited-overs and league data stays available.

**Why `format_bucket`**: Cricsheet inconsistently labels formats: international T20s are `'IT20'`, domestic T20s are `'T20'`, and IPL is `'T20'` with competition filter. CricStats normalizes this into `format_bucket` (IPL, T20, IT20, ODI, Test, etc.) for clearer analytics separation.

**Why UNION ALL in Views**: The `mv_player_batting` and `mv_player_bowling` views use `UNION ALL` to separate IPL rows from other T20 rows, allowing filtering like "Compare Kohli's IPL SR vs his other T20 SR." This provides cleaner analytics without cluttering the data model.

**Why canonical entities**: Cricsheet preserves historical names such as `Royal Challengers Bangalore`, `Delhi Daredevils`, and `Feroz Shah Kotla`. CricStats resolves those aliases at ingestion and at API boundaries so old names still work in searches while analytics aggregate under current canonical teams and venues.

**Why a dynamic Stat Builder**: Fixed dashboards cover common questions, but cricket analysis often needs ad hoc filters like "IPL death-over bowling in eliminators since 2020" or "team results while chasing 180+". The Stat Builder uses parameterized SQL builders and constrained sort/group options so users can compose those queries without exposing raw SQL.

---

## Screenshots

Visit [cricstatsapp.vercel.app](https://cricstatsapp.vercel.app) to see the live platform.

---

## Roadmap

See [POST_DEPLOYMENT_ROADMAP.md](POST_DEPLOYMENT_ROADMAP.md) for a complete feature backlog.

### Current Priorities

1. **Full player name display** — Add `display_name` metadata so pages can show "Virat Kohli" instead of Cricsheet's abbreviated names.
2. **Entity backfill and audit hardening** — Finish reviewing alias candidates and backfill canonical IDs for any existing rows that predate ingestion-time canonicalization.
3. **Stat Builder export** — Add shareable image/card export for custom query results with the applied filters and CricStats branding.
4. **Frontend/API consolidation** — Route remaining direct component fetches through `web/lib/api.ts` and keep response types in one place.
5. **Build and test hygiene** — Keep backend tests, frontend lint, and production build clean in CI before larger feature work.

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
