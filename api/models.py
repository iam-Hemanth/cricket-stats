"""
Pydantic response models for the Cricket Statistics API.

All float fields are rounded to 2 decimal places via a model validator.
"""

from __future__ import annotations

from datetime import date
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


# ── 1b. Player metadata ──────────────────────────────────────

class PlayerMetadata(BaseModel):
    player_id: str
    name: str
    primary_team: Optional[str] = None
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    total_matches: int
    pom_count: int


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
    five_w: int = 0
    ten_w: int = 0



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


class VenueSplit(BaseModel):
    venue_type: str  # home, away, neutral
    label: str
    balls: int
    runs: int
    dismissals: int
    strike_rate: float | None
    average: float | None


class DismissalType(BaseModel):
    kind: str
    count: int


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
    venue_split: list[VenueSplit] = []
    dismissal_types: list[DismissalType] = []


class MatchupDelivery(BaseModel):
    date: date | str
    over_number: int
    ball_number: int
    runs_batter: int
    is_wicket: bool
    batting_team: str
    bowling_team: str
    venue: str | None


class MatchupResponse(BaseModel):
    batter_id: str
    batter_name: str | None = None
    bowler_id: str
    bowler_name: str | None = None
    no_data: bool = False
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
    format_bucket: str | None = None
    matches_played: int | None = None
    team_a_wins: int
    team_b_wins: int

class TeamYearlyStats(BaseModel):
    year: int
    played: int
    won: int


class TeamRecentMatch(BaseModel):
    match_id: str
    date: date | str
    venue: str | None
    city: str | None = None
    match_country: str | None = None
    format_bucket: str
    batting_first: str
    bowling_first: str
    winner: str | None = None
    win_by_runs: int | None = None
    win_by_wickets: int | None = None
    match_stage: str | None = None
    first_innings_score: int | None = None


class TopPerformer(BaseModel):
    player_id: str
    player_name: str
    total_runs: Optional[int] = None
    total_wickets: Optional[int] = None
    matches: int
    innings: Optional[int] = None


class TeamH2HResponse(BaseModel):
    team1: str
    team2: str
    by_format: list[TeamHeadToHead]
    seasons: list[TeamSeasonRecord]
    recent_matches: list[TeamRecentMatch]
    top_scorers_vs_team1: list[TopPerformer] = []
    top_scorers_vs_team2: list[TopPerformer] = []
    top_wickets_vs_team1: list[TopPerformer] = []
    top_wickets_vs_team2: list[TopPerformer] = []


# ── 7b. Single Team Dashboard ───────────────────────────────

class TeamDashboardMetadata(BaseModel):
    ranking: Optional[str] = None
    active_since: Optional[int] = None
    trophies: list[str] = []
    achievement: Optional[str] = None
    best_year: Optional[str] = None

class TeamFormPill(BaseModel):
    result: str # W, L, D, NR
    match_id: str
    date: date | str

class TeamBattingPhases(_RoundFloats):
    powerplay_avg: Optional[float] = None
    powerplay_sr: Optional[float] = None
    middle_avg: Optional[float] = None
    middle_sr: Optional[float] = None
    death_avg: Optional[float] = None
    death_sr: Optional[float] = None

class TeamBattingSplits(_RoundFloats):
    home_avg: Optional[float] = None
    away_avg: Optional[float] = None
    neutral_avg: Optional[float] = None

class TeamBowlingSplits(_RoundFloats):
    bowling_avg: Optional[float] = None
    bowling_economy: Optional[float] = None
    innings1_avg: Optional[float] = None
    innings2_avg: Optional[float] = None

class TeamH2HSummary(BaseModel):
    opposition: str
    played: int
    won: int
    lost: int
    draw_nr: int

class TeamAllTimeRecords(BaseModel):
    most_runs_player: str
    most_runs_value: int
    most_wickets_player: str
    most_wickets_value: int
    highest_total: str # "759/7 vs ENG"
    special_feat: Optional[str] = None # deprecated placeholder

class TeamTargetRecords(BaseModel):
    lowest_target_defended: Optional[int] = None
    highest_target_conceded: Optional[int] = None

