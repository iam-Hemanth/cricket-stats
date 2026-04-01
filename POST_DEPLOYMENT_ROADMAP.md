# CricStats — Post-Deployment Feature Roadmap

This file tracks all planned features to add after the initial
deployment. Features are grouped by area and ordered by priority.

Last updated: during F7 development

---

## F7 additions (team head-to-head extensions)

These extend the team head-to-head page built in F7.

Priority: High — add in first post-deployment update.

1. **Top run scorers in a specific matchup**
   e.g. "Most runs in India vs Australia matches"
   - New API endpoint: GET /api/v1/teams/head-to-head/top-batters
     ?team1=India&team2=Australia&format=Test
   - Query deliveries joined to matches filtered by both teams
   - Show top 10 batters by runs, with matches played and avg
   - Add as a collapsible section below the main h2h table

2. **Top wicket takers in a specific matchup**
   Same concept for bowlers.
   - New API endpoint: GET /api/v1/teams/head-to-head/top-bowlers
   - Show top 10 bowlers by wickets in matches between these teams
   - Add alongside top batters section

3. **Venue breakdown for a matchup**
   How do these teams perform at specific grounds?
   - Which venue has hosted them most
   - Win % at each venue for each team
   - Average first innings score at each venue in this matchup

---

## F3 extensions (phase specialist stats)

These extend the phase breakdown tab on player profiles.

Priority: Medium — add in second post-deployment update.

1. **Phase specialist badge**
   Add a badge to player profile header showing their best
   phase speciality e.g. "Death overs specialist" if their
   SR in death phases is 20+ higher than powerplay.
   Calculated from phase data already available.

2. **Phase stats vs specific opposition**
   How does a bowler's death over economy change vs
   left-handed vs right-handed batters?
   Requires adding batting_hand column to players table
   (not in Cricsheet — needs manual/external data source)

3. **Phase stats at specific venues**
   How does a batter's powerplay SR change at Wankhede
   vs Chepauk? Filter phase stats by venue.

4. **Wicket type breakdown in death overs**
   For bowlers: add breakdown of how death wickets
   were earned (caught, bowled, LBW, etc.).
   Shows in phase stats: "4W (2 caught, 1 bowled, 1 LBW)"
   Requires joining wickets table by kind during
   phase aggregation.

---

## F4 extensions (form guide)

Priority: Medium

1. **Clickable form badges linking to team h2h**
   Form badges currently show just the match stats.
   Make each badge clickable to jump to the team head-to-head
   page between the batting team and the opposition.
   Example: Click on "45 vs India" badge → jump to
   /teams/h2h?team1=England&team2=India&format=ODI

2. **Format filter for form guide**
   Currently shows all formats mixed together.
   Add ability to filter form guide to specific format
   e.g. "last 10 IPL innings only" or "last 10 Test innings"
   UI: add format pills above the form strip (IPL, ODI, T20, Test, etc)

3. **Show more toggle for form guide**
   Currently shows last 10 innings in both batting and bowling.
   Add a "Show all" or "Show more" button to expand to last 25/50 innings.
   Requires a new API endpoint parameter: ?limit=50

---

## Player profile extensions

Priority: High — these have high user impact.

1. **Full name display**
   Currently shows Cricsheet short names (V Kohli, JJ Bumrah).
   Plan: Add display_name column to players table.
   Populate for top 100 players manually post-launch.
   SQL: ALTER TABLE players ADD COLUMN display_name VARCHAR(100);
   Then: UPDATE players SET display_name = 'Virat Kohli'
         WHERE player_id = 'ba607b88';

2. **Career milestones timeline**
   Horizontal timeline on player profile showing:
   - First international appearance
   - First century / five-wicket haul
   - Peak season (highest runs/wickets in a single year)
   - Most recent appearance
   Pure frontend using existing data.

3. **Player nationality / country flag**
   Add country field display on player profile header.
   players table already has nationality column —
   just needs frontend display.

---

## Homepage extensions (F8 additions)

Priority: Medium

1. **"On this day in cricket" card**
   Show a notable match or performance from the same
   calendar date in previous years.
   Query: SELECT from matches WHERE 
   EXTRACT(MONTH FROM date) = current_month
   AND EXTRACT(DAY FROM date) = current_day
   ORDER BY RANDOM() LIMIT 1

2. **Most recent matches feed**
   Show last 5 matches added to the database with
   date, teams, result, and link to team head-to-head.
   Updates automatically after each sync.

