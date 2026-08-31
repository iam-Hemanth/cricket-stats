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
    DismissalType,
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
    PlayerMetadata,
    PlayerPhasesResponse,
    PlayerVenueSplitsResponse,
    PlayerSearchResult,
    PlayerVsTeam,
    PlayerVsTeamDetailResponse,
    PVTFormatStats,
    PVTOverallStats,
    PVTPhaseStats,
    PVTYearStats,
    PVTVenueSplit,
    PVTDismissedBy,
    PVTRecentInning,
    RivalryOfDay,
    StatCard,
    TeamDashboardKPI,
    TeamDashboardResponse,
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
    VenueSplit,
    YearStats,
    FallOfWicket,
    BatterScorecard,
    BowlerScorecard,
    InningScorecard,
    PartnershipScorecard,
    StatBuilderRequest,
    StatBuilderResponse,
    StatBuilderBattingRow,
    StatBuilderBowlingRow,
    StatBuilderTeamRow,
    StatBuilderTeamCompareRow,
    StatBuilderSummary,
    StatBuilderMetaRequest,
    StatBuilderMeta,
    StatBuilderH2HResponse,
    H2HHighestScore,
    H2HIndividualScore,
    H2HBestBowling,
    H2HHistoricMatch,
    TournamentStandingsRow,
    TournamentSpotlight,
    ChampionCard,
    TournamentSpotlightResponse,
)
from api import queries as Q
from api import stat_builder as SB
from api.entity_resolution import resolve_team_input, resolve_venue_input, get_resolver
from ingestion.entity_resolver import make_name_key

# ── Logging ──────────────────────────────────────────────────
logger = logging.getLogger("cricket_api")
logging.basicConfig(level=logging.INFO)

_highlights_cache: dict = {"data": None, "expires_at": None}
_spotlight_cache: dict = {"data": None, "expires_at": None}

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
        origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

    if not origins:
        logger.warning(
            "CORS_ALLOWED_ORIGINS is empty in production; cross-origin requests will be blocked"
        )

    return origins


def resolve_format_filter(format_str: Optional[str]) -> Optional[list[str]]:
    if not format_str:
        return None
    if format_str == "T20":
        return ["T20", "T20I", "IPL", "IT20"]
    if format_str == "T20I":
        return ["T20I", "IT20"]
    return [format_str]


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
    _spotlight_cache.clear()
    _spotlight_cache.update({"data": None, "expires_at": None})


# ── Helpers ──────────────────────────────────────────────────

