"""
Dynamic SQL query builder for the Stat Builder module.

Assembles parameterised SQL from filter payloads. All user-supplied values
are passed as parameters (%s) — never interpolated into the query string.
"""

from __future__ import annotations
from api.models import StatBuilderRequest


def normalize_formats(req: StatBuilderRequest):
    if req.formats:
        expanded = []
        for f in req.formats:
            if f == "T20":
                expanded.extend(["T20", "T20I", "IPL"])
            else:
                expanded.append(f)
        req.formats = list(dict.fromkeys(expanded))

def GET_FORMAT_BUCKET_SQL(comp_col: str = "c.name", format_col: str = "m.format") -> str:
    return f"""
        CASE
            WHEN {comp_col} = 'Indian Premier League' THEN 'IPL'
            WHEN {format_col} = 'IT20' THEN 'T20I'
            WHEN {format_col} = 'T20' AND ({comp_col} IS NULL OR {comp_col} NOT IN ('Indian Premier League', 'SA20', 'The Hundred Men''s Competition', 'International League T20', 'Major League Cricket')) THEN 'T20I'
            WHEN {format_col} = 'T20'  THEN 'T20'
            WHEN {format_col} = 'ODI'  THEN 'ODI'
            WHEN {format_col} = 'Test' THEN 'Test'
            ELSE {format_col}
        END
    """

FORMAT_BUCKET_EXPR = GET_FORMAT_BUCKET_SQL()

# ── Common CTEs for Venue Intelligence ──────────────────────

IPL_TEAM_VENUES_CTE = """
    ipl_team_venues AS (
        SELECT 'Royal Challengers Bengaluru' AS team, 'Bengaluru' AS city, 'Chinnaswamy' AS venue UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Wankhede' UNION ALL
        SELECT 'Mumbai Indians', 'Mumbai', 'Brabourne' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'Chidambaram' UNION ALL
        SELECT 'Chennai Super Kings', 'Chennai', 'Chepauk' UNION ALL
        SELECT 'Chennai Super Kings', 'Pune', 'Maharashtra Cricket Association' UNION ALL
        SELECT 'Kolkata Knight Riders', 'Kolkata', 'Eden Gardens' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Arun Jaitley' UNION ALL
        SELECT 'Delhi Capitals', 'Delhi', 'Feroz Shah Kotla' UNION ALL
        SELECT 'Delhi Capitals', 'Visakhapatnam', 'ACA-VDCA' UNION ALL
        SELECT 'Punjab Kings', 'Chandigarh', 'IS Bindra' UNION ALL
        SELECT 'Punjab Kings', 'Mohali', 'IS Bindra' UNION ALL
        SELECT 'Punjab Kings', 'Mohali', 'PCA' UNION ALL
        SELECT 'Punjab Kings', 'Dharamsala', 'HPCA' UNION ALL
        SELECT 'Punjab Kings', 'Dharamsala', 'Himachal Pradesh' UNION ALL
        SELECT 'Punjab Kings', 'Mullanpur', 'Maharaja Yadavindra' UNION ALL
        SELECT 'Rajasthan Royals', 'Jaipur', 'Sawai Mansingh' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Narendra Modi' UNION ALL
        SELECT 'Rajasthan Royals', 'Ahmedabad', 'Sardar Patel' UNION ALL
        SELECT 'Rajasthan Royals', 'Guwahati', 'Barsapara' UNION ALL
        SELECT 'Sunrisers Hyderabad', 'Hyderabad', 'Rajiv Gandhi' UNION ALL
        SELECT 'Lucknow Super Giants', 'Lucknow', 'Ekana' UNION ALL
        SELECT 'Gujarat Titans', 'Ahmedabad', 'Narendra Modi' UNION ALL
        SELECT 'Gujarat Lions', 'Rajkot', 'Saurashtra' UNION ALL
        SELECT 'Gujarat Lions', 'Kanpur', 'Green Park' UNION ALL
        SELECT 'Rising Pune Supergiants', 'Pune', 'Maharashtra Cricket Association' UNION ALL
        SELECT 'Pune Warriors India', 'Pune', 'Subrata Roy Sahara'
    )
"""

VENUE_COUNTRY_MAP_CTE = """
    venue_country_map AS (
        SELECT venue, MAX(country) as country FROM (
            SELECT canonical_name AS venue, country FROM venues
            UNION ALL
            SELECT alias_name AS venue, v.country FROM venue_aliases va JOIN venues v ON v.venue_id = va.venue_id
            UNION ALL
            -- Heuristic fallback checking both venue and city columns
            SELECT venue, 
            CASE 
                WHEN venue ILIKE '%%Dubai%%' OR city ILIKE '%%Dubai%%' OR venue ILIKE '%%Sharjah%%' OR city ILIKE '%%Sharjah%%' OR venue ILIKE '%%Abu Dhabi%%' OR city ILIKE '%%Abu Dhabi%%' OR venue ILIKE '%%Al Amerat%%' THEN 'UAE'
                WHEN venue ILIKE '%%Belfast%%' OR city ILIKE '%%Belfast%%' OR venue ILIKE '%%Dublin%%' OR city ILIKE '%%Dublin%%' OR venue ILIKE '%%Malahide%%' OR city ILIKE '%%Malahide%%' OR venue ILIKE '%%Stormont%%' OR venue ILIKE '%%Castle Avenue%%' THEN 'Ireland'
                WHEN venue ILIKE '%%London%%' OR city ILIKE '%%London%%' OR venue ILIKE '%%Manchester%%' OR city ILIKE '%%Manchester%%' OR venue ILIKE '%%Birmingham%%' OR city ILIKE '%%Birmingham%%' OR venue ILIKE '%%Leeds%%' OR city ILIKE '%%Leeds%%' 
                  OR venue ILIKE '%%Nottingham%%' OR city ILIKE '%%Nottingham%%' OR venue ILIKE '%%Cardiff%%' OR city ILIKE '%%Cardiff%%' OR venue ILIKE '%%Southampton%%' OR city ILIKE '%%Southampton%%' OR venue ILIKE '%%Bristol%%' OR city ILIKE '%%Bristol%%' 
                  OR venue ILIKE '%%Taunton%%' OR city ILIKE '%%Taunton%%' OR venue ILIKE '%%Chester-le-Street%%' OR city ILIKE '%%Chester-le-Street%%' OR venue ILIKE '%%Old Trafford%%' OR venue ILIKE '%%Lord''s%%' OR venue ILIKE '%%Edgbaston%%' OR venue ILIKE '%%Trent Bridge%%' OR venue ILIKE '%%Headingley%%' OR venue ILIKE '%%The Oval%%' THEN 'England'
                WHEN venue ILIKE '%%Sydney%%' OR city ILIKE '%%Sydney%%' OR venue ILIKE '%%Melbourne%%' OR city ILIKE '%%Melbourne%%' OR venue ILIKE '%%Brisbane%%' OR city ILIKE '%%Brisbane%%' OR venue ILIKE '%%Perth%%' OR city ILIKE '%%Perth%%' 
                  OR venue ILIKE '%%Adelaide%%' OR city ILIKE '%%Adelaide%%' OR venue ILIKE '%%Hobart%%' OR city ILIKE '%%Hobart%%' OR venue ILIKE '%%Canberra%%' OR city ILIKE '%%Canberra%%' OR venue ILIKE '%%Darwin%%' OR city ILIKE '%%Darwin%%' OR venue ILIKE '%%Cairns%%' OR city ILIKE '%%Cairns%%' OR venue ILIKE '%%Geelong%%' OR city ILIKE '%%Geelong%%' OR venue ILIKE '%%Gold Coast%%' OR city ILIKE '%%Gold Coast%%' OR venue ILIKE '%%Townsville%%' OR city ILIKE '%%Townsville%%' THEN 'Australia'
                WHEN venue ILIKE '%%Auckland%%' OR city ILIKE '%%Auckland%%' OR venue ILIKE '%%Wellington%%' OR city ILIKE '%%Wellington%%' OR venue ILIKE '%%Christchurch%%' OR city ILIKE '%%Christchurch%%' OR venue ILIKE '%%Hamilton%%' OR city ILIKE '%%Hamilton%%' 
                  OR venue ILIKE '%%Dunedin%%' OR city ILIKE '%%Dunedin%%' OR venue ILIKE '%%Mount Maunganui%%' OR city ILIKE '%%Mount Maunganui%%' OR venue ILIKE '%%Napier%%' OR city ILIKE '%%Napier%%' OR venue ILIKE '%%Nelson%%' OR city ILIKE '%%Nelson%%' OR venue ILIKE '%%Queenstown%%' OR city ILIKE '%%Queenstown%%' OR venue ILIKE '%%Whangarei%%' OR city ILIKE '%%Whangarei%%' THEN 'New Zealand'
                WHEN venue ILIKE '%%Cape Town%%' OR city ILIKE '%%Cape Town%%' OR venue ILIKE '%%Johannesburg%%' OR city ILIKE '%%Johannesburg%%' OR venue ILIKE '%%Durban%%' OR city ILIKE '%%Durban%%' OR venue ILIKE '%%Centurion%%' OR city ILIKE '%%Centurion%%' 
                  OR venue ILIKE '%%Port Elizabeth%%' OR city ILIKE '%%Port Elizabeth%%' OR venue ILIKE '%%Bloemfontein%%' OR city ILIKE '%%Bloemfontein%%' OR venue ILIKE '%%Paarl%%' OR city ILIKE '%%Paarl%%' OR venue ILIKE '%%East London%%' OR city ILIKE '%%East London%%' OR venue ILIKE '%%Kimberley%%' OR city ILIKE '%%Kimberley%%' OR venue ILIKE '%%Potchefstroom%%' OR city ILIKE '%%Potchefstroom%%' OR venue ILIKE '%%Benoni%%' OR city ILIKE '%%Benoni%%' THEN 'South Africa'
                WHEN venue ILIKE '%%Colombo%%' OR city ILIKE '%%Colombo%%' OR venue ILIKE '%%Kandy%%' OR city ILIKE '%%Kandy%%' OR venue ILIKE '%%Galle%%' OR city ILIKE '%%Galle%%' OR venue ILIKE '%%Hambantota%%' OR city ILIKE '%%Hambantota%%' OR venue ILIKE '%%Dambulla%%' OR city ILIKE '%%Dambulla%%' OR venue ILIKE '%%Pallekele%%' THEN 'Sri Lanka'
                WHEN venue ILIKE '%%Dhaka%%' OR city ILIKE '%%Dhaka%%' OR venue ILIKE '%%Chittagong%%' OR city ILIKE '%%Chittagong%%' OR venue ILIKE '%%Sylhet%%' OR city ILIKE '%%Sylhet%%' OR venue ILIKE '%%Fatullah%%' OR city ILIKE '%%Fatullah%%' OR venue ILIKE '%%Mirpur%%' OR city ILIKE '%%Mirpur%%' OR venue ILIKE '%%Chattogram%%' OR city ILIKE '%%Chattogram%%' OR venue ILIKE '%%Khulna%%' OR city ILIKE '%%Khulna%%' THEN 'Bangladesh'
                WHEN venue ILIKE '%%Harare%%' OR city ILIKE '%%Harare%%' OR venue ILIKE '%%Bulawayo%%' OR city ILIKE '%%Bulawayo%%' THEN 'Zimbabwe'
                WHEN venue ILIKE '%%Kathmandu%%' OR city ILIKE '%%Kathmandu%%' THEN 'Nepal'
                WHEN venue ILIKE '%%Windhoek%%' OR city ILIKE '%%Windhoek%%' THEN 'Namibia'
                WHEN venue ILIKE '%%Muscat%%' OR city ILIKE '%%Muscat%%' OR venue ILIKE '%%Al Amarat%%' OR city ILIKE '%%Al Amarat%%' THEN 'Oman'
                WHEN venue ILIKE '%%Dallas%%' OR city ILIKE '%%Dallas%%' OR venue ILIKE '%%Florida%%' OR city ILIKE '%%Florida%%' OR venue ILIKE '%%New York%%' OR city ILIKE '%%New York%%' OR venue ILIKE '%%Morrisville%%' OR city ILIKE '%%Morrisville%%' OR venue ILIKE '%%Oakland%%' OR city ILIKE '%%Oakland%%' OR venue ILIKE '%%Lauderhill%%' OR city ILIKE '%%Lauderhill%%' OR venue ILIKE '%%Grand Prairie%%' OR city ILIKE '%%Grand Prairie%%' THEN 'USA'
                WHEN venue ILIKE '%%Edinburgh%%' OR city ILIKE '%%Edinburgh%%' OR venue ILIKE '%%Glasgow%%' OR city ILIKE '%%Glasgow%%' OR venue ILIKE '%%Aberdeen%%' OR city ILIKE '%%Aberdeen%%' THEN 'Scotland'
                WHEN venue ILIKE '%%Amstelveen%%' OR city ILIKE '%%Amstelveen%%' OR venue ILIKE '%%Rotterdam%%' OR city ILIKE '%%Rotterdam%%' OR venue ILIKE '%%The Hague%%' OR city ILIKE '%%The Hague%%' THEN 'Netherlands'
                WHEN venue ILIKE '%%Hong Kong%%' OR city ILIKE '%%Hong Kong%%' OR venue ILIKE '%%Mong Kok%%' OR city ILIKE '%%Mong Kok%%' THEN 'Hong Kong'
                WHEN venue ILIKE '%%Nairobi%%' OR city ILIKE '%%Nairobi%%' THEN 'Kenya'
                WHEN venue ILIKE '%%King City%%' OR city ILIKE '%%King City%%' OR venue ILIKE '%%Toronto%%' OR city ILIKE '%%Toronto%%' THEN 'Canada'
                WHEN venue ILIKE '%%Rawalpindi%%' OR city ILIKE '%%Rawalpindi%%' OR venue ILIKE '%%Karachi%%' OR city ILIKE '%%Karachi%%' OR venue ILIKE '%%Lahore%%' OR city ILIKE '%%Lahore%%' OR venue ILIKE '%%Multan%%' OR city ILIKE '%%Multan%%' OR venue ILIKE '%%Faisalabad%%' OR city ILIKE '%%Faisalabad%%' THEN 'Pakistan'
                WHEN venue ILIKE '%%Guyana%%' OR city ILIKE '%%Guyana%%' OR venue ILIKE '%%Barbados%%' OR city ILIKE '%%Barbados%%' OR venue ILIKE '%%Trinidad%%' OR city ILIKE '%%Trinidad%%' OR venue ILIKE '%%Antigua%%' OR city ILIKE '%%Antigua%%' 
                  OR venue ILIKE '%%St Lucia%%' OR city ILIKE '%%St Lucia%%' OR venue ILIKE '%%St Kitts%%' OR city ILIKE '%%St Kitts%%' OR venue ILIKE '%%Grenada%%' OR city ILIKE '%%Grenada%%' OR venue ILIKE '%%St Vincent%%' OR city ILIKE '%%St Vincent%%' 
                  OR venue ILIKE '%%Dominica%%' OR city ILIKE '%%Dominica%%' OR venue ILIKE '%%Jamaica%%' OR city ILIKE '%%Jamaica%%' OR venue ILIKE '%%St George''s%%' OR city ILIKE '%%St George''s%%' OR venue ILIKE '%%Providence%%' OR city ILIKE '%%Providence%%' OR venue ILIKE '%%Basseterre%%' OR city ILIKE '%%Basseterre%%' 
                  OR venue ILIKE '%%Bridgetown%%' OR city ILIKE '%%Bridgetown%%' OR venue ILIKE '%%Kingston%%' OR city ILIKE '%%Kingston%%' OR venue ILIKE '%%Port of Spain%%' OR city ILIKE '%%Port of Spain%%' OR venue ILIKE '%%Gros Islet%%' OR city ILIKE '%%Gros Islet%%' 
                  OR venue ILIKE '%%Tarouba%%' OR city ILIKE '%%Tarouba%%' OR venue ILIKE '%%North Sound%%' OR city ILIKE '%%North Sound%%' OR venue ILIKE '%%Roseau%%' OR city ILIKE '%%Roseau%%' OR venue ILIKE '%%Kingstown%%' OR city ILIKE '%%Kingstown%%' OR venue ILIKE '%%Sir Vivian Richards%%' THEN 'West Indies'
                -- User reported stadiums and common Indian venues
                WHEN venue ILIKE '%%Raipur%%' OR city ILIKE '%%Raipur%%' OR venue ILIKE '%%Rajkot%%' OR city ILIKE '%%Rajkot%%' OR venue ILIKE '%%Vadodara%%' OR city ILIKE '%%Vadodara%%' 
                  OR venue ILIKE '%%Ahmedabad%%' OR city ILIKE '%%Ahmedabad%%' OR venue ILIKE '%%Lucknow%%' OR city ILIKE '%%Lucknow%%' OR venue ILIKE '%%Guwahati%%' OR city ILIKE '%%Guwahati%%' 
                  OR venue ILIKE '%%Indore%%' OR city ILIKE '%%Indore%%' OR venue ILIKE '%%Dharamsala%%' OR city ILIKE '%%Dharamsala%%' OR venue ILIKE '%%Dharamshala%%' OR city ILIKE '%%Dharamshala%%' OR venue ILIKE '%%Dharmasala%%' OR city ILIKE '%%Dharmasala%%' OR venue ILIKE '%%Pune%%' OR city ILIKE '%%Pune%%' 
                  OR venue ILIKE '%%Cuttack%%' OR city ILIKE '%%Cuttack%%' OR venue ILIKE '%%Visakhapatnam%%' OR city ILIKE '%%Visakhapatnam%%' OR venue ILIKE '%%Kanpur%%' OR city ILIKE '%%Kanpur%%'
                  OR venue ILIKE '%%Nagpur%%' OR city ILIKE '%%Nagpur%%' OR venue ILIKE '%%Ranchi%%' OR city ILIKE '%%Ranchi%%' OR venue ILIKE '%%Gwalior%%' OR city ILIKE '%%Gwalior%%' 
                  OR venue ILIKE '%%Vijayawada%%' OR city ILIKE '%%Vijayawada%%' OR venue ILIKE '%%Kochi%%' OR city ILIKE '%%Kochi%%' OR venue ILIKE '%%Thiruvananthapuram%%' OR city ILIKE '%%Thiruvananthapuram%%' 
                  OR venue ILIKE '%%Hyderabad%%' OR city ILIKE '%%Hyderabad%%' OR venue ILIKE '%%Chennai%%' OR city ILIKE '%%Chennai%%' OR venue ILIKE '%%Bangalore%%' OR city ILIKE '%%Bangalore%%' 
                  OR venue ILIKE '%%Bengaluru%%' OR city ILIKE '%%Bengaluru%%' OR venue ILIKE '%%Mumbai%%' OR city ILIKE '%%Mumbai%%' OR venue ILIKE '%%Delhi%%' OR city ILIKE '%%Delhi%%' 
                  OR venue ILIKE '%%Kolkata%%' OR city ILIKE '%%Kolkata%%' OR venue ILIKE '%%Chandigarh%%' OR city ILIKE '%%Chandigarh%%' OR venue ILIKE '%%Mohali%%' OR city ILIKE '%%Mohali%%' 
                  OR venue ILIKE '%%Jaipur%%' OR city ILIKE '%%Jaipur%%' OR venue ILIKE '%%Margao%%' OR city ILIKE '%%Margao%%' OR venue ILIKE '%%Fatorda%%' OR city ILIKE '%%Fatorda%%' THEN 'India'
                ELSE NULL 
            END as country
            FROM matches 
            WHERE venue IS NOT NULL
        ) t
        GROUP BY venue
    )
"""

