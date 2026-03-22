-- ============================================================
-- Materialized Views for Cricket Statistics Platform
-- ============================================================
-- Refresh after each sync run:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_player_batting;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_player_bowling;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_batter_vs_bowler;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_player_vs_team;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_venue_stats;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- VIEW 1: mv_player_batting
-- Per-player per-format per-season batting aggregates
-- ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW mv_player_batting AS
WITH innings_scores AS (
    SELECT
        d.batter_id,
        i.innings_id,
        i.match_id,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS innings_runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls_faced,
        EXISTS (
            SELECT 1 FROM wickets w
            WHERE w.delivery_id IN (
                SELECT delivery_id FROM deliveries
                WHERE innings_id = i.innings_id
                AND batter_id = d.batter_id
            )
            AND w.player_out_id = d.batter_id
        ) AS was_dismissed
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    WHERE NOT d.is_wide
    GROUP BY d.batter_id, i.innings_id, i.match_id
)
SELECT
    s.batter_id AS player_id,
    p.name AS player_name,
    m.format,
    'Indian Premier League'::TEXT AS competition_name,
    EXTRACT(YEAR FROM m.date)::INTEGER AS year,
    COUNT(DISTINCT s.match_id) AS matches,
    COUNT(DISTINCT s.innings_id) AS innings,
    SUM(s.innings_runs) AS runs,
    SUM(s.balls_faced) AS balls_faced,
    COUNT(*) FILTER (WHERE s.was_dismissed) AS dismissals,
    ROUND(SUM(s.innings_runs)::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE s.was_dismissed), 0), 2) AS average,
    ROUND(SUM(s.innings_runs) * 100.0 /
        NULLIF(SUM(s.balls_faced), 0), 2) AS strike_rate,
    COUNT(*) FILTER (WHERE s.innings_runs >= 50
        AND s.innings_runs < 100) AS fifties,
    COUNT(*) FILTER (WHERE s.innings_runs >= 100) AS hundreds,
    COUNT(*) FILTER (WHERE s.innings_runs = 0
        AND s.was_dismissed) AS ducks,
    MAX(s.innings_runs) AS highest_score
FROM innings_scores s
JOIN matches m      ON m.match_id       = s.match_id
JOIN players p      ON p.player_id      = s.batter_id
JOIN competitions c ON c.competition_id = m.competition_id
WHERE c.name = 'Indian Premier League'
GROUP BY s.batter_id, p.name, m.format,
         EXTRACT(YEAR FROM m.date)::INTEGER

UNION ALL

SELECT
    s.batter_id AS player_id,
    p.name AS player_name,
    m.format,
    NULL::TEXT AS competition_name,
    EXTRACT(YEAR FROM m.date)::INTEGER AS year,
    COUNT(DISTINCT s.match_id) AS matches,
    COUNT(DISTINCT s.innings_id) AS innings,
    SUM(s.innings_runs) AS runs,
    SUM(s.balls_faced) AS balls_faced,
    COUNT(*) FILTER (WHERE s.was_dismissed) AS dismissals,
    ROUND(SUM(s.innings_runs)::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE s.was_dismissed), 0), 2) AS average,
    ROUND(SUM(s.innings_runs) * 100.0 /
        NULLIF(SUM(s.balls_faced), 0), 2) AS strike_rate,
    COUNT(*) FILTER (WHERE s.innings_runs >= 50
        AND s.innings_runs < 100) AS fifties,
    COUNT(*) FILTER (WHERE s.innings_runs >= 100) AS hundreds,
    COUNT(*) FILTER (WHERE s.innings_runs = 0
        AND s.was_dismissed) AS ducks,
    MAX(s.innings_runs) AS highest_score
FROM innings_scores s
JOIN matches m      ON m.match_id       = s.match_id
JOIN players p      ON p.player_id      = s.batter_id
JOIN competitions c ON c.competition_id = m.competition_id
WHERE c.name <> 'Indian Premier League'
GROUP BY s.batter_id, p.name, m.format,
         EXTRACT(YEAR FROM m.date)::INTEGER;

CREATE UNIQUE INDEX idx_mv_batting_pk
    ON mv_player_batting (player_id, format, competition_name, year);

CREATE INDEX idx_mv_batting_player
    ON mv_player_batting (player_id);

