# Project Status Report: Cricket Statistics Platform (2026-04-01)

## 1. Current Feature Inventory
- **Health Monitoring:** `/api/v1/health` provides DB match count and last sync timestamp.
- **Homepage Highlights:** `/api/v1/highlights` returns "On Fire" players, rivalry of the day, and stat cards.
- **Search:** Player and team search endpoints with partial name matching.
- **Head-to-Head (H2H):**
    - Team vs Team (`/api/v1/teams/h2h`) including top performers and recent results.
    - Player vs Player (`/api/v1/matchup`) with ball-by-ball recent history and phase-wise splits.
- **Player Profiles:** Detailed batting/bowling stats, form guide (last 10 innings), partnership data, and phase specialization (powerplay/middle/death).
- **Venue Analytics:** `/api/v1/venues` provides ground-specific stats like chasing win % and average scores.
- **On This Day:** `/api/v1/on-this-day` fetches random historical matches from the current date.

**Incomplete/Broken:**
- **ODI/ODM Phase Stats:** `api/main.py` (Line 566) explicitly filters out non-powerplay phases for ODI/ODM but doesn't explain why middle/death are excluded for 50-over matches.
- **Matchup Data:** Returns 404 if no historical matchup exists (Line 646), instead of a graceful "No data" response.

## 2. Code Quality Issues
- **Duplicated Logic:** `_convert_decimal_values` (Line 142) and `_convert_decimals` (Line 544) in `api/main.py` perform nearly identical tasks.
- **Hardcoded Logic in API:** Phase detection logic (`_detect_batting_specialist`) is hardcoded in the API layer rather than the database or a service layer.
- **Inconsistent Format Bucketing:** Logic for mapping formats to buckets (e.g., `IPL`, `IT20`) is repeated across multiple SQL queries in `api/queries.py` and Python functions.
- **Dead Code/Redundancy:** `sync copy.yml` in `.github/workflows` appears to be a duplicate of `sync.yml`.

## 3. Performance Concerns
- **Sequential MV Refresh:** `ingestion/sync.py` refreshes 6 materialized views sequentially (Lines 185-205). This can take several minutes as the dataset grows.
- **Heavy Aggregation in Highlights:** The "On Fire" queries in `api/queries.py` (e.g., `GET_ON_FIRE_IPL_BATTING`) perform complex joins on `deliveries` and `matches` at runtime. These should be materialized.
- **Matchup Query:** `GET_MATCHUP_RECENT_DELIVERIES` (Line 115) scans the `deliveries` table for every request.

## 4. Security Concerns
- **CORS Configuration:** `api/main.py` (Line 60) has `http://localhost:3000` hardcoded in the allowed origins list for production.
- **Input Validation:** While search queries have length checks, many ID-based endpoints do not validate the format of `player_id` beyond it being a string.
- **Information Leakage:** `api/database.py` (Line 31) raises a `RuntimeError` if `DATABASE_URL` is missing, which is fine, but generic 500 errors in the API might leak DB connection issues if logging isn't carefully separated from response detail.

## 5. Deployment Readiness
- **Localhost URLs:** `api/main.py` contains local dev URLs in CORS settings.
- **Env Vars:** `DATABASE_URL` is required; `CORS_ALLOWED_ORIGINS` is optional but recommended.
- **Gitignore:** `web/.env.local` is present in the file list but should be verified as ignored (it is in `web/.gitignore`).
- **Procfile:** Present for Render/Heroku deployment, pointing to `uvicorn api.main:app`.

## 6. Database and Sync Health
- **Sync Logic Gap:** `ingestion/sync.py` relies on a local `.last_sync` file. In GitHub Actions, this is restored via cache, but if the cache expires, the script might default to a full 100MB+ download instead of the 30-day "recent" zip.
- **Normalization:** `db/materialized_views.sql` contains a `normalise_team` function (Line 427) but it only covers a few IPL teams. Historical names like "Delhi Daredevils" are mapped, but many others across international cricket are likely missing.

## 7. Frontend Consistency
- **Theming:** `web/components/ThemeToggle.tsx` and `web/app/globals.css` indicate dark mode support is implemented.
- **Hardcoded Colors:** `web/app/globals.css` uses CSS variables (e.g., `--background`), but individual components like `web/components/ui/Badge.tsx` should be checked for tailwind-style hardcoded hex codes.

## 8. Quick Wins
1. **api/main.py:** Merge `_convert_decimal_values` and `_convert_decimals`.
2. **api/main.py:** Move all CORS origins to the `.env` file.
3. **ingestion/sync.py:** Wrap MV refreshes in a `try/except` block that continues on failure for non-critical views.
4. **api/queries.py:** Add `LIMIT` to the rivalry queries to ensure they never return multiple rows.
5. **api/main.py:** Add a 1-hour cache header to venue responses as they rarely change.

## 9. Bigger Opportunities
1. **Materialize "On Fire" stats:** Create a `mv_on_fire_stats` to speed up homepage loads.
2. **Parallel Ingestion:** Use `multiprocessing` in `ingest_all.py` to process JSON files faster on multi-core systems.
3. **Automated Normalization:** Implement a fuzzy-matching system for team and player names to handle Cricsheet's data variations.

## 10. Push Readiness Verdict
**PUSH WITH CAUTION**
The project is functionally rich and the database schema is well-indexed. However, the hardcoded CORS origins and the sequential/fragile sync process in GitHub Actions pose minor risks for production stability. The duplication of utility functions in `api/main.py` suggests a need for a quick refactor before a major release.
