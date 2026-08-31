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
    SELECT pb.player_id, pb.player_name, pb.format, pb.year, pb.competition_name,
           pb.innings_bowled, pb.wickets, pb.runs_conceded,
           pb.economy, pb.bowling_average, pb.strike_rate,
           COALESCE(h.five_w, 0) AS five_w,
           COALESCE(h.ten_w, 0) AS ten_w
    FROM mv_player_bowling pb
    LEFT JOIN LATERAL (
        WITH innings_wickets AS (
            SELECT 
                i.match_id,
                COUNT(w.wicket_id) FILTER (
                    WHERE w.kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')
                ) AS wickets
            FROM deliveries d
            JOIN innings i ON i.innings_id = d.innings_id
            JOIN matches m ON m.match_id = i.match_id
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
            WHERE d.bowler_id = pb.player_id
              AND EXTRACT(YEAR FROM m.date)::INTEGER = pb.year
              AND (CASE 
                      WHEN pb.competition_name = 'Indian Premier League' THEN 'IPL' 
                      WHEN pb.format = 'IT20' THEN 'T20I'
                      ELSE pb.format 
                   END) = (CASE 
                             WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                             WHEN m.format = 'IT20' THEN 'T20I'
                             WHEN m.format = 'T20' THEN 'T20'
                             WHEN m.format = 'ODI' THEN 'ODI'
                             WHEN m.format = 'Test' THEN 'Test'
                             ELSE m.format 
                           END)
            GROUP BY i.match_id, i.innings_id
        )
        SELECT 
            COUNT(*) FILTER (WHERE wickets >= 5) AS five_w,
            COUNT(DISTINCT match_id) FILTER (
                WHERE (SELECT SUM(wickets) FROM innings_wickets iw2 WHERE iw2.match_id = innings_wickets.match_id) >= 10
            ) AS ten_w
        FROM innings_wickets
    ) h ON true
    WHERE pb.player_id = %s
      AND (%s IS NULL OR pb.format = %s)
      AND (%s IS NULL OR pb.year = %s)
    ORDER BY pb.year DESC, pb.format
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

# ── Player vs Specific Team (detailed module) ─────────────────

GET_PVT_BATTING_BY_FORMAT = """
    WITH innings_agg AS (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            COUNT(DISTINCT i.innings_id) AS innings,
            COUNT(DISTINCT m.match_id) AS matches,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter = 0) AS dot_balls,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter >= 4) AS boundaries,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS dismissals,
            COUNT(w.wicket_id) FILTER (WHERE w.kind IN ('run out','retired hurt','retired out','obstructing the field')) AS not_outs_extra,
            MAX(d.runs_batter) AS max_ball_runs
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        WHERE d.batter_id = %s
          AND i.bowling_team = ANY(%s)
          AND (%s IS NULL OR
               CASE
                   WHEN c.name = 'Indian Premier League' THEN 'IPL'
                   WHEN m.format = 'IT20' THEN 'T20I'
                   WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                   WHEN m.format = 'T20'  THEN 'T20'
                   WHEN m.format = 'ODI'  THEN 'ODI'
                   WHEN m.format = 'Test' THEN 'Test'
                   ELSE m.format
               END = ANY(%s))
        GROUP BY 1
    ),
    innings_scores AS (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            i.innings_id,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s) AS score,
            MAX(CASE WHEN w.player_out_id = %s AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS was_dismissed
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.bowling_team = ANY(%s)
          AND EXISTS (SELECT 1 FROM deliveries d2 WHERE d2.innings_id = i.innings_id AND d2.batter_id = %s)
        GROUP BY 1, 2
    ),
    score_agg AS (
        SELECT format_bucket,
               MAX(score) AS highest_score,
               COUNT(*) FILTER (WHERE score >= 100 AND was_dismissed = 1) AS hundreds_dis,
               COUNT(*) FILTER (WHERE score >= 100) AS hundreds,
               COUNT(*) FILTER (WHERE score >= 50 AND score < 100) AS fifties,
               COUNT(*) FILTER (WHERE score = 0 AND was_dismissed = 1) AS ducks,
               COUNT(*) FILTER (WHERE was_dismissed = 0) AS not_outs
        FROM innings_scores
        GROUP BY 1
    )
    SELECT
        a.format_bucket,
        a.matches,
        a.innings,
        a.runs,
        a.balls,
        a.dismissals,
        a.dot_balls,
        a.boundaries,
        s.highest_score,
        s.hundreds,
        s.fifties,
        s.ducks,
        s.not_outs,
        CASE WHEN a.balls > 0 THEN ROUND(a.runs * 100.0 / a.balls, 2) END AS strike_rate,
        CASE WHEN a.dismissals > 0 THEN ROUND(a.runs::numeric / a.dismissals, 2) END AS average,
        CASE WHEN a.balls > 0 THEN ROUND(a.dot_balls * 100.0 / a.balls, 2) END AS dot_ball_pct,
        CASE WHEN a.balls > 0 THEN ROUND(a.boundaries * 100.0 / a.balls, 2) END AS boundary_pct
    FROM innings_agg a
    LEFT JOIN score_agg s ON s.format_bucket = a.format_bucket
    ORDER BY
        CASE a.format_bucket
            WHEN 'Test' THEN 0 WHEN 'ODI' THEN 1 WHEN 'T20I' THEN 2
            WHEN 'IPL' THEN 3 WHEN 'T20' THEN 4
            ELSE 9
        END
"""

GET_PVT_BATTING_YEAR_BY_YEAR = """
    SELECT
        EXTRACT(YEAR FROM m.date)::int AS year,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
        COUNT(DISTINCT m.match_id) AS matches,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS dismissals
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
    WHERE d.batter_id = %s
      AND i.bowling_team = ANY(%s)
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY 1
    ORDER BY 1 DESC
"""

GET_PVT_BATTING_PHASE = """
    SELECT
        d.phase,
        COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
        SUM(d.runs_batter) AS runs,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS dismissals
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
    WHERE d.batter_id = %s
      AND i.bowling_team = ANY(%s)
      AND d.phase IN ('powerplay','middle','death')
      AND m.format NOT IN ('Test','MDM')
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               ELSE m.format
           END = ANY(%s))
    GROUP BY 1
    ORDER BY CASE d.phase WHEN 'powerplay' THEN 0 WHEN 'middle' THEN 1 WHEN 'death' THEN 2 END
"""

GET_PVT_BATTING_VENUE_SPLIT = """
    WITH ipl_team_venues AS (
        SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'M Chinnaswamy Stadium' AS venue UNION ALL
        SELECT 'Royal Challengers Bangalore', 'Bangalore', 'M Chinnaswamy Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Brabourne Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'MA Chidambaram Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley Stadium' UNION ALL
        SELECT 'Delhi Daredevils', 'Delhi', 'Feroz Shah Kotla' UNION ALL
        SELECT 'Delhi Daredevils', 'Raipur', 'Shaheed Veer Narayan Singh International Stadium' UNION ALL
        SELECT 'Delhi Capitals', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Chandigarh', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mohali', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Chandigarh', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Mohali', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mullanpur', 'Maharaja Yadavindra Singh International Cricket Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Indore', 'Holkar Cricket Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Sardar Patel Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Guwahati', 'Barsapara Cricket Stadium' UNION ALL
        SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Cuttack', 'Barabati Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana Cricket Stadium' UNION ALL
        SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Rajkot', 'Saurashtra Cricket Association Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Kanpur', 'Green Park' UNION ALL
        SELECT 'Rising Pune Supergiant', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Rising Pune Supergiants', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Pune Warriors', 'Pune', 'Subrata Roy Sahara Stadium'
    ),
    int_venue_map AS (
        SELECT DISTINCT m.venue,
          CASE
            WHEN m.city IN ('Mumbai','Delhi','Kolkata','Chennai','Bengaluru','Bangalore','Hyderabad','Ahmedabad','Pune','Jaipur','Mohali','Chandigarh','Lucknow','Dharamsala','Nagpur','Rajkot','Visakhapatnam','Indore','Ranchi','Thiruvananthapuram','Guwahati','Cuttack','Kanpur','Kochi','Raipur','Navi Mumbai','Greater Noida','Dehradun')
              OR m.venue ILIKE '%%Wankhede%%' OR m.venue ILIKE '%%Eden Gardens%%' OR m.venue ILIKE '%%Chidambaram%%'
              OR m.venue ILIKE '%%Chinnaswamy%%' OR m.venue ILIKE '%%Narendra Modi%%' OR m.venue ILIKE '%%Arun Jaitley%%'
              OR m.venue ILIKE '%%Feroz Shah Kotla%%' OR m.venue ILIKE '%%Rajiv Gandhi%%' OR m.venue ILIKE '%%Green Park%%'
              OR m.venue ILIKE '%%Saurashtra%%' OR m.venue ILIKE '%%Holkar%%' OR m.venue ILIKE '%%Brabourne%%'
              OR m.venue ILIKE '%%DY Patil%%' OR m.venue ILIKE '%%Ekana%%' OR m.venue ILIKE '%%JSCA%%'
              OR m.venue ILIKE '%%Vidarbha%%' OR m.venue ILIKE '%%Barabati%%' OR m.venue ILIKE '%%Greenfield%%'
              OR m.venue ILIKE '%%Barsapara%%' OR m.venue ILIKE '%%Sawai Mansingh%%'
              THEN 'India'
            WHEN m.city IN ('Melbourne','Sydney','Adelaide','Brisbane','Perth','Hobart','Canberra','Cairns','Gold Coast')
              OR m.venue ILIKE '%%Melbourne%%' OR m.venue ILIKE '%%Sydney%%' OR m.venue ILIKE '%%Adelaide%%'
              OR m.venue ILIKE '%%Brisbane%%' OR m.venue ILIKE '%%Perth%%' OR m.venue ILIKE '%%Hobart%%'
              OR m.venue ILIKE '%%Canberra%%' OR m.venue ILIKE '%%MCG%%' OR m.venue ILIKE '%%SCG%%'
              OR m.venue ILIKE '%%Gabba%%' OR m.venue ILIKE '%%WACA%%' OR m.venue ILIKE '%%Bellerive%%'
              OR m.venue ILIKE '%%Manuka%%' OR m.venue ILIKE '%%Kardinia%%' OR m.venue ILIKE '%%Carrara%%'
              THEN 'Australia'
            WHEN m.city IN ('London','Birmingham','Leeds','Manchester','Nottingham','Southampton','Bristol','Cardiff','Chester-le-Street','The Oval','Lord''s','Taunton','Chelmsford','Hove','Derby','Worcester','Durham')
              OR m.venue ILIKE '%%London%%' OR m.venue ILIKE '%%Birmingham%%' OR m.venue ILIKE '%%Leeds%%'
              OR m.venue ILIKE '%%Manchester%%' OR m.venue ILIKE '%%Nottingham%%' OR m.venue ILIKE '%%Southampton%%'
              OR m.venue ILIKE '%%Bristol%%' OR m.venue ILIKE '%%Cardiff%%' OR m.venue ILIKE '%%Chester-le-Street%%'
              OR m.venue ILIKE '%%The Oval%%' OR m.venue ILIKE '%%Lord''s%%' OR m.venue ILIKE '%%Taunton%%'
              OR m.venue ILIKE '%%Chelmsford%%' OR m.venue ILIKE '%%Hove%%' OR m.venue ILIKE '%%Derby%%'
              OR m.venue ILIKE '%%Worcester%%' OR m.venue ILIKE '%%Durham%%' OR m.venue ILIKE '%%Edgbaston%%'
              OR m.venue ILIKE '%%Old Trafford%%' OR m.venue ILIKE '%%Trent Bridge%%' OR m.venue ILIKE '%%Headingley%%'
              OR m.venue ILIKE '%%Rose Bowl%%' OR m.venue ILIKE '%%Riverside%%' OR m.venue ILIKE '%%Sophia Gardens%%'
              THEN 'England'
            WHEN m.city IN ('Johannesburg','Cape Town','Centurion','Durban','Port Elizabeth','Bloemfontein','East London','Paarl','Benoni','Potchefstroom','Kimberley')
              OR m.venue ILIKE '%%Johannesburg%%' OR m.venue ILIKE '%%Cape Town%%' OR m.venue ILIKE '%%Centurion%%'
              OR m.venue ILIKE '%%Durban%%' OR m.venue ILIKE '%%Port Elizabeth%%' OR m.venue ILIKE '%%Bloemfontein%%'
              OR m.venue ILIKE '%%East London%%' OR m.venue ILIKE '%%Paarl%%' OR m.venue ILIKE '%%Benoni%%'
              OR m.venue ILIKE '%%Potchefstroom%%' OR m.venue ILIKE '%%Kimberley%%' OR m.venue ILIKE '%%Wanderers%%'
              OR m.venue ILIKE '%%Newlands%%' OR m.venue ILIKE '%%SuperSport%%' OR m.venue ILIKE '%%Kingsmead%%'
              OR m.venue ILIKE '%%St George''s%%' OR m.venue ILIKE '%%Mangaung%%' OR m.venue ILIKE '%%Buffalo Park%%'
              OR m.venue ILIKE '%%Boland%%' OR m.venue ILIKE '%%Willowmoore%%' OR m.venue ILIKE '%%Senwes%%'
              OR m.venue ILIKE '%%De Beers%%' OR m.venue ILIKE '%%Gqeberha%%'
              THEN 'South Africa'
            WHEN m.city IN ('Wellington','Auckland','Christchurch','Hamilton','Napier','Dunedin','Mount Maunganui','Nelson','Queenstown')
              OR m.venue ILIKE '%%Wellington%%' OR m.venue ILIKE '%%Auckland%%' OR m.venue ILIKE '%%Christchurch%%'
              OR m.venue ILIKE '%%Hamilton%%' OR m.venue ILIKE '%%Napier%%' OR m.venue ILIKE '%%Dunedin%%'
              OR m.venue ILIKE '%%Mount Maunganui%%' OR m.venue ILIKE '%%Nelson%%' OR m.venue ILIKE '%%Queenstown%%'
              OR m.venue ILIKE '%%Basin Reserve%%' OR m.venue ILIKE '%%Eden Park%%' OR m.venue ILIKE '%%Hagley%%'
              OR m.venue ILIKE '%%Seddon%%' OR m.venue ILIKE '%%McLean%%' OR m.venue ILIKE '%%University Oval%%'
              OR m.venue ILIKE '%%Bay Oval%%' OR m.venue ILIKE '%%Saxton%%' OR m.venue ILIKE '%%John Davies%%'
              THEN 'New Zealand'
            WHEN m.city IN ('Lahore','Karachi','Rawalpindi','Faisalabad','Multan','Peshawar')
              OR m.venue ILIKE '%%Lahore%%' OR m.venue ILIKE '%%Karachi%%' OR m.venue ILIKE '%%Rawalpindi%%'
              OR m.venue ILIKE '%%Faisalabad%%' OR m.venue ILIKE '%%Multan%%' OR m.venue ILIKE '%%Peshawar%%'
              OR m.venue ILIKE '%%Gaddafi%%' OR (m.venue ILIKE '%%National Stadium%%' AND m.venue NOT ILIKE '%%International%%' AND m.venue NOT ILIKE '%%Shere Bangla%%') OR m.venue ILIKE '%%Iqbal%%'
              OR m.venue ILIKE '%%Arbab Niaz%%' OR m.venue ILIKE '%%Bugti%%'
              THEN 'Pakistan'
            WHEN m.city IN ('Colombo','Kandy','Galle','Dambulla','Hambantota','Pallekele')
              OR m.venue ILIKE '%%Colombo%%' OR m.venue ILIKE '%%Kandy%%' OR m.venue ILIKE '%%Galle%%'
              OR m.venue ILIKE '%%Dambulla%%' OR m.venue ILIKE '%%Hambantota%%' OR m.venue ILIKE '%%Pallekele%%'
              OR m.venue ILIKE '%%Premadasa%%' OR m.venue ILIKE '%%Sinhalese%%' OR m.venue ILIKE '%%Sara%%'
              OR m.venue ILIKE '%%Asgiriya%%' OR m.venue ILIKE '%%Mahinda%%' OR m.venue ILIKE '%%Rangiri%%'
              THEN 'Sri Lanka'
            WHEN m.city IN ('Dhaka','Chittagong','Sylhet','Mirpur','Khulna','Fatullah')
              OR m.venue ILIKE '%%Dhaka%%' OR m.venue ILIKE '%%Chittagong%%' OR m.venue ILIKE '%%Sylhet%%'
              OR m.venue ILIKE '%%Mirpur%%' OR m.venue ILIKE '%%Khulna%%' OR m.venue ILIKE '%%Shere Bangla%%'
              OR m.venue ILIKE '%%Zahur Ahmed%%' OR m.venue ILIKE '%%Bangabandhu%%' OR m.venue ILIKE '%%Fatullah%%'
              THEN 'Bangladesh'
            WHEN m.city IN ('Kingston','Bridgetown','Port of Spain','St George''s','Antigua','Basseterre','Gros Islet','North Sound','Providence','Lauderhill','Tarouba','St Lucia','Roseau')
              OR m.venue ILIKE '%%Kingston%%' OR m.venue ILIKE '%%Bridgetown%%' OR m.venue ILIKE '%%Port of Spain%%'
              OR m.venue ILIKE '%%Antigua%%' OR m.venue ILIKE '%%Basseterre%%' OR m.venue ILIKE '%%Gros Islet%%'
              OR m.venue ILIKE '%%Providence%%' OR m.venue ILIKE '%%Lauderhill%%' OR m.venue ILIKE '%%Tarouba%%'
              OR m.venue ILIKE '%%St Lucia%%' OR m.venue ILIKE '%%Roseau%%' OR m.venue ILIKE '%%Sabina Park%%'
              OR m.venue ILIKE '%%Kensington Oval%%' OR m.venue ILIKE '%%Queen%%s Park%%' OR m.venue ILIKE '%%Sir Vivian Richards%%'
              OR m.venue ILIKE '%%Warner Park%%' OR m.venue ILIKE '%%Daren Sammy%%' OR m.venue ILIKE '%%Brian Lara%%'
              THEN 'West Indies'
            WHEN m.city IN ('Harare','Bulawayo')
              OR m.venue ILIKE '%%Harare%%' OR m.venue ILIKE '%%Bulawayo%%' OR m.venue ILIKE '%%Queens Sports Club%%'
              THEN 'Zimbabwe'
            WHEN m.city IN ('Dubai','Abu Dhabi','Sharjah')
              OR m.venue ILIKE '%%Dubai%%' OR m.venue ILIKE '%%Abu Dhabi%%' OR m.venue ILIKE '%%Sharjah%%'
              THEN 'Neutral'
            ELSE 'Other'
          END AS country
        FROM matches m
    )
    SELECT * FROM (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'away'
                        ELSE 'neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'home'
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'away'
                        ELSE 'neutral'
                    END
            END AS venue_type,
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
                        ELSE 'Neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Home (' || UPPER(LEFT(vm.country, 3)) || ')'
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Away (' || UPPER(LEFT(vm.country, 3)) || ')'
                        ELSE 'Neutral'
                    END
            END AS label,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
            SUM(d.runs_batter) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS dismissals,
            ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE NOT d.is_wide), 0), 2) AS strike_rate,
            ROUND(SUM(d.runs_batter)::numeric / NULLIF(COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')), 0), 2) AS average
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN int_venue_map vm ON vm.venue = m.venue
        WHERE d.batter_id = %s
          AND i.bowling_team = ANY(%s)
          AND (%s IS NULL OR
               CASE
                   WHEN c.name = 'Indian Premier League' THEN 'IPL'
                   WHEN m.format = 'IT20' THEN 'T20I'
                   WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                   WHEN m.format = 'T20'  THEN 'T20'
                   WHEN m.format = 'ODI'  THEN 'ODI'
                   WHEN m.format = 'Test' THEN 'Test'
                   ELSE m.format
               END = ANY(%s))
        GROUP BY 1, 2
        HAVING COUNT(*) FILTER (WHERE NOT d.is_wide) > 0
    ) final
    ORDER BY CASE venue_type WHEN 'home' THEN 0 WHEN 'away' THEN 1 ELSE 2 END
"""


