"""
SQL query constants for the Cricket Statistics API.

All queries use %s placeholders for psycopg2 parameterised execution.
Most queries read from materialized views for fast response times.
"""

# ── Player search ────────────────────────────────────────────

SEARCH_PLAYERS = """
    SELECT player_id, name
    FROM players
    WHERE name ILIKE %s
    ORDER BY name
    LIMIT 10
"""

# ── Batting stats ────────────────────────────────────────────

GET_PLAYER_BATTING = """
    SELECT player_id, player_name, format, year,
           competition_name, matches, innings, runs, balls_faced,
           average, strike_rate, fifties, hundreds,
           ducks, highest_score
    FROM mv_player_batting
    WHERE player_id = %s
      AND (%s IS NULL OR format = %s)
      AND (%s IS NULL OR year = %s)
    ORDER BY year DESC, format
"""

# ── Bowling stats ────────────────────────────────────────────

GET_PLAYER_BOWLING = """
    SELECT player_id, player_name, format, year, competition_name,
           innings_bowled, wickets, runs_conceded,
           economy, bowling_average, strike_rate
    FROM mv_player_bowling
    WHERE player_id = %s
      AND (%s IS NULL OR format = %s)
      AND (%s IS NULL OR year = %s)
    ORDER BY year DESC, format
"""

# ── Player vs teams ─────────────────────────────────────────

GET_PLAYER_VS_TEAMS_BATTING = """
    SELECT player_id, player_name, opposition_team, role,
           matches, innings, runs, balls AS balls_faced,
           strike_rate,
           NULL::BIGINT AS wickets,
           NULL::BIGINT AS runs_conceded,
           NULL::NUMERIC AS economy
    FROM mv_player_vs_team
    WHERE player_id = %s
      AND role = 'batting'
    ORDER BY runs DESC
"""

GET_PLAYER_VS_TEAMS_BOWLING = """
    SELECT player_id, player_name, opposition_team, role,
           matches, innings,
           NULL::BIGINT AS runs,
           balls AS balls_faced,
           NULL::NUMERIC AS strike_rate,
           wickets, runs_conceded, economy
    FROM mv_player_vs_team
    WHERE player_id = %s
      AND role = 'bowling'
    ORDER BY wickets DESC
"""

# ── Head-to-head matchup ────────────────────────────────────

GET_MATCHUP_ROWS = """
  SELECT format_bucket, phase, year,
       balls, runs, dismissals,
       strike_rate, average,
       dot_ball_pct, boundary_pct,
       batter_name, bowler_name
  FROM mv_batter_vs_bowler
  WHERE batter_id = %s AND bowler_id = %s
  ORDER BY format_bucket, year DESC, phase NULLS FIRST
"""

GET_MATCHUP_RECENT_DELIVERIES = """
  SELECT
    m.date,
    i.innings_number,
    d.over_number,
    d.ball_number,
    d.runs_batter,
    CASE WHEN w.wicket_id IS NOT NULL THEN true
       ELSE false END as is_wicket,
    i.batting_team,
    i.bowling_team,
    m.venue
  FROM deliveries d
  JOIN innings i  ON i.innings_id  = d.innings_id
  JOIN matches m  ON m.match_id    = i.match_id
  LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    AND w.player_out_id = d.batter_id
  WHERE d.batter_id = %s AND d.bowler_id = %s
  ORDER BY m.date DESC, i.innings_number,
       d.over_number, d.ball_number
  LIMIT 10
"""

# ── Venue stats ──────────────────────────────────────────────

GET_VENUE_STATS = """
    SELECT venue, format, matches_played,
           avg_first_innings_score,
           avg_second_innings_score,
           highest_team_total,
           lowest_team_total,
           chasing_win_pct
    FROM mv_venue_stats
    WHERE venue ILIKE %s
    ORDER BY format
"""

GET_ALL_VENUES = """
    SELECT venue,
           SUM(matches_played) AS matches_played
    FROM mv_venue_stats
    GROUP BY venue
    ORDER BY matches_played DESC
"""

# ── Partnerships ────────────────────────────────────────────

GET_PLAYER_PARTNERSHIPS = """
    SELECT
        partner_id,
        partner_name,
        format_bucket,
        innings_together,
        total_runs,
        ROUND(avg_partnership::numeric, 2) AS avg_partnership,
        best_partnership
    FROM mv_partnerships
    WHERE player_id = %s
    AND (%s IS NULL OR format_bucket = %s)
    ORDER BY total_runs DESC
    LIMIT 20
"""