class TeamDashboardKPI(_RoundFloats):
    matches_played: int
    won: int
    lost: int
    tied: int
    no_result: int
    win_percentage: float
    avg_runs_per_over: float | None = None
    avg_runs_conceded_per_over: float | None = None
    highest_score: int | None = None
    lowest_score: int | None = None
    win_streak: Optional[int] = None

class TeamDashboardResponse(BaseModel):
    team_name: str
    format: str
    available_formats: list[str] = []
    metadata: TeamDashboardMetadata
    kpi: TeamDashboardKPI
    top_batters: list[TopBatterH2H]
    top_bowlers: list[TopBowlerH2H]
    recent_matches: list[TeamRecentMatch]
    form_pills: list[TeamFormPill]
    batting_phases: TeamBattingPhases
    batting_splits: TeamBattingSplits
    bowling_splits: TeamBowlingSplits
    yearly_performance: list[TeamYearlyStats]
    h2h_summary: list[TeamH2HSummary]
    all_time_records: TeamAllTimeRecords
    venue_performance: list[VenueStats] = []
    targets: TeamTargetRecords | None = None


# ── 7a. Top Scorers in Team Matchups (H2H detailed) ─────────

class TopBatterH2H(_RoundFloats):
    player_id: str
    player_name: str
    runs: int
    innings: int
    average: Optional[float] = None
    strike_rate: Optional[float] = None
    highest_score: int
    fifties: int
    hundreds: int


class TopBowlerH2H(_RoundFloats):
    player_id: str
    player_name: str
    wickets: int
    innings_bowled: int
    economy: Optional[float] = None
    bowling_average: Optional[float] = None
    strike_rate: Optional[float] = None
    best_bowling: str


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
    batting_specialist_badge: Optional[str] = None
    bowling_specialist_badge: Optional[str] = None


# ── 10. Test innings splits ─────────────────────────────────

class TestInningsSplitBatting(_RoundFloats):
    innings_number: int          # 1 or 2
    innings_count: int
    runs: int
    balls_faced: int
    dismissals: int
    average: float | None = None
    strike_rate: float | None = None
    hundreds: int
    fifties: int
    highest_score: int


class TestInningsSplitBowling(_RoundFloats):
    innings_number: int          # 1 or 2
    innings_count: int
    wickets: int
    runs_conceded: int
    balls: int
    economy: float | None = None
    bowling_average: float | None = None
    strike_rate: float | None = None


class TestSplitsResponse(BaseModel):
    batting: list[TestInningsSplitBatting]
    bowling: list[TestInningsSplitBowling]



# ── 11. Form guide (last 10 innings) ─────────────────────────

class FormBattingEntry(BaseModel):
    match_id: str
    date: date | str
    format_bucket: str
    opposition: str
    venue: str | None
    batting_team: str
    runs: int
    balls_faced: int
    was_dismissed: bool
    strike_rate: float | None = None


class FormBowlingEntry(BaseModel):
    match_id: str
    date: date | str
    format_bucket: str
    opposition: str
    bowling_team: str
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
    recent_sr: float | None = None
    average: float | None = None
    fifties: int = 0
    hundreds: int = 0
    highest_score: int | None = None


class OnFireBowler(BaseModel):
    player_id: str
    player_name: str
    competition: str | None = None
    recent_matches: int
    balls_bowled: int
    runs_conceded: int
    wickets: int
    recent_economy: float | None = None
    bowling_average: float | None = None
    five_w: int = 0
    best_bowling: str | None = None


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
    on_fire_t20i_batting: list[OnFirePlayer] = []
    on_fire_t20i_bowling: list[OnFireBowler] = []
    on_fire_odi_batting: list[OnFirePlayer] = []
    on_fire_odi_bowling: list[OnFireBowler] = []
    on_fire_test_batting: list[OnFirePlayer] = []
    on_fire_test_bowling: list[OnFireBowler] = []
    on_fire_international_batting: list[OnFirePlayer] = []
    on_fire_international_bowling: list[OnFireBowler] = []
    rivalry_ipl: RivalryOfDay | None
    rivalry_international: RivalryOfDay | None
    featured_rivalries: list[RivalryOfDay] = []
    cached_at: str



