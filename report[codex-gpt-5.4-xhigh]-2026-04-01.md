# CricStats Audit Report — 2026-04-01

Audit scope: I read the entire workspace under the repo root byte-for-byte (40,840 files, about 3.77 GB, including tracked data, docs, vendor/build artifacts, binaries, and `.git`). Findings below focus on first-party code, configs, workflows, and tracked data because that is where push risk actually lives.

## 1. Current Feature Inventory

- Frontend page `/` exists at `web/app/page.tsx:149-235`; it includes hero search, record board/highlights, and an "On This Day" card via `web/app/page.tsx:84-147` plus `web/components/HeroSearch.tsx:10-185` and `web/components/HomeHighlights.tsx:66-517`. Broken/incomplete: featured matchup cards use fake player IDs at `web/components/HomeHighlights.tsx:45-63` and link to `/players/...` at `web/components/HomeHighlights.tsx:504-506`, so those links are not trustworthy.
- Frontend page `/players/search` exists at `web/app/players/search/page.tsx:14-86`; it does server-side player search and renders results. It works in principle, but it bypasses the shared API client and hardcodes the base URL at `web/app/players/search/page.tsx:6-7`.
- Frontend page `/players/[player_id]` exists at `web/app/players/[player_id]/page.tsx:5-12`; `web/components/PlayerProfile.tsx:996-1327` provides batting, bowling, form, phases, partnerships, and matchup search. Incomplete: initial load fans out into five fetches at `web/components/PlayerProfile.tsx:1041-1046`, then refetches form again at `web/components/PlayerProfile.tsx:1077-1091`. The displayed bowler name can also come straight from the query string at `web/components/PlayerProfile.tsx:1017-1035`.
- Frontend page `/compare` exists at `web/app/compare/page.tsx:684-1011`; it provides side-by-side player comparison. Incomplete: it initially treats query-param IDs as display names at `web/app/compare/page.tsx:705-715` and then tries to resolve those names by calling the name-search endpoint with an ID at `web/app/compare/page.tsx:721-739`.
- Frontend page `/teams` exists at `web/app/teams/page.tsx:148-533`; it provides team search, head-to-head summary, recent matches, and top batters/bowlers. Broken/incomplete: the bundled top-performer data inside `/api/v1/teams/h2h` is logically wrong at `api/main.py:500-511` because it uses the single-opposition queries at `api/queries.py:312-333`; the frontend works around that by calling the newer dedicated endpoints separately at `web/app/teams/page.tsx:196-202`.
- Frontend page `/matchup` exists at `web/app/matchup/page.tsx:8-135`; it provides standalone batter-vs-bowler search. Incomplete: displayed batter/bowler names can be injected via `batter_name` and `bowler_name` query parameters at `web/app/matchup/page.tsx:14-29`.
- API endpoint `GET /api/v1/health` exists at `api/main.py:181-197`.
- API endpoint `GET /api/v1/highlights` exists at `api/main.py:200-424`; it is the homepage data backend and includes a 24-hour in-memory cache.
- API endpoint `GET /api/v1/players/search` exists at `api/main.py:435-452`.
- API endpoint `GET /api/v1/teams/search` exists at `api/main.py:454-471`.
- API endpoint `GET /api/v1/teams/h2h` exists at `api/main.py:473-629`; status: response shape is live, but the embedded top-performer fields are wrong as noted above.
- API endpoint `GET /api/v1/teams/h2h/top-batters` exists at `api/main.py:632-674`; unlike the bundled `teams/h2h` fields, this one actually filters on both teams using `api/queries.py:879-911`.
- API endpoint `GET /api/v1/teams/h2h/top-bowlers` exists at `api/main.py:676-716`; this one also filters on both teams using `api/queries.py:913-960`.
- API endpoint `GET /api/v1/players/{player_id}/batting` exists at `api/main.py:723-746`.
- API endpoint `GET /api/v1/players/{player_id}/bowling` exists at `api/main.py:749-772`.
- API endpoint `GET /api/v1/players/{player_id}/vs-teams` exists at `api/main.py:775-801`.
- API endpoint `GET /api/v1/players/{player_id}/partnerships` exists at `api/main.py:804-830`.
- API endpoint `GET /api/v1/players/{player_id}/phases` exists at `api/main.py:833-923`.
- API endpoint `GET /api/v1/matchup` exists at `api/main.py:930-1165`; test coverage is stale because `api/test_api.py:109-112` still expects a `matchup` object, while the model is `overall` at `api/models.py:127-134`.
- API endpoint `GET /api/v1/venues` exists at `api/main.py:1168-1194`.
- API endpoint `GET /api/v1/players/{player_id}/form` exists at `api/main.py:1197-1277`.
- API endpoint `GET /api/v1/venues/{venue_name}` exists at `api/main.py:1280-1297`.
- API endpoint `GET /api/v1/on-this-day` exists at `api/main.py:1300-1338`.
- Operational scripts exist for DB setup and sync: `db/setup_db.py:32-108`, `db/create_views.py:184-279`, `ingestion/sync.py:112-292`, `ingestion/sync_status.py:1-105`, `ingestion/ingest_all.py:1-379`, `ingestion/full_trim.py:1-520`, `ingestion/trim_for_deployment.py:1-696`. These are not push-ready as a coherent operational surface; several of them disagree with each other.
- Test surface exists, but it is not actually healthy: `api/test_api.py:17` is collected as a pytest test function because it is named `test`, so `pytest -q` currently fails before useful assertions run.

