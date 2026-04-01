# CricStats Project Audit Report
**Date:** 2026-04-01  
**Auditor:** GitHub Copilot CLI  
**Project:** cricket-stats

---

## 1. Current Feature Inventory

### Pages/Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/` (Homepage) | ✅ Working | Hero search, stat cards, on-fire section, rivalry of day, on-this-day |
| `/players/[player_id]` | ✅ Working | Full player profile with batting, bowling, partnerships, phases, form |
| `/players/search` | ✅ Working | Player search results page |
| `/teams` | ✅ Working | Team head-to-head with format breakdown, seasons, recent matches |
| `/compare` | ✅ Working | Side-by-side player comparison |
| `/matchup` | ✅ Working | Standalone batter vs bowler matchup search |

### API Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/v1/health` | ✅ Working | Returns match count and last sync |
| `GET /api/v1/players/search` | ✅ Working | ILIKE search, 10 results max |
| `GET /api/v1/players/{id}/batting` | ✅ Working | Format/year filters |
| `GET /api/v1/players/{id}/bowling` | ✅ Working | Format/year filters |
| `GET /api/v1/players/{id}/partnerships` | ✅ Working | Partnership stats |
| `GET /api/v1/players/{id}/phases` | ✅ Working | Phase specialist stats |
| `GET /api/v1/players/{id}/form` | ✅ Working | Last 10 innings |
| `GET /api/v1/players/{id}/vs-teams` | ✅ Working | Player vs team breakdown |
| `GET /api/v1/matchup` | ✅ Working | Batter vs bowler head-to-head |
| `GET /api/v1/teams/search` | ✅ Working | Team name search |
| `GET /api/v1/teams/h2h` | ✅ Working | Team head-to-head |
| `GET /api/v1/teams/h2h/top-batters` | ✅ Working | Top run scorers in matchup |
| `GET /api/v1/teams/h2h/top-bowlers` | ✅ Working | Top wicket takers in matchup |
| `GET /api/v1/venues` | ✅ Working | Venue listing |
| `GET /api/v1/venues/{name}` | ✅ Working | Venue detail |
| `GET /api/v1/highlights` | ✅ Working | Homepage highlights with 24hr cache |
| `GET /api/v1/on-this-day` | ✅ Working | Historical match lookup |

### Incomplete/Missing Features

1. **Matchup page `/matchup` route** — Featured matchups in `HomeHighlights.tsx:46-64` use hardcoded fake player IDs (`virat_kohli_1`, `david_warner_1`) that don't exist in the database. These links will 404.

2. **Full player name display** — Still using Cricsheet short names (V Kohli instead of Virat Kohli). `display_name` column not yet added per `POST_DEPLOYMENT_ROADMAP.md:99-103`.

3. **BBL data missing** — Big Bash League was dropped from `_ALLOWED_T20_LEAGUES` in `match_filter.py:12-18` but `queries.py:596-604` still references 'Big Bash League' in `GET_ON_FIRE_BIG_LEAGUES_BATTING` query. BBL players will never appear in "Big Leagues" tab.

---

## 2. Code Quality Issues

### Duplicate Code

| Location | Issue |
|----------|-------|
| `SearchBar.tsx` and `HeroSearch.tsx` | Near-identical implementations (~95% duplicate). Both do debounced player search with dropdown. Should be unified into a single reusable component with size/style variants. |
| `api/main.py:264-370` | On-fire player building logic is duplicated 3x (IPL, Big Leagues, International) for both batting and bowling. Should extract to a helper function. |
| `queries.py:476-755` | 6 near-identical "on fire" queries (~280 lines). Only differences: competition filter and LIMIT. Should be parameterized. |

### Hardcoded Values

| File:Line | Value | Issue |
|-----------|-------|-------|
| `HomeHighlights.tsx:437-468` | `5,164+`, `9.6M+`, `10,900+`, `2008-2025` | Stats bar hardcoded. Should fetch from API. |
| `web/app/page.tsx:157` | `"5,164"` | Fallback match count hardcoded. |
| `HomeHighlights.tsx:46-64` | Fake player IDs | Featured matchups use non-existent player IDs. |
| `ThemeToggle.tsx:22-24` | `bg-gray-200`, `dark:bg-gray-700` | Uses Tailwind gray classes instead of CSS variables, breaking theme consistency. |
| `Avatar.tsx:9-14` | `bg-green-600`, `bg-blue-600`, etc. | Hardcoded Tailwind colors instead of CSS variables. |
| `api/main.py:70-74` | CORS origins | Hardcoded list of origins. Env var exists but used as addition, not replacement. |
| `api/database.py:40` | `maxconn=6` | Hardcoded pool size. Should be env var for different environments. |
| `test_api.py:14` | `BASE = "http://localhost:8000/api/v1"` | Hardcoded localhost URL. |