def _server_error(exc: Exception, context: str) -> HTTPException:
    """Log the real error server-side and return a generic 500."""
    if isinstance(exc, HTTPException):
        return exc
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
        featured_rivalries=[],
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

            cur.execute(Q.GET_ON_FIRE_T20I_BATTING)
            on_fire_t20i_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_T20I_BOWLING)
            on_fire_t20i_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_ODI_BATTING)
            on_fire_odi_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_ODI_BOWLING)
            on_fire_odi_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_TEST_BATTING)
            on_fire_test_batting_rows = cur.fetchall()

            cur.execute(Q.GET_ON_FIRE_TEST_BOWLING)
            on_fire_test_bowling_rows = cur.fetchall()

            cur.execute(Q.GET_RIVALRY_IPL)
            rivalry_ipl_row = cur.fetchone()

            cur.execute(Q.GET_RIVALRY_INTERNATIONAL)
            rivalry_international_row = cur.fetchone()

            cur.execute(Q.GET_FEATURED_RIVALRIES)
            featured_rivalries_rows = cur.fetchall()

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

        def _map_batting(rows) -> list[OnFirePlayer]:
            return [
                OnFirePlayer(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    competition=row.get("competition"),
                    recent_matches=int(row.get("recent_matches") or 0),
                    recent_runs=int(row.get("recent_runs") or 0),
                    balls_faced=int(row.get("balls_faced") or 0),
                    dismissals=int(row.get("dismissals") or 0),
                    recent_sr=(
                        float(row["recent_sr"])
                        if row.get("recent_sr") is not None
                        else None
                    ),
                    average=(
                        float(row["average"])
                        if row.get("average") is not None
                        else None
                    ),
                    fifties=int(row.get("fifties") or 0),
                    hundreds=int(row.get("hundreds") or 0),
                    highest_score=int(row["highest_score"]) if row.get("highest_score") is not None else None,
                )
                for row in rows
            ]

        def _map_bowling(rows) -> list[OnFireBowler]:
            return [
                OnFireBowler(
                    player_id=row["player_id"],
                    player_name=row["player_name"],
                    competition=row.get("competition"),
                    recent_matches=int(row.get("recent_matches") or 0),
                    balls_bowled=int(row.get("balls_bowled") or 0),
                    runs_conceded=int(row.get("runs_conceded") or 0),
                    wickets=int(row.get("wickets") or 0),
                    recent_economy=(
                        float(row["recent_economy"])
                        if row.get("recent_economy") is not None
                        else None
                    ),
                    bowling_average=(
                        float(row["bowling_average"])
                        if row.get("bowling_average") is not None
                        else None
                    ),
                    five_w=int(row.get("five_w") or 0),
                    best_bowling=str(row["best_bowling"]) if row.get("best_bowling") is not None else None,
                )
                for row in rows
            ]

        on_fire_ipl_batting = _map_batting(on_fire_ipl_batting_rows)
        on_fire_ipl_bowling = _map_bowling(on_fire_ipl_bowling_rows)
        on_fire_big_leagues_batting = _map_batting(on_fire_big_leagues_batting_rows)
        on_fire_big_leagues_bowling = _map_bowling(on_fire_big_leagues_bowling_rows)
        on_fire_t20i_batting = _map_batting(on_fire_t20i_batting_rows)
        on_fire_t20i_bowling = _map_bowling(on_fire_t20i_bowling_rows)
        on_fire_odi_batting = _map_batting(on_fire_odi_batting_rows)
        on_fire_odi_bowling = _map_bowling(on_fire_odi_bowling_rows)
        on_fire_test_batting = _map_batting(on_fire_test_batting_rows)
        on_fire_test_bowling = _map_bowling(on_fire_test_bowling_rows)

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

        featured_rivalries = [
            RivalryOfDay(
                batter_id=row["batter_id"],
                batter_name=row["batter_name"],
                bowler_id=row["bowler_id"],
                bowler_name=row["bowler_name"],
                total_balls=int(row["total_balls"] or 0),
                total_runs=int(row["total_runs"] or 0),
                total_dismissals=int(row["total_dismissals"] or 0),
                strike_rate=(
                    float(row["strike_rate"])
                    if row.get("strike_rate") is not None
                    else None
                ),
            )
            for row in featured_rivalries_rows
        ]

        payload = HomepageHighlights(
            stat_cards=stat_cards,
            on_fire_ipl_batting=on_fire_ipl_batting,
            on_fire_ipl_bowling=on_fire_ipl_bowling,
            on_fire_big_leagues_batting=on_fire_big_leagues_batting,
            on_fire_big_leagues_bowling=on_fire_big_leagues_bowling,
            on_fire_t20i_batting=on_fire_t20i_batting,
            on_fire_t20i_bowling=on_fire_t20i_bowling,
            on_fire_odi_batting=on_fire_odi_batting,
            on_fire_odi_bowling=on_fire_odi_bowling,
            on_fire_test_batting=on_fire_test_batting,
            on_fire_test_bowling=on_fire_test_bowling,
            on_fire_international_batting=on_fire_t20i_batting,
            on_fire_international_bowling=on_fire_t20i_bowling,
            rivalry_ipl=rivalry_ipl,
            rivalry_international=rivalry_international,
            featured_rivalries=featured_rivalries,
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


@app.get("/api/v1/homepage/tournament-spotlight", response_model=TournamentSpotlightResponse)
def tournament_spotlight():
    now = datetime.now(timezone.utc)
    expires_at = _spotlight_cache.get("expires_at")
    cached_data = _spotlight_cache.get("data")

    if cached_data and isinstance(expires_at, datetime) and expires_at > now:
        return cached_data

    fallback = TournamentSpotlightResponse(spotlight=None, champion=None)

    try:
        with db_cursor() as cur:
            cur.execute(Q.GET_ACTIVE_TOURNAMENT)
            active_row = cur.fetchone()
            
            spotlight = None
            if active_row:
                comp_id = active_row["competition_id"]
                name = active_row["name"]
                season = active_row["season"]
                
                cur.execute(Q.GET_TOURNAMENT_POINTS_TABLE, (comp_id, season))
                standings_rows = cur.fetchall()
                
                standings = []
                for idx, row in enumerate(standings_rows, 1):
                    form_list = [f.strip() for f in row["form_string"].split(",") if f.strip()] if row.get("form_string") else []
                    standings.append(
                        TournamentStandingsRow(
                            rank=idx,
                            team=row["team"],
                            played=int(row["played"] or 0),
                            won=int(row["won"] or 0),
                            lost=int(row["lost"] or 0),
                            no_result=int(row["no_result"] or 0),
                            nrr=float(row["nrr"] or 0.0),
                            points=int(row["points"] or 0),
                            form=form_list,
                        )
                    )
                
                # Check if tournament has concluded
                cur.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM matches 
                        WHERE competition_id = %s AND season = %s 
                          AND match_stage = 'Final' AND winner IS NOT NULL
                    ) AS concluded
                """, (comp_id, season))
                is_concluded = cur.fetchone()["concluded"]
                is_live = not is_concluded

                spotlight = TournamentSpotlight(
                    tournament_id=int(comp_id),
                    tournament_name=name,
                    season=season,
                    is_live=is_live,
                    standings=standings
                )
            
            cur.execute(Q.GET_RECENT_CHAMPION)
            champ_row = cur.fetchone()
            
            champion = None
            if champ_row:
                champion = ChampionCard(
                    winner=champ_row["winner"],
                    tournament=champ_row["tournament"],
                    season=champ_row["season"],
                    record=champ_row["record"],
                    final_margin=champ_row["final_margin"],
                    player_of_final=champ_row["player_of_final"],
                    best_bowling=champ_row["best_bowling"] or "N/A",
                    tagline=champ_row["tagline"],
                )
            
            payload = TournamentSpotlightResponse(
                spotlight=spotlight,
                champion=champion
            )
            
            serialized_payload = _convert_decimal_values(payload.model_dump())
            _spotlight_cache["data"] = serialized_payload
            _spotlight_cache["expires_at"] = now + timedelta(hours=6)
            return serialized_payload

    except Exception as e:
        logger.exception("Failed to build tournament spotlight: %s", e)
        _spotlight_cache["data"] = fallback.model_dump()
        _spotlight_cache["expires_at"] = now + timedelta(hours=6)
        return _spotlight_cache["data"]


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


@app.get("/api/v1/venues/search")
def search_venues(q: str = Query(..., description="Search query")):
    if len(q) < 2:
        raise HTTPException(
            status_code=400,
            detail="Search query must be at least 2 characters",
        )
    try:
        with db_cursor() as cur:
            cur.execute("""
                SELECT DISTINCT v.canonical_name AS venue
                FROM venues v
                LEFT JOIN venue_aliases va ON va.venue_id = v.venue_id
                WHERE v.canonical_name ILIKE %s OR va.alias_name ILIKE %s
                ORDER BY v.canonical_name
                LIMIT 50
            """, (f"%{q}%", f"%{q}%"))
            return [r["venue"] for r in cur.fetchall()]
    except Exception as e:
        raise _server_error(e, "search_venues")


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
            cur.execute(Q.SEARCH_TEAMS, (f"%{q}%", f"%{q}%"))
            return cur.fetchall()
    except Exception as e:
        raise _server_error(e, "search_teams")


@app.get("/api/v1/team/{team_name}/dashboard", response_model=TeamDashboardResponse)
def get_team_dashboard(team_name: str, format: Optional[str] = Query(None)):
    """Get a comprehensive snapshot of a team's performance."""
    team_name = resolve_team_input(team_name.strip())
    if not team_name:
        raise HTTPException(status_code=400, detail="Could not resolve team name")

    format_label = format

    try:
        resolved_format = resolve_format_filter(format)
        with db_cursor() as cur:
            # 1. KPI
            cur.execute(Q.GET_TEAM_DASHBOARD_KPI, (
                team_name, team_name, team_name, team_name,
                team_name, team_name,
                team_name,
                team_name, team_name, team_name,
                resolved_format, resolved_format,
                resolved_format, resolved_format,
                resolved_format, resolved_format,
                resolved_format, resolved_format
            ))
            kpi_data = cur.fetchone()
            if not kpi_data or kpi_data['matches_played'] == 0:
                raise HTTPException(status_code=404, detail="Team not found or no data available")

            # 2. Top Batters
            cur.execute(Q.GET_TEAM_TOP_SCORERS, (team_name, resolved_format, resolved_format))
            top_batters = cur.fetchall()

            # 3. Top Bowlers
            cur.execute(Q.GET_TEAM_TOP_BOWLERS, (team_name, resolved_format, resolved_format))
            top_bowlers = cur.fetchall()

            # 4. Recent Matches
            cur.execute(Q.GET_TEAM_RECENT_MATCHES_SINGLE, (team_name, team_name, resolved_format, resolved_format))
            recent_matches = cur.fetchall()

            # 5. Batting Phases
            cur.execute(Q.GET_TEAM_BATTING_PHASES, (team_name, resolved_format, resolved_format))
            batting_phases = cur.fetchone() or {}

            # 6. Bowling Splits
            cur.execute(Q.GET_TEAM_BOWLING_SPLITS, (team_name, resolved_format, resolved_format))
            bowling_splits = cur.fetchone() or {}

            # 7. H2H Summary
            cur.execute(Q.GET_TEAM_H2H_SUMMARY, (team_name, team_name, team_name, team_name, team_name, resolved_format, resolved_format))
            h2h_summary = cur.fetchall()

            # 8. All Time Records
            cur.execute(Q.GET_TEAM_ALL_TIME_RECORDS, (
                team_name, resolved_format, resolved_format, # Batting
                team_name, resolved_format, resolved_format, # Bowling
                team_name, team_name,      # High score
                resolved_format, resolved_format             # High score format
            ))
            all_time_records = cur.fetchone() or {}

            # 9. Season Performance
            cur.execute(Q.GET_TEAM_SEASON_PERFORMANCE, (team_name, team_name, team_name, resolved_format, resolved_format))
            yearly_performance = cur.fetchall()

            # 10. Venue Performance
            cur.execute(Q.GET_TEAM_VENUE_PERFORMANCE, (team_name, team_name, team_name, resolved_format, resolved_format))
            venue_performance = cur.fetchall()

            # 11. Achievements
            cur.execute(Q.GET_TEAM_ACHIEVEMENTS, (team_name, team_name, team_name, resolved_format, resolved_format))
            achievement_rows = cur.fetchall()
            
            # Pick best achievement based on stage priority
            priority = {"Winner": 3, "Runner-up": 2, "Semi-final": 1, "Quarter-final": 0.5, "Participant": 0}
            best_ach = None
            max_prio = -1
            
            for row in achievement_rows:
                p = priority.get(row['stage'], 0)
                if p > max_prio:
                    max_prio = p
                    best_ach = f"{row['stage']} - {row['comp_name']} ({row['year']})"
            
            trophies = [f"{r['stage']} - {r['comp_name']} ({r['year']})" for r in achievement_rows if r['stage'] == 'Winner']

            # 12. Available formats
            cur.execute(Q.GET_TEAM_AVAILABLE_FORMATS, (team_name, team_name))
            format_rows = cur.fetchall()
            format_map = {"IT20": "T20I", "T20": "T20I", "ODM": "ODI", "MDM": "Test"}
            allowed_formats = {"Test", "ODI", "T20I", "IPL"}
            available_formats = []
            has_any_t20 = False
            for row in format_rows:
                raw = row["format_bucket"]
                if raw in ("IT20", "T20", "IPL"):
                    has_any_t20 = True
                label = format_map.get(raw, raw)
                if label in allowed_formats and label not in available_formats:
                    available_formats.append(label)
            if has_any_t20 and "T20" not in available_formats:
                available_formats.append("T20")

            # 13. Target records (limited overs)
            cur.execute(Q.GET_TEAM_TARGET_RECORDS, (team_name, resolved_format, resolved_format, resolved_format, team_name, team_name))
            targets = cur.fetchone() or {}

            # 14. Form Pills
            form_pills = []
            for m in recent_matches[:10]:
                res = "W" if m['winner'] == team_name else "L" if m['winner'] and m['winner'] not in (None, "No Result") else "D"
                form_pills.append({
                    "result": res,
                    "match_id": m['match_id'],
                    "date": m['date']
                })

            # 15. Achievement mapping
            achievement_fallbacks = {
                "India": "2024 T20 World Cup Champions",
                "Australia": "2023 World Test & ODI Champions",
                "New Zealand": "2019 WC Finalist; 2021 WTC Winners",
                "Pakistan": "2022 T20 World Cup Finalist",
                "South Africa": "2024 T20 World Cup Finalist",
                "England": "2022 T20 World Cup Champions",
                "Punjab Kings": "2014 IPL Finalist",
                "Royal Challengers Bengaluru": "3-time IPL Finalist",
                "Delhi Capitals": "2020 IPL Finalist",
                "Lucknow Super Giants": "Playoffs 2022, 2023",
                "Gujarat Titans": "2022 IPL Champions",
            }
            achievement = best_ach or achievement_fallbacks.get(team_name, "Top Tier Competitor")

            # 16. Best Year
            best_year = None
            if yearly_performance:
                best_year_row = max(yearly_performance, key=lambda x: x['won'])
                best_year = f"{best_year_row['year']} ({best_year_row['won']} wins)"

            # 17. Metadata
            metadata = {
                "ranking": "#1" if team_name == "India" else "#2" if team_name == "Australia" else None,
                "active_since": 1932 if team_name == "India" else 1877 if team_name in ("Australia", "England") else None,
                "trophies": trophies,
                "achievement": achievement,
                "best_year": best_year
            }
            
            # Compute streak
            streak = 0
            for m in recent_matches:
                if m['winner'] == team_name:
                    streak += 1
                elif m['winner'] in (None, "No Result"):
                    continue
                else:
                    break
            kpi_data['win_streak'] = streak

            # 18. Batting Splits (Home/Away/Neutral)
            resolved_team = get_resolver().resolve_team(team_name)
            home_country = resolved_team.country if resolved_team else "Unknown"
            cur.execute(Q.GET_TEAM_BATTING_SPLITS, (
                team_name, team_name, resolved_format, resolved_format,
                home_country, home_country, # home
                home_country, home_country, # away
                home_country, home_country  # neutral
            ))
            batting_splits_row = cur.fetchone() or {}
            batting_splits = {
                "home_avg": batting_splits_row.get("home_avg"),
                "away_avg": batting_splits_row.get("away_avg"),
                "neutral_avg": batting_splits_row.get("neutral_avg")
            }

            return {
                "team_name": team_name,
                "format": format_label or "All",
                "available_formats": available_formats,
                "metadata": metadata,
                "kpi": kpi_data,
                "top_batters": top_batters,
                "top_bowlers": top_bowlers,
                "recent_matches": recent_matches,
                "form_pills": form_pills,
                "batting_phases": batting_phases,
                "batting_splits": batting_splits,
                "bowling_splits": bowling_splits,
                "yearly_performance": yearly_performance,
                "h2h_summary": h2h_summary,
                "all_time_records": all_time_records,
                "venue_performance": venue_performance,
                "targets": targets
            }
    except Exception as e:
        raise _server_error(e, f"get_team_dashboard:{team_name}")


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

    team1 = resolve_team_input(team1.strip())
    team2 = resolve_team_input(team2.strip())
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="Could not resolve one or both team names")

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
                    city=row.get("city"),
                    format_bucket=row["format_bucket"],
                    batting_first=row["batting_first"],
                    bowling_first=row["bowling_first"],
                    winner=row["winner"],
                    win_by_runs=row["win_by_runs"],
                    win_by_wickets=row["win_by_wickets"],
                    match_stage=row["match_stage"],
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

    team1 = resolve_team_input(team1.strip())
    team2 = resolve_team_input(team2.strip())
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="Could not resolve one or both team names")

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

    team1 = resolve_team_input(team1.strip())
    team2 = resolve_team_input(team2.strip())
    if not team1 or not team2:
        raise HTTPException(status_code=400, detail="Could not resolve one or both team names")

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
# 2b. Player metadata
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/players/{player_id}/metadata", response_model=PlayerMetadata)
def player_metadata(player_id: str):
    """Get player summary metadata: primary team, active years, matches, and POM count."""
    try:
        with db_cursor() as cur:
            # Get name
            cur.execute("SELECT name FROM players WHERE player_id = %s", (player_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Player not found")
            name = row["name"]

            # Get primary team (team they played most for)
            cur.execute("""
                WITH player_teams AS (
                    SELECT team, COUNT(DISTINCT match_id) AS matches
                    FROM (
                        SELECT i.batting_team AS team, i.match_id
                        FROM deliveries d
                        JOIN innings i ON d.innings_id = i.innings_id
                        WHERE d.batter_id = %s
                        UNION ALL
                        SELECT i.bowling_team AS team, i.match_id
                        FROM deliveries d
                        JOIN innings i ON d.innings_id = i.innings_id
                        WHERE d.bowler_id = %s
                    ) t
                    GROUP BY team
                )
                SELECT team FROM player_teams ORDER BY matches DESC LIMIT 1
            """, (player_id, player_id))
            team_row = cur.fetchone()
            primary_team = team_row["team"] if team_row else None

            # Get active years and total matches from deliveries
            cur.execute("""
                SELECT
                    MIN(EXTRACT(YEAR FROM m.date))::int AS min_year,
                    MAX(EXTRACT(YEAR FROM m.date))::int AS max_year,
                    COUNT(DISTINCT i.match_id) AS total_matches
                FROM deliveries d
                JOIN innings i ON d.innings_id = i.innings_id
                JOIN matches m ON i.match_id = m.match_id
                WHERE d.batter_id = %s OR d.bowler_id = %s
            """, (player_id, player_id))
            matches_row = cur.fetchone()
            min_year = matches_row["min_year"] if matches_row else None
            max_year = matches_row["max_year"] if matches_row else None
            total_matches = int(matches_row["total_matches"] or 0) if matches_row else 0

            # Get POM count
            cur.execute("""
                SELECT COUNT(*) AS pom_count
                FROM matches
                WHERE player_of_match = %s
            """, (name,))
            pom_row = cur.fetchone()
            pom_count = int(pom_row["pom_count"] or 0) if pom_row else 0

        return PlayerMetadata(
            player_id=player_id,
            name=name,
            primary_team=primary_team,
            min_year=min_year,
            max_year=max_year,
            total_matches=total_matches,
            pom_count=pom_count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "player_metadata")


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
            return rows or []
    except Exception as e:
        raise _server_error(e, "player_bowling")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/player-vs-team", response_model=PlayerVsTeamDetailResponse)
def player_vs_team(
    player_id: str,
    team: str,
    mode: str = Query("auto", description="'auto', 'batting', or 'bowling'"),
    format: Optional[str] = Query(None, description="Filter by format"),
):
    """
    Get detailed head-to-head stats for a specific player against a specific team.
    """
    resolved_team = resolve_team_input(team.strip())
    if not resolved_team:
        raise HTTPException(status_code=400, detail="Could not resolve team name")
    
    resolver = get_resolver()
    key = make_name_key(resolved_team)
    record = resolver._team_map.get(key) if key else None
    aliases = record.get("aliases", [resolved_team]) if record else [resolved_team]

    try:
        resolved_format = resolve_format_filter(format)
        with db_cursor() as cur:
            # Get player's name
            cur.execute("SELECT name FROM players WHERE player_id = %s", (player_id,))
            p_row = cur.fetchone()
            if not p_row:
                raise HTTPException(status_code=404, detail="Player not found")
            player_name = p_row["name"]

            # Determine active mode / role
            primary_role = "batting"
            active_mode = mode
            if mode == "auto":
                cur.execute(
                    Q.GET_PLAYER_PVT_ROLE,
                    (player_id, player_id, player_id, player_id, aliases, aliases)
                )
                role_row = cur.fetchone()
                if role_row:
                    faced = role_row["balls_faced"] or 0
                    bowled = role_row["balls_bowled"] or 0
                    if bowled > faced:
                        primary_role = "bowling"
                    else:
                        primary_role = "batting"
                active_mode = primary_role
            else:
                cur.execute(
                    Q.GET_PLAYER_PVT_ROLE,
                    (player_id, player_id, player_id, player_id, aliases, aliases)
                )
                role_row = cur.fetchone()
                if role_row:
                    faced = role_row["balls_faced"] or 0
                    bowled = role_row["balls_bowled"] or 0
                    if bowled > faced:
                        primary_role = "bowling"
                    else:
                        primary_role = "batting"

            # Fetch format-wise breakdown
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_BOWLING_BY_FORMAT, (player_id, aliases, resolved_format, resolved_format, player_id, aliases))
                format_rows = cur.fetchall()
            else:
                cur.execute(Q.GET_PVT_BATTING_BY_FORMAT, (player_id, aliases, resolved_format, resolved_format, player_id, player_id, aliases, player_id))
                format_rows = cur.fetchall()

            if not format_rows:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No records found for {player_name} against {resolved_team} in this configuration"
                )

            # Map format rows to PVTFormatStats
            by_format = []
            for r in format_rows:
                if active_mode == "bowling":
                    by_format.append(PVTFormatStats(
                        format_bucket=r["format_bucket"],
                        matches=r["matches"],
                        innings=r["innings"],
                        runs=r["runs"],
                        balls=r["balls"],
                        wickets=r.get("wickets") or 0,
                        four_w=r.get("four_w") or 0,
                        five_w=r.get("five_w") or 0,
                        bbi=r.get("bbi") or "—",
                        economy=r.get("economy"),
                        average=r.get("average"),
                        strike_rate=r.get("strike_rate"),
                        dot_ball_pct=r.get("dot_ball_pct"),
                        boundary_pct=r.get("boundary_pct"),
                    ))
                else:
                    by_format.append(PVTFormatStats(
                        format_bucket=r["format_bucket"],
                        matches=r["matches"],
                        innings=r["innings"],
                        runs=r["runs"],
                        balls=r["balls"],
                        dismissals=r.get("dismissals") or 0,
                        highest_score=r.get("highest_score"),
                        hundreds=r.get("hundreds") or 0,
                        fifties=r.get("fifties") or 0,
                        ducks=r.get("ducks") or 0,
                        not_outs=r.get("not_outs") or 0,
                        strike_rate=r.get("strike_rate"),
                        average=r.get("average"),
                        dot_ball_pct=r.get("dot_ball_pct"),
                        boundary_pct=r.get("boundary_pct"),
                    ))

            # Compute overall aggregated row in Python
            if active_mode == "bowling":
                total_matches = sum(r["matches"] for r in format_rows)
                total_innings = sum(r["innings"] for r in format_rows)
                total_runs_conceded = sum(r["runs"] for r in format_rows)
                total_balls = sum(r["balls"] for r in format_rows)
                total_wickets = sum(r.get("wickets") or 0 for r in format_rows)
                total_dot_balls = sum(r.get("dot_balls") or 0 for r in format_rows)
                total_boundaries = sum(r.get("boundaries") or 0 for r in format_rows)
                total_four_w = sum(r.get("four_w") or 0 for r in format_rows)
                total_five_w = sum(r.get("five_w") or 0 for r in format_rows)

                bbi_list = []
                for r in format_rows:
                    bbi_str = r.get("bbi")
                    if bbi_str and "/" in bbi_str:
                        try:
                            w_parts, r_parts = map(int, bbi_str.split("/"))
                            bbi_list.append((w_parts, r_parts, bbi_str))
                        except ValueError:
                            pass
                bbi_list.sort(key=lambda x: (x[0], -x[1]), reverse=True)
                overall_bbi = bbi_list[0][2] if bbi_list else "—"

                overall_economy = (total_runs_conceded * 6.0 / total_balls) if total_balls > 0 else None
                overall_average = (total_runs_conceded / total_wickets) if total_wickets > 0 else None
                overall_strike_rate = (total_balls / total_wickets) if total_wickets > 0 else None
                overall_dot_ball_pct = (total_dot_balls * 100.0 / total_balls) if total_balls > 0 else None
                overall_boundary_pct = (total_boundaries * 100.0 / total_balls) if total_balls > 0 else None

                overall = PVTOverallStats(
                    matches=total_matches,
                    innings=total_innings,
                    runs=total_runs_conceded,
                    balls=total_balls,
                    wickets=total_wickets,
                    four_w=total_four_w,
                    five_w=total_five_w,
                    bbi=overall_bbi,
                    economy=overall_economy,
                    average=overall_average,
                    strike_rate=overall_strike_rate,
                    dot_ball_pct=overall_dot_ball_pct,
                    boundary_pct=overall_boundary_pct,
                )
            else:
                total_matches = sum(r["matches"] for r in format_rows)
                total_innings = sum(r["innings"] for r in format_rows)
                total_runs = sum(r["runs"] for r in format_rows)
                total_balls = sum(r["balls"] for r in format_rows)
                total_dismissals = sum(r.get("dismissals") or 0 for r in format_rows)
                total_dot_balls = sum(r.get("dot_balls") or 0 for r in format_rows)
                total_boundaries = sum(r.get("boundaries") or 0 for r in format_rows)
                highest_score = max((r.get("highest_score") or 0) for r in format_rows) if format_rows else 0
                total_hundreds = sum(r.get("hundreds") or 0 for r in format_rows)
                total_fifties = sum(r.get("fifties") or 0 for r in format_rows)
                total_ducks = sum(r.get("ducks") or 0 for r in format_rows)
                total_not_outs = sum(r.get("not_outs") or 0 for r in format_rows)

                overall_strike_rate = (total_runs * 100.0 / total_balls) if total_balls > 0 else None
                overall_average = (total_runs / total_dismissals) if total_dismissals > 0 else None
                overall_dot_ball_pct = (total_dot_balls * 100.0 / total_balls) if total_balls > 0 else None
                overall_boundary_pct = (total_boundaries * 100.0 / total_balls) if total_balls > 0 else None

                overall = PVTOverallStats(
                    matches=total_matches,
                    innings=total_innings,
                    runs=total_runs,
                    balls=total_balls,
                    dismissals=total_dismissals,
                    highest_score=highest_score,
                    hundreds=total_hundreds,
                    fifties=total_fifties,
                    ducks=total_ducks,
                    not_outs=total_not_outs,
                    strike_rate=overall_strike_rate,
                    average=overall_average,
                    dot_ball_pct=overall_dot_ball_pct,
                    boundary_pct=overall_boundary_pct,
                )

            available_formats = list({r["format_bucket"] for r in format_rows})

            # Fetch phase stats
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_BOWLING_PHASE, (player_id, aliases, resolved_format, resolved_format))
                phase_rows = cur.fetchall()
            else:
                cur.execute(Q.GET_PVT_BATTING_PHASE, (player_id, aliases, resolved_format, resolved_format))
                phase_rows = cur.fetchall()
            
            phases = []
            for r in phase_rows:
                if active_mode == "bowling":
                    phases.append(PVTPhaseStats(
                        phase=r["phase"],
                        balls=r["balls"],
                        runs=r["runs"],
                        wickets=r.get("wickets") or 0,
                        economy=(r["runs"] * 6.0 / r["balls"]) if r["balls"] > 0 else None,
                        average=(r["runs"] / r["wickets"]) if r.get("wickets", 0) > 0 else None,
                        strike_rate=(r["balls"] / r["wickets"]) if r.get("wickets", 0) > 0 else None,
                    ))
                else:
                    phases.append(PVTPhaseStats(
                        phase=r["phase"],
                        balls=r["balls"],
                        runs=r["runs"],
                        dismissals=r.get("dismissals") or 0,
                        strike_rate=(r["runs"] * 100.0 / r["balls"]) if r["balls"] > 0 else None,
                        average=(r["runs"] / r["dismissals"]) if r.get("dismissals", 0) > 0 else None,
                    ))

            # Fetch venue splits
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_BOWLING_VENUE_SPLIT, (player_id, aliases, resolved_format, resolved_format))
                venue_rows = cur.fetchall()
            else:
                cur.execute(Q.GET_PVT_BATTING_VENUE_SPLIT, (player_id, aliases, resolved_format, resolved_format))
                venue_rows = cur.fetchall()

            venue_splits = []
            for r in venue_rows:
                if active_mode == "bowling":
                    venue_splits.append(PVTVenueSplit(
                        venue_type=r["venue_type"],
                        label=r["label"],
                        balls=r["balls"],
                        runs=r["runs"],
                        wickets=r.get("wickets") or 0,
                        economy=(r["runs"] * 6.0 / r["balls"]) if r["balls"] > 0 else None,
                        average=(r["runs"] / r["wickets"]) if r.get("wickets", 0) > 0 else None,
                        strike_rate=(r["balls"] / r["wickets"]) if r.get("wickets", 0) > 0 else None,
                    ))
                else:
                    venue_splits.append(PVTVenueSplit(
                        venue_type=r["venue_type"],
                        label=r["label"],
                        balls=r["balls"],
                        runs=r["runs"],
                        dismissals=r.get("dismissals") or 0,
                        strike_rate=r.get("strike_rate"),
                        average=r.get("average"),
                    ))

            # Fetch dismissed by / dismissed batters
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_DISMISSED_BATTERS, (player_id, aliases, resolved_format, resolved_format))
                dismissed_rows = cur.fetchall()
                dismissed_by = [
                    PVTDismissedBy(batter_id=r["batter_id"], batter_name=r["batter_name"], times_dismissed=r["times_dismissed"])
                    for r in dismissed_rows
                ]
            else:
                cur.execute(Q.GET_PVT_DISMISSED_BY, (player_id, aliases, resolved_format, resolved_format))
                dismissed_rows = cur.fetchall()
                dismissed_by = [
                    PVTDismissedBy(bowler_id=r["bowler_id"], bowler_name=r["bowler_name"], times_dismissed=r["times_dismissed"])
                    for r in dismissed_rows
                ]

            # Fetch recent innings / spells
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_RECENT_SPELLS, (player_id, player_id, aliases))
                recent_rows = cur.fetchall()
                recent_innings = []
                for r in recent_rows:
                    economy = (r["runs"] * 6.0 / r["legal_balls"]) if r["legal_balls"] > 0 else 0.0
                    overs = f"{r['legal_balls'] // 6}.{r['legal_balls'] % 6}"
                    recent_innings.append(PVTRecentInning(
                        match_id=str(r["match_id"]),
                        date=str(r["date"]),
                        venue=r.get("venue"),
                        format_bucket=r["format_bucket"],
                        batting_team=r.get("batting_team"),
                        bowling_team=r.get("bowling_team"),
                        innings_number=r.get("innings_number"),
                        runs=r["runs"],
                        balls=r["legal_balls"],
                        overs=overs,
                        maidens=r.get("maidens") or 0,
                        wickets=r.get("wickets") or 0,
                        economy=economy,
                    ))
            else:
                cur.execute(Q.GET_PVT_RECENT_INNINGS, (player_id, player_id, player_id, player_id, player_id, player_id, player_id, player_id, aliases, player_id, player_id))
                recent_rows = cur.fetchall()
                recent_innings = []
                for r in recent_rows:
                    not_out = r.get("how_out") is None
                    recent_innings.append(PVTRecentInning(
                        match_id=str(r["match_id"]),
                        date=str(r["date"]),
                        venue=r.get("venue"),
                        format_bucket=r["format_bucket"],
                        batting_team=r.get("batting_team"),
                        bowling_team=r.get("bowling_team"),
                        innings_number=r.get("innings_number"),
                        runs=r["runs"],
                        balls=r["balls"],
                        fours=r.get("fours"),
                        sixes=r.get("sixes"),
                        strike_rate=(r["runs"] * 100.0 / r["balls"]) if r["balls"] > 0 else 0.0,
                        how_out=r.get("how_out"),
                        dismissed_by_name=r.get("dismissed_by_name"),
                        not_out=not_out,
                    ))

            # Fetch by year stats
            if active_mode == "bowling":
                cur.execute(Q.GET_PVT_BOWLING_YEAR_BY_YEAR, (player_id, aliases, resolved_format, resolved_format))
                year_rows = cur.fetchall()
                by_year = [
                    PVTYearStats(
                        year=r["year"],
                        matches=r["matches"],
                        balls=r["legal_balls"],
                        runs=r["runs"],
                        wickets=r["wickets"]
                    ) for r in year_rows
                ]
            else:
                cur.execute(Q.GET_PVT_BATTING_YEAR_BY_YEAR, (player_id, aliases, resolved_format, resolved_format))
                year_rows = cur.fetchall()
                by_year = [
                    PVTYearStats(
                        year=r["year"],
                        matches=r["matches"],
                        balls=r["balls"],
                        runs=r["runs"],
                        dismissals=r["dismissals"]
                    ) for r in year_rows
                ]

        return PlayerVsTeamDetailResponse(
            player_id=player_id,
            player_name=player_name,
            team=resolved_team,
            primary_role=primary_role,
            active_mode=active_mode,
            overall=overall,
            by_format=by_format,
            available_formats=available_formats,
            phases=phases,
            venue_split=venue_splits,
            dismissed_by=dismissed_by,
            recent_innings=recent_innings,
            by_year=by_year,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "player_vs_team")


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
        resolved_format = resolve_format_filter(format)

        with db_cursor() as cur:
            # Fetch batting phases if role is None or 'batting'
            if role is None or role == "batting":
                cur.execute(Q.GET_PLAYER_PHASE_BATTING, (player_id, resolved_format, resolved_format))
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
                cur.execute(Q.GET_PLAYER_PHASE_BOWLING, (player_id, resolved_format, resolved_format))
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