COMMENT ON MATERIALIZED VIEW mv_player_batting IS
    'Player batting stats by format & season. Refresh after every sync.';


-- ────────────────────────────────────────────────────────────
-- VIEW 2: mv_player_bowling
-- Per-player per-format per-season bowling aggregates
DROP MATERIALIZED VIEW IF EXISTS mv_player_bowling;

CREATE MATERIALIZED VIEW mv_player_bowling AS
WITH bowling_agg AS (
    SELECT
        d.bowler_id,
        i.innings_id,
        i.match_id,
        COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls,
        SUM(d.runs_total) AS runs_conceded
    FROM deliveries d
    JOIN innings i USING (innings_id)
    WHERE d.bowler_id IS NOT NULL
    GROUP BY d.bowler_id, i.innings_id, i.match_id
),
bowler_wickets AS (
    SELECT
        d.bowler_id,
        i.innings_id,
        i.match_id,
        COUNT(*) AS wickets
    FROM wickets w
    JOIN deliveries d USING (delivery_id)
    JOIN innings i USING (innings_id)
    WHERE w.kind NOT IN (
        'run out','retired hurt','retired out','obstructing the field'
    )
    GROUP BY d.bowler_id, i.innings_id, i.match_id
)
SELECT
    ba.bowler_id AS player_id,
    p.name AS player_name,
    m.format,
    'Indian Premier League'::TEXT AS competition_name,
    EXTRACT(YEAR FROM m.date)::INTEGER AS year,
    COUNT(DISTINCT ba.innings_id) AS innings_bowled,
    SUM(ba.legal_balls) AS balls_bowled,
    SUM(ba.runs_conceded) AS runs_conceded,
    COALESCE(SUM(bw.wickets), 0) AS wickets,
    CASE WHEN SUM(ba.legal_balls) > 0
         THEN ROUND(SUM(ba.runs_conceded) * 6.0 / SUM(ba.legal_balls), 2)
         ELSE NULL END AS economy,
    CASE WHEN COALESCE(SUM(bw.wickets), 0) > 0
         THEN ROUND(SUM(ba.runs_conceded)::NUMERIC / SUM(bw.wickets), 2)
         ELSE NULL END AS bowling_average,
    CASE WHEN COALESCE(SUM(bw.wickets), 0) > 0
         THEN ROUND(SUM(ba.legal_balls)::NUMERIC / SUM(bw.wickets), 2)
         ELSE NULL END AS strike_rate
FROM bowling_agg ba
JOIN matches m      ON m.match_id       = ba.match_id
JOIN players p      ON p.player_id      = ba.bowler_id
LEFT JOIN competitions c ON c.competition_id = m.competition_id
LEFT JOIN bowler_wickets bw
    ON  bw.bowler_id  = ba.bowler_id
    AND bw.innings_id = ba.innings_id
    AND bw.match_id   = ba.match_id
WHERE c.name = 'Indian Premier League'
GROUP BY ba.bowler_id, p.name, m.format,
         EXTRACT(YEAR FROM m.date)::INTEGER

UNION ALL

SELECT
    ba.bowler_id AS player_id,
    p.name AS player_name,
    m.format,
    NULL::TEXT AS competition_name,
    EXTRACT(YEAR FROM m.date)::INTEGER AS year,
    COUNT(DISTINCT ba.innings_id) AS innings_bowled,
    SUM(ba.legal_balls) AS balls_bowled,
    SUM(ba.runs_conceded) AS runs_conceded,
    COALESCE(SUM(bw.wickets), 0) AS wickets,
    CASE WHEN SUM(ba.legal_balls) > 0
         THEN ROUND(SUM(ba.runs_conceded) * 6.0 / SUM(ba.legal_balls), 2)
         ELSE NULL END AS economy,
    CASE WHEN COALESCE(SUM(bw.wickets), 0) > 0
         THEN ROUND(SUM(ba.runs_conceded)::NUMERIC / SUM(bw.wickets), 2)
         ELSE NULL END AS bowling_average,
    CASE WHEN COALESCE(SUM(bw.wickets), 0) > 0
         THEN ROUND(SUM(ba.legal_balls)::NUMERIC / SUM(bw.wickets), 2)
         ELSE NULL END AS strike_rate