GET_TEAM_DASHBOARD_KPI = """
    WITH team_matches_stats AS (
        SELECT
            m.match_id,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format IN ('IT20', 'T20') THEN 'T20I'
                WHEN m.format IN ('ODM', 'ODI') THEN 'ODI'
                WHEN m.format IN ('MDM', 'Test') THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            m.team1, m.team2, m.winner,
            (SELECT SUM(runs_total) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.batting_team = %s) AS team_match_runs,
            (SELECT COUNT(*) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.batting_team = %s AND NOT d.is_wide AND NOT d.is_noball) AS team_match_balls,
            (SELECT SUM(runs_total) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.bowling_team = %s) AS opp_match_runs,
            (SELECT COUNT(*) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.bowling_team = %s AND NOT d.is_wide AND NOT d.is_noball) AS opp_match_balls
        FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE m.team1 = %s OR m.team2 = %s
    ),
    team_innings_stats AS (
        SELECT 
            i.match_id,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format IN ('IT20', 'T20') THEN 'T20I'
                WHEN m.format IN ('ODM', 'ODI') THEN 'ODI'
                WHEN m.format IN ('MDM', 'Test') THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            SUM(d.runs_total) AS innings_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS innings_balls,
            COUNT(w.wicket_id) AS wickets
        FROM innings i
        JOIN matches m ON m.match_id = i.match_id
        JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.batting_team = %s
        GROUP BY i.match_id, i.innings_id, format_bucket
    )
    SELECT
        COUNT(*)::int AS matches_played,
        COUNT(*) FILTER (WHERE winner = %s)::int AS won,
        COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != %s AND winner IN (team1, team2))::int AS lost,
        COUNT(*) FILTER (WHERE winner IS NULL OR winner NOT IN (team1, team2))::int AS no_result,
        0::int AS tied,
        ROUND(COUNT(*) FILTER (WHERE winner = %s) * 100.0 / NULLIF(COUNT(*), 0), 2)::float AS win_percentage,
        ROUND(SUM(team_match_runs) * 6.0 / NULLIF(SUM(team_match_balls), 0), 2)::float AS avg_runs_per_over,
        ROUND(SUM(opp_match_runs) * 6.0 / NULLIF(SUM(opp_match_balls), 0), 2)::float AS avg_runs_conceded_per_over,
        (SELECT MAX(innings_runs) FROM team_innings_stats WHERE (%s IS NULL OR format_bucket = %s))::int AS highest_score,
        COALESCE(
            (SELECT MIN(innings_runs) FROM team_innings_stats WHERE wickets >= 10 AND (%s IS NULL OR format_bucket = %s)),
            (SELECT MIN(innings_runs) FROM team_innings_stats WHERE (%s IS NULL OR format_bucket = %s))
        )::int AS lowest_score
    FROM team_matches_stats
    WHERE (%s IS NULL OR format_bucket = %s)
"""

GET_PVT_RECENT_INNINGS = """
    WITH innings_scores AS (
        SELECT
            m.match_id,
            m.date,
            m.venue,
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            i.batting_team,
            i.bowling_team,
            i.innings_number,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s) AS runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s) AS balls,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s AND d.runs_batter >= 4) AS fours,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s AND d.runs_batter = 6) AS sixes,
            MAX(CASE WHEN w.player_out_id = %s AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN w.kind ELSE NULL END) AS dismissal_kind,
            MAX(CASE WHEN w.player_out_id = %s AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN p.name ELSE NULL END) AS dismissed_by_name,
            MAX(CASE WHEN w.player_out_id = %s THEN w.kind ELSE NULL END) AS how_out
        FROM innings i
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        LEFT JOIN players p ON p.player_id = d.bowler_id AND w.player_out_id = %s
        WHERE i.bowling_team = ANY(%s)
          AND EXISTS (SELECT 1 FROM deliveries d2 WHERE d2.innings_id = i.innings_id AND d2.batter_id = %s)
        GROUP BY m.match_id, m.date, m.venue, format_bucket, i.batting_team, i.bowling_team, i.innings_number
        HAVING SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide AND d.batter_id = %s) IS NOT NULL
    )
    SELECT * FROM innings_scores
    ORDER BY date DESC
    LIMIT 15
"""


# ── Player vs Team (BOWLING) ───────────────────────────────

GET_PVT_BOWLING_BY_FORMAT = """
    WITH innings_agg AS (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            COUNT(DISTINCT m.match_id) AS matches,
            COUNT(DISTINCT i.innings_id) AS innings,
            COUNT(*) AS total_balls,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls,
            SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs_conceded,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
            COUNT(*) FILTER (WHERE d.runs_total = 0 AND NOT d.is_wide AND NOT d.is_noball) AS dot_balls,
            COUNT(*) FILTER (WHERE d.runs_batter IN (4, 6)) AS boundaries
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE d.bowler_id = %s
          AND i.batting_team = ANY(%s)
          AND (%s IS NULL OR
               CASE
                   WHEN c.name = 'Indian Premier League' THEN 'IPL'
                   WHEN m.format = 'IT20' THEN 'T20I'
                   WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                   WHEN m.format = 'T20'  THEN 'T20'
                   WHEN m.format = 'ODI'  THEN 'ODI'
                   WHEN m.format = 'Test' THEN 'Test'
                   ELSE m.format
               END = ANY(%s))
        GROUP BY 1
    ),
    innings_scores AS (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            i.innings_id,
            SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS score,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE d.bowler_id = %s
          AND i.batting_team = ANY(%s)
        GROUP BY 1, 2
    ),
    score_agg AS (
        SELECT format_bucket,
               COUNT(*) FILTER (WHERE wickets >= 4 AND wickets < 5) AS four_w,
               COUNT(*) FILTER (WHERE wickets >= 5) AS five_w,
               (SELECT CONCAT(s2.wickets, '/', s2.score) FROM innings_scores s2 WHERE s2.format_bucket = innings_scores.format_bucket ORDER BY wickets DESC, score ASC LIMIT 1) as bbi
        FROM innings_scores
        GROUP BY 1
    )
    SELECT
        a.format_bucket,
        a.matches,
        a.innings,
        a.runs_conceded AS runs,
        a.legal_balls AS balls,
        a.total_balls,
        a.wickets,
        a.dot_balls,
        a.boundaries,
        s.four_w,
        s.five_w,
        s.bbi,
        CASE WHEN a.legal_balls > 0 THEN ROUND(a.runs_conceded * 6.0 / a.legal_balls, 2) END AS economy,
        CASE WHEN a.wickets > 0 THEN ROUND(a.runs_conceded::numeric / a.wickets, 2) END AS average,
        CASE WHEN a.wickets > 0 THEN ROUND(a.legal_balls::numeric / a.wickets, 2) END AS strike_rate,
        CASE WHEN a.legal_balls > 0 THEN ROUND(a.dot_balls * 100.0 / a.legal_balls, 2) END AS dot_ball_pct,
        CASE WHEN a.legal_balls > 0 THEN ROUND(a.boundaries * 100.0 / a.legal_balls, 2) END AS boundary_pct
    FROM innings_agg a
    LEFT JOIN score_agg s ON s.format_bucket = a.format_bucket
    ORDER BY
        CASE a.format_bucket
            WHEN 'Test' THEN 0 WHEN 'ODI' THEN 1 WHEN 'T20I' THEN 2
            WHEN 'IPL' THEN 3 WHEN 'T20' THEN 4
            ELSE 9
        END
"""

GET_PVT_BOWLING_YEAR_BY_YEAR = """
    SELECT
        EXTRACT(YEAR FROM m.date)::int AS year,
        COUNT(DISTINCT m.match_id) AS matches,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
        SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    WHERE d.bowler_id = %s
      AND i.batting_team = ANY(%s)
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY 1
    ORDER BY 1 DESC
"""

GET_PVT_BOWLING_PHASE = """
    SELECT
        phase,
        COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS balls,
        SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
        COUNT(*) FILTER (WHERE d.runs_total = 0 AND NOT d.is_wide AND NOT d.is_noball) AS dot_balls,
        COUNT(*) FILTER (WHERE d.runs_batter IN (4, 6)) AS boundaries
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    WHERE d.bowler_id = %s
      AND i.batting_team = ANY(%s)
      AND phase IS NOT NULL
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY 1
    ORDER BY CASE phase WHEN 'powerplay' THEN 0 WHEN 'middle' THEN 1 ELSE 2 END
"""

GET_PVT_BOWLING_VENUE_SPLIT = """
    WITH int_venue_map AS (
        SELECT DISTINCT m.venue,
          CASE
            WHEN m.city IN ('Mumbai','Delhi','Kolkata','Chennai','Bengaluru','Bangalore','Hyderabad','Ahmedabad','Pune','Jaipur','Mohali','Chandigarh','Lucknow','Dharamsala','Nagpur','Rajkot','Visakhapatnam','Indore','Ranchi','Thiruvananthapuram','Guwahati','Cuttack','Kanpur','Kochi','Raipur','Navi Mumbai','Greater Noida','Dehradun')
              OR m.venue ILIKE '%%Wankhede%%' OR m.venue ILIKE '%%Eden Gardens%%' OR m.venue ILIKE '%%Chidambaram%%'
              OR m.venue ILIKE '%%Chinnaswamy%%' OR m.venue ILIKE '%%Narendra Modi%%' OR m.venue ILIKE '%%Arun Jaitley%%'
              OR m.venue ILIKE '%%Feroz Shah Kotla%%' OR m.venue ILIKE '%%Rajiv Gandhi%%' OR m.venue ILIKE '%%Green Park%%'
              OR m.venue ILIKE '%%Saurashtra%%' OR m.venue ILIKE '%%Holkar%%' OR m.venue ILIKE '%%Brabourne%%'
              OR m.venue ILIKE '%%DY Patil%%' OR m.venue ILIKE '%%Ekana%%' OR m.venue ILIKE '%%JSCA%%'
              OR m.venue ILIKE '%%Vidarbha%%' OR m.venue ILIKE '%%Barabati%%' OR m.venue ILIKE '%%Greenfield%%'
              OR m.venue ILIKE '%%Barsapara%%' OR m.venue ILIKE '%%Sawai Mansingh%%'
              THEN 'India'
            WHEN m.city IN ('Melbourne','Sydney','Adelaide','Brisbane','Perth','Hobart','Canberra','Cairns','Gold Coast')
              OR m.venue ILIKE '%%Melbourne%%' OR m.venue ILIKE '%%Sydney%%' OR m.venue ILIKE '%%Adelaide%%'
              OR m.venue ILIKE '%%Brisbane%%' OR m.venue ILIKE '%%Perth%%' OR m.venue ILIKE '%%Hobart%%'
              OR m.venue ILIKE '%%Canberra%%' OR m.venue ILIKE '%%MCG%%' OR m.venue ILIKE '%%SCG%%'
              OR m.venue ILIKE '%%Gabba%%' OR m.venue ILIKE '%%WACA%%' OR m.venue ILIKE '%%Bellerive%%'
              OR m.venue ILIKE '%%Manuka%%' OR m.venue ILIKE '%%Kardinia%%' OR m.venue ILIKE '%%Carrara%%'
              THEN 'Australia'
            WHEN m.city IN ('London','Birmingham','Leeds','Manchester','Nottingham','Southampton','Bristol','Cardiff','Chester-le-Street','The Oval','Lord''s','Taunton','Chelmsford','Hove','Derby','Worcester','Durham')
              OR m.venue ILIKE '%%London%%' OR m.venue ILIKE '%%Birmingham%%' OR m.venue ILIKE '%%Leeds%%'
              OR m.venue ILIKE '%%Manchester%%' OR m.venue ILIKE '%%Nottingham%%' OR m.venue ILIKE '%%Southampton%%'
              OR m.venue ILIKE '%%Bristol%%' OR m.venue ILIKE '%%Cardiff%%' OR m.venue ILIKE '%%Chester-le-Street%%'
              OR m.venue ILIKE '%%The Oval%%' OR m.venue ILIKE '%%Lord''s%%' OR m.venue ILIKE '%%Taunton%%'
              OR m.venue ILIKE '%%Chelmsford%%' OR m.venue ILIKE '%%Hove%%' OR m.venue ILIKE '%%Derby%%'
              OR m.venue ILIKE '%%Worcester%%' OR m.venue ILIKE '%%Durham%%' OR m.venue ILIKE '%%Edgbaston%%'
              OR m.venue ILIKE '%%Old Trafford%%' OR m.venue ILIKE '%%Trent Bridge%%' OR m.venue ILIKE '%%Headingley%%'
              OR m.venue ILIKE '%%Rose Bowl%%' OR m.venue ILIKE '%%Riverside%%' OR m.venue ILIKE '%%Sophia Gardens%%'
              THEN 'England'
            ELSE 'Other'
          END AS country
        FROM matches m
    ),
    ipl_team_venues AS (
        SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'Chinnaswamy' AS venue UNION ALL
        SELECT 'Royal Challengers Bangalore', 'Bengaluru', 'Chinnaswamy' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'Chidambaram' UNION ALL
        SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley' UNION ALL
        SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh' UNION ALL
        SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi' UNION ALL
        SELECT 'Punjab Kings', 'Chandigarh', 'IS Bindra' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana' UNION ALL
        SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi'
    )
    SELECT * FROM (
    SELECT
        CASE
            WHEN c.name = 'Indian Premier League' THEN
                CASE
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'home'
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'away'
                    ELSE 'neutral'
                END
            ELSE
                CASE
                    WHEN vm.country = (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.bowling_team LIKE '%%England%%' THEN 'England' ELSE 'Other' END) THEN 'home'
                    WHEN vm.country = (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.batting_team LIKE '%%England%%' THEN 'England' ELSE 'Other' END) THEN 'away'
                    ELSE 'neutral'
                END
        END AS venue_type,
        CASE
            WHEN c.name = 'Indian Premier League' THEN
                CASE
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
                    ELSE 'Neutral'
                END
            ELSE
                CASE
                    WHEN vm.country = (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.bowling_team LIKE '%%England%%' THEN 'England' ELSE 'Other' END) THEN 'Home (' || vm.country || ')'
                    WHEN vm.country = (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.batting_team LIKE '%%England%%' THEN 'England' ELSE 'Other' END) THEN 'Away (' || vm.country || ')'
                    ELSE 'Neutral'
                END
        END AS label,
        COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS balls,
        SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN int_venue_map vm ON vm.venue = m.venue
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    WHERE d.bowler_id = %s
      AND i.batting_team = ANY(%s)
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY 1, 2
    HAVING COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) > 0
    ) final
    ORDER BY CASE venue_type WHEN 'home' THEN 0 WHEN 'away' THEN 1 ELSE 2 END
"""

GET_PVT_DISMISSED_BATTERS = """
    SELECT
        w.player_out_id AS batter_id,
        p.name AS batter_name,
        COUNT(*) AS times_dismissed
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN wickets w ON w.delivery_id = d.delivery_id
    JOIN players p ON p.player_id = w.player_out_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE d.bowler_id = %s
      AND i.batting_team = ANY(%s)
      AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY w.player_out_id, p.name
    ORDER BY times_dismissed DESC
    LIMIT 8
"""

GET_PVT_DISMISSED_BY = """
    SELECT
        d.bowler_id,
        p.name AS bowler_name,
        COUNT(*) AS times_dismissed
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN wickets w ON w.delivery_id = d.delivery_id
    JOIN players p ON p.player_id = d.bowler_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE d.batter_id = %s
      AND i.bowling_team = ANY(%s)
      AND w.player_out_id = d.batter_id
      AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'T20I'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = ANY(%s))
    GROUP BY d.bowler_id, p.name
    ORDER BY times_dismissed DESC
    LIMIT 8
"""

GET_PVT_RECENT_SPELLS = """
    WITH innings_scores AS (
        SELECT
            m.match_id,
            m.date,
            m.venue,
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END AS format_bucket,
            i.batting_team,
            i.bowling_team,
            i.innings_number,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls,
            SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
            (SELECT COUNT(*) FROM (
                SELECT d2.over_number
                FROM deliveries d2
                WHERE d2.innings_id = i.innings_id AND d2.bowler_id = %s
                GROUP BY d2.over_number
                HAVING SUM(d2.runs_total) FILTER (WHERE NOT d2.is_bye AND NOT d2.is_legbye) = 0
            ) m_overs) AS maidens
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE d.bowler_id = %s
          AND i.batting_team = ANY(%s)
        GROUP BY 1, 2, 3, 4, 5, 6, i.innings_id, i.innings_number
        HAVING COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) > 0
    )
    SELECT * FROM innings_scores
    ORDER BY date DESC
    LIMIT 15
"""

