"""
Cricket Statistics API — FastAPI application.

Run with:
    uvicorn api.main:app --reload
    # or
    python -m api.main
"""

import logging
from typing import Optional
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.database import db_cursor
from api.models import (
    BattingStats,
    BowlingStats,
    FormatMatchup,
    HealthResponse,
    MatchupDelivery,
    MatchupResponse,
    PartnershipStats,
    PhaseStats,
    PlayerSearchResult,
    PlayerVsTeam,
    TeamH2HResponse,
    TeamHeadToHead,
    TeamRecentMatch,
    TeamSeasonRecord,
    TeamSearchResult,
    VenueStats,
    YearStats,
)
from api import queries as Q

# ── Logging ──────────────────────────────────────────────────
logger = logging.getLogger("cricket_api")
logging.basicConfig(level=logging.INFO)

# ── App setup ────────────────────────────────────────────────
app = FastAPI(
    title="Cricket Stats API",
    version="1.0.0",
    description="Ball-by-ball cricket statistics powered by Cricsheet data.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──────────────────────────────────────────────────

def _server_error(exc: Exception, context: str) -> HTTPException:
    """Log the real error server-side and return a generic 500."""
    logger.exception("DB error in %s: %s", context, exc)
    return HTTPException(status_code=500, detail="Internal server error")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. Health
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/health", response_model=HealthResponse)
def health():
    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_HEALTH)
            row = cur.fetchone()
            return HealthResponse(
                status="ok",
                matches_in_db=row["matches_in_db"],
                last_sync=str(row["last_sync"]) if row["last_sync"] else None,
            )
    except Exception as e:
        raise _server_error(e, "health")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. Player search
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/search", response_model=list[PlayerSearchResult])
def search_players(q: str = Query(..., description="Search query")):
    if len(q) < 2:
        raise HTTPException(
            status_code=400,
            detail="Search query must be at least 2 characters",
        )
    try:
        with db_cursor() as cur:
            cur.execute(Q.SEARCH_PLAYERS, (f"%{q}%",))
            return cur.fetchall()
    except Exception as e:
        raise _server_error(e, "search_players")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2b. Team search
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/teams/search", response_model=list[TeamSearchResult])
def search_teams(q: str = Query(..., description="Search query")):
    if len(q) < 2:
        raise HTTPException(
            status_code=400,
            detail="Search query must be at least 2 characters",
        )
    try:
        with db_cursor() as cur:
            cur.execute(Q.SEARCH_TEAMS, (f"%{q}%",))
            return cur.fetchall()
    except Exception as e:
        raise _server_error(e, "search_teams")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2c. Team head-to-head
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/teams/h2h", response_model=TeamH2HResponse)
def team_head_to_head(
    team1: str = Query(..., description="First team name"),
    team2: str = Query(..., description="Second team name"),
    format: Optional[str] = Query(None, description="Optional format filter"),
):
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    team1 = team1.strip()
    team2 = team2.strip()
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    try:
        with db_cursor() as cur:
            params = (team1, team2, team2, team1, format, format)

            cur.execute(Q.GET_TEAM_HEAD_TO_HEAD, params)
            h2h_rows = cur.fetchall()

            cur.execute(Q.GET_TEAM_H2H_SEASONS, params)
            season_rows = cur.fetchall()

            cur.execute(Q.GET_TEAM_RECENT_MATCHES, params)
            recent_rows = cur.fetchall()

            if not h2h_rows and not season_rows and not recent_rows:
                raise HTTPException(
                    status_code=404,
                    detail="No head-to-head data found for the selected teams",
                )

            by_format = [
                TeamHeadToHead(
                    team_a=row["team_a"],
                    team_b=row["team_b"],
                    format_bucket=row["format_bucket"],
                    matches_played=row["matches_played"],
                    team_a_wins=row["team_a_wins"],
                    team_b_wins=row["team_b_wins"],
                    no_results=row["no_results"],
                    avg_first_innings=(
                        float(row["avg_first_innings"])
                        if row["avg_first_innings"] is not None
                        else None
                    ),
                    avg_second_innings=(
                        float(row["avg_second_innings"])
                        if row["avg_second_innings"] is not None
                        else None
                    ),
                    highest_team_total=row["highest_team_total"],
                    first_match=str(row["first_match"]) if row["first_match"] else None,
                    last_match=str(row["last_match"]) if row["last_match"] else None,
                )
                for row in h2h_rows
            ]

            seasons = [
                TeamSeasonRecord(
                    year=row["year"],
                    format_bucket=row["format_bucket"],
                    matches_played=row["matches_played"],
                    team_a_wins=row["team_a_wins"],
                    team_b_wins=row["team_b_wins"],
                )
                for row in season_rows
            ]

            recent_matches = [
                TeamRecentMatch(
                    match_id=row["match_id"],
                    date=str(row["date"]),
                    venue=row["venue"],
                    format_bucket=row["format_bucket"],
                    batting_first=row["batting_first"],
                    bowling_first=row["bowling_first"],
                    winner=row["winner"],
                    win_by_runs=row["win_by_runs"],
                    win_by_wickets=row["win_by_wickets"],
                    first_innings_score=row["first_innings_score"],
                )
                for row in recent_rows
            ]

            return TeamH2HResponse(
                team1=team1,
                team2=team2,
                by_format=by_format,
                seasons=seasons,
                recent_matches=recent_matches,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "team_head_to_head")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. Player batting stats
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/batting", response_model=list[BattingStats])
def player_batting(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format (T20, ODI, Test, etc.)"),
    year: Optional[int] = Query(None, description="Filter by year (e.g. 2024)"),
):
    try:
        with db_cursor() as cur:
            cur.execute(
                Q.GET_PLAYER_BATTING,
                (player_id, format, format, year, year),
            )
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="Player not found or no batting data")
            return rows
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "player_batting")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Player bowling stats
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/bowling", response_model=list[BowlingStats])
def player_bowling(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format"),
    year: Optional[int] = Query(None, description="Filter by year"),
):
    try:
        with db_cursor() as cur:
            cur.execute(
                Q.GET_PLAYER_BOWLING,
                (player_id, format, format, year, year),
            )
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="Player not found or no bowling data")
            return rows
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "player_bowling")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. Player vs teams
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/vs-teams", response_model=list[PlayerVsTeam])
def player_vs_teams(
    player_id: str,
    role: str = Query("batting", description="'batting' or 'bowling'"),
):
    if role not in ("batting", "bowling"):
        raise HTTPException(
            status_code=400,
            detail="role must be 'batting' or 'bowling'",
        )
    try:
        with db_cursor() as cur:
            query = (
                Q.GET_PLAYER_VS_TEAMS_BATTING
                if role == "batting"
                else Q.GET_PLAYER_VS_TEAMS_BOWLING
            )
            cur.execute(query, (player_id,))
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "player_vs_teams")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. Partnerships
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/partnerships", response_model=list[PartnershipStats])
def player_partnerships(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format (e.g., Test, ODI, T20, IPL)"),
):
    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_PLAYER_PARTNERSHIPS, (player_id, format, format))
            rows = cur.fetchall()
            return rows
    except Exception as e:
        raise _server_error(e, "player_partnerships")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. Batter vs bowler matchup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/matchup", response_model=MatchupResponse)
