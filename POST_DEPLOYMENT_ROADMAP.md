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

1. **Phase stats vs specific opposition**
   How does a bowler's death over economy change vs
   left-handed vs right-handed batters?
   Requires adding batting_hand column to players table
   (not in Cricsheet — needs manual/external data source)

2. **Phase stats at specific venues**
   How does a batter's powerplay SR change at Wankhede
   vs Chepauk? Filter phase stats by venue.

---

## F4 extensions (form guide)

Priority: Medium

1. **Form guide for bowling**
   Current form guide shows batting (last 10 innings).
   Add bowling form strip showing last 10 bowling
   performances as colour-coded economy badges.
   Green = economy < 7, Amber = 7-9, Red = 9+

2. **Form guide filter by format**
   Currently shows all formats mixed together.
   Add ability to filter form guide to specific format
   e.g. "last 10 IPL innings only"

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

1. **Standalone matchup search page**
   Currently matchups are only accessible via a player
   profile. Add /matchup page where you can search
   for any batter + any bowler directly.
   URL: /matchup?batter=ba607b88&bowler=244048f6

2. **Multi-format comparison**
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
   sync.yml is written but inactive (can't reach localhost).
   At deployment: add DATABASE_URL secret pointing to
   cloud database → sync activates automatically.

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