GET_PLAYER_PVT_ROLE = """
    SELECT
        SUM(CASE WHEN d.batter_id = %s THEN 1 ELSE 0 END) as balls_faced,
        SUM(CASE WHEN d.bowler_id = %s THEN 1 ELSE 0 END) as balls_bowled
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    WHERE (d.batter_id = %s OR d.bowler_id = %s)
      AND (i.batting_team = ANY(%s) OR i.bowling_team = ANY(%s))
"""

GET_PVT_BOWLING_YEARLY = """
    SELECT
        EXTRACT(YEAR FROM m.date)::int AS year,
        COUNT(DISTINCT m.match_id) AS matches,
        SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
        COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
        COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
    WHERE d.bowler_id = %s
      AND i.batting_team = ANY(%s)
      AND (%s IS NULL OR
           CASE
               WHEN c.name = 'Indian Premier League' THEN 'IPL'
               WHEN m.format = 'IT20' THEN 'IT20'
               WHEN m.format = 'T20'  THEN 'T20'
               WHEN m.format = 'ODI'  THEN 'ODI'
               WHEN m.format = 'Test' THEN 'Test'
               ELSE m.format
           END = %s)
    GROUP BY 1
    ORDER BY 1 DESC
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

GET_MATCHUP_VENUE_SPLIT = """
  WITH ipl_team_venues AS (
    SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'M Chinnaswamy Stadium' AS venue UNION ALL
    SELECT 'Royal Challengers Bangalore', 'Bangalore', 'M Chinnaswamy Stadium' UNION ALL
    SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede Stadium' UNION ALL
    SELECT 'Mumbai Indians', 'Mumbai', 'Brabourne Stadium' UNION ALL
    SELECT 'Chennai Super Kings', 'Chennai', 'MA Chidambaram Stadium' UNION ALL
    SELECT 'Chennai Super Kings', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
    SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
    SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley Stadium' UNION ALL
    SELECT 'Delhi Daredevils', 'Delhi', 'Feroz Shah Kotla' UNION ALL
    SELECT 'Delhi Daredevils', 'Raipur', 'Shaheed Veer Narayan Singh International Stadium' UNION ALL
    SELECT 'Delhi Capitals', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
    SELECT 'Punjab Kings', 'Chandigarh', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
    SELECT 'Punjab Kings', 'Mohali', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
    SELECT 'Kings XI Punjab', 'Chandigarh', 'Punjab Cricket Association Stadium' UNION ALL
    SELECT 'Kings XI Punjab', 'Mohali', 'Punjab Cricket Association Stadium' UNION ALL
    SELECT 'Punjab Kings', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
    SELECT 'Kings XI Punjab', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
    SELECT 'Punjab Kings', 'Mullanpur', 'Maharaja Yadavindra Singh International Cricket Stadium' UNION ALL
    SELECT 'Kings XI Punjab', 'Indore', 'Holkar Cricket Stadium' UNION ALL
    SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh Stadium' UNION ALL
    SELECT 'Rajasthan Royals', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
    SELECT 'Rajasthan Royals', 'Ahmedabad', 'Sardar Patel Stadium' UNION ALL
    SELECT 'Rajasthan Royals', 'Guwahati', 'Barsapara Cricket Stadium' UNION ALL
    SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
    SELECT 'Deccan Chargers', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
    SELECT 'Deccan Chargers', 'Cuttack', 'Barabati Stadium' UNION ALL
    SELECT 'Deccan Chargers', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
    SELECT 'Lucknow Super Giants', 'Lucknow', 'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium' UNION ALL
    SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana Cricket Stadium' UNION ALL
    SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
    SELECT 'Gujarat Lions', 'Rajkot', 'Saurashtra Cricket Association Stadium' UNION ALL
    SELECT 'Gujarat Lions', 'Kanpur', 'Green Park' UNION ALL
    SELECT 'Rising Pune Supergiant', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
    SELECT 'Rising Pune Supergiants', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
    SELECT 'Pune Warriors', 'Pune', 'Subrata Roy Sahara Stadium'
  ),
  venue_country_map AS (
    SELECT DISTINCT m.venue,
      CASE
        WHEN m.city IN ('Mumbai','Delhi','Kolkata','Chennai','Bengaluru','Bangalore','Hyderabad','Ahmedabad','Pune','Jaipur','Mohali','Chandigarh','Lucknow','Dharamsala','Dharmasala','Nagpur','Rajkot','Visakhapatnam','Indore','Ranchi','Thiruvananthapuram','Guwahati','Cuttack','Kanpur','Kochi','Raipur','Navi Mumbai','Greater Noida','Dehradun','Vadodara','New Chandigarh','Mullanpur','Gwalior','Margao')
          OR m.venue ILIKE '%%Wankhede%%' OR m.venue ILIKE '%%Eden Gardens%%' OR m.venue ILIKE '%%Chidambaram%%'
          OR m.venue ILIKE '%%Chinnaswamy%%' OR m.venue ILIKE '%%Narendra Modi%%' OR m.venue ILIKE '%%Arun Jaitley%%'
          OR m.venue ILIKE '%%Feroz Shah Kotla%%' OR m.venue ILIKE '%%Rajiv Gandhi%%' OR m.venue ILIKE '%%Green Park%%'
          OR m.venue ILIKE '%%Saurashtra%%' OR m.venue ILIKE '%%Holkar%%' OR m.venue ILIKE '%%Brabourne%%'
          OR m.venue ILIKE '%%DY Patil%%' OR m.venue ILIKE '%%Ekana%%' OR m.venue ILIKE '%%JSCA%%'
          OR m.venue ILIKE '%%Vidarbha%%' OR m.venue ILIKE '%%Barabati%%' OR m.venue ILIKE '%%Greenfield%%'
          OR m.venue ILIKE '%%Barsapara%%' OR m.venue ILIKE '%%Sawai Mansingh%%'
          OR m.venue ILIKE '%%Himachal Pradesh%%' OR m.venue ILIKE '%%Maharaja Yadavindra%%'
          OR m.venue ILIKE '%%Reliance Stadium%%' OR m.venue ILIKE '%%Kotambi%%' OR m.venue ILIKE '%%Captain Roop Singh%%'
          OR m.venue ILIKE '%%Nehru Stadium, Fatorda%%' OR m.venue ILIKE '%%Shaheed Veer Narayan%%'
          THEN 'India'
        WHEN m.city IN ('Melbourne','Sydney','Adelaide','Brisbane','Perth','Hobart','Canberra','Cairns','Gold Coast')
          OR m.venue ILIKE '%%Melbourne%%' OR m.venue ILIKE '%%Sydney%%' OR m.venue ILIKE '%%Adelaide%%' OR m.venue ILIKE '%%Brisbane%%' OR m.venue ILIKE '%%Perth%%' OR m.venue ILIKE '%%Hobart%%' OR m.venue ILIKE '%%Canberra%%' OR m.venue ILIKE '%%MCG%%' OR m.venue ILIKE '%%SCG%%' OR m.venue ILIKE '%%Gabba%%' OR m.venue ILIKE '%%WACA%%' OR m.venue ILIKE '%%Bellerive%%' OR m.venue ILIKE '%%Manuka%%' OR m.venue ILIKE '%%Kardinia%%' OR m.venue ILIKE '%%Carrara%%' OR m.venue ILIKE '%%Traeger%%' OR m.venue ILIKE '%%Riverway%%'
          THEN 'Australia'
        WHEN m.city IN ('London','Birmingham','Leeds','Manchester','Nottingham','Southampton','Bristol','Cardiff','Chester-le-Street','The Oval','Lord''s','Taunton','Chelmsford','Hove','Derby','Worcester','Durham')
          OR m.venue ILIKE '%%London%%' OR m.venue ILIKE '%%Birmingham%%' OR m.venue ILIKE '%%Leeds%%' OR m.venue ILIKE '%%Manchester%%' OR m.venue ILIKE '%%Nottingham%%' OR m.venue ILIKE '%%Southampton%%' OR m.venue ILIKE '%%Bristol%%' OR m.venue ILIKE '%%Cardiff%%' OR m.venue ILIKE '%%Chester-le-Street%%' OR m.venue ILIKE '%%The Oval%%' OR m.venue ILIKE '%%Lord''s%%' OR m.venue ILIKE '%%Taunton%%' OR m.venue ILIKE '%%Chelmsford%%' OR m.venue ILIKE '%%Hove%%' OR m.venue ILIKE '%%Derby%%' OR m.venue ILIKE '%%Worcester%%' OR m.venue ILIKE '%%Durham%%' OR m.venue ILIKE '%%Edgbaston%%' OR m.venue ILIKE '%%Old Trafford%%' OR m.venue ILIKE '%%Trent Bridge%%' OR m.venue ILIKE '%%Headingley%%' OR m.venue ILIKE '%%Rose Bowl%%' OR m.venue ILIKE '%%Riverside%%' OR m.venue ILIKE '%%Sophia Gardens%%' OR m.venue ILIKE '%%Grace Road%%' OR m.venue ILIKE '%%St Lawrence%%' OR m.venue ILIKE '%%Arundel%%' OR m.venue ILIKE '%%Sedbergh%%'
          THEN 'England'
        WHEN m.city IN ('Johannesburg','Cape Town','Centurion','Durban','Port Elizabeth','Bloemfontein','East London','Paarl','Benoni','Potchefstroom','Kimberley')
          OR m.venue ILIKE '%%Johannesburg%%' OR m.venue ILIKE '%%Cape Town%%' OR m.venue ILIKE '%%Centurion%%' OR m.venue ILIKE '%%Durban%%' OR m.venue ILIKE '%%Port Elizabeth%%' OR m.venue ILIKE '%%Bloemfontein%%' OR m.venue ILIKE '%%East London%%' OR m.venue ILIKE '%%Paarl%%' OR m.venue ILIKE '%%Benoni%%' OR m.venue ILIKE '%%Potchefstroom%%' OR m.venue ILIKE '%%Kimberley%%' OR m.venue ILIKE '%%Wanderers%%' OR m.venue ILIKE '%%Newlands%%' OR m.venue ILIKE '%%SuperSport%%' OR m.venue ILIKE '%%Kingsmead%%' OR m.venue ILIKE '%%St George''s%%' OR m.venue ILIKE '%%Mangaung%%' OR m.venue ILIKE '%%Buffalo Park%%' OR m.venue ILIKE '%%Boland%%' OR m.venue ILIKE '%%Willowmoore%%' OR m.venue ILIKE '%%Senwes%%' OR m.venue ILIKE '%%De Beers%%' OR m.venue ILIKE '%%Gqeberha%%'
          THEN 'South Africa'
        WHEN m.city IN ('Wellington','Auckland','Christchurch','Hamilton','Napier','Dunedin','Mount Maunganui','Nelson','Queenstown')
          OR m.venue ILIKE '%%Wellington%%' OR m.venue ILIKE '%%Auckland%%' OR m.venue ILIKE '%%Christchurch%%' OR m.venue ILIKE '%%Hamilton%%' OR m.venue ILIKE '%%Napier%%' OR m.venue ILIKE '%%Dunedin%%' OR m.venue ILIKE '%%Mount Maunganui%%' OR m.venue ILIKE '%%Nelson%%' OR m.venue ILIKE '%%Queenstown%%' OR m.venue ILIKE '%%Basin Reserve%%' OR m.venue ILIKE '%%Eden Park%%' OR m.venue ILIKE '%%Hagley%%' OR m.venue ILIKE '%%Seddon%%' OR m.venue ILIKE '%%McLean%%' OR m.venue ILIKE '%%University Oval%%' OR m.venue ILIKE '%%Bay Oval%%' OR m.venue ILIKE '%%Saxton%%' OR m.venue ILIKE '%%John Davies%%' OR m.venue ILIKE '%%Cobham%%' OR m.venue ILIKE '%%Pukekura%%' OR m.venue ILIKE '%%Molyneux%%'
          THEN 'New Zealand'
        WHEN m.city IN ('Lahore','Karachi','Rawalpindi','Faisalabad','Multan','Peshawar')
          OR m.venue ILIKE '%%Lahore%%' OR m.venue ILIKE '%%Karachi%%' OR m.venue ILIKE '%%Rawalpindi%%' OR m.venue ILIKE '%%Faisalabad%%' OR m.venue ILIKE '%%Multan%%' OR m.venue ILIKE '%%Peshawar%%' OR m.venue ILIKE '%%Gaddafi%%' OR (m.venue ILIKE '%%National Stadium%%' AND m.venue NOT ILIKE '%%International%%' AND m.venue NOT ILIKE '%%Shere Bangla%%') OR m.venue ILIKE '%%Iqbal%%' OR m.venue ILIKE '%%Arbab Niaz%%' OR m.venue ILIKE '%%Bugti%%'
          THEN 'Pakistan'
        WHEN m.city IN ('Colombo','Kandy','Galle','Dambulla','Hambantota','Pallekele')
          OR m.venue ILIKE '%%Colombo%%' OR m.venue ILIKE '%%Kandy%%' OR m.venue ILIKE '%%Galle%%' OR m.venue ILIKE '%%Dambulla%%' OR m.venue ILIKE '%%Hambantota%%' OR m.venue ILIKE '%%Pallekele%%' OR m.venue ILIKE '%%Premadasa%%' OR m.venue ILIKE '%%Sinhalese%%' OR m.venue ILIKE '%%Sara%%' OR m.venue ILIKE '%%Asgiriya%%' OR m.venue ILIKE '%%Mahinda%%' OR m.venue ILIKE '%%Rangiri%%'
          THEN 'Sri Lanka'
        WHEN m.city IN ('Dhaka','Chittagong','Chattogram','Sylhet','Mirpur','Khulna','Fatullah')
          OR m.venue ILIKE '%%Dhaka%%' OR m.venue ILIKE '%%Chittagong%%' OR m.venue ILIKE '%%Sylhet%%' OR m.venue ILIKE '%%Mirpur%%' OR m.venue ILIKE '%%Khulna%%' OR m.venue ILIKE '%%Shere Bangla%%' OR m.venue ILIKE '%%Zahur Ahmed%%' OR m.venue ILIKE '%%Bangabandhu%%' OR m.venue ILIKE '%%Fatullah%%' OR m.venue ILIKE '%%Bogra%%' OR m.venue ILIKE '%%Rajshahi%%' OR m.venue ILIKE '%%Khan Shaheb%%'
          THEN 'Bangladesh'
        WHEN m.city IN ('Harare','Bulawayo')
          OR m.venue ILIKE '%%Harare%%' OR m.venue ILIKE '%%Bulawayo%%' OR m.venue ILIKE '%%Queens Sports Club%%' OR m.venue ILIKE '%%Harare Sports Club%%'
          THEN 'Zimbabwe'
        WHEN m.city IN ('Kingston','Bridgetown','Port of Spain','St George''s','Antigua','Basseterre','Gros Islet','North Sound','Providence','Lauderhill','Tarouba','St Lucia','Roseau')
          OR m.venue ILIKE '%%Kingston%%' OR m.venue ILIKE '%%Bridgetown%%' OR m.venue ILIKE '%%Port of Spain%%' OR m.venue ILIKE '%%Antigua%%' OR m.venue ILIKE '%%Basseterre%%' OR m.venue ILIKE '%%Gros Islet%%' OR m.venue ILIKE '%%Providence%%' OR m.venue ILIKE '%%Lauderhill%%' OR m.venue ILIKE '%%Tarouba%%' OR m.venue ILIKE '%%St Lucia%%' OR m.venue ILIKE '%%Roseau%%' OR m.venue ILIKE '%%Sabina Park%%' OR m.venue ILIKE '%%Kensington Oval%%' OR m.venue ILIKE '%%Queen''s Park Oval%%' OR m.venue ILIKE '%%Sir Vivian Richards%%' OR m.venue ILIKE '%%Warner Park%%' OR m.venue ILIKE '%%Daren Sammy%%' OR m.venue ILIKE '%%Brian Lara%%' OR m.venue ILIKE '%%Windsor Park%%' OR m.venue ILIKE '%%Arnos Vale%%' OR m.venue ILIKE '%%National Cricket Stadium%%'
          THEN 'West Indies'
        WHEN m.city IN ('Kabul','Sharjah')
          OR m.venue ILIKE '%%Kabul%%'
          THEN 'Afghanistan'
        WHEN m.city IN ('Dublin','Belfast')
          OR m.venue ILIKE '%%Dublin%%' OR m.venue ILIKE '%%Belfast%%' OR m.venue ILIKE '%%Malahide%%' OR m.venue ILIKE '%%Stormont%%' OR m.venue ILIKE '%%Bready%%' OR m.venue ILIKE '%%Clontarf%%'
          THEN 'Ireland'
        WHEN m.city IN ('Dubai','Abu Dhabi','Sharjah')
          OR m.venue ILIKE '%%Dubai%%' OR m.venue ILIKE '%%Abu Dhabi%%' OR m.venue ILIKE '%%Sharjah%%' OR m.venue ILIKE '%%Zayed%%' OR m.venue ILIKE '%%Tolerance%%'
          THEN 'Neutral'
        ELSE 'Other'
      END AS country
    FROM matches m
  ),
  matchup_deliveries AS (
    SELECT
      d.runs_batter,
      d.is_wide,
      w.kind AS wicket_kind,
      CASE
        WHEN m.competition_id IN (SELECT competition_id FROM competitions WHERE name = 'Indian Premier League') THEN 'IPL'
        WHEN m.format = 'IT20' THEN 'T20I'
        WHEN m.format = 'T20' AND (m.competition_id IS NULL OR m.competition_id NOT IN (SELECT competition_id FROM competitions WHERE name IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket'))) THEN 'T20I'
        WHEN m.format = 'T20' THEN 'T20'
        WHEN m.format = 'ODI' THEN 'ODI'
        WHEN m.format = 'Test' THEN 'Test'
        ELSE m.format
      END AS format_bucket,
      
      -- Classify venue_type
      CASE
        WHEN m.competition_id IN (SELECT competition_id FROM competitions WHERE name = 'Indian Premier League') THEN
          CASE
            WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'home'
            WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'away'
            ELSE 'neutral'
          END
        ELSE
          CASE
            WHEN cc.country = 
                 (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                       WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                       WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                       WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                       WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                       WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                       WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                       WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                       WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                       WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                       WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                       WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'home'
            WHEN cc.country = 
                 (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                       WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                       WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                       WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                       WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                       WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                       WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                       WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                       WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                       WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                       WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                       WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'away'
            ELSE 'neutral'
          END
      END AS venue_type,

      -- Classify label
      CASE
        WHEN m.competition_id IN (SELECT competition_id FROM competitions WHERE name = 'Indian Premier League') THEN
          CASE
            WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
            WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
            ELSE 'Neutral'
          END
        ELSE
          CASE
            WHEN cc.country = 
                 (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                       WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                       WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                       WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                       WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                       WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                       WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                       WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                       WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                       WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                       WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                       WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Home (' || UPPER(LEFT(CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.batting_team LIKE '%%England%%' THEN 'England' WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa' WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand' WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan' WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka' WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh' WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies' WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe' WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan' WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END, 3)) || ')'
            WHEN cc.country = 
                 (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                       WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                       WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                       WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                       WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                       WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                       WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                       WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                       WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                       WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                       WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                       WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Away (' || UPPER(LEFT(CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia' WHEN i.bowling_team LIKE '%%England%%' THEN 'England' WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa' WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand' WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan' WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka' WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh' WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies' WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe' WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan' WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END, 3)) || ')'
            ELSE 'Neutral'
          END
      END AS label
    FROM deliveries d
    JOIN innings i ON i.innings_id = d.innings_id
    JOIN matches m ON m.match_id = i.match_id
    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
    LEFT JOIN venue_country_map cc ON cc.venue = m.venue
    WHERE d.batter_id = %s
      AND d.bowler_id = %s
  )
  SELECT * FROM (
    SELECT
      format_bucket,
      venue_type,
      label,
      COUNT(*) FILTER (WHERE NOT is_wide) AS balls,
      SUM(runs_batter) AS runs,
      COUNT(*) FILTER (
        WHERE wicket_kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
      ) AS dismissals,
      ROUND(
        SUM(runs_batter) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE NOT is_wide), 0), 2
      ) AS strike_rate,
      ROUND(
        SUM(runs_batter)::NUMERIC / NULLIF(
          COUNT(*) FILTER (WHERE wicket_kind NOT IN ('run out','retired hurt','retired out','obstructing the field')), 0
        ), 2
      ) AS average
    FROM matchup_deliveries
    GROUP BY 1, 2, 3
    HAVING COUNT(*) FILTER (WHERE NOT is_wide) > 0
  ) AS final_stats
  ORDER BY
    CASE WHEN venue_type = 'home' THEN 0 WHEN venue_type = 'away' THEN 1 ELSE 2 END
"""

GET_MATCHUP_DISMISSAL_TYPES = """
  SELECT
    CASE
      WHEN c.name = 'Indian Premier League' THEN 'IPL'
      WHEN m.format = 'IT20' THEN 'T20I'
      WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
      WHEN m.format = 'T20'  THEN 'T20'
      WHEN m.format = 'ODI'  THEN 'ODI'
      WHEN m.format = 'Test' THEN 'Test'
      ELSE m.format
    END AS format_bucket,
    w.kind,
    COUNT(*) AS cnt
  FROM deliveries d
  JOIN innings i ON i.innings_id = d.innings_id
  JOIN matches m ON m.match_id = i.match_id
  LEFT JOIN competitions c ON c.competition_id = m.competition_id
  JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
  WHERE d.batter_id = %s AND d.bowler_id = %s
    AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
  GROUP BY format_bucket, w.kind
  ORDER BY format_bucket, cnt DESC
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
"""

# ── Phase specialist stats ──────────────────────────────────

GET_PLAYER_PHASE_BATTING = """
    SELECT
        d.phase AS phase_name,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
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
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                ELSE m.format
            END = ANY(%s))
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
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
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
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                ELSE m.format
            END = ANY(%s))
    GROUP BY d.phase, format_bucket
    ORDER BY format_bucket,
        CASE d.phase
            WHEN 'powerplay' THEN 0
            WHEN 'middle' THEN 1
            WHEN 'death' THEN 2
        END
"""

GET_PLAYER_VENUE_SPLITS_BATTING = """
    WITH int_venue_map AS (
        SELECT DISTINCT m.venue,
          CASE
            WHEN m.city IN ('Mumbai','Delhi','Kolkata','Chennai','Bengaluru','Bangalore','Hyderabad','Ahmedabad','Pune','Jaipur','Mohali','Chandigarh','Lucknow','Dharamsala','Dharmasala','Nagpur','Rajkot','Visakhapatnam','Indore','Ranchi','Thiruvananthapuram','Guwahati','Cuttack','Kanpur','Kochi','Raipur','Navi Mumbai','Greater Noida','Dehradun','Vadodara','New Chandigarh','Mullanpur','Gwalior','Margao')
              OR m.venue ILIKE '%%Wankhede%%' OR m.venue ILIKE '%%Eden Gardens%%' OR m.venue ILIKE '%%Chidambaram%%'
              OR m.venue ILIKE '%%Chinnaswamy%%' OR m.venue ILIKE '%%Narendra Modi%%' OR m.venue ILIKE '%%Arun Jaitley%%'
              OR m.venue ILIKE '%%Feroz Shah Kotla%%' OR m.venue ILIKE '%%Rajiv Gandhi%%' OR m.venue ILIKE '%%Green Park%%'
              OR m.venue ILIKE '%%Saurashtra%%' OR m.venue ILIKE '%%Holkar%%' OR m.venue ILIKE '%%Brabourne%%'
              OR m.venue ILIKE '%%DY Patil%%' OR m.venue ILIKE '%%Ekana%%' OR m.venue ILIKE '%%JSCA%%'
              OR m.venue ILIKE '%%Vidarbha%%' OR m.venue ILIKE '%%Barabati%%' OR m.venue ILIKE '%%Greenfield%%'
              OR m.venue ILIKE '%%Barsapara%%' OR m.venue ILIKE '%%Sawai Mansingh%%'
              OR m.venue ILIKE '%%Himachal Pradesh%%' OR m.venue ILIKE '%%Maharaja Yadavindra%%'
              OR m.venue ILIKE '%%Reliance Stadium%%' OR m.venue ILIKE '%%Kotambi%%' OR m.venue ILIKE '%%Captain Roop Singh%%'
              OR m.venue ILIKE '%%Nehru Stadium, Fatorda%%' OR m.venue ILIKE '%%Shaheed Veer Narayan%%'
              THEN 'India'
            WHEN m.city IN ('Melbourne','Sydney','Adelaide','Brisbane','Perth','Hobart','Canberra','Cairns','Gold Coast')
              OR m.venue ILIKE '%%Melbourne%%' OR m.venue ILIKE '%%Sydney%%' OR m.venue ILIKE '%%Adelaide%%'
              OR m.venue ILIKE '%%Brisbane%%' OR m.venue ILIKE '%%Perth%%' OR m.venue ILIKE '%%Hobart%%'
              OR m.venue ILIKE '%%Canberra%%' OR m.venue ILIKE '%%MCG%%' OR m.venue ILIKE '%%SCG%%'
              OR m.venue ILIKE '%%Gabba%%' OR m.venue ILIKE '%%WACA%%' OR m.venue ILIKE '%%Bellerive%%'
              OR m.venue ILIKE '%%Manuka%%' OR m.venue ILIKE '%%Kardinia%%' OR m.venue ILIKE '%%Carrara%%'
              THEN 'Australia'
            WHEN m.city IN ('London','Birmingham','Leeds','Manchester','Nottingham','Southampton','Bristol','Cardiff','Chester-le-Street','The Oval','Lord''s','Taunton','Chelmsford','Hove','Derby','Worcester','Durham')
              OR m.venue ILIKE '%%London%%' OR m.venue ILIKE '%%Birmingham%%' OR m.venue ILIKE '%%Leeds%%'
              OR m.venue ILIKE '%%Manchester%%' OR m.venue ILIKE '%%Nottingham%%' OR m.venue ILIKE '%%Southampton%%'
              OR m.venue ILIKE '%%Bristol%%' OR m.venue ILIKE '%%Cardiff%%' OR m.venue ILIKE '%%Chester-le-Street%%'
              OR m.venue ILIKE '%%The Oval%%' OR m.venue ILIKE '%%Lord''s%%' OR m.venue ILIKE '%%Taunton%%'
              OR m.venue ILIKE '%%Chelmsford%%' OR m.venue ILIKE '%%Hove%%' OR m.venue ILIKE '%%Derby%%'
              OR m.venue ILIKE '%%Worcester%%' OR m.venue ILIKE '%%Durham%%' OR m.venue ILIKE '%%Edgbaston%%'
              OR m.venue ILIKE '%%Old Trafford%%' OR m.venue ILIKE '%%Trent Bridge%%' OR m.venue ILIKE '%%Headingley%%'
              OR m.venue ILIKE '%%Rose Bowl%%' OR m.venue ILIKE '%%Riverside%%' OR m.venue ILIKE '%%Sophia Gardens%%'
              THEN 'England'
            WHEN m.city IN ('Johannesburg','Cape Town','Centurion','Durban','Port Elizabeth','Bloemfontein','East London','Paarl','Benoni','Potchefstroom','Kimberley')
              OR m.venue ILIKE '%%Johannesburg%%' OR m.venue ILIKE '%%Cape Town%%' OR m.venue ILIKE '%%Centurion%%'
              OR m.venue ILIKE '%%Durban%%' OR m.venue ILIKE '%%Port Elizabeth%%' OR m.venue ILIKE '%%Bloemfontein%%'
              OR m.venue ILIKE '%%East London%%' OR m.venue ILIKE '%%Paarl%%' OR m.venue ILIKE '%%Benoni%%'
              OR m.venue ILIKE '%%Potchefstroom%%' OR m.venue ILIKE '%%Kimberley%%' OR m.venue ILIKE '%%Wanderers%%'
              OR m.venue ILIKE '%%Newlands%%' OR m.venue ILIKE '%%SuperSport%%' OR m.venue ILIKE '%%Kingsmead%%'
              OR m.venue ILIKE '%%St George''s%%' OR m.venue ILIKE '%%Mangaung%%' OR m.venue ILIKE '%%Buffalo Park%%'
              OR m.venue ILIKE '%%Boland%%' OR m.venue ILIKE '%%Willowmoore%%' OR m.venue ILIKE '%%Senwes%%'
              OR m.venue ILIKE '%%De Beers%%' OR m.venue ILIKE '%%Gqeberha%%'
              THEN 'South Africa'
            WHEN m.city IN ('Wellington','Auckland','Christchurch','Hamilton','Napier','Dunedin','Mount Maunganui','Nelson','Queenstown')
              OR m.venue ILIKE '%%Wellington%%' OR m.venue ILIKE '%%Auckland%%' OR m.venue ILIKE '%%Christchurch%%'
              OR m.venue ILIKE '%%Hamilton%%' OR m.venue ILIKE '%%Napier%%' OR m.venue ILIKE '%%Dunedin%%'
              OR m.venue ILIKE '%%Mount Maunganui%%' OR m.venue ILIKE '%%Nelson%%' OR m.venue ILIKE '%%Queenstown%%'
              OR m.venue ILIKE '%%Basin Reserve%%' OR m.venue ILIKE '%%Eden Park%%' OR m.venue ILIKE '%%Hagley%%'
              OR m.venue ILIKE '%%Seddon%%' OR m.venue ILIKE '%%McLean%%' OR m.venue ILIKE '%%University Oval%%'
              OR m.venue ILIKE '%%Bay Oval%%' OR m.venue ILIKE '%%Saxton%%' OR m.venue ILIKE '%%John Davies%%'
              THEN 'New Zealand'
            WHEN m.city IN ('Lahore','Karachi','Rawalpindi','Faisalabad','Multan','Peshawar')
              OR m.venue ILIKE '%%Lahore%%' OR m.venue ILIKE '%%Karachi%%' OR m.venue ILIKE '%%Rawalpindi%%'
              OR m.venue ILIKE '%%Faisalabad%%' OR m.venue ILIKE '%%Multan%%' OR m.venue ILIKE '%%Peshawar%%'
              OR m.venue ILIKE '%%Gaddafi%%' OR (m.venue ILIKE '%%National Stadium%%' AND m.venue NOT ILIKE '%%International%%' AND m.venue NOT ILIKE '%%Shere Bangla%%') OR m.venue ILIKE '%%Iqbal%%'
              OR m.venue ILIKE '%%Arbab Niaz%%' OR m.venue ILIKE '%%Bugti%%'
              THEN 'Pakistan'
            WHEN m.city IN ('Colombo','Kandy','Galle','Dambulla','Hambantota','Pallekele')
              OR m.venue ILIKE '%%Colombo%%' OR m.venue ILIKE '%%Kandy%%' OR m.venue ILIKE '%%Galle%%'
              OR m.venue ILIKE '%%Dambulla%%' OR m.venue ILIKE '%%Hambantota%%' OR m.venue ILIKE '%%Pallekele%%'
              OR m.venue ILIKE '%%Premadasa%%' OR m.venue ILIKE '%%Sinhalese%%' OR m.venue ILIKE '%%Sara%%'
              OR m.venue ILIKE '%%Asgiriya%%' OR m.venue ILIKE '%%Mahinda%%' OR m.venue ILIKE '%%Rangiri%%'
              THEN 'Sri Lanka'
            WHEN m.city IN ('Dhaka','Chittagong','Chattogram','Sylhet','Mirpur','Khulna','Fatullah')
              OR m.venue ILIKE '%%Dhaka%%' OR m.venue ILIKE '%%Chittagong%%' OR m.venue ILIKE '%%Sylhet%%'
              OR m.venue ILIKE '%%Mirpur%%' OR m.venue ILIKE '%%Khulna%%' OR m.venue ILIKE '%%Shere Bangla%%'
              OR m.venue ILIKE '%%Zahur Ahmed%%' OR m.venue ILIKE '%%Bangabandhu%%' OR m.venue ILIKE '%%Fatullah%%'
              OR m.venue ILIKE '%%Khan Shaheb%%'
              THEN 'Bangladesh'
            WHEN m.city IN ('Kingston','Bridgetown','Port of Spain','St George''s','Antigua','Basseterre','Gros Islet','North Sound','Providence','Lauderhill','Tarouba','St Lucia','Roseau')
              OR m.venue ILIKE '%%Kingston%%' OR m.venue ILIKE '%%Bridgetown%%' OR m.venue ILIKE '%%Port of Spain%%'
              OR m.venue ILIKE '%%Antigua%%' OR m.venue ILIKE '%%Basseterre%%' OR m.venue ILIKE '%%Gros Islet%%'
              OR m.venue ILIKE '%%Providence%%' OR m.venue ILIKE '%%Lauderhill%%' OR m.venue ILIKE '%%Tarouba%%'
              OR m.venue ILIKE '%%St Lucia%%' OR m.venue ILIKE '%%Roseau%%' OR m.venue ILIKE '%%Sabina Park%%'
              OR m.venue ILIKE '%%Kensington Oval%%' OR m.venue ILIKE '%%Queen%%s Park%%' OR m.venue ILIKE '%%Sir Vivian Richards%%'
              OR m.venue ILIKE '%%Warner Park%%' OR m.venue ILIKE '%%Daren Sammy%%' OR m.venue ILIKE '%%Brian Lara%%'
              THEN 'West Indies'
            WHEN m.city IN ('Harare','Bulawayo')
              OR m.venue ILIKE '%%Harare%%' OR m.venue ILIKE '%%Bulawayo%%' OR m.venue ILIKE '%%Queens Sports Club%%'
              THEN 'Zimbabwe'
            WHEN m.city IN ('Dubai','Abu Dhabi','Sharjah')
              OR m.venue ILIKE '%%Dubai%%' OR m.venue ILIKE '%%Abu Dhabi%%' OR m.venue ILIKE '%%Sharjah%%'
              THEN 'Neutral'
            ELSE 'Other'
          END AS country
        FROM matches m
    ),
    ipl_team_venues AS (
        SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'M Chinnaswamy Stadium' AS venue UNION ALL
        SELECT 'Royal Challengers Bangalore', 'Bangalore', 'M Chinnaswamy Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Brabourne Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'MA Chidambaram Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley Stadium' UNION ALL
        SELECT 'Delhi Daredevils', 'Delhi', 'Feroz Shah Kotla' UNION ALL
        SELECT 'Delhi Daredevils', 'Raipur', 'Shaheed Veer Narayan Singh International Stadium' UNION ALL
        SELECT 'Delhi Capitals', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Chandigarh', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mohali', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Chandigarh', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Mohali', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mullanpur', 'Maharaja Yadavindra Singh International Cricket Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Indore', 'Holkar Cricket Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Sardar Patel Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Guwahati', 'Barsapara Cricket Stadium' UNION ALL
        SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Cuttack', 'Barabati Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana Cricket Stadium' UNION ALL
        SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Rajkot', 'Saurashtra Cricket Association Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Kanpur', 'Green Park' UNION ALL
        SELECT 'Rising Pune Supergiant', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Rising Pune Supergiants', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Pune Warriors', 'Pune', 'Subrata Roy Sahara Stadium'
    )
    SELECT
        venue_type,
        label,
        balls,
        runs,
        dismissals,
        NULL::int AS wickets,
        ROUND(runs * 100.0 / NULLIF(balls, 0), 2)::float AS strike_rate,
        ROUND(runs::numeric / NULLIF(dismissals, 0), 2)::float AS average,
        NULL::float AS economy
    FROM (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'away'
                        ELSE 'neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'home'
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'away'
                        ELSE 'neutral'
                    END
            END AS venue_type,
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
                        ELSE 'Neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Home'
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Away'
                        ELSE 'Neutral'
                    END
            END AS label,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
            SUM(d.runs_batter) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS dismissals
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN int_venue_map vm ON vm.venue = m.venue
        WHERE d.batter_id = %s
          AND (%s IS NULL OR
               CASE
                   WHEN c.name = 'Indian Premier League' THEN 'IPL'
                   WHEN m.format = 'IT20' THEN 'T20I'
                   WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                   WHEN m.format = 'T20'  THEN 'T20'
                   WHEN m.format = 'ODI'  THEN 'ODI'
                   WHEN m.format = 'Test' THEN 'Test'
                   ELSE m.format
               END = ANY(%s))
        GROUP BY 1, 2
    ) sub
    ORDER BY CASE venue_type WHEN 'home' THEN 0 WHEN 'away' THEN 1 ELSE 2 END
"""

GET_PLAYER_VENUE_SPLITS_BOWLING = """
    WITH int_venue_map AS (
        SELECT DISTINCT m.venue,
          CASE
            WHEN m.city IN ('Mumbai','Delhi','Kolkata','Chennai','Bengaluru','Bangalore','Hyderabad','Ahmedabad','Pune','Jaipur','Mohali','Chandigarh','Lucknow','Dharamsala','Dharmasala','Nagpur','Rajkot','Visakhapatnam','Indore','Ranchi','Thiruvananthapuram','Guwahati','Cuttack','Kanpur','Kochi','Raipur','Navi Mumbai','Greater Noida','Dehradun','Vadodara','New Chandigarh','Mullanpur','Gwalior','Margao')
              OR m.venue ILIKE '%%Wankhede%%' OR m.venue ILIKE '%%Eden Gardens%%' OR m.venue ILIKE '%%Chidambaram%%'
              OR m.venue ILIKE '%%Chinnaswamy%%' OR m.venue ILIKE '%%Narendra Modi%%' OR m.venue ILIKE '%%Arun Jaitley%%'
              OR m.venue ILIKE '%%Feroz Shah Kotla%%' OR m.venue ILIKE '%%Rajiv Gandhi%%' OR m.venue ILIKE '%%Green Park%%'
              OR m.venue ILIKE '%%Saurashtra%%' OR m.venue ILIKE '%%Holkar%%' OR m.venue ILIKE '%%Brabourne%%'
              OR m.venue ILIKE '%%DY Patil%%' OR m.venue ILIKE '%%Ekana%%' OR m.venue ILIKE '%%JSCA%%'
              OR m.venue ILIKE '%%Vidarbha%%' OR m.venue ILIKE '%%Barabati%%' OR m.venue ILIKE '%%Greenfield%%'
              OR m.venue ILIKE '%%Barsapara%%' OR m.venue ILIKE '%%Sawai Mansingh%%'
              OR m.venue ILIKE '%%Himachal Pradesh%%' OR m.venue ILIKE '%%Maharaja Yadavindra%%'
              OR m.venue ILIKE '%%Reliance Stadium%%' OR m.venue ILIKE '%%Kotambi%%' OR m.venue ILIKE '%%Captain Roop Singh%%'
              OR m.venue ILIKE '%%Nehru Stadium, Fatorda%%' OR m.venue ILIKE '%%Shaheed Veer Narayan%%'
              THEN 'India'
            WHEN m.city IN ('Melbourne','Sydney','Adelaide','Brisbane','Perth','Hobart','Canberra','Cairns','Gold Coast')
              OR m.venue ILIKE '%%Melbourne%%' OR m.venue ILIKE '%%Sydney%%' OR m.venue ILIKE '%%Adelaide%%'
              OR m.venue ILIKE '%%Brisbane%%' OR m.venue ILIKE '%%Perth%%' OR m.venue ILIKE '%%Hobart%%'
              OR m.venue ILIKE '%%Canberra%%' OR m.venue ILIKE '%%MCG%%' OR m.venue ILIKE '%%SCG%%'
              OR m.venue ILIKE '%%Gabba%%' OR m.venue ILIKE '%%WACA%%' OR m.venue ILIKE '%%Bellerive%%'
              OR m.venue ILIKE '%%Manuka%%' OR m.venue ILIKE '%%Kardinia%%' OR m.venue ILIKE '%%Carrara%%'
              THEN 'Australia'
            WHEN m.city IN ('London','Birmingham','Leeds','Manchester','Nottingham','Southampton','Bristol','Cardiff','Chester-le-Street','The Oval','Lord''s','Taunton','Chelmsford','Hove','Derby','Worcester','Durham')
              OR m.venue ILIKE '%%London%%' OR m.venue ILIKE '%%Birmingham%%' OR m.venue ILIKE '%%Leeds%%'
              OR m.venue ILIKE '%%Manchester%%' OR m.venue ILIKE '%%Nottingham%%' OR m.venue ILIKE '%%Southampton%%'
              OR m.venue ILIKE '%%Bristol%%' OR m.venue ILIKE '%%Cardiff%%' OR m.venue ILIKE '%%Chester-le-Street%%'
              OR m.venue ILIKE '%%The Oval%%' OR m.venue ILIKE '%%Lord''s%%' OR m.venue ILIKE '%%Taunton%%'
              OR m.venue ILIKE '%%Chelmsford%%' OR m.venue ILIKE '%%Hove%%' OR m.venue ILIKE '%%Derby%%'
              OR m.venue ILIKE '%%Worcester%%' OR m.venue ILIKE '%%Durham%%' OR m.venue ILIKE '%%Edgbaston%%'
              OR m.venue ILIKE '%%Old Trafford%%' OR m.venue ILIKE '%%Trent Bridge%%' OR m.venue ILIKE '%%Headingley%%'
              OR m.venue ILIKE '%%Rose Bowl%%' OR m.venue ILIKE '%%Riverside%%' OR m.venue ILIKE '%%Sophia Gardens%%'
              THEN 'England'
            WHEN m.city IN ('Johannesburg','Cape Town','Centurion','Durban','Port Elizabeth','Bloemfontein','East London','Paarl','Benoni','Potchefstroom','Kimberley')
              OR m.venue ILIKE '%%Johannesburg%%' OR m.venue ILIKE '%%Cape Town%%' OR m.venue ILIKE '%%Centurion%%'
              OR m.venue ILIKE '%%Durban%%' OR m.venue ILIKE '%%Port Elizabeth%%' OR m.venue ILIKE '%%Bloemfontein%%'
              OR m.venue ILIKE '%%East London%%' OR m.venue ILIKE '%%Paarl%%' OR m.venue ILIKE '%%Benoni%%'
              OR m.venue ILIKE '%%Potchefstroom%%' OR m.venue ILIKE '%%Kimberley%%' OR m.venue ILIKE '%%Wanderers%%'
              OR m.venue ILIKE '%%Newlands%%' OR m.venue ILIKE '%%SuperSport%%' OR m.venue ILIKE '%%Kingsmead%%'
              OR m.venue ILIKE '%%St George''s%%' OR m.venue ILIKE '%%Mangaung%%' OR m.venue ILIKE '%%Buffalo Park%%'
              OR m.venue ILIKE '%%Boland%%' OR m.venue ILIKE '%%Willowmoore%%' OR m.venue ILIKE '%%Senwes%%'
              OR m.venue ILIKE '%%De Beers%%' OR m.venue ILIKE '%%Gqeberha%%'
              THEN 'South Africa'
            WHEN m.city IN ('Wellington','Auckland','Christchurch','Hamilton','Napier','Dunedin','Mount Maunganui','Nelson','Queenstown')
              OR m.venue ILIKE '%%Wellington%%' OR m.venue ILIKE '%%Auckland%%' OR m.venue ILIKE '%%Christchurch%%'
              OR m.venue ILIKE '%%Hamilton%%' OR m.venue ILIKE '%%Napier%%' OR m.venue ILIKE '%%Dunedin%%'
              OR m.venue ILIKE '%%Mount Maunganui%%' OR m.venue ILIKE '%%Nelson%%' OR m.venue ILIKE '%%Queenstown%%'
              OR m.venue ILIKE '%%Basin Reserve%%' OR m.venue ILIKE '%%Eden Park%%' OR m.venue ILIKE '%%Hagley%%'
              OR m.venue ILIKE '%%Seddon%%' OR m.venue ILIKE '%%McLean%%' OR m.venue ILIKE '%%University Oval%%'
              OR m.venue ILIKE '%%Bay Oval%%' OR m.venue ILIKE '%%Saxton%%' OR m.venue ILIKE '%%John Davies%%'
              THEN 'New Zealand'
            WHEN m.city IN ('Lahore','Karachi','Rawalpindi','Faisalabad','Multan','Peshawar')
              OR m.venue ILIKE '%%Lahore%%' OR m.venue ILIKE '%%Karachi%%' OR m.venue ILIKE '%%Rawalpindi%%'
              OR m.venue ILIKE '%%Faisalabad%%' OR m.venue ILIKE '%%Multan%%' OR m.venue ILIKE '%%Peshawar%%'
              OR m.venue ILIKE '%%Gaddafi%%' OR (m.venue ILIKE '%%National Stadium%%' AND m.venue NOT ILIKE '%%International%%' AND m.venue NOT ILIKE '%%Shere Bangla%%') OR m.venue ILIKE '%%Iqbal%%'
              OR m.venue ILIKE '%%Arbab Niaz%%' OR m.venue ILIKE '%%Bugti%%'
              THEN 'Pakistan'
            WHEN m.city IN ('Colombo','Kandy','Galle','Dambulla','Hambantota','Pallekele')
              OR m.venue ILIKE '%%Colombo%%' OR m.venue ILIKE '%%Kandy%%' OR m.venue ILIKE '%%Galle%%'
              OR m.venue ILIKE '%%Dambulla%%' OR m.venue ILIKE '%%Hambantota%%' OR m.venue ILIKE '%%Pallekele%%'
              OR m.venue ILIKE '%%Premadasa%%' OR m.venue ILIKE '%%Sinhalese%%' OR m.venue ILIKE '%%Sara%%'
              OR m.venue ILIKE '%%Asgiriya%%' OR m.venue ILIKE '%%Mahinda%%' OR m.venue ILIKE '%%Rangiri%%'
              THEN 'Sri Lanka'
            WHEN m.city IN ('Dhaka','Chittagong','Chattogram','Sylhet','Mirpur','Khulna','Fatullah')
              OR m.venue ILIKE '%%Dhaka%%' OR m.venue ILIKE '%%Chittagong%%' OR m.venue ILIKE '%%Sylhet%%'
              OR m.venue ILIKE '%%Mirpur%%' OR m.venue ILIKE '%%Khulna%%' OR m.venue ILIKE '%%Shere Bangla%%'
              OR m.venue ILIKE '%%Zahur Ahmed%%' OR m.venue ILIKE '%%Bangabandhu%%' OR m.venue ILIKE '%%Fatullah%%'
              OR m.venue ILIKE '%%Khan Shaheb%%'
              THEN 'Bangladesh'
            WHEN m.city IN ('Kingston','Bridgetown','Port of Spain','St George''s','Antigua','Basseterre','Gros Islet','North Sound','Providence','Lauderhill','Tarouba','St Lucia','Roseau')
              OR m.venue ILIKE '%%Kingston%%' OR m.venue ILIKE '%%Bridgetown%%' OR m.venue ILIKE '%%Port of Spain%%'
              OR m.venue ILIKE '%%Antigua%%' OR m.venue ILIKE '%%Basseterre%%' OR m.venue ILIKE '%%Gros Islet%%'
              OR m.venue ILIKE '%%Providence%%' OR m.venue ILIKE '%%Lauderhill%%' OR m.venue ILIKE '%%Tarouba%%'
              OR m.venue ILIKE '%%St Lucia%%' OR m.venue ILIKE '%%Roseau%%' OR m.venue ILIKE '%%Sabina Park%%'
              OR m.venue ILIKE '%%Kensington Oval%%' OR m.venue ILIKE '%%Queen%%s Park%%' OR m.venue ILIKE '%%Sir Vivian Richards%%'
              OR m.venue ILIKE '%%Warner Park%%' OR m.venue ILIKE '%%Daren Sammy%%' OR m.venue ILIKE '%%Brian Lara%%'
              THEN 'West Indies'
            WHEN m.city IN ('Harare','Bulawayo')
              OR m.venue ILIKE '%%Harare%%' OR m.venue ILIKE '%%Bulawayo%%' OR m.venue ILIKE '%%Queens Sports Club%%'
              THEN 'Zimbabwe'
            WHEN m.city IN ('Dubai','Abu Dhabi','Sharjah')
              OR m.venue ILIKE '%%Dubai%%' OR m.venue ILIKE '%%Abu Dhabi%%' OR m.venue ILIKE '%%Sharjah%%'
              THEN 'Neutral'
            ELSE 'Other'
          END AS country
        FROM matches m
    ),
    ipl_team_venues AS (
        SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'M Chinnaswamy Stadium' AS venue UNION ALL
        SELECT 'Royal Challengers Bangalore', 'Bangalore', 'M Chinnaswamy Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede Stadium' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Brabourne Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'MA Chidambaram Stadium' UNION ALL
        SELECT 'Chennai Super Kings', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley Stadium' UNION ALL
        SELECT 'Delhi Daredevils', 'Delhi', 'Feroz Shah Kotla' UNION ALL
        SELECT 'Delhi Daredevils', 'Raipur', 'Shaheed Veer Narayan Singh International Stadium' UNION ALL
        SELECT 'Delhi Capitals', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Chandigarh', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mohali', 'Punjab Cricket Association IS Bindra Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Chandigarh', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Mohali', 'Punjab Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Dharamsala', 'Himachal Pradesh Cricket Association Stadium' UNION ALL
        SELECT 'Punjab Kings', 'Mullanpur', 'Maharaja Yadavindra Singh International Cricket Stadium' UNION ALL
        SELECT 'Kings XI Punjab', 'Indore', 'Holkar Cricket Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Sardar Patel Stadium' UNION ALL
        SELECT 'Rajasthan Royals', 'Guwahati', 'Barsapara Cricket Stadium' UNION ALL
        SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Hyderabad', 'Rajiv Gandhi International Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Cuttack', 'Barabati Stadium' UNION ALL
        SELECT 'Deccan Chargers', 'Visakhapatnam', 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana Cricket Stadium' UNION ALL
        SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Rajkot', 'Saurashtra Cricket Association Stadium' UNION ALL
        SELECT 'Gujarat Lions', 'Kanpur', 'Green Park' UNION ALL
        SELECT 'Rising Pune Supergiant', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Rising Pune Supergiants', 'Pune', 'Maharashtra Cricket Association Stadium' UNION ALL
        SELECT 'Pune Warriors', 'Pune', 'Subrata Roy Sahara Stadium'
    )
    SELECT
        venue_type,
        label,
        balls,
        runs,
        NULL::int AS dismissals,
        wickets,
        ROUND(wickets * 100.0 / NULLIF(balls, 0), 2)::float AS strike_rate,
        ROUND(runs::numeric / NULLIF(wickets, 0), 2)::float AS average,
        ROUND(runs * 6.0 / NULLIF(balls, 0), 2)::float AS economy
    FROM (
        SELECT
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'away'
                        ELSE 'neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'home'
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'away'
                        ELSE 'neutral'
                    END
            END AS venue_type,
            CASE
                WHEN c.name = 'Indian Premier League' THEN
                    CASE
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.bowling_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
                        WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = i.batting_team AND (v.city = m.city OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
                        ELSE 'Neutral'
                    END
                ELSE
                    CASE
                        WHEN vm.country = 
                             (CASE WHEN i.bowling_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.bowling_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.bowling_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.bowling_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.bowling_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.bowling_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.bowling_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.bowling_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.bowling_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.bowling_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.bowling_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.bowling_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Home'
                        WHEN vm.country = 
                             (CASE WHEN i.batting_team LIKE '%%India%%' THEN 'India' 
                                   WHEN i.batting_team LIKE '%%Australia%%' THEN 'Australia'
                                   WHEN i.batting_team LIKE '%%England%%' THEN 'England'
                                   WHEN i.batting_team LIKE '%%South Africa%%' THEN 'South Africa'
                                   WHEN i.batting_team LIKE '%%New Zealand%%' THEN 'New Zealand'
                                   WHEN i.batting_team LIKE '%%Pakistan%%' THEN 'Pakistan'
                                   WHEN i.batting_team LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                                   WHEN i.batting_team LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                                   WHEN i.batting_team LIKE '%%West Indies%%' THEN 'West Indies'
                                   WHEN i.batting_team LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                                   WHEN i.batting_team LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                                   WHEN i.batting_team LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Away'
                        ELSE 'Neutral'
                    END
            END AS label,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS balls,
            SUM(d.runs_total) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN int_venue_map vm ON vm.venue = m.venue
        WHERE d.bowler_id = %s
          AND (%s IS NULL OR
               CASE
                   WHEN c.name = 'Indian Premier League' THEN 'IPL'
                   WHEN m.format = 'IT20' THEN 'T20I'
                   WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
                   WHEN m.format = 'T20'  THEN 'T20'
                   WHEN m.format = 'ODI'  THEN 'ODI'
                   WHEN m.format = 'Test' THEN 'Test'
                   ELSE m.format
               END = ANY(%s))
        GROUP BY 1, 2
    ) sub
    ORDER BY CASE venue_type WHEN 'home' THEN 0 WHEN 'away' THEN 1 ELSE 2 END
"""

# ── Test innings splits ─────────────────────────────────────

GET_PLAYER_TEST_INNINGS_SPLIT_BATTING = """
    SELECT
        CASE WHEN i.innings_number IN (1, 2) THEN 1 ELSE 2 END AS innings_number,
        COUNT(DISTINCT i.innings_id)                    AS innings_count,
        SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS runs,
        COUNT(*) FILTER (WHERE NOT d.is_wide)           AS balls_faced,
        COUNT(w.wicket_id)                              AS dismissals,
        COALESCE(MAX(inn_runs.innings_runs), 0)         AS highest_score,
        COUNT(DISTINCT i.innings_id) FILTER (
            WHERE inn_runs.innings_runs >= 100
        )                                               AS hundreds,
        COUNT(DISTINCT i.innings_id) FILTER (
            WHERE inn_runs.innings_runs >= 50
            AND inn_runs.innings_runs < 100
        )                                               AS fifties
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
        AND w.player_out_id = d.batter_id
    LEFT JOIN (
        SELECT
            d2.innings_id,
            SUM(d2.runs_batter) FILTER (WHERE NOT d2.is_wide) AS innings_runs
        FROM deliveries d2
        WHERE d2.batter_id = %s
        GROUP BY d2.innings_id
    ) inn_runs ON inn_runs.innings_id = i.innings_id
    WHERE d.batter_id = %s
      AND m.format IN ('Test', 'MDM')
      AND i.innings_number IN (1, 2, 3, 4)
    GROUP BY CASE WHEN i.innings_number IN (1, 2) THEN 1 ELSE 2 END
    ORDER BY innings_number
"""

GET_PLAYER_TEST_INNINGS_SPLIT_BOWLING = """
    SELECT
        CASE WHEN i.innings_number IN (1, 2) THEN 1 ELSE 2 END AS innings_number,
        COUNT(DISTINCT i.innings_id)                            AS innings_count,
        COUNT(*) FILTER (
            WHERE NOT d.is_wide AND NOT d.is_noball
        )                                                       AS balls,
        SUM(d.runs_total)                                       AS runs_conceded,
        COUNT(w.wicket_id) FILTER (
            WHERE w.kind NOT IN (
                'run out', 'retired hurt',
                'retired out', 'obstructing the field'
            )
        )                                                       AS wickets
    FROM deliveries d
    JOIN innings i      ON i.innings_id     = d.innings_id
    JOIN matches m      ON m.match_id       = i.match_id
    LEFT JOIN wickets w ON w.delivery_id    = d.delivery_id
    WHERE d.bowler_id = %s
      AND m.format IN ('Test', 'MDM')
      AND i.innings_number IN (1, 2, 3, 4)
    GROUP BY CASE WHEN i.innings_number IN (1, 2) THEN 1 ELSE 2 END
    ORDER BY innings_number
"""

# ── Teams search and head-to-head ───────────────────────────

SEARCH_TEAMS = """
    SELECT DISTINCT t.canonical_name AS team
    FROM teams t
    LEFT JOIN team_aliases ta ON ta.team_id = t.team_id
    WHERE t.canonical_name ILIKE %s OR ta.alias_name ILIKE %s
    ORDER BY t.canonical_name
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
    SELECT match_id, date, venue, city, match_country, format_bucket,
         batting_first, bowling_first,
         winner, win_by_runs, win_by_wickets,
         match_stage,
         first_innings_score
    FROM mv_team_recent_matches
    WHERE (
        (team_a = %s AND team_b = %s)
       OR (team_a = %s AND team_b = %s)
        )
      AND (%s IS NULL OR format_bucket = %s)
    ORDER BY date DESC
    LIMIT 15
"""

# ── Team H2H top performers ─────────────────────────────

_NORMALISE_TEAM_SQL = """
CASE {field}
    WHEN 'Royal Challengers Bangalore' THEN 'Royal Challengers Bengaluru'
    WHEN 'Delhi Daredevils' THEN 'Delhi Capitals'
    WHEN 'Rising Pune Supergiant' THEN 'Rising Pune Supergiants'
    WHEN 'Pune Warriors' THEN 'Pune Warriors India'
    WHEN 'Kings XI Punjab' THEN 'Punjab Kings'
    ELSE {field}
END
"""

_FORMAT_BUCKET_SQL = """
CASE
    WHEN c.name = 'Indian Premier League' THEN 'IPL'
    ELSE m.format
END
"""

GET_TEAM_H2H_TOP_SCORERS = """
    WITH innings_runs AS (
        SELECT
            d.batter_id AS player_id,
            i.match_id,
            i.innings_id,
            SUM(d.runs_batter) AS innings_runs
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE {bowling_team_sql} = %s
          AND (
              ({team1_sql} = %s AND {team2_sql} = %s)
              OR ({team1_sql} = %s AND {team2_sql} = %s)
          )
          AND (%s IS NULL OR {format_bucket_sql} = %s)
        GROUP BY d.batter_id, i.match_id, i.innings_id
    )
    SELECT
        ir.player_id,
        p.name AS player_name,
        SUM(ir.innings_runs) AS total_runs,
        COUNT(DISTINCT ir.match_id) AS matches,
        COUNT(ir.innings_id) AS innings
    FROM innings_runs ir
    JOIN players p ON p.player_id = ir.player_id
    GROUP BY ir.player_id, p.name
    ORDER BY total_runs DESC, innings DESC, player_name
    LIMIT 15
""".format(
    bowling_team_sql=_NORMALISE_TEAM_SQL.format(field="i.bowling_team"),
    team1_sql=_NORMALISE_TEAM_SQL.format(field="m.team1"),
    team2_sql=_NORMALISE_TEAM_SQL.format(field="m.team2"),
    format_bucket_sql=_FORMAT_BUCKET_SQL,
)

GET_TEAM_H2H_TOP_WICKET_TAKERS = """
    WITH bowling_spells AS (
        SELECT
            d.bowler_id AS player_id,
            i.match_id,
            COUNT(w.wicket_id) FILTER (
                WHERE w.kind NOT IN (
                    'run out', 'retired hurt',
                    'retired out', 'obstructing the field'
                )
            ) AS wickets_in_match
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE d.bowler_id IS NOT NULL
          AND {batting_team_sql} = %s
          AND (
              ({team1_sql} = %s AND {team2_sql} = %s)
              OR ({team1_sql} = %s AND {team2_sql} = %s)
          )
          AND (%s IS NULL OR {format_bucket_sql} = %s)
        GROUP BY d.bowler_id, i.match_id
    )
    SELECT
        bs.player_id,
        p.name AS player_name,
        SUM(bs.wickets_in_match) AS total_wickets,
        COUNT(DISTINCT bs.match_id) AS matches
    FROM bowling_spells bs
    JOIN players p ON p.player_id = bs.player_id
    GROUP BY bs.player_id, p.name
    HAVING SUM(bs.wickets_in_match) > 0
    ORDER BY total_wickets DESC, matches ASC, player_name
    LIMIT 15
""".format(
    batting_team_sql=_NORMALISE_TEAM_SQL.format(field="i.batting_team"),
    team1_sql=_NORMALISE_TEAM_SQL.format(field="m.team1"),
    team2_sql=_NORMALISE_TEAM_SQL.format(field="m.team2"),
    format_bucket_sql=_FORMAT_BUCKET_SQL,
)

# ── Form guide (last 10 innings) ─────────────────────────

GET_PLAYER_FORM_BATTING = """
    SELECT
        m.match_id,
        m.date::TEXT AS date,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END AS format_bucket,
        CASE
            WHEN i.batting_team != i.bowling_team
            THEN i.bowling_team
            ELSE 'Unknown'
        END AS opposition,
        m.venue,
        i.batting_team,
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
    HAVING (
        %s IS NULL OR
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END = ANY(%s)
    )
    ORDER BY m.date DESC
    LIMIT 10
"""

GET_PLAYER_FORM_BOWLING = """
    SELECT
        m.match_id,
        m.date::TEXT AS date,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END AS format_bucket,
        i.batting_team AS opposition,
        i.bowling_team AS bowling_team,
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
    HAVING (
        %s IS NULL OR
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            WHEN m.format = 'T20' AND (c.name IS NULL OR c.name NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN m.format = 'T20'  THEN 'T20'
            WHEN m.format = 'ODI'  THEN 'ODI'
            WHEN m.format = 'Test' THEN 'Test'
            ELSE m.format
        END = ANY(%s)
    )
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
    SELECT
        stat_id,
        label,
        player_name,
        player_id,
        value,
        unit,
        format_label
    FROM mv_stat_cards
    ORDER BY stat_id
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
      AND m.date >= (
          SELECT 
              CASE 
                  WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                      THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                  ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
              END
          FROM matches m2
          JOIN competitions c2 ON c2.competition_id = m2.competition_id
          WHERE c2.name = 'Indian Premier League'
      )
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
    ORDER BY SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) DESC
    LIMIT 8
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
      AND m.date >= (
          SELECT 
              CASE 
                  WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                      THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                  ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
              END
          FROM matches m2
          JOIN competitions c2 ON c2.competition_id = m2.competition_id
          WHERE c2.name = 'Indian Premier League'
      )
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND COUNT(*) FILTER (
          WHERE NOT d.is_wide AND NOT d.is_noball
      ) >= 72
    ORDER BY COUNT(w.wicket_id) FILTER (
        WHERE w.kind NOT IN (
            'run out','retired hurt',
            'retired out','obstructing the field'
        )
    ) DESC
    LIMIT 8
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
        'Pakistan Super League',
        'Caribbean Premier League',
        'SA20',
        'International League T20',
        'Major League Cricket',
        'Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League'
    )
      AND m.date >= (
          SELECT 
              CASE 
                  WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                      THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                  ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
              END
          FROM matches m2
          JOIN competitions c2 ON c2.competition_id = m2.competition_id
          WHERE c2.name IN (
              'Pakistan Super League',
              'Caribbean Premier League',
              'SA20',
              'International League T20',
              'Major League Cricket',
              'Lanka Premier League',
              'The Hundred Men''s Competition',
              'Bangladesh Premier League'
          )
      )
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
    ORDER BY SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) DESC
    LIMIT 8
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
        'Pakistan Super League',
        'Caribbean Premier League',
        'SA20',
        'International League T20',
        'Major League Cricket',
        'Lanka Premier League',
        'The Hundred Men''s Competition',
        'Bangladesh Premier League'
    )
      AND m.date >= (
          SELECT 
              CASE 
                  WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                      THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                  ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
              END
          FROM matches m2
          JOIN competitions c2 ON c2.competition_id = m2.competition_id
          WHERE c2.name IN (
              'Pakistan Super League',
              'Caribbean Premier League',
              'SA20',
              'International League T20',
              'Major League Cricket',
              'Lanka Premier League',
              'The Hundred Men''s Competition',
              'Bangladesh Premier League'
          )
      )
      AND m.gender = 'male'
    GROUP BY p.player_id, p.name, c.name
    HAVING COUNT(DISTINCT m.match_id) >= 4
      AND COUNT(*) FILTER (
          WHERE NOT d.is_wide AND NOT d.is_noball
      ) >= 72
    ORDER BY COUNT(w.wicket_id) FILTER (
        WHERE w.kind NOT IN (
            'run out','retired hurt',
            'retired out','obstructing the field'
        )
    ) DESC
    LIMIT 8
"""

GET_ON_FIRE_T20I_BATTING = """
    WITH player_innings AS (
        SELECT
            d.batter_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            m.date,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS inn_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS inn_balls,
            COUNT(w.wicket_id) AS inn_dismissals
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.batter_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        WHERE m.format = 'IT20' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'IT20' AND m2.gender = 'male'
          )
        GROUP BY d.batter_id, p.name, i.innings_id, i.match_id, m.date
    )
    SELECT
        player_id,
        player_name,
        'T20I' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_runs) AS recent_runs,
        SUM(inn_balls) AS balls_faced,
        SUM(inn_dismissals) AS dismissals,
        ROUND(SUM(inn_runs) * 100.0 / NULLIF(SUM(inn_balls), 0), 1) AS recent_sr,
        ROUND(SUM(inn_runs)::NUMERIC / NULLIF(SUM(inn_dismissals), 0), 1) AS average,
        COUNT(*) FILTER (WHERE inn_runs >= 50 AND inn_runs < 100) AS fifties,
        COUNT(*) FILTER (WHERE inn_runs >= 100) AS hundreds,
        MAX(inn_runs) AS highest_score
    FROM player_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2
      AND (SUM(inn_dismissals) = 0 OR (SUM(inn_runs)::NUMERIC / NULLIF(SUM(inn_dismissals), 0)) >= 18)
    ORDER BY SUM(inn_runs) DESC
    LIMIT 8