## 2. Code Quality Issues

- Player search is duplicated in four separate implementations: `web/components/SearchBar.tsx:1-140`, `web/components/HeroSearch.tsx:1-140`, `web/components/SearchBarWithCallback.tsx:1-140`, and `web/components/PlayerProfile.tsx:621-713`. This is maintenance debt, not a style nit.
- API base URL handling is duplicated across the frontend even though a shared client exists in `web/lib/api.ts:8-15,397-551`. Hardcoded fallbacks still appear at `web/app/page.tsx:8-9`, `web/app/players/search/page.tsx:6-7`, `web/components/HeroSearch.tsx:7-8`, `web/components/SearchBar.tsx:7-8`, `web/components/SearchBarWithCallback.tsx:6-7`, `web/components/MatchupCard.tsx:7-8`, and `web/components/PlayerProfile.tsx:19-20`.
- `web/lib/api.ts` is internally inconsistent about path conventions. Some methods pass `/api/v1/...` directly at `web/lib/api.ts:400-413,447,482-495,543-551`; others rely on `buildApiUrl()` to prepend `/api/v1` from bare paths at `web/lib/api.ts:435-466,505-519,536`. It works, but it is sloppy and easy to misuse.
- `web/app/page.tsx:3` imports `Link` and never uses it. `web/app/page.tsx:12-28` defines `FEATURED_MATCHUPS` and never uses it. `npm run lint` already reports both warnings.
- The homepage now contains two conflicting featured-matchup sources: the unused, realistic IDs in `web/app/page.tsx:12-28` and the fake IDs actually rendered in `web/components/HomeHighlights.tsx:45-63`.
- `api/main.py` has two separate decimal-conversion helpers: `_convert_decimal_values()` at `api/main.py:166-174` and `_convert_decimals()` at `api/main.py:822-830`. `_convert_decimals()` is dead code and also logically wrong: `isinstance(value, type(row_dict.get(key)))` is meaningless because it always compares a value to its own type.
- `db/create_views.py:33-106` rewrites the checked-in SQL text at runtime with regex/string patches. That is an admission that the source SQL is not trustworthy.
- `ingestion/full_trim.py:1-31` claims to replace `ingestion/trim_for_deployment.py:1-35`, but both files remain in the repo with overlapping responsibilities and diverging rule sets.
- Documentation is inconsistent enough to be a code-quality issue. `COPILOT_CONTEXT.md:197-198` says all frontend fetches are centralized in `web/lib/api.ts`, which is false. `README.md:74-76` says there are eight materialized views, `README.md:98-111` lists ten, and `README.md:236` says sync refreshes all eight even though `ingestion/sync.py:229-236` refreshes only six.
- `web/next-env.d.ts:3` imports generated `.next` route types, while `web/.gitignore:40-41` ignores `next-env.d.ts`. That is generated-file drift in source control.

