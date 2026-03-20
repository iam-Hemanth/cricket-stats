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