PARTNERSHIP_BASE_CTE = """
    partnership_base AS (
        SELECT 
            d.innings_id,
            d.over_number,
            d.ball_number,
            d.runs_batter,
            d.runs_extras,
            d.runs_total,
            d.is_wide,
            d.is_noball,
            d.phase,
            i.batting_team,
            i.bowling_team,
            i.match_id,
            COUNT(w.wicket_id) OVER (
                PARTITION BY d.innings_id 
                ORDER BY d.over_number, d.ball_number 
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) + 1 AS partnership_number
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
            AND w.kind NOT IN ('retired hurt', 'retired out', 'absent hurt')
    )
"""

PARTNERSHIP_AGGREGATE_CTE = """
    partnership_aggregates AS (
        SELECT 
            match_id,
            innings_id,
            batting_team,
            partnership_number,
            SUM(runs_total) as p_runs,
            COUNT(*) FILTER (WHERE NOT is_wide AND NOT is_noball) as p_balls
        FROM partnership_base
        GROUP BY match_id, innings_id, batting_team, partnership_number
    )
"""

SEQUENTIAL_WICKETS_CTE = """
    sequential_wickets AS (
        SELECT 
            d.innings_id,
            d.over_number,
            d.ball_number,
            i.bowling_team,
            i.match_id,
            w.wicket_id,
            LAG(w.wicket_id) OVER (PARTITION BY d.innings_id ORDER BY d.over_number, d.ball_number) as prev_wicket_id
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
            AND w.kind NOT IN ('run out', 'retired hurt', 'retired out', 'absent hurt')
    )
"""

TEAM_MATCH_TOTALS_CTE = """
    team_match_totals AS (
        SELECT 
            i.innings_id,
            i.match_id, 
            i.batting_team, 
            i.innings_number,
            COALESCE(SUM(d.runs_total), 0) as total_runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('retired hurt', 'retired out')) as total_wickets,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 4), 0) as fours,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 6), 0) as sixes,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball), 0) as total_balls
        FROM innings i
        LEFT JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        GROUP BY i.innings_id, i.match_id, i.batting_team, i.innings_number
    )
"""

TEAM_MATCH_AGGREGATE_CTE = """
    team_match_aggregates AS (
        SELECT 
            match_id, 
            batting_team,
            SUM(total_runs) as total_runs,
            SUM(total_wickets) as total_wickets,
            SUM(fours) as fours,
            SUM(sixes) as sixes,
            SUM(total_balls) as total_balls,
            MIN(innings_number) as first_innings_no,
            STRING_AGG(total_runs::text || '-' || total_wickets::text, ' & ' ORDER BY innings_id) as score_str
        FROM team_match_totals
        GROUP BY match_id, batting_team
    )
"""

TEAM_NORM_SQL = """
    CASE 
        WHEN {col} IN ('Royal Challengers Bangalore', 'Royal Challengers Bengaluru') THEN 'Royal Challengers Bengaluru'
        WHEN {col} IN ('Kings XI Punjab', 'Punjab Kings') THEN 'Punjab Kings'
        WHEN {col} IN ('Delhi Daredevils', 'Delhi Capitals') THEN 'Delhi Capitals'
        WHEN {col} IN ('Rising Pune Supergiants', 'Rising Pune Supergiant') THEN 'Rising Pune Supergiant'
        ELSE {col}
    END
"""

# ── Ground type (Home/Away/Neutral) CASE expression ─────────

def GROUND_TYPE_SQL(team_col: str, opp_col: str) -> str:
    return f"""
        CASE
            WHEN c.name = 'Indian Premier League' THEN
                CASE
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = {team_col} AND (m.city ILIKE '%%' || v.city || '%%' OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Home'
                    WHEN EXISTS (SELECT 1 FROM ipl_team_venues v WHERE v.team = {opp_col} AND (m.city ILIKE '%%' || v.city || '%%' OR m.venue ILIKE '%%' || v.venue || '%%')) THEN 'Away'
                    ELSE 'Neutral'
                END
            ELSE
                CASE
                    WHEN vm.country = 
                         (CASE WHEN {team_col} LIKE '%%India%%' THEN 'India' 
                               WHEN {team_col} LIKE '%%Australia%%' THEN 'Australia'
                               WHEN {team_col} LIKE '%%England%%' THEN 'England'
                               WHEN {team_col} LIKE '%%South Africa%%' THEN 'South Africa'
                               WHEN {team_col} LIKE '%%New Zealand%%' THEN 'New Zealand'
                               WHEN {team_col} LIKE '%%Pakistan%%' THEN 'Pakistan'
                               WHEN {team_col} LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                               WHEN {team_col} LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                               WHEN {team_col} LIKE '%%West Indies%%' THEN 'West Indies'
                               WHEN {team_col} LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                               WHEN {team_col} LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                               WHEN {team_col} LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Home'
                    WHEN vm.country = 
                         (CASE WHEN {opp_col} LIKE '%%India%%' THEN 'India' 
                               WHEN {opp_col} LIKE '%%Australia%%' THEN 'Australia'
                               WHEN {opp_col} LIKE '%%England%%' THEN 'England'
                               WHEN {opp_col} LIKE '%%South Africa%%' THEN 'South Africa'
                               WHEN {opp_col} LIKE '%%New Zealand%%' THEN 'New Zealand'
                               WHEN {opp_col} LIKE '%%Pakistan%%' THEN 'Pakistan'
                               WHEN {opp_col} LIKE '%%Sri Lanka%%' THEN 'Sri Lanka'
                               WHEN {opp_col} LIKE '%%Bangladesh%%' THEN 'Bangladesh'
                               WHEN {opp_col} LIKE '%%West Indies%%' THEN 'West Indies'
                               WHEN {opp_col} LIKE '%%Zimbabwe%%' THEN 'Zimbabwe'
                               WHEN {opp_col} LIKE '%%Afghanistan%%' THEN 'Afghanistan'
                               WHEN {opp_col} LIKE '%%Ireland%%' THEN 'Ireland' ELSE 'Other' END) THEN 'Away'
                    ELSE 'Neutral'
                END
        END
    """

# Phase over ranges removed as we now use the d.phase column directly,
# which already contains format-specific phase assignments from ingestion.

# Allowed sort columns (batting)
BAT_SORT_COLS = {
    "rank": "rank",
    "label": "label",
    "runs": "runs",
    "average": "average",
    "strike_rate": "strike_rate",
    "innings": "innings",
    "balls": "balls",
    "hundreds": "hundreds",
    "fifties": "fifties",
    "highest_score": "highest_score",
    "dot_pct": "dot_ball_pct",
    "boundary_pct": "boundary_pct",
    "fours": "fours",
    "sixes": "sixes",
    "matches": "matches",
    "top_scores": "top_scores",
    "won": "won",
    "ducks": "ducks",
    "win_percentage": "win_percentage",
}

BOWL_SORT_COLS = {
    "rank": "rank",
    "label": "label",
    "wickets": "wickets",
    "bowling_average": "bowling_average",
    "economy": "economy",
    "bowling_strike_rate": "bowling_strike_rate",
    "innings": "innings",
    "overs": "overs",
    "runs_conceded": "runs_conceded",
    "wides": "wides",
    "no_balls": "no_balls",
    "fours_conceded": "fours_conceded",
    "sixes_conceded": "sixes_conceded",
    "five_wkts": "five_wicket_hauls",
    "matches": "matches",
    "top_wickets": "top_wickets",
    "won": "won",
    "win_percentage": "win_percentage",
}