"""

GET_ON_FIRE_T20I_BOWLING = """
    WITH bowler_innings AS (
        SELECT
            d.bowler_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS inn_balls,
            SUM(d.runs_total) AS inn_runs_conceded,
            COUNT(w.wicket_id) FILTER (
                WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
            ) AS inn_wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.bowler_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE m.format = 'IT20' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'IT20' AND m2.gender = 'male'
          )
        GROUP BY d.bowler_id, p.name, i.innings_id, i.match_id
    )
    SELECT
        player_id,
        player_name,
        'T20I' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_balls) AS balls_bowled,
        SUM(inn_runs_conceded) AS runs_conceded,
        SUM(inn_wickets) AS wickets,
        ROUND(SUM(inn_runs_conceded) * 6.0 / NULLIF(SUM(inn_balls), 0), 2) AS recent_economy,
        ROUND(SUM(inn_runs_conceded)::NUMERIC / NULLIF(SUM(inn_wickets), 0), 2) AS bowling_average,
        COUNT(*) FILTER (WHERE inn_wickets >= 5) AS five_w
    FROM bowler_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2 AND SUM(inn_balls) >= 36
    ORDER BY SUM(inn_wickets) DESC, ROUND(SUM(inn_runs_conceded) * 6.0 / NULLIF(SUM(inn_balls), 0), 2) ASC
    LIMIT 8
