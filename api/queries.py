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

# ── Health check ─────────────────────────────────────────────

GET_HEALTH = """
    SELECT
        (SELECT COUNT(*) FROM matches) AS matches_in_db,
        (SELECT run_at FROM sync_log ORDER BY run_id DESC LIMIT 1) AS last_sync
"""