def build_top_opponents_cte(req: StatBuilderRequest, role: str) -> tuple[str, list]:
    normalize_formats(req)
    cte_params = []
    cte_where = []
    
    # 1. include_unofficial
    if not req.include_unofficial:
        cte_where.append("m.is_official = true")
        
    # 2. formats
    if req.formats:
        placeholders = ", ".join(["%s"] * len(req.formats))
        cte_where.append(f"({FORMAT_BUCKET_EXPR}) IN ({placeholders})")
        cte_params.extend(req.formats)
        
    # 3. tournaments
    if req.tournaments:
        placeholders = ", ".join(["%s"] * len(req.tournaments))
        cte_where.append(f"c.name IN ({placeholders})")
        cte_params.extend(req.tournaments)
        
    # 4. year_from / year_to
    if req.year_from is not None:
        cte_where.append("EXTRACT(YEAR FROM m.date) >= %s")
        cte_params.append(req.year_from)
    if req.year_to is not None:
        cte_where.append("EXTRACT(YEAR FROM m.date) <= %s")
        cte_params.append(req.year_to)
        
    # 5. date_from / date_to
    if req.date_from:
        cte_where.append("m.date >= %s")
        cte_params.append(req.date_from)
    if req.date_to:
        cte_where.append("m.date <= %s")
        cte_params.append(req.date_to)
        
    # 6. match_stages
    if req.match_stages:
        placeholders = ", ".join(["%s"] * len(req.match_stages))
        cte_where.append(f"m.match_stage IN ({placeholders})")
        cte_params.extend(req.match_stages)
        
    # 7. match_groups
    if req.match_groups:
        placeholders = ", ".join(["%s"] * len(req.match_groups))
        cte_where.append(f"m.match_group IN ({placeholders})")
        cte_params.extend(req.match_groups)
        
    # 8. cities
    if req.cities:
        placeholders = ", ".join(["%s"] * len(req.cities))
        cte_where.append(f"m.city IN ({placeholders})")
        cte_params.extend(req.cities)
        
    # 9. venues
    if req.venues:
        placeholders = ", ".join(["%s"] * len(req.venues))
        cte_where.append(f"m.venue IN ({placeholders})")
        cte_params.extend(req.venues)
        
    # 10. countries
    if req.countries:
        placeholders = ", ".join(["%s"] * len(req.countries))
        cte_where.append(f"m.venue IN (SELECT venue FROM venue_country_map WHERE country IN ({placeholders}))")
        cte_params.extend(req.countries)
        
    # 11. teams
    if req.teams:
        team_parts = []
        T1N = TEAM_NORM_SQL.format(col="m.team1")
        T2N = TEAM_NORM_SQL.format(col="m.team2")
        for t in req.teams:
            team_parts.append(f"({T1N} = %s OR {T2N} = %s)")
            cte_params.extend([t, t])
        cte_where.append(f"({' OR '.join(team_parts)})")
        
    where_sql = (" AND " + " AND ".join(cte_where)) if cte_where else ""
    
    if role == "bowler":
        sql = f"""
        top_tournament_opponents AS (
            SELECT 
                d.bowler_id
            FROM deliveries d
            JOIN innings i ON d.innings_id = i.innings_id
            JOIN matches m ON i.match_id = m.match_id
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            LEFT JOIN wickets w ON d.delivery_id = w.delivery_id 
                AND w.kind IN ('caught', 'bowled', 'stumped', 'caught and bowled', 'lbw', 'hit wicket')
            WHERE 1=1 {where_sql}
            GROUP BY d.bowler_id
            ORDER BY COUNT(w.wicket_id) DESC
            LIMIT %s
        )
        """
    else:
        sql = f"""
        top_tournament_opponents AS (
            SELECT 
                d.batter_id
            FROM deliveries d
            JOIN innings i ON d.innings_id = i.innings_id
            JOIN matches m ON i.match_id = m.match_id
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            WHERE 1=1 {where_sql}
            GROUP BY d.batter_id
            ORDER BY SUM(d.runs_batter) DESC
            LIMIT %s
        )
        """
        
    cte_params.append(req.vs_top_limit)
    return sql, cte_params


def query_top_opponents(req: StatBuilderRequest, role: str) -> tuple[str, list]:
    normalize_formats(req)
    cte_params = []
    cte_where = []
    
    # 1. include_unofficial
    if not req.include_unofficial:
        cte_where.append("m.is_official = true")
        
    # 2. formats
    if req.formats:
        placeholders = ", ".join(["%s"] * len(req.formats))
        cte_where.append(f"({FORMAT_BUCKET_EXPR}) IN ({placeholders})")
        cte_params.extend(req.formats)
        
    # 3. tournaments
    if req.tournaments:
        placeholders = ", ".join(["%s"] * len(req.tournaments))
        cte_where.append(f"c.name IN ({placeholders})")
        cte_params.extend(req.tournaments)
        
    # 4. year_from / year_to
    if req.year_from is not None:
        cte_where.append("EXTRACT(YEAR FROM m.date) >= %s")
        cte_params.append(req.year_from)
    if req.year_to is not None:
        cte_where.append("EXTRACT(YEAR FROM m.date) <= %s")
        cte_params.append(req.year_to)
        
    # 5. date_from / date_to
    if req.date_from:
        cte_where.append("m.date >= %s")
        cte_params.append(req.date_from)
    if req.date_to:
        cte_where.append("m.date <= %s")
        cte_params.append(req.date_to)
        
    # 6. match_stages
    if req.match_stages:
        placeholders = ", ".join(["%s"] * len(req.match_stages))
        cte_where.append(f"m.match_stage IN ({placeholders})")
        cte_params.extend(req.match_stages)
        
    # 7. match_groups
    if req.match_groups:
        placeholders = ", ".join(["%s"] * len(req.match_groups))
        cte_where.append(f"m.match_group IN ({placeholders})")
        cte_params.extend(req.match_groups)
        
    # 8. cities
    if req.cities:
        placeholders = ", ".join(["%s"] * len(req.cities))
        cte_where.append(f"m.city IN ({placeholders})")
        cte_params.extend(req.cities)
        
    # 9. venues
    if req.venues:
        placeholders = ", ".join(["%s"] * len(req.venues))
        cte_where.append(f"m.venue IN ({placeholders})")
        cte_params.extend(req.venues)
        
    # 10. countries
    if req.countries:
        placeholders = ", ".join(["%s"] * len(req.countries))
        cte_where.append(f"m.venue IN (SELECT venue FROM venue_country_map WHERE country IN ({placeholders}))")
        cte_params.extend(req.countries)
        
    # 11. teams
    if req.teams:
        team_parts = []
        T1N = TEAM_NORM_SQL.format(col="m.team1")
        T2N = TEAM_NORM_SQL.format(col="m.team2")
        for t in req.teams:
            team_parts.append(f"({T1N} = %s OR {T2N} = %s)")
            cte_params.extend([t, t])
        cte_where.append(f"({' OR '.join(team_parts)})")
        
    where_sql = (" AND " + " AND ".join(cte_where)) if cte_where else ""
    
    if role == "bowler":
        sql = f"""
        WITH {VENUE_COUNTRY_MAP_CTE}
        SELECT 
            d.bowler_id AS id,
            p.name AS name,
            COUNT(w.wicket_id)::int AS metric
        FROM deliveries d
        JOIN players p ON p.player_id = d.bowler_id
        JOIN innings i ON d.innings_id = i.innings_id
        JOIN matches m ON i.match_id = m.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN wickets w ON d.delivery_id = w.delivery_id 
            AND w.kind IN ('caught', 'bowled', 'stumped', 'caught and bowled', 'lbw', 'hit wicket')
        WHERE 1=1 {where_sql}
        GROUP BY d.bowler_id, p.name
        ORDER BY COUNT(w.wicket_id) DESC
        LIMIT %s
        """
    else:
        sql = f"""
        WITH {VENUE_COUNTRY_MAP_CTE}
        SELECT 
            d.batter_id AS id,
            p.name AS name,
            SUM(d.runs_batter)::int AS metric
        FROM deliveries d
        JOIN players p ON p.player_id = d.batter_id
        JOIN innings i ON d.innings_id = i.innings_id
        JOIN matches m ON i.match_id = m.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE 1=1 {where_sql}
        GROUP BY d.batter_id, p.name
        ORDER BY SUM(d.runs_batter) DESC
        LIMIT %s
        """
        
    cte_params.append(req.vs_top_limit)
    return sql, cte_params


# ── Batting query builder ────────────────────────────────────

