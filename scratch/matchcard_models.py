
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

class MatchCardResponse(BaseModel):
    match_id: str
    date: str
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