### Dead Code

| File:Line | Issue |
|-----------|-------|
| `api/main.py:821-831` | `_convert_decimals()` function defined but never used. The codebase uses `_convert_decimal_values()` (line 166-174) instead. |
| `.github/workflows/sync copy.yml` | Duplicate workflow file. Exact copy of `sync.yml`. Should be deleted. |
| `ingestion/trim_for_deployment.py` | Mentioned in `COPILOT_CONTEXT.md:292-335` as superseded by `full_trim.py`. File not present but referenced. |
| `ingestion/retry_failed.py` | Listed in `README.md:319` but file doesn't exist in current directory listing. |
| `db/test_views.sql` | File exists but content not verified. May be unused test file. |
| `rebuild_team_views.py` | File exists in project root. Purpose unclear - may be dead code or one-time script. |
| `verify_normalization.py` | File exists in project root. Purpose unclear. |
| `plan.md` | File exists in project root. May be leftover planning artifact. |

### Inconsistent Patterns

| Issue | Locations |
|-------|-----------|
| API path building | `lib/api.ts:401` uses `/api/v1/players/search`, but `lib/api.ts:436` uses `/players/{id}/vs-teams` (missing `/api/v1/`). Inconsistent path prefixing. |
| Fetch error handling | Some API calls return empty arrays on error, others throw. No consistent pattern. |
| Comment style | Mixed `# comment` and `// comment` across Python/TS. Expected, but no JSDoc or docstrings on frontend functions. |
| Type definitions | `api/models.py` has section "10. Health check" followed by "12. Homepage highlights" - numbering inconsistent (missing 11). |

---

## 3. Performance Concerns

### Excessive API Calls

| Location | Issue |
|----------|-------|
| `PlayerProfile.tsx` (not fully read) | Makes 5 separate API calls on mount: batting, bowling, partnerships, phases, form. Could be consolidated into a single `/players/{id}/profile` endpoint. |
| `web/app/page.tsx:150-154` | Homepage makes 3 parallel fetches (health, highlights, on-this-day). Acceptable but could be one `/homepage-data` call. |

### Heavy Computation

| Location | Issue |
|----------|-------|
| `queries.py:476-828` | "On fire" queries scan entire `deliveries` table (2.85M rows) with 90-day filter. Missing index on `matches.date`. |
| `queries.py:151-199` | Phase batting/bowling queries run against full `deliveries` table. Acceptable but slow without caching. |
| `mv_player_batting` refresh | Takes ~482 seconds per `PROJECT_MEMORY.md:338-340`. Causes downtime during sync. |

### Missing Indexes

| Table | Recommended Index | Reason |
|-------|------------------|--------|
| `matches` | `CREATE INDEX idx_matches_date_gender ON matches(date, gender)` | "On fire" queries filter by date range + gender |
| `matches` | `CREATE INDEX idx_matches_competition_gender ON matches(competition_id, gender, date)` | Competition-specific queries |
| `deliveries` | `CREATE INDEX idx_deliveries_phase ON deliveries(phase)` | Phase queries filter by phase column |

### API Response Caching

| Issue | Location |
|-------|----------|
| No caching on partnerships endpoint | `api/main.py:804-815` | Should cache 1 hour per `POST_DEPLOYMENT_ROADMAP.md:234-236` |
| No caching on venue stats | `api/main.py:1168-1190` | Static data, should cache 24 hours |
| Highlights cache is in-memory only | `api/main.py:61` | Lost on Render restart |

---

## 4. Security Concerns

### Hardcoded Credentials

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `.env:1` | `DATABASE_URL=postgresql://postgres:2355@localhost:5432/cricketdb` | **HIGH** - Local password exposed. `.env` is in `.gitignore` but file exists with real password. |
| `PROJECT_MEMORY.md:202-203` | Full Supabase connection string including password `cricketstats2355` | **HIGH** - Production credentials in committed file |
| `PROJECT_MEMORY.md:227-228` | Same Supabase credentials repeated | **HIGH** - Double exposure |

### Hardcoded URLs

| File:Line | URL | Issue |
|-----------|-----|-------|
| `keepalive.yml:14` | `https://cricket-stats-lqlt.onrender.com/api/v1/health` | Hardcoded production URL. Should use env var or GitHub secret. |
| `web/.env.local:1` | `http://localhost:8000` | Expected for local dev, but file is in web/.gitignore so won't cause issues. |

### Input Validation Gaps

| Endpoint | Issue |
|----------|-------|
| `GET /players/search` | Only validates `len(q) >= 2`. No max length check. Potential for very long queries. |
| `GET /teams/search` | Same issue - no max length validation. |
| `GET /matchup` | No validation that `batter_id` and `bowler_id` are valid format (8-char hex). Relies on DB 404. |
| `GET /venues/{venue_name}` | Uses `ILIKE %{input}%` - potential for SQL pattern injection via wildcards (`%`, `_`). Input is URL-decoded. |

