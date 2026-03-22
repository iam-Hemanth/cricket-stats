# CricStats — Project Context for GitHub Copilot

> Feed this file to Copilot at the start of every session:
> In Copilot Chat type: #file:COPILOT_CONTEXT.md then your prompt

---

## What this project is

A full-stack cricket statistics website built on Cricsheet ball-by-ball data.
- 17,174 men's cricket matches (2008–2025)
- 9,690,917 deliveries in the database
- 10,943 players
- Formats: T20, IT20, ODI, ODM, Test, MDM

The core feature that differentiates this site: **batter vs bowler matchup analytics**
with format breakdown, phase breakdown (powerplay/middle/death), and year-by-year history.

---

## Project folder structure

```
cricket-stats/
  db/
    schema.sql                  ← PostgreSQL table definitions
    materialized_views.sql      ← 5 pre-aggregated analytics views
    create_views.py             ← script to build/rebuild views
    test_views.sql              ← SQL spot-checks for view correctness
  ingestion/
    ingest_all.py               ← one-time bulk ingest of all 17,174 matches
    sync.py                     ← automated sync (downloads new matches from Cricsheet)
    sync_status.py              ← shows last 10 sync runs from sync_log table
    validate_data.py            ← post-ingestion integrity checks
    retry_failed.py             ← retries any matches that failed during ingestion
    progress.log                ← tracks successfully ingested match IDs
    .last_sync                  ← JSON: last sync timestamp + which zip was used
  api/
    main.py                     ← FastAPI app, all route handlers
    database.py                 ← psycopg2 connection pool, db_cursor() context manager
    models.py                   ← Pydantic response models
    queries.py                  ← all SQL query strings as module-level constants
    test_api.py                 ← tests every endpoint against localhost:8000
  web/                          ← Next.js 14 frontend (App Router, TypeScript, Tailwind)
    app/
      layout.tsx                ← root layout with header search bar + footer
      page.tsx                  ← homepage: hero, stats bar, featured matchups
      players/
        search/
          page.tsx              ← search results page (/players/search?q=kohli)
        [player_id]/
          page.tsx              ← player profile page
    components/
      SearchBar.tsx             ← debounced player search with dropdown
      PlayerProfile.tsx         ← batting/bowling tabs, career rows, format tabs
      MatchupCard.tsx           ← batter vs bowler head-to-head card
      FormGuide.tsx             ← last 10 innings colour-coded strip (TODO: build)
    lib/
      api.ts                    ← typed API client, all fetch() calls centralised here
    .env.local                  ← NEXT_PUBLIC_API_URL=http://localhost:8000
  .env                          ← DATABASE_URL=postgresql://...@localhost:5432/cricketdb
  requirements.txt              ← psycopg2-binary, fastapi, uvicorn, requests, tqdm, etc.
  .github/
    workflows/
      sync.yml                  ← GitHub Actions cron (activates at Stage 7 deployment)
```

---

## Database schema (PostgreSQL, local)

```sql
players        (player_id VARCHAR PK, name, created_at)
competitions   (competition_id SERIAL PK, name, type, gender)
matches        (match_id VARCHAR PK, date, season, venue, city,
                team1, team2, winner, win_by_runs, win_by_wickets,
                toss_winner, toss_decision, format, competition_id FK,
                player_of_match, gender)
innings        (innings_id SERIAL PK, match_id FK, innings_number,
                batting_team, bowling_team)
deliveries     (delivery_id BIGSERIAL PK, innings_id FK, over_number,
                ball_number, batter_id FK, bowler_id FK, non_striker_id FK,
                runs_batter, runs_extras, runs_total,
                is_wide, is_noball, is_bye, is_legbye,
                phase SMALLINT)  ← 0=powerplay 1=middle 2=death 3=test
wickets        (wicket_id SERIAL PK, delivery_id FK, player_out_id FK,
                kind, fielder1_id FK, fielder2_id FK)
sync_log       (run_id SERIAL PK, run_at TIMESTAMP, matches_added INT,
                status TEXT, error_msg TEXT)
```