"""

GET_ON_FIRE_ODI_BATTING = """
    WITH player_innings AS (
        SELECT
            d.batter_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            m.date,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS inn_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS inn_balls,
            COUNT(w.wicket_id) AS inn_dismissals
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.batter_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        WHERE m.format = 'ODI' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'ODI' AND m2.gender = 'male'
          )
        GROUP BY d.batter_id, p.name, i.innings_id, i.match_id, m.date
    )
    SELECT
        player_id,
        player_name,
        'ODI' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_runs) AS recent_runs,
        SUM(inn_balls) AS balls_faced,
        SUM(inn_dismissals) AS dismissals,
        ROUND(SUM(inn_runs) * 100.0 / NULLIF(SUM(inn_balls), 0), 1) AS recent_sr,
        ROUND(SUM(inn_runs)::NUMERIC / NULLIF(SUM(inn_dismissals), 0), 1) AS average,
        COUNT(*) FILTER (WHERE inn_runs >= 50 AND inn_runs < 100) AS fifties,
        COUNT(*) FILTER (WHERE inn_runs >= 100) AS hundreds,
        MAX(inn_runs) AS highest_score
    FROM player_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2 AND SUM(inn_runs) >= 50
    ORDER BY SUM(inn_runs) DESC
    LIMIT 8