# ── Phase specialist stats ──────────────────────────────────

GET_PLAYER_PHASE_BATTING = """
    SELECT
        d.phase AS phase_name,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            ELSE m.format
        END AS format_bucket,
        COUNT(*) FILTER (WHERE NOT d.is_wide)
            AS balls,
        SUM(d.runs_batter)
            AS runs,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND d.runs_batter = 0
        )                                           AS dot_balls,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND d.runs_batter >= 4
        )                                           AS boundaries,
        COUNT(w.wicket_id)                          AS dismissals
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN competitions c
              ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
        AND w.player_out_id = d.batter_id
    WHERE d.batter_id = %s
      AND d.phase IN ('powerplay', 'middle', 'death')
      AND m.format NOT IN ('Test', 'MDM')
      AND (%s IS NULL OR
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'IT20'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'ODM'  THEN 'ODM'
                ELSE m.format
            END = %s)
    GROUP BY d.phase, format_bucket
    ORDER BY format_bucket, 
        CASE d.phase
            WHEN 'powerplay' THEN 0
            WHEN 'middle' THEN 1
            WHEN 'death' THEN 2
        END
"""

GET_PLAYER_PHASE_BOWLING = """
    SELECT
        d.phase AS phase_name,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            ELSE m.format
        END AS format_bucket,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        )                                           AS balls,
        SUM(d.runs_total)                           AS runs_conceded,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
            AND d.runs_total = 0
        )                                           AS dot_balls,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        )                                           AS wickets
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN competitions c
              ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE d.bowler_id = %s
      AND d.phase IN ('powerplay', 'middle', 'death')
      AND m.format NOT IN ('Test', 'MDM')
      AND (%s IS NULL OR
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'IT20'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'ODM'  THEN 'ODM'
                ELSE m.format
            END = %s)
    GROUP BY d.phase, format_bucket
    ORDER BY format_bucket,
        CASE d.phase
            WHEN 'powerplay' THEN 0
            WHEN 'middle' THEN 1
            WHEN 'death' THEN 2
        END
"""

# ── Teams search and head-to-head ───────────────────────────

SEARCH_TEAMS = """
    SELECT DISTINCT team
    FROM (
      SELECT team1 AS team FROM matches
      UNION
      SELECT team2 AS team FROM matches
    ) teams
    WHERE team ILIKE %s
    ORDER BY team
    LIMIT 15
"""

GET_TEAM_HEAD_TO_HEAD = """
    SELECT team_a, team_b, format_bucket,
         matches_played, team_a_wins, team_b_wins,
         no_results, avg_first_innings,
         avg_second_innings, highest_team_total,
         first_match, last_match
    FROM mv_team_vs_team
    WHERE (
        (team_a = %s AND team_b = %s)
       OR (team_a = %s AND team_b = %s)
        )
      AND (%s IS NULL OR format_bucket = %s)
    ORDER BY format_bucket
"""

GET_TEAM_H2H_SEASONS = """
    SELECT year, format_bucket,
         matches_played, team_a_wins, team_b_wins
    FROM mv_team_vs_team_seasons
    WHERE (
        (team_a = %s AND team_b = %s)
       OR (team_a = %s AND team_b = %s)
        )
      AND (%s IS NULL OR format_bucket = %s)
    ORDER BY year DESC
    LIMIT 30
"""

GET_TEAM_RECENT_MATCHES = """
    SELECT match_id, date, venue, format_bucket,
         batting_first, bowling_first,
         winner, win_by_runs, win_by_wickets,
         first_innings_score
    FROM mv_team_recent_matches
    WHERE (
        (team_a = %s AND team_b = %s)
       OR (team_a = %s AND team_b = %s)
        )
      AND (%s IS NULL OR format_bucket = %s)
    ORDER BY date DESC
    LIMIT 5
"""

# ── Form guide (last 10 innings) ─────────────────────────

GET_PLAYER_FORM_BATTING = """
    SELECT
        m.match_id,
        m.date::TEXT AS date,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END AS format_bucket,
        CASE
            WHEN i.batting_team != i.bowling_team
            THEN i.bowling_team
            ELSE 'Unknown'
        END AS opposition,
        m.venue,
        SUM(d.runs_batter) FILTER (
            WHERE NOT d.is_wide
        )                                   AS runs,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide
        )                                   AS balls_faced,
        EXISTS (
            SELECT 1 FROM wickets w
            WHERE w.delivery_id IN (
                SELECT d2.delivery_id
                FROM deliveries d2
                WHERE d2.innings_id = i.innings_id
                AND d2.batter_id = %s
            )
            AND w.player_out_id = %s
        )                                   AS was_dismissed
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN competitions c
              ON c.competition_id = m.competition_id
    WHERE d.batter_id = %s
    GROUP BY
        m.match_id, m.date, m.format,
        i.innings_id, i.batting_team,
        i.bowling_team, m.venue, c.name
    ORDER BY m.date DESC
    LIMIT 10
"""