def build_batting_query(req: StatBuilderRequest, is_inner: bool = False) -> tuple[str, list]:
    normalize_formats(req)
    """Return (sql, params) for a batting stat-builder query."""
    # ── Sort Logic (Needs to be at top for Achievement Mode) ──
    sort_col = BAT_SORT_COLS.get(req.sort_by, "runs")
    sort_dir = "DESC" if req.sort_dir == "desc" else "ASC"
    if req.sort_by == "rank":
        sort_col = "runs"
        sort_dir = "DESC"

    if req.group_by in ("player_achievement_count", "player_season_achievement_count") and not is_inner:
        inner_req = req.model_copy()
        inner_req.group_by = "player_match" if req.group_by == "player_achievement_count" else "player_year"
        inner_req.min_innings = 1
        inner_sql, params = build_batting_query(inner_req, is_inner=True)
        
        ach_label = "Match Achievement Count" if req.group_by == "player_achievement_count" else "Season Achievement Count"
        
        sql = f"""
        WITH {IPL_TEAM_VENUES_CTE},
             {VENUE_COUNTRY_MAP_CTE}
        SELECT 
            label,
            '{ach_label}' as sub_label,
            player_id,
            COUNT(*)::int as innings,
            SUM(runs)::int as runs,
            ROUND(AVG(runs), 2) as average,
            ROUND(AVG(strike_rate), 2) as strike_rate,
            SUM(balls)::int as balls,
            MAX(highest_score)::int as highest_score,
            SUM(fifties)::int as fifties,
            SUM(hundreds)::int as hundreds,
            SUM(ducks)::int as ducks,
            SUM(matches)::int as matches,
            SUM(ach.won)::int as won,
            ROUND(SUM(ach.won) * 100.0 / NULLIF(COUNT(*), 0), 2) as win_percentage,
            SUM(ach.top_scores)::int as top_scores,
            JSONB_AGG(JSONB_BUILD_OBJECT(
                'label', ach.label,
                'sub_label', ach.sub_label,
                'runs', ach.runs,
                'balls', ach.balls,
                'dismissals', ach.dismissals,
                'is_win', ach.won,
                'match_id', ach.match_id
            ) ORDER BY runs DESC) as instances
        FROM ({inner_sql}) ach
        GROUP BY label, player_id
        HAVING COUNT(*) >= %s
        ORDER BY {sort_col} {sort_dir} NULLS LAST
        LIMIT %s
        """
        params.append(req.min_innings)
        params.append(req.limit)
        return sql, params

    params: list = []
    where_clauses: list[str] = []
    having_clauses: list[str] = []

    # ── Player filter ─────────────────────────────────────
    join_players = bool(req.player_name)

    # ── Format filter ─────────────────────────────────────
    if req.formats:
        placeholders = ", ".join(["%s"] * len(req.formats))
        where_clauses.append(f"({FORMAT_BUCKET_EXPR}) IN ({placeholders})")
        params.extend(req.formats)

    # ── Innings filter ────────────────────────────────────
    if req.innings:
        inn_parts = []
        for inn in req.innings:
            if inn == "1st":
                inn_parts.append("i.innings_number = 1")
            elif inn == "2nd":
                inn_parts.append("i.innings_number = 2")
            elif inn == "Chase":
                inn_parts.append("(i.innings_number = 2 AND m.toss_decision IS NOT NULL)")
            elif inn == "Setting":
                inn_parts.append("(i.innings_number = 1 AND m.toss_decision IS NOT NULL)")
        if inn_parts:
            where_clauses.append(f"({' OR '.join(inn_parts)})")

    # ── Phase / over range filter ─────────────────────────
    if req.phases:
        phase_list = "', '".join([p.lower() for p in req.phases])
        where_clauses.append(f"d.phase IN ('{phase_list}')")
    elif req.over_from is not None or req.over_to is not None:
        if req.over_from is not None:
            where_clauses.append("d.over_number >= %s")
            params.append(req.over_from - 1)
        if req.over_to is not None:
            where_clauses.append("d.over_number <= %s")
            params.append(req.over_to - 1)

    # ── Year range ────────────────────────────────────────
    if req.year_from is not None:
        where_clauses.append("EXTRACT(YEAR FROM m.date) >= %s")
        params.append(req.year_from)
    if req.year_to is not None:
        where_clauses.append("EXTRACT(YEAR FROM m.date) <= %s")
        params.append(req.year_to)

    # ── Match result ──────────────────────────────────────
    if req.match_result:
        result_parts = []
        for r in req.match_result:
            winner_expr = TEAM_NORM_SQL.format(col="m.winner")
            batting_team_expr = TEAM_NORM_SQL.format(col="i.batting_team")
            if r == "Won":
                result_parts.append(f"{winner_expr} = {batting_team_expr}")
            elif r == "Lost":
                result_parts.append(f"({winner_expr} IS NOT NULL AND {winner_expr} <> {batting_team_expr})")
            elif r == "Draw":
                result_parts.append(f"{winner_expr} = 'draw'")
            elif r == "Tie":
                result_parts.append(f"{winner_expr} = 'tie'")
            elif r == "NR":
                result_parts.append(f"({winner_expr} IS NULL OR {winner_expr} = 'no result')")
        if result_parts:
            where_clauses.append(f"({' OR '.join(result_parts)})")

    # ── Toss filter ───────────────────────────────────────
    if req.toss == "Won":
        where_clauses.append(f"{TEAM_NORM_SQL.format(col='m.toss_winner')} = {TEAM_NORM_SQL.format(col='i.batting_team')}")
    elif req.toss == "Lost":
        where_clauses.append(f"{TEAM_NORM_SQL.format(col='m.toss_winner')} <> {TEAM_NORM_SQL.format(col='i.batting_team')}")

    # ── Day/Night filter ──────────────────────────────────
    if req.day_night:
        where_clauses.append("m.day_night = %s")
        params.append(req.day_night)

    # ── V2 dynamic filters ────────────────────────────────
    _apply_v2_filters(
        req, where_clauses, params, 
        stat_type="bat",
        team_runs_col="tmt.total_runs",
        team_wkts_col="tmt.total_wickets"
    )

    # ── Batting positions filter ──────────────────────────
    join_bp = False
    if req.batting_positions:
        join_bp = True
        pos_clauses = []
        for pos_key in req.batting_positions:
            pos_key_str = str(pos_key).lower()
            rng = BATTING_POSITION_RANGES.get(pos_key_str)
            if rng:
                pos_clauses.append(f"(bp.bat_position >= {rng[0]} AND bp.bat_position <= {rng[1]})")
            elif pos_key_str.isdigit():
                pos_clauses.append(f"bp.bat_position = {int(pos_key_str)}")
        if pos_clauses:
            where_clauses.append(f"({' OR '.join(pos_clauses)})")

    # ── Dismissal types filter ────────────────────────────
    if req.dismissal_types:
        ph = ", ".join(["%s"] * len(req.dismissal_types))
        where_clauses.append(f"w.kind IN ({ph})")
        params.extend(req.dismissal_types)

    # ── Opposing Matchups Filter ──────────────────────────
    matchup_clauses = []
    cte_sql = None
    cte_params = []
    if req.vs_top_limit:
        cte_sql, cte_params = build_top_opponents_cte(req, "bowler")
        matchup_clauses.append("d.bowler_id IN (SELECT bowler_id FROM top_tournament_opponents)")
    if req.opposing_player_ids:
        ph = ", ".join(["%s"] * len(req.opposing_player_ids))
        matchup_clauses.append(f"d.bowler_id IN ({ph})")
        params.extend(req.opposing_player_ids)
    if matchup_clauses:
        where_clauses.append(f"({' OR '.join(matchup_clauses)})")

    # ── GROUP BY dimension ────────────────────────────────
    group_by_expr, group_label, group_sub, group_player_id = _get_group_by(req.group_by, join_players)

    # ── HAVING thresholds ─────────────────────────────────
    if req.min_innings > 1:
        having_clauses.append("COUNT(DISTINCT innings_id) >= %s")
        params.append(req.min_innings)
    if req.min_runs is not None:
        having_clauses.append("SUM(runs) >= %s")
        params.append(req.min_runs)
    if req.max_runs is not None:
        having_clauses.append("SUM(runs) <= %s")
        params.append(req.max_runs)
    if req.min_balls is not None:
        having_clauses.append("SUM(balls) >= %s")
        params.append(req.min_balls)
    if req.max_balls is not None:
        having_clauses.append("SUM(balls) <= %s")
        params.append(req.max_balls)
    if req.min_fours is not None:
        having_clauses.append("SUM(fours) >= %s")
        params.append(req.min_fours)
    if req.min_sixes is not None:
        having_clauses.append("SUM(sixes) >= %s")
        params.append(req.min_sixes)

    if req.min_average is not None:
        having_clauses.append("""
            CASE WHEN SUM(dismissals) > 0 THEN
                SUM(runs)::NUMERIC / SUM(dismissals)
            ELSE NULL END >= %s
        """)
        params.append(req.min_average)
    if req.min_strike_rate is not None:
        having_clauses.append("""
            CASE WHEN SUM(balls) > 0 THEN
                SUM(runs) * 100.0 / SUM(balls)
            ELSE NULL END >= %s
        """)
        params.append(req.min_strike_rate)

    # ── Sort ──────────────────────────────────────────────
    # Moved to top

    # ── Assemble SQL ──────────────────────────────────────
    where_sql = (" AND " + " AND ".join(where_clauses)) if where_clauses else ""
    having_sql = ("HAVING " + " AND ".join(having_clauses)) if having_clauses else ""

    player_join = "JOIN players p ON p.player_id = d.batter_id" if join_players or req.group_by.startswith("player") else ""
    bp_join = "JOIN batter_positions bp ON bp.innings_id = i.innings_id AND bp.batter_id = d.batter_id" if join_bp else ""
    
    # We use a two-stage aggregation to correctly calculate HS, 50s, and 100s
    inn_stats_cte = f"""
    inn_stats AS (
        SELECT
            {group_by_expr} as group_key,
            MAX({group_label}) as label,
            MAX({group_sub}) as sub_label,
            MAX({group_player_id}) as player_id,
            i.match_id,
            i.innings_id,
            COALESCE(SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide), 0) AS runs,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide), 0) AS balls,
            COALESCE(COUNT(w.wicket_id) FILTER (
                WHERE w.kind NOT IN ('retired hurt', 'retired not out')
            ), 0) AS dismissals,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter = 0), 0) AS dots,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter = 4), 0) AS fours,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter = 6), 0) AS sixes,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND d.runs_batter >= 4), 0) AS boundaries,
            RANK() OVER (PARTITION BY i.innings_id ORDER BY SUM(d.runs_batter) FILTER (WHERE NOT d.is_wide) DESC) as innings_rank,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} = {TEAM_NORM_SQL.format(col="i.batting_team")} THEN 1 ELSE 0 END as is_win,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} IS NOT NULL AND {TEAM_NORM_SQL.format(col="m.winner")} <> {TEAM_NORM_SQL.format(col="i.batting_team")} AND {TEAM_NORM_SQL.format(col="m.winner")} NOT IN ('tie','draw','no result') THEN 1 ELSE 0 END as is_loss,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} = 'tie' THEN 1 ELSE 0 END as is_tie,
            CASE WHEN LOWER({TEAM_NORM_SQL.format(col="m.winner")}) = 'draw' THEN 1 ELSE 0 END as is_draw,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} IS NULL OR LOWER({TEAM_NORM_SQL.format(col="m.winner")}) = 'no result' THEN 1 ELSE 0 END as is_nr
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN team_match_totals tmt ON tmt.innings_id = i.innings_id
        LEFT JOIN team_match_totals omt ON omt.match_id = i.match_id AND omt.innings_number = (CASE WHEN i.innings_number = 1 THEN 2 WHEN i.innings_number = 2 THEN 1 WHEN i.innings_number = 3 THEN 4 WHEN i.innings_number = 4 THEN 3 END)
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id AND w.player_out_id = d.batter_id
        {player_join}
        {bp_join}
        WHERE 1=1 {where_sql}
        GROUP BY {group_by_expr}, i.match_id, i.innings_id, m.winner, i.batting_team
    )
    """

    outer_where_clauses = []
    if req.is_not_out:
        outer_where_clauses.append("dismissals = 0")
    outer_where_sql = ("WHERE " + " AND ".join(outer_where_clauses)) if outer_where_clauses else ""

    sql_select = f"""
    SELECT
        label,
        sub_label,
        player_id,
        MAX(match_id) as match_id,
        COUNT(DISTINCT match_id) AS matches,
        COUNT(DISTINCT innings_id) AS innings,
        SUM(runs) AS runs,
        SUM(balls) AS balls,
        SUM(dismissals) AS dismissals,
        MAX(runs) AS highest_score,
        COUNT(*) FILTER (WHERE runs >= 100) AS hundreds,
        COUNT(*) FILTER (WHERE runs >= 50 AND runs < 100) AS fifties,
        SUM(fours) as fours,
        SUM(sixes) as sixes,
        SUM(boundaries) as boundaries,
        COUNT(*) FILTER (WHERE runs = 0 AND dismissals > 0) AS ducks,
        COUNT(*) FILTER (WHERE innings_rank = 1) AS top_scores,
        SUM(is_win) as won,
        SUM(is_loss) as lost,
        SUM(is_tie) as tied,
        SUM(is_draw) as drawn,
        SUM(is_nr) as no_result,
        ROUND(SUM(is_win)::NUMERIC / NULLIF(SUM(is_win) + SUM(is_loss), 0) * 100, 2) as win_percentage,
        ROUND(SUM(runs)::NUMERIC / NULLIF(SUM(dismissals), 0), 2) AS average,
        ROUND(SUM(runs) * 100.0 / NULLIF(SUM(balls), 0), 2) AS strike_rate,
        ROUND(SUM(dots) * 100.0 / NULLIF(SUM(balls), 0), 2) AS dot_ball_pct,
        ROUND(SUM(boundaries) * 100.0 / NULLIF(SUM(balls), 0), 2) AS boundary_pct
    FROM inn_stats
    {outer_where_sql}
    GROUP BY label, sub_label, player_id, group_key
    {having_sql}
    ORDER BY {sort_col} {sort_dir} NULLS LAST
    """
    
    ctes = []
    if cte_sql:
        ctes.append(cte_sql)
    ctes.extend([IPL_TEAM_VENUES_CTE, VENUE_COUNTRY_MAP_CTE, TEAM_MATCH_TOTALS_CTE])
    if join_bp:
        ctes.append(BATTING_ORDER_CTE)
    ctes.append(inn_stats_cte)
    with_sql = "WITH " + ", ".join(ctes)

    if is_inner:
        sql = f"{with_sql} {sql_select}"
    else:
        sql = f"{with_sql} {sql_select} LIMIT %s"
        params.append(req.limit)

    return sql, cte_params + params