class TournamentStandingsRow(BaseModel):
    rank: int
    team: str
    played: int
    won: int
    lost: int
    no_result: int
    nrr: float
    points: int
    form: list[str] = []


class TournamentSpotlight(BaseModel):
    tournament_id: int
    tournament_name: str
    season: str
    is_live: bool
    standings: list[TournamentStandingsRow]


class ChampionCard(BaseModel):
    winner: str
    tournament: str
    season: str
    record: str
    final_margin: str
    player_of_final: str
    best_bowling: str
    tagline: str


class TournamentSpotlightResponse(BaseModel):
    spotlight: Optional[TournamentSpotlight] = None
    champion: Optional[ChampionCard] = None


# ── 13. On This Day ────────────────────────────────────────

class OnThisDayMatch(BaseModel):
    match_id: str
    date: date | str
    team1: str
    team2: str
    winner: Optional[str] = None
    venue: Optional[str] = None
    format: str
    years_ago: int

# ── 14. Match Card ──────────────────────────────────────────

class BatterScorecard(BaseModel):
    batter_id: str
    batter_name: str
    runs: int
    balls: int
    fours: int
    sixes: int
    strike_rate: float | None
    dismissal_text: str

class BowlerScorecard(BaseModel):
    bowler_id: str
    bowler_name: str
    overs: float
    maidens: int
    runs: int
    wickets: int
    economy: float | None
    wides: int
    no_balls: int

class FallOfWicket(BaseModel):
    runs: int
    wickets: int
    batter_id: str
    batter_name: str
    over: float

class PartnershipScorecard(BaseModel):
    batter1_id: str
    batter1_name: str
    batter1_runs: int
    batter1_balls: int
    batter2_id: str
    batter2_name: str
    batter2_runs: int
    batter2_balls: int
    total_runs: int
    total_balls: int

class InningScorecard(BaseModel):
    innings_id: int
    inning_number: int
    batting_team: str
    bowling_team: str
    total_runs: int
    total_wickets: int
    overs: float
    extras: int
    extras_detail: str  # e.g., "(b 1, lb 2, w 3, nb 4)"
    batters: list[BatterScorecard]
    bowlers: list[BowlerScorecard]
    fow: list[FallOfWicket]
    partnerships: list[PartnershipScorecard]
    over_runs: list[int]  # cumulative runs after each completed over
    timeline: list[str] | None = None

class MatchCardResponse(BaseModel):
    match_id: str
    date: date | str
    venue: str | None
    city: str | None
    format: str
    competition: str | None
    team1: str
    team2: str
    winner: str | None
    win_margin: str | None
    toss_winner: str | None
    toss_decision: str | None
    player_of_match: str | None
    day_night: str | None
    playing_xi: dict | None
    scorecard: list[InningScorecard]


# ── 15. Match list (browse / search) ────────────────────────

class MatchListItem(BaseModel):
    match_id: str
    date: date | str
    team1: str
    team2: str
    winner: str | None = None
    venue: str | None = None
    format: str
    competition: str | None = None
    win_margin: str | None = None
    match_stage: str | None = None
    host_country: str | None = None


class MatchListResponse(BaseModel):
    matches: list[MatchListItem]
    total: int
    page: int


# ── Stat Builder ─────────────────────────────────────────────

