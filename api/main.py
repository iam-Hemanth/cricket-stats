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
    MatchCardResponse,
    MatchListItem,
    MatchListResponse,
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
    TestInningsSplitBatting,
    TestInningsSplitBowling,
    TestSplitsResponse,
    TopBatterH2H,
    TopBowlerH2H,
    TopPerformer,
    VenueStats,
    YearStats,
    FallOfWicket,
    BatterScorecard,
    BowlerScorecard,
    InningScorecard,
    PartnershipScorecard,
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
                    
                    format_bucket = row.get("format_bucket")
                    
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
                    
                    format_bucket = row.get("format_bucket")
                    
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6.6. Test innings splits
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/test-splits", response_model=TestSplitsResponse)
def player_test_splits(player_id: str):
    """Get 1st vs 2nd innings batting and bowling splits for Test cricket."""
    try:
        with db_cursor() as cur:
            # Batting splits
            cur.execute(Q.GET_PLAYER_TEST_INNINGS_SPLIT_BATTING, (player_id, player_id))
            bat_rows = cur.fetchall()
            batting_splits = []
            for row in bat_rows:
                balls = row["balls_faced"] or 0
                runs = row["runs"] or 0
                dismissals = row["dismissals"] or 0
                strike_rate = None if balls == 0 else round(runs * 100.0 / balls, 2)
                average = None if dismissals == 0 else round(runs / dismissals, 2)
                batting_splits.append(
                    TestInningsSplitBatting(
                        innings_number=row["innings_number"],
                        innings_count=row["innings_count"] or 0,
                        runs=runs,
                        balls_faced=balls,
                        dismissals=dismissals,
                        average=average,
                        strike_rate=strike_rate,
                        hundreds=row["hundreds"] or 0,
                        fifties=row["fifties"] or 0,
                        highest_score=row["highest_score"] or 0,
                    )
                )

            # Bowling splits
            cur.execute(Q.GET_PLAYER_TEST_INNINGS_SPLIT_BOWLING, (player_id,))
            bowl_rows = cur.fetchall()
            bowling_splits = []
            for row in bowl_rows:
                balls = row["balls"] or 0
                runs_conceded = row["runs_conceded"] or 0
                wickets = row["wickets"] or 0
                economy = None if balls == 0 else round(runs_conceded * 6.0 / balls, 2)
                bowling_average = None if wickets == 0 else round(runs_conceded / wickets, 2)
                strike_rate = None if wickets == 0 else round(balls / wickets, 2)
                bowling_splits.append(
                    TestInningsSplitBowling(
                        innings_number=row["innings_number"],
                        innings_count=row["innings_count"] or 0,
                        wickets=wickets,
                        runs_conceded=runs_conceded,
                        balls=balls,
                        economy=economy,
                        bowling_average=bowling_average,
                        strike_rate=strike_rate,
                    )
                )

        return TestSplitsResponse(batting=batting_splits, bowling=bowling_splits)
    except Exception as e:
        raise _server_error(e, "player_test_splits")


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





# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 11. Match Card
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/match/{match_id}", response_model=MatchCardResponse)
def get_match_card(match_id: str):
    try:
        with db_cursor() as cur:
            # 1. Fetch match info
            cur.execute(Q.GET_MATCH_INFO, (match_id,))
            match_row = cur.fetchone()
            if not match_row:
                raise HTTPException(status_code=404, detail="Match not found")

            # 2. Fetch innings
            cur.execute(Q.GET_MATCH_INNINGS, (match_id,))
            innings_rows = cur.fetchall()

            scorecards = []
            # Track ALL player IDs who actually appeared in a delivery
            all_participating_ids: set[str] = set()
            # Track batting/bowling positions per team
            team_batting_order: dict[str, dict[str, int]] = {}  # team -> {pid: position}
            team_bowling_order: dict[str, dict[str, int]] = {}  # team -> {pid: position}
            for inn in innings_rows:
                innings_id = inn["innings_id"]
                batting_team = inn["batting_team"]
                bowling_team = inn["bowling_team"]
                
                # Fetch deliveries for this innings
                cur.execute(Q.GET_INNINGS_DELIVERIES, (innings_id,))
                deliveries = cur.fetchall()
                
                if not deliveries:
                    continue

                # Process deliveries into scorecard
                batter_stats = {} # batter_id -> dict
                bowler_stats = {} # bowler_id -> dict
                fow = []
                partnerships = []
                
                total_runs = 0
                total_wickets = 0
                total_extras = 0
                extras_breakdown = {"b": 0, "lb": 0, "w": 0, "nb": 0}
                # Per-over run progression
                over_runs: list[int] = []  # cumulative runs after each completed over
                _current_over = -1
                _over_bucket_runs = 0
                
                # State for partnerships
                current_batter1 = None
                current_batter2 = None
                curr_p_runs = 0
                curr_p_balls = 0
                
                def init_batter(bid, bname):
                    if bid not in batter_stats:
                        batter_stats[bid] = {
                            "batter_id": bid, "batter_name": bname,
                            "runs": 0, "balls": 0, "fours": 0, "sixes": 0,
                            "dismissal_text": "not out"
                        }
                
                def init_bowler(bid, bname):
                    if bid not in bowler_stats:
                        bowler_stats[bid] = {
                            "bowler_id": bid, "bowler_name": bname,
                            "legal_balls": 0, "runs": 0, "wickets": 0,
                            "wides": 0, "no_balls": 0
                        }

                last_ball = None
                timeline: list[str] = []
                
                for d in deliveries:
                    # Timeline logic
                    out_id = d["player_out_id"]
                    is_w = out_id is not None
                    
                    if d["is_wide"]:
                        b_str = f"{d['runs_extras']}wd"
                    elif d["is_noball"]:
                        tot = d['runs_batter'] + d['runs_extras']
                        b_str = f"{tot}nb"
                    elif d["is_bye"]:
                        b_str = f"{d['runs_extras']}b"
                    elif d["is_legbye"]:
                        b_str = f"{d['runs_extras']}lb"
                    else:
                        b_str = str(d['runs_batter'])
                        if b_str == "0":
                            b_str = "•"
                        
                    if is_w:
                        b_str = "W" if b_str in ["0", "•"] else f"{b_str}+W"
                        
                    timeline.append(b_str)
                    
                    init_batter(d["batter_id"], d["batter_name"])
                    init_batter(d["non_striker_id"], d["non_striker_name"])
                    init_bowler(d["bowler_id"], d["bowler_name"])
                    # Track who actually participated in this match
                    all_participating_ids.update({
                        d["batter_id"], d["non_striker_id"], d["bowler_id"]
                    })
                    # Track batting position (first time a batter_id appears = their position)
                    bt = team_batting_order.setdefault(batting_team, {})
                    if d["batter_id"] not in bt:
                        bt[d["batter_id"]] = len(bt)
                    if d["non_striker_id"] not in bt:
                        bt[d["non_striker_id"]] = len(bt)
                    # Track bowling position
                    bowl_ord = team_bowling_order.setdefault(bowling_team, {})
                    if d["bowler_id"] not in bowl_ord:
                        bowl_ord[d["bowler_id"]] = len(bowl_ord)
                    
                    b = batter_stats[d["batter_id"]]
                    bo = bowler_stats[d["bowler_id"]]
                    
                    # Batter stats
                    if not d["is_wide"]:
                        b["balls"] += 1
                    b["runs"] += d["runs_batter"]
                    if d["runs_batter"] == 4 and not d["is_wide"]: # sometimes boundaries are byes, but runs_batter is 0 then
                        b["fours"] += 1
                    elif d["runs_batter"] == 6 and not d["is_wide"]:
                        b["sixes"] += 1
                        
                    # Bowler stats
                    if not d["is_wide"] and not d["is_noball"]:
                        bo["legal_balls"] += 1
                    
                    bo["runs"] += d["runs_batter"] + (d["runs_extras"] if (d["is_wide"] or d["is_noball"]) else 0)
                    if d["is_wide"]: bo["wides"] += 1
                    if d["is_noball"]: bo["no_balls"] += 1
                    
                    # Totals
                    total_runs += d["runs_total"]
                    total_extras += d["runs_extras"]
                    if d["is_wide"]: extras_breakdown["w"] += d["runs_extras"]
                    if d["is_noball"]: extras_breakdown["nb"] += d["runs_extras"]
                    if d["is_bye"]: extras_breakdown["b"] += d["runs_extras"]
                    if d["is_legbye"]: extras_breakdown["lb"] += d["runs_extras"]

                    # Track per-over cumulative runs
                    over_num = d["over_number"]
                    if over_num != _current_over:
                        if _current_over >= 0:
                            over_runs.append(total_runs - d["runs_total"])
                        _current_over = over_num
                    
                    # Partnership tracking
                    # Simple heuristic: we know who is on strike and non-strike
                    b1, b2 = sorted([d["batter_id"], d["non_striker_id"]])
                    if current_batter1 != b1 or current_batter2 != b2:
                        # Save old partnership if exists and has balls/runs
                        if current_batter1 is not None and (curr_p_balls > 0 or curr_p_runs > 0):
                            partnerships.append({
                                "batter1_id": current_batter1, "batter1_name": batter_stats[current_batter1]["batter_name"],
                                "batter2_id": current_batter2, "batter2_name": batter_stats[current_batter2]["batter_name"],
                                "total_runs": curr_p_runs, "total_balls": curr_p_balls,
                                # We aren't tracking individual contribution in partnership for now to keep it simple, 
                                # but API requires it. Let's set to 0.
                                "batter1_runs": 0, "batter1_balls": 0, "batter2_runs": 0, "batter2_balls": 0
                            })
                        current_batter1 = b1
                        current_batter2 = b2
                        curr_p_runs = 0
                        curr_p_balls = 0
                        
                    curr_p_runs += d["runs_total"]
                    if not d["is_wide"]: curr_p_balls += 1
                    
                    # Wicket
                    if d["wicket_id"] is not None:
                        out_id = d["player_out_id"]
                        kind = d["dismissal_kind"]
                        
                        # FOW
                        total_wickets += 1
                        over_ball = float(f"{d['over_number']}.{d['ball_number']}")
                        out_name = d["batter_name"] if out_id == d["batter_id"] else d["non_striker_name"]
                        fow.append(FallOfWicket(
                            runs=total_runs, wickets=total_wickets, 
                            batter_id=out_id, batter_name=out_name, over=over_ball
                        ))
                        
                        # Dismissal text
                        out_b = batter_stats.get(out_id)
                        if out_b:
                            if kind in ('bowled', 'lbw'):
                                out_b["dismissal_text"] = f"{kind} b {d['bowler_name']}"
                            elif kind == 'caught':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"c {f1} b {d['bowler_name']}"
                            elif kind == 'run out':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"run out ({f1})"
                            elif kind == 'stumped':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"st {f1} b {d['bowler_name']}"
                            elif kind == 'caught and bowled':
                                out_b["dismissal_text"] = f"c & b {d['bowler_name']}"
                            else:
                                out_b["dismissal_text"] = kind
                                
                        if kind not in ('run out', 'retired hurt', 'obstructing the field', 'retired not out'):
                            bo["wickets"] += 1
                            
                    last_ball = d

                # Append last partnership
                if current_batter1 is not None and (curr_p_balls > 0 or curr_p_runs > 0):
                    partnerships.append({
                        "batter1_id": current_batter1, "batter1_name": batter_stats[current_batter1]["batter_name"],
                        "batter2_id": current_batter2, "batter2_name": batter_stats[current_batter2]["batter_name"],
                        "total_runs": curr_p_runs, "total_balls": curr_p_balls,
                        "batter1_runs": 0, "batter1_balls": 0, "batter2_runs": 0, "batter2_balls": 0
                    })

                # Calculate final over count for team
                total_overs = 0.0
                if last_ball:
                    total_overs = float(f"{last_ball['over_number']}.{last_ball['ball_number']}")
                
                # Format batters
                final_batters = []
                for b in batter_stats.values():
                    sr = (b["runs"] / b["balls"] * 100) if b["balls"] > 0 else None
                    if sr is not None: sr = round(sr, 2)
                    final_batters.append(BatterScorecard(
                        batter_id=b["batter_id"], batter_name=b["batter_name"],
                        runs=b["runs"], balls=b["balls"], fours=b["fours"], sixes=b["sixes"],
                        strike_rate=sr, dismissal_text=b["dismissal_text"]
                    ))
                    
                # Format bowlers
                final_bowlers = []
                for bo in bowler_stats.values():
                    legal = bo["legal_balls"]
                    overs_str = f"{legal // 6}.{legal % 6}"
                    overs_float = float(overs_str)
                    econ = (bo["runs"] / (legal / 6.0)) if legal > 0 else None
                    if econ is not None: econ = round(econ, 2)
                    final_bowlers.append(BowlerScorecard(
                        bowler_id=bo["bowler_id"], bowler_name=bo["bowler_name"],
                        overs=overs_float, maidens=0, runs=bo["runs"], wickets=bo["wickets"],
                        economy=econ, wides=bo["wides"], no_balls=bo["no_balls"]
                    ))

                extras_str = f"(b {extras_breakdown['b']}, lb {extras_breakdown['lb']}, w {extras_breakdown['w']}, nb {extras_breakdown['nb']})"

                # Append final total to over_runs
                over_runs.append(total_runs)
                scorecards.append(InningScorecard(
                    innings_id=innings_id,
                    inning_number=inn["innings_number"],
                    batting_team=inn["batting_team"],
                    bowling_team=inn["bowling_team"],
                    total_runs=total_runs,
                    total_wickets=total_wickets,
                    overs=total_overs,
                    extras=total_extras,
                    extras_detail=extras_str,
                    batters=final_batters,
                    bowlers=final_bowlers,
                    fow=fow,
                    partnerships=[PartnershipScorecard(**p) for p in partnerships],
                    over_runs=over_runs,
                    timeline=timeline,
                ))
            
            # Construct final response
            win_margin = None
            w_lower = (match_row["winner"] or "").lower()
            if match_row["win_by_runs"]:
                win_margin = f"{match_row['win_by_runs']} runs"
            elif match_row["win_by_wickets"]:
                win_margin = f"{match_row['win_by_wickets']} wickets"
            elif match_row["winner"] and w_lower not in ["tie", "draw", "no result"]:
                win_margin = "Super Over"

            # 3. Resolve player IDs → names in playing_xi
            raw_xi = match_row["playing_xi"] or {}
            resolved_xi = {}
            # Collect all player IDs (skip underscore keys which are already strings)
            all_ids = [
                pid
                for key, val in raw_xi.items()
                if not key.startswith("_") and isinstance(val, list)
                for pid in val
            ]
            id_to_name: dict = {}
            if all_ids:
                cur.execute(
                    "SELECT player_id, name FROM players WHERE player_id = ANY(%s)",
                    (all_ids,)
                )
                id_to_name = {row["player_id"]: row["name"] for row in cur.fetchall()}

            def xi_sort_key(pid: str, team: str) -> tuple:
                bat_pos = team_batting_order.get(team, {}).get(pid, 9999)
                bowl_pos = team_bowling_order.get(team, {}).get(pid, 9999)
                is_non_participant = pid not in all_participating_ids
                if is_non_participant:
                    return (2, 0, 0)          # always last
                elif bat_pos < 9999:
                    return (0, bat_pos, bowl_pos)  # batters: batting order first
                else:
                    return (1, bowl_pos, 0)   # pure bowlers: bowling order

            for key, val in raw_xi.items():
                if key.startswith("_"):
                    resolved_xi[key] = val
                elif isinstance(val, list):
                    sorted_ids = sorted(val, key=lambda pid: xi_sort_key(pid, key))
                    resolved_xi[key] = [id_to_name.get(pid, pid) for pid in sorted_ids]
                else:
                    resolved_xi[key] = val

            return MatchCardResponse(
                match_id=match_row["match_id"],
                date=match_row["date"],
                venue=match_row["venue"],
                city=match_row["city"],
                format=match_row["format"],
                competition=match_row["competition"],
                team1=match_row["team1"],
                team2=match_row["team2"],
                winner=match_row["winner"],
                win_margin=win_margin,
                toss_winner=match_row["toss_winner"],
                toss_decision=match_row["toss_decision"],
                player_of_match=match_row["player_of_match"],
                day_night=match_row["day_night"],
                playing_xi=resolved_xi,
                scorecard=scorecards
            )

    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "get_match_card")