FROM bowling_agg ba
JOIN matches m      ON m.match_id       = ba.match_id
JOIN players p      ON p.player_id      = ba.bowler_id
LEFT JOIN competitions c ON c.competition_id = m.competition_id
LEFT JOIN bowler_wickets bw
    ON  bw.bowler_id  = ba.bowler_id
    AND bw.innings_id = ba.innings_id
    AND bw.match_id   = ba.match_id
WHERE c.name IS NULL OR c.name != 'Indian Premier League'
GROUP BY ba.bowler_id, p.name, m.format,
         EXTRACT(YEAR FROM m.date)::INTEGER;

DROP INDEX IF EXISTS idx_mv_bowling_pk;
CREATE UNIQUE INDEX idx_mv_bowling_pk
ON mv_player_bowling
(player_id, format, year, COALESCE(competition_name, ''));


-- ────────────────────────────────────────────────────────────
-- VIEW 3: mv_batter_vs_bowler
-- Head-to-head batting matchups by format bucket, phase, and year
-- ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW mv_batter_vs_bowler AS
WITH delivery_base AS (
    SELECT
        d.batter_id,
        pb.name AS batter_name,
        d.bowler_id,
        pw.name AS bowler_name,
        m.format,
        c.name AS competition_name,
        CASE
            WHEN d.phase::TEXT ~ '^[0-9]+$' THEN d.phase::TEXT::INTEGER
            WHEN LOWER(d.phase::TEXT) = 'powerplay' THEN 0
            WHEN LOWER(d.phase::TEXT) = 'middle' THEN 1
            WHEN LOWER(d.phase::TEXT) = 'death' THEN 2
            ELSE NULL
        END AS phase_int,
        EXTRACT(YEAR FROM m.date)::INTEGER AS year,
        d.runs_batter,
        d.is_wide,
        w.kind AS wicket_kind
    FROM deliveries d
    JOIN innings i
        ON i.innings_id = d.innings_id
    JOIN matches m
        ON m.match_id = i.match_id
    LEFT JOIN competitions c
        ON c.competition_id = m.competition_id
    JOIN players pb
        ON pb.player_id = d.batter_id
    JOIN players pw
        ON pw.player_id = d.bowler_id
    LEFT JOIN wickets w
        ON  w.delivery_id = d.delivery_id
        AND w.player_out_id = d.batter_id
    WHERE d.batter_id IS NOT NULL
      AND d.bowler_id IS NOT NULL
),
bucketed AS (
    SELECT
        batter_id,
        batter_name,
        bowler_id,
        bowler_name,
        CASE
            WHEN competition_name = 'Indian Premier League' THEN 'IPL'
            WHEN format = 'IT20' THEN 'IT20'
            WHEN format = 'T20' AND competition_name <> 'Indian Premier League' THEN 'T20'
            WHEN format = 'ODI' THEN 'ODI'
            WHEN format = 'ODM' THEN 'ODM'
            WHEN format = 'Test' THEN 'Test'
            WHEN format = 'MDM' THEN 'MDM'
            ELSE NULL
        END AS format_bucket,
        phase_int,
        year,
        runs_batter,
        is_wide,
        wicket_kind
    FROM delivery_base
),
normalized AS (
    SELECT
        batter_id,
        batter_name,
        bowler_id,
        bowler_name,
        format_bucket,
        CASE
            WHEN format_bucket IN ('T20', 'IT20', 'IPL') THEN
                CASE phase_int
                    WHEN 0 THEN 'powerplay'
                    WHEN 1 THEN 'middle'
                    WHEN 2 THEN 'death'
                    ELSE NULL
                END
            ELSE NULL
        END AS phase,
        year,
        runs_batter,
        is_wide,
        wicket_kind
    FROM bucketed
    WHERE format_bucket IS NOT NULL
)
SELECT
    batter_id,
    batter_name,
    bowler_id,
    bowler_name,
    format_bucket,
    phase,
    year,
    COUNT(*) FILTER (WHERE NOT is_wide) AS balls,
    SUM(runs_batter) AS runs,
    COUNT(*) FILTER (
        WHERE wicket_kind NOT IN (
            'run out', 'retired hurt', 'retired out', 'obstructing the field'
        )
    ) AS dismissals,
    ROUND(
        SUM(runs_batter) * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE NOT is_wide), 0),
        2
    ) AS strike_rate,
    ROUND(
        SUM(runs_batter)::NUMERIC
        / NULLIF(
            COUNT(*) FILTER (
                WHERE wicket_kind NOT IN (
                    'run out', 'retired hurt', 'retired out', 'obstructing the field'
                )
            ),
            0
        ),
        2
    ) AS average,
    ROUND(
        COUNT(*) FILTER (WHERE runs_batter = 0 AND NOT is_wide) * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE NOT is_wide), 0),
        2
    ) AS dot_ball_pct,
    ROUND(
        COUNT(*) FILTER (WHERE runs_batter >= 4 AND NOT is_wide) * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE NOT is_wide), 0),
        2
    ) AS boundary_pct