def matchup(
    batter_id: str = Query(..., description="Batter player_id"),
    bowler_id: str = Query(..., description="Bowler player_id"),
):
    def to_float(val):
        return float(val) if val is not None else None

    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_MATCHUP_ROWS, (batter_id, bowler_id))
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "No matchup data — these players have never faced "
                        "each other in the database"
                    )
                )

            batter_name = rows[0]["batter_name"]
            bowler_name = rows[0]["bowler_name"]

            overall_balls = sum(r["balls"] for r in rows)
            overall_runs = sum(r["runs"] for r in rows)
            overall_dismissals = sum(r["dismissals"] for r in rows)

            total_dots = 0.0
            total_boundaries = 0.0
            for r in rows:
                balls = r["balls"] or 0
                dot_pct = to_float(r["dot_ball_pct"]) or 0.0
                boundary_pct = to_float(r["boundary_pct"]) or 0.0
                total_dots += balls * (dot_pct / 100.0)
                total_boundaries += balls * (boundary_pct / 100.0)

            overall = {
                "balls": overall_balls,
                "runs": overall_runs,
                "dismissals": overall_dismissals,
                "strike_rate": (
                    round(overall_runs * 100.0 / overall_balls, 2)
                    if overall_balls > 0
                    else None
                ),
                "average": (
                    round(overall_runs / overall_dismissals, 2)
                    if overall_dismissals > 0
                    else None
                ),
                "dot_ball_pct": (
                    round(total_dots * 100.0 / overall_balls, 2)
                    if overall_balls > 0
                    else None
                ),
                "boundary_pct": (
                    round(total_boundaries * 100.0 / overall_balls, 2)
                    if overall_balls > 0
                    else None
                ),
            }

            format_order = {
                "Test": 0,
                "ODI": 1,
                "ODM": 2,
                "IT20": 3,
                "T20": 4,
                "IPL": 5,
                "MDM": 6,
            }
            phase_order = {"powerplay": 0, "middle": 1, "death": 2}

            grouped_by_format: dict[str, list[dict]] = {}
            for r in rows:
                grouped_by_format.setdefault(r["format_bucket"], []).append(r)

            by_format: list[FormatMatchup] = []

            for fmt, fmt_rows in sorted(
                grouped_by_format.items(),
                key=lambda item: format_order.get(item[0], 999),
            ):
                fmt_balls = sum(r["balls"] for r in fmt_rows)
                fmt_runs = sum(r["runs"] for r in fmt_rows)
                fmt_dismissals = sum(r["dismissals"] for r in fmt_rows)

                fmt_dots = 0.0
                fmt_boundaries = 0.0
                for r in fmt_rows:
                    balls = r["balls"] or 0
                    dot_pct = to_float(r["dot_ball_pct"]) or 0.0
                    boundary_pct = to_float(r["boundary_pct"]) or 0.0
                    fmt_dots += balls * (dot_pct / 100.0)
                    fmt_boundaries += balls * (boundary_pct / 100.0)

                phase_groups: dict[str, dict[str, int]] = {}
                for r in fmt_rows:
                    phase = r["phase"]
                    if phase is None:
                        continue
                    if phase not in phase_groups:
                        phase_groups[phase] = {
                            "balls": 0,
                            "runs": 0,
                            "dismissals": 0,
                        }
                    phase_groups[phase]["balls"] += r["balls"]
                    phase_groups[phase]["runs"] += r["runs"]
                    phase_groups[phase]["dismissals"] += r["dismissals"]

                phases = [
                    PhaseStats(
                        phase=phase,
                        balls=vals["balls"],
                        runs=vals["runs"],
                        dismissals=vals["dismissals"],
                        strike_rate=(
                            round(vals["runs"] * 100.0 / vals["balls"], 2)
                            if vals["balls"] > 0
                            else None
                        ),
                        average=(
                            round(vals["runs"] / vals["dismissals"], 2)
                            if vals["dismissals"] > 0
                            else None
                        ),
                    )
                    for phase, vals in sorted(
                        phase_groups.items(),
                        key=lambda item: phase_order.get(item[0], 999),
                    )
                ]

                year_groups: dict[int, dict[str, int]] = {}
                for r in fmt_rows:
                    year = int(r["year"])
                    if year not in year_groups:
                        year_groups[year] = {
                            "balls": 0,
                            "runs": 0,
                            "dismissals": 0,
                        }
                    year_groups[year]["balls"] += r["balls"]
                    year_groups[year]["runs"] += r["runs"]
                    year_groups[year]["dismissals"] += r["dismissals"]

                by_year = [
                    YearStats(
                        year=year,
                        balls=vals["balls"],
                        runs=vals["runs"],
                        dismissals=vals["dismissals"],
                        strike_rate=(
                            round(vals["runs"] * 100.0 / vals["balls"], 2)
                            if vals["balls"] > 0
                            else None
                        ),
                        average=(
                            round(vals["runs"] / vals["dismissals"], 2)
                            if vals["dismissals"] > 0
                            else None
                        ),
                    )
                    for year, vals in sorted(year_groups.items(), key=lambda item: item[0], reverse=True)
                ]

                by_format.append(
                    FormatMatchup(
                        format_bucket=fmt,
                        balls=fmt_balls,
                        runs=fmt_runs,
                        dismissals=fmt_dismissals,
                        strike_rate=(
                            round(fmt_runs * 100.0 / fmt_balls, 2)
                            if fmt_balls > 0
                            else None
                        ),
                        average=(
                            round(fmt_runs / fmt_dismissals, 2)
                            if fmt_dismissals > 0
                            else None
                        ),
                        dot_ball_pct=(
                            round(fmt_dots * 100.0 / fmt_balls, 2)
                            if fmt_balls > 0
                            else None
                        ),
                        boundary_pct=(
                            round(fmt_boundaries * 100.0 / fmt_balls, 2)
                            if fmt_balls > 0
                            else None
                        ),
                        phases=phases,
                        by_year=by_year,
                    )
                )

            cur.execute(
                Q.GET_MATCHUP_RECENT_DELIVERIES,
                (batter_id, bowler_id),
            )
            raw_deliveries = cur.fetchall()

            recent_deliveries = [
                MatchupDelivery(
                    date=str(d["date"]),
                    over_number=d["over_number"],
                    ball_number=d["ball_number"],
                    runs_batter=d["runs_batter"],
                    is_wicket=bool(d["is_wicket"]),
                    batting_team=d["batting_team"],
                    bowling_team=d["bowling_team"],
                    venue=d.get("venue"),
                )
                for d in raw_deliveries
            ]

            return MatchupResponse(
                batter_id=batter_id,
                batter_name=batter_name,
                bowler_id=bowler_id,
                bowler_name=bowler_name,
                overall=overall,
                by_format=by_format,
                recent_deliveries=recent_deliveries,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "matchup")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. All venues
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/venues")
def all_venues(
    format: Optional[str] = Query(None, description="Filter by format"),
):
    try:
        with db_cursor() as cur:
            if format:
                cur.execute(
                    """
                    SELECT venue, format, matches_played,
                           avg_first_innings_score, avg_second_innings_score,
                           highest_team_total, lowest_team_total, chasing_win_pct
                    FROM mv_venue_stats
                    WHERE format = %s
                    ORDER BY matches_played DESC
                    """,
                    (format,),
                )
            else:
                cur.execute(Q.GET_ALL_VENUES)
            return cur.fetchall()
    except Exception as e:
        raise _server_error(e, "all_venues")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. Venue detail
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/venues/{venue_name}", response_model=list[VenueStats])
def venue_detail(venue_name: str):
    decoded = unquote(venue_name)
    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_VENUE_STATS, (f"%{decoded}%",))
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="Venue not found")
            return rows
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "venue_detail")


# ── Run directly ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