# ── Matches search / browse ──────────────────────────────────

@app.get("/api/v1/matches", response_model=MatchListResponse)
def search_matches(
    team: Optional[str] = Query(None),
    team1: Optional[str] = Query(None),
    team2: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    competition: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    player: Optional[str] = Query(None),
    page: int = Query(0),
):
    """Search / browse matches with optional combinable filters."""
    try:
        # Shared params used by both count + data queries
        def _build_params(offset: int = 0, include_limit: bool = True):
            comp_like = f"%{competition}%" if competition else None
            team2_resolved = team2 if team1 and team2 else None
            params = [
                # single team filter
                team, team, team,
                # h2h filter — team1 AND team2
                team2_resolved,
                team1, team2_resolved,
                team2_resolved, team1,
                # format
                format, format,
                # competition
                comp_like, comp_like,
                # year
                year, year,
                # player
                player, player, player,
            ]
            if include_limit:
                params.append(offset)
            return params

        offset = page * 200
        with db_cursor() as cur:
            # total count
            cur.execute(Q.SEARCH_MATCHES_COUNT, _build_params(include_limit=False))
            total = cur.fetchone()["total"]

            # data
            cur.execute(Q.SEARCH_MATCHES, _build_params(offset=offset))
            rows = cur.fetchall()

        items = []
        for r in rows:
            w_lower = (r["winner"] or "").lower()
            if r["win_by_runs"]:
                margin = f"by {r['win_by_runs']} runs"
            elif r["win_by_wickets"]:
                margin = f"by {r['win_by_wickets']} wickets"
            elif r["winner"] and w_lower not in ["tie", "draw", "no result"]:
                margin = "Super Over"
            else:
                margin = None
            items.append(MatchListItem(
                match_id=r["match_id"],
                date=r["date"],
                team1=r["team1"],
                team2=r["team2"],
                winner=r["winner"],
                venue=r["venue"],
                format=r["format"],
                competition=r["competition"],
                win_margin=margin,
            ))

        return MatchListResponse(matches=items, total=total, page=page)

    except Exception as e:
        raise _server_error(e, "search_matches")


@app.get("/api/v1/competitions/search")
def search_competitions(q: str = Query("")):
    """Autocomplete competition/series names."""
    try:
        with db_cursor() as cur:
            cur.execute(Q.SEARCH_COMPETITIONS, (f"%{q}%",))
            rows = cur.fetchall()
        return {"competitions": [r["name"] for r in rows]}
    except Exception as e:
        raise _server_error(e, "search_competitions")


# ── Run directly ─────────────────────────────────────────────

if __name__ == '__main__':
    import uvicorn

    uvicorn.run('api.main:app', host='0.0.0.0', port=8000, reload=True)