GET_PLAYER_FORM_BOWLING = """
    SELECT
        m.match_id,
        m.date::TEXT AS date,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'IT20'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'ODM'  THEN 'ODM'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END AS format_bucket,
        i.batting_team AS opposition,
        m.venue,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        )                                   AS balls_bowled,
        SUM(d.runs_total)                   AS runs_conceded,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        )                                   AS wickets
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN competitions c
              ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE d.bowler_id = %s
    GROUP BY
        m.match_id, m.date, m.format,
        i.innings_id, i.batting_team,
        m.venue, c.name
    ORDER BY m.date DESC
    LIMIT 10
"""

# ── Health check ─────────────────────────────────────────────

GET_HEALTH = """
    SELECT
        (SELECT COUNT(*) FROM matches) AS matches_in_db,
        (SELECT run_at FROM sync_log ORDER BY run_id DESC LIMIT 1) AS last_sync
"""


# ── Homepage highlights ─────────────────────────────────────

GET_STAT_CARDS = """
    SELECT * FROM (

        -- Most T20 sixes all time
        SELECT
            'most_t20_sixes' AS stat_id,
            'Most sixes in T20 cricket' AS label,
            p.name AS player_name,
            p.player_id,
            COUNT(*)::TEXT AS value,
            'sixes' AS unit,
            'T20 + IPL + IT20' AS format_label
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.batter_id
        LEFT JOIN competitions c
            ON c.competition_id = m.competition_id
        WHERE d.runs_batter = 6
          AND m.format IN ('T20', 'IT20')
        GROUP BY p.player_id, p.name
        ORDER BY COUNT(*) DESC
        LIMIT 1

    ) t1

    UNION ALL SELECT * FROM (

        -- Highest team total ever
        SELECT
            'highest_total' AS stat_id,
            'Highest team total ever' AS label,
            i.batting_team AS player_name,
            NULL AS player_id,
            SUM(d.runs_total)::TEXT AS value,
            'runs' AS unit,
            m.format AS format_label
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        GROUP BY i.innings_id, i.batting_team, m.format
        ORDER BY SUM(d.runs_total) DESC
        LIMIT 1

    ) t2

    UNION ALL SELECT * FROM (

        -- Best bowling figures (most wickets, fewest runs)
        SELECT
            'best_figures' AS stat_id,
            'Best bowling figures' AS label,
            p.name AS player_name,
            p.player_id,
            (COUNT(w.wicket_id)::TEXT || '/' ||
             SUM(d.runs_total)::TEXT) AS value,
            'figures' AS unit,
            m.format AS format_label
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.bowler_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
            AND w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        GROUP BY i.innings_id, p.player_id, p.name, m.format
        ORDER BY COUNT(w.wicket_id) DESC, SUM(d.runs_total) ASC
        LIMIT 1

    ) t3

    UNION ALL SELECT * FROM (

        -- Most matches played
        SELECT
            'most_matches' AS stat_id,
            'Most matches played' AS label,
            p.name AS player_name,
            p.player_id,
            COUNT(DISTINCT m.match_id)::TEXT AS value,
            'matches' AS unit,
            'All formats' AS format_label
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.batter_id
        GROUP BY p.player_id, p.name
        ORDER BY COUNT(DISTINCT m.match_id) DESC
        LIMIT 1

    ) t4
"""

GET_ON_FIRE_IPL_BATTING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        'Indian Premier League' AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS recent_runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls_faced,
        COUNT(w.wicket_id) AS dismissals,
        ROUND(
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0),
            1
        ) AS recent_sr
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.batter_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
        AND w.player_out_id = d.batter_id
    WHERE c.name = 'Indian Premier League'
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND (
        COUNT(w.wicket_id) = 0
        OR (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            / NULLIF(COUNT(w.wicket_id), 0)
        ) >= 25
      )
    ORDER BY (
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
        * (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0
            / NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0)
        )
    ) DESC
    LIMIT 4
