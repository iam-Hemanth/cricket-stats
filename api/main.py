"""
Cricket Statistics API — FastAPI application.

Run with:
    uvicorn api.main:app --reload
    # or
    python -m api.main
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.database import db_cursor
from api.models import (
    BattingStats,
    BowlingStats,
    FormBattingEntry,
    FormBowlingEntry,
    FormatMatchup,
    HealthResponse,
    HomepageHighlights,
    MatchupDelivery,
    MatchupResponse,
    OnFireBowler,
    OnFirePlayer,
    OnThisDayMatch,
    PartnershipStats,
    PhaseStats,
    PhaseStatBatting,
    PhaseStatBowling,
    PlayerFormResponse,
    PlayerPhasesResponse,
    PlayerSearchResult,
    PlayerVsTeam,
    RivalryOfDay,
    StatCard,
    TeamH2HResponse,
    TeamHeadToHead,
    TeamRecentMatch,
    TeamSeasonRecord,
    TeamSearchResult,
    TopBatterH2H,
    TopBowlerH2H,
    TopPerformer,
    VenueStats,
    YearStats,
)
from api import queries as Q

# ── Logging ──────────────────────────────────────────────────
logger = logging.getLogger("cricket_api")
logging.basicConfig(level=logging.INFO)

_highlights_cache: dict = {"data": None, "expires_at": None}

# ── App setup ────────────────────────────────────────────────
app = FastAPI(
    title="Cricket Stats API",
    version="1.0.0",
    description="Ball-by-ball cricket statistics powered by Cricsheet data.",
)

def _is_production_env() -> bool:
    env = (os.environ.get("ENVIRONMENT") or os.environ.get("PYTHON_ENV") or "").lower()
    if env in {"prod", "production"}:
        return True
    return os.environ.get("RENDER") == "true"


def _load_cors_allowed_origins() -> list[str]:
    cors_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    origins: list[str] = []
    seen: set[str] = set()

    for raw_origin in cors_env.split(","):
        origin = raw_origin.strip()
        if origin and origin not in seen:
            origins.append(origin)
            seen.add(origin)

    # Local/dev convenience: allow local Next.js frontend if env var is unset.
    if not origins and not _is_production_env():
        origins = ["http://localhost:3000"]

    if not origins:
        logger.warning(
            "CORS_ALLOWED_ORIGINS is empty in production; cross-origin requests will be blocked"
        )

    return origins


_cors_allowed_origins = _load_cors_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def clear_highlights_cache_on_startup():
    _highlights_cache.clear()
    _highlights_cache.update({"data": None, "expires_at": None})


# ── Helpers ──────────────────────────────────────────────────

def _server_error(exc: Exception, context: str) -> HTTPException:
    """Log the real error server-side and return a generic 500."""
    logger.exception("DB error in %s: %s", context, exc)
    return HTTPException(status_code=500, detail="Internal server error")


def _detect_batting_specialist(phases_data: list) -> Optional[str]:
    """
    Detect if a batter is a phase specialist based on strike rate differences.
    Returns badge text like "Death overs specialist" or None.
    
    Logic:
    - If death SR is 20+ higher than powerplay SR: "Death overs specialist"
    - If powerplay SR is 20+ higher than death SR: "Powerplay specialist"
    - Need minimum 50 balls in each phase to qualify
    """
    # Group by phase
    powerplay = next((p for p in phases_data if p.phase_name == "powerplay"), None)
    death = next((p for p in phases_data if p.phase_name == "death"), None)
    
    if not powerplay or not death:
        return None
    if powerplay.balls < 50 or death.balls < 50:
        return None
    if powerplay.strike_rate is None or death.strike_rate is None:
        return None
    
    sr_diff = death.strike_rate - powerplay.strike_rate
    if sr_diff >= 20:
        return "Death overs specialist"
    elif sr_diff <= -20:
        return "Powerplay specialist"
    
    return None


def _detect_bowling_specialist(phases_data: list) -> Optional[str]:
    """
    Detect if a bowler is a phase specialist based on economy differences.
    Returns badge text like "Death overs specialist" or None.
    
    Logic:
    - If death economy is 1.5+ lower than powerplay economy: "Death overs specialist"
    - If powerplay economy is 1.5+ lower than death economy: "Powerplay specialist"
    - Need minimum 50 balls in each phase to qualify
    """
    # Group by phase
    powerplay = next((p for p in phases_data if p.phase_name == "powerplay"), None)
    death = next((p for p in phases_data if p.phase_name == "death"), None)
    
    if not powerplay or not death:
        return None
    if powerplay.balls < 50 or death.balls < 50:
        return None
    if powerplay.economy is None or death.economy is None:
        return None
    
    econ_diff = powerplay.economy - death.economy
    if econ_diff >= 1.5:
        return "Death overs specialist"
    elif econ_diff <= -1.5:
        return "Powerplay specialist"
    
    return None


def _convert_decimal_values(value):
    """Recursively convert Decimal values to float for JSON-safe payloads."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: _convert_decimal_values(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_convert_decimal_values(v) for v in value]
    return value


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
# 1b. Homepage highlights
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/highlights", response_model=HomepageHighlights)
def highlights():
    now = datetime.now(timezone.utc)
    expires_at = _highlights_cache.get("expires_at")
    cached_data = _highlights_cache.get("data")

    if cached_data and isinstance(expires_at, datetime) and expires_at > now:
        return cached_data

    fallback = HomepageHighlights(
        stat_cards=[],
        on_fire_ipl_batting=[],
        on_fire_ipl_bowling=[],
        on_fire_big_leagues_batting=[],
        on_fire_big_leagues_bowling=[],
        on_fire_international_batting=[],
        on_fire_international_bowling=[],
        rivalry_ipl=None,
        rivalry_international=None,
        cached_at=now.isoformat(),
    )

    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_STAT_CARDS)
            stat_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_IPL_BATTING)
            on_fire_ipl_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_IPL_BOWLING)
            on_fire_ipl_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_BIG_LEAGUES_BATTING)
            on_fire_big_leagues_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_BIG_LEAGUES_BOWLING)
            on_fire_big_leagues_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_INTERNATIONAL_BATTING)
            on_fire_international_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_INTERNATIONAL_BOWLING)
            on_fire_international_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_RIVALRY_IPL)
            rivalry_ipl_row = cur.fetchone()

            cur.execute(Q.GET_RIVALRY_INTERNATIONAL)
            rivalry_international_row = cur.fetchone()

        stat_cards = [
            StatCard(
                stat_id=row["stat_id"],
                label=row["label"],
                player_name=row["player_name"],
                player_id=row.get("player_id"),
                value=str(row["value"]),
                unit=row["unit"],
                format_label=row["format_label"],
            )
            for row in stat_rows
        ]

        on_fire_ipl_batting = [
            OnFirePlayer(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                recent_runs=int(row["recent_runs"] or 0),
                balls_faced=int(row["balls_faced"] or 0),
                dismissals=int(row["dismissals"] or 0),
                recent_sr=(
                    float(row["recent_sr"])
                    if row.get("recent_sr") is not None
                    else None
                ),
            )
            for row in on_fire_ipl_batting_rows
        ]

        on_fire_ipl_bowling = [
            OnFireBowler(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                balls_bowled=int(row["balls_bowled"] or 0),
                runs_conceded=int(row["runs_conceded"] or 0),
                wickets=int(row["wickets"] or 0),
                recent_economy=(
                    float(row["recent_economy"])
                    if row.get("recent_economy") is not None
                    else None
                ),
            )
            for row in on_fire_ipl_bowling_rows
        ]

        on_fire_big_leagues_batting = [
            OnFirePlayer(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                recent_runs=int(row["recent_runs"] or 0),
                balls_faced=int(row["balls_faced"] or 0),
                dismissals=int(row["dismissals"] or 0),
                recent_sr=(
                    float(row["recent_sr"])
                    if row.get("recent_sr") is not None
                    else None
                ),
            )
            for row in on_fire_big_leagues_batting_rows
        ]

        on_fire_big_leagues_bowling = [
            OnFireBowler(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                balls_bowled=int(row["balls_bowled"] or 0),
                runs_conceded=int(row["runs_conceded"] or 0),
                wickets=int(row["wickets"] or 0),
                recent_economy=(
                    float(row["recent_economy"])
                    if row.get("recent_economy") is not None
                    else None
                ),
            )
            for row in on_fire_big_leagues_bowling_rows
        ]

        on_fire_international_batting = [
            OnFirePlayer(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                recent_runs=int(row["recent_runs"] or 0),
                balls_faced=int(row["balls_faced"] or 0),
                dismissals=int(row["dismissals"] or 0),
                recent_sr=(
                    float(row["recent_sr"])
                    if row.get("recent_sr") is not None
                    else None
                ),
            )
            for row in on_fire_international_batting_rows
        ]

        on_fire_international_bowling = [
            OnFireBowler(
                player_id=row["player_id"],
                player_name=row["player_name"],
                competition=row.get("competition"),
                recent_matches=int(row["recent_matches"] or 0),
                balls_bowled=int(row["balls_bowled"] or 0),
                runs_conceded=int(row["runs_conceded"] or 0),
                wickets=int(row["wickets"] or 0),
                recent_economy=(
                    float(row["recent_economy"])
                    if row.get("recent_economy") is not None
                    else None
                ),
            )
            for row in on_fire_international_bowling_rows
        ]

        rivalry_ipl = None
        if rivalry_ipl_row:
            rivalry_ipl = RivalryOfDay(
                batter_id=rivalry_ipl_row["batter_id"],
                batter_name=rivalry_ipl_row["batter_name"],
                bowler_id=rivalry_ipl_row["bowler_id"],
                bowler_name=rivalry_ipl_row["bowler_name"],
                total_balls=int(rivalry_ipl_row["total_balls"] or 0),
                total_runs=int(rivalry_ipl_row["total_runs"] or 0),
                total_dismissals=int(rivalry_ipl_row["total_dismissals"] or 0),
                strike_rate=(
                    float(rivalry_ipl_row["strike_rate"])
                    if rivalry_ipl_row.get("strike_rate") is not None
                    else None
                ),
            )

        rivalry_international = None
        if rivalry_international_row:
            rivalry_international = RivalryOfDay(
                batter_id=rivalry_international_row["batter_id"],
                batter_name=rivalry_international_row["batter_name"],
                bowler_id=rivalry_international_row["bowler_id"],
                bowler_name=rivalry_international_row["bowler_name"],
                total_balls=int(rivalry_international_row["total_balls"] or 0),
                total_runs=int(rivalry_international_row["total_runs"] or 0),
                total_dismissals=int(rivalry_international_row["total_dismissals"] or 0),
                strike_rate=(
                    float(rivalry_international_row["strike_rate"])
                    if rivalry_international_row.get("strike_rate") is not None
                    else None
                ),
            )

        payload = HomepageHighlights(
            stat_cards=stat_cards,
            on_fire_ipl_batting=on_fire_ipl_batting,
            on_fire_ipl_bowling=on_fire_ipl_bowling,
            on_fire_big_leagues_batting=on_fire_big_leagues_batting,
            on_fire_big_leagues_bowling=on_fire_big_leagues_bowling,
            on_fire_international_batting=on_fire_international_batting,
            on_fire_international_bowling=on_fire_international_bowling,
            rivalry_ipl=rivalry_ipl,
            rivalry_international=rivalry_international,
            cached_at=now.isoformat(),
        )

        serialized_payload = _convert_decimal_values(payload.model_dump())

        _highlights_cache["data"] = serialized_payload
        _highlights_cache["expires_at"] = now + timedelta(hours=24)
        return serialized_payload
    except Exception as e:
        logger.exception("Failed to build homepage highlights: %s", e)
        _highlights_cache["data"] = fallback.model_dump()
        _highlights_cache["expires_at"] = now + timedelta(hours=24)
        return _highlights_cache["data"]


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

            # Get top performers for both teams
            cur.execute(
                Q.GET_TEAM_H2H_TOP_SCORERS,
                (team1, team1, team2, team2, team1, format, format),
            )
            top_scorers_vs_team1 = cur.fetchall()

            cur.execute(
                Q.GET_TEAM_H2H_TOP_SCORERS,
                (team2, team1, team2, team2, team1, format, format),
            )
            top_scorers_vs_team2 = cur.fetchall()

            cur.execute(
                Q.GET_TEAM_H2H_TOP_WICKET_TAKERS,
                (team1, team1, team2, team2, team1, format, format),
            )
            top_wickets_vs_team1 = cur.fetchall()

            cur.execute(
                Q.GET_TEAM_H2H_TOP_WICKET_TAKERS,
                (team2, team1, team2, team2, team1, format, format),
            )
            top_wickets_vs_team2 = cur.fetchall()

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

            # Build top performers lists
            scorers_vs_team1 = [
                TopPerformer(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    total_runs=row["total_runs"],
                    matches=row["matches"],
                    innings=row["innings"],
                )
                for row in top_scorers_vs_team1
            ]

            scorers_vs_team2 = [
                TopPerformer(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    total_runs=row["total_runs"],
                    matches=row["matches"],
                    innings=row["innings"],
                )
                for row in top_scorers_vs_team2
            ]

            wickets_vs_team1 = [
                TopPerformer(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    total_wickets=row["total_wickets"],
                    matches=row["matches"],
                )
                for row in top_wickets_vs_team1
            ]

            wickets_vs_team2 = [
                TopPerformer(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    total_wickets=row["total_wickets"],
                    matches=row["matches"],
                )
                for row in top_wickets_vs_team2
            ]

            return TeamH2HResponse(
                team1=team1,
                team2=team2,
                by_format=by_format,
                seasons=seasons,
                recent_matches=recent_matches,
                top_scorers_vs_team1=scorers_vs_team1,
                top_scorers_vs_team2=scorers_vs_team2,
                top_wickets_vs_team1=wickets_vs_team1,
                top_wickets_vs_team2=wickets_vs_team2,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "team_head_to_head")