### Important data facts
- `player_id` is a cricsheet hash string like `'ba607b88'` (Kohli), `'244048f6'` (Arshdeep)
- `phase` is SMALLINT not VARCHAR: 0=powerplay, 1=middle, 2=death, 3=test
- Format values: `'T20'` (domestic leagues incl IPL), `'IT20'` (internationals),
  `'ODI'`, `'ODM'` (domestic), `'Test'`, `'MDM'` (domestic multi-day)
- Cricsheet does NOT use `'T20I'` — international T20s are stored as `'IT20'`
- IPL competition name is exactly `'Indian Premier League'`
- Season strings are mixed: `'2024'` (calendar) and `'2024/25'` (split-season)

---

## Materialized views (pre-aggregated for fast queries)

```
mv_player_batting     ← batting stats per player/format/competition/year
mv_player_bowling     ← bowling stats per player/format/year
mv_batter_vs_bowler   ← head-to-head per batter+bowler+format+phase
mv_player_vs_team     ← player stats vs each opposition team
mv_venue_stats        ← scoring patterns by venue and format
```

> mv_player_batting was recently rebuilt to group by YEAR(match.date)
> instead of season string. The year column is now INTEGER not VARCHAR.
> It also includes competition_name from the competitions table.

Refresh command (run after new matches are ingested):
```sql
REFRESH MATERIALIZED VIEW mv_player_batting;
REFRESH MATERIALIZED VIEW mv_player_bowling;
REFRESH MATERIALIZED VIEW mv_batter_vs_bowler;
REFRESH MATERIALIZED VIEW mv_player_vs_team;
REFRESH MATERIALIZED VIEW mv_venue_stats;
```

---

## API (FastAPI, runs on localhost:8000)

All routes are prefixed `/api/v1/`. CORS is enabled for localhost:3000.

```
GET /api/v1/health
GET /api/v1/players/search?q=kohli
GET /api/v1/players/{player_id}/batting?format=Test&year=2024
GET /api/v1/players/{player_id}/bowling?format=Test&year=2024
GET /api/v1/players/{player_id}/form
GET /api/v1/players/{player_id}/vs-teams?role=batting
GET /api/v1/players/{player_id}/partnerships?format=ODI
GET /api/v1/players/{player_id}/phases?format=T20&role=batting
GET /api/v1/matchup?batter_id=ba607b88&bowler_id=244048f6
GET /api/v1/teams/search?q=india
GET /api/v1/teams/h2h?team1=India&team2=Australia&format=ODI
GET /api/v1/highlights
GET /api/v1/venues
GET /api/v1/venues/{venue_name}
```

GET /api/v1/matchup now returns:
- overall: combined stats across all formats
- by_format: list with phases[] and by_year[] per format
- recent_deliveries: last 10 balls between the pair

GET /api/v1/players/{id}/partnerships returns:
- List of partnerships for a player, optionally filtered by format
- Sorted by total_runs DESC
- Max 20 rows per query

GET /api/v1/players/{id}/phases returns:
- batting: PhaseStatBatting[] (phase_name, format_bucket, balls, runs, strike_rate, average, etc)
- bowling: PhaseStatBowling[] (economy, dot_ball_pct, wickets, etc)
- Optional query params: format (T20/ODI/etc), role (batting/bowling)
- Auto-filters ODI/ODM to powerplay only (per phase rules)

GET /api/v1/players/{id}/form returns:
- batting: FormBattingEntry[] (last 10 batting innings with runs, balls_faced, strike_rate, was_dismissed)
- bowling: FormBowlingEntry[] (last 10 bowling innings with economy, wickets, runs_conceded)
- last_updated: date of most recent batting entry

GET /api/v1/highlights returns:
- stat_cards: 4 homepage stat cards
- on_fire_ipl_batting: top 4 IPL batters in the last 90 days
- on_fire_ipl_bowling: top 2 IPL bowlers in the last 90 days
- on_fire_big_leagues_batting: top 4 major league batters in the last 90 days
- on_fire_big_leagues_bowling: top 2 major league bowlers in the last 90 days
- on_fire_international_batting: top 4 international/full-member T20 batters in the last 90 days
- on_fire_international_bowling: top 2 international/full-member T20 bowlers in the last 90 days
- rivalry_ipl: daily rotating IPL batter vs bowler rivalry card
- rivalry_international: daily rotating IT20 batter vs bowler rivalry card
- cached_at: cache build timestamp
- server-side in-memory cache TTL: 24 hours