FROM normalized
GROUP BY
    batter_id,
    batter_name,
    bowler_id,
    bowler_name,
    format_bucket,
    phase,
    year
HAVING COUNT(*) FILTER (WHERE NOT is_wide) >= 1;

CREATE INDEX idx_mv_bvb_batter_bowler
    ON mv_batter_vs_bowler (batter_id, bowler_id);

CREATE INDEX idx_mv_bvb_batter_bowler_format_bucket
    ON mv_batter_vs_bowler (batter_id, bowler_id, format_bucket);

COMMENT ON MATERIALIZED VIEW mv_batter_vs_bowler IS
    'Batter-vs-bowler stats by format bucket, phase, and year. Refresh after every sync.';


-- ────────────────────────────────────────────────────────────
-- VIEW 4: mv_player_vs_team
-- Player performance against each opposition (min 12 balls)
-- ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW mv_player_vs_team AS

-- Part A: batter vs bowling team
SELECT
    'batting'::TEXT                                                 AS role,
    d.batter_id                                                    AS player_id,
    p.name                                                         AS player_name,
    i.bowling_team                                                 AS opposition_team,
    COUNT(DISTINCT m.match_id)                                     AS matches,
    COUNT(DISTINCT i.innings_id)                                   AS innings,
    SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)                AS runs,
    COUNT(*)           FILTER (WHERE NOT d.is_wide)                AS balls,
    CASE WHEN COUNT(*) FILTER (WHERE NOT d.is_wide) > 0
         THEN ROUND(
             SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) * 100.0
             / COUNT(*) FILTER (WHERE NOT d.is_wide), 2)
         ELSE NULL END                                             AS strike_rate,
    NULL::BIGINT                                                   AS wickets,
    NULL::BIGINT                                                   AS runs_conceded,
    NULL::NUMERIC                                                  AS economy
FROM deliveries d
JOIN innings i USING (innings_id)
JOIN matches m USING (match_id)
JOIN players p ON p.player_id = d.batter_id
WHERE d.batter_id IS NOT NULL
GROUP BY d.batter_id, p.name, i.bowling_team
HAVING COUNT(*) FILTER (WHERE NOT d.is_wide) >= 12

UNION ALL

-- Part B: bowler vs batting team
SELECT
    'bowling'::TEXT                                                 AS role,
    d.bowler_id                                                    AS player_id,
    p.name                                                         AS player_name,
    i.batting_team                                                 AS opposition_team,
    COUNT(DISTINCT m.match_id)                                     AS matches,
    COUNT(DISTINCT i.innings_id)                                   AS innings,
    NULL::BIGINT                                                   AS runs,
    COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball)      AS balls,
    NULL::NUMERIC                                                  AS strike_rate,
    COUNT(w.wicket_id) FILTER (
        WHERE w.kind NOT IN ('run out', 'retired hurt',
                             'retired out', 'obstructing the field')
    )                                                              AS wickets,
    SUM(d.runs_total)                                              AS runs_conceded,
    CASE WHEN COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) > 0
         THEN ROUND(
             SUM(d.runs_total) * 6.0
             / COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball), 2)
         ELSE NULL END                                             AS economy
FROM deliveries d
JOIN innings i USING (innings_id)
JOIN matches m USING (match_id)
JOIN players p ON p.player_id = d.bowler_id
LEFT JOIN wickets w
    ON  w.delivery_id   = d.delivery_id
WHERE d.bowler_id IS NOT NULL
GROUP BY d.bowler_id, p.name, i.batting_team
HAVING COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) >= 12;

COMMENT ON MATERIALIZED VIEW mv_player_vs_team IS
    'Player batting/bowling splits vs each opposition (min 12 balls). Refresh after every sync.';


