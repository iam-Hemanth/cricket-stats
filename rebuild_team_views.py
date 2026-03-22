#!/usr/bin/env python3
"""Rebuild team views with team name normalization."""

import psycopg2
from psycopg2 import sql

DATABASE_URL = "postgresql://postgres:2355@localhost:5432/cricketdb"

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        # 1. Create the normalization function
        print("Creating normalise_team function...")
        create_func = """
        CREATE OR REPLACE FUNCTION normalise_team(team_name TEXT) 
        RETURNS TEXT AS $$
        BEGIN
            RETURN CASE team_name
                WHEN 'Royal Challengers Bangalore' THEN 'Royal Challengers Bengaluru'
                WHEN 'Delhi Daredevils' THEN 'Delhi Capitals'
                WHEN 'Deccan Chargers' THEN 'Sunrisers Hyderabad'
                WHEN 'Rising Pune Supergiant' THEN 'Rising Pune Supergiants'
                WHEN 'Pune Warriors' THEN 'Pune Warriors India'
                ELSE team_name
            END;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
        """
        cur.execute(create_func)
        conn.commit()
        print("✓ Function normalise_team created")
        
        # 2. Drop old views
        print("\nDropping old views...")
        cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_recent_matches;")
        print("✓ Dropped mv_team_recent_matches")
        
        cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team_seasons;")
        print("✓ Dropped mv_team_vs_team_seasons")
        
        cur.execute("DROP MATERIALIZED VIEW IF EXISTS mv_team_vs_team;")
        print("✓ Dropped mv_team_vs_team")
        
        conn.commit()
        
        # 3. Create mv_team_vs_team
        print("\nCreating mv_team_vs_team...")
        create_tvt = """
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
        """
        cur.execute(create_tvt)
        
        cur.execute("CREATE INDEX idx_mv_tvt_teams ON mv_team_vs_team (team_a, team_b);")
        cur.execute("CREATE INDEX idx_mv_tvt_teams_format ON mv_team_vs_team (team_a, team_b, format_bucket);")
        
        conn.commit()
        print("✓ mv_team_vs_team created")
        
        # 4. Create mv_team_vs_team_seasons
        print("Creating mv_team_vs_team_seasons...")
        create_tvts = """
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
        """
        cur.execute(create_tvts)
        
        cur.execute("CREATE INDEX idx_mv_tvts_teams ON mv_team_vs_team_seasons (team_a, team_b);")
        cur.execute("CREATE INDEX idx_mv_tvts_teams_format ON mv_team_vs_team_seasons (team_a, team_b, format_bucket);")
        
        conn.commit()
        print("✓ mv_team_vs_team_seasons created")
        
        # 5. Create mv_team_recent_matches
        print("Creating mv_team_recent_matches...")
        create_trm = """
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
            i1.batting_team, i1.bowling_team,
            normalise_team(i1.batting_team), normalise_team(i1.bowling_team),
            m.winner, m.win_by_runs, m.win_by_wickets,
            c.name, m.format;
        """
        cur.execute(create_trm)
        
        cur.execute("CREATE INDEX idx_mv_trm_teams ON mv_team_recent_matches (team_a, team_b);")
        cur.execute("CREATE INDEX idx_mv_trm_teams_date ON mv_team_recent_matches (team_a, team_b, format_bucket, date DESC);")
        
        conn.commit()
        print("✓ mv_team_recent_matches created")
        
        print("\n✓ All views rebuilt successfully with team name normalization!")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