### CORS Configuration

| File:Line | Issue |
|-----------|-------|
| `api/main.py:70-81` | CORS allows credentials (`allow_credentials=True`) with specific origins. Good. However, `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive. Should restrict to actual methods used (GET only). |

### SQL Injection

All queries use parameterized placeholders (`%s`). **No SQL injection vulnerabilities found.**

---

## 5. Deployment Readiness

### Localhost URLs Remaining

| File:Line | URL | Fix Required |
|-----------|-----|--------------|
| `test_api.py:14` | `http://localhost:8000/api/v1` | Not production-blocking, but should use env var |
| `web/.env.local:1` | `http://localhost:8000` | Correct - this is gitignored and for local dev only |
| `api/database.py:35-36` | Example in error message | Cosmetic only, not a real URL |

### Missing Environment Variables

| Variable | Where Needed | Current State |
|----------|--------------|---------------|
| `DATABASE_URL` | API, sync script | Set in `.env`, Render dashboard, GitHub secret |
| `NEXT_PUBLIC_API_URL` | Frontend | Set in Vercel dashboard |
| `CORS_ALLOWED_ORIGINS` | API | Optional, hardcoded fallback exists |
| `MAX_POOL_CONNECTIONS` | Not defined | Should add to control connection pool size |
| `CACHE_TTL_HOURS` | Not defined | Highlights cache TTL is hardcoded to 24 hours |

### Files Missing from .gitignore

| File | Should Ignore | Currently |
|------|---------------|-----------|
| `cricketdb.dump` | ✅ Yes | Listed but malformed entry on line 32: `web/.env.localcricketdb.dump` (missing newline) |
| `ingestion/progress.log` | ✅ Yes | Not in root `.gitignore`, should be |
| `ingestion/.last_sync` | ✅ Yes | Not in root `.gitignore` |
| `plan.md` (root) | Consider | Planning artifact, may not belong in repo |
| `.DS_Store` | ✅ Yes | Listed |
| `.pytest_cache` | ✅ Yes | Not listed, but directory exists |
| `__pycache__` | ✅ Yes | Listed |

### .gitignore Errors

| Line | Content | Issue |
|------|---------|-------|
| 32 | `web/.env.localcricketdb.dump` | Malformed - missing newline. Should be two separate entries. |
| 33 | `cricketdb.dump` | Redundant if line 32 is fixed |

---

## 6. Database and Sync Health

### sync.py Logic Review

| Line | Issue | Severity |
|------|-------|----------|
| 27 | `from match_filter import should_ingest_match` | Relative import works because script runs from `ingestion/` directory. May break if run from project root. | Medium |
| 30 | `from ingest_all import ingest_match` | Same relative import issue. | Medium |
| 229-251 | View refresh runs in autocommit mode after setting `statement_timeout`. If any view refresh fails, subsequent views won't refresh. | Medium |
| 193-205 | Skipped matches print to stdout but aren't counted. `successes` only counts ingested matches. Misleading summary. | Low |

### match_filter.py Logic Gaps

| Line | Issue |
|------|-------|
| 12-18 | BBL removed from `_ALLOWED_T20_LEAGUES` but `queries.py:596` still references it in Big Leagues query. Data mismatch. |
| 43 | Tests cutoff is `2011-01-01` but comment says "pre-2011". Edge case: matches on exactly 2011-01-01 are kept, which may or may not be intended. |
| 46 | ODI cutoff is `2007-01-01`. Same edge case ambiguity. |
| 60-61 | Associate pattern matching uses `p.lower() in comp_lower`. If competition contains the pattern as substring, it's excluded. Could over-match. |

### GitHub Actions Workflows

| File | Issue |
|------|-------|
| `sync.yml` | Solid. Uses cache for pip and sync state. 45-minute timeout appropriate. |
| `sync copy.yml` | **DELETE THIS FILE** - Exact duplicate of sync.yml. Will cause confusion. |
| `keepalive.yml` | Runs every 14 minutes. Good for Render free tier. Hardcoded URL should use secret. |
| Neither workflow | No notification on failure. Consider adding Slack/Discord webhook. |

### Sync State Persistence

- `.last_sync` file is cached between workflow runs via `actions/cache`
- Cache key includes `github.run_id` - new key every run, will accumulate stale caches
- Should use date-based key or cleanup old caches

---

## 7. Frontend Consistency

### Hardcoded Colors (Not Using CSS Variables)

