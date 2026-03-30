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

---

## Pre-Deployment Trim

- **File:** `ingestion/trim_for_deployment.py`
- **Purpose:** One-time deletion of out-of-scope matches before cloud migration
- **Status:** ✅ TRIM COMPLETE — Table swaps finished, VACUUM ANALYZE fixed, pending view refresh
- **Latest fix:** VACUUM ANALYZE now runs with `conn.autocommit = True` (VACUUM cannot run in transaction blocks)
- **Completed steps:**
  1. Step 0b: Cleaned up leftover _new tables, dropped 9 materialized views, dropped FK constraint
  2. Steps 1-4: Table swaps completed successfully (deliveries → wickets → innings → matches)
  3. Step 5: VACUUM ANALYZE fixed (now uses autocommit mode)
  4. Step 6: FK constraint recreated
- **What remains:**
  1. Refresh materialized views: `python db/create_views.py` or manual REFRESH commands
  2. Check final DB size to verify space savings
  3. pg_dump database for cloud migration
- **Test results:** 
  - `--dry-run`: ✅ Shows 10,829 matches to drop / 6,340,056 deliveries affected
  - `--execute`: ✅ FIXED — VACUUM ANALYZE error resolved

### full_trim.py (replacement script)

- **Created:** `ingestion/full_trim.py` — replaces `trim_for_deployment.py`
- **Root cause of previous failures:** `psycopg2` parameter substitution (`%(param)s`) inside `CREATE TEMP TABLE AS` statements silently failed — CASE logic never evaluated correctly, so table swaps inserted all rows unfiltered
- **Fix:** All values are hardcoded directly in the SQL string. No `%(param)s` substitution anywhere in the script
- **Modes:** `--dry-run` (Phase 0 + Phase 1 only, no data changed — default) and `--execute` (all 4 phases)
- **Phase 1** shows keep list and requires manual `YES` confirmation before any data is touched
- **Drop logic:**
  - MDM and ODM always dropped
  - Pre-2007 Tests dropped
  - Associate-only ICC events / regional qualifiers dropped
  - Vitality Blast, County Championship, PSL, BPL etc. NOT in keep list
- **Keep logic (K1–K4):**
  - K1: IPL, BBL, SA20, The Hundred, ILT20, MLC (exact names)
  - K2: ICC flagship events (World Cup, T20 WC, Champions Trophy, WTC)
  - K3: Asia Cup main event (not qualifier)
  - K4: At least one of `team1`/`team2` is a Full Member nation
- **Second trim pass executed:** 673 qualifier/null matches dropped
- **Third trim pass executed:** dropped pre-2005 ODI matches (199 matches, 104,435 deliveries)
- **Final match count:** 6,078
- **Final DB size:** 480 MB
- **Decision:** accepting ~485MB target range; buffer can be reviewed post-deployment if needed
- **All 9 materialized views need refresh after this:** run `python db/create_views.py`
- **Status:** TRIM FULLY COMPLETE — next step refresh views then `pg_dump`

### sync.py ingest filter

- **Fixed:** `should_ingest_match()` added to `ingestion/sync.py`
- **Filters:** MDM/ODM, qualifiers, regional tournaments, pre-2007 Tests,
  pre-2005 ODIs, non-allowed T20 leagues, no-full-member matches
- **Call added inside ingest loop:** future syncs now skip PSL, county
  cricket, associate tours etc. automatically
- **Verified via:** `grep -n "should_ingest_match" ingestion/sync.py`
- **Status:** SYNC FILTER ACTIVE

### shared ingestion filter refactor

- **Created:** `ingestion/match_filter.py` — single source of truth for
  filter logic, imported by both `sync.py` and `ingest_all.py`
- **Updated:** `sync.py` — removed inline filter, now imports from
  `match_filter.py`
- **Updated:** `ingest_all.py` — added `should_ingest_match` call before
  `ingest_match` in main loop
- **Both ingestion paths now use identical filter logic**
- **Status:** FILTER UNIFIED — ready for fresh bulk ingest

### Fourth trim pass (final cutoffs)

- **Updated files:** `ingestion/match_filter.py` and `ingestion/full_trim.py`
- **New cutoffs:** drop Tests before `2011-01-01`; drop ODIs before `2007-01-01`
- **League policy:** BBL remains in `ALLOWED_T20_LEAGUES` (kept)
- **Execution:** fresh local truncate + full bulk ingest completed
- **Final match count:** 5,826 matches
- **Final DB size breakdown:**
  - tables: `416 MB`
  - `mv_batter_vs_bowler`: `52 MB`
  - all other materialized views: `16 MB`
  - total `cricketdb`: `493 MB`
- **Status:** TRIM FINAL — ready for Supabase `pg_dump` and deployment


### Keep rule summary

| Condition | Result |
|---|---|
| `format IN ('MDM', 'ODM')` | ALWAYS DROP |
| `format = 'Test' AND date < 2007-01-01` | ALWAYS DROP |
| `competition_name` ILIKE any associate ICC event | ALWAYS DROP |
| `competition_name` ILIKE `%Asia Cup%` AND `%Qualifier%` | ALWAYS DROP |
| `competition_name` ILIKE `%Asia Cup%` (non-qualifier) | KEEP — K1 |
| `competition_name` ILIKE any `ICC_EVENT_PATTERNS` entry | KEEP — K2 |
| `competition_name` IN `ALLOWED_T20_LEAGUES` (exact) | KEEP — K3 |
| `team1` OR `team2` IN full members (at least one) | KEEP — K4 |
| None of the above | DROP |

**K4 note:** Only **one** team needs to be a full member (not both). This covers
bilaterals, India/Pak/etc. in tri-series, and all tour formats across Test/ODI/IT20/T20.