"""

GET_ON_FIRE_ODI_BOWLING = """
    WITH bowler_innings AS (
        SELECT
            d.bowler_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS inn_balls,
            SUM(d.runs_total) AS inn_runs_conceded,
            COUNT(w.wicket_id) FILTER (
                WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
            ) AS inn_wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.bowler_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE m.format = 'ODI' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'ODI' AND m2.gender = 'male'
          )
        GROUP BY d.bowler_id, p.name, i.innings_id, i.match_id
    )
    SELECT
        player_id,
        player_name,
        'ODI' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_balls) AS balls_bowled,
        SUM(inn_runs_conceded) AS runs_conceded,
        SUM(inn_wickets) AS wickets,
        ROUND(SUM(inn_runs_conceded) * 6.0 / NULLIF(SUM(inn_balls), 0), 2) AS recent_economy,
        ROUND(SUM(inn_runs_conceded)::NUMERIC / NULLIF(SUM(inn_wickets), 0), 2) AS bowling_average,
        COUNT(*) FILTER (WHERE inn_wickets >= 5) AS five_w
    FROM bowler_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2 AND SUM(inn_balls) >= 60
    ORDER BY SUM(inn_wickets) DESC, ROUND(SUM(inn_runs_conceded)::NUMERIC / NULLIF(SUM(inn_wickets), 0), 2) ASC
    LIMIT 8
"""

GET_ON_FIRE_TEST_BATTING = """
    WITH player_innings AS (
        SELECT
            d.batter_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            m.date,
            SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) AS inn_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS inn_balls,
            COUNT(w.wicket_id) AS inn_dismissals
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.batter_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        WHERE m.format = 'Test' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'Test' AND m2.gender = 'male'
          )
        GROUP BY d.batter_id, p.name, i.innings_id, i.match_id, m.date
    )
    SELECT
        player_id,
        player_name,
        'Test' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_runs) AS recent_runs,
        SUM(inn_balls) AS balls_faced,
        SUM(inn_dismissals) AS dismissals,
        ROUND(SUM(inn_runs) * 100.0 / NULLIF(SUM(inn_balls), 0), 1) AS recent_sr,
        ROUND(SUM(inn_runs)::NUMERIC / NULLIF(SUM(inn_dismissals), 0), 1) AS average,
        COUNT(*) FILTER (WHERE inn_runs >= 50 AND inn_runs < 100) AS fifties,
        COUNT(*) FILTER (WHERE inn_runs >= 100) AS hundreds,
        MAX(inn_runs) AS highest_score
    FROM player_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2 AND SUM(inn_runs) >= 80
    ORDER BY SUM(inn_runs) DESC, COUNT(*) FILTER (WHERE inn_runs >= 100) DESC
    LIMIT 8
"""

GET_ON_FIRE_TEST_BOWLING = """
    WITH bowler_innings AS (
        SELECT
            d.bowler_id AS player_id,
            p.name AS player_name,
            i.innings_id,
            i.match_id,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS inn_balls,
            SUM(d.runs_total) AS inn_runs_conceded,
            COUNT(w.wicket_id) FILTER (
                WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
            ) AS inn_wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        JOIN players p ON p.player_id = d.bowler_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE m.format = 'Test' AND m.gender = 'male'
          AND m.date >= (
              SELECT 
                  CASE 
                      WHEN EXTRACT(MONTH FROM COALESCE(MAX(m2.date), CURRENT_DATE)) <= 3 
                          THEN COALESCE(MAX(m2.date), CURRENT_DATE) - INTERVAL '6 months'
                      ELSE DATE_TRUNC('year', COALESCE(MAX(m2.date), CURRENT_DATE))
                  END
              FROM matches m2
              WHERE m2.format = 'Test' AND m2.gender = 'male'
          )
        GROUP BY d.bowler_id, p.name, i.innings_id, i.match_id
    )
    SELECT
        player_id,
        player_name,
        'Test' AS competition,
        COUNT(DISTINCT match_id) AS recent_matches,
        SUM(inn_balls) AS balls_bowled,
        SUM(inn_runs_conceded) AS runs_conceded,
        SUM(inn_wickets) AS wickets,
        ROUND(SUM(inn_runs_conceded) * 6.0 / NULLIF(SUM(inn_balls), 0), 2) AS recent_economy,
        ROUND(SUM(inn_runs_conceded)::NUMERIC / NULLIF(SUM(inn_wickets), 0), 2) AS bowling_average,
        COUNT(*) FILTER (WHERE inn_wickets >= 5) AS five_w
    FROM bowler_innings
    GROUP BY player_id, player_name
    HAVING COUNT(DISTINCT match_id) >= 2 AND SUM(inn_balls) >= 120
    ORDER BY SUM(inn_wickets) DESC, COUNT(*) FILTER (WHERE inn_wickets >= 5) DESC, ROUND(SUM(inn_runs_conceded)::NUMERIC / NULLIF(SUM(inn_wickets), 0), 2) ASC
    LIMIT 8