## 3. Performance Concerns

- `/api/v1/highlights` runs a pile of sequential database work in one request. `api/main.py:223-249` executes eight separate queries one after another before building the payload.
- The highlight queries themselves are heavy. `api/queries.py:595-675` scans raw `deliveries`, `innings`, `matches`, and `competitions` over a 90-day window across multiple competition names for both batting and bowling leaderboards.
- `api/queries.py:965-979` uses `ORDER BY RANDOM()` for `/api/v1/on-this-day`. That does not scale. It also wraps `date` in `EXTRACT(MONTH ...)` and `EXTRACT(DAY ...)`, which prevents simple use of `idx_matches_date` from `db/schema.sql:94`.
- `api/queries.py:363-372` determines batting dismissals with an `EXISTS` over a nested subquery on deliveries per innings. That is expensive compared with a pre-aggregated or better-indexed approach.
- The `/teams` page currently makes three API calls every time two teams are selected: one `getTeamH2H()` plus `getTeamH2HTopBatters()` and `getTeamH2HTopBowlers()` at `web/app/teams/page.tsx:188-202`. Worse, the summary endpoint already spends time running four extra top-performer queries at `api/main.py:500-511` that the frontend does not use.
- Player profile initial load makes five parallel API calls at `web/components/PlayerProfile.tsx:1041-1046`, then immediately makes a sixth form call at `web/components/PlayerProfile.tsx:1077-1091`. That duplicate initial form request is self-inflicted.
- Compare page name resolution is inefficient and semantically wrong: `web/app/compare/page.tsx:721-739` calls the player-name search endpoint using a player ID, then filters the results client-side.
- `ingestion/sync.py:227-251` refreshes materialized views serially and without `CONCURRENTLY`, even though `db/materialized_views.sql:5-9,478-482` is clearly written with concurrent refresh in mind.
- `db/schema.sql:91-102` shows the actual index set, and several obvious composite indexes are missing for current query patterns: there is no `matches(team1, team2, format)`, no `deliveries(innings_id, bowler_id)`, and no `innings(match_id, innings_number)`.

## 4. Security Concerns

- The worst issue in the repo is tracked plaintext production credentials in `PROJECT_MEMORY.md:202-203,227-228,533-534`. This is not a theoretical risk. Those lines contain a live-looking full connection string.
- Local credentials are also hardcoded in utility scripts: `.env:1`, `verify_normalization.py:6`, and `rebuild_team_views.py:7`.
- `db/setup_db.py:40-43` prints the full current `DATABASE_URL` on connection failure. That will leak secrets into logs, CI output, and screenshots.
- Tracked docs also hardcode live deployment URLs at `PROJECT_MEMORY.md:206,209,481-492,535-536`. `keepalive.yml:14-15` hardcodes the production API URL directly into the workflow.
- CORS review: `api/main.py:70-89` is not wide open, which is good, but it is still brittle. It hardcodes `localhost:3000` and two Vercel domains, then appends env values, while also enabling `allow_credentials=True`. That should be environment-driven, not source-driven. `render.yaml:7-10` does not define `CORS_ALLOWED_ORIGINS`, so the current deployment depends on those hardcoded defaults.
- Input validation is mixed. SQL injection risk is low because the query layer is parameterized. The bigger issue is trusting display-oriented query params on the frontend, especially `web/app/matchup/page.tsx:14-29`, where names can be spoofed independently of IDs.

## 5. Deployment Readiness