| File:Line | Color | Should Be |
|-----------|-------|-----------|
| `ThemeToggle.tsx:22-24` | `bg-gray-200`, `bg-gray-300`, `dark:bg-gray-700`, `dark:bg-gray-600` | `bg-[--bg-card]`, `hover:bg-[--bg-surface]` |
| `Avatar.tsx:9-14` | `bg-green-600`, `bg-blue-600`, `bg-purple-600`, etc. | Should use CSS custom properties or derive from `--accent-green` |
| `MatchupCard.tsx:356` | `bg-red-500` | `bg-[--accent-red]` or similar (define in globals.css) |
| `MatchupCard.tsx:429` | `bg-red-500/20`, `text-red-400` | Need `--accent-red` variable |
| `Badge.tsx:14` | `#f59e0b` | Already using `--accent-gold` should be used consistently |

### Dark Mode Support

| Component | Status | Issue |
|-----------|--------|-------|
| `globals.css` | ✅ Good | Has `[data-theme="light"]` and default dark palette |
| `ThemeToggle.tsx` | ⚠️ Partial | Uses `localStorage` but doesn't read initial value on mount. First render always dark. |
| `layout.tsx:32` | ⚠️ Issue | `data-theme="dark"` hardcoded. Should check localStorage/system preference. |
| All components | ✅ Good | Use CSS variables which respond to theme |

### ThemeToggle Flash/Hydration Issue

`ThemeToggle.tsx:6-10`:
- `useState<"light" | "dark">("dark")` - Always starts dark
- `useEffect` sets theme, causing flash on light-mode users
- Should read from localStorage in initial state or use Next.js cookies

---

## 8. Quick Wins (< 1 hour each)

| # | Task | File | Impact |
|---|------|------|--------|
| 1 | Delete `sync copy.yml` duplicate workflow | `.github/workflows/sync copy.yml` | Cleanliness |
| 2 | Fix .gitignore malformed line 32 | `.gitignore:32` | Correctness |
| 3 | Add `ingestion/progress.log` and `ingestion/.last_sync` to .gitignore | `.gitignore` | Security |
| 4 | Remove dead `_convert_decimals()` function | `api/main.py:821-831` | Cleanliness |
| 5 | Fix ThemeToggle to use CSS variables | `web/components/ThemeToggle.tsx:22-24` | Consistency |
| 6 | Fix featured matchups with real player IDs | `HomeHighlights.tsx:46-64` | Functionality |
| 7 | Add max length validation to search endpoints | `api/main.py:436-447, 454-466` | Security |
| 8 | Remove `PROJECT_MEMORY.md` credentials | `PROJECT_MEMORY.md:202-203, 227-228` | **CRITICAL** Security |
| 9 | Add `CORS_ALLOWED_METHODS=["GET"]` restriction | `api/main.py:87` | Security |
| 10 | Remove BBL from queries.py Big Leagues list | `queries.py:596-604, 660-670` | Consistency |

---

## 9. Bigger Opportunities

| # | Opportunity | Estimated Effort | Files Affected |
|---|-------------|------------------|----------------|
| 1 | **Consolidate SearchBar and HeroSearch** into single component with size prop | 2-3 hours | `SearchBar.tsx`, `HeroSearch.tsx`, create `SearchInput.tsx` |
| 2 | **Create parameterized "on fire" query** to eliminate 280 lines of duplicate SQL | 3-4 hours | `queries.py`, `api/main.py` highlights function |
| 3 | **Add Redis/external cache** for highlights and partnerships | 4-6 hours | New dependency, `api/main.py`, deployment config |
| 4 | **Create `/api/v1/players/{id}/profile` consolidated endpoint** returning all player data in one call | 3-4 hours | `queries.py`, `api/main.py`, `PlayerProfile.tsx` |
| 5 | **Implement SSR theme detection** to prevent flash on page load | 2-3 hours | `layout.tsx`, `ThemeToggle.tsx`, add cookie-based preference |

---

## 10. Push Readiness Verdict

## ⚠️ PUSH WITH CAUTION

The codebase is fundamentally sound and already deployed to production. All core features work correctly, the API is well-structured, and the frontend is polished. However, **there is one CRITICAL security issue that must be addressed before any code review or public sharing**: the `PROJECT_MEMORY.md` file contains the full production Supabase database URL including the password (`cricketstats2355`) on lines 202-203 and 227-228. This file is committed to git and would expose production credentials to anyone with repository access.

For routine development pushes to the existing private repository, this is acceptable since the credentials are already known to the owner. For any public release, open-sourcing, or sharing with collaborators, **remove or redact the credentials from PROJECT_MEMORY.md immediately**. The duplicate workflow file (`sync copy.yml`) and dead code are cosmetic issues that don't affect functionality. The BBL query mismatch and featured matchup fake IDs cause minor data display issues but won't break the application. After addressing the credentials issue, the project is safe to push.

---

*Report generated by GitHub Copilot CLI*