def build_bowling_query(req: StatBuilderRequest, is_inner: bool = False) -> tuple[str, list]:
    normalize_formats(req)
    """Return (sql, params) for a bowling stat-builder query."""
    # ── Sort Logic (Needs to be at top for Achievement Mode) ──
    sort_col = BOWL_SORT_COLS.get(req.sort_by, "wickets")
    sort_dir = "DESC" if req.sort_dir == "desc" else "ASC"
    if req.sort_by == "rank":
        sort_col = "wickets"
        sort_dir = "DESC"

    if req.group_by in ("player_achievement_count", "player_season_achievement_count") and not is_inner:
        inner_req = req.model_copy()
        inner_req.group_by = "player_match" if req.group_by == "player_achievement_count" else "player_year"
        inner_req.min_innings = 1
        inner_sql, params = build_bowling_query(inner_req, is_inner=True)
        
        ach_label = "Match Achievement Count" if req.group_by == "player_achievement_count" else "Season Achievement Count"
        
        sql = f"""
        WITH {IPL_TEAM_VENUES_CTE},
             {VENUE_COUNTRY_MAP_CTE}
        SELECT 
            label,
            '{ach_label}' as sub_label,
            player_id,
            COUNT(*)::int as innings,
            SUM(wickets)::int as wickets,
            ROUND(AVG(economy), 2) as economy,
            ROUND(AVG(bowling_average), 2) as bowling_average,
            SUM(runs_conceded)::int as runs_conceded,
            SUM(balls)::int as balls,
            (SUM(balls) / 6) + (SUM(balls) %% 6) / 10.0 as overs,
            SUM(no_balls)::int as no_balls,
            SUM(wides)::int as wides,
            SUM(five_wicket_hauls)::int as five_wicket_hauls,
            SUM(ach.won)::int as won,
            ROUND(SUM(ach.won) * 100.0 / NULLIF(COUNT(*), 0), 2) as win_percentage,
            SUM(ach.top_wickets)::int as top_wickets,
            JSONB_AGG(JSONB_BUILD_OBJECT(
                'label', ach.label,
                'sub_label', ach.sub_label,
                'wickets', ach.wickets,
                'runs', ach.runs_conceded,
                'balls', ach.balls,
                'economy', ach.economy,
                'is_win', ach.won,
                'match_id', ach.match_id
            ) ORDER BY wickets DESC) as instances
        FROM ({inner_sql}) ach
        GROUP BY label, player_id
        HAVING COUNT(*) >= %s
        ORDER BY {sort_col} {sort_dir} NULLS LAST
        LIMIT %s
        """
        params.append(req.min_innings)
        params.append(req.limit)
        return sql, params

    params: list = []
    where_clauses: list[str] = []
    having_clauses: list[str] = []

    join_players = bool(req.player_name)

    if req.formats:
        placeholders = ", ".join(["%s"] * len(req.formats))
        where_clauses.append(f"({FORMAT_BUCKET_EXPR}) IN ({placeholders})")
        params.extend(req.formats)

    if req.innings:
        inn_parts = []
        for inn in req.innings:
            if inn == "1st":
                inn_parts.append("i.innings_number = 1")
            elif inn == "2nd":
                inn_parts.append("i.innings_number = 2")
            elif inn == "Chase":
                inn_parts.append("(i.innings_number = 2 AND m.toss_decision IS NOT NULL)")
            elif inn == "Setting":
                inn_parts.append("(i.innings_number = 1 AND m.toss_decision IS NOT NULL)")
        if inn_parts:
            where_clauses.append(f"({' OR '.join(inn_parts)})")

    if req.phases:
        phase_list = "', '".join([p.lower() for p in req.phases])
        where_clauses.append(f"d.phase IN ('{phase_list}')")
    elif req.over_from is not None or req.over_to is not None:
        if req.over_from is not None:
            where_clauses.append("d.over_number >= %s")
            params.append(req.over_from - 1)
        if req.over_to is not None:
            where_clauses.append("d.over_number <= %s")
            params.append(req.over_to - 1)

    if req.opposition:
        placeholders = ", ".join(["%s"] * len(req.opposition))
        where_clauses.append(f"{TEAM_NORM_SQL.format(col='i.batting_team')} IN ({placeholders})")
        params.extend(req.opposition)

    if req.year_from is not None:
        where_clauses.append("EXTRACT(YEAR FROM m.date) >= %s")
        params.append(req.year_from)
    if req.year_to is not None:
        where_clauses.append("EXTRACT(YEAR FROM m.date) <= %s")
        params.append(req.year_to)

    if req.tournaments:
        placeholders = ", ".join(["%s"] * len(req.tournaments))
        where_clauses.append(f"c.name IN ({placeholders})")
        params.extend(req.tournaments)

    if req.match_result:
        result_parts = []
        for r in req.match_result:
            winner_expr = TEAM_NORM_SQL.format(col="m.winner")
            bowling_team_expr = TEAM_NORM_SQL.format(col="i.bowling_team")
            if r == "Won":
                result_parts.append(f"{winner_expr} = {bowling_team_expr}")
            elif r == "Lost":
                result_parts.append(f"({winner_expr} IS NOT NULL AND {winner_expr} <> {bowling_team_expr})")
            elif r == "Draw":
                result_parts.append(f"{winner_expr} = 'draw'")
            elif r == "Tie":
                result_parts.append(f"{winner_expr} = 'tie'")
            elif r == "NR":
                result_parts.append(f"({winner_expr} IS NULL OR {winner_expr} = 'no result')")
        if result_parts:
            where_clauses.append(f"({' OR '.join(result_parts)})")

    if req.toss == "Won":
        where_clauses.append(f"{TEAM_NORM_SQL.format(col='m.toss_winner')} = {TEAM_NORM_SQL.format(col='i.bowling_team')}")
    elif req.toss == "Lost":
        where_clauses.append(f"{TEAM_NORM_SQL.format(col='m.toss_winner')} <> {TEAM_NORM_SQL.format(col='i.bowling_team')}")


    if req.day_night:
        where_clauses.append("m.day_night = %s")
        params.append(req.day_night)

    # ── V2 dynamic filters ────────────────────────────────
    _apply_v2_filters(
        req, where_clauses, params, 
        stat_type="bowl",
        team_runs_col="tmt.total_runs",
        team_wkts_col="tmt.total_wickets"
    )

    # ── GROUP BY ──────────────────────────────────────────
    group_by_expr, group_label, group_sub, group_player_id = _get_group_by_bowling(req.group_by, join_players)

    if req.min_innings > 1:
        having_clauses.append("COUNT(DISTINCT innings_id) >= %s")
        params.append(req.min_innings)
    if req.min_wickets is not None:
        having_clauses.append("SUM(wkts) >= %s")
        params.append(req.min_wickets)
    if req.max_wickets is not None:
        having_clauses.append("SUM(wkts) <= %s")
        params.append(req.max_wickets)
    if req.min_runs is not None:
        having_clauses.append("SUM(runs) >= %s")
        params.append(req.min_runs)
    if req.max_runs is not None:
        having_clauses.append("SUM(runs) <= %s")
        params.append(req.max_runs)
    if req.min_balls is not None:
        having_clauses.append("SUM(balls) >= %s")
        params.append(req.min_balls)
    if req.max_balls is not None:
        having_clauses.append("SUM(balls) <= %s")
        params.append(req.max_balls)
    if req.min_no_balls is not None:
        having_clauses.append("SUM(nb) >= %s")
        params.append(req.min_no_balls)
    if req.min_wides is not None:
        having_clauses.append("SUM(wd) >= %s")
        params.append(req.min_wides)
    if req.min_fours is not None:
        having_clauses.append("SUM(fours) >= %s")
        params.append(req.min_fours)
    if req.min_sixes is not None:
        having_clauses.append("SUM(sixes) >= %s")
        params.append(req.min_sixes)

    # ── Opposing Matchups Filter ──────────────────────────
    matchup_clauses = []
    cte_sql = None
    cte_params = []
    if req.vs_top_limit:
        cte_sql, cte_params = build_top_opponents_cte(req, "batter")
        matchup_clauses.append("d.batter_id IN (SELECT batter_id FROM top_tournament_opponents)")
    if req.opposing_player_ids:
        ph = ", ".join(["%s"] * len(req.opposing_player_ids))
        matchup_clauses.append(f"d.batter_id IN ({ph})")
        params.extend(req.opposing_player_ids)
    if matchup_clauses:
        where_clauses.append(f"({' OR '.join(matchup_clauses)})")

    # ── Sort ──────────────────────────────────────────────
    # Moved to top

    where_sql = (" AND " + " AND ".join(where_clauses)) if where_clauses else ""
    having_sql = ("HAVING " + " AND ".join(having_clauses)) if having_clauses else ""

    player_join = "JOIN players p ON p.player_id = d.bowler_id" if join_players or req.group_by.startswith("player") else ""

    inn_stats_cte = f"""
    inn_stats AS (
        SELECT
            {group_by_expr} as group_key,
            MAX({group_label}) as label,
            MAX({group_sub}) as sub_label,
            MAX({group_player_id}) as player_id,
            i.match_id,
            i.innings_id,
            COALESCE(COUNT(w.wicket_id), 0) AS wkts,
            COALESCE(SUM(d.runs_batter + d.runs_extras), 0) AS runs,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball), 0) AS balls,
            COALESCE(COUNT(*) FILTER (WHERE d.is_noball), 0) AS nb,
            COALESCE(COUNT(*) FILTER (WHERE d.is_wide), 0) AS wd,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 4), 0) AS fours,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 6), 0) AS sixes,
            RANK() OVER (PARTITION BY i.innings_id ORDER BY COUNT(w.wicket_id) DESC, SUM(d.runs_batter + d.runs_extras) ASC) as innings_rank,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} = {TEAM_NORM_SQL.format(col="i.bowling_team")} THEN 1 ELSE 0 END as is_win,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} IS NOT NULL AND {TEAM_NORM_SQL.format(col="m.winner")} <> {TEAM_NORM_SQL.format(col="i.bowling_team")} AND {TEAM_NORM_SQL.format(col="m.winner")} NOT IN ('tie','draw','no result') THEN 1 ELSE 0 END as is_loss,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} = 'tie' THEN 1 ELSE 0 END as is_tie,
            CASE WHEN LOWER({TEAM_NORM_SQL.format(col="m.winner")}) = 'draw' THEN 1 ELSE 0 END as is_draw,
            CASE WHEN {TEAM_NORM_SQL.format(col="m.winner")} IS NULL OR LOWER({TEAM_NORM_SQL.format(col="m.winner")}) = 'no result' THEN 1 ELSE 0 END as is_nr
        FROM deliveries d
        JOIN innings i ON i.innings_id = d.innings_id
        JOIN matches m ON m.match_id = i.match_id
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN team_match_totals tmt ON tmt.innings_id = i.innings_id
        LEFT JOIN team_match_totals omt ON omt.match_id = i.match_id AND omt.innings_number = (CASE WHEN i.innings_number = 1 THEN 2 WHEN i.innings_number = 2 THEN 1 WHEN i.innings_number = 3 THEN 4 WHEN i.innings_number = 4 THEN 3 END)
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
            AND w.kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
        {player_join}
        WHERE 1=1 {where_sql}
        GROUP BY {group_by_expr}, i.match_id, i.innings_id, m.winner, i.bowling_team
    )
    """

    sql_select = f"""
    SELECT
        label,
        sub_label,
        player_id,
        MAX(match_id) as match_id,
        COUNT(DISTINCT match_id) AS matches,
        COUNT(DISTINCT innings_id) AS innings,
        SUM(wkts) AS wickets,
        SUM(runs) AS runs_conceded,
        SUM(balls) AS balls,
        (SUM(balls) / 6) + (SUM(balls) %% 6) / 10.0 AS overs,
        SUM(nb) AS no_balls,
        SUM(wd) AS wides,
        SUM(fours) as fours_conceded,
        SUM(sixes) as sixes_conceded,
        COUNT(*) FILTER (WHERE wkts >= 5) AS five_wicket_hauls,
        COUNT(*) FILTER (WHERE innings_rank = 1) AS top_wickets,
        SUM(is_win) as won,
        SUM(is_loss) as lost,
        SUM(is_tie) as tied,
        SUM(is_draw) as drawn,
        SUM(is_nr) as no_result,
        ROUND(SUM(is_win)::NUMERIC / NULLIF(SUM(is_win) + SUM(is_loss), 0) * 100, 2) as win_percentage,
        ROUND(SUM(runs)::NUMERIC / NULLIF(SUM(balls) / 6.0, 0), 2) AS economy,
        ROUND(SUM(runs)::NUMERIC / NULLIF(SUM(wkts), 0), 2) AS bowling_average,
        ROUND(SUM(balls)::NUMERIC / NULLIF(SUM(wkts), 0), 2) AS bowling_strike_rate
    FROM inn_stats
    GROUP BY label, sub_label, player_id, group_key
    {having_sql}
    ORDER BY {sort_col} {sort_dir} NULLS LAST
    """
    
    ctes = []
    if cte_sql:
        ctes.append(cte_sql)
    ctes.extend([IPL_TEAM_VENUES_CTE, VENUE_COUNTRY_MAP_CTE, TEAM_MATCH_TOTALS_CTE, inn_stats_cte])
    with_sql = "WITH " + ", ".join(ctes)

    if is_inner:
        sql = f"{with_sql} {sql_select}"
    else:
        sql = f"{with_sql} {sql_select} LIMIT %s"
        params.append(req.limit)

    return sql, cte_params + params


# ── Group-by helpers ──────────────────────────────────────────

def _get_group_by(group_by: str, join_players: bool) -> tuple[str, str, str, str]:
    """Return (group_expr, label_expr, sub_label_expr, player_id_expr) for batting."""
    tnorm = TEAM_NORM_SQL.format(col="i.batting_team")
    if group_by == "player":
        return (
            f"d.batter_id, p.name",
            "p.name",
            "''",
            "d.batter_id",
        )
    elif group_by == "team":
        return tnorm, tnorm, "NULL", "NULL"
    elif group_by == "venue":
        return "m.venue, m.city", "m.venue", "m.city", "NULL"
    elif group_by == "year":
        return (
            "EXTRACT(YEAR FROM m.date)::text",
            "EXTRACT(YEAR FROM m.date)::text",
            "NULL",
            "NULL",
        )
    elif group_by == "opposition":
        tnorm_opp = TEAM_NORM_SQL.format(col="i.bowling_team")
        return tnorm_opp, tnorm_opp, "NULL", "NULL"
    elif group_by == "phase":
        return "d.phase", "COALESCE(d.phase, 'unknown')", "NULL", "NULL"
    elif group_by == "match_stage":
        return "m.match_stage", "COALESCE(m.match_stage, 'League')", "NULL", "NULL"
    elif group_by == "city":
        return "m.city", "COALESCE(m.city, 'Unknown')", "NULL", "NULL"
    elif group_by == "competition":
        return "c.name", "COALESCE(c.name, 'Unknown')", "NULL", "NULL"
    elif group_by == "innings":
        return "i.innings_number", "CASE WHEN i.innings_number = 1 THEN '1st Innings' ELSE '2nd Innings' END", "NULL", "NULL"
    elif group_by == "player_year":
        year_expr = "EXTRACT(YEAR FROM m.date)::text"
        return (
            f"d.batter_id, p.name, {year_expr}",
            "p.name",
            year_expr,
            "d.batter_id",
        )
    elif group_by == "player_match":
        date_expr = "m.date::text"
        return (
            f"d.batter_id, p.name, (m.match_id::text || '-' || {date_expr})",
            "p.name",
            f"m.venue || ' (' || {date_expr} || ')'",
            "d.batter_id",
        )
    elif group_by == "player_team":
        return (
            f"d.batter_id, p.name, {tnorm}",
            "p.name",
            tnorm,
            "d.batter_id",
        )
    elif group_by == "player_opposition":
        tnorm_opp = TEAM_NORM_SQL.format(col="i.bowling_team")
        return (
            f"d.batter_id, p.name, {tnorm_opp}",
            "p.name",
            tnorm_opp,
            "d.batter_id",
        )
    elif group_by == "player_venue":
        return (
            f"d.batter_id, p.name, m.venue",
            "p.name",
            "m.venue",
            "d.batter_id",
        )
    elif group_by == "player_city":
        return (
            f"d.batter_id, p.name, m.city",
            "p.name",
            "m.city",
            "d.batter_id",
        )
    elif group_by == "player_competition":
        return (
            f"d.batter_id, p.name, c.name",
            "p.name",
            "c.name",
            "d.batter_id",
        )
    elif group_by == "player_match_stage":
        return (
            f"d.batter_id, p.name, m.match_stage",
            "p.name",
            "m.match_stage",
            "d.batter_id",
        )


    else:
        # default: player
        return (
            f"d.batter_id, p.name",
            "p.name",
            "''",
            "d.batter_id",
        )


def _get_group_by_bowling(group_by: str, join_players: bool) -> tuple[str, str, str, str]:
    """Return (group_expr, label_expr, sub_label_expr, player_id_expr) for bowling."""
    if group_by == "player":
        return (
            f"d.bowler_id, p.name",
            "p.name",
            "''",
            "d.bowler_id",
        )
    elif group_by == "team":
        tnorm = TEAM_NORM_SQL.format(col="i.bowling_team")
        return tnorm, tnorm, "NULL", "NULL"
    elif group_by == "venue":
        return "m.venue, m.city", "m.venue", "m.city", "NULL"
    elif group_by == "year":
        return (
            "EXTRACT(YEAR FROM m.date)::text",
            "EXTRACT(YEAR FROM m.date)::text",
            "NULL",
            "NULL",
        )
    elif group_by == "opposition":
        tnorm_opp = TEAM_NORM_SQL.format(col="i.batting_team")
        return tnorm_opp, tnorm_opp, "NULL", "NULL"
    elif group_by == "phase":
        return "d.phase", "COALESCE(d.phase, 'unknown')", "NULL", "NULL"
    elif group_by == "match_stage":
        return "m.match_stage", "COALESCE(m.match_stage, 'League')", "NULL", "NULL"
    elif group_by == "city":
        return "m.city", "COALESCE(m.city, 'Unknown')", "NULL", "NULL"
    elif group_by == "competition":
        return "c.name", "COALESCE(c.name, 'Unknown')", "NULL", "NULL"
    elif group_by == "innings":
        return "i.innings_number", "CASE WHEN i.innings_number = 1 THEN '1st Innings' ELSE '2nd Innings' END", "NULL", "NULL"
    elif group_by == "player_year":
        year_expr = "EXTRACT(YEAR FROM m.date)::text"
        return (
            f"d.bowler_id, p.name, {year_expr}",
            "p.name",
            year_expr,
            "d.bowler_id",
        )
    elif group_by == "player_match":
        date_expr = "m.date::text"
        return (
            f"d.bowler_id, p.name, (m.match_id::text || '-' || {date_expr})",
            "p.name",
            f"m.venue || ' (' || {date_expr} || ')'",
            "d.bowler_id",
        )
    elif group_by == "player_team":
        tnorm = TEAM_NORM_SQL.format(col="i.bowling_team")
        return (
            f"d.bowler_id, p.name, {tnorm}",
            "p.name",
            tnorm,
            "d.bowler_id",
        )
    elif group_by == "player_opposition":
        tnorm_opp = TEAM_NORM_SQL.format(col="i.batting_team")
        return (
            f"d.bowler_id, p.name, {tnorm_opp}",
            "p.name",
            tnorm_opp,
            "d.bowler_id",
        )
    elif group_by == "player_venue":
        return (
            f"d.bowler_id, p.name, m.venue",
            "p.name",
            "m.venue",
            "d.bowler_id",
        )
    elif group_by == "player_city":
        return (
            f"d.bowler_id, p.name, m.city",
            "p.name",
            "m.city",
            "d.bowler_id",
        )
    elif group_by == "player_competition":
        return (
            f"d.bowler_id, p.name, c.name",
            "p.name",
            "c.name",
            "d.bowler_id",
        )
    elif group_by == "player_match_stage":
        return (
            f"d.bowler_id, p.name, m.match_stage",
            "p.name",
            "m.match_stage",
            "d.bowler_id",
        )


    else:
        return (
            "d.bowler_id, p.name",
            "p.name",
            "''",
            "d.bowler_id",
        )