"""

GET_ON_FIRE_INTERNATIONAL_BATTING = GET_ON_FIRE_T20I_BATTING
GET_ON_FIRE_INTERNATIONAL_BOWLING = GET_ON_FIRE_T20I_BOWLING


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
    HAVING SUM(balls) >= 20
    ORDER BY (
        EXTRACT(DOY FROM CURRENT_DATE)::BIGINT *
        ABS(HASHTEXT(batter_id || bowler_id)::BIGINT)
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
    WHERE format_bucket IN ('T20I', 'IT20')
    GROUP BY batter_id, batter_name, bowler_id, bowler_name
    HAVING SUM(balls) >= 20
    ORDER BY (
        EXTRACT(DOY FROM CURRENT_DATE)::BIGINT *
        ABS(HASHTEXT(batter_id || bowler_id)::BIGINT)
    ) % 10000
    LIMIT 1
"""

# ── Feature 1: Top Scorers & Bowlers in Team Matchups ────

GET_H2H_TOP_BATTERS = """
    WITH innings_runs AS (
        SELECT
            d.batter_id,
            i.innings_id,
            SUM(d.runs_batter) AS innings_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls_faced
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE (
            (normalise_team(m.team1) = %s AND normalise_team(m.team2) = %s)
            OR (normalise_team(m.team1) = %s AND normalise_team(m.team2) = %s)
        )
        AND (%s IS NULL OR CASE WHEN c.name = 'Indian Premier League' THEN 'IPL' ELSE m.format END = %s)
        GROUP BY d.batter_id, i.innings_id
    )
    SELECT
        ir.batter_id AS player_id,
        p.name AS player_name,
        SUM(ir.innings_runs) AS runs,
        COUNT(ir.innings_id) AS innings,
        ROUND(SUM(ir.innings_runs)::NUMERIC / NULLIF(COUNT(ir.innings_id), 0), 2) AS average,
        ROUND(SUM(ir.innings_runs)::NUMERIC * 100.0 / NULLIF(SUM(ir.balls_faced), 0), 2) AS strike_rate,
        MAX(ir.innings_runs) AS highest_score,
        COUNT(*) FILTER (WHERE ir.innings_runs >= 50 AND ir.innings_runs < 100) AS fifties,
        COUNT(*) FILTER (WHERE ir.innings_runs >= 100) AS hundreds
    FROM innings_runs ir
    JOIN players p ON p.player_id = ir.batter_id
    GROUP BY ir.batter_id, p.name
    ORDER BY runs DESC
    LIMIT 15
"""

GET_H2H_TOP_BOWLERS = """
    WITH innings_bowling AS (
        SELECT
            d.bowler_id,
            i.innings_id,
            COUNT(w.wicket_id) AS wickets_in_innings,
            SUM(d.runs_total) AS runs_in_innings,
            COUNT(*) AS balls_in_innings
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE (
            (normalise_team(m.team1) = %s AND normalise_team(m.team2) = %s)
            OR (normalise_team(m.team1) = %s AND normalise_team(m.team2) = %s)
        )
        AND (%s IS NULL OR CASE WHEN c.name = 'Indian Premier League' THEN 'IPL' ELSE m.format END = %s)
        AND d.bowler_id IS NOT NULL
        GROUP BY d.bowler_id, i.innings_id
    ),
    best_bowling_figures AS (
        SELECT
            bowler_id,
            wickets_in_innings,
            runs_in_innings,
            ROW_NUMBER() OVER (PARTITION BY bowler_id ORDER BY wickets_in_innings DESC, runs_in_innings ASC) AS rn
        FROM innings_bowling
    )
    SELECT
        ib.bowler_id AS player_id,
        p.name AS player_name,
        SUM(ib.wickets_in_innings) AS wickets,
        COUNT(ib.innings_id) AS innings_bowled,
        ROUND((SUM(ib.runs_in_innings)::NUMERIC * 6.0) / NULLIF(SUM(ib.balls_in_innings), 0), 2) AS economy,
        ROUND(SUM(ib.runs_in_innings)::NUMERIC / NULLIF(SUM(ib.wickets_in_innings), 0), 2) AS bowling_average,
        ROUND(SUM(ib.balls_in_innings)::NUMERIC / NULLIF(SUM(ib.wickets_in_innings), 0), 2) AS strike_rate,
        COALESCE(
            (SELECT CONCAT(wickets_in_innings, '/', runs_in_innings)
             FROM best_bowling_figures bbf
             WHERE bbf.bowler_id = ib.bowler_id AND bbf.rn = 1),
            '0/0'
        ) AS best_bowling
    FROM innings_bowling ib
    JOIN players p ON p.player_id = ib.bowler_id
    GROUP BY ib.bowler_id, p.name
    HAVING SUM(ib.wickets_in_innings) > 0
    ORDER BY wickets DESC
    LIMIT 15
"""

# ── Feature 5: On This Day in Cricket ────────────────────────

GET_ON_THIS_DAY = """
    SELECT
        match_id,
        date::TEXT,
        team1,
        team2,
        winner,
        venue,
        format
    FROM matches
    WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM date) = EXTRACT(DAY FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM date) < EXTRACT(YEAR FROM CURRENT_DATE)
      AND is_official = true
    ORDER BY date DESC
    LIMIT 20
"""

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

# ── Matches search / browse ──────────────────────────────────

SEARCH_MATCHES = """
    SELECT
        m.match_id,
        TO_CHAR(m.date, 'YYYY-MM-DD') AS date,
        m.team1,
        m.team2,
        m.winner,
        m.venue,
        m.city,
        CASE
            WHEN c.name = 'Indian Premier League' THEN 'IPL'
            WHEN m.format = 'IT20' THEN 'T20I'
            ELSE m.format
        END AS format,
        c.name AS competition,
        m.win_by_runs,
        m.win_by_wickets,
        m.match_stage,
        COALESCE(v.country, 'Unknown') AS host_country
    FROM matches m
    LEFT JOIN competitions c ON m.competition_id = c.competition_id
    LEFT JOIN venues v ON m.venue_id = v.venue_id
    WHERE
        (%s IS NULL OR m.team1 = %s OR m.team2 = %s)
        AND (%s IS NULL OR (m.team1 = %s AND m.team2 = %s) OR (m.team1 = %s AND m.team2 = %s))
        AND (%s IS NULL OR
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END = ANY(%s))
        AND (%s IS NULL OR c.name ILIKE %s)
        AND (%s IS NULL OR EXTRACT(YEAR FROM m.date) = %s)
        AND (%s IS NULL OR m.match_id IN (
            SELECT DISTINCT i.match_id
            FROM innings i
            JOIN deliveries d ON d.innings_id = i.innings_id
            WHERE d.batter_id = %s OR d.bowler_id = %s
        ))
        AND m.is_official = true
    ORDER BY m.date DESC
    LIMIT 200 OFFSET %s
"""

SEARCH_MATCHES_COUNT = """
    SELECT COUNT(*) AS total
    FROM matches m
    LEFT JOIN competitions c ON m.competition_id = c.competition_id
    WHERE
        (%s IS NULL OR m.team1 = %s OR m.team2 = %s)
        AND (%s IS NULL OR (m.team1 = %s AND m.team2 = %s) OR (m.team1 = %s AND m.team2 = %s))
        AND (%s IS NULL OR
            CASE
                WHEN c.name = 'Indian Premier League' THEN 'IPL'
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20'  THEN 'T20'
                WHEN m.format = 'ODI'  THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format
            END = ANY(%s))
        AND (%s IS NULL OR c.name ILIKE %s)
        AND (%s IS NULL OR EXTRACT(YEAR FROM m.date) = %s)
        AND (%s IS NULL OR m.match_id IN (
            SELECT DISTINCT i.match_id
            FROM innings i
            JOIN deliveries d ON d.innings_id = i.innings_id
            WHERE d.batter_id = %s OR d.bowler_id = %s
        ))
        AND m.is_official = true
"""

SEARCH_COMPETITIONS = """
    SELECT DISTINCT name
    FROM competitions
    WHERE name ILIKE %s
    ORDER BY name
    LIMIT 20
"""

# ── Team Dashboard ─────────────────────────────────────────────

GET_TEAM_DASHBOARD_KPI = """
    WITH team_matches_stats AS (
        SELECT 
            m.match_id,
            m.winner,
            m.team1,
            m.team2,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            (SELECT SUM(runs_total) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.batting_team = %s) AS team_match_runs,
            (SELECT COUNT(*) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.batting_team = %s AND NOT d.is_wide AND NOT d.is_noball) AS team_match_balls,
            (SELECT SUM(runs_total) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.bowling_team = %s) AS opp_match_runs,
            (SELECT COUNT(*) FROM deliveries d JOIN innings i USING (innings_id) WHERE i.match_id = m.match_id AND i.bowling_team = %s AND NOT d.is_wide AND NOT d.is_noball) AS opp_match_balls
        FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE m.team1 = %s OR m.team2 = %s
    ),
    team_innings_stats AS (
        SELECT 
            i.match_id,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            SUM(d.runs_total) AS innings_runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS innings_balls,
            COUNT(w.wicket_id) AS wickets
        FROM innings i
        JOIN matches m ON m.match_id = i.match_id
        JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.batting_team = %s
        GROUP BY i.match_id, i.innings_id, format_bucket
    )
    SELECT
        COUNT(*)::int AS matches_played,
        COUNT(*) FILTER (WHERE winner = %s)::int AS won,
        COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != %s AND winner IN (team1, team2))::int AS lost,
        COUNT(*) FILTER (WHERE winner IS NULL OR winner NOT IN (team1, team2))::int AS no_result,
        0::int AS tied,
        ROUND(COUNT(*) FILTER (WHERE winner = %s) * 100.0 / NULLIF(COUNT(*), 0), 2)::float AS win_percentage,
        ROUND(SUM(team_match_runs) * 6.0 / NULLIF(SUM(team_match_balls), 0), 2)::float AS avg_runs_per_over,
        ROUND(SUM(opp_match_runs) * 6.0 / NULLIF(SUM(opp_match_balls), 0), 2)::float AS avg_runs_conceded_per_over,
        (SELECT MAX(innings_runs) FROM team_innings_stats WHERE (%s IS NULL OR format_bucket = ANY(%s)))::int AS highest_score,
        COALESCE(
            (SELECT MIN(innings_runs) FROM team_innings_stats WHERE wickets >= 10 AND (%s IS NULL OR format_bucket = ANY(%s))),
            (SELECT MIN(innings_runs) FROM team_innings_stats WHERE (%s IS NULL OR format_bucket = ANY(%s)) AND innings_balls > 30)
        )::int AS lowest_score
    FROM team_matches_stats
    WHERE (%s IS NULL OR format_bucket = ANY(%s))
"""

GET_TEAM_TOP_SCORERS = """
    WITH innings_scores AS (
        SELECT
            d.batter_id AS player_id,
            i.innings_id,
            i.match_id,
            SUM(d.runs_batter) AS runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
            MAX(CASE WHEN w.wicket_id IS NOT NULL AND w.player_out_id = d.batter_id THEN 1 ELSE 0 END) AS was_dismissed
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        WHERE i.batting_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY d.batter_id, i.innings_id, i.match_id
    )
    SELECT
        s.player_id,
        p.name AS player_name,
        SUM(s.runs)::int AS runs,
        COUNT(s.innings_id)::int AS innings,
        ROUND(SUM(s.runs)::numeric / NULLIF(SUM(s.was_dismissed), 0), 2)::float AS average,
        ROUND(SUM(s.runs) * 100.0 / NULLIF(SUM(s.balls), 0), 2)::float AS strike_rate,
        MAX(s.runs)::int AS highest_score,
        COUNT(*) FILTER (WHERE s.runs >= 50 AND s.runs < 100)::int AS fifties,
        COUNT(*) FILTER (WHERE s.runs >= 100)::int AS hundreds
    FROM innings_scores s
    JOIN players p ON p.player_id = s.player_id
    GROUP BY s.player_id, p.name
    ORDER BY runs DESC
    LIMIT 20
"""

GET_TEAM_TOP_BOWLERS = """
    WITH bowling_agg AS (
        SELECT
            d.bowler_id,
            i.innings_id,
            SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs_conceded,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS legal_balls,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.bowling_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY d.bowler_id, i.innings_id
    )
    SELECT
        ba.bowler_id AS player_id,
        p.name AS player_name,
        SUM(ba.wickets)::int AS wickets,
        COUNT(ba.innings_id)::int AS innings_bowled,
        ROUND(SUM(ba.runs_conceded) * 6.0 / NULLIF(SUM(ba.legal_balls), 0), 2)::float AS economy,
        ROUND(SUM(ba.runs_conceded)::numeric / NULLIF(SUM(ba.wickets), 0), 2)::float AS bowling_average,
        ROUND(SUM(ba.legal_balls)::numeric / NULLIF(SUM(ba.wickets), 0), 2)::float AS strike_rate,
        (SELECT CONCAT(wickets, '/', runs_conceded) FROM bowling_agg ba2 WHERE ba2.bowler_id = ba.bowler_id ORDER BY wickets DESC, runs_conceded ASC LIMIT 1) AS best_bowling
    FROM bowling_agg ba
    JOIN players p ON p.player_id = ba.bowler_id
    GROUP BY ba.bowler_id, p.name
    ORDER BY wickets DESC
    LIMIT 20
"""

GET_TEAM_RECENT_MATCHES_SINGLE = """
    SELECT match_id, date, venue, city, match_country, format_bucket,
         batting_first, bowling_first,
         winner, win_by_runs, win_by_wickets,
         match_stage,
         first_innings_score
    FROM mv_team_recent_matches
    WHERE (team_a = %s OR team_b = %s)
      AND (%s IS NULL OR format_bucket = ANY(%s))
    ORDER BY date DESC
    LIMIT 15
"""

GET_TEAM_VENUE_PERFORMANCE = """
    WITH venue_matches AS (
        SELECT
            m.venue,
            m.match_id,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            m.winner,
            SUM(d.runs_total) FILTER (WHERE i.batting_team = %s) AS team_total
        FROM matches m
        JOIN innings i ON i.match_id = m.match_id
        JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE i.batting_team = %s
        GROUP BY m.venue, m.match_id, format_bucket, m.winner
    )
    SELECT
        venue,
        format_bucket AS format,
        COUNT(*)::int AS matches_played,
        ROUND(AVG(team_total), 1)::float AS avg_first_innings_score,
        NULL::float AS avg_second_innings_score,
        MAX(team_total)::int AS highest_team_total,
        MIN(team_total)::int AS lowest_team_total,
        ROUND(COUNT(*) FILTER (WHERE winner = %s) * 100.0 / NULLIF(COUNT(*), 0), 1)::float AS chasing_win_pct
    FROM venue_matches
    WHERE (%s IS NULL OR format_bucket = ANY(%s))
    GROUP BY venue, format_bucket
    HAVING COUNT(*) >= 5
    ORDER BY chasing_win_pct DESC, matches_played DESC
    LIMIT 10
"""

GET_TEAM_BATTING_PHASES = """
    WITH phase_stats AS (
        SELECT
            CASE
                WHEN m.format = 'ODI' THEN
                    CASE
                        WHEN d.over_number < 10 THEN 'Powerplay'
                        WHEN d.over_number < 40 THEN 'Middle'
                        ELSE 'Death'
                    END
                ELSE
                    CASE
                        WHEN d.over_number < 6 THEN 'Powerplay'
                        WHEN d.over_number < 15 THEN 'Middle'
                        ELSE 'Death'
                    END
            END AS phase,
            SUM(d.runs_batter) AS runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide) AS balls,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.batting_team = %s
          AND (
            (%s IS NULL AND m.format IN ('ODI', 'T20', 'IT20')) OR 
            (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s)
          )
        GROUP BY 1
    )
    SELECT
        ROUND(MAX(runs) FILTER (WHERE phase = 'Powerplay')::numeric / NULLIF(MAX(wickets) FILTER (WHERE phase = 'Powerplay'), 0), 2)::float AS powerplay_avg,
        ROUND(MAX(runs) FILTER (WHERE phase = 'Powerplay')::numeric * 100.0 / NULLIF(MAX(balls) FILTER (WHERE phase = 'Powerplay'), 0), 2)::float AS powerplay_sr,
        ROUND(MAX(runs) FILTER (WHERE phase = 'Middle')::numeric / NULLIF(MAX(wickets) FILTER (WHERE phase = 'Middle'), 0), 2)::float AS middle_avg,
        ROUND(MAX(runs) FILTER (WHERE phase = 'Middle')::numeric * 100.0 / NULLIF(MAX(balls) FILTER (WHERE phase = 'Middle'), 0), 2)::float AS middle_sr,
        ROUND(MAX(runs) FILTER (WHERE phase = 'Death')::numeric / NULLIF(MAX(wickets) FILTER (WHERE phase = 'Death'), 0), 2)::float AS death_avg,
        ROUND(MAX(runs) FILTER (WHERE phase = 'Death')::numeric * 100.0 / NULLIF(MAX(balls) FILTER (WHERE phase = 'Death'), 0), 2)::float AS death_sr
    FROM phase_stats
    -- GROUP BY phase is handled in subquery; outer query just aggregates
"""

