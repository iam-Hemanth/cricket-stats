# CricStats — Project Memory
Last updated: March 25, 2026
Generated from: live session extraction
Purpose: Paste this file at the start of a new Claude chat to resume instantly.

---

## 1. Project Overview

CricStats is a full-stack cricket analytics platform built by Hemanth Gowda J as a
solo passion project. It runs on Cricsheet's open ball-by-ball data covering 17,174
men's matches (2008–2025), 9.69 million deliveries, and 10,943 players across all
formats — Test, ODI, T20, IT20, IPL and major domestic leagues.

What makes it different from ESPNcricinfo or Cricbuzz: it works from raw ball-by-ball
data and can answer questions like "how has this batter performed against this specific
bowler in T20 death overs over the last 3 seasons, broken down year by year" — with
full format, phase, and year granularity. No mainstream site surfaces this kind of
depth at the delivery level.

Hemanth describes himself as a coding newcomer using AI-assisted "vibe coding" — he
builds the project by feeding detailed, structured prompts to AI models (primarily
GitHub Copilot in VS Code) rather than writing code from scratch. The prompt quality
and planning strategy are as important as the code itself.

Stack: PostgreSQL (local) → Python ETL → FastAPI → Next.js 14.
GitHub repo: https://github.com/iam-Hemanth/cricket-stats

---

## 2. Current Status — Right Now