class StatBuilderRequest(BaseModel):
    """Incoming filter payload for the stat builder query engine."""
    # ── Core Filters ──────────────────────────────────────────
    player_name: str | None = None
    formats: list[str] = []
    innings: list[str] = []               # "1st" | "2nd" | "Chase" | "Setting"
    phases: list[str] = []                 # "powerplay" | "middle" | "death"
    over_from: int | None = None
    over_to: int | None = None
    opposition: list[str] = []
    venue_search: str | None = None
    venues: list[str] = []
    countries: list[str] = []
    ground_type: str | None = None         # "Home" | "Away" | "Neutral"
    year_from: int | None = None
    year_to: int | None = None
    tournaments: list[str] = []
    match_result: list[str] = []           # "Won" | "Lost" | "Draw" | "Tie" | "NR"
    toss: str | None = None                # "Won" | "Lost"
    day_night: str | None = None           # "day" | "day/night" | "night"
    match_month: int | None = None         # 1-12
    match_day: int | None = None           # 1-31

    # ── New Dynamic Filters (V2) ─────────────────────────────
    match_stages: list[str] = []           # "Final" | "Semi Final" | "Qualifier 1" | …
    match_groups: list[str] = []           # "A" | "B" | "Super Eight" | …
    cities: list[str] = []
    teams: list[str] = []                  # specific teams involved
    players_involved: list[str] = []       # player_ids who featured in the match
    date_from: str | None = None           # "2024-03-22"
    date_to: str | None = None             # "2024-05-26"
    match_number_from: int | None = None
    match_number_to: int | None = None
    toss_decision: str | None = None       # "bat" | "field"
    batting_positions: list[str] = []      # "opener" | "top_order" | "middle" | "lower" | "tail"
    dismissal_types: list[str] = []        # "bowled" | "caught" | "lbw" | …
    player_of_match_only: bool = False
    is_not_out: bool = False
    super_over_only: bool = False
    min_win_by_runs: int | None = None
    max_win_by_runs: int | None = None
    min_win_by_wickets: int | None = None
    max_win_by_wickets: int | None = None

    # ── New Team Total Filters (V3) ──────────────────────────
    min_team_runs: int | None = None
    max_team_runs: int | None = None
    min_opp_runs: int | None = None
    max_opp_runs: int | None = None
    min_team_wickets: int | None = None
    max_team_wickets: int | None = None
    min_opp_wickets: int | None = None
    max_opp_wickets: int | None = None
    min_defending_runs: int | None = None
    min_chasing_runs: int | None = None

    # ── Partnership & Event Filters (V4) ────────────────────
    partnership_number: int | None = None  # 1 = Opening, 2 = 2nd Wicket, etc.
    min_partnership_runs: int | None = None
    back_to_back_wickets: bool = False     # For team bowling stats
    vs_top_limit: int | None = None
    opposing_player_ids: list[str] = []


    # ── Thresholds (HAVING filters) ──────────────────────────
    min_innings: int = 1
    min_runs: int | None = None
    max_runs: int | None = None
    min_wickets: int | None = None
    max_wickets: int | None = None
    min_fours: int | None = None
    min_sixes: int | None = None
    min_balls: int | None = None
    max_balls: int | None = None
    min_average: float | None = None
    min_strike_rate: float | None = None
    min_no_balls: int | None = None
    min_wides: int | None = None
    include_unofficial: bool = False

    # ── Team Specific Filters ────────────────────────────────
    score_threshold: int | None = None     # e.g. 180, 200
    team_score_mode: str = "scored"        # scored | conceded | diff

    # ── Grouping & Display ───────────────────────────────────
    group_by: str = "player"  # player|team|venue|year|opposition|phase|match_stage|city|competition|innings|batting_position
    sort_by: str = "runs"
    sort_dir: str = "desc"
    limit: int = 100


class StatBuilderBattingRow(_RoundFloats):
    rank: int
    label: str
    sub_label: str | None = None
    player_id: str | None = None
    innings: int = 0
    runs: int = 0
    balls: int = 0
    average: float | None = None
    strike_rate: float | None = None
    dot_ball_pct: float | None = None
    boundary_pct: float | None = None
    fours: int = 0
    sixes: int = 0
    highest_score: int | None = None
    hundreds: int | None = None
    fifties: int | None = None
    top_scores: int | None = None
    won: int = 0
    lost: int = 0
    drawn: int = 0
    tied: int = 0
    no_result: int = 0
    win_percentage: float | None = None


class StatBuilderBowlingRow(_RoundFloats):
    rank: int
    label: str
    sub_label: str | None = None
    player_id: str | None = None
    matches: int = 0
    innings: int = 0
    overs: float | None = None
    wickets: int = 0
    runs_conceded: int = 0
    economy: float | None = None
    bowling_average: float | None = None
    bowling_strike_rate: float | None = None
    best_bowling: str | None = None
    five_wicket_hauls: int | None = None
    top_wickets: int | None = None
    no_balls: int = 0
    wides: int = 0
    fours_conceded: int = 0
    sixes_conceded: int = 0
    won: int = 0
    lost: int = 0
    drawn: int = 0
    tied: int = 0
    no_result: int = 0
    win_percentage: float | None = None