GET_TEAM_BATTING_SPLITS = """
    WITH split_stats AS (
        SELECT
            m.match_id,
            v.country AS match_country,
            CASE WHEN m.team1 = %s THEN t2.country ELSE t1.country END AS opponent_country,
            SUM(d.runs_batter) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN venues v ON v.venue_id = m.venue_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN teams t1 ON t1.canonical_name = m.team1
        LEFT JOIN teams t2 ON t2.canonical_name = m.team2
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.batting_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format IN ('IT20', 'T20') THEN 'T20I'
                WHEN m.format IN ('ODM', 'ODI') THEN 'ODI'
                WHEN m.format IN ('MDM', 'Test') THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY m.match_id, v.country, opponent_country
    )
    SELECT
        ROUND(SUM(runs) FILTER (WHERE match_country = %s)::numeric / NULLIF(SUM(wickets) FILTER (WHERE match_country = %s), 0), 2)::float AS home_avg,
        ROUND(SUM(runs) FILTER (WHERE match_country = opponent_country AND match_country != %s)::numeric / NULLIF(SUM(wickets) FILTER (WHERE match_country = opponent_country AND match_country != %s), 0), 2)::float AS away_avg,
        ROUND(SUM(runs) FILTER (WHERE match_country != %s AND match_country != opponent_country AND match_country IS NOT NULL)::numeric / NULLIF(SUM(wickets) FILTER (WHERE match_country != %s AND match_country != opponent_country AND match_country IS NOT NULL), 0), 2)::float AS neutral_avg
    FROM split_stats
"""

GET_TEAM_BOWLING_SPLITS = """
    WITH split_stats AS (
        SELECT
            m.match_id,
            i.innings_number,
            SUM(d.runs_total) FILTER (WHERE NOT d.is_bye AND NOT d.is_legbye) AS runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')) AS wickets,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS balls
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE i.bowling_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY m.match_id, i.innings_number
    )
    SELECT
        ROUND(SUM(runs)::numeric / NULLIF(SUM(wickets), 0), 2)::float AS bowling_avg,
        ROUND(SUM(runs)::numeric * 6.0 / NULLIF(SUM(balls), 0), 2)::float AS bowling_economy,
        ROUND(SUM(runs) FILTER (WHERE innings_number = 1)::numeric / NULLIF(SUM(wickets) FILTER (WHERE innings_number = 1), 0), 2)::float AS innings1_avg,
        ROUND(SUM(runs) FILTER (WHERE innings_number = 2)::numeric / NULLIF(SUM(wickets) FILTER (WHERE innings_number = 2), 0), 2)::float AS innings2_avg
    FROM split_stats
"""

GET_TEAM_H2H_SUMMARY = """
    SELECT
        CASE WHEN team1 = %s THEN team2 ELSE team1 END AS opposition,
        COUNT(*)::int AS played,
        COUNT(*) FILTER (WHERE winner = %s)::int AS won,
        COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != %s AND winner IN (team1, team2))::int AS lost,
        COUNT(*) FILTER (WHERE winner IS NULL OR winner NOT IN (team1, team2))::int AS draw_nr
    FROM matches m
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE (team1 = %s OR team2 = %s)
      AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
    GROUP BY 1
    ORDER BY played DESC
    LIMIT 10
"""

GET_TEAM_ALL_TIME_RECORDS = """
    WITH bat_records AS (
        SELECT p.name, SUM(d.runs_batter) as total_runs
        FROM deliveries d
        JOIN players p ON p.player_id = d.batter_id
        JOIN innings i USING (innings_id)
        JOIN matches m USING (match_id)
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE i.batting_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY p.player_id, p.name
        ORDER BY total_runs DESC
        LIMIT 1
    ),
    bowl_records AS (
        SELECT p.name, COUNT(*) as total_wickets
        FROM wickets w
        JOIN deliveries d USING (delivery_id)
        JOIN players p ON p.player_id = d.bowler_id
        JOIN innings i USING (innings_id)
        JOIN matches m USING (match_id)
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE i.bowling_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
          AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
        GROUP BY p.player_id, p.name
        ORDER BY total_wickets DESC
        LIMIT 1
    ),
    score_records AS (
        SELECT m.match_id, SUM(d.runs_total) as runs, CASE WHEN m.team1 = %s THEN m.team2 ELSE m.team1 END as opposition
        FROM deliveries d
        JOIN innings i USING (innings_id)
        JOIN matches m USING (match_id)
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE i.batting_team = %s
          AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
        GROUP BY m.match_id, m.team1, m.team2
        ORDER BY runs DESC
        LIMIT 1
    )
    SELECT
        (SELECT name FROM bat_records) as most_runs_player,
        (SELECT total_runs FROM bat_records) as most_runs_value,
        (SELECT name FROM bowl_records) as most_wickets_player,
        (SELECT total_wickets FROM bowl_records) as most_wickets_value,
        (SELECT CONCAT(runs, ' vs ', opposition) FROM score_records) as highest_total
"""

GET_TEAM_SEASON_PERFORMANCE = """
    SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        COUNT(*)::int AS played,
        COUNT(*) FILTER (WHERE winner = %s)::int AS won
    FROM matches m
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE (team1 = %s OR team2 = %s)
      AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
    GROUP BY 1
    ORDER BY year DESC
    LIMIT 15
"""

GET_TEAM_ACHIEVEMENTS = """
    SELECT DISTINCT 
        c.name as comp_name, 
        EXTRACT(YEAR FROM m.date)::int as year,
        CASE 
            WHEN m.winner = %s AND LOWER(m.match_stage) = 'final' THEN 'Winner'
            WHEN LOWER(m.match_stage) = 'final' THEN 'Runner-up'
            WHEN LOWER(m.match_stage) IN ('semi-final', 'semi final', 'sf', 'eliminator', 'qualifier') THEN 'Semi-final'
            WHEN LOWER(m.match_stage) IN ('quarter-final', 'quarter final', 'qf') THEN 'Quarter-final'
            ELSE 'Participant'
        END AS stage
    FROM matches m
    JOIN competitions c ON c.competition_id = m.competition_id
    WHERE (m.team1 = %s OR m.team2 = %s)
      AND (%s IS NULL OR (CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END) = ANY(%s))
      AND (
          LOWER(m.match_stage) IN ('final', 'semi-final', 'semi final', 'sf', 'quarter-final', 'quarter final', 'qf', 'eliminator', 'qualifier')
      )
      AND (
          c.name ILIKE '%%World Cup%%' 
          OR c.name ILIKE '%%Champions Trophy%%' 
          OR c.name ILIKE '%%World Test Championship%%' 
          OR c.name ILIKE '%%Asia Cup%%'
          OR c.name ILIKE '%%Indian Premier League%%'
          OR c.name ILIKE '%%IPL%%'
      )
    ORDER BY year DESC
"""

GET_TEAM_AVAILABLE_FORMATS = """
    SELECT DISTINCT
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END AS format_bucket
    FROM matches m
    LEFT JOIN competitions c ON c.competition_id = m.competition_id
    WHERE m.team1 = %s OR m.team2 = %s
    ORDER BY format_bucket
"""

GET_TEAM_TARGET_RECORDS = """
    WITH first_innings AS (
        SELECT
            m.match_id,
            CASE 
                WHEN c.name = 'Indian Premier League' THEN 'IPL' 
                WHEN m.format = 'IT20' THEN 'T20I'
                WHEN m.format = 'T20' THEN 'T20'
                WHEN m.format = 'ODI' THEN 'ODI'
                WHEN m.format = 'Test' THEN 'Test'
                ELSE m.format 
            END AS format_bucket,
            m.winner,
            m.team1,
            m.team2,
            i.batting_team,
            SUM(d.runs_total) AS runs
        FROM innings i
        JOIN matches m ON m.match_id = i.match_id
        JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE i.batting_team = %s
          AND i.innings_number = 1
        GROUP BY m.match_id, format_bucket, m.winner, m.team1, m.team2, i.batting_team
    ),
    filtered AS (
        SELECT *
        FROM first_innings
        WHERE (
            (%s IS NULL AND format_bucket IN ('ODI', 'T20', 'T20I', 'IPL'))
            OR (%s IS NOT NULL AND format_bucket = ANY(%s))
        )
    )
    SELECT
        MIN(runs) FILTER (WHERE winner = %s)::int AS lowest_target_defended,
        MAX(runs) FILTER (WHERE winner IS NOT NULL AND winner != %s AND winner IN (team1, team2))::int AS highest_target_conceded
    FROM filtered
"""

# ── Dynamic Homepage Spotlight & Champion Queries ────────────────

GET_ACTIVE_TOURNAMENT = """
    WITH latest_overall AS (
        SELECT COALESCE(MAX(date), CURRENT_DATE) as max_date FROM matches
    ),
    recent_competitions AS (
        SELECT 
            c.competition_id, 
            c.name, 
            m.season, 
            MAX(m.date) as latest_match_date
        FROM matches m
        JOIN competitions c ON m.competition_id = c.competition_id
        CROSS JOIN latest_overall lo
        WHERE m.date >= lo.max_date - INTERVAL '30 days'
          AND (
             c.name ILIKE '%League%' OR 
             c.name ILIKE '%Cup%' OR 
             c.name = 'The Hundred Men''s Competition' OR
             c.name = 'SA20'
          )
        GROUP BY c.competition_id, c.name, m.season
        ORDER BY latest_match_date DESC
        LIMIT 1
    ),
    fallback_competition AS (
        SELECT 
            c.competition_id, 
            c.name, 
            m.season,
            MAX(m.date) as latest_match_date
        FROM matches m
        JOIN competitions c ON m.competition_id = c.competition_id
        WHERE (
             c.name ILIKE '%League%' OR 
             c.name ILIKE '%Cup%' OR 
             c.name = 'The Hundred Men''s Competition' OR
             c.name = 'SA20'
          )
        GROUP BY c.competition_id, c.name, m.season
        ORDER BY latest_match_date DESC
        LIMIT 1
    )
    SELECT competition_id, name, season FROM recent_competitions
    UNION ALL
    SELECT competition_id, name, season FROM fallback_competition
    LIMIT 1
"""

GET_TOURNAMENT_POINTS_TABLE = """
    WITH target_matches AS (
        SELECT m.match_id, m.format, m.winner, m.team1, m.team2, m.win_by_runs, m.date
        FROM matches m
        WHERE m.competition_id = %s AND m.season = %s
          AND (m.match_stage IS NULL OR m.match_stage NOT IN ('Final', 'Semi Final', 'Eliminator', 'Qualifier 1', 'Qualifier 2', 'Challenger', 'Elimination Final', '3rd Place Play-Off', 'Quarter Final', 'Qualifier'))
    ),
    match_teams AS (
        SELECT m.match_id, m.team1 AS team, m.team2 AS opposition, m.winner, m.date
        FROM target_matches m
        UNION ALL
        SELECT m.match_id, m.team2 AS team, m.team1 AS opposition, m.winner, m.date
        FROM target_matches m
    ),
    team_stats AS (
        SELECT 
            team,
            COUNT(*) AS played,
            COUNT(*) FILTER (WHERE winner = team) AS won,
            COUNT(*) FILTER (WHERE winner != team AND winner NOT IN ('no result', 'tie') AND winner IS NOT NULL) AS lost,
            COUNT(*) FILTER (WHERE winner = 'tie' OR winner = 'no result' OR winner IS NULL) AS no_result
        FROM match_teams
        GROUP BY team
    ),
    match_with_rownum AS (
        SELECT 
            mt.team,
            CASE 
                WHEN mt.winner = mt.team THEN 'W'
                WHEN mt.winner IN ('tie', 'no result') OR mt.winner IS NULL THEN 'N'
                ELSE 'L'
            END AS outcome,
            ROW_NUMBER() OVER (PARTITION BY mt.team ORDER BY mt.date DESC) as rn
        FROM match_teams mt
    ),
    team_form AS (
        SELECT 
            team,
            STRING_AGG(outcome, ',' ORDER BY rn DESC) as form_string
        FROM match_with_rownum
        WHERE rn <= 5
        GROUP BY team
    ),
    actual_innings AS (
        SELECT 
            i.match_id,
            i.innings_number,
            i.batting_team AS team,
            i.bowling_team AS opposition,
            COALESCE(SUM(d.runs_total), 0) AS runs,
            COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball) AS balls,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('retired hurt', 'retired not out')) AS wickets
        FROM innings i
        JOIN target_matches tm USING (match_id)
        LEFT JOIN deliveries d USING (innings_id)
        LEFT JOIN wickets w USING (delivery_id)
        WHERE i.innings_number <= 2
          AND tm.winner IS NOT NULL AND tm.winner != 'no result'
        GROUP BY i.match_id, i.innings_number, i.batting_team, i.bowling_team
    ),
    match_dls_info AS (
        SELECT 
            tm.match_id,
            tm.win_by_runs,
            ai1.runs AS runs1,
            ai1.balls AS balls1,
            ai2.runs AS runs2,
            ai2.balls AS balls2,
            CASE 
                WHEN tm.win_by_runs IS NOT NULL AND tm.win_by_runs != ABS(COALESCE(ai1.runs, 0) - COALESCE(ai2.runs, 0)) THEN TRUE
                ELSE FALSE
            END AS is_dls
        FROM target_matches tm
        LEFT JOIN actual_innings ai1 ON tm.match_id = ai1.match_id AND ai1.innings_number = 1
        LEFT JOIN actual_innings ai2 ON tm.match_id = ai2.match_id AND ai2.innings_number = 2
    ),
    adjusted_innings_runs AS (
        SELECT 
            ai.match_id,
            ai.innings_number,
            ai.team,
            ai.opposition,
            CASE 
                WHEN dls.is_dls AND ai.innings_number = 1 THEN dls.runs2 + dls.win_by_runs
                ELSE ai.runs
            END AS runs_scored,
            CASE 
                WHEN dls.is_dls AND ai.innings_number = 1 THEN dls.balls2
                ELSE ai.balls
            END AS balls_faced,
            ai.wickets AS wickets_lost
        FROM actual_innings ai
        JOIN match_dls_info dls ON ai.match_id = dls.match_id
    ),
    team_batting AS (
        SELECT
            team,
            SUM(runs_scored) AS runs_scored,
            SUM(
                CASE 
                    WHEN wickets_lost = 10 AND format = 'T20' THEN 120
                    WHEN wickets_lost = 10 AND format = 'ODI' THEN 300
                    ELSE balls_faced
                END
            ) AS balls_faced
        FROM adjusted_innings_runs
        JOIN target_matches USING (match_id)
        GROUP BY team
    ),
    team_bowling AS (
        SELECT
            opposition AS team,
            SUM(runs_scored) AS runs_conceded,
            SUM(
                CASE 
                    WHEN wickets_lost = 10 AND format = 'T20' THEN 120
                    WHEN wickets_lost = 10 AND format = 'ODI' THEN 300
                    ELSE balls_faced
                END
            ) AS balls_bowled
        FROM adjusted_innings_runs
        JOIN target_matches USING (match_id)
        GROUP BY opposition
    )
    SELECT 
        ts.team,
        ts.played,
        ts.won,
        ts.lost,
        ts.no_result,
        (ts.won * 2 + ts.no_result * 1) AS points,
        CASE 
            WHEN COALESCE(tb.balls_faced, 0) > 0 AND COALESCE(tbo.balls_bowled, 0) > 0 THEN
                ROUND(
                    ((tb.runs_scored::numeric / (tb.balls_faced / 6.0)) - 
                     (tbo.runs_conceded::numeric / (tbo.balls_bowled / 6.0)))::numeric,
                    3
                )
            ELSE 0.000
        END AS nrr,
        COALESCE(tf.form_string, '') AS form_string
    FROM team_stats ts
    LEFT JOIN team_form tf ON ts.team = tf.team
    LEFT JOIN team_batting tb ON ts.team = tb.team
    LEFT JOIN team_bowling tbo ON ts.team = tbo.team
    ORDER BY points DESC, nrr DESC
"""

GET_RECENT_CHAMPION = """
    WITH final_match AS (
        SELECT 
            m.match_id, 
            m.winner, 
            c.name AS tournament, 
            m.season,
            m.win_by_runs,
            m.win_by_wickets,
            m.player_of_match AS player_of_final,
            m.competition_id
        FROM matches m
        JOIN competitions c ON m.competition_id = c.competition_id
        WHERE (
             c.name ILIKE '%World Cup%' OR 
             c.name ILIKE '%World Twenty20%' OR 
             c.name ILIKE '%Champions Trophy%' OR
             c.name ILIKE '%League%' OR 
             c.name ILIKE '%Cup%' OR 
             c.name = 'The Hundred Men''s Competition' OR
             c.name = 'SA20'
          )
          AND m.match_stage = 'Final'
          AND m.winner IS NOT NULL
        ORDER BY m.date DESC
        LIMIT 1
    ),
    champion_record AS (
        SELECT 
            COUNT(*) AS played,
            COUNT(*) FILTER (WHERE m.winner = fm.winner) AS won
        FROM matches m
        JOIN final_match fm ON m.competition_id = fm.competition_id AND m.season = fm.season
        WHERE m.team1 = fm.winner OR m.team2 = fm.winner
    ),
    bowler_spell AS (
        SELECT 
            d.bowler_id,
            p.name AS bowler_name,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')) AS wickets,
            COALESCE(SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball), 0) + 
            COALESCE(SUM(d.runs_extras) FILTER (WHERE d.is_wide OR d.is_noball), 0) AS runs
        FROM deliveries d
        JOIN final_match fm ON d.innings_id IN (SELECT innings_id FROM innings WHERE match_id = fm.match_id)
        JOIN players p ON d.bowler_id = p.player_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        GROUP BY d.bowler_id, p.name
        ORDER BY wickets DESC, runs ASC
        LIMIT 1
    )
    SELECT 
        fm.winner,
        fm.tournament,
        fm.season,
        'Won ' || cr.won || '/' || cr.played || ' matches' AS record,
        CASE 
            WHEN fm.win_by_runs IS NOT NULL THEN fm.win_by_runs || ' runs'
            WHEN fm.win_by_wickets IS NOT NULL THEN fm.win_by_wickets || ' wickets'
            ELSE 'Super Over'
        END AS final_margin,
        fm.player_of_final,
        (SELECT bowler_name || ' ' || wickets || '/' || runs FROM bowler_spell) AS best_bowling,
        'The pinnacle of global cricket excellence.' AS tagline
    FROM final_match fm
    CROSS JOIN champion_record cr
"""

GET_FEATURED_RIVALRIES = """
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
    GROUP BY batter_id, batter_name, bowler_id, bowler_name
    HAVING SUM(balls) >= 20
    ORDER BY (
        (EXTRACT(DOY FROM CURRENT_DATE)::BIGINT + 17) *
        ABS(HASHTEXT(batter_id || bowler_id || 'featured')::BIGINT)
    ) % 10000
    LIMIT 3
"""