### Full members (8 nations)
`India`, `Australia`, `England`, `Pakistan`, `South Africa`,
`New Zealand`, `West Indies`, `Sri Lanka`

### Allowed T20 leagues (exact `competition_name` match)
- `Indian Premier League`
- `Big Bash League`
- `SA20`
- `The Hundred Men's Competition`  ← exact name including "Men's Competition"
- `International League T20`       ← exact name (not 'ILT20')
- `Major League Cricket`

### Also dropped
- MDM / ODM format matches
- Pre-2007 Test matches
- Pre-2005 ODI matches
- ICC regional qualifier events (`%Qualifier%`, `%Region%`, `%Region Final%`)
- `ICC Men's Cricket World Cup League 2`, `ICC CWC Qualifier`, `ICC T20 World Cup Qualifier`
- Asia Cup qualifiers
- Any match where neither team is a full member
- Matches with NULL competition_id

### Run order
```bash
# 1. Current trim script (supersedes trim_for_deployment.py)
python3 ingestion/full_trim.py --dry-run
python3 ingestion/full_trim.py --execute

# 2. Rebuild all materialized views
python3 db/create_views.py

# 3. Prepare migration artifact
pg_dump "$DATABASE_URL" > cricketdb_trimmed.sql
```

## Fresh ingest status (latest run)

- **State:** FRESH INGEST COMPLETE — deployment dataset rebuilt from scratch with unified filters active
- **Run sequence completed:** truncate data tables -> cleanup artifacts -> bulk ingest -> sequence check -> rebuild materialized views -> final verification
- **Bulk ingest result:** 6,153 matches inserted, 0 failed
- **Post-ingest counts:**
  - matches: 6,153
  - innings: 13,594
  - deliveries: 3,256,174
  - players: 3,311
- **Sequence verification:** `deliveries.delivery_id`, `innings.innings_id`, and `wickets.wicket_id` all use `nextval(...)`
- **Materialized views:** `python db/create_views.py` completed successfully (all 9 views created)
- **Final DB size:** `554 MB`
- **App check:**
  - API health endpoint returns `{"status":"ok","matches_in_db":6153,...}`
  - Player profile route `/players/ba607b88` returns HTTP 200
  - Player profile dependencies return HTTP 200 (`batting`, `bowling`, `partnerships`, `phases`, `form`)
- **Operational note:** keep `sync_log` preserved during table truncation for future audit/history

### 2026-03-29 Pre-Deployment Trim Update

- Dropped BBL from allowed leagues in `match_filter.py` and `full_trim.py`
- Fresh truncate and bulk ingest completed without BBL
- Final match count: 0
- Final DB size breakdown: tables `104 kB`; `mv_batter_vs_bowler` `24 kB`; all other views `200 kB`; total `cricketdb` `9702 kB`
- Status: FINAL TRIM COMPLETE — ready for Supabase pg_dump

## Deployment

- Created: Procfile and render.yaml for Render deployment
- API start command: uvicorn api.main:app --host 0.0.0.0 --port $PORT
- DATABASE_URL set as env var on Render dashboard (not in code)
- NEXT_PUBLIC_API_URL set as env var on Vercel dashboard
- Hardcoded localhost check:
  - api/main.py: found hardcoded localhost CORS origins; replaced with CORS_ALLOWED_ORIGINS environment variable parsing.
  - api/database.py: found localhost in DATABASE_URL example text only; replaced with host-agnostic DATABASE_URL placeholder format.
  - web/lib/api.ts: found localhost fallback base URL; replaced with API_BASE from NEXT_PUBLIC_API_URL (fallback localhost) and centralized URL builder to keep /api/v1 routing consistent.
- Status: CODEBASE DEPLOYMENT READY
- Fixed: Next.js prerender error on /compare and other API pages
- Added export const dynamic = 'force-dynamic' to all pages
  that make API calls at build time
- Status: Ready to redeploy on Vercel
- Fixed /compare: wrapped useSearchParams in Suspense boundary
- Required by Next.js 16 for static page generation
- Status: Ready to redeploy
- Fixed /teams: wrapped useSearchParams in Suspense boundary
- Added force-dynamic to teams page
- Status: Ready to redeploy
- Created: .github/workflows/keepalive.yml
- Pings API every 14 minutes to prevent Render free tier spin-down
- Endpoint: https://cricket-stats-lqlt.onrender.com/api/v1/health
- Status: ACTIVE on push to main
- Fixed CORS: hardcoded base origins + env var as optional addition
- Base allowed: localhost:3000, cricstatsapp.vercel.app,
  cricket-stats-gamma.vercel.app
- Status: Push to trigger Render redeploy
- Fixed homepage highlights fetch in page.tsx
- Removed next revalidate:3600 cache - was caching empty response
- Added AbortController with 10s timeout
- Used cache:no-store for always-fresh highlights data
- Updated README.md with live URLs, correct match counts,
  deployment stack, data scope explanation, new files
- Status: README up to date as of March 30 2026
- Fixed: connection pool exhaustion on Render free tier
- Changed maxconn from 10 to 3 (Supabase free = 15 max total)
- Added connect_timeout=10 and PoolError handler
- Returns HTTP 503 instead of crashing on pool exhaustion
- Status: Push to redeploy on Render

### 2026-03-29 Deployment Update (mv_stat_cards)

- Added new materialized view: mv_stat_cards for homepage stat cards
- Solves GET /api/v1/highlights stat_cards timeout risk on Supabase free tier
- Storage impact is negligible (4 rows + 1 index)
- Refresh cadence: refreshed during sync (about every 6 hours)
- Local build: run python3 db/create_views.py
- Supabase build: run python db/create_views.py after restore/deploy
- Status: ready to deploy
