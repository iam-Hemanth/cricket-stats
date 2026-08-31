/**
 * Cricket Stats API client.
 *
 * All fetch functions call the FastAPI backend and return typed responses.
 * Base URL comes from NEXT_PUBLIC_API_URL (defaults to localhost:8000).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function buildApiUrl(path: string): string {
  if (path.startsWith("/api/v1/")) {
    return `${API_BASE}${path}`;
  }
  return `${API_BASE}/api/v1${path}`;
}

// ── Interfaces ──────────────────────────────────────────────

export interface PlayerSearchResult {
  player_id: string;
  name: string;
}

export interface BattingStats {
  player_id: string;
  player_name: string;
  format: string;
  year: number;
  competition_name: string | null;
  matches: number;
  innings: number;
  runs: number;
  balls_faced: number;
  average: number | null;
  strike_rate: number | null;
  fifties: number;
  hundreds: number;
  ducks: number;
  highest_score: number;
}

export interface BowlingStats {
  player_id: string;
  player_name: string;
  format: string;
  year: number;
  competition_name: string | null;
  innings_bowled: number;
  wickets: number;
  runs_conceded: number;
  economy: number | null;
  bowling_average: number | null;
  strike_rate: number | null;
  five_w: number;
  ten_w: number;
}


export interface PlayerMetadata {
  player_id: string;
  name: string;
  primary_team: string | null;
  min_year: number | null;
  max_year: number | null;
  total_matches: number;
  pom_count: number;
}

export interface PhaseStats {
  phase: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}

export interface YearStats {
  year: number;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}

export interface VenueSplit {
  venue_type: string;
  label: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}

export interface DismissalType {
  kind: string;
  count: number;
}

export interface FormatMatchup {
  format_bucket: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
  dot_ball_pct: number | null;
  boundary_pct: number | null;
  phases: PhaseStats[];
  by_year: YearStats[];
  venue_split: VenueSplit[];
  dismissal_types: DismissalType[];
}

export interface MatchupDelivery {
  date: string;
  over_number: number;
  ball_number: number;
  runs_batter: number;
  is_wicket: boolean;
  batting_team: string;
  bowling_team: string;
  venue: string | null;
}

export interface MatchupResponse {
  batter_id: string;
  batter_name: string | null;
  bowler_id: string;
  bowler_name: string | null;
  no_data: boolean;
  overall: {
    balls: number;
    runs: number;
    dismissals: number;
    strike_rate: number | null;
    average: number | null;
    dot_ball_pct: number | null;
    boundary_pct: number | null;
  };
  by_format: FormatMatchup[];
  recent_deliveries: MatchupDelivery[];
}

export interface PlayerVsTeam {
  player_id: string;
  player_name: string;
  opposition_team: string;
  role: string;
  matches: number;
  runs: number | null;
  average: number | null;
  strike_rate: number | null;
  wickets: number | null;
  economy: number | null;
}

export interface VenueStats {
  venue: string;
  format: string;
  matches_played: number;
  avg_first_innings_score: number | null;
  avg_second_innings_score: number | null;
  highest_team_total: number | null;
  lowest_team_total: number | null;
  chasing_win_pct: number | null;
}

export interface PartnershipStats {
  partner_id: string;
  partner_name: string;
  format_bucket: string;
  innings_together: number;
  total_runs: number;
  avg_partnership: number | null;
  best_partnership: number;
}

export interface TeamSearchResult {
  team: string;
}

export interface TeamHeadToHead {
  team_a: string;
  team_b: string;
  format_bucket: string;
  matches_played: number;
  team_a_wins: number;
  team_b_wins: number;
  no_results: number;
  avg_first_innings: number | null;
  avg_second_innings: number | null;
  highest_team_total: number | null;
  first_match: string | null;
  last_match: string | null;
}

export type TeamYearlyStats = {
  year: number;
  played: number;
  won: number;
};

export interface TeamSeasonRecord {
  year: number;
  format_bucket: string;
  matches_played: number;
  team_a_wins: number;
  team_b_wins: number;
}

export interface TeamRecentMatch {
  match_id: string;
  date: string;
  venue: string | null;
  format_bucket: string;
  batting_first: string;
  bowling_first: string;
  winner: string;
  win_by_runs: number | null;
  win_by_wickets: number | null;
  match_stage: string | null;
  city: string | null;
  match_country: string | null;
  first_innings_score: number | null;
}

export interface TeamH2HResponse {
  team1: string;
  team2: string;
  by_format: TeamHeadToHead[];
  seasons: TeamSeasonRecord[];
  recent_matches: TeamRecentMatch[];
  top_scorers_vs_team1: TopPerformer[];
  top_scorers_vs_team2: TopPerformer[];
  top_wickets_vs_team1: TopPerformer[];
  top_wickets_vs_team2: TopPerformer[];
}

export interface TopPerformer {
  player_id: string;
  player_name: string;
  total_runs?: number;
  total_wickets?: number;
  matches: number;
  innings?: number;
}

export type TopBatterH2H = {
  player_id: string;
  player_name: string;
  runs: number;
  innings: number;
  average: number | null;
  strike_rate: number | null;
  highest_score: number;
  fifties: number;
  hundreds: number;
};

export type TopBowlerH2H = {
  player_id: string;
  player_name: string;
  wickets: number;
  innings_bowled: number;
  economy: number | null;
  bowling_average: number | null;
  strike_rate: number | null;
  best_bowling: string;
};

export interface H2HHighestScore {
  team: string;
  opposition: string;
  runs: number;
  wickets: number | null;
  overs: number | null;
  date: string;
  venue: string | null;
  match_id: string;
}

export interface H2HIndividualScore {
  player_name: string;
  team: string;
  runs: number;
  balls: number;
  date: string;
  venue: string | null;
  match_id: string;
}

export interface H2HBestBowling {
  player_name: string;
  team: string;
  wickets: number;
  runs: number;
  overs: number | null;
  date: string;
  venue: string | null;
  match_id: string;
}

export interface H2HHistoricMatch {
  match_id: string;
  date: string;
  match_stage: string;
  winner: string;
  margin: string;
  venue: string | null;
  team1_score: string | null;
  team2_score: string | null;
}

export interface StatBuilderH2HResponse {
  team1: string;
  team2: string;
  team1_wins: number;
  team2_wins: number;
  ties: number;
  no_results: number;
  total_matches: number;
  
  top_batters_team1: TopBatterH2H[];
  top_batters_team2: TopBatterH2H[];
  top_bowlers_team1: TopBowlerH2H[];
  top_bowlers_team2: TopBowlerH2H[];
  
  recent_matches: TeamRecentMatch[];
  
  team1_highest_totals: H2HHighestScore[];
  team2_highest_totals: H2HHighestScore[];
  team1_lowest_totals: H2HHighestScore[];
  team2_lowest_totals: H2HHighestScore[];
  team1_highest_individual: H2HIndividualScore[];
  team2_highest_individual: H2HIndividualScore[];
  team1_best_bowling: H2HBestBowling[];
  team2_best_bowling: H2HBestBowling[];
  historic_matches: H2HHistoricMatch[];
  
  seasons: TeamSeasonRecord[];
}

export interface PhaseStatBatting {
  phase_name: string;
  format_bucket: string;
  balls: number;
  runs: number;
  dot_balls: number;
  boundaries: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
  dot_ball_pct: number | null;
  boundary_pct: number | null;
}

export interface PhaseStatBowling {
  phase_name: string;
  format_bucket: string;
  balls: number;
  runs_conceded: number;
  dot_balls: number;
  wickets: number;
  economy: number | null;
  dot_ball_pct: number | null;
}

export interface PlayerPhasesResponse {
  batting: PhaseStatBatting[];
  bowling: PhaseStatBowling[];
  batting_specialist_badge?: string | null;
  bowling_specialist_badge?: string | null;
}

export interface PlayerVenueSplit {
  venue_type: string;
  label: string;
  balls: number;
  runs: number;
  dismissals: number | null;
  wickets: number | null;
  strike_rate: number | null;
  average: number | null;
  economy: number | null;
}

export interface PlayerVenueSplitsResponse {
  batting: PlayerVenueSplit[];
  bowling: PlayerVenueSplit[];
}


export interface TestInningsSplitBatting {
  innings_number: number;
  innings_count: number;
  runs: number;
  balls_faced: number;
  dismissals: number;
  average: number | null;
  strike_rate: number | null;
  hundreds: number;
  fifties: number;
  highest_score: number;
}

export interface TestInningsSplitBowling {
  innings_number: number;
  innings_count: number;
  wickets: number;
  runs_conceded: number;
  balls: number;
  economy: number | null;
  bowling_average: number | null;
  strike_rate: number | null;
}

export interface TestSplitsResponse {
  batting: TestInningsSplitBatting[];
  bowling: TestInningsSplitBowling[];
}

export interface FormBattingEntry {
  match_id: string;
  date: string;
  format_bucket: string;
  opposition: string;
  venue: string | null;
  runs: number;
  balls_faced: number;
  was_dismissed: boolean;
  strike_rate: number | null;
  batting_team: string;
}

export interface FormBowlingEntry {
  match_id: string;
  date: string;
  format_bucket: string;
  opposition: string;
  bowling_team: string;
  venue: string | null;
  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
  economy: number | null;
}

export interface PlayerForm {
  batting: FormBattingEntry[];
  bowling: FormBowlingEntry[];
  last_updated: string | null;
}

export interface TeamDashboardKPI {
  matches_played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  win_percentage: number;
  avg_runs_per_over: number | null;
  avg_runs_conceded_per_over: number | null;
  highest_score: number | null;
  lowest_score: number | null;
  win_streak?: number;
}

export interface TeamBattingPhases {
  powerplay_avg?: number;
  powerplay_sr?: number;
  middle_avg?: number;
  middle_sr?: number;
  death_avg?: number;
  death_sr?: number;
}

export interface TeamBattingSplits {
  home_avg?: number;
  away_avg?: number;
  neutral_avg?: number;
}

export interface TeamDashboardResponse {
  team_name: string;
  format: string;
  available_formats?: string[];
  metadata: {
    ranking?: string;
    active_since?: number;
    trophies: string[];
    achievement?: string | null;
    best_year?: string | null;
  };
  kpi: TeamDashboardKPI;
  top_batters: TopBatterH2H[];
  top_bowlers: TopBowlerH2H[];
  recent_matches: TeamRecentMatch[];
  form_pills: {
    result: string;
    match_id: string;
    date: string;
  }[];
  batting_phases: TeamBattingPhases;
  batting_splits: TeamBattingSplits;
  bowling_splits: {
    bowling_avg?: number;
    bowling_economy?: number;
    innings1_avg?: number;
    innings2_avg?: number;
  };
  yearly_performance: TeamYearlyStats[];
  h2h_summary: {
    opposition: string;
    played: number;
    won: number;
    lost: number;
    draw_nr: number;
  }[];
  all_time_records: {
    most_runs_player: string;
    most_runs_value: number;
    most_wickets_player: string;
    most_wickets_value: number;
    highest_total: string;
    special_feat?: string;
  };
  venue_performance: VenueStats[];
  targets?: {
    lowest_target_defended?: number | null;
    highest_target_conceded?: number | null;
  };
}

export interface StatCard {
  stat_id: string;
  label: string;
  player_name: string;
  player_id: string | null;
  value: string;
  unit: string;
  format_label: string;
}

export interface OnFirePlayer {
  player_id: string;
  player_name: string;
  competition: string | null;
  recent_matches: number;
  recent_runs: number;
  balls_faced: number;
  dismissals: number;
  recent_sr: number | null;
  average?: number | null;
  fifties?: number;
  hundreds?: number;
  highest_score?: number | null;
}

export interface OnFireBowler {
  player_id: string;
  player_name: string;
  competition: string | null;
  recent_matches: number;
  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
  recent_economy: number | null;
  bowling_average?: number | null;
  five_w?: number;
  best_bowling?: string | null;
}

export interface RivalryOfDay {
  batter_id: string;
  batter_name: string;
  bowler_id: string;
  bowler_name: string;
  total_balls: number;
  total_runs: number;
  total_dismissals: number;
  strike_rate: number | null;
}

export interface HomepageHighlights {
  stat_cards: StatCard[];
  on_fire_ipl_batting: OnFirePlayer[];
  on_fire_ipl_bowling: OnFireBowler[];
  on_fire_big_leagues_batting: OnFirePlayer[];
  on_fire_big_leagues_bowling: OnFireBowler[];
  on_fire_t20i_batting?: OnFirePlayer[];
  on_fire_t20i_bowling?: OnFireBowler[];
  on_fire_odi_batting?: OnFirePlayer[];
  on_fire_odi_bowling?: OnFireBowler[];
  on_fire_test_batting?: OnFirePlayer[];
  on_fire_test_bowling?: OnFireBowler[];
  on_fire_international_batting: OnFirePlayer[];
  on_fire_international_bowling: OnFireBowler[];
  rivalry_ipl: RivalryOfDay | null;
  rivalry_international: RivalryOfDay | null;
  featured_rivalries: RivalryOfDay[];
  cached_at: string;
}

export type OnThisDayMatch = {
  match_id: string;
  date: string;
  team1: string;
  team2: string;
  winner: string | null;
  win_margin: string | null;
  venue: string | null;
  format: string;
  years_ago: number;
};

export interface StatBuilderMetaRequest {
  formats?: string[];
  tournaments?: string[];
  countries?: string[];
  year_from?: number;
  year_to?: number;
}

export interface StatBuilderMeta {
  competitions: string[];
  teams: string[];
  venues: string[];
  cities: string[];
  stages: string[];
  countries: string[];
  year_range: [number, number];
}

// ── Fetch helper ────────────────────────────────────────────

async function get<T>(path: string, init?: RequestInit): Promise<T | null> {
  const url = buildApiUrl(path);

  const res = await fetch(url, init);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const msg = `API error: ${res.status} ${res.statusText} — ${url}`;
    if (process.env.NODE_ENV === "development") {
      console.error(msg);
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

function params(obj: Record<string, string | undefined>): string {
  const entries = Object.entries(obj).filter(
    (kv): kv is [string, string] => kv[1] !== undefined
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

// ── API functions ───────────────────────────────────────────

const api = {
  /** Search players by name (case-insensitive partial match). */
  async searchPlayers(
    query: string,
    options?: { signal?: AbortSignal }
  ): Promise<PlayerSearchResult[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      return [];
    }

    const data = await get<PlayerSearchResult[]>(
      `/api/v1/players/search${params({ q: trimmedQuery })}`,
      { signal: options?.signal }
    );
    return data ?? [];
  },

  /** Get batting stats for a player, optionally filtered by format/year. */
  async getPlayerBatting(
    playerId: string,
    format?: string,
    year?: number
  ): Promise<BattingStats[]> {
    const data = await get<BattingStats[]>(
      `/api/v1/players/${playerId}/batting${params({ format, year: year?.toString() })}`
    );
    return data ?? [];
  },

  /** Get bowling stats for a player, optionally filtered by format/year. */
  async getPlayerBowling(
    playerId: string,
    format?: string,
    year?: number
  ): Promise<BowlingStats[]> {
    const data = await get<BowlingStats[]>(
      `/api/v1/players/${playerId}/bowling${params({ format, year: year?.toString() })}`
    );
    return data ?? [];
  },

  /** Get a player's record against each opposition team. */
  async getPlayerVsTeams(
    playerId: string,
    role: "batting" | "bowling" = "batting"
  ): Promise<PlayerVsTeam[]> {
    const data = await get<PlayerVsTeam[]>(
      `/players/${playerId}/vs-teams${params({ role })}`
    );
    return data ?? [];
  },

  /** Get a player's partnerships (top batting companions by format). */
  async getPlayerPartnerships(
    playerId: string,
    format?: string
  ): Promise<PartnershipStats[]> {
    const data = await get<PartnershipStats[]>(
      `/api/v1/players/${playerId}/partnerships${params({ format })}`
    );
    return data ?? [];
  },

  /** Get player phase specialist stats (powerplay/middle/death breakdown). */
  async getPlayerPhases(
    playerId: string,
    format?: string,
    role?: "batting" | "bowling"
  ): Promise<PlayerPhasesResponse> {
    const data = await get<PlayerPhasesResponse>(
      `/players/${playerId}/phases${params({ format, role })}`
    );
    return data ?? { batting: [], bowling: [] };
  },

  /** Get player venue splits (home/away/neutral breakdown). */
  async getPlayerVenueSplits(
    playerId: string,
    format?: string
  ): Promise<PlayerVenueSplitsResponse> {
    const data = await get<PlayerVenueSplitsResponse>(
      `/players/${playerId}/venue-splits${params({ format })}`
    );
    return data ?? { batting: [], bowling: [] };
  },


  /** Get 1st vs 2nd innings batting/bowling splits for Test cricket. */
  async getPlayerTestSplits(playerId: string): Promise<TestSplitsResponse> {
    const data = await get<TestSplitsResponse>(
      `/api/v1/players/${playerId}/test-splits`
    );
    return data ?? { batting: [], bowling: [] };
  },

  /** Get player form guide (last 10 batting and bowling innings). */
  async getPlayerForm(playerId: string, format?: string): Promise<PlayerForm> {
    const data = await get<PlayerForm>(`/players/${playerId}/form${params({ format })}`);
    return data ?? { batting: [], bowling: [], last_updated: null };
  },

  /** Get player summary metadata (primary team, years active, POM count). */
  async getPlayerMetadata(playerId: string): Promise<PlayerMetadata> {
    const data = await get<PlayerMetadata>(`/api/v1/players/${playerId}/metadata`);
    return data ?? {
      player_id: playerId,
      name: "Unknown",
      primary_team: null,
      min_year: null,
      max_year: null,
      total_matches: 0,
      pom_count: 0,
    };
  },

  /** Get head-to-head matchup between a batter and bowler. */
  async getMatchup(
    batterId: string,
    bowlerId: string
  ): Promise<MatchupResponse | null> {
    return get<MatchupResponse>(
      `/matchup${params({ batter_id: batterId, bowler_id: bowlerId })}`
    );
  },

  /** Search teams by name. */
  async searchTeams(
    query: string,
    options?: { signal?: AbortSignal }
  ): Promise<TeamSearchResult[]> {
    const data = await get<TeamSearchResult[]>(
      `/api/v1/teams/search${params({ q: query })}`,
      { signal: options?.signal }
    );
    return data ?? [];
  },

  /** Search venues by name. */
  async searchVenues(query: string): Promise<string[]> {
    const data = await get<string[]>(
      `/api/v1/venues/search${params({ q: query })}`
    );
    return data ?? [];
  },

  /** Get team-vs-team head-to-head summary, seasons, and recent matches. */
  async getTeamH2H(
    team1: string,
    team2: string,
    format?: string
  ): Promise<TeamH2HResponse> {
    const data = await get<TeamH2HResponse>(
      `/api/v1/teams/h2h${params({ team1, team2, format })}`
    );
    if (!data) {
      throw new Error("No team head-to-head data found");
    }
    return data;
  },

  /** List all venues, optionally filtered by format. */
  async getVenues(format?: string): Promise<VenueStats[]> {
    const data = await get<VenueStats[]>(`/venues${params({ format })}`);
    return data ?? [];
  },

  /** Get stats for a specific venue across all formats. */
  async getVenueStats(venueName: string): Promise<VenueStats[]> {
    const data = await get<VenueStats[]>(
      `/venues/${encodeURIComponent(venueName)}`
    );
    return data ?? [];
  },

  /** Get homepage highlights (stat cards, on-fire players, rivalry). */
  async getHighlights(): Promise<HomepageHighlights> {
    const data = await get<HomepageHighlights>(`/highlights`);
    return data ?? {
      stat_cards: [],
      on_fire_ipl_batting: [],
      on_fire_ipl_bowling: [],
      on_fire_big_leagues_batting: [],
      on_fire_big_leagues_bowling: [],
      on_fire_international_batting: [],
      on_fire_international_bowling: [],
      rivalry_ipl: null,
      rivalry_international: null,
      featured_rivalries: [],
      cached_at: "",
    };
  },

  /** Get all cricket matches that happened on this day in history. */
  async getOnThisDay(): Promise<OnThisDayMatch[]> {
    const data = await get<OnThisDayMatch[]>('/on-this-day');
    return data ?? [];
  },

  /** Get top batters in head-to-head between two teams. */
  async getTeamH2HTopBatters(team1: string, team2: string, format?: string): Promise<TopBatterH2H[]> {
    const p = new URLSearchParams({ team1, team2 });
    if (format) p.append('format', format);
    const data = await get<TopBatterH2H[]>(`/api/v1/teams/h2h/top-batters?${p}`);
    return data ?? [];
  },

  /** Get top bowlers in head-to-head between two teams. */
  async getTeamH2HTopBowlers(team1: string, team2: string, format?: string): Promise<TopBowlerH2H[]> {
    const p = new URLSearchParams({ team1, team2 });
    if (format) p.append('format', format);
    const data = await get<TopBowlerH2H[]>(`/api/v1/teams/h2h/top-bowlers?${p}`);
    return data ?? [];
  },

  /** Search / browse matches with optional filters. */
  async getMatches(filters: {
    team?: string;
    team1?: string;
    team2?: string;
    format?: string;
    competition?: string;
    year?: number;
    player?: string;
    page?: number;
  }): Promise<MatchListResponse> {
    const p = new URLSearchParams();
    if (filters.team) p.append('team', filters.team);
    if (filters.team1) p.append('team1', filters.team1);
    if (filters.team2) p.append('team2', filters.team2);
    if (filters.format) p.append('format', filters.format);
    if (filters.competition) p.append('competition', filters.competition);
    if (filters.year) p.append('year', String(filters.year));
    if (filters.player) p.append('player', filters.player);
    if (filters.page) p.append('page', String(filters.page));
    const data = await get<MatchListResponse>(`/api/v1/matches?${p}`);
    return data ?? { matches: [], total: 0, page: 0 };
  },

  /** Autocomplete competition/series names. */
  async searchCompetitions(q: string): Promise<string[]> {
    const data = await get<{ competitions: string[] }>(`/api/v1/competitions/search?q=${encodeURIComponent(q)}`);
    return data?.competitions ?? [];
  },

  /** Get dynamic filter options for Stat Builder */
  async getStatBuilderMeta(req: StatBuilderMetaRequest = {}): Promise<StatBuilderMeta> {
    const url = buildApiUrl("/api/v1/stat-builder/meta");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<StatBuilderMeta>;
  },

  /** Get a comprehensive snapshot of a team's performance. */
  async getTeamDashboard(teamName: string, format?: string): Promise<TeamDashboardResponse> {
    const data = await get<TeamDashboardResponse>(
      `/api/v1/team/${encodeURIComponent(teamName)}/dashboard${params({ format })}`
    );
    if (!data) {
      throw new Error("Team not found or no data available");
    }
    return data;
  },

  /** Get the homepage tournament spotlight and recent champion card data. */
  async getTournamentSpotlight(): Promise<TournamentSpotlightResponse> {
    const data = await get<TournamentSpotlightResponse>("/api/v1/homepage/tournament-spotlight");
    return data ?? { spotlight: null, champion: null };
  },

  /** Get detailed player vs team stats. */
  async getPlayerVsTeam(
    playerId: string,
    team: string,
    mode: "auto" | "batting" | "bowling" = "auto",
    format?: string
  ): Promise<PlayerVsTeamData | null> {
    const p = new URLSearchParams({ player_id: playerId, team, mode });
    if (format) p.append("format", format);
    return get<PlayerVsTeamData>(`/api/v1/player-vs-team?${p}`);
  },
};

