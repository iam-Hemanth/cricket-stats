# Stat Builder — V2 Roadmap

This document outlines the planned "V2" features for the Stat Builder module. These features were deferred from the initial (V1) release either due to data availability constraints in the current schema or because they require computationally expensive aggregations.

## 1. Bowler Type Filter
**Description:** Ability to filter stats by the bowler's specific style (e.g., "Left-arm orthodox", "Right-arm fast", "Leg-break googly").

**The Challenge:**
The Cricsheet dataset provides player names and registry IDs, but does not include metadata about a player's bowling style or batting hand. Currently, our `players` table only contains `player_id` and `name`.

**Implementation Path:**
- **Data Enrichment:** We need to build a scraper or use an external API (like ESPNcricinfo's stats API) to map our existing `player_id`s to their known bowling styles.
- **Database Update:** Add a `bowling_style` column to the `players` table and populate it via a one-time enrichment script.
- **Query Engine:** Add a new `WHERE` clause in `build_batting_query` and `build_bowling_query` to filter by `p.bowling_style IN (...)`.

## 2. Fielding Statistics
**Description:** A third stat type (alongside "Batting" and "Bowling") to query catches, run-outs, and stumpings by specific fielders across various dimensions.

**The Challenge:**
Fielding events are currently stored inside the `wickets` table under the `fielders` JSON array or text field (depending on schema extraction). Writing dynamic SQL to unnest and aggregate this data across 9.6M rows dynamically is complex and potentially slow.

**Implementation Path:**
- **Schema Optimization:** Extract fielding events from the `wickets` table into a dedicated `fielding_events` table (e.g., `delivery_id`, `fielder_id`, `dismissal_type`).
- **Query Engine:** Create a new `build_fielding_query(req)` function that joins `fielding_events` with `deliveries` and `matches`, allowing grouping by fielder, venue, format, etc.

## 3. Partnership Analysis
**Description:** Ability to query the performance of batting pairs (e.g., "Kohli & De Villiers in the IPL during the death overs").

**The Challenge:**
Partnerships require tracking the aggregate runs scored while two specific players are at the crease simultaneously. This means grouping by both `batter` and `non_striker` for every delivery, which is computationally expensive for real-time dynamic querying over the entire dataset.

**Implementation Path:**
- **Materialized Views:** Create a pre-aggregated `partnership_stats` view or table that groups deliveries by `(match_id, innings_id, batter1_id, batter2_id)`.
- **Query Engine:** Write a specialised SQL builder that queries this partnership table, supporting most of the existing filters (venue, year, opposition) but applying the group-by logic to the player pair.

## 4. Stat Card Export (Social Sharing)
**Description:** Instead of a simple CSV export, allow users to download their custom queried stat tables/cards as beautifully styled images with a "CricStats" watermark.

**The Challenge:**
Requires frontend canvas manipulation to capture DOM elements exactly as they appear, ensuring all custom inline styles, fonts, and dark mode colors are preserved.

**Implementation Path:**
- **Library Integration:** Add a library like `html2canvas` or `dom-to-image-more`.
- **UI Element:** Create a hidden or absolute-positioned "Export Template" component that formats the `ResultsViewer` data into an Instagram-friendly aspect ratio (1:1 or 4:5).
- **Watermarking:** Overlay the CricStats logo and the exact filters applied (e.g., "Kohli • IPL • Death Overs") onto the generated image before triggering the browser download.

## 5. Team Standings & Match Results Analysis
**Description:** Ability to query team consistency, win/loss records, win percentages, and tournament standings (e.g., "Most consistent team in IPL over the last 5 years").

**Status (2026-05-06):** Implemented as three team stat types: Team Results (results-only columns), Team Batting, and Team Bowling (team-aggregated batting/bowling metrics).

**The Challenge:**
The current Stat Builder (V1) is built entirely on top of the `deliveries` table. It excels at answering "How many runs did this team score?" or "What is their batting average?", but it completely ignores the match outcome (who actually won). "Consistency" requires aggregating the `matches` table (wins, losses, ties, no-results) rather than ball-by-ball events.

**Implementation Path:**
- **New Stat Type:** Add a `Team Results` toggle alongside `Batting` and `Bowling` in the UI.
- **Query Engine:** Create `build_team_results_query(req)` that queries the `matches` table directly (without joining `deliveries`). It will group by `winner` or `team1`/`team2` and aggregate counts to calculate `Matches Played`, `Won`, `Lost`, `Tied`, and `Win Percentage`.
- **UI Adjustments:** The Results Viewer will need a new set of columns specific to match outcomes instead of runs/wickets.
