/**
 * Cricket Stats API client.
 *
 * All fetch functions call the FastAPI backend and return typed responses.
 * Base URL comes from NEXT_PUBLIC_API_URL (defaults to localhost:8000).
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

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

// ── Fetch helper ────────────────────────────────────────────

async function get<T>(path: string): Promise<T | null> {
  const url = `${BASE_URL}${path}`;

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
      `/players/search${params({ q: query })}`
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
      `/players/${playerId}/batting${params({ format, year: year?.toString() })}`
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
      `/players/${playerId}/bowling${params({ format, year: year?.toString() })}`
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
      `/players/${playerId}/partnerships${params({ format })}`
    );
    return data ?? [];
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
};

export default api;