export interface TournamentStandingsRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  no_result: number;
  nrr: number;
  points: number;
  form: string[];
}

export interface TournamentSpotlight {
  tournament_id: number;
  tournament_name: string;
  season: string;
  is_live: boolean;
  standings: TournamentStandingsRow[];
}

export interface ChampionCard {
  winner: string;
  tournament: string;
  season: string;
  record: string;
  final_margin: string;
  player_of_final: string;
  best_bowling: string;
  tagline: string;
}

export interface TournamentSpotlightResponse {
  spotlight: TournamentSpotlight | null;
  champion: ChampionCard | null;
}

export interface MatchListItem {
  match_id: string;
  date: string;
  team1: string;
  team2: string;
  winner: string | null;
  venue: string | null;
  format: string;
  competition: string | null;
  win_margin: string | null;
  match_stage?: string | null;
  host_country?: string | null;
}

export interface MatchListResponse {
  matches: MatchListItem[];
  total: number;
  page: number;
}

export interface PVTPhaseStats {
  phase: string;
  balls: number;
  runs: number;
  dismissals?: number;
  wickets?: number;
  strike_rate: number | null;
  average: number | null;
  economy?: number | null;
}

export interface PVTYearStats {
  year: number;
  matches: number;
  balls: number;
  runs: number;
  dismissals?: number;
  wickets?: number;
}