def build_team_query(req: StatBuilderRequest, stat_type: str = "team") -> tuple[str, list]:
    normalize_formats(req)
    if stat_type not in ("team", "team_bat", "team_bowl", "team_compare"):
        stat_type = "team"
    conditions = []
    base_params = []
    # Format filter (use the same bucket expression as batting/bowling)

    if req.venue_search:
        conditions.append("t.venue ILIKE %s")
        base_params.append(f"%{req.venue_search}%")
    if req.year_from is not None:
        conditions.append("EXTRACT(YEAR FROM t.date) >= %s")
        base_params.append(req.year_from)
    if req.year_to is not None:
        conditions.append("EXTRACT(YEAR FROM t.date) <= %s")
        base_params.append(req.year_to)
    if req.tournaments:
        conditions.append("t.competition_name = ANY(%s)")
        base_params.append(req.tournaments)
    if req.day_night and req.day_night != "Any":
        conditions.append("t.day_night = %s")
        base_params.append(req.day_night)

    # V2 filters for team query
    if req.venues:
        conditions.append("t.venue = ANY(%s)")
        base_params.append(req.venues)
    if req.countries:
        ph = ", ".join(["%s"] * len(req.countries))
        conditions.append(f"t.venue IN (SELECT venue FROM venue_country_map WHERE country IN ({ph}))")
        base_params.extend(req.countries)
    if req.formats:
        conditions.append(f"({GET_FORMAT_BUCKET_SQL('t.competition_name', 't.format')}) = ANY(%s)")
        base_params.append(req.formats)

    if conditions:
        where_sql = " AND " + " AND ".join(conditions)

    if req.score_threshold is not None:
        if req.team_score_mode == "scored":
            conditions.append("t.full_runs_scored >= %s")
            base_params.append(req.score_threshold)
        elif req.team_score_mode == "conceded":
            conditions.append("t.full_runs_conceded >= %s")
            base_params.append(req.score_threshold)
        elif req.team_score_mode == "diff":
            conditions.append("(t.full_runs_scored - t.full_runs_conceded) >= %s")
            base_params.append(req.score_threshold)

    where_sql = ""
    if conditions:
        where_sql = " AND " + " AND ".join(conditions)

    cte_conditions = []
    cte_params = []

    if req.ground_type and req.ground_type != "Any":
        cte_conditions.append("t.ground_type = %s")
        cte_params.append(req.ground_type)

    # Toss handling: match frontend values "Won", "Lost" or legacy "win_bat", etc.
    if req.toss in ["Won", "win_bat", "win_bowl"]:
        if req.toss == "win_bat":
            cte_conditions.append("t.toss_winner = t.team AND t.toss_decision = 'bat'")
        elif req.toss == "win_bowl":
            cte_conditions.append("t.toss_winner = t.team AND t.toss_decision = 'field'")
        else:
            cte_conditions.append("t.toss_winner = t.team")
    elif req.toss in ["Lost", "lose"]:
        cte_conditions.append("t.toss_winner = t.opposition")

    if req.opposition:
        cte_conditions.append("t.opposition = ANY(%s)")
        cte_params.append(req.opposition)

    if req.teams:
        cte_conditions.append("t.team = ANY(%s)")
        cte_params.append(req.teams)

    if req.match_result:
        res_conds = []
        for r in req.match_result:
            rl = r.lower()
            if rl == "won": res_conds.append("t.winner = t.team")
            elif rl == "lost": res_conds.append("t.winner = t.opposition")
            elif rl in ["tied", "tie"]: res_conds.append("t.winner = 'tie'")
            elif rl in ["drawn", "draw"]: res_conds.append("t.winner = 'draw'")
            elif rl in ["no_result", "nr"]: res_conds.append("(t.winner IS NULL OR t.winner = 'no result')")
        if res_conds:
            cte_conditions.append("(" + " OR ".join(res_conds) + ")")

    if req.innings:
        inn_parts = []
        for inn in req.innings:
            if inn == "1st":
                inn_parts.append("t.first_innings_no = 1")
            elif inn == "2nd":
                inn_parts.append("t.first_innings_no = 2")
            elif inn == "Chase":
                inn_parts.append("t.first_innings_no = 2")
            elif inn == "Setting":
                inn_parts.append("t.first_innings_no = 1")
        if inn_parts:
            cte_conditions.append("(" + " OR ".join(inn_parts) + ")")

    cte_where_sql = ""
    if cte_conditions:
        cte_where_sql = " AND " + " AND ".join(cte_conditions)

    _apply_v2_filters(
        req, cte_conditions, cte_params, 
        match_alias="t", 
        stat_type="team", 
        team_runs_col="t.runs_scored",
        opp_runs_col="t.runs_conceded",
        team_wkts_col="t.wickets_lost",
        opp_wkts_col="t.wickets_taken"
    )
    
    if cte_conditions:
        cte_where_sql = " AND " + " AND ".join(cte_conditions)

    # Group by
    group_by = req.group_by or "team"
    label_expr = "t.team"
    group_expr = "t.team"
    sub_label_expr = "''"

    if group_by == "venue":
        label_expr = "t.venue"
        group_expr = "t.venue"
    elif group_by == "year":
        label_expr = "EXTRACT(YEAR FROM t.date)::text"
        group_expr = "EXTRACT(YEAR FROM t.date)"
    elif group_by == "opposition":
        label_expr = "t.opposition"
        group_expr = "t.opposition"
    elif group_by == "competition":
        label_expr = "t.competition_name"
        group_expr = "t.competition_name"
    elif group_by == "match_stage":
        label_expr = "COALESCE(t.match_stage, 'League')"
        group_expr = "t.match_stage"
    elif group_by == "city":
        label_expr = "t.city"
        group_expr = "t.city"
    elif group_by == "match":
        label_expr = "t.team || ' (' || COALESCE(t.score_str, '0') || ') vs ' || t.opposition || ' (' || COALESCE(t.opp_score_str, '0') || ')'"
        group_expr = "t.match_id, t.team, t.opposition, t.date, t.venue, t.score_str, t.opp_score_str"
        sub_label_expr = "t.date::text || ' @ ' || t.venue"

    # ── Sort ──────────────────────────────────────────────
    team_sort_map_results = {
        "rank": "win_percentage",
        "label": "label",
        "matches_played": "matches_played",
        "won": "won",
        "lost": "lost",
        "tied": "tied",
        "drawn": "drawn",
        "no_result": "no_result",
        "win_percentage": "win_percentage",
    }

    team_sort_map_bat = {
        "rank": "total_runs_scored",
        "label": "label",
        "matches_played": "matches_played",
        "total_runs_scored": "total_runs_scored",
        "batting_average": "batting_average",
        "batting_run_rate": "batting_run_rate",
        "batting_strike_rate": "batting_strike_rate",
        "wickets_lost": "wickets_lost",
        "balls_faced": "balls_faced",
        "fours_hit": "fours_hit",
        "sixes_hit": "sixes_hit",
        "partnership_50s": "partnership_50s",
        "partnership_100s": "partnership_100s",
        "highest_score": "highest_score",
        "won": "won",
        "win_percentage": "win_percentage",
    }

    team_sort_map_bowl = {
        "rank": "wickets_taken",
        "label": "label",
        "matches_played": "matches_played",
        "total_runs_conceded": "total_runs_conceded",
        "wickets_taken": "wickets_taken",
        "bowling_average": "bowling_average",
        "bowling_run_rate": "bowling_run_rate",
        "bowling_strike_rate": "bowling_strike_rate",
        "balls_bowled": "balls_bowled",
        "fours_conceded": "fours_conceded",
        "sixes_conceded": "sixes_conceded",
        "back_to_back_wickets": "back_to_back_wickets",
        "lowest_score": "lowest_score",
        "won": "won",
        "win_percentage": "win_percentage",
    }

    team_sort_map_compare = {
        "rank": "run_diff",
        "label": "label",
        "matches_played": "matches_played",
        "run_diff": "run_diff",
        "run_rate_diff": "run_rate_diff",
        "powerplay_diff": "powerplay_diff",
        "death_diff": "death_diff",
        "big_score_diff": "big_score_diff",
        "won": "won",
        "win_percentage": "win_percentage",
    }

    if stat_type == "team_bat":
        sort_map = team_sort_map_bat
        default_sort = "total_runs_scored"
    elif stat_type == "team_bowl":
        sort_map = team_sort_map_bowl
        default_sort = "wickets_taken"
    elif stat_type == "team_compare":
        sort_map = team_sort_map_compare
        default_sort = "run_diff"
    else:
        sort_map = team_sort_map_results
        default_sort = "win_percentage"

    if req.sort_by == "rank":
        sort_col = default_sort
        sort_dir = "DESC"
    else:
        sort_col = sort_map.get(req.sort_by, default_sort)
        sort_dir = "DESC" if req.sort_dir == "desc" else "ASC"

    having_clauses = []
    if req.min_innings and req.min_innings > 0:
        having_clauses.append("COUNT(t.match_id) >= %s")
        cte_params.append(req.min_innings)
    if req.min_fours is not None:
        having_clauses.append("SUM(t.fours_hit) >= %s")
        cte_params.append(req.min_fours)
    if req.min_sixes is not None:
        having_clauses.append("SUM(t.sixes_hit) >= %s")
        cte_params.append(req.min_sixes)

    having_sql = ("HAVING " + " AND ".join(having_clauses)) if having_clauses else ""

    # ── Phase / Over Range Filter (Team Level) ──────────
    phase_where = ""
    if req.phases:
        phase_list = "', '".join([p.lower() for p in req.phases])
        phase_where = f"AND d.phase IN ('{phase_list}')"
    elif req.over_from is not None or req.over_to is not None:
        if req.over_from is not None:
            phase_where += f" AND d.over_number >= {req.over_from - 1}"
        if req.over_to is not None:
            phase_where += f" AND d.over_number <= {req.over_to - 1}"

    team_match_totals_full_cte = """
    team_match_totals_full AS (
        SELECT 
            i.match_id, 
            i.batting_team, 
            SUM(d.runs_total) as full_runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('retired hurt', 'retired out')) as full_wickets
        FROM innings i
        LEFT JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        GROUP BY i.match_id, i.batting_team
    )
    """

    team_match_totals_phase_cte = f"""
    team_match_totals AS (
        SELECT 
            i.innings_id,
            i.match_id, 
            i.batting_team, 
            i.innings_number,
            COALESCE(SUM(d.runs_total), 0) as total_runs,
            COUNT(w.wicket_id) FILTER (WHERE w.kind NOT IN ('retired hurt', 'retired out')) as total_wickets,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 4), 0) as fours,
            COALESCE(COUNT(*) FILTER (WHERE d.runs_batter = 6), 0) as sixes,
            COALESCE(COUNT(*) FILTER (WHERE NOT d.is_wide AND NOT d.is_noball), 0) as total_balls
        FROM innings i
        LEFT JOIN deliveries d ON d.innings_id = i.innings_id
        LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
        WHERE 1=1 {phase_where}
        GROUP BY i.innings_id, i.match_id, i.batting_team, i.innings_number
    )
    """

    # ── Partnership Counts (V4) ──────────────────────────
    partnership_stats_cte = f"""
    team_partnership_stats AS (
        SELECT 
            match_id,
            batting_team,
            COUNT(*) FILTER (WHERE p_runs >= 50) as p_50s,
            COUNT(*) FILTER (WHERE p_runs >= 100) as p_100s
        FROM partnership_aggregates
        WHERE (%s IS NULL OR partnership_number = %s)
        GROUP BY match_id, batting_team
    )
    """
    partnership_params = [req.partnership_number, req.partnership_number]

    # ── Sequential Wickets (V4) ─────────────────────────
    sequential_wickets_final_cte = """
    team_sequential_wickets AS (
        SELECT 
            match_id,
            bowling_team,
            COUNT(*) AS b2b_wickets
        FROM sequential_wickets
        WHERE wicket_id IS NOT NULL AND prev_wicket_id IS NOT NULL
        GROUP BY match_id, bowling_team
    )
    """

    result_cols = [
        f"{label_expr} AS label",
        f"{sub_label_expr} AS sub_label",
        "COUNT(t.match_id) AS matches_played",
        "COUNT(*) FILTER (WHERE t.winner = t.team) AS won",
        "COUNT(*) FILTER (WHERE t.winner = t.opposition) AS lost",
        "COUNT(*) FILTER (WHERE t.winner = 'tie') AS tied",
        "COUNT(*) FILTER (WHERE LOWER(t.winner) = 'draw') AS drawn",
        "COUNT(*) FILTER (WHERE t.winner IS NULL OR LOWER(t.winner) = 'no result') AS no_result",
        "ROUND("
        "    COUNT(*) FILTER (WHERE t.winner = t.team)::NUMERIC / "
        "    NULLIF("
        "        COUNT(*) FILTER (WHERE t.winner = t.team) + "
        "        COUNT(*) FILTER (WHERE t.winner = t.opposition), 0"
        "    ) * 100"
        ", 2) AS win_percentage",
    ]

    batting_cols = [
        "MAX(t.runs_scored) AS highest_score",
        "SUM(t.runs_scored) AS total_runs_scored",
        "SUM(t.wickets_lost) AS wickets_lost",
        "SUM(t.fours_hit) as fours_hit",
        "SUM(t.sixes_hit) as sixes_hit",
        "SUM(t.partnership_50s) as partnership_50s",
        "SUM(t.partnership_100s) as partnership_100s",
        "ROUND(SUM(t.runs_scored)::NUMERIC / NULLIF(SUM(t.wickets_lost), 0), 2) AS batting_average",
        "ROUND(SUM(t.runs_scored)::NUMERIC / NULLIF(SUM(t.balls_faced), 0) * 100, 2) AS batting_strike_rate",
        "ROUND(SUM(t.runs_scored)::NUMERIC / NULLIF(SUM(t.balls_faced) / 6.0, 0), 2) AS batting_run_rate",
        "SUM(t.balls_faced) as balls_faced",
        "(MAX(ARRAY[t.runs_scored, t.wickets_lost]))[2] AS hs_wickets",
    ]

    bowling_cols = [
        "MIN(t.runs_conceded) AS lowest_score",
        "SUM(t.runs_conceded) AS total_runs_conceded",
        "SUM(t.wickets_taken) AS wickets_taken",
        "SUM(t.fours_conceded) as fours_conceded",
        "SUM(t.sixes_conceded) as sixes_conceded",
        "SUM(t.back_to_back_wickets) as back_to_back_wickets",
        "ROUND(SUM(t.runs_conceded)::NUMERIC / NULLIF(SUM(t.wickets_taken), 0), 2) AS bowling_average",
        "ROUND(SUM(t.balls_bowled)::NUMERIC / NULLIF(SUM(t.wickets_taken), 0), 2) AS bowling_strike_rate",
        "ROUND(SUM(t.runs_conceded)::NUMERIC / NULLIF(SUM(t.balls_bowled) / 6.0, 0), 2) AS bowling_run_rate",
        "SUM(t.balls_bowled) as balls_bowled",
        "(MIN(ARRAY[t.runs_scored, t.wickets_lost]))[2] AS ls_wickets",
    ]

    compare_cols = [
        "SUM(t.runs_scored) AS runs_for",
        "SUM(t.runs_conceded) AS runs_against",
        "SUM(t.runs_scored) - SUM(t.runs_conceded) AS run_diff",
        "ROUND(SUM(t.runs_scored)::NUMERIC / NULLIF(SUM(t.balls_faced) / 6.0, 0), 2) AS run_rate_for",
        "ROUND(SUM(t.runs_conceded)::NUMERIC / NULLIF(SUM(t.balls_bowled) / 6.0, 0), 2) AS run_rate_against",
        "ROUND((SUM(t.runs_scored)::NUMERIC / NULLIF(SUM(t.balls_faced) / 6.0, 1)) - (SUM(t.runs_conceded)::NUMERIC / NULLIF(SUM(t.balls_bowled) / 6.0, 1)), 2) AS run_rate_diff",
        "SUM(t.wickets_lost) AS wickets_lost",
        "SUM(t.wickets_taken) AS wickets_taken"
    ]

    if stat_type == "team_bat":
        select_cols = result_cols + batting_cols
    elif stat_type == "team_bowl":
        select_cols = result_cols + bowling_cols
    elif stat_type == "team_compare":
        select_cols = result_cols + compare_cols
    else:
        select_cols = result_cols

    select_sql = ",\n        ".join(select_cols)

    sql = f"""
    WITH {IPL_TEAM_VENUES_CTE},
         {VENUE_COUNTRY_MAP_CTE},
         {PARTNERSHIP_BASE_CTE},
         {PARTNERSHIP_AGGREGATE_CTE},
         {partnership_stats_cte},
         {SEQUENTIAL_WICKETS_CTE},
         {sequential_wickets_final_cte},
         {team_match_totals_full_cte},
         {team_match_totals_phase_cte},
         {TEAM_MATCH_AGGREGATE_CTE},
    unpivoted_matches AS (
        SELECT * FROM (
        SELECT 
            m.match_id, m.date, m.venue, m.city, 
            {TEAM_NORM_SQL.format(col="m.winner")} AS winner, 
            {TEAM_NORM_SQL.format(col="m.toss_winner")} AS toss_winner, 
            m.toss_decision,
            m.day_night, m.format, c.name AS competition_name, m.match_stage,
            m.match_number, m.match_group, m.playing_xi, m.player_of_match,
            m.team1 AS team1, m.team2 AS team2,
            {TEAM_NORM_SQL.format(col="m.team1")} AS team, 
            {TEAM_NORM_SQL.format(col="m.team2")} AS opposition,
            {GROUND_TYPE_SQL("m.team1", "m.team2")} AS ground_type,
            m.win_by_runs, m.win_by_wickets,
            COALESCE(t1.total_runs, 0) as runs_scored,
            COALESCE(t2.total_runs, 0) as runs_conceded,
            COALESCE(t1.total_wickets, 0) as wickets_lost,
            COALESCE(t2.total_wickets, 0) as wickets_taken,
            COALESCE(tf1.full_runs, 0) as full_runs_scored,
            COALESCE(tf2.full_runs, 0) as full_runs_conceded,
            COALESCE(tf1.full_wickets, 0) as full_wickets_lost,
            COALESCE(tf2.full_wickets, 0) as full_wickets_taken,
            t1.score_str,
            t2.score_str as opp_score_str,
            t1.first_innings_no,
            COALESCE(t1.fours, 0) as fours_hit,
            COALESCE(t1.sixes, 0) as sixes_hit,
            COALESCE(t2.fours, 0) as fours_conceded,
            COALESCE(t2.sixes, 0) as sixes_conceded,
            COALESCE(t1.total_balls, 0) as balls_faced,
            COALESCE(t2.total_balls, 0) as balls_bowled,
            COALESCE(ps1.p_50s, 0) as partnership_50s,
            COALESCE(ps1.p_100s, 0) as partnership_100s,
            COALESCE(sw2.b2b_wickets, 0) as back_to_back_wickets,
            m.is_official
        FROM matches m
        LEFT JOIN competitions c ON m.competition_id = c.competition_id
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        LEFT JOIN team_match_aggregates t1 ON t1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="t1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        LEFT JOIN team_match_aggregates t2 ON t2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="t2.batting_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        LEFT JOIN team_match_totals_full tf1 ON tf1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="tf1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        LEFT JOIN team_match_totals_full tf2 ON tf2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="tf2.batting_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        LEFT JOIN team_partnership_stats ps1 ON ps1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="ps1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        LEFT JOIN team_sequential_wickets sw2 ON sw2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="sw2.bowling_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        WHERE 1=1
        
        UNION ALL
        
        SELECT 
            m.match_id, m.date, m.venue, m.city, 
            {TEAM_NORM_SQL.format(col="m.winner")} AS winner, 
            {TEAM_NORM_SQL.format(col="m.toss_winner")} AS toss_winner, 
            m.toss_decision,
            m.day_night, m.format, c.name AS competition_name, m.match_stage,
            m.match_number, m.match_group, m.playing_xi, m.player_of_match,
            m.team1 AS team1, m.team2 AS team2,
            {TEAM_NORM_SQL.format(col="m.team2")} AS team, 
            {TEAM_NORM_SQL.format(col="m.team1")} AS opposition,
            {GROUND_TYPE_SQL("m.team2", "m.team1")} AS ground_type,
            m.win_by_runs, m.win_by_wickets,
            COALESCE(t2.total_runs, 0) as runs_scored,
            COALESCE(t1.total_runs, 0) as runs_conceded,
            COALESCE(t2.total_wickets, 0) as wickets_lost,
            COALESCE(t1.total_wickets, 0) as wickets_taken,
            COALESCE(tf2.full_runs, 0) as full_runs_scored,
            COALESCE(tf1.full_runs, 0) as full_runs_conceded,
            COALESCE(tf2.full_wickets, 0) as full_wickets_lost,
            COALESCE(tf1.full_wickets, 0) as full_wickets_taken,
            t2.score_str,
            t1.score_str as opp_score_str,
            t2.first_innings_no,
            COALESCE(t2.fours, 0) as fours_hit,
            COALESCE(t2.sixes, 0) as sixes_hit,
            COALESCE(t1.fours, 0) as fours_conceded,
            COALESCE(t1.sixes, 0) as sixes_conceded,
            COALESCE(t2.total_balls, 0) as balls_faced,
            COALESCE(t1.total_balls, 0) as balls_bowled,
            COALESCE(ps2.p_50s, 0) as partnership_50s,
            COALESCE(ps2.p_100s, 0) as partnership_100s,
            COALESCE(sw1.b2b_wickets, 0) as back_to_back_wickets,
            m.is_official
        FROM matches m
        LEFT JOIN competitions c ON m.competition_id = c.competition_id
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        LEFT JOIN team_match_aggregates t1 ON t1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="t1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        LEFT JOIN team_match_aggregates t2 ON t2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="t2.batting_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        LEFT JOIN team_match_totals_full tf1 ON tf1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="tf1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
        LEFT JOIN team_match_totals_full tf2 ON tf2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="tf2.batting_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        LEFT JOIN team_partnership_stats ps2 ON ps2.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="ps2.batting_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        LEFT JOIN team_sequential_wickets sw1 ON sw1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="sw1.bowling_team")} = {TEAM_NORM_SQL.format(col="m.team2")}
        ) t
        WHERE 1=1 {where_sql}
    )
    SELECT
        {select_sql}
    FROM unpivoted_matches t
    WHERE 1=1 {cte_where_sql}
    GROUP BY {group_expr}
    {having_sql}
    ORDER BY {sort_col} {sort_dir} NULLS LAST
    LIMIT %s
    """

    # Final parameter assembly
    # Order: 
    # 1. partnership_params (for team_partnership_stats CTE)
    # 2. base_params (for unpivoted_matches CTE)
    # 3. cte_params (for final SELECT WHERE filters)
    # 4. limit
    final_params = partnership_params + base_params + cte_params
    final_params.append(req.limit)

    return sql, final_params