### Fully complete:
- Stage 1: PostgreSQL schema (7 tables)
- Stage 2: Bulk ingestion (17,193 men's matches, 0 failures)
- Stage 3: Sync pipeline (smart 30-day vs full zip switching)
- Stage 4: Materialized views (9 views total)
- Stage 5: FastAPI backend (12+ endpoints)
- Stage 6: Next.js frontend (player search, profiles, matchup cards)
- F1: Career summary with format tabs (IPL separated, year-wise)
- F2: Matchup by format + phase + year breakdown
- F3: Phase specialist stats (powerplay/middle/death for T20 formats)
- F4: Form guide (last 10 innings colour-coded strip with T20-aware SR logic)
- F5: Partnership statistics (correctly calculates combined partnership runs)
- F6: Player comparison tool (/compare page with shareable URL)
- F7: Team head-to-head records (3 views + API + frontend with IPL season breakdown)
- F8: Homepage highlights (rotating stat cards, on fire now with IPL/Big Leagues/
  International tabs, rivalry of the day)
- README.md written and committed
- POST_DEPLOYMENT_ROADMAP.md created and maintained
- COPILOT_CONTEXT.md maintained throughout
- Female matches cleaned from database (26 removed)
- Sync URL fixed to men's-only zip

### Current status:
DEPLOYED — CricStats is fully live at https://cricstatsapp.vercel.app
All 8 features (F1-F8) working on production.
GitHub Actions sync active — new data pulls every 6 hours.

### Single next action when resuming:
Project is deployed and running. Focus shifts to post-deployment
improvements from the backlog in Section 10.
Monitor Supabase storage (currently 457MB / 500MB).
IPL data will appear automatically within 2-3 days as Cricsheet
publishes recent matches.

---

## 3. What We Were Just Working On

### Deployment — COMPLETE ✅
Stage 7 deployment finished successfully on March 30, 2026.

### Live URLs:
- Frontend: https://cricstatsapp.vercel.app
- API: https://cricket-stats-lqlt.onrender.com
- Database: Supabase (457MB / 500MB)

### Full deployment stack:
- Database: Supabase free tier (PostgreSQL, ap-south-1)
- API: Render free tier (FastAPI, auto-deploys from GitHub)
- Frontend: Vercel free tier (Next.js, auto-deploys from GitHub)
- Sync: GitHub Actions (every 6 hours, DATABASE_URL secret set)
- Keepalive: GitHub Actions ping every 14 minutes (keepalive.yml)

### Key fixes made during deployment:
- CORS: hardcoded allowed origins in api/main.py
- Next.js prerender: added Suspense boundary to /compare and /teams
- Highlights cache: removed stale revalidate:3600, added no-store
- mv_stat_cards: created on Supabase via psql to bypass 30s timeout
- Render keepalive: GitHub Actions pings every 14 minutes

### Data state:
- 5,164 matches in production
- Filter active: match_filter.py in sync.py and ingest_all.py
- Allowed leagues: IPL, SA20, Hundred, ILT20, MLC (BBL dropped)
- Test cutoff: 2011, ODI cutoff: 2007
- IPL 2025 data pending — Cricsheet uploads with 2-5 day delay

### What was mid-thought when session ended:
Deployment complete. Confirmed Cricsheet hasn't published
March 28-29 IPL matches yet — normal 2-5 day delay.
Data will sync automatically when Cricsheet publishes.

---

## 4. Tech Stack & Architecture

### Database (PostgreSQL, local, port 5432, db name: cricketdb)
7 core tables: players, competitions, matches, innings, deliveries, wickets, sync_log

9 materialized views:
- mv_player_batting — batting stats per player/format/competition_name/year
- mv_player_bowling — bowling stats per player/format/year
- mv_batter_vs_bowler — head-to-head per batter+bowler+format_bucket+phase+year
- mv_partnerships — career partnership records between any two batters
- mv_player_vs_team — player stats vs each opposition team
- mv_venue_stats — scoring patterns by venue
- mv_team_vs_team — overall head-to-head per team pair per format_bucket
- mv_team_vs_team_seasons — year-by-year breakdown per team pair
- mv_team_recent_matches — last N matches between any two teams

Key pattern: materialized views pre-aggregate the 9.7M row deliveries table so
API queries return in milliseconds. Always refresh after ingesting new data.

### API (FastAPI, port 8000)
Pattern: all SQL lives in api/queries.py as module-level string constants.
Route handlers in api/main.py call queries via db_cursor() context manager from
api/database.py. Pydantic models in api/models.py validate responses.
All routes prefixed /api/v1/. CORS enabled for localhost:3000.
24-hour in-memory cache on GET /api/v1/highlights (dict + datetime).

### Frontend (Next.js 14 App Router, port 3000)
ALL fetch() calls go through web/lib/api.ts — never write fetch() directly in
components. NEXT_PUBLIC_API_URL env var controls the API base URL.
Every fetch URL must include /api/v1/ prefix — this has caused bugs multiple times.

### Data pipeline
Source: Cricsheet (cricsheet.org) open ball-by-ball JSON
Sync: ingestion/sync.py — downloads recently_played_30_male_json.zip (~3MB) when
last sync < 25 days ago, falls back to all_male_json.zip (~80MB) for first run.
After sync: automatically refreshes all materialized views (takes ~10 minutes total,
mv_player_batting alone takes ~482 seconds).
Sync URL was recently fixed from the generic zip to the men's-only zip.

---

## 5. Critical Data Facts & Gotchas

**Format values in database:**
- `'T20'` = domestic T20 leagues including IPL
- `'IT20'` = international T20 bilaterals (NEVER use 'T20I' — it does not exist)
- `'ODI'` = international one-day
- `'ODM'` = domestic one-day (Royal London Cup etc.)
- `'Test'` = Test matches
- `'MDM'` = domestic multi-day (County Championship etc.)
- ICC T20 World Cup is stored as format='T20' with competition name — NOT IT20
- Bilateral T20I tours are ALSO format='T20' with "tour of" in competition name
- IT20 has only 240 matches — mostly older bilateral series

**Phase column:** SMALLINT in deliveries table. 0=powerplay, 1=middle, 2=death,
3=test. Never use strings. Always: `WHERE phase = 0` not `WHERE phase = 'powerplay'`

**player_id:** Cricsheet hash string (e.g. 'ba607b88' = V Kohli). Never an integer.
Always quote in SQL.

**year column:** INTEGER in mv_player_batting/bowling. Not the old season string.
Use `year` not `season` in queries against these views.

**IPL competition name:** Exactly `'Indian Premier League'` — case sensitive.

**RCB name change:** 'Royal Challengers Bangalore' → 'Royal Challengers Bengaluru'
Fixed via normalise_team() SQL function applied in all team views.

**Non-striker runs:** Partnership calculations must sum runs from BOTH batters
(use runs_total not runs_batter, group by innings+pair). Earlier version only
counted striker's runs — was fixed in F5.

**Female matches:** 26 were accidentally ingested via the generic sync zip. All
have been deleted. Sync URL is now fixed to men's-only zip.

**T20 colour coding for form guide:** Uses AND logic not OR — a badge is green
only if BOTH run threshold AND SR threshold are met. Thresholds:
- Excellent: runs >= 40 AND SR >= 160
- Good: runs >= 25 AND SR >= 140
- OK: runs >= 10 AND SR >= 100
- Poor: everything else. Duck (0 + dismissed) = dark red.

**Deliveries table is 1374MB** — everything else is tiny. This is the table that
determines whether trimming gets under the 500MB target.

**Competition name for on-fire international filter:** Must use ILIKE patterns
plus full-member regex because World Cup is stored as competition name not IT20
format. Associate nation matches filtered by regex exclusion list.

---

## 6. Deployment — Full Picture

### Current deployment targets — ALL LIVE:
- Database: Supabase free tier
  URL: postgresql://postgres.kxbjhpvjdvjisryhwwnz:cricketstats2355
       @aws-1-ap-south-1.pooler.supabase.com:5432/postgres
  Size: 457MB / 500MB limit
- API: Render free tier
  URL: https://cricket-stats-lqlt.onrender.com
  Keepalive: GitHub Actions ping every 14 minutes
- Frontend: Vercel free tier
  URL: https://cricstatsapp.vercel.app
- Sync: GitHub Actions (sync.yml) — not yet activated for Supabase

### Deployment sequence — FULLY COMPLETE ✅
✅ 1. Data trim — 3 passes, 5164 matches, 463MB local
✅ 2. pg_dump local → pg_restore to Supabase (457MB)
✅ 3. Render web service created and live
✅ 4. Vercel project created and live
✅ 5. CORS fixed in api/main.py
✅ 6. Next.js prerender errors fixed (Suspense on /compare, /teams)
✅ 7. Keepalive GitHub Action created (every 14 minutes)
✅ 8. mv_stat_cards created on Supabase via psql
✅ 9. GitHub Actions sync activated (DATABASE_URL secret added)
✅ 10. Homepage highlights fixed (no-store cache, AbortController)

### GitHub Actions sync activation (step 9):
Go to GitHub repo → Settings → Secrets → Actions → New secret:
Name: DATABASE_URL
Value: postgresql://postgres.kxbjhpvjdvjisryhwwnz:cricketstats2355
       @aws-1-ap-south-1.pooler.supabase.com:5432/postgres
After adding secret, sync.yml activates automatically.

---

## 7. Decisions Made & Why

**Decision:** Use materialized views instead of querying deliveries directly
Why: 9.7M rows makes direct queries slow (seconds). Views pre-aggregate to
thousands of rows for sub-100ms responses.
What was rejected: Direct queries with heavy indexing (still too slow for profiles)

**Decision:** Split IT20 from T20 in format_bucket
Why: Cricsheet stores IPL and World Cup both as 'T20'. Without separation, Kohli's
IPL stats mix with his India stats. IPL gets its own bucket.
What was rejected: Using raw format column directly (causes IPL/IT20 confusion)

**Decision:** UNION ALL pattern in batting/bowling views
Why: Cleanest way to give IPL its own row while other T20s share a row, without
complex CASE logic in every query.
What was rejected: Single GROUP BY with CASE expression (works but harder to maintain)

**Decision:** Keep database local, not Supabase
Why: Database is 1.48GB, Supabase free tier is 500MB. Attempted migration abandoned.
What was rejected: Supabase (size limit), cutting data arbitrarily to 500MB early

**Decision:** partnership view uses LEAST/GREATEST pair key + GROUP BY without c.name
Why: First version grouped by c.name causing 7 rows for Kohli-Dhawan ODI instead of 1
(each bilateral series was a separate group). Removing c.name from GROUP BY fixed it.
What was rejected: DISTINCT ON approach (only kept one row per innings, missed others)

**Decision:** normalise_team() SQL function for RCB name change
Why: RCB changed name mid-database. Single function wrapping all team references
in views ensures consistent naming without touching raw data.
What was rejected: Updating raw match data (risky, would be overwritten on sync)

**Decision:** T20 form guide uses AND logic for colour thresholds
Why: OR logic meant a 45-ball 50 (good volume, slow SR) showed green — misleading
for T20 cricket where SR is as important as runs. AND requires both conditions.
What was rejected: OR logic (original implementation, replaced after user feedback)

**Decision:** On fire section filters by full member nations only
Why: Associate nation players like players from Cyprus, Bahrain etc. were appearing
in "on fire" sections — not meaningful to cricket fans.
What was rejected: Format-only filter (doesn't exclude associate bilateral tours)

**Decision:** Pre-2007 Test data as candidate for deletion
Why: It's the most space-efficient cut that sacrifices the least valuable data —
modern fans care more about post-2007 Test cricket (post-20-20 era shift).
What was rejected: Dropping Ireland/Zimbabwe/Afghanistan entirely (they are full members)

**Decision:** Hemanth's meta-prompting approach
Why: Rather than asking AI to "write code for X", Hemanth writes structured prompts
that specify exact SQL patterns, exact file changes, exact verification commands,
exact expected outputs, and strict "stop here" instructions. This prevents the
model from making unrelated changes and reduces error loops significantly.
The COPILOT_CONTEXT.md file is fed at the start of every session as shared memory.
What was rejected: Conversational coding (led to too many unintended changes)

---

## 8. Problems Faced & How Solved

**Problem:** Git push rejected by GitHub secret scanner
Cause: web/.env.local and web/.next/ build cache were accidentally committed
Resolution: git rm --cached, added to .gitignore, amended commit

**Problem:** web/node_modules committed (100MB file exceeded GitHub limit)
Cause: node_modules not in .gitignore before first commit
Resolution: git rm -r --cached web/node_modules, added to .gitignore

**Problem:** git reset --hard HEAD~1 deleted all web source files
Cause: ChatGPT suggested this as a fix for push rejection — it rolled back local
working directory, deleting uncommitted files
Resolution: git reset --hard to the correct earlier commit hash restored files
Note: Files were never committed, so git history didn't have them. Recovered via
VS Code local history. Lesson: never use --hard without knowing exact target commit.

**Problem:** Bowling section in PlayerProfile not showing IPL tab
Cause: Bowling section used raw format tabs, didn't replicate batting section's
virtual-tab filtering pattern (IPL = T20 + competition_name = IPL)
Resolution: Rebuilt bowling section to mirror batting's tab logic exactly

**Problem:** Partnership totals were wrong (Kohli-Rohit showing 2,634 ODI runs not 5,570)
Cause 1: View only counted batter's runs (runs_batter) not combined partnership runs
Cause 2: DISTINCT ON was collapsing multiple innings into one row
Cause 3: c.name in GROUP BY was splitting one partnership across multiple rows
         (one per series/competition, e.g. Asia Cup, Champions Trophy separately)
Resolution: Rebuilt view to use runs_total, removed DISTINCT ON, removed c.name
from GROUP BY — fixed all three issues

**Problem:** IT20 "on fire" section always empty
Cause: ICC T20 World Cup and bilateral T20 tours are stored as format='T20' not IT20
Resolution: International filter now uses competition name ILIKE patterns instead
of format = 'IT20' alone

**Problem:** Female matches in database
Cause: Sync was using gender-neutral zip URL (recently_played_30_json.zip)
Resolution: Deleted 26 female matches via cascading DELETE, fixed sync URL to
recently_played_30_male_json.zip

**Problem:** decimal.Decimal type error in matchup API
Cause: PostgreSQL returns NUMERIC columns as Python decimal.Decimal, not float
Resolution: Added to_float() helper wrapping all numeric fields before return

**Problem:** Bowler name showing player_id in MatchupCard
Cause: useEffect that reads ?bowler= URL param searched by player_id hash but
the search endpoint uses ILIKE on names — hash never matched, fell back to ID
Resolution: Pass bowler name in URL as ?bowler_name=... alongside ?bowler=ID

**Problem:** mv_player_batting refresh takes 482 seconds
Cause: 9.7M row deliveries table, complex UNION ALL with window functions
Status: Unresolved — noted in POST_DEPLOYMENT_ROADMAP for post-deployment optimisation

**Problem:** RCB missing 2024/2025 matches in team head-to-head
Cause: Team name changed from 'Royal Challengers Bangalore' to 'Royal Challengers
Bengaluru' — treated as two different teams in GROUP BY
Resolution: Created normalise_team() PostgreSQL function, applied to all team views

---

## 9. Dead Ends — Do Not Revisit

**ESPN Cricinfo scraping** — explicitly prohibited in their ToS. Their HTML changes
frequently. Ruled out permanently. Cricsheet data is more granular anyway.

**Supabase migration (early attempt)** — abandoned because 1.48GB database exceeds
500MB free tier. Even Pro tier requires CC which Hemanth doesn't have.

**T20I as format value** — does not exist in Cricsheet data. Always IT20. Do not
suggest T20I in any query or filter.

**season column for year grouping** — old approach. Mixed formats ('2024' vs '2024/25')
made grouping unreliable. Replaced with EXTRACT(YEAR FROM date)::INTEGER. Use year column.

**Antigravity (Claude) for coding** — Hemanth switched to GitHub Copilot Pro in VS Code
after exhausting Antigravity credits. Claude (this conversation) is used for planning,
architecture, debugging strategy, and prompt generation. Copilot executes the code.

**OR logic for T20 colour coding** — replaced with AND logic. A batter with 50 runs
at SR 60 should not show green in T20. Both conditions must be met simultaneously.

**DISTINCT ON in partnerships view** — caused massive undercounting by keeping only one
delivery row per innings instead of summing the whole partnership. Do not reintroduce.

---

## 10. Post-Deployment Feature Backlog

### High priority (first post-deployment update):
- Full player name display (display_name column in players table — V Kohli → Virat Kohli)
- Top run scorers / wicket takers in team head-to-head matchups (new API endpoints)
- Phase specialist badge on player profile header
- Clickable form badges linking to team head-to-head page
- Optimise mv_player_batting refresh time (currently 482 seconds)

### Medium priority:
- "On this day in cricket" homepage card
- Format filter for form guide strip
- Search by team name from main search bar
- Career milestones timeline on player profile
- Player nationality / country flag display
- Wicket type breakdown in death overs for bowlers
- Animated count-up on homepage stat cards
- Venue breakdown for team head-to-head

### Low priority:
- Standalone matchup search page (/matchup route)
- Career overlap indicator on comparison page
- Quick stat summary cards on comparison page
- Multi-format side-by-side comparison
- Guess the stat mini-game
- Expand homepage stat cards to 6-8

### Explicitly out of scope (do not build):
- Live score integration (Cricsheet is not real-time)
- Fantasy cricket integration (different product entirely)
- Predictive analytics / "who will win"
- Player photos (licensing complications)
- Women's cricket data (intentionally men's only)

---

## 11. Environment & Setup

### Startup order:
```bash
# 1. Start API (from project root)
cd ~/cricket-stats
source .venv/bin/activate
python -m uvicorn api.main:app --reload --port 8000

# 2. Start frontend (separate terminal)
cd ~/cricket-stats/web
npm run dev

# 3. Open browser
http://localhost:3000
```

### Key environment files:
- `~/cricket-stats/.env` → `DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/cricketdb`
- `~/cricket-stats/web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8000`

### .gitignore must include:
```
.env
web/.env.local
web/.next/
web/node_modules/
data/
*.dump
ingestion/progress.log
ingestion/.last_sync
```

### Materialized view refresh:
Run after any data change. Takes ~10 minutes total:
```bash
export $(grep '^DATABASE_URL=' .env | xargs)
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_player_batting;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_player_bowling;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_batter_vs_bowler;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_partnerships;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_team_vs_team;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_team_vs_team_seasons;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_team_recent_matches;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_player_vs_team;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_venue_stats;"
```

### To force a full re-sync:
```bash
rm ingestion/.last_sync
python3 ingestion/sync.py
```

### Key player IDs for testing:
- V Kohli: `ba607b88`
- Arshdeep Singh: `244048f6`
- RG Sharma: `740742ef`

### Highlights cache:
The /api/v1/highlights endpoint caches for 24 hours in memory. To force refresh,
restart uvicorn: `lsof -ti tcp:8000 | xargs -r kill -9`

### Known setup gotchas:
- psycopg2 pip install: always use `--break-system-packages` flag on Mac
- psql heredoc approach can corrupt terminal — use `-f /tmp/file.sql` pattern instead
- After git operations, always verify web/app/, web/components/, web/lib/ are intact
- The /api/v1/ prefix is required on ALL frontend fetch calls — missing it causes 404

### Production URLs:
- Frontend: https://cricstatsapp.vercel.app
- API: https://cricket-stats-lqlt.onrender.com
- Database: Supabase (session pooler, ap-south-1)

### Key production environment variables:
Render (set in dashboard):
- DATABASE_URL: Supabase session pooler connection string
- CORS_ALLOWED_ORIGINS: https://cricstatsapp.vercel.app
- PYTHON_VERSION: 3.11.0

Vercel (set in dashboard):
- NEXT_PUBLIC_API_URL: https://cricket-stats-lqlt.onrender.com

GitHub Actions (set as repo secret):
- DATABASE_URL: Supabase session pooler connection string
  (not yet added — Step 9 of deployment sequence)

---

## 12. How to Resume in a New Chat

You are Claude. You are helping Hemanth Gowda J build CricStats, a full-stack
cricket analytics platform built on Cricsheet ball-by-ball data. All 8 planned
features (F1-F8) are complete. The project is now at Stage 7 — Deployment.

Hemanth uses a specific meta-prompting approach: he works with GitHub Copilot in
VS Code to execute code changes, while using Claude for planning, architecture
decisions, debugging strategy, and generating detailed Copilot prompts. His prompts
are highly structured — they specify exact SQL, exact file targets, exact verification
commands, and strict "stop here" instructions. This reduces error loops. When
generating prompts for Copilot, always follow this pattern: specify the model to
use (GPT-5.3 Codex for large multi-file changes, Claude Haiku 4.5 for SQL/small
fixes), include #file: references, use ━━━ section dividers, include a VERIFY step
with exact terminal commands, and end with a COPILOT_CONTEXT.md update instruction.

The immediate blocker is database hosting. The database needs to be trimmed to fit
in a free-tier cloud PostgreSQL host (target: ~475MB). The trim plan is agreed but
NOT yet executed. Start by running these two queries to measure the pre-2007 Test
and pre-2005 ODI delivery counts, then calculate whether the combined trim reaches
the 475MB target, then write the deletion script.

Key context:
- STATUS: FULLY DEPLOYED ✅
- Frontend: https://cricstatsapp.vercel.app
- API: https://cricket-stats-lqlt.onrender.com
- Database: Supabase, 457MB/500MB, 5164 matches
- Local DB: 463MB, same 5164 matches
- Sync: GitHub Actions every 6 hours → Supabase (active)
- Keepalive: GitHub Actions every 14 minutes (active)
- Filter: match_filter.py — IPL, SA20, Hundred, ILT20, MLC kept
- BBL dropped, Tests from 2011+, ODIs from 2007+
- All 9 materialized views live including mv_stat_cards
- Supabase connection: postgresql://postgres.kxbjhpvjdvjisryhwwnz:
  cricketstats2355@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
- Render API: https://cricket-stats-lqlt.onrender.com
- Vercel project name: cricstats (cricstatsapp.vercel.app)
- GitHub repo: iam-Hemanth/cricket-stats

"The project is fully deployed and live. All 8 features work on
production. Focus now shifts to post-deployment improvements from
the backlog in Section 10. First priority items: full player name
display, top run scorers in team head-to-head, phase specialist
badge. Monitor Supabase storage — currently 457MB of 500MB used."
