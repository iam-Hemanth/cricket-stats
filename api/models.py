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


# ── 7. Team head-to-head ─────────────────────────────────────

class TeamSearchResult(BaseModel):
    team: str


class TeamHeadToHead(BaseModel):
    team_a: str
    team_b: str
    format_bucket: str
    matches_played: int
    team_a_wins: int
    team_b_wins: int
    no_results: int
    avg_first_innings: float | None
    avg_second_innings: float | None
    highest_team_total: int | None
    first_match: str | None
    last_match: str | None


class TeamSeasonRecord(BaseModel):
    year: int
    format_bucket: str
    matches_played: int
    team_a_wins: int
    team_b_wins: int


class TeamRecentMatch(BaseModel):
    match_id: str
    date: str
    venue: str | None
    format_bucket: str
    batting_first: str
    bowling_first: str
    winner: str
    win_by_runs: int | None
    win_by_wickets: int | None
    first_innings_score: int | None


class TeamH2HResponse(BaseModel):
    team1: str
    team2: str
    by_format: list[TeamHeadToHead]
    seasons: list[TeamSeasonRecord]
    recent_matches: list[TeamRecentMatch]


# ── 8. Venue stats ──────────────────────────────────────────

class VenueStats(_RoundFloats):
    venue: str
    format: str
    matches_played: int
    avg_first_innings_score: Optional[float] = None
    avg_second_innings_score: Optional[float] = None
    highest_team_total: Optional[int] = None
    lowest_team_total: Optional[int] = None
    chasing_win_pct: Optional[float] = None


# ── 9. Phase specialist stats ───────────────────────────────

class PhaseStatBatting(_RoundFloats):
    phase_name: str
    format_bucket: str
    balls: int
    runs: int
    dot_balls: int
    boundaries: int
    dismissals: int
    strike_rate: float | None = None
    average: float | None = None
    dot_ball_pct: float | None = None
    boundary_pct: float | None = None


class PhaseStatBowling(_RoundFloats):
    phase_name: str
    format_bucket: str
    balls: int
    runs_conceded: int
    dot_balls: int
    wickets: int
    economy: float | None = None
    dot_ball_pct: float | None = None


class PlayerPhasesResponse(BaseModel):
    batting: list[PhaseStatBatting]
    bowling: list[PhaseStatBowling]


# ── 11. Form guide (last 10 innings) ─────────────────────────

class FormBattingEntry(BaseModel):
    match_id: str
    date: str
    format_bucket: str
    opposition: str
    venue: str | None
    runs: int
    balls_faced: int
    was_dismissed: bool
    strike_rate: float | None = None


class FormBowlingEntry(BaseModel):
    match_id: str
    date: str
    format_bucket: str
    opposition: str
    venue: str | None
    balls_bowled: int
    runs_conceded: int
    wickets: int
    economy: float | None = None


class PlayerFormResponse(BaseModel):
    batting: list[FormBattingEntry]
    bowling: list[FormBowlingEntry]
    last_updated: str | None


# ── 10. Health check ────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    matches_in_db: int
    last_sync: Optional[str] = None


# ── 12. Homepage highlights ────────────────────────────────

class StatCard(BaseModel):
    stat_id: str
    label: str
    player_name: str
    player_id: str | None
    value: str
    unit: str
    format_label: str


class OnFirePlayer(BaseModel):
    player_id: str
    player_name: str
    competition: str | None = None
    recent_matches: int
    recent_runs: int
    balls_faced: int
    dismissals: int
    recent_sr: float | None


class OnFireBowler(BaseModel):
    player_id: str
    player_name: str
    competition: str | None = None
    recent_matches: int
    balls_bowled: int
    runs_conceded: int
    wickets: int
    recent_economy: float | None


class RivalryOfDay(BaseModel):
    batter_id: str
    batter_name: str
    bowler_id: str
    bowler_name: str
    total_balls: int
    total_runs: int
    total_dismissals: int
    strike_rate: float | None


class HomepageHighlights(BaseModel):
    stat_cards: list[StatCard]
    on_fire_ipl_batting: list[OnFirePlayer]
    on_fire_ipl_bowling: list[OnFireBowler]
    on_fire_big_leagues_batting: list[OnFirePlayer]
    on_fire_big_leagues_bowling: list[OnFireBowler]
    on_fire_international_batting: list[OnFirePlayer]
    on_fire_international_bowling: list[OnFireBowler]
    rivalry_ipl: RivalryOfDay | None
    rivalry_international: RivalryOfDay | None
    cached_at: str