# ── Shared V2 filter clauses (used by batting, bowling, team) ─

def _apply_v2_filters(req: StatBuilderRequest, where_clauses: list[str], params: list, match_alias: str = "m", stat_type: str = "team", innings_alias: str = "i", team_col: str = None, opp_col: str = None, focus_team_val: str = None, focus_team_col: str = None, team_runs_col: str = None, opp_runs_col: str = None, team_wkts_col: str = None, opp_wkts_col: str = None):
    """Append WHERE clauses for all V2 filter fields. Mutates where_clauses and params in-place."""
    m = match_alias

    if not req.include_unofficial:
        where_clauses.append(f"{m}.is_official = true")

    if req.formats:
        ph = ", ".join(["%s"] * len(req.formats))
        comp_col = "c.name"
        match_col = f"{m}.format"
        if m == "t":
            comp_col = "t.competition_name"
            match_col = "t.format"
        
        where_clauses.append(f"({GET_FORMAT_BUCKET_SQL(comp_col, match_col)}) IN ({ph})")
        params.extend(req.formats)

    if req.tournaments:
        ph = ", ".join(["%s"] * len(req.tournaments))
        comp_col = "c.name"
        if m == "t":
            comp_col = "t.competition_name"
        where_clauses.append(f"{comp_col} IN ({ph})")
        params.extend(req.tournaments)

    if req.match_stages:
        ph = ", ".join(["%s"] * len(req.match_stages))
        where_clauses.append(f"{m}.match_stage IN ({ph})")
        params.extend(req.match_stages)

    if req.match_groups:
        ph = ", ".join(["%s"] * len(req.match_groups))
        where_clauses.append(f"{m}.match_group IN ({ph})")
        params.extend(req.match_groups)

    if req.cities:
        ph = ", ".join(["%s"] * len(req.cities))
        where_clauses.append(f"{m}.city IN ({ph})")
        params.extend(req.cities)

    if req.venues:
        ph = ", ".join(["%s"] * len(req.venues))
        where_clauses.append(f"{m}.venue IN ({ph})")
        params.extend(req.venues)

    if req.venue_search:
        where_clauses.append(f"{m}.venue ILIKE %s")
        params.append(f"%{req.venue_search}%")

    if req.countries:
        ph = ", ".join(["%s"] * len(req.countries))
        where_clauses.append(f"{m}.venue IN (SELECT venue FROM venue_country_map WHERE country IN ({ph}))")
        params.extend(req.countries)

    if req.ground_type and req.ground_type != "Any":
        if stat_type == "team":
            where_clauses.append(f"{m}.ground_type = %s")
            params.append(req.ground_type)
        elif stat_type == "h2h" and focus_team_val and focus_team_col:
            # For H2H, ground type is relative to the focus team
            # Focus team could be team1 or team2 in the row
            t1_expr = GROUND_TYPE_SQL(f"{m}.team1", f"{m}.team2")
            t2_expr = GROUND_TYPE_SQL(f"{m}.team2", f"{m}.team1")
            where_clauses.append(f"(CASE WHEN {focus_team_col} = %s THEN {t1_expr} ELSE {t2_expr} END) = %s")
            params.extend([focus_team_val, req.ground_type])
        else:
            # Determine team columns for ground type calculation
            t_col = team_col
            o_col = opp_col
            
            if not t_col or not o_col:
                if stat_type == "bat":
                    t_col, o_col = f"{innings_alias}.batting_team", f"{innings_alias}.bowling_team"
                elif stat_type == "bowl":
                    t_col, o_col = f"{innings_alias}.bowling_team", f"{innings_alias}.batting_team"

            if t_col and o_col:
                where_clauses.append(f"{GROUND_TYPE_SQL(t_col, o_col)} = %s")
                params.append(req.ground_type)

    if req.opposition:
        if stat_type == "bat":
            ph = ", ".join(["%s"] * len(req.opposition))
            where_clauses.append(f"{TEAM_NORM_SQL.format(col=f'{innings_alias}.bowling_team')} IN ({ph})")
            params.extend(req.opposition)
        elif stat_type == "bowl":
            ph = ", ".join(["%s"] * len(req.opposition))
            where_clauses.append(f"{TEAM_NORM_SQL.format(col=f'{innings_alias}.batting_team')} IN ({ph})")
            params.extend(req.opposition)

    if req.teams:
        if stat_type == "bat":
            ph = ", ".join(["%s"] * len(req.teams))
            where_clauses.append(f"{TEAM_NORM_SQL.format(col=f'{innings_alias}.batting_team')} IN ({ph})")
            params.extend(req.teams)
        elif stat_type == "bowl":
            ph = ", ".join(["%s"] * len(req.teams))
            where_clauses.append(f"{TEAM_NORM_SQL.format(col=f'{innings_alias}.bowling_team')} IN ({ph})")
            params.extend(req.teams)
        else:
            team_parts = []
            T1N = TEAM_NORM_SQL.format(col=f"{m}.team1")
            T2N = TEAM_NORM_SQL.format(col=f"{m}.team2")
            for t in req.teams:
                team_parts.append(f"({T1N} = %s OR {T2N} = %s)")
                params.extend([t, t])
            where_clauses.append(f"({' OR '.join(team_parts)})")

    if req.players_involved:
        for p_input in req.players_involved:
            # If it looks like a hash ID, use it directly, else search by name
            if len(p_input) == 8 and p_input.isalnum() and not any(c.isupper() for c in p_input):
                where_clauses.append(f"{m}.playing_xi::text ILIKE %s")
                params.append(f"%{p_input}%")
            else:
                where_clauses.append(f"EXISTS (SELECT 1 FROM players p_involved WHERE p_involved.name ILIKE %s AND {m}.playing_xi::text ILIKE '%%' || p_involved.player_id || '%%')")
                params.append(f"%{p_input}%")

    if req.player_name:
        if stat_type in ("bat", "bowl"):
            # For batting/bowling, we expect 'p' to be joined as players table
            where_clauses.append("p.name ILIKE %s")
            params.append(f"%{req.player_name}%")
        else:
            # For team results or H2H, player_name filters matches where they played
            where_clauses.append(f"EXISTS (SELECT 1 FROM players p_primary WHERE p_primary.name ILIKE %s AND {m}.playing_xi::text ILIKE '%%' || p_primary.player_id || '%%')")
            params.append(f"%{req.player_name}%")

    if req.date_from:
        where_clauses.append(f"{m}.date >= %s")
        params.append(req.date_from)
    if req.date_to:
        where_clauses.append(f"{m}.date <= %s")
        params.append(req.date_to)

    if req.match_month:
        where_clauses.append(f"EXTRACT(MONTH FROM {m}.date) = %s")
        params.append(req.match_month)
    if req.match_day:
        where_clauses.append(f"EXTRACT(DAY FROM {m}.date) = %s")
        params.append(req.match_day)

    if req.match_number_from is not None:
        where_clauses.append(f"{m}.match_number >= %s")
        params.append(req.match_number_from)
    if req.match_number_to is not None:
        where_clauses.append(f"{m}.match_number <= %s")
        params.append(req.match_number_to)

    if req.toss_decision:
        where_clauses.append(f"{m}.toss_decision = %s")
        params.append(req.toss_decision)

    if req.player_of_match_only:
        where_clauses.append(f"{m}.player_of_match IS NOT NULL")

    if stat_type in ("bat", "bowl"):
        if req.super_over_only:
            where_clauses.append(f"({innings_alias}.innings_number > 2 AND {m}.format <> 'Test')")
        else:
            where_clauses.append(f"({innings_alias}.innings_number <= 2 OR {m}.format = 'Test')")

    if req.min_win_by_runs is not None:
        where_clauses.append(f"COALESCE({m}.win_by_runs, 0) >= %s")
        params.append(req.min_win_by_runs)
    if req.max_win_by_runs is not None:
        where_clauses.append(f"COALESCE({m}.win_by_runs, 0) <= %s")
        params.append(req.max_win_by_runs)
    if req.min_win_by_wickets is not None:
        where_clauses.append(f"COALESCE({m}.win_by_wickets, 0) >= %s")
        params.append(req.min_win_by_wickets)
    if req.max_win_by_wickets is not None:
        where_clauses.append(f"COALESCE({m}.win_by_wickets, 0) <= %s")
        params.append(req.max_win_by_wickets)

    # ── Team Run/Wicket Filters (V3) ──────────────────────────
    if req.min_team_runs is not None and team_runs_col:
        where_clauses.append(f"{team_runs_col} >= %s")
        params.append(req.min_team_runs)
    if req.max_team_runs is not None and team_runs_col:
        where_clauses.append(f"{team_runs_col} <= %s")
        params.append(req.max_team_runs)
    if req.min_opp_runs is not None and opp_runs_col:
        where_clauses.append(f"{opp_runs_col} >= %s")
        params.append(req.min_opp_runs)
    if req.max_opp_runs is not None and opp_runs_col:
        where_clauses.append(f"{opp_runs_col} <= %s")
        params.append(req.max_opp_runs)
    if req.min_team_wickets is not None and team_wkts_col:
        where_clauses.append(f"{team_wkts_col} >= %s")
        params.append(req.min_team_wickets)
    if req.max_team_wickets is not None and team_wkts_col:
        where_clauses.append(f"{team_wkts_col} <= %s")
        params.append(req.max_team_wickets)
    if req.min_opp_wickets is not None and opp_wkts_col:
        where_clauses.append(f"{opp_wkts_col} >= %s")
        params.append(req.min_opp_wickets)
    if req.max_opp_wickets is not None and opp_wkts_col:
        where_clauses.append(f"{opp_wkts_col} <= %s")
        params.append(req.max_opp_wickets)

    # ── Semantic Situational Filters ──────────────────────────
    if req.min_defending_runs is not None and team_runs_col:
        where_clauses.append(f"{team_runs_col} >= %s")
        params.append(req.min_defending_runs)
        if stat_type in ("bat", "bowl"):
            where_clauses.append(f"{innings_alias}.innings_number = 1")
        elif stat_type == "team":
            where_clauses.append(f"{match_alias}.first_innings_no = 1")

    if req.min_chasing_runs is not None and opp_runs_col:
        # Chasing X means the target was X. Target = Opponent Runs + 1.
        # So Opponent Runs must be at least X - 1.
        where_clauses.append(f"{opp_runs_col} >= %s")
        params.append(req.min_chasing_runs - 1)
        if stat_type in ("bat", "bowl"):
            where_clauses.append(f"{innings_alias}.innings_number = 2")
        elif stat_type == "team":
            where_clauses.append(f"{match_alias}.first_innings_no = 2")