-- ────────────────────────────────────────────────────────────
-- VIEW 5: mv_venue_stats
-- Ground-level stats by format
-- ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW mv_venue_stats AS
WITH innings_totals AS (
    SELECT
        m.venue,
        m.format,
        m.match_id,
        m.winner,
        i.innings_number,
        i.batting_team,
        SUM(d.runs_total)   AS total_runs,
        COUNT(w.wicket_id)  AS wickets_fallen
    FROM innings i
    JOIN matches    m USING (match_id)
    JOIN deliveries d USING (innings_id)
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    GROUP BY m.venue, m.format, m.match_id, m.winner,
             i.innings_number, i.batting_team
)
SELECT
    venue,
    format,
    COUNT(DISTINCT match_id)                                       AS matches_played,

    ROUND(AVG(total_runs) FILTER (WHERE innings_number = 1), 1)    AS avg_first_innings_score,
    ROUND(AVG(total_runs) FILTER (WHERE innings_number = 2), 1)    AS avg_second_innings_score,

    MAX(total_runs)                                                AS highest_team_total,

    MIN(total_runs) FILTER (WHERE wickets_fallen >= 10)            AS lowest_team_total,

    CASE WHEN COUNT(*) FILTER (WHERE innings_number = 2 AND winner IS NOT NULL) > 0
         THEN ROUND(
             COUNT(*) FILTER (WHERE innings_number = 2
                                AND batting_team = winner) * 100.0
             / COUNT(*) FILTER (WHERE innings_number = 2
                                AND winner IS NOT NULL), 1)
         ELSE NULL END                                             AS chasing_win_pct

FROM innings_totals
GROUP BY venue, format;

COMMENT ON MATERIALIZED VIEW mv_venue_stats IS
    'Venue batting/bowling conditions by format. Refresh after every sync.';


-- ============================================================
-- Unique indexes (required for REFRESH ... CONCURRENTLY)
-- ============================================================

CREATE UNIQUE INDEX idx_mv_bowling_pk
    ON mv_player_bowling (player_id, format, year, COALESCE(competition_name, ''));

CREATE UNIQUE INDEX idx_mv_pvt_pk
    ON mv_player_vs_team (role, player_id, opposition_team);

CREATE UNIQUE INDEX idx_mv_venue_pk
    ON mv_venue_stats (venue, format);

-- Additional lookup indexes for common queries
CREATE INDEX idx_mv_batting_name   ON mv_player_batting (player_name);
CREATE INDEX idx_mv_bowling_name   ON mv_player_bowling (player_name);
CREATE INDEX idx_mv_pvt_player     ON mv_player_vs_team (player_id);
CREATE INDEX idx_mv_venue_venue    ON mv_venue_stats (venue);


-- ────────────────────────────────────────────────────────────
-- VIEW 6: mv_partnerships
-- Partnership aggregates by format bucket
-- ────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_partnerships;

CREATE MATERIALIZED VIEW mv_partnerships AS
WITH innings_pairs AS (
    SELECT
        d.innings_id,
        i.match_id,
        LEAST(d.batter_id, d.non_striker_id)    AS player1_id,
        GREATEST(d.batter_id, d.non_striker_id) AS player2_id,
        SUM(d.runs_total)                        AS innings_runs
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    WHERE d.non_striker_id IS NOT NULL
      AND d.batter_id != d.non_striker_id
    GROUP BY
        d.innings_id, i.match_id,
        LEAST(d.batter_id, d.non_striker_id),
        GREATEST(d.batter_id, d.non_striker_id)
),
pair_summary AS (
    SELECT
        ip.player1_id,
        ip.player2_id,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            WHEN m.format = 'Test' THEN 'Test'
            WHEN m.format = 'MDM'  THEN 'MDM'
            ELSE m.format
        END AS format_bucket,
        COUNT(*)                             AS innings_together,
        SUM(ip.innings_runs)                 AS total_runs,
        ROUND(AVG(ip.innings_runs)::numeric, 2) AS avg_partnership,
        MAX(ip.innings_runs)                 AS best_partnership
    FROM innings_pairs ip
    JOIN matches m      ON m.match_id       = ip.match_id
    LEFT JOIN competitions c
              ON c.competition_id = m.competition_id
    GROUP BY
        ip.player1_id,
        ip.player2_id,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            WHEN m.format = 'Test' THEN 'Test'
            WHEN m.format = 'MDM'  THEN 'MDM'
            ELSE m.format
        END
    HAVING COUNT(*) >= 3
)
SELECT
    ps.player1_id  AS player_id,
    p1.name        AS player_name,
    ps.player2_id  AS partner_id,
    p2.name        AS partner_name,
    ps.format_bucket,
    ps.innings_together,
    ps.total_runs,
    ps.avg_partnership,
    ps.best_partnership