"""

GET_ON_FIRE_IPL_BOWLING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        'Indian Premier League' AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        ) AS balls_bowled,
        SUM(d.runs_total) AS runs_conceded,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        ) AS wickets,
        ROUND(
            SUM(d.runs_total) * 6.0 /
            NULLIF(
                COUNT(*) FILTER (
                    WHERE NOT d.is_wide AND NOT d.is_noball
                ),
                0
            ),
            2
        ) AS recent_economy
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.bowler_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE c.name = 'Indian Premier League'
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND COUNT(*) FILTER (
          WHERE NOT d.is_wide AND NOT d.is_noball
      ) >= 72
    ORDER BY (
        SUM(d.runs_total) * 6.0 /
        NULLIF(
            COUNT(*) FILTER (
                WHERE NOT d.is_wide AND NOT d.is_noball
            ),
            0
        )
    ) ASC
    LIMIT 2
"""

GET_ON_FIRE_BIG_LEAGUES_BATTING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        c.name AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS recent_runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls_faced,
        COUNT(w.wicket_id) AS dismissals,
        ROUND(
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0),
            1
        ) AS recent_sr
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.batter_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
        AND w.player_out_id = d.batter_id
    WHERE c.name IN (
        'Big Bash League',
        'Pakistan Super League',
        'Caribbean Premier League',
        'SA20',
        'International League T20',
        'Major League Cricket',
        'Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League'
    )
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name, c.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND (
        COUNT(w.wicket_id) = 0
        OR (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            / NULLIF(COUNT(w.wicket_id), 0)
        ) >= 25
      )
    ORDER BY (
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
        * (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0
            / NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0)
        )
    ) DESC
    LIMIT 4
"""

GET_ON_FIRE_BIG_LEAGUES_BOWLING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        c.name AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        ) AS balls_bowled,
        SUM(d.runs_total) AS runs_conceded,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        ) AS wickets,
        ROUND(
            SUM(d.runs_total) * 6.0 /
            NULLIF(
                COUNT(*) FILTER (
                    WHERE NOT d.is_wide AND NOT d.is_noball
                ),
                0
            ),
            2
        ) AS recent_economy
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.bowler_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE c.name IN (
        'Big Bash League',
        'Pakistan Super League',
        'Caribbean Premier League',
        'SA20',
        'International League T20',
        'Major League Cricket',
        'Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League'
    )
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name, c.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND COUNT(*) FILTER (
          WHERE NOT d.is_wide AND NOT d.is_noball
      ) >= 72
    ORDER BY (
        SUM(d.runs_total) * 6.0 /
        NULLIF(
            COUNT(*) FILTER (
                WHERE NOT d.is_wide AND NOT d.is_noball
            ),
            0
        )
    ) ASC
    LIMIT 2
"""

GET_ON_FIRE_INTERNATIONAL_BATTING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        c.name AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS recent_runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls_faced,
        COUNT(w.wicket_id) AS dismissals,
        ROUND(
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0),
            1
        ) AS recent_sr
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.batter_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
        AND w.player_out_id = d.batter_id
    WHERE m.gender = 'male'
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND (
        m.format = 'IT20'
        OR (
          m.format = 'T20'
          AND (
            c.name ILIKE '%ICC%T20%'
            OR c.name ILIKE '% tour of %'
          )
          AND c.name !~* 'qualifier|sub.regional|region|Austria|Cyprus|Bahrain|Malaysia|Qatar|Cambodia|Indonesia|Lesotho|Botswana|Myanmar|Bhutan|Kuwait|Hong Kong|Nepal|Uganda|Namibia|Papua|UAE|United Arab|Oman|Singapore|Canada|Bermuda|Kenya|Jersey|Guernsey|Denmark|Italy|Norway|Germany|France|Spain|Finland|Switzerland|Vanuatu|Samoa|Cook Islands|Cayman|Argentina|Brazil|Chile|Peru|Mexico'
        )
      )
      AND c.name NOT IN (
        'Indian Premier League','Big Bash League',
        'Pakistan Super League','Caribbean Premier League',
        'SA20','International League T20',
        'Major League Cricket','Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League','Vitality Blast',
        'Vitality Blast Men','NatWest T20 Blast',
        'Syed Mushtaq Ali Trophy','Super Smash',
        'CSA T20 Challenge','Ram Slam T20 Challenge',
        'Nepal Premier League','Major Clubs T20 Tournament'
      )
    GROUP BY p.player_id, p.name, c.name
    HAVING COUNT(DISTINCT m.match_id) >= 3
      AND (
        COUNT(w.wicket_id) = 0
        OR (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            / NULLIF(COUNT(w.wicket_id), 0)
        ) >= 20
      )
    ORDER BY (
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
        * (
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide)
            * 100.0
            / NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0)
        )
    ) DESC
    LIMIT 4