class StatBuilderTeamRow(_RoundFloats):
    rank: int
    label: str
    sub_label: str | None = None
    matches_played: int
    won: int
    lost: int
    tied: int
    drawn: int
    no_result: int
    win_percentage: float | None = None
    highest_score: int | None = None
    lowest_score: int | None = None
    total_runs_scored: int | None = None
    total_runs_conceded: int | None = None
    batting_average: float | None = None
    batting_strike_rate: float | None = None
    bowling_average: float | None = None
    bowling_strike_rate: float | None = None
    batting_run_rate: float | None = None
    bowling_run_rate: float | None = None
    balls_faced: int = 0
    balls_bowled: int = 0
    wickets_lost: int | None = None
    wickets_taken: int | None = None
    fours_hit: int = 0
    sixes_hit: int = 0
    fours_conceded: int = 0
    sixes_conceded: int = 0
    partnership_50s: int = 0
    partnership_100s: int = 0
    back_to_back_wickets: int = 0
    hs_wickets: int | None = None
    ls_wickets: int | None = None
    score_str: str | None = None
    opp_score_str: str | None = None


class StatBuilderTeamCompareRow(_RoundFloats):
    rank: int
    label: str
    sub_label: str | None = None
    matches_played: int
    won: int
    lost: int
    runs_for: int
    runs_against: int
    run_diff: int
    run_rate_for: float
    run_rate_against: float
    run_rate_diff: float
    wickets_lost: int
    wickets_taken: int
    win_percentage: float | None = None


class StatBuilderSummary(BaseModel):
    total_runs: int | None = None
    avg_average: float | None = None
    avg_strike_rate: float | None = None
    total_hundreds: int | None = None
    total_innings: int | None = None
    result_count: int = 0
    # Bowling-specific
    total_wickets: int | None = None
    avg_economy: float | None = None
    # Team-specific
    total_matches_played: int | None = None


class ResolvedOpponent(BaseModel):
    id: str
    name: str
    metric: int


class StatBuilderResponse(BaseModel):
    rows: list[StatBuilderBattingRow] | list[StatBuilderBowlingRow] | list[StatBuilderTeamRow] | list[StatBuilderTeamCompareRow]
    total_count: int
    query_time_ms: int
    summary: StatBuilderSummary
    resolved_opponents: list[ResolvedOpponent] = []


class H2HHighestScore(BaseModel):
    team: str
    opposition: str
    runs: int
    wickets: int | None
    overs: float | None
    date: date | str
    venue: str | None
    match_id: str


class H2HIndividualScore(BaseModel):
    player_name: str
    team: str
    runs: int
    balls: int
    date: date | str
    venue: str | None
    match_id: str


class H2HBestBowling(BaseModel):
    player_name: str
    team: str
    wickets: int
    runs: int
    overs: float | None
    date: date | str
    venue: str | None
    match_id: str


class H2HHistoricMatch(BaseModel):
    match_id: str
    date: date | str
    match_stage: str
    winner: str
    margin: str
    venue: str | None
    team1_score: str | None = None
    team2_score: str | None = None


class StatBuilderH2HResponse(BaseModel):
    team1: str
    team2: str
    team1_wins: int
    team2_wins: int
    ties: int
    no_results: int
    total_matches: int
    
    top_batters_team1: list[TopBatterH2H] = []
    top_batters_team2: list[TopBatterH2H] = []
    top_bowlers_team1: list[TopBowlerH2H] = []
    top_bowlers_team2: list[TopBowlerH2H] = []
    
    recent_matches: list[TeamRecentMatch] = []
    
    team1_highest_totals: list[H2HHighestScore] = []
    team2_highest_totals: list[H2HHighestScore] = []
    team1_lowest_totals: list[H2HHighestScore] = []
    team2_lowest_totals: list[H2HHighestScore] = []
    team1_highest_individual: list[H2HIndividualScore] = []
    team2_highest_individual: list[H2HIndividualScore] = []
    team1_best_bowling: list[H2HBestBowling] = []
    team2_best_bowling: list[H2HBestBowling] = []
    historic_matches: list[H2HHistoricMatch] = []
    
    seasons: list[TeamSeasonRecord] = []


