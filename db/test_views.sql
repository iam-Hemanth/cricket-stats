-- ============================================================
-- Test Queries for Materialized Views
-- Run in pgAdmin or psql to verify data correctness
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Kohli career batting stats across all formats
--    Expected ballpark: T20≈12640, ODI≈14675, Test≈9230
-- ────────────────────────────────────────────────────────────
SELECT
    format,
    SUM(matches)      AS matches,
    SUM(innings)      AS innings,
    SUM(runs)         AS runs,
    ROUND(SUM(runs)::NUMERIC / NULLIF(SUM(innings - CASE WHEN average IS NULL THEN innings ELSE 0 END), 0), 2) AS career_avg,
    SUM(hundreds)     AS hundreds,
    SUM(fifties)      AS fifties,
    MAX(highest_score) AS highest_score
FROM mv_player_batting
WHERE player_name = 'V Kohli'
GROUP BY format
ORDER BY runs DESC;


-- ────────────────────────────────────────────────────────────
-- 2. Kohli's best head-to-head matchups
--    Top 10 bowlers he has scored most runs against
-- ────────────────────────────────────────────────────────────
SELECT
    bowler_name,
    balls,
    runs,
    dismissals,
    average,
    strike_rate,
    boundary_pct
FROM mv_batter_vs_bowler
WHERE batter_name = 'V Kohli'
ORDER BY runs DESC
LIMIT 10;


-- ────────────────────────────────────────────────────────────
-- 3. Kohli's worst head-to-head matchups
--    Top 10 bowlers who have dismissed him most (min 6 balls)
-- ────────────────────────────────────────────────────────────
SELECT
    bowler_name,
    balls,
    runs,
    dismissals,
    average,
    strike_rate,
    dot_ball_pct
FROM mv_batter_vs_bowler
WHERE batter_name = 'V Kohli'
  AND dismissals > 0
ORDER BY dismissals DESC, average ASC
LIMIT 10;


-- ────────────────────────────────────────────────────────────
-- 4. Kohli batting vs each opposition team
--    From mv_player_vs_team, ordered by runs
-- ────────────────────────────────────────────────────────────
SELECT
    opposition_team,
    matches,
    innings,
    runs,
    balls        AS balls_faced,
    strike_rate
FROM mv_player_vs_team
WHERE player_name = 'V Kohli'
  AND role = 'batting'
ORDER BY runs DESC;


-- ────────────────────────────────────────────────────────────
-- 5. Wankhede Stadium stats across all formats
-- ────────────────────────────────────────────────────────────
SELECT
    venue,
    format,
    matches_played,
    avg_first_innings_score   AS avg_1st,
    avg_second_innings_score  AS avg_2nd,
    highest_team_total,
    lowest_team_total,
    chasing_win_pct
FROM mv_venue_stats
WHERE venue ILIKE '%Wankhede%'
ORDER BY format;


-- ────────────────────────────────────────────────────────────
-- 6. James Anderson bowling stats by season (Test format)
--    Peak seasons should show ~60-80 wickets
-- ────────────────────────────────────────────────────────────
SELECT
    season,
    innings_bowled,
    balls_bowled,
    runs_conceded,
    wickets,
    economy,
    bowling_average,
    strike_rate
FROM mv_player_bowling
WHERE player_name = 'JM Anderson'
  AND format = 'Test'
ORDER BY season;


-- ────────────────────────────────────────────────────────────
-- 7. View sizes — rows and disk usage for each view
-- ────────────────────────────────────────────────────────────
SELECT
    relname                                          AS view_name,
    TO_CHAR(reltuples::BIGINT, 'FM999,999,999')      AS approx_rows,
    PG_SIZE_PRETTY(pg_total_relation_size(oid))       AS total_size
FROM pg_class
WHERE relname IN (
    'mv_player_batting',
    'mv_player_bowling',
    'mv_batter_vs_bowler',
    'mv_player_vs_team',
    'mv_venue_stats'
)
ORDER BY pg_total_relation_size(oid) DESC;
