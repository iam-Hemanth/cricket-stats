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

export interface RecentDelivery {
  date: string;
  over_number: number;
  ball_number: number;
  runs_batter: number;
  is_wicket: boolean;
  batting_team: string;
  bowling_team: string;
}

export interface MatchupStats {
  batter_id: string;
  batter_name: string;
  bowler_id: string;
  bowler_name: string;
  balls: number;
  runs: number;
  dismissals: number;
  average: number | null;
  strike_rate: number | null;
  dot_ball_pct: number | null;
  boundary_pct: number | null;
  recent_deliveries: RecentDelivery[];
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

  /** Get head-to-head matchup between a batter and bowler. */
  async getMatchup(
    batterId: string,
    bowlerId: string
  ): Promise<MatchupStats | null> {
    return get<MatchupStats>(
      `/api/v1/matchup${params({ batter_id: batterId, bowler_id: bowlerId })}`
    );
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