class StatBuilderMetaRequest(BaseModel):
    """Current filter state sent to the meta endpoint for dynamic options."""
    formats: list[str] = []
    tournaments: list[str] = []
    countries: list[str] = []
    year_from: int | None = None
    year_to: int | None = None
    include_unofficial: bool = False


class StatBuilderMeta(BaseModel):
    competitions: list[str]
    teams: list[str]
    venues: list[str]
    cities: list[str] = []
    stages: list[str] = []
    countries: list[str] = []
    year_range: list[int]  # [min_year, max_year]


# ── Player vs Team detailed dashboard response ──────────────

class PVTFormatStats(BaseModel):
    format_bucket: str
    matches: int
    innings: int
    runs: int
    balls: int
    dismissals: Optional[int] = None
    highest_score: Optional[int] = None
    hundreds: Optional[int] = None
    fifties: Optional[int] = None
    ducks: Optional[int] = None
    not_outs: Optional[int] = None
    strike_rate: Optional[float] = None
    average: Optional[float] = None
    dot_ball_pct: Optional[float] = None
    boundary_pct: Optional[float] = None
    wickets: Optional[int] = None
    four_w: Optional[int] = None
    five_w: Optional[int] = None
    bbi: Optional[str] = None
    economy: Optional[float] = None

class PVTOverallStats(BaseModel):
    matches: int
    innings: int
    runs: int
    balls: int
    dismissals: Optional[int] = None
    highest_score: Optional[int] = None
    hundreds: Optional[int] = None
    fifties: Optional[int] = None
    ducks: Optional[int] = None
    not_outs: Optional[int] = None
    strike_rate: Optional[float] = None
    average: Optional[float] = None
    dot_ball_pct: Optional[float] = None
    boundary_pct: Optional[float] = None
    wickets: Optional[int] = None
    four_w: Optional[int] = None
    five_w: Optional[int] = None
    bbi: Optional[str] = None
    economy: Optional[float] = None

class PVTPhaseStats(BaseModel):
    phase: str
    balls: int
    runs: int
    dismissals: Optional[int] = None
    wickets: Optional[int] = None
    strike_rate: Optional[float] = None
    average: Optional[float] = None
    economy: Optional[float] = None

class PVTYearStats(BaseModel):
    year: int
    matches: int
    balls: int
    runs: int
    dismissals: Optional[int] = None
    wickets: Optional[int] = None

class PVTVenueSplit(BaseModel):
    venue_type: str
    label: str
    balls: int
    runs: int
    dismissals: Optional[int] = None
    wickets: Optional[int] = None
    strike_rate: Optional[float] = None
    average: Optional[float] = None
    economy: Optional[float] = None

class PlayerVenueSplitsResponse(BaseModel):
    batting: list[PVTVenueSplit]
    bowling: list[PVTVenueSplit]


class PVTDismissedBy(BaseModel):
    bowler_id: Optional[str] = None
    bowler_name: Optional[str] = None
    batter_id: Optional[str] = None
    batter_name: Optional[str] = None
    times_dismissed: int

class PVTRecentInning(BaseModel):
    match_id: str
    date: str
    venue: Optional[str] = None
    format_bucket: str
    batting_team: Optional[str] = None
    bowling_team: Optional[str] = None
    innings_number: Optional[int] = None
    runs: int
    balls: int
    fours: Optional[int] = None
    sixes: Optional[int] = None
    strike_rate: Optional[float] = None
    how_out: Optional[str] = None
    dismissed_by_name: Optional[str] = None
    not_out: Optional[bool] = None
    overs: Optional[str] = None
    maidens: Optional[int] = None
    wickets: Optional[int] = None
    economy: Optional[float] = None

class PlayerVsTeamDetailResponse(BaseModel):
    player_id: str
    player_name: Optional[str] = None
    team: str
    primary_role: str
    active_mode: str
    overall: PVTOverallStats
    by_format: list[PVTFormatStats]
    available_formats: list[str]
    phases: list[PVTPhaseStats]
    venue_split: list[PVTVenueSplit]
    dismissed_by: list[PVTDismissedBy]
    recent_innings: list[PVTRecentInning]
    by_year: list[PVTYearStats]