@app.get("/api/v1/players/{player_id}/venue-splits", response_model=PlayerVenueSplitsResponse)
def player_venue_splits(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format (T20, ODI, etc.)"),
):
    """Get venue splits (home/away/neutral) for a player."""
    try:
        batting_data = []
        bowling_data = []
        resolved_format = resolve_format_filter(format)

        with db_cursor() as cur:
            # Fetch batting venue splits
            cur.execute(Q.GET_PLAYER_VENUE_SPLITS_BATTING, (player_id, resolved_format, resolved_format))
            batting_rows = cur.fetchall()
            for row in batting_rows:
                batting_data.append(
                    PVTVenueSplit(
                        venue_type=row["venue_type"],
                        label=row["label"],
                        balls=row["balls"] or 0,
                        runs=row["runs"] or 0,
                        dismissals=row["dismissals"],
                        wickets=row["wickets"],
                        strike_rate=row["strike_rate"],
                        average=row["average"],
                        economy=row["economy"],
                    )
                )

            # Fetch bowling venue splits
            cur.execute(Q.GET_PLAYER_VENUE_SPLITS_BOWLING, (player_id, resolved_format, resolved_format))
            bowling_rows = cur.fetchall()
            for row in bowling_rows:
                bowling_data.append(
                    PVTVenueSplit(
                        venue_type=row["venue_type"],
                        label=row["label"],
                        balls=row["balls"] or 0,
                        runs=row["runs"] or 0,
                        dismissals=row["dismissals"],
                        wickets=row["wickets"],
                        strike_rate=row["strike_rate"],
                        average=row["average"],
                        economy=row["economy"],
                    )
                )

        return PlayerVenueSplitsResponse(
            batting=batting_data,
            bowling=bowling_data,
        )
    except Exception as e:
        raise _server_error(e, "player_venue_splits")



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
                "T20I": 2,
                "IPL": 3,
                "T20": 4,
            }
            phase_order = {"powerplay": 0, "middle": 1, "death": 2}

            grouped_by_format: dict[str, list[dict]] = {}
            for r in rows:
                grouped_by_format.setdefault(r["format_bucket"], []).append(r)

            # Fetch and group venue splits
            cur.execute(Q.GET_MATCHUP_VENUE_SPLIT, (batter_id, bowler_id))
            venue_rows = cur.fetchall()
            venue_by_format: dict[str, list[VenueSplit]] = {}
            for r in venue_rows:
                fmt_name = r["format_bucket"]
                venue_by_format.setdefault(fmt_name, []).append(
                    VenueSplit(
                        venue_type=r["venue_type"],
                        label=r["label"],
                        balls=r["balls"] or 0,
                        runs=r["runs"] or 0,
                        dismissals=r["dismissals"] or 0,
                        strike_rate=to_float(r["strike_rate"]),
                        average=to_float(r["average"]),
                    )
                )

            # Fetch and group dismissal types
            cur.execute(Q.GET_MATCHUP_DISMISSAL_TYPES, (batter_id, bowler_id))
            dismissal_rows = cur.fetchall()
            dismissal_by_format: dict[str, list[DismissalType]] = {}
            for r in dismissal_rows:
                fmt_name = r["format_bucket"]
                if not fmt_name:
                    continue
                dismissal_by_format.setdefault(fmt_name, []).append(
                    DismissalType(
                        kind=r["kind"],
                        count=r["cnt"] or 0,
                    )
                )

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
                        venue_split=venue_by_format.get(fmt, []),
                        dismissal_types=dismissal_by_format.get(fmt, []),
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
        resolved_format = resolve_format_filter(format)
        with db_cursor() as cur:
            # Fetch batting form
            cur.execute(Q.GET_PLAYER_FORM_BATTING, (player_id, player_id, player_id, resolved_format, resolved_format))
            batting_rows = cur.fetchall()

            # Fetch bowling form
            cur.execute(Q.GET_PLAYER_FORM_BOWLING, (player_id, resolved_format, resolved_format))
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