"""

GET_ON_FIRE_INTERNATIONAL_BOWLING = """
    SELECT
        p.player_id,
        p.name AS player_name,
        c.name AS competition,
        COUNT(DISTINCT m.match_id) AS recent_matches,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        ) AS balls_bowled,
        SUM(d.runs_total) AS runs_conceded,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out','retired hurt',
                'retired out','obstructing the field'
            )
        ) AS wickets,
        ROUND(
            SUM(d.runs_total) * 6.0 /
            NULLIF(
                COUNT(*) FILTER (
                    WHERE NOT d.is_wide AND NOT d.is_noball
                ),
                0
            ),
            2
        ) AS recent_economy
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    JOIN players p      ON p.player_id      = d.bowler_id
    JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE m.gender = 'male'
      AND m.date >= CURRENT_DATE - INTERVAL '90 days'
      AND (
        m.format = 'IT20'
        OR (
          m.format = 'T20'
          AND (
            c.name ILIKE '%ICC%T20%'
            OR c.name ILIKE '% tour of %'
          )
          AND c.name !~* 'qualifier|sub.regional|region|Austria|Cyprus|Bahrain|Malaysia|Qatar|Cambodia|Indonesia|Lesotho|Botswana|Myanmar|Bhutan|Kuwait|Hong Kong|Nepal|Uganda|Namibia|Papua|UAE|United Arab|Oman|Singapore|Canada|Bermuda|Kenya|Jersey|Guernsey|Denmark|Italy|Norway|Germany|France|Spain|Finland|Switzerland|Vanuatu|Samoa|Cook Islands|Cayman|Argentina|Brazil|Chile|Peru|Mexico'
        )
      )
      AND c.name NOT IN (
        'Indian Premier League','Big Bash League',
        'Pakistan Super League','Caribbean Premier League',
        'SA20','International League T20',
        'Major League Cricket','Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League','Vitality Blast',
        'Vitality Blast Men','NatWest T20 Blast',
        'Syed Mushtaq Ali Trophy','Super Smash',
        'CSA T20 Challenge','Ram Slam T20 Challenge',
        'Nepal Premier League','Major Clubs T20 Tournament'
      )
    GROUP BY p.player_id, p.name, c.name
    HAVING COUNT(DISTINCT m.match_id) >= 3
      AND COUNT(*) FILTER (
          WHERE NOT d.is_wide AND NOT d.is_noball
      ) >= 54
    ORDER BY (
        SUM(d.runs_total) * 6.0 /
        NULLIF(
            COUNT(*) FILTER (
                WHERE NOT d.is_wide AND NOT d.is_noball
            ),
            0
        )
    ) ASC
    LIMIT 2
"""

GET_RIVALRY_IPL = """
    SELECT
        batter_id,
        batter_name,
        bowler_id,
        bowler_name,
        SUM(balls)        AS total_balls,
        SUM(runs)         AS total_runs,
        SUM(dismissals)   AS total_dismissals,
        ROUND(
            SUM(runs) * 100.0 / NULLIF(SUM(balls), 0)
        , 1)              AS strike_rate
    FROM mv_batter_vs_bowler
    WHERE format_bucket = 'IPL'
    GROUP BY batter_id, batter_name, bowler_id, bowler_name
    HAVING SUM(balls) >= 30
    ORDER BY (
        EXTRACT(DOY FROM CURRENT_DATE)::INTEGER *
        ABS(HASHTEXT(batter_id || bowler_id))::BIGINT
    ) % 10000
    LIMIT 1
"""

GET_RIVALRY_INTERNATIONAL = """
    SELECT
        batter_id,
        batter_name,
        bowler_id,
        bowler_name,
        SUM(balls)        AS total_balls,
        SUM(runs)         AS total_runs,
        SUM(dismissals)   AS total_dismissals,
        ROUND(
            SUM(runs) * 100.0 / NULLIF(SUM(balls), 0)
        , 1)              AS strike_rate
    FROM mv_batter_vs_bowler
    WHERE format_bucket = 'IT20'
    GROUP BY batter_id, batter_name, bowler_id, bowler_name
    HAVING SUM(balls) >= 20
    ORDER BY (
        EXTRACT(DOY FROM CURRENT_DATE)::INTEGER *
        ABS(HASHTEXT(batter_id || bowler_id))::BIGINT
    ) % 10000
    LIMIT 1
"""