export interface PVTVenueSplit {
  venue_type: string;
  label: string;
  balls: number;
  runs: number;
  dismissals?: number;
  wickets?: number;
  strike_rate: number | null;
  average: number | null;
  economy?: number | null;
}

export interface PVTDismissedBy {
  bowler_id?: string;
  bowler_name?: string;
  batter_id?: string;
  batter_name?: string;
  times_dismissed: number;
}

export interface PVTRecentInning {
  match_id: string;
  date: string;
  venue: string | null;
  format_bucket: string;
  batting_team?: string;
  bowling_team?: string;
  innings_number?: number;
  runs: number;
  balls: number;
  fours?: number;
  sixes?: number;
  strike_rate?: number | null;
  how_out?: string | null;
  dismissed_by_name?: string | null;
  not_out?: boolean;
  overs?: string;
  maidens?: number;
  wickets?: number;
  economy?: number | null;
}

export interface PVTFormatStats {
  format_bucket: string;
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  dismissals?: number;
  highest_score?: number;
  hundreds?: number;
  fifties?: number;
  ducks?: number;
  not_outs?: number;
  strike_rate: number | null;
  average: number | null;
  dot_ball_pct: number | null;
  boundary_pct: number | null;
  wickets?: number;
  four_w?: number;
  five_w?: number;
  bbi?: string;
  economy?: number | null;
}

export interface PlayerVsTeamData {
  player_id: string;
  player_name: string | null;
  team: string;
  primary_role: string;
  active_mode: "batting" | "bowling";
  overall: Omit<PVTFormatStats, "format_bucket">;
  by_format: PVTFormatStats[];
  available_formats: string[];
  phases: PVTPhaseStats[];
  venue_split: PVTVenueSplit[];
  dismissed_by: PVTDismissedBy[];
  recent_innings: PVTRecentInning[];
  by_year: PVTYearStats[];
}

export default api;