@app.get("/api/v1/teams/h2h/top-batters", response_model=list[TopBatterH2H])
def team_h2h_top_batters(
    team1: str = Query(..., description="First team name"),
    team2: str = Query(..., description="Second team name"),
    format: Optional[str] = Query(None, description="Optional format filter"),
):
    """Get top 10 run scorers in matches between two teams."""
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    team1 = team1.strip()
    team2 = team2.strip()
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    try:
        with db_cursor() as cur:
            params = (team1, team2, team2, team1, format, format)
            cur.execute(Q.GET_H2H_TOP_BATTERS, params)
            rows = cur.fetchall()

            if not rows:
                return []

            return [
                TopBatterH2H(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    runs=row["runs"],
                    innings=row["innings"],
                    average=float(row["average"]) if row["average"] is not None else None,
                    strike_rate=float(row["strike_rate"]) if row["strike_rate"] is not None else None,
                    highest_score=row["highest_score"],
                    fifties=row["fifties"],
                    hundreds=row["hundreds"],
                )
                for row in rows
            ]
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "team_h2h_top_batters")


@app.get("/api/v1/teams/h2h/top-bowlers", response_model=list[TopBowlerH2H])
def team_h2h_top_bowlers(
    team1: str = Query(..., description="First team name"),
    team2: str = Query(..., description="Second team name"),
    format: Optional[str] = Query(None, description="Optional format filter"),
):
    """Get top 10 wicket takers in matches between two teams."""
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    team1 = team1.strip()
    team2 = team2.strip()
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    try:
        with db_cursor() as cur:
            params = (team1, team2, team2, team1, format, format)
            cur.execute(Q.GET_H2H_TOP_BOWLERS, params)
            rows = cur.fetchall()

            if not rows:
                return []

            return [
                TopBowlerH2H(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    wickets=row["wickets"],
                    innings_bowled=row["innings_bowled"],
                    economy=float(row["economy"]) if row["economy"] is not None else None,
                    bowling_average=float(row["bowling_average"]) if row["bowling_average"] is not None else None,
                    strike_rate=float(row["strike_rate"]) if row["strike_rate"] is not None else None,
                    best_bowling=row["best_bowling"],
                )
                for row in rows
            ]
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "team_h2h_top_bowlers")


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
# 6.5. Player phase specialist stats
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@app.get("/api/v1/players/{player_id}/phases", response_model=PlayerPhasesResponse)
def player_phases(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format (T20, ODI, etc.)"),
    role: Optional[str] = Query(None, description="'batting' or 'bowling' (default: both)"),
):
    """Get phase specialist stats (powerplay/middle/death) for a player."""
    try:
        batting_data = []
        bowling_data = []

        with db_cursor() as cur:
            # Fetch batting phases if role is None or 'batting'
            if role is None or role == "batting":
                cur.execute(Q.GET_PLAYER_PHASE_BATTING, (player_id, format, format))
                batting_rows = cur.fetchall()
                
                for row in batting_rows:
                    balls = row["balls"] or 0
                    runs = row["runs"] or 0
                    dismissals = row["dismissals"] or 0
                    boundaries = row["boundaries"] or 0
                    dot_balls = row["dot_balls"] or 0
                    
                    # Calculate derived stats
                    strike_rate = None if balls == 0 else round(runs * 100.0 / balls, 2)
                    average = None if dismissals == 0 else round(runs / dismissals, 2)
                    dot_ball_pct = None if balls == 0 else round(dot_balls * 100.0 / balls, 2)
                    boundary_pct = None if balls == 0 else round(boundaries * 100.0 / balls, 2)
                    
                    # Filter: ODI/ODM should only show powerplay phase
                    format_bucket = row.get("format_bucket")
                    if format_bucket in ("ODI", "ODM") and row["phase_name"] != "powerplay":
                        continue

                    batting_data.append(
                        PhaseStatBatting(
                            phase_name=row["phase_name"],
                            format_bucket=format_bucket,
                            balls=balls,
                            runs=runs,
                            dot_balls=dot_balls,
                            boundaries=boundaries,
                            dismissals=dismissals,
                            strike_rate=strike_rate,
                            average=average,
                            dot_ball_pct=dot_ball_pct,
                            boundary_pct=boundary_pct,
                        )
                    )

            # Fetch bowling phases if role is None or 'bowling'
            if role is None or role == "bowling":
                cur.execute(Q.GET_PLAYER_PHASE_BOWLING, (player_id, format, format))
                bowling_rows = cur.fetchall()
                for row in bowling_rows:
                    balls = row["balls"] or 0
                    runs_conceded = row["runs_conceded"] or 0
                    wickets = row["wickets"] or 0
                    dot_balls = row["dot_balls"] or 0
                    
                    # Calculate derived stats
                    economy = None if balls == 0 else round(runs_conceded * 6.0 / balls, 2)
                    dot_ball_pct = None if balls == 0 else round(dot_balls * 100.0 / balls, 2)
                    
                    # Filter: ODI/ODM should only show powerplay phase
                    format_bucket = row.get("format_bucket")
                    if format_bucket in ("ODI", "ODM") and row["phase_name"] != "powerplay":
                        continue
                    
                    bowling_data.append(
                        PhaseStatBowling(
                            phase_name=row["phase_name"],
                            format_bucket=format_bucket,
                            balls=balls,
                            runs_conceded=runs_conceded,
                            dot_balls=dot_balls,
                            wickets=wickets,
                            economy=economy,
                            dot_ball_pct=dot_ball_pct,
                        )
                    )

        return PlayerPhasesResponse(
            batting=batting_data,
            bowling=bowling_data,
            batting_specialist_badge=_detect_batting_specialist(batting_data) if batting_data else None,
            bowling_specialist_badge=_detect_bowling_specialist(bowling_data) if bowling_data else None,
        )
    except Exception as e:
        raise _server_error(e, "player_phases")


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
                return MatchupResponse(
                    batter_id=batter_id,
                    batter_name=None,
                    bowler_id=bowler_id,
                    bowler_name=None,
                    no_data=True,
                    overall={
                        "balls": 0,
                        "runs": 0,
                        "dismissals": 0,
                        "strike_rate": None,
                        "average": None,
                        "dot_ball_pct": None,
                        "boundary_pct": None,
                    },
                    by_format=[],
                    recent_deliveries=[],
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
                no_data=False,
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
# 8b. Player form guide (last 10 innings)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/form", response_model=PlayerFormResponse)
def player_form(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format (IPL, T20, IT20, ODI, Test)")
):
    """Get recent form guide (last 10 batting and bowling innings)."""
    def to_float(val):
        """Convert Decimal to float."""
        try:
            return float(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    try:
        with db_cursor() as cur:
            # Fetch batting form
            cur.execute(Q.GET_PLAYER_FORM_BATTING, (player_id, player_id, player_id, format, format))
            batting_rows = cur.fetchall()

            # Fetch bowling form
            cur.execute(Q.GET_PLAYER_FORM_BOWLING, (player_id, format, format))
            bowling_rows = cur.fetchall()

            batting_data = []
            for row in batting_rows:
                runs = row["runs"] or 0
                balls_faced = row["balls_faced"] or 0
                strike_rate = (runs * 100.0 / balls_faced) if balls_faced > 0 else None

                batting_data.append(
                    FormBattingEntry(
                        match_id=row["match_id"],
                        date=row["date"],
                        format_bucket=row["format_bucket"],
                        opposition=row["opposition"],
                        venue=row["venue"],
                        batting_team=row["batting_team"],
                        runs=runs,
                        balls_faced=balls_faced,
                        was_dismissed=row["was_dismissed"],
                        strike_rate=to_float(strike_rate),
                    )
                )

            bowling_data = []
            for row in bowling_rows:
                balls_bowled = row["balls_bowled"] or 0
                runs_conceded = row["runs_conceded"] or 0
                economy = (runs_conceded * 6.0 / balls_bowled) if balls_bowled > 0 else None

                bowling_data.append(
                    FormBowlingEntry(
                        match_id=row["match_id"],
                        date=row["date"],
                        format_bucket=row["format_bucket"],
                        opposition=row["opposition"],
                        bowling_team=row["bowling_team"],
                        venue=row["venue"],
                        balls_bowled=balls_bowled,
                        runs_conceded=runs_conceded,
                        wickets=row["wickets"] or 0,
                        economy=to_float(economy),
                    )
                )

            # Get last_updated from most recent batting entry
            last_updated = None
            if batting_data:
                last_updated = batting_data[0].date

            return PlayerFormResponse(
                batting=batting_data,
                bowling=bowling_data,
                last_updated=last_updated,
            )
    except Exception as e:
        raise _server_error(e, "player_form")


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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 10. On This Day in Cricket
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/on-this-day", response_model=list[OnThisDayMatch])
def on_this_day():
    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_ON_THIS_DAY)
            rows = cur.fetchall()

            if not rows:
                return []

            current_year = datetime.now(timezone.utc).year
            result = []
            for row in rows:
                match_date = datetime.fromisoformat(row["date"])
                years_ago = current_year - match_date.year
                result.append(OnThisDayMatch(
                    match_id=row["match_id"],
                    date=row["date"],
                    team1=row["team1"],
                    team2=row["team2"],
                    winner=row["winner"],
                    venue=row["venue"],
                    format=row["format"],
                    years_ago=years_ago,
                ))
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "on_this_day")


# ── Run directly ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