def resolve_country_from_location(venue: str | None, city: str | None, competition: str | None) -> str:
    venue_lower = (venue or "").lower()
    city_lower = (city or "").lower()
    comp_lower = (competition or "").lower()
    
    # UAE
    if any(x in venue_lower or x in city_lower for x in ["abu dhabi", "sharjah", "dubai", "uae", "united arab emirates"]):
        return "United Arab Emirates"
    
    # South Africa
    if any(x in venue_lower or x in city_lower for x in ["centurion", "durban", "johannesburg", "cape town", "port elizabeth", "east london", "south africa", "bloemfontein", "paarl", "potchefstroom"]):
        return "South Africa"
        
    # West Indies
    if any(x in venue_lower or x in city_lower for x in ["barbados", "antigua", "st lucia", "trinidad", "guyana", "jamaica", "grenada", "st kitts", "st vincent", "dominica", "west indies"]):
        return "West Indies"

    # Australia
    if any(x in venue_lower or x in city_lower for x in ["melbourne", "sydney", "adelaide", "brisbane", "perth", "hobart", "geelong", "canberra", "gold coast", "australia"]):
        return "Australia"
        
    # England / Wales
    if any(x in venue_lower or x in city_lower for x in ["london", "manchester", "birmingham", "leeds", "nottingham", "cardiff", "bristol", "southampton", "taunton", "chester-le-street", "england", "wales"]):
        return "England"

    # New Zealand
    if any(x in venue_lower or x in city_lower for x in ["auckland", "wellington", "christchurch", "hamilton", "dunedin", "mount maunganui", "napier", "nelson", "queenstown", "new zealand"]):
        return "New Zealand"

    # Bangladesh
    if any(x in venue_lower or x in city_lower for x in ["dhaka", "chattogram", "sylhet", "mirpur", "chittagong", "bangladesh"]):
        return "Bangladesh"

    # Sri Lanka
    if any(x in venue_lower or x in city_lower for x in ["colombo", "kandy", "galle", "hambantota", "dambulla", "pallekele", "sri lanka"]):
        return "Sri Lanka"

    # Pakistan
    if any(x in venue_lower or x in city_lower for x in ["karachi", "lahore", "rawalpindi", "multan", "peshawar", "pakistan"]):
        return "Pakistan"

    # Zimbabwe
    if any(x in venue_lower or x in city_lower for x in ["harare", "bulawayo", "zimbabwe"]):
        return "Zimbabwe"

    # Ireland
    if any(x in venue_lower or x in city_lower for x in ["dublin", "belfast", "malahide", "ireland"]):
        return "Ireland"

    # Scotland
    if any(x in venue_lower or x in city_lower for x in ["edinburgh", "glasgow", "scotland"]):
        return "Scotland"

    # Nepal
    if any(x in venue_lower or x in city_lower for x in ["kirtipur", "kathmandu", "nepal"]):
        return "Nepal"

    # USA
    if any(x in venue_lower or x in city_lower for x in ["florida", "lauderhill", "texas", "dallas", "new york", "morrisville", "usa", "united states"]):
        return "United States"

    # India
    if "indian premier league" in comp_lower or "ipl" in comp_lower:
        return "India"
        
    indian_cities = [
        "kolkata", "mumbai", "delhi", "bengaluru", "bangalore", "chennai", "ahmedabad", 
        "hyderabad", "jaipur", "pune", "mohali", "chandigarh", "raipur", "ranchi", 
        "dharamsala", "visakhapatnam", "vizag", "kochi", "rajkot", "indore", "kanpur", 
        "nagpur", "cuttack", "guwahati", "dehradun", "lucknow", "india", "gwalior", "noida"
    ]
    if any(x in venue_lower or x in city_lower for x in indian_cities):
        return "India"
        
    if venue and "," in venue:
        parts = venue.split(",")
        last_part = parts[-1].strip()
        if len(last_part) > 2 and last_part[0].isupper():
            return last_part

    return "Unknown"


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
        resolved_format = resolve_format_filter(format)
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
                resolved_format, resolved_format,
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

            host_country = r["host_country"]
            if host_country == "Unknown" or not host_country:
                host_country = resolve_country_from_location(r["venue"], r["city"], r["competition"])

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
                match_stage=r["match_stage"],
                host_country=host_country,
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