- `.gitignore:32` is malformed: `web/.env.localcricketdb.dump` is a broken ignore rule. This is repo hygiene debt, not harmless formatting.
- `ingestion/sync.py:36,62-69,254` writes `ingestion/.last_sync`, but the root `.gitignore` does not ignore that generated file. First successful sync will dirty the worktree.
- `ingestion/progress.log` is a committed operational state file with 5,164 lines. That file does not belong in a clean application source tree.
- `render.yaml:7-10` declares only `DATABASE_URL` and `PYTHON_VERSION`. It does not model `CORS_ALLOWED_ORIGINS`, and there is no corresponding deploy-as-code setup for the frontend `NEXT_PUBLIC_API_URL`.
- `requirements.txt:1-7` is entirely unpinned. Python deployments are not reproducible from this file.
- `web/README.md:1-36` is untouched `create-next-app` boilerplate, so frontend deployment documentation is effectively missing.
- `web/next-env.d.ts:3` depends on generated `.next` route types. That is fragile in clean builds and fresh clones.
- Localhost defaults remain in ship-facing code paths at `web/lib/api.ts:8`, `web/app/page.tsx:8-9`, `web/app/players/search/page.tsx:6-7`, `web/components/HeroSearch.tsx:7-8`, `web/components/SearchBar.tsx:7-8`, `web/components/SearchBarWithCallback.tsx:6-7`, `web/components/MatchupCard.tsx:7-8`, `web/components/PlayerProfile.tsx:19-20`, and `api/main.py:71`.
- The repo is operationally heavy because `data/all_male_json/*` is committed as about 17.2k tracked files. Pushes and clones are bigger and noisier than they need to be.

## 6. Database and Sync Health

- `ingestion/match_filter.py:12-18` and `ingestion/trim_for_deployment.py:67-74` do not agree on allowed T20 leagues. `trim_for_deployment.py` still includes `Big Bash League`; `match_filter.py` does not.
- The highlight logic still assumes a wider big-league universe than the ingest filter keeps. See `api/queries.py:595-605,660-670` for BBL/PSL/CPL/LPL/BPL references. If ingest/trim excludes those, highlight sections will be sparse or misleading.
- `ingestion/sync.py:27-30` uses bare imports (`from match_filter import ...`, `from ingest_all import ...`). That is brittle outside the exact script execution context.
- `ingestion/sync.py:124-134` uses the remote `Last-Modified` header as the main skip signal. That can miss corrected data if upstream republishes without a useful header change.
- `ingestion/sync.py:227-236` refreshes only six views. It omits `mv_partnerships`, `mv_team_vs_team`, `mv_team_vs_team_seasons`, and `mv_team_recent_matches`.
- `db/create_views.py:23-30` only tracks six views in `VIEW_NAMES`; `db/create_views.py:202-205` only drops those six before rebuild; `db/create_views.py:247-260` only reports those six afterward. That means re-running view creation is incomplete even before you look at SQL quality.
- The checked-in SQL for `mv_team_recent_matches` is wrong. `db/materialized_views.sql:767-768` selects raw `i1.batting_team` and `i1.bowling_team`, but `db/materialized_views.sql:779-783` does not group by those columns. `db/create_views.py:91-104` patches that at runtime instead of fixing the source file.
- `db/materialized_views.sql:202-205` and `db/materialized_views.sql:481-482` create the same unique index name twice. Direct execution of the SQL file is not idempotent.
- `db/test_views.sql:101-113` still queries `season` from `mv_player_bowling`, but the current view shape is `year`. `db/test_views.sql:124-130` also ignores team views and `mv_partnerships`.
- Workflow review: `.github/workflows/sync.yml:1-64` and `.github/workflows/sync copy.yml:1-64` are exact duplicates. If both are enabled, scheduled sync will run twice every cycle; the shared concurrency group only serializes the waste.
- `README.md:236` says sync refreshes all eight materialized views. The code does not. Current DB/sync documentation cannot be treated as authoritative.

## 7. Frontend Consistency

- `web/app/globals.css:8-30` defines the main theme tokens, but it does not define `--bg-hover` or `--accent-green-hover`. Those missing tokens are still used at `web/components/PlayerProfile.tsx:796,808`, `web/components/HomeHighlights.tsx:415`, and `web/app/teams/page.tsx:437,464`.
- `web/app/layout.tsx:32` hardcodes `data-theme="dark"`. `web/components/ThemeToggle.tsx:6-11` also always starts from `"dark"` and never reads a saved theme on mount. Theme persistence is therefore incomplete.
- `web/components/ThemeToggle.tsx:23` uses hardcoded Tailwind gray classes and `dark:` variants instead of the repo’s CSS variable system. That is a consistency failure.
- Hardcoded color usage is still common in shared components: `web/components/ui/Avatar.tsx:8-15`, `web/components/ui/Badge.tsx:12-14`, `web/components/MatchupCard.tsx:353,427`, `web/components/PlayerProfile.tsx:439-444,757-785,842`, and `web/app/teams/page.tsx:329`.
- Dark mode support is not entirely missing, but it is incomplete. The theme toggle exists, yet multiple components are still coupled to hardcoded palettes rather than theme tokens, so the light/dark system is only partial.