# ── Batting position CTE and filter ──────────────────────────

BATTING_ORDER_CTE = """
    first_balls AS (
        SELECT 
            innings_id, 
            batter_id, 
            non_striker_id,
            ROW_NUMBER() OVER (PARTITION BY innings_id ORDER BY over_number, ball_number) as ball_rank
        FROM deliveries
    ),
    openers AS (
        SELECT innings_id, batter_id as player_id, 1 as pos FROM first_balls WHERE ball_rank = 1
        UNION ALL
        SELECT innings_id, non_striker_id as player_id, 2 as pos FROM first_balls WHERE ball_rank = 1
    ),
    batter_appearances AS (
        SELECT innings_id, batter_id, MIN(over_number * 100 + ball_number) as first_ball
        FROM deliveries
        GROUP BY innings_id, batter_id
    ),
    batter_positions AS (
        SELECT innings_id, batter_id, bat_position FROM (
            SELECT innings_id, player_id as batter_id, pos as bat_position FROM openers
            UNION ALL
            SELECT 
                ba.innings_id, 
                ba.batter_id,
                DENSE_RANK() OVER (PARTITION BY ba.innings_id ORDER BY ba.first_ball ASC) + 2 as bat_position
            FROM batter_appearances ba
            LEFT JOIN openers o ON o.innings_id = ba.innings_id AND o.player_id = ba.batter_id
            WHERE o.player_id IS NULL
        ) p
    )
"""

BATTING_POSITION_RANGES = {
    "opener":    (1, 2),
    "top_order": (1, 3),
    "middle":    (4, 5),
    "lower":     (6, 7),
    "tail":      (8, 11),
}


# ── Dynamic meta queries ─────────────────────────────────────

def build_meta_queries(formats=None, tournaments=None, countries=None, year_from=None, year_to=None, include_unofficial=False):
    """Build dynamic meta SQL queries filtered by current selections."""
    if formats:
        expanded = []
        for f in formats:
            if f == "T20":
                expanded.extend(["T20", "T20I", "IPL"])
            else:
                expanded.append(f)
        formats = list(dict.fromkeys(expanded))

    base_where = []
    if not include_unofficial:
        base_where.append("m.is_official = true")
    base_params = []

    if formats:
        ph = ", ".join(["%s"] * len(formats))
        base_where.append(f"""({FORMAT_BUCKET_EXPR}) IN ({ph})""")
        base_params.extend(formats)
    if tournaments:
        ph = ", ".join(["%s"] * len(tournaments))
        base_where.append(f"c.name IN ({ph})")
        base_params.extend(tournaments)
    if year_from is not None:
        base_where.append("EXTRACT(YEAR FROM m.date) >= %s")
        base_params.append(year_from)
    if year_to is not None:
        base_where.append("EXTRACT(YEAR FROM m.date) <= %s")
        base_params.append(year_to)

    where_sql = (" AND " + " AND ".join(base_where)) if base_where else ""

    # Country filter for venue/city subqueries
    country_where = []
    country_params = list(base_params)
    if countries:
        ph = ", ".join(["%s"] * len(countries))
        country_where.append(f"vm.country IN ({ph})")
        country_params.extend(countries)
    country_extra = (" AND " + " AND ".join(country_where)) if country_where else ""

    queries = {}

    # Competitions (ordered by match count desc)
    queries["competitions"] = (f"""
        SELECT c.name, COUNT(*) as match_count FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE c.name IS NOT NULL {where_sql}
        GROUP BY c.name
        ORDER BY match_count DESC, c.name ASC
    """, list(base_params))

    # Teams (ordered by matches played in the selected context)
    tnorm1 = TEAM_NORM_SQL.format(col="m.team1")
    tnorm2 = TEAM_NORM_SQL.format(col="m.team2")
    queries["teams"] = (f"""
        SELECT team, COUNT(*) as match_count FROM (
            SELECT {tnorm1} AS team FROM matches m
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            WHERE m.team1 IS NOT NULL {where_sql}
            UNION ALL
            SELECT {tnorm2} AS team FROM matches m
            LEFT JOIN competitions c ON c.competition_id = m.competition_id
            WHERE m.team2 IS NOT NULL {where_sql}
        ) t
        GROUP BY team
        ORDER BY match_count DESC, team ASC
    """, list(base_params) + list(base_params))

    # Venues (filtered by country too)
    queries["venues"] = (f"""
        WITH {VENUE_COUNTRY_MAP_CTE}
        SELECT DISTINCT m.venue FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        WHERE m.venue IS NOT NULL {where_sql} {country_extra}
        ORDER BY m.venue
    """, list(country_params))

    # Cities
    queries["cities"] = (f"""
        WITH {VENUE_COUNTRY_MAP_CTE}
        SELECT DISTINCT m.city FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        WHERE m.city IS NOT NULL {where_sql} {country_extra}
        ORDER BY m.city
    """, list(country_params))

    # Stages
    queries["stages"] = (f"""
        SELECT DISTINCT m.match_stage FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE m.match_stage IS NOT NULL {where_sql}
        ORDER BY m.match_stage
    """, list(base_params))

    # Countries
    queries["countries"] = (f"""
        WITH {VENUE_COUNTRY_MAP_CTE}
        SELECT DISTINCT vm.country FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        LEFT JOIN venue_country_map vm ON m.venue = vm.venue
        WHERE vm.country IS NOT NULL AND vm.country != 'Other' {where_sql}
        ORDER BY vm.country
    """, list(base_params))

    # Year range
    queries["year_range"] = (f"""
        SELECT MIN(EXTRACT(YEAR FROM m.date))::int AS min_year,
               MAX(EXTRACT(YEAR FROM m.date))::int AS max_year
        FROM matches m
        LEFT JOIN competitions c ON c.competition_id = m.competition_id
        WHERE m.date IS NOT NULL {where_sql}
    """, list(base_params))

    return queries


def calculate_summary(rows: list, stat_type: str):
    """Calculates aggregate stats for the summary bar."""
    from api.models import StatBuilderSummary
    if not rows:
        return StatBuilderSummary(result_count=0)
    
    if stat_type == "bat":
        total_runs = sum((r.get("runs") or 0) for r in rows)
        total_innings = sum((r.get("innings") or 0) for r in rows)
        # Filter rows with actual average/SR to avoid pulling down the mean with zero/nulls
        avg_rows = [r.get("average") for r in rows if r.get("average") is not None]
        avg_average = sum(avg_rows) / len(avg_rows) if avg_rows else None
        
        sr_rows = [r.get("strike_rate") for r in rows if r.get("strike_rate") is not None]
        avg_sr = sum(sr_rows) / len(sr_rows) if sr_rows else None
        
        total_hundreds = sum((r.get("hundreds") or 0) for r in rows)
        return StatBuilderSummary(
            total_runs=total_runs,
            avg_average=avg_average,
            avg_strike_rate=avg_sr,
            total_hundreds=total_hundreds,
            total_innings=total_innings,
            result_count=len(rows)
        )
    elif stat_type == "bowl":
        total_wickets = sum((r.get("wickets") or 0) for r in rows)
        total_innings = sum((r.get("innings") or 0) for r in rows)
        
        econ_rows = [r.get("economy") for r in rows if r.get("economy") is not None]
        avg_econ = sum(econ_rows) / len(econ_rows) if econ_rows else None
        
        return StatBuilderSummary(
            total_wickets=total_wickets,
            avg_economy=avg_econ,
            total_innings=total_innings,
            result_count=len(rows)
        )
    elif stat_type in ["team", "team_bat", "team_bowl", "team_compare"]:
        total_matches = sum((r.get("matches_played") or 0) for r in rows)
        
        # If it's a batting-focused team view, we can add more summary fields
        total_runs = None
        avg_rr = None
        total_wickets = None
        avg_econ = None
        
        if stat_type == "team_bat":
            total_runs = sum((r.get("total_runs_scored") or 0) for r in rows)
            rr_rows = [r.get("batting_run_rate") for r in rows if r.get("batting_run_rate") is not None]
            avg_rr = sum(rr_rows) / len(rr_rows) if rr_rows else None
        elif stat_type == "team_bowl":
            total_wickets = sum((r.get("wickets_taken") or 0) for r in rows)
            econ_rows = [r.get("bowling_run_rate") for r in rows if r.get("bowling_run_rate") is not None]
            avg_econ = sum(econ_rows) / len(econ_rows) if econ_rows else None

        return StatBuilderSummary(
            total_matches_played=total_matches,
            total_runs=total_runs,
            avg_average=avg_rr, # Reusing avg_average field for RR in summary UI for simplicity
            total_wickets=total_wickets,
            avg_economy=avg_econ,
            result_count=len(rows)
        )
    
    return StatBuilderSummary(result_count=len(rows))

