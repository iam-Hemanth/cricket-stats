
# ── Match Card ──────────────────────────────────────────────

GET_MATCH_INFO = """
    SELECT
        m.match_id, TO_CHAR(m.date, 'YYYY-MM-DD') as date, m.venue, m.city, m.format, 
        m.team1, m.team2, m.winner, m.win_by_runs, m.win_by_wickets, 
        m.toss_winner, m.toss_decision, m.player_of_match, 
        m.day_night, m.playing_xi,
        c.name as competition
    FROM matches m
    LEFT JOIN competitions c ON m.competition_id = c.competition_id
    WHERE m.match_id = %s
"""

GET_MATCH_INNINGS = """
    SELECT innings_id, innings_number, batting_team, bowling_team
    FROM innings
    WHERE match_id = %s
    ORDER BY innings_number
"""

GET_INNINGS_DELIVERIES = """
    SELECT 
        d.delivery_id,
        d.over_number,
        d.ball_number,
        d.batter_id,
        pb.name as batter_name,
        d.bowler_id,
        pbo.name as bowler_name,
        d.non_striker_id,
        pns.name as non_striker_name,
        d.runs_batter,
        d.runs_extras,
        d.runs_total,
        d.is_wide,
        d.is_noball,
        d.is_bye,
        d.is_legbye,
        w.wicket_id,
        w.kind as dismissal_kind,
        w.player_out_id,
        w.fielder1_id,
        w.fielder2_id,
        pf1.name as fielder1_name,
        pf2.name as fielder2_name
    FROM deliveries d
    JOIN players pb ON d.batter_id = pb.player_id
    JOIN players pbo ON d.bowler_id = pbo.player_id
    JOIN players pns ON d.non_striker_id = pns.player_id
    LEFT JOIN wickets w ON d.delivery_id = w.delivery_id
    LEFT JOIN players pf1 ON w.fielder1_id = pf1.player_id
    LEFT JOIN players pf2 ON w.fielder2_id = pf2.player_id
    WHERE d.innings_id = %s
    ORDER BY d.delivery_id
"""