FROM pair_summary ps
JOIN players p1 ON p1.player_id = ps.player1_id
JOIN players p2 ON p2.player_id = ps.player2_id

UNION ALL

SELECT
    ps.player2_id  AS player_id,
    p2.name        AS player_name,
    ps.player1_id  AS partner_id,
    p1.name        AS partner_name,
    ps.format_bucket,
    ps.innings_together,
    ps.total_runs,
    ps.avg_partnership,
    ps.best_partnership
FROM pair_summary ps
JOIN players p1 ON p1.player_id = ps.player1_id
JOIN players p2 ON p2.player_id = ps.player2_id;

CREATE INDEX ON mv_partnerships (player_id);
CREATE INDEX ON mv_partnerships (player_id, format_bucket);


-- ════════════════════════════════════════════════════════════
-- Team Name Normalization Function
-- Maps historical team names to current names for consistent grouping
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION normalise_team(team_name TEXT) 
RETURNS TEXT AS $$
BEGIN
    RETURN CASE team_name
        WHEN 'Royal Challengers Bangalore' 
            THEN 'Royal Challengers Bengaluru'
        WHEN 'Delhi Daredevils' 
            THEN 'Delhi Capitals'
        WHEN 'Deccan Chargers' 
            THEN 'Sunrisers Hyderabad'
        WHEN 'Rising Pune Supergiant' 
            THEN 'Rising Pune Supergiants'
        WHEN 'Pune Warriors' 
            THEN 'Pune Warriors India'
        ELSE team_name
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ════════════════════════════════════════════════════════════
-- VIEW 7: mv_team_vs_team
-- Overall head-to-head record per team pair per format
-- ════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team;

CREATE MATERIALIZED VIEW mv_team_vs_team AS
WITH match_results AS (
    SELECT
        m.match_id,
        m.date,
        m.format,
        m.venue,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            ELSE m.format
        END AS format_bucket,
        normalise_team(i1.batting_team)  AS team1,
        normalise_team(i1.bowling_team)  AS team2,
        normalise_team(m.winner)         AS winner,
        SUM(d1.runs_total) AS first_innings_score,
        (SELECT COALESCE(SUM(d2.runs_total), 0)
         FROM innings i2
         JOIN deliveries d2 ON d2.innings_id = i2.innings_id
         WHERE i2.match_id = m.match_id
         AND i2.innings_number = 2) AS second_innings_score
    FROM matches m
    JOIN innings i1 ON i1.match_id = m.match_id
        AND i1.innings_number = 1
    JOIN deliveries d1 ON d1.innings_id = i1.innings_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE m.winner IS NOT NULL
    GROUP BY
        m.match_id, m.date, m.format, m.venue,
        normalise_team(i1.batting_team), normalise_team(i1.bowling_team), normalise_team(m.winner),
        c.name
)
SELECT
    LEAST(team1, team2)    AS team_a,
    GREATEST(team1, team2) AS team_b,
    format_bucket,
    COUNT(*)               AS matches_played,
    COUNT(*) FILTER (
        WHERE winner = LEAST(team1, team2)
    )                      AS team_a_wins,
    COUNT(*) FILTER (
        WHERE winner = GREATEST(team1, team2)
    )                      AS team_b_wins,
    COUNT(*) FILTER (
        WHERE winner NOT IN (team1, team2)
    )                      AS no_results,
    ROUND(AVG(first_innings_score)::numeric, 1)
                           AS avg_first_innings,
    ROUND(AVG(second_innings_score)::numeric, 1)
                           AS avg_second_innings,
    MAX(first_innings_score) AS highest_team_total,
    MIN(date)              AS first_match,
    MAX(date)              AS last_match
FROM match_results
GROUP BY
    LEAST(team1, team2),
    GREATEST(team1, team2),
    format_bucket
