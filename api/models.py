"""
Pydantic response models for the Cricket Statistics API.

All float fields are rounded to 2 decimal places via a model validator.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, model_validator


class _RoundFloats(BaseModel):
    """Base class that rounds every float field to 2 decimal places."""

    @model_validator(mode="after")
    def _round_floats(self):
        for name, field in self.model_fields.items():
            val = getattr(self, name)
            if isinstance(val, float):
                setattr(self, name, round(val, 2))
        return self


# ── 1. Player search ─────────────────────────────────────────

class PlayerSearchResult(BaseModel):
    player_id: str
    name: str


# ── 2. Batting ───────────────────────────────────────────────

class BattingStats(_RoundFloats):
    player_id: str
    player_name: str
    format: str
    year: int
    competition_name: Optional[str] = None
    matches: int
    innings: int
    runs: int
    balls_faced: int
    average: Optional[float] = None
    strike_rate: Optional[float] = None
    fifties: int
    hundreds: int
    ducks: int
    highest_score: int


# ── 3. Bowling ───────────────────────────────────────────────

class BowlingStats(_RoundFloats):
    player_id: str
    player_name: str
    format: str
    year: int
    competition_name: str | None = None
    innings_bowled: int
    wickets: int
    runs_conceded: int
    economy: Optional[float] = None
    bowling_average: Optional[float] = None
    strike_rate: Optional[float] = None


# ── 4. Batter vs Bowler matchup ──────────────────────────────

class MatchupStats(_RoundFloats):
    batter_id: str
    batter_name: str
    bowler_id: str
    bowler_name: str
    balls: int
    runs: int
    dismissals: int
    average: Optional[float] = None
    strike_rate: Optional[float] = None
    dot_ball_pct: Optional[float] = None
    boundary_pct: Optional[float] = None


class PhaseStats(BaseModel):
    phase: str
    balls: int
    runs: int
    dismissals: int
    strike_rate: float | None
    average: float | None


class YearStats(BaseModel):
    year: int
    balls: int
    runs: int
    dismissals: int
    strike_rate: float | None
    average: float | None


class FormatMatchup(BaseModel):
    format_bucket: str
    balls: int
    runs: int
    dismissals: int
    strike_rate: float | None
    average: float | None
    dot_ball_pct: float | None
    boundary_pct: float | None
    phases: list[PhaseStats]
    by_year: list[YearStats]


class MatchupDelivery(BaseModel):
    date: str
    over_number: int
    ball_number: int
    runs_batter: int
    is_wicket: bool
    batting_team: str
    bowling_team: str
    venue: str | None


class MatchupResponse(BaseModel):
    batter_id: str
    batter_name: str
    bowler_id: str
    bowler_name: str
    overall: dict
    by_format: list[FormatMatchup]
    recent_deliveries: list[MatchupDelivery]


# ── 5. Player vs team ───────────────────────────────────────

class PlayerVsTeam(_RoundFloats):
    player_id: str
    player_name: str
    opposition_team: str
    role: str
    matches: int
    runs: Optional[int] = None
    average: Optional[float] = None
    strike_rate: Optional[float] = None
    wickets: Optional[int] = None
    economy: Optional[float] = None


# ── 6. Partnerships ────────────────────────────────────────────

class PartnershipStats(BaseModel):
    partner_id: str
    partner_name: str
    format_bucket: str
    innings_together: int
    total_runs: int
    avg_partnership: float | None
    best_partnership: int


# ── 7. Venue stats ──────────────────────────────────────────

class VenueStats(_RoundFloats):
    venue: str
    format: str
    matches_played: int
    avg_first_innings_score: Optional[float] = None
    avg_second_innings_score: Optional[float] = None
    highest_team_total: Optional[int] = None
    lowest_team_total: Optional[int] = None
    chasing_win_pct: Optional[float] = None


# ── 8. Health check ─────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    matches_in_db: int
    last_sync: Optional[str] = None