## 8. Quick Wins

- Delete the duplicate workflow file `.github/workflows/sync copy.yml:1-64` and keep a single scheduler in `.github/workflows/sync.yml:1-64`.
- Fix the malformed ignore rule at `.gitignore:32-33` and add `ingestion/.last_sync` because `ingestion/sync.py:36,62-69,254` generates it.
- Rename the helper `test()` in `api/test_api.py:17` so pytest stops collecting it as a test, and update the stale matchup assertion at `api/test_api.py:109-112` to match `api/models.py:127-134`.
- Replace or remove the fake featured-matchup cards in `web/components/HomeHighlights.tsx:45-63,504-506`.
- Remove the unused `Link` import and dead `FEATURED_MATCHUPS` block in `web/app/page.tsx:3,12-28`.
- Define `--bg-hover` and `--accent-green-hover` in `web/app/globals.css:8-30`, or stop referencing them in `web/components/PlayerProfile.tsx:796,808`, `web/components/HomeHighlights.tsx:415`, and `web/app/teams/page.tsx:437,464`.
- Initialize theme from saved preference or system preference in `web/components/ThemeToggle.tsx:6-18` and stop hardcoding dark mode in `web/app/layout.tsx:32`.
- Stop printing full `DATABASE_URL` on errors in `db/setup_db.py:40-43`.
- Delete the dead `_convert_decimals()` helper in `api/main.py:822-830` and keep one serializer path (`api/main.py:166-174`).
- Update `db/test_views.sql:101-113,124-130` to use `year` instead of `season` and include the views that actually matter now.

## 9. Bigger Opportunities

- Secrets and config hardening plan: purge secrets from tracked docs/scripts (`PROJECT_MEMORY.md:202-203,227-228,533-534`, `verify_normalization.py:6`, `rebuild_team_views.py:7`), and move deploy-critical config into deploy config files instead of tribal memory.
- Rebuild database/view management around one authoritative SQL source plus real migrations/tests. Right now the truth is split across `db/materialized_views.sql`, `db/create_views.py`, and `db/test_views.sql`, and they disagree.
- Consolidate ingest/trim/sync rules into one canonical filtering module. `ingestion/match_filter.py`, `ingestion/trim_for_deployment.py`, `ingestion/full_trim.py`, and `api/queries.py` currently encode different ideas of what the dataset should contain.
- Reduce repo weight by moving raw Cricsheet JSON and operational artifacts out of the main source repo. `data/all_male_json/*` and `ingestion/progress.log` are making the repo act like both app source and data lake.
- Build an actual quality gate: a pytest-compatible API suite, DB smoke checks, and CI verification. Right now `api/test_api.py` and `db/test_views.sql` do not provide trustworthy release protection.

## 10. Push Readiness Verdict

**DO NOT PUSH**

This repo is not push-safe in its current state. The main blocker is security: tracked plaintext production credentials live in `PROJECT_MEMORY.md:202-203,227-228,533-534`, and local credentials are hardcoded in utility scripts at `verify_normalization.py:6` and `rebuild_team_views.py:7`. On top of that, correctness checks are weak or broken: `pytest -q` currently fails because `api/test_api.py:17` is not pytest-safe, homepage featured matchup links are wired to fake IDs at `web/components/HomeHighlights.tsx:45-63,504-506`, and the database/view layer is internally inconsistent across `db/materialized_views.sql:779-783`, `db/create_views.py:91-104`, and `db/test_views.sql:101-113`. `npm run build` does succeed and `npm run lint` only reports two warnings, but that is not enough to outweigh the secret exposure, broken/stale tests, duplicate sync workflow, and SQL drift.