HAVING COUNT(*) >= 2;

CREATE INDEX idx_mv_tvt_teams
    ON mv_team_vs_team (team_a, team_b);

CREATE INDEX idx_mv_tvt_teams_format
    ON mv_team_vs_team (team_a, team_b, format_bucket);

COMMENT ON MATERIALIZED VIEW mv_team_vs_team IS
    'Team vs team head-to-head record per format. Refresh after every sync.';


-- ════════════════════════════════════════════════════════════
-- VIEW 8: mv_team_vs_team_seasons
-- Season-by-season breakdown for year-by-year H2H trends
-- ════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team_seasons;

CREATE MATERIALIZED VIEW mv_team_vs_team_seasons AS
WITH match_results AS (
    SELECT
        m.match_id,
        m.date,
        EXTRACT(YEAR FROM m.date)::INTEGER AS year,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            ELSE m.format
        END AS format_bucket,
        normalise_team(i1.batting_team)  AS team1,
        normalise_team(i1.bowling_team)  AS team2,
        normalise_team(m.winner)         AS winner
    FROM matches m
    JOIN innings i1 ON i1.match_id = m.match_id
        AND i1.innings_number = 1
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE m.winner IS NOT NULL
    GROUP BY
        m.match_id, m.date, m.format,
        normalise_team(i1.batting_team), normalise_team(i1.bowling_team),
        normalise_team(m.winner), c.name
)
SELECT
    LEAST(team1, team2)    AS team_a,
    GREATEST(team1, team2) AS team_b,
    format_bucket,
    year,
    COUNT(*)               AS matches_played,
    COUNT(*) FILTER (
        WHERE winner = LEAST(team1, team2)
    )                      AS team_a_wins,
    COUNT(*) FILTER (
        WHERE winner = GREATEST(team1, team2)
    )                      AS team_b_wins
FROM match_results
GROUP BY
    LEAST(team1, team2),
    GREATEST(team1, team2),
    format_bucket,
    year
HAVING COUNT(*) >= 1
ORDER BY year DESC;

CREATE INDEX idx_mv_tvts_teams
    ON mv_team_vs_team_seasons (team_a, team_b);

CREATE INDEX idx_mv_tvts_teams_format
    ON mv_team_vs_team_seasons (team_a, team_b, format_bucket);

COMMENT ON MATERIALIZED VIEW mv_team_vs_team_seasons IS
    'Team vs team results by season. Used for IPL year-by-year H2H. Refresh after every sync.';


-- ════════════════════════════════════════════════════════════
-- VIEW 9: mv_team_recent_matches
-- Last 10 matches between any two teams for recent results section
-- ════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_team_recent_matches;

CREATE MATERIALIZED VIEW mv_team_recent_matches AS
SELECT
    LEAST(normalise_team(i1.batting_team), normalise_team(i1.bowling_team))    AS team_a,
    GREATEST(normalise_team(i1.batting_team), normalise_team(i1.bowling_team)) AS team_b,
    CASE
        WHEN c.name = 'Indian Premier League' THEN 'IPL'
        ELSE m.format
    END AS format_bucket,
    m.match_id,
    m.date,
    m.venue,
    i1.batting_team  AS batting_first,
    i1.bowling_team  AS bowling_first,
    normalise_team(m.winner) AS winner,
    m.win_by_runs,
    m.win_by_wickets,
    SUM(d1.runs_total) AS first_innings_score
FROM matches m
JOIN innings i1 ON i1.match_id = m.match_id
    AND i1.innings_number = 1
JOIN deliveries d1 ON d1.innings_id = i1.innings_id
LEFT JOIN competitions c ON c.competition_id = m.competition_id
WHERE m.winner IS NOT NULL
GROUP BY
    m.match_id, m.date, m.venue,
    normalise_team(i1.batting_team), normalise_team(i1.bowling_team),
    m.winner, m.win_by_runs, m.win_by_wickets,
    c.name, m.format;

CREATE INDEX idx_mv_trm_teams
    ON mv_team_recent_matches (team_a, team_b);

CREATE INDEX idx_mv_trm_teams_date
    ON mv_team_recent_matches (team_a, team_b, format_bucket, date DESC);

COMMENT ON MATERIALIZED VIEW mv_team_recent_matches IS
    'Recent matches between team pairs. Used for recent results section. Refresh after every sync.';
