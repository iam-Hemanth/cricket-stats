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
  batter_name: string;
  bowler_id: string;
  bowler_name: string;
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
  first_innings_score: number | null;
}

export interface TeamH2HResponse {
  team1: string;
  team2: string;
  by_format: TeamHeadToHead[];
  seasons: TeamSeasonRecord[];
  recent_matches: TeamRecentMatch[];
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
}

export interface FormBowlingEntry {
  match_id: string;
  date: string;
  format_bucket: string;
  opposition: string;
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
  on_fire_international_batting: OnFirePlayer[];
  on_fire_international_bowling: OnFireBowler[];
  rivalry_ipl: RivalryOfDay | null;
  rivalry_international: RivalryOfDay | null;
  cached_at: string;
}

// ── Fetch helper ────────────────────────────────────────────

async function get<T>(path: string): Promise<T | null> {
  const url = buildApiUrl(path);

  const res = await fetch(url);

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
  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const data = await get<PlayerSearchResult[]>(
      `/api/v1/players/search${params({ q: query })}`
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

  /** Get player form guide (last 10 batting and bowling innings). */
  async getPlayerForm(playerId: string): Promise<PlayerForm> {
    const data = await get<PlayerForm>(`/players/${playerId}/form`);
    return data ?? { batting: [], bowling: [], last_updated: null };
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
  async searchTeams(query: string): Promise<TeamSearchResult[]> {
    const data = await get<TeamSearchResult[]>(
      `/api/v1/teams/search${params({ q: query })}`
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
      cached_at: "",
    };
  },
};

export default api;