Start command:
```bash
cd cricket-stats
python -m uvicorn api.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

---

## Frontend (Next.js 14, runs on localhost:3000)

- App Router (not Pages Router)
- TypeScript + Tailwind CSS
- All API calls go through `web/lib/api.ts` — never write fetch() directly in components
- `NEXT_PUBLIC_API_URL=http://localhost:8000` in web/.env.local

Start command:
```bash
cd cricket-stats/web
npm run dev
```

---

## What is DONE (completed and working)

- [x] Stage 1: PostgreSQL schema — all 7 tables created
- [x] Stage 2: Bulk ingestion — all 17,174 matches ingested, 0 failures
- [x] Stage 3: Sync pipeline — sync.py working, uses 30-day zip for regular runs
- [x] Stage 4: Materialized views — all 5 views built and populated
- [x] Stage 5: FastAPI backend — all endpoints working, test_api.py passes
- [x] Stage 6: Next.js frontend — player search, profiles, matchup cards working
- [x] F1 partial: Format tabs added to PlayerProfile (IPL tab pending competition_name)
- [x] F2 Step 2: Matchup API endpoint now returns overall + by_format (phases/by_year) + recent_deliveries
- [x] F2 — Matchup by format + phase + year breakdown
- [x] F5 — Partnership statistics
- [x] F6 — Player comparison tool (/compare)
- [x] F7 — Team head-to-head records (views + API + frontend teams page)
- [x] F3 — Phase specialist stats (API endpoint + PlayerProfile tab with batting/bowling phases)
- [x] F4 — Form guide (last 10 innings batting/bowling form strip with colour-coded badges)
- [x] F8 — Homepage highlights (rotating stat cards + on-fire strip + rivalry of the day)

---

## What is IN PROGRESS right now

### Stage 7 — Deployment
Database: move to cloud (need 2-3GB, evaluating Render/Aiven/DigitalOcean).
API: Railway (GitHub Student Pack credits).
Frontend: Vercel (free tier).
Sync automation: GitHub Actions (activate sync.yml, add DATABASE_URL secret).

Live route added: /compare

---

## Key player IDs for testing

```
V Kohli          → ba607b88
Arshdeep Singh   → 244048f6
RG Sharma        → (run: SELECT player_id FROM players WHERE name = 'RG Sharma')
JM Anderson      → (run: SELECT player_id FROM players WHERE name ILIKE '%anderson%')
```

---

## Common mistakes to avoid

1. Never use `'T20I'` as a format value — it doesn't exist in this database.
   International T20s are stored as `'IT20'`.

2. Never use `season` column for year-based grouping anymore —
   mv_player_batting now uses `year` (INTEGER).

3. phase column in deliveries is SMALLINT (0/1/2/3), not a string.
   Always use integers in WHERE clauses: `WHERE phase = 0` not `WHERE phase = 'powerplay'`.

4. All API calls from the frontend must use the `/api/v1/` prefix.
   Wrong: `fetch('/players/search?q=kohli')`
   Right: `fetch('/api/v1/players/search?q=kohli')`

5. player_id is a hash string, never an integer.
   Always quote it: `WHERE player_id = 'ba607b88'`

6. The Supabase migration was abandoned — database is LOCAL PostgreSQL only.
   DATABASE_URL in .env points to localhost:5432/cricketdb.

7. Do not use localStorage or sessionStorage in Next.js components —
   use React state (useState) for all client-side data.

---

## How to start a Copilot session

Paste this at the start of each chat session in VS Code:

```
#file:COPILOT_CONTEXT.md

I'm continuing development on CricStats, a cricket statistics website.
The context file above has full project details.

Currently working on: [describe what you're doing]
```
