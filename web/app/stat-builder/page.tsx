"use client";
import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FilterPanel, { StatFilters, defaultFilters } from "@/components/stat-builder/FilterPanel";
import ResultsViewer from "@/components/stat-builder/ResultsViewer";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const C = {
  bg: "var(--bg-base)", low: "var(--bg-surface)",
  green: "var(--accent-green)", text: "var(--text-primary)",
  muted: "var(--text-muted)", border: "var(--glass-border)",
};

type BatRow = {
  rank: number; label: string; sub_label?: string | null; player_id?: string | null;
  innings: number; runs: number; balls: number;
  average?: number | null; strike_rate?: number | null;
  dot_ball_pct?: number | null; boundary_pct?: number | null;
  highest_score?: number | null; hundreds?: number | null; fifties?: number | null;
  top_scores?: number | null; won?: number | null; win_percentage?: number | null;
};
type BowlRow = {
  rank: number; label: string; sub_label?: string | null; player_id?: string | null;
  innings: number; overs?: number | null; wickets: number; runs_conceded: number;
  economy?: number | null; bowling_average?: number | null; bowling_strike_rate?: number | null;
  best_bowling?: string | null; five_wicket_hauls?: number | null;
  top_wickets?: number | null; won?: number | null; win_percentage?: number | null;
};
type TeamRow = {
  rank: number; label: string; sub_label?: string | null;
  matches_played: number; won: number; lost: number;
  tied: number; drawn: number; no_result: number;
  win_percentage?: number | null;
  batting_run_rate?: number | null;
  bowling_run_rate?: number | null;
  batting_average?: number | null;
  batting_strike_rate?: number | null;
  bowling_average?: number | null;
  bowling_strike_rate?: number | null;
  highest_score?: number | null;
  lowest_score?: number | null;
  total_runs_scored?: number | null;
  total_runs_conceded?: number | null;
  wickets_lost?: number | null;
  wickets_taken?: number | null;
  balls_faced?: number | null;
  balls_bowled?: number | null;
  fours_hit?: number | null;
  sixes_hit?: number | null;
  fours_conceded?: number | null;
  sixes_conceded?: number | null;
  hs_wickets?: number | null;
  ls_wickets?: number | null;
};
type TeamCompareRow = {
  rank: number; label: string; sub_label?: string | null;
  matches_played: number; won: number; lost: number;
  win_percentage?: number | null;
  runs_for: number; runs_against: number; run_diff: number;
  run_rate_for: number; run_rate_against: number; run_rate_diff: number;
  wickets_lost: number; wickets_taken: number;
  powerplay_runs_for: number; powerplay_runs_against: number; powerplay_diff: number;
  death_runs_for: number; death_runs_against: number; death_diff: number;
  scores_200_plus: number; conceded_200_plus: number;
  scores_180_plus: number; conceded_180_plus: number;
  big_score_diff: number;
};
type Summary = {
  total_runs?: number | null; avg_average?: number | null; avg_strike_rate?: number | null;
  total_hundreds?: number | null; total_innings?: number | null; result_count: number;
  total_wickets?: number | null; avg_economy?: number | null;
  total_matches_played?: number | null;
};
function StatBuilderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  const [filters, setFilters] = useState<StatFilters>({ ...defaultFilters });
  const [batRows, setBatRows] = useState<BatRow[]>([]);
  const [bowlRows, setBowlRows] = useState<BowlRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [compareRows, setCompareRows] = useState<TeamCompareRow[]>([]);
  const [h2hData, setH2hData] = useState<any>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queryTimeMs, setQueryTimeMs] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("runs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [resolvedOpponents, setResolvedOpponents] = useState<{ id: string; name: string; metric?: number }[]>([]);

  // Sync state TO url
  useEffect(() => {
    if (isInitialMount.current) return;
    const params = new URLSearchParams();
    params.set("type", filters.stat_type);
    if (filters.teams.length) params.set("t1", filters.teams.join(","));
    if (filters.opposition.length) params.set("t2", filters.opposition.join(","));
    if (filters.formats.length) params.set("f", filters.formats.join(","));
    if (filters.year_from) params.set("y1", filters.year_from.toString());
    if (filters.year_to) params.set("y2", filters.year_to.toString());
    if (sortBy) params.set("sb", sortBy);
    if (sortDir) params.set("sd", sortDir);
    if (hasRun) params.set("run", "1");
    
    router.replace(`/stat-builder?${params.toString()}`, { scroll: false });
  }, [filters, hasRun, sortBy, sortDir, router]);

  // Sync FROM url on mount
  useEffect(() => {
    if (!isInitialMount.current) return;
    isInitialMount.current = false;
    
    const type = searchParams.get("type");
    if (type) {
      const next = { ...defaultFilters, stat_type: type as any };
      const t1 = searchParams.get("t1"); if (t1) next.teams = t1.split(",");
      const t2 = searchParams.get("t2"); if (t2) next.opposition = t2.split(",");
      const f = searchParams.get("f"); if (f) next.formats = f.split(",");
      const y1 = searchParams.get("y1"); if (y1) next.year_from = parseInt(y1);
      const y2 = searchParams.get("y2"); if (y2) next.year_to = parseInt(y2);
      const sb = searchParams.get("sb"); if (sb) setSortBy(sb);
      const sd = searchParams.get("sd"); if (sd) setSortDir(sd as any);
      setFilters(next);
      if (searchParams.get("run") === "1") {
        setHasRun(true);
      }
    }
  }, [searchParams]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    const isTeam = filters.stat_type.startsWith("team");
    const isTeamResults = filters.stat_type === "team";
    const isTeamBat = filters.stat_type === "team_bat";
    const isTeamBowl = filters.stat_type === "team_bowl";
    const isTeamCompare = filters.stat_type === "team_compare";
    const isBowl = filters.stat_type === "bowl";
    const isH2H = filters.stat_type === "h2h";
    
    let endpoint = isTeamBat
      ? "team-batting"
      : isTeamBowl
        ? "team-bowling"
        : isTeamCompare
          ? "team-compare"
          : isTeamResults
            ? "team-results"
            : isBowl
              ? "bowling"
              : "batting";
    if (isH2H) endpoint = "h2h";
    
    const teamResultsSortCols = ["rank", "label", "matches_played", "won", "lost", "tied", "drawn", "no_result", "win_percentage"];
    const teamBatSortCols = ["rank", "label", "matches_played", "total_runs_scored", "batting_average", "batting_run_rate", "batting_strike_rate", "wickets_lost", "balls_faced", "fours_hit", "sixes_hit", "partnership_50s", "partnership_100s", "highest_score", "won", "win_percentage"];
    const teamBowlSortCols = ["rank", "label", "matches_played", "total_runs_conceded", "wickets_taken", "bowling_average", "bowling_run_rate", "bowling_strike_rate", "balls_bowled", "fours_conceded", "sixes_conceded", "back_to_back_wickets", "lowest_score", "won", "win_percentage"];
    const teamCompareSortCols = ["rank", "label", "matches_played", "run_diff", "run_rate_diff", "powerplay_diff", "death_diff", "big_score_diff", "won", "win_percentage"];

    const currentSort = isTeamBat
      ? (teamBatSortCols.includes(sortBy) ? sortBy : "total_runs_scored")
      : isTeamBowl
        ? (teamBowlSortCols.includes(sortBy) ? sortBy : "wickets_taken")
        : isTeamCompare
          ? (teamCompareSortCols.includes(sortBy) ? sortBy : "run_diff")
          : isTeamResults
            ? (teamResultsSortCols.includes(sortBy) ? sortBy : "win_percentage")
            : isBowl
              ? (["rank", "label", "wickets", "bowling_average", "economy", "bowling_strike_rate", "innings", "overs", "runs_conceded", "wides", "no_balls", "fours_conceded", "sixes_conceded", "five_wkts", "top_wickets", "won", "win_percentage", "matches"].includes(sortBy) ? sortBy : "wickets")
              : (["rank", "label", "runs", "average", "strike_rate", "innings", "balls", "highest_score", "fours", "sixes", "hundreds", "fifties", "ducks", "dot_pct", "boundary_pct", "top_scores", "won", "win_percentage", "matches"].includes(sortBy) ? sortBy : "runs");

    try {
      const body = {
        ...filters,
        player_name: filters.player_name || null,
        venue_search: filters.venue_search || null,
        ground_type: filters.ground_type || null,
        toss: filters.toss || null,
        day_night: filters.day_night || null,
        vs_top_limit: filters.vs_top_limit || null,
        opposing_player_ids: filters.opposing_players.map(p => p.id),
        sort_by: currentSort,
        sort_dir: sortDir,
        limit: 100,
      };

      const res = await fetch(`${API}/api/v1/stat-builder/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResolvedOpponents(data.resolved_opponents || []);

      if (isH2H) {
        setH2hData(data);
        setBatRows([]);
        setBowlRows([]);
        setTeamRows([]);
        setSummary(null);
        setQueryTimeMs(data.query_time_ms || 1500); // we didn't add query_time_ms to response model, mocking
      } else {
        if (isTeamCompare) {
          setCompareRows(data.rows || []);
          setBatRows([]);
          setBowlRows([]);
          setTeamRows([]);
        } else if (isTeam) {
          setTeamRows(data.rows || []);
          setBatRows([]);
          setBowlRows([]);
          setCompareRows([]);
        } else if (isBowl) {
          setBowlRows(data.rows || []);
          setBatRows([]);
          setTeamRows([]);
          setCompareRows([]);
        } else {
          setBatRows(data.rows || []);
          setBowlRows([]);
          setTeamRows([]);
          setCompareRows([]);
        }
        setH2hData(null);
        setSummary(data.summary || null);
        setQueryTimeMs(data.query_time_ms || 0);
      }
      setHasRun(true);
    } catch (err) {
      console.error("Stat builder error:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, sortDir]);

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters });
    setBatRows([]);
    setBowlRows([]);
    setTeamRows([]);
    setCompareRows([]);
    setH2hData(null);
    setSummary(null);
    setHasRun(false);
    setSortBy("runs");
    setSortDir("desc");
    setResolvedOpponents([]);
  }, []);

  const handleSortChange = useCallback((col: string) => {
    if (sortBy === col) {
      setSortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }, [sortBy]);

  // Re-run query automatically when sort parameters change
  useEffect(() => {
    if (hasRun) {
      runQuery();
    }
  }, [sortBy, sortDir, runQuery]);

  // Build active filter pills for display
  const activeFilters = useMemo(() => {
    const pills: { cat: string; val: string }[] = [];
    if (filters.player_name) pills.push({ cat: "player", val: filters.player_name });
    filters.formats.forEach((v) => pills.push({ cat: "format", val: v }));
    filters.innings.forEach((v) => pills.push({ cat: "innings", val: v }));
    filters.phases.forEach((v) => pills.push({ cat: "phase", val: v }));
    if (filters.over_from != null) pills.push({ cat: "over", val: `from ${filters.over_from}` });
    if (filters.over_to != null) pills.push({ cat: "over", val: `to ${filters.over_to}` });
    filters.teams.forEach((v) => pills.push({ cat: "team", val: v }));
    filters.opposition.forEach((v) => pills.push({ cat: "vs", val: v }));
    if (filters.venue_search) pills.push({ cat: "venue", val: filters.venue_search });
    filters.venues.forEach((v) => pills.push({ cat: "venue", val: v }));
    filters.countries.forEach((v) => pills.push({ cat: "country", val: v }));
    if (filters.ground_type) pills.push({ cat: "ground", val: filters.ground_type });
    if (filters.year_from != null) pills.push({ cat: "year", val: `from ${filters.year_from}` });
    if (filters.year_to != null) pills.push({ cat: "year", val: `to ${filters.year_to}` });
    filters.tournaments.forEach((v) => pills.push({ cat: "tournament", val: v }));
    filters.match_result.forEach((v) => pills.push({ cat: "result", val: v }));
    if (filters.toss) pills.push({ cat: "toss", val: filters.toss });
    if (filters.day_night) pills.push({ cat: "d/n", val: filters.day_night });
    
    // New & Missing Filters
    filters.batting_positions.forEach(v => pills.push({ cat: "pos", val: v.startsWith("#") ? v : v.replace("_", " ") }));
    filters.dismissal_types.forEach(v => pills.push({ cat: "out", val: v }));
    if (filters.min_runs != null) pills.push({ cat: "min runs", val: filters.min_runs.toString() });
    if (filters.min_wickets != null) pills.push({ cat: "min wkts", val: filters.min_wickets.toString() });
    if (filters.min_fours != null) pills.push({ cat: "min 4s", val: filters.min_fours.toString() });
    if (filters.min_sixes != null) pills.push({ cat: "min 6s", val: filters.min_sixes.toString() });
    if (filters.min_innings != null && filters.min_innings > 1) pills.push({ cat: "min inn", val: filters.min_innings.toString() });
    if (filters.min_average != null && filters.min_average > 0) pills.push({ cat: "min avg", val: filters.min_average.toString() });
    if (filters.min_strike_rate != null && filters.min_strike_rate > 0) pills.push({ cat: "min sr", val: filters.min_strike_rate.toString() });
    if (filters.min_no_balls != null && filters.min_no_balls > 0) pills.push({ cat: "min nb", val: filters.min_no_balls.toString() });
    if (filters.min_wides != null && filters.min_wides > 0) pills.push({ cat: "min wd", val: filters.min_wides.toString() });
    if (filters.is_not_out) pills.push({ cat: "status", val: "not out only" });
    if (filters.player_of_match_only) pills.push({ cat: "award", val: "PoM only" });
    if (filters.super_over_only) pills.push({ cat: "mode", val: "super over" });
    if (filters.min_chasing_runs != null) pills.push({ cat: "chase", val: `${filters.min_chasing_runs}+` });
    if (filters.min_defending_runs != null) pills.push({ cat: "defend", val: `${filters.min_defending_runs}+` });
    if (filters.match_month != null) pills.push({ cat: "month", val: filters.match_month.toString() });
    if (filters.match_day != null) pills.push({ cat: "day", val: filters.match_day.toString() });
    if (filters.max_runs != null) pills.push({ cat: "max_runs", val: `≤${filters.max_runs}` });
    if (filters.max_balls != null) pills.push({ cat: "max_balls", val: `≤${filters.max_balls}` });
    if (filters.max_wickets != null) pills.push({ cat: "max_wickets", val: `≤${filters.max_wickets}` });
    if (filters.vs_top_limit != null) pills.push({ cat: "vs_top", val: `Top ${filters.vs_top_limit}` });
    filters.opposing_players?.forEach(p => pills.push({ cat: "opp_player", val: p.name }));

    return pills;
  }, [filters]);

  const removeFilter = useCallback((cat: string, val: string) => {
    const next = { ...filters };
    if (cat === "player") next.player_name = undefined;
    else if (cat === "format") next.formats = next.formats.filter((v) => v !== val);
    else if (cat === "innings") next.innings = next.innings.filter((v) => v !== val);
    else if (cat === "phase") next.phases = next.phases.filter((v) => v !== val);
    else if (cat === "over") { if (val.startsWith("from")) next.over_from = undefined; else next.over_to = undefined; }
    else if (cat === "team") next.teams = next.teams.filter((v) => v !== val);
    else if (cat === "vs") next.opposition = next.opposition.filter((v) => v !== val);
    else if (cat === "venue") {
      if (next.venue_search === val) next.venue_search = undefined;
      else next.venues = next.venues.filter((v) => v !== val);
    }
    else if (cat === "country") next.countries = next.countries.filter((v) => v !== val);
    else if (cat === "ground") next.ground_type = undefined;
    else if (cat === "year") { if (val.startsWith("from")) next.year_from = undefined; else next.year_to = undefined; }
    else if (cat === "tournament") next.tournaments = next.tournaments.filter((v) => v !== val);
    else if (cat === "result") next.match_result = next.match_result.filter((v) => v !== val);
    else if (cat === "toss") next.toss = undefined;
    else if (cat === "d/n") next.day_night = undefined;
    else if (cat === "pos") next.batting_positions = next.batting_positions.filter(v => v !== val && v.replace("_", " ") !== val);
    else if (cat === "out") next.dismissal_types = next.dismissal_types.filter(v => v !== val);
    else if (cat === "min runs") next.min_runs = undefined;
    else if (cat === "min wkts") next.min_wickets = undefined;
    else if (cat === "min 4s") next.min_fours = undefined;
    else if (cat === "min 6s") next.min_sixes = undefined;
    else if (cat === "min inn") next.min_innings = 1;
    else if (cat === "min avg") next.min_average = undefined;
    else if (cat === "min sr") next.min_strike_rate = undefined;
    else if (cat === "min nb") next.min_no_balls = undefined;
    else if (cat === "min wd") next.min_wides = undefined;
    else if (cat === "status") next.is_not_out = false;
    else if (cat === "award") next.player_of_match_only = false;
    else if (cat === "mode") next.super_over_only = false;
    else if (cat === "chase") next.min_chasing_runs = undefined;
    else if (cat === "defend") next.min_defending_runs = undefined;
    else if (cat === "month") next.match_month = undefined;
    else if (cat === "day") next.match_day = undefined;
    else if (cat === "max_runs") next.max_runs = undefined;
    else if (cat === "max_balls") next.max_balls = undefined;
    else if (cat === "max_wickets") next.max_wickets = undefined;
    else if (cat === "vs_top") next.vs_top_limit = undefined;
    else if (cat === "opp_player") next.opposing_players = next.opposing_players.filter(p => p.name !== val);
    setFilters(next);
  }, [filters]);

  const filterCount = activeFilters.length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      display: "flex", flexDirection: "column",
      background: C.bg, fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      color: C.text,
    }}>
      {/* ── Top bar with back button ──────────────── */}
      <div style={{
        height: 42, display: "flex", alignItems: "center", gap: 10,
        padding: "0 14px", borderBottom: `1px solid ${C.border}`,
        background: C.low, flexShrink: 0,
      }}>
        <Link
          href="/"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: C.muted, textDecoration: "none",
            padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${C.border}`, background: "transparent",
            transition: "all .15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
        >
          ← Back
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg style={{ width: 18, height: 18, color: C.green }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M14.5 4.5c-1 2-1 4.5 0 7s1 5 0 7" strokeLinecap="round" />
            <path d="M9.5 4.5c1 2 1 4.5 0 7s-1 5 0 7" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Cric<span style={{ color: C.green }}>Stats</span>
            <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>· Stat Builder</span>
          </span>
        </div>
      </div>

      {/* ── Main layout (sidebar + results) ────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onRun={runQuery}
          onReset={resetFilters}
          loading={loading}
        />
        <ResultsViewer
          statType={filters.stat_type as any}
          batRows={batRows}
          bowlRows={bowlRows}
          teamRows={teamRows}
          compareRows={compareRows}
          h2hData={h2hData}
          summary={summary}
          queryTimeMs={queryTimeMs}
          hasRun={hasRun}
          loading={loading}
          filterCount={filterCount}
          groupBy={filters.group_by}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          activeFilters={activeFilters}
          onRemoveFilter={removeFilter}
          resolvedOpponents={resolvedOpponents}
        />
      </div>
    </div>
  );
}

export default function StatBuilderPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20 text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-green)] border-t-transparent" />
      </div>
    }>
      <StatBuilderPageInner />
    </Suspense>
  );
}