# ── Stat Builder V2 ──────────────────────────────────────────

@app.post("/api/v1/stat-builder/batting", response_model=StatBuilderResponse)
def stat_builder_batting(req: StatBuilderRequest):
    """General-purpose batting stat builder."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_batting_query(req)
        
        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "bat")
            
            resolved_opps = []
            if req.vs_top_limit:
                sql_opp, params_opp = SB.query_top_opponents(req, "bowler")
                cur.execute(sql_opp, params_opp)
                resolved_opps = cur.fetchall()
            elif req.opposing_player_ids:
                placeholders = ", ".join(["%s"] * len(req.opposing_player_ids))
                cur.execute(f"SELECT player_id AS id, name, 0 AS metric FROM players WHERE player_id IN ({placeholders})", req.opposing_player_ids)
                resolved_opps = cur.fetchall()
            
        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)
        
        return StatBuilderResponse(
            rows=[StatBuilderBattingRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary,
            resolved_opponents=resolved_opps
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_batting")

@app.post("/api/v1/stat-builder/bowling", response_model=StatBuilderResponse)
def stat_builder_bowling(req: StatBuilderRequest):
    """General-purpose bowling stat builder."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_bowling_query(req)
        
        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "bowl")
            
            resolved_opps = []
            if req.vs_top_limit:
                sql_opp, params_opp = SB.query_top_opponents(req, "batter")
                cur.execute(sql_opp, params_opp)
                resolved_opps = cur.fetchall()
            elif req.opposing_player_ids:
                placeholders = ", ".join(["%s"] * len(req.opposing_player_ids))
                cur.execute(f"SELECT player_id AS id, name, 0 AS metric FROM players WHERE player_id IN ({placeholders})", req.opposing_player_ids)
                resolved_opps = cur.fetchall()
            
        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)
        
        return StatBuilderResponse(
            rows=[StatBuilderBowlingRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary,
            resolved_opponents=resolved_opps
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_bowling")

@app.post("/api/v1/stat-builder/team-results", response_model=StatBuilderResponse)
def stat_builder_team_results(req: StatBuilderRequest):
    """General-purpose team results builder."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_team_query(req, stat_type="team")
        
        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "team")
            
        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)
        
        return StatBuilderResponse(
            rows=[StatBuilderTeamRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_team_results")


@app.post("/api/v1/stat-builder/team-compare", response_model=StatBuilderResponse)
def stat_builder_team_compare(req: StatBuilderRequest):
    """Team Bat vs Bowl comparison stat builder."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_team_query(req, stat_type="team_compare")

        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "team_compare")

        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)

        return StatBuilderResponse(
            rows=[StatBuilderTeamCompareRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_team_compare")


@app.post("/api/v1/stat-builder/team-batting", response_model=StatBuilderResponse)
def stat_builder_team_batting(req: StatBuilderRequest):
    """Team batting stat builder (team-aggregated batting metrics)."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_team_query(req, stat_type="team_bat")

        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "team_bat")

        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)

        return StatBuilderResponse(
            rows=[StatBuilderTeamRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_team_batting")


@app.post("/api/v1/stat-builder/team-bowling", response_model=StatBuilderResponse)
def stat_builder_team_bowling(req: StatBuilderRequest):
    """Team bowling stat builder (team-aggregated bowling metrics)."""
    try:
        t0 = datetime.now()
        sql, params = SB.build_team_query(req, stat_type="team_bowl")

        with db_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            summary = SB.calculate_summary(rows, "team_bowl")

        t1 = datetime.now()
        ms = int((t1 - t0).total_seconds() * 1000)

        return StatBuilderResponse(
            rows=[StatBuilderTeamRow(rank=i+1, **r) for i, r in enumerate(rows)],
            total_count=len(rows),
            query_time_ms=ms,
            summary=summary
        )
    except Exception as e:
        raise _server_error(e, "stat_builder_team_bowling")

@app.post("/api/v1/stat-builder/meta", response_model=StatBuilderMeta)
def stat_builder_meta_post(req: StatBuilderMetaRequest):
    """Dynamic meta options for the Stat Builder UI."""
    try:
        queries = SB.build_meta_queries(
            formats=req.formats,
            tournaments=req.tournaments,
            countries=req.countries,
            year_from=req.year_from,
            year_to=req.year_to,
            include_unofficial=req.include_unofficial
        )
        
        res = {}
        with db_cursor() as cur:
            # Competitions
            q, p = queries["competitions"]
            cur.execute(q, p)
            res["competitions"] = [r["name"] for r in cur.fetchall()]
            
            # Teams
            q, p = queries["teams"]
            cur.execute(q, p)
            res["teams"] = [r["team"] for r in cur.fetchall()]
            
            # Venues
            q, p = queries["venues"]
            cur.execute(q, p)
            res["venues"] = [r["venue"] for r in cur.fetchall()]
            
            # Cities
            q, p = queries["cities"]
            cur.execute(q, p)
            res["cities"] = [r["city"] for r in cur.fetchall()]
            
            # Stages
            q, p = queries["stages"]
            cur.execute(q, p)
            res["stages"] = [r["match_stage"] for r in cur.fetchall()]
            
            # Countries
            q, p = queries["countries"]
            cur.execute(q, p)
            res["countries"] = [r["country"] for r in cur.fetchall()]
            
            # Year range
            q, p = queries["year_range"]
            cur.execute(q, p)
            r = cur.fetchone()
            res["year_range"] = [r["min_year"] or 2004, r["max_year"] or 2026]
            
        return StatBuilderMeta(**res)
    except Exception as e:
        raise _server_error(e, "stat_builder_meta_post")

@app.post("/api/v1/stat-builder/h2h", response_model=StatBuilderH2HResponse)
def stat_builder_h2h(req: StatBuilderRequest):
    """Head-to-head dashboard composite endpoint."""
    try:
        t0 = datetime.now()
        t1_team, t2_team = "", ""
        if len(req.teams) >= 2:
            t1_team, t2_team = req.teams[0], req.teams[1]
        elif len(req.teams) == 1 and len(req.opposition) >= 1:
            t1_team, t2_team = req.teams[0], req.opposition[0]
        elif len(req.teams) == 0 and len(req.opposition) >= 2:
            t1_team, t2_team = req.opposition[0], req.opposition[1]
            
        if not t1_team or not t2_team:
            raise HTTPException(status_code=400, detail="H2H requires exactly two teams.")

        # Python-side normalization for parameters
        def norm_name(n: str):
            if not n: return n
            if n in ('Royal Challengers Bangalore', 'Royal Challengers Bengaluru'): return 'Royal Challengers Bengaluru'
            if n in ('Kings XI Punjab', 'Punjab Kings'): return 'Punjab Kings'
            if n in ('Delhi Daredevils', 'Delhi Capitals'): return 'Delhi Capitals'
            if n in ('Deccan Chargers', 'Sunrisers Hyderabad'): return 'Sunrisers Hyderabad'
            return n

        nt1, nt2 = norm_name(t1_team), norm_name(t2_team)
        
        # SQL case for normalization
        T1N = SB.TEAM_NORM_SQL.format(col="m.team1")
        T2N = SB.TEAM_NORM_SQL.format(col="m.team2")
        WINN = SB.TEAM_NORM_SQL.format(col="m.winner")
        BT_NORM = SB.TEAM_NORM_SQL.format(col="i.batting_team")
        BW_NORM = SB.TEAM_NORM_SQL.format(col="i.bowling_team")

        # Dynamic filters for composite queries
        f_conds = []
        f_params = []
        
        # Standard filters
        # V2 filters (stages, cities, venues, countries, toss_decision, match_result, etc.)
        SB._apply_v2_filters(req, f_conds, f_params, match_alias="m", stat_type="h2h", focus_team_val=nt1, focus_team_col=T1N)
        
        # Toss filter (relative to Team 1)
        if req.toss == "Won":
            f_conds.append(f"{SB.TEAM_NORM_SQL.format(col='m.toss_winner')} = %s")
            f_params.append(nt1)
        elif req.toss == "Lost":
            f_conds.append(f"{SB.TEAM_NORM_SQL.format(col='m.toss_winner')} = %s")
            f_params.append(nt2)
            
        # Match Result filter (relative to Team 1)
        if req.match_result:
            res_parts = []
            for r in req.match_result:
                if r == "Won":
                    res_parts.append(f"{WINN} = %s")
                    f_params.append(nt1)
                elif r == "Lost":
                    res_parts.append(f"{WINN} = %s")
                    f_params.append(nt2)
                elif r == "Tie":
                    res_parts.append(f"{WINN} = 'tie'")
                elif r == "NR":
                    res_parts.append(f"({WINN} IS NULL OR {WINN} = 'no result')")
                elif r == "Draw":
                    res_parts.append(f"{WINN} = 'draw'")
            if res_parts:
                f_conds.append(f"({' OR '.join(res_parts)})")

        f_sql = " AND " + " AND ".join(f_conds) if f_conds else ""

        # Special Innings filter (only for queries joining 'innings i')
        inn_sql = ""
        inn_params = []
        if req.innings:
            inn_parts = []
            for inn in req.innings:
                if inn == "1st": inn_parts.append("i.innings_number = 1")
                elif inn == "2nd": inn_parts.append("i.innings_number = 2")
            if inn_parts:
                inn_sql = f" AND ({' OR '.join(inn_parts)})"
        # Parameter mapping fix:
        # q6_p: 2 for win filters + 4 for WHERE team filters + filter params
        # q4_p: 4 for WHERE team filters + filter params
        where_teams = (nt1, nt2, nt2, nt1)
        q6_p = (nt1, nt2, *where_teams, *f_params)
        q4_p = (*where_teams, *f_params)

        with db_cursor() as cur:
            # 1. Summary
            cur.execute(f"""
                WITH {SB.VENUE_COUNTRY_MAP_CTE}
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE {WINN} = %s) as t1_wins,
                    COUNT(*) FILTER (WHERE {WINN} = %s) as t2_wins,
                    COUNT(*) FILTER (WHERE {WINN} = 'tie') as ties,
                    COUNT(*) FILTER (WHERE {WINN} IS NULL OR {WINN} = 'no result') as nrs
                FROM matches m
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venue_country_map vm ON m.venue = vm.venue
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql}
            """, q6_p)
            summary = cur.fetchone()
            
            # 2. Seasons
            cur.execute(f"""
                WITH {SB.VENUE_COUNTRY_MAP_CTE}
                SELECT 
                    EXTRACT(YEAR FROM m.date)::int as year,
                    COUNT(*) FILTER (WHERE {WINN} = %s) as team_a_wins,
                    COUNT(*) FILTER (WHERE {WINN} = %s) as team_b_wins,
                    COUNT(*) as matches_played
                FROM matches m
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venue_country_map vm ON m.venue = vm.venue
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql}
                GROUP BY year ORDER BY year DESC
            """, q6_p)
            seasons = cur.fetchall()
            
            # 3. Performers
            req_t1 = req.model_copy(update={"teams": [nt1], "opposition": [nt2], "group_by": "player", "limit": 5})
            sql_b, pb = SB.build_batting_query(req_t1)
            cur.execute(sql_b, pb); t1_bat = cur.fetchall()
            
            req_t2 = req.model_copy(update={"teams": [nt2], "opposition": [nt1], "group_by": "player", "limit": 5})
            sql_b, pb = SB.build_batting_query(req_t2)
            cur.execute(sql_b, pb); t2_bat = cur.fetchall()
            
            sql_o, po = SB.build_bowling_query(req_t1)
            cur.execute(sql_o, po); t1_bowl = cur.fetchall()
            
            sql_o, po = SB.build_bowling_query(req_t2)
            cur.execute(sql_o, po); t2_bowl = cur.fetchall()

            # 4. Recent
            cur.execute(f"""
                WITH {SB.VENUE_COUNTRY_MAP_CTE}
                SELECT 
                    m.match_id, m.date, m.venue, m.city, vm.country as match_country, m.format, 
                    {T1N} as batting_first, {T2N} as bowling_first,
                    {WINN} as winner, m.win_by_runs, m.win_by_wickets,
                    m.match_stage,
                    (SELECT SUM(runs_total) FROM deliveries d2 JOIN innings i2 ON i2.innings_id = d2.innings_id WHERE i2.match_id = m.match_id AND i2.innings_number = 1) as first_innings_score
                FROM matches m
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venue_country_map vm ON m.venue = vm.venue
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql}
                ORDER BY m.date DESC LIMIT 100
            """, q4_p)
            recent = cur.fetchall()

            # 5. Totals (Highest & Lowest)
            over_calc = "(COUNT(*) FILTER (WHERE NOT (d.is_wide OR d.is_noball)) / 6) + ((COUNT(*) FILTER (WHERE NOT (d.is_wide OR d.is_noball)) %% 6) / 10.0)"
            cur.execute(f"""
                SELECT {BT_NORM} as team, {BW_NORM} as opposition,
                    SUM(d.runs_batter + d.runs_extras) as runs, COUNT(w.wicket_id) as wickets,
                    ROUND({over_calc}, 1) as overs,
                    m.date, m.venue, m.match_id
                FROM deliveries d JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches m ON m.match_id = i.match_id 
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venues v ON v.venue_id = m.venue_id
                LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql} {inn_sql}
                GROUP BY i.innings_id, {BT_NORM}, {BW_NORM}, m.date, m.venue, m.match_id
                ORDER BY runs DESC LIMIT 20
            """, q4_p)
            all_totals = cur.fetchall()
            
            cur.execute(f"""
                SELECT {BT_NORM} as team, {BW_NORM} as opposition,
                    SUM(d.runs_batter + d.runs_extras) as runs, COUNT(w.wicket_id) as wickets,
                    ROUND({over_calc}, 1) as overs,
                    m.date, m.venue, m.match_id
                FROM deliveries d JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches m ON m.match_id = i.match_id 
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venues v ON v.venue_id = m.venue_id
                LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql} {inn_sql}
                GROUP BY i.innings_id, {BT_NORM}, {BW_NORM}, m.date, m.venue, m.match_id
                ORDER BY runs ASC LIMIT 20
            """, q4_p)
            all_lowest = cur.fetchall()

            # 6. Individual
            cur.execute(f"""
                SELECT p.name as player_name, {BT_NORM} as team, SUM(d.runs_batter) as runs,
                    COUNT(*) FILTER (WHERE NOT d.is_wide) as balls, m.date, m.venue, m.match_id
                FROM deliveries d JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches m ON m.match_id = i.match_id 
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venues v ON v.venue_id = m.venue_id
                JOIN players p ON p.player_id = d.batter_id
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql} {inn_sql}
                GROUP BY i.innings_id, d.batter_id, p.name, {BT_NORM}, m.date, m.venue, m.match_id
                ORDER BY runs DESC LIMIT 20
            """, q4_p)
            all_ind = cur.fetchall()

            # 7. Historic
            cur.execute(f"""
                SELECT m.match_id, m.date, m.venue, m.match_stage, {WINN} as winner, m.win_by_runs, m.win_by_wickets, {T1N} as team1, {T2N} as team2
                FROM matches m 
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venues v ON v.venue_id = m.venue_id
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s))
                AND m.match_stage IS NOT NULL AND m.match_stage NOT IN ('League', 'Group', 'Match', 'none') {f_sql}
                ORDER BY m.date DESC LIMIT 10
            """, q4_p)
            hist_rows = cur.fetchall()
            historic = []
            for hr in hist_rows:
                # Fetch detailed scores (runs/wickets (overs))
                cur.execute(f"""
                    SELECT 
                        {SB.TEAM_NORM_SQL.format(col="batting_team")} as batting_team, 
                        SUM(runs_batter + runs_extras) as total,
                        COUNT(w.wicket_id) as wickets,
                        ROUND({over_calc}, 1) as overs
                    FROM deliveries d 
                    JOIN innings i ON i.innings_id = d.innings_id 
                    LEFT JOIN wickets w ON w.delivery_id = d.delivery_id
                    WHERE i.match_id = %s 
                    GROUP BY 1
                """, (hr["match_id"],))
                s_rows = cur.fetchall()
                scores = {r["batting_team"]: f"{r['total']}/{r['wickets']} ({r['overs']})" for r in s_rows}
                
                historic.append(H2HHistoricMatch(
                    match_id=str(hr["match_id"]), date=str(hr["date"]), match_stage=hr["match_stage"],
                    winner=hr["winner"] or "No Result", venue=hr["venue"],
                    margin=f"{hr['win_by_runs']} runs" if hr["win_by_runs"] else f"{hr['win_by_wickets']} wickets" if hr["win_by_wickets"] else "",
                    team1_score=scores.get(hr["team1"], "—"), team2_score=scores.get(hr["team2"], "—")
                ))

            # 8. Best Bowling
            over_calc = "(COUNT(*) FILTER (WHERE NOT (d.is_wide OR d.is_noball)) / 6) + ((COUNT(*) FILTER (WHERE NOT (d.is_wide OR d.is_noball)) %% 6) / 10.0)"
            cur.execute(f"""
                SELECT p.name as player_name, {BW_NORM} as team, COUNT(w.wicket_id) as wickets,
                    SUM(d.runs_batter + d.runs_extras) as runs,
                    ROUND({over_calc}, 1) as overs,
                    m.date, m.venue, m.match_id
                FROM deliveries d
                JOIN innings i ON i.innings_id = d.innings_id
                JOIN matches m ON m.match_id = i.match_id
                LEFT JOIN competitions c ON c.competition_id = m.competition_id
                LEFT JOIN venues v ON v.venue_id = m.venue_id
                LEFT JOIN wickets w ON w.delivery_id = d.delivery_id 
                    AND w.kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')
                JOIN players p ON p.player_id = d.bowler_id
                WHERE (({T1N} = %s AND {T2N} = %s) OR ({T1N} = %s AND {T2N} = %s)) {f_sql} {inn_sql}
                GROUP BY m.match_id, d.bowler_id, p.name, {BW_NORM}, m.date, m.venue
                ORDER BY wickets DESC, runs ASC LIMIT 20
            """, q4_p)
            all_bowl = cur.fetchall()

        return StatBuilderH2HResponse(
            team1=nt1, team2=nt2,
            team1_wins=summary["t1_wins"] or 0, team2_wins=summary["t2_wins"] or 0,
            ties=summary["ties"] or 0, no_results=summary["nrs"] or 0, total_matches=summary["total"] or 0,
            top_batters_team1=[TopBatterH2H(player_id=str(r["player_id"]), player_name=r["label"], runs=r["runs"], innings=r["innings"], average=r["average"] or 0, strike_rate=r["strike_rate"] or 0, highest_score=0, fifties=0, hundreds=0) for r in t1_bat],
            top_batters_team2=[TopBatterH2H(player_id=str(r["player_id"]), player_name=r["label"], runs=r["runs"], innings=r["innings"], average=r["average"] or 0, strike_rate=r["strike_rate"] or 0, highest_score=0, fifties=0, hundreds=0) for r in t2_bat],
            top_bowlers_team1=[TopBowlerH2H(player_id=str(r["player_id"]), player_name=r["label"], wickets=r["wickets"], innings_bowled=r["innings"], economy=r["economy"] or 0, bowling_average=r["bowling_average"] or 0, strike_rate=r["bowling_strike_rate"] or 0, best_bowling="—") for r in t1_bowl],
            top_bowlers_team2=[TopBowlerH2H(player_id=str(r["player_id"]), player_name=r["label"], wickets=r["wickets"], innings_bowled=r["innings"], economy=r["economy"] or 0, bowling_average=r["bowling_average"] or 0, strike_rate=r["bowling_strike_rate"] or 0, best_bowling="—") for r in t2_bowl],
            recent_matches=[TeamRecentMatch(
                match_id=str(r["match_id"]), 
                date=str(r["date"]), 
                venue=r["venue"], 
                city=r.get("city"),
                match_country=r.get("match_country"),
                format_bucket=r["format"], 
                batting_first=r["batting_first"], 
                bowling_first=r["bowling_first"], 
                winner=r["winner"], 
                win_by_runs=r["win_by_runs"], 
                win_by_wickets=r["win_by_wickets"],
                match_stage=r["match_stage"],
                first_innings_score=r["first_innings_score"]
            ) for r in recent],
            team1_highest_totals=[H2HHighestScore(team=r["team"], opposition=r["opposition"], runs=r["runs"], wickets=r["wickets"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_totals if norm_name(r["team"]) == nt1][:5],
            team2_highest_totals=[H2HHighestScore(team=r["team"], opposition=r["opposition"], runs=r["runs"], wickets=r["wickets"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_totals if norm_name(r["team"]) == nt2][:5],
            team1_lowest_totals=[H2HHighestScore(team=r["team"], opposition=r["opposition"], runs=r["runs"], wickets=r["wickets"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_lowest if norm_name(r["team"]) == nt1][:5],
            team2_lowest_totals=[H2HHighestScore(team=r["team"], opposition=r["opposition"], runs=r["runs"], wickets=r["wickets"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_lowest if norm_name(r["team"]) == nt2][:5],
            team1_highest_individual=[H2HIndividualScore(player_name=r["player_name"], team=r["team"], runs=r["runs"], balls=r["balls"], date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_ind if norm_name(r["team"]) == nt1][:5],
            team2_highest_individual=[H2HIndividualScore(player_name=r["player_name"], team=r["team"], runs=r["runs"], balls=r["balls"], date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_ind if norm_name(r["team"]) == nt2][:5],
            team1_best_bowling=[H2HBestBowling(player_name=r["player_name"], team=r["team"], wickets=r["wickets"], runs=r["runs"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_bowl if norm_name(r["team"]) == nt1][:5],
            team2_best_bowling=[H2HBestBowling(player_name=r["player_name"], team=r["team"], wickets=r["wickets"], runs=r["runs"], overs=float(r["overs"]), date=str(r["date"]), venue=r["venue"], match_id=str(r["match_id"])) for r in all_bowl if norm_name(r["team"]) == nt2][:5],
            historic_matches=historic, seasons=[TeamSeasonRecord(**s) for s in seasons]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "stat_builder_h2h")


# ── Run directly ─────────────────────────────────────────────

if __name__ == '__main__':
    import uvicorn

    uvicorn.run('api.main:app', host='0.0.0.0', port=8000, reload=True)