3. **Guess the stat mini-game**
   Show one mystery player stat and let users guess the player.
   Reveal answer with link to profile and related matchup cards.

4. **Format filter on homepage stat cards**
   Add chips for All/T20/ODI/Test and reload stat cards by filter.
   Requires highlights endpoint format query param support.

5. **Animated count-up on page load**
   Animate stat values from 0 to final number when cards appear.
   Keep animation subtle and skip for reduced motion users.

6. **Expand homepage cards to 6–8 cards**
   Increase card set beyond the current 4 cards and rotate in sets.
   Add pagination dots on mobile for better discoverability.

---

## Search improvements

Priority: Medium — improves discoverability significantly.

1. **Search by team name**
   Current search only finds players.
   Add team search that navigates to team head-to-head
   page with that team pre-selected.

2. **Search by competition**
   Search for "IPL 2024" and get a competition summary
   page showing top scorers, top wicket takers, results.
   Requires new competition summary API endpoint and page.

3. **Global search results page**
   Show players AND teams in search results together
   with clear visual separation between them.

---

## F6 extensions (player comparison)

Priority: Low — add after core comparison works.

1. **Career overlap indicator**
   Add a compact overlap signal to compare page that shows
   whether the two players had overlapping active years in
   each format and the shared window (e.g. 2013-2024 in ODI).

2. **Quick stat summary cards**
   Add small top-level cards above the detailed tables for
   at-a-glance comparison (runs, avg, wickets, economy, etc).

3. **Standalone matchup search page (/matchup route)**
   Currently matchups are only accessible via a player
   profile. Add /matchup page where you can search
   for any batter + any bowler directly.
   URL: /matchup?batter=ba607b88&bowler=244048f6

4. **Multi-format comparison**
   Currently compares career totals.
   Add format-specific comparison:
   "Compare Kohli vs Babar in Test cricket only"

---

## Technical / infrastructure

Priority: High for deployment.

1. **Cloud database migration**
   Current: Local PostgreSQL (1.48GB)
   Target: Cloud host with 2-3GB storage
   Options to evaluate at deployment:
   - Render PostgreSQL ($7/month, 1GB free)
   - Aiven free tier (limited but worth checking)
   - DigitalOcean managed PostgreSQL ($15/month, 10GB)
   - Supabase Pro with GitHub Student credits ($25/month, 8GB)
   Recommended: Supabase Pro with Student Pack $300 credits
   = 12 months free, 8GB storage

2. **GitHub Actions sync activation**
   sync.yml is now present in .github/workflows.
   Ensure DATABASE_URL is set in GitHub Actions secrets and
   verify one successful scheduled or manual sync run.

3. **REFRESH MATERIALIZED VIEW CONCURRENTLY**
   Current views use regular REFRESH which locks reads.
   After deployment add UNIQUE indexes to all views
   and switch to CONCURRENTLY for zero-downtime refreshes.
   Views needing unique indexes:
   - mv_player_batting ✅ (already has unique index)
   - mv_player_bowling ✅ (already has unique index)
   - mv_batter_vs_bowler — needs unique index
   - mv_partnerships — needs unique index
   - mv_team_vs_team — needs unique index

4. **API response caching**
   Add simple in-memory caching (dict + timestamp) for
   expensive endpoints that don't change between syncs:
   - /stats/highlights (F8) — cache 24 hours
   - /venues — cache 24 hours
   - /players/{id}/partnerships — cache 1 hour

5. **Optimise mv_player_batting refresh time**
   Currently takes ~482 seconds on 9.7M rows.
   Options to investigate:
   - Add CONCURRENTLY refresh (needs unique index review)
   - Partial refresh — only recompute years that changed
   - Consider pg_partman for partitioning deliveries by year

---

## Features to consider but not yet committed

These need more thought before committing to build.

1. **Live score integration**
   Would need a real-time data source beyond Cricsheet.
   Cricsheet is not real-time — skip for now.

2. **Fantasy cricket integration**
   Different product entirely — don't conflate.

3. **Predictive analytics ("who will win")**
   Out of scope for current version.

4. **Player photos**
   Licensing complications — use initials/avatars instead.

---

## How to use this file

When starting a post-deployment session:
1. Read this file first
2. Pick the highest priority item from the relevant section
3. Follow the same prompt-first, verify-database, 
   then-API, then-frontend pattern used during development
4. Update this file after each feature is complete

```
Completed post-deployment features will be marked ✅
```
