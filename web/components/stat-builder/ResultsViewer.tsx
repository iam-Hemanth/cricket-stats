"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import GraphViewer from "./GraphViewer";

/* ── Design tokens ──────────────────────────────────────────── */
const C = {
  bg: "var(--bg-base)", low: "var(--bg-surface)", mid: "var(--bg-card)",
  high: "var(--bg-card-hover)", highest: "#31353c",
  green: "var(--accent-green)", gold: "var(--accent-gold)",
  red: "var(--accent-red)", blue: "var(--accent-blue)",
  text: "var(--text-primary)", muted: "var(--text-muted)", border: "var(--glass-border)",
};

const f = (v: number | null | undefined, d = 2) => v != null ? v.toFixed(d) : "—";
const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

/* ── Types ──────────────────────────────────────────────────── */
type BatRow = {
  rank: number; label: string; sub_label?: string | null; player_id?: string | null;
  innings: number; runs: number; balls: number;
  average?: number | null; strike_rate?: number | null;
  dot_ball_pct?: number | null; boundary_pct?: number | null;
  highest_score?: number | null; hundreds?: number | null; fifties?: number | null;
  fours?: number | null; sixes?: number | null;
  top_scores?: number | null; won?: number | null; win_percentage?: number | null;
  ducks?: number | null;
  instances?: any[] | null;
};

type BowlRow = {
  rank: number; label: string; sub_label?: string | null; player_id?: string | null;
  innings: number; overs?: number | null; wickets: number; runs_conceded: number;
  economy?: number | null; bowling_average?: number | null; bowling_strike_rate?: number | null;
  best_bowling?: string | null; five_wicket_hauls?: number | null;
  no_balls?: number; wides?: number;
  fours_conceded?: number | null; sixes_conceded?: number | null;
  top_wickets?: number | null; won?: number | null; win_percentage?: number | null;
  instances?: any[] | null;
};

type TeamRow = {
  rank: number; label: string; sub_label?: string | null;
  matches_played: number; won: number; lost: number;
  tied: number; drawn: number; no_result: number;
  win_percentage?: number | null;
  highest_score?: number | null;
  lowest_score?: number | null;
  total_runs_scored?: number | null;
  total_runs_conceded?: number | null;
  batting_average?: number | null;
  batting_strike_rate?: number | null;
  bowling_average?: number | null;
  bowling_strike_rate?: number | null;
  balls_faced?: number | null;
  balls_bowled?: number | null;
  wickets_lost?: number | null;
  wickets_taken?: number | null;
  batting_run_rate?: number | null;
  bowling_run_rate?: number | null;
  fours_hit?: number | null; sixes_hit?: number | null;
  fours_conceded?: number | null; sixes_conceded?: number | null;
  partnership_50s?: number | null;
  partnership_100s?: number | null;
  back_to_back_wickets?: number | null;
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
};

type Summary = {
  total_runs?: number | null; avg_average?: number | null; avg_strike_rate?: number | null;
  total_hundreds?: number | null; total_innings?: number | null; result_count: number;
  total_wickets?: number | null; avg_economy?: number | null;
  total_matches_played?: number | null;
};

type Props = {
  statType: "bat" | "bowl" | "team" | "team_bat" | "team_bowl" | "team_compare" | "h2h";
  batRows: BatRow[];
  bowlRows: BowlRow[];
  teamRows: TeamRow[];
  compareRows?: TeamCompareRow[];
  h2hData: any; // Using any for now to avoid massive type imports, we will pass it to H2HDashboardViewer
  summary: Summary | null;
  queryTimeMs: number;
  hasRun: boolean;
  loading: boolean;
  filterCount: number;
  groupBy: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (col: string) => void;
  activeFilters: { cat: string; val: string }[];
  onRemoveFilter: (cat: string, val: string) => void;
  resolvedOpponents?: { id: string; name: string; metric?: number }[];
};

const BATTING_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Player" },
  { id: "runs", label: "Runs" },
  { id: "average", label: "Avg" },
  { id: "strike_rate", label: "SR" },
  { id: "innings", label: "Inn" },
  { id: "balls", label: "Balls" },
  { id: "highest_score", label: "HS" },
  { id: "fours", label: "4s" },
  { id: "sixes", label: "6s" },
  { id: "fifties", label: "50s" },
  { id: "hundreds", label: "100s" },
  { id: "ducks", label: "0s" },
  { id: "top_scores", label: "Top" },
  { id: "won", label: "Won" },
  { id: "win_percentage", label: "Win%" },
];

const BOWLING_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Player" },
  { id: "wickets", label: "Wkts" },
  { id: "bowling_average", label: "Avg" },
  { id: "economy", label: "Econ" },
  { id: "bowling_strike_rate", label: "SR" },
  { id: "innings", label: "Inn" },
  { id: "overs", label: "Overs" },
  { id: "runs_conceded", label: "Runs" },
  { id: "best_bowling", label: "Best" },
  { id: "five_wkts", label: "5w" },
  { id: "fours_conceded", label: "4s" },
  { id: "sixes_conceded", label: "6s" },
  { id: "wides", label: "Wides" },
  { id: "no_balls", label: "NB" },
  { id: "top_wickets", label: "Top" },
  { id: "won", label: "Won" },
  { id: "win_percentage", label: "Win%" },
];

const TEAM_RESULTS_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Team" },
  { id: "matches_played", label: "Mat" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "win_percentage", label: "Win %" },
  { id: "batting_run_rate", label: "Bat RR" },
  { id: "bowling_run_rate", label: "Bowl RR" },
  { id: "tied", label: "Tied" },
  { id: "drawn", label: "Draw" },
  { id: "no_result", label: "NR" },
];

const TEAM_BATTING_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Team" },
  { id: "matches_played", label: "Mat" },
  { id: "total_runs_scored", label: "Runs" },
  { id: "batting_run_rate", label: "RR" },
  { id: "batting_strike_rate", label: "SR" },
  { id: "batting_average", label: "Avg" },
  { id: "wickets_lost", label: "Wkts L" },
  { id: "balls_faced", label: "Balls" },
  { id: "highest_score", label: "HS" },
  { id: "fours_hit", label: "4s" },
  { id: "sixes_hit", label: "6s" },
];

const TEAM_BOWLING_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Team" },
  { id: "matches_played", label: "Mat" },
  { id: "total_runs_conceded", label: "RC" },
  { id: "bowling_run_rate", label: "Econ" },
  { id: "wickets_taken", label: "Wkts" },
  { id: "bowling_average", label: "Avg" },
  { id: "bowling_strike_rate", label: "SR" },
  { id: "balls_bowled", label: "Balls" },
  { id: "lowest_score", label: "LS" },
  { id: "fours_conceded", label: "4sC" },
  { id: "sixes_conceded", label: "6sC" },
];

const TEAM_COMPARE_COLS = [
  { id: "rank", label: "#" },
  { id: "label", label: "Team" },
  { id: "matches_played", label: "Mat" },
  { id: "run_diff", label: "Run Diff" },
  { id: "run_rate_diff", label: "RR Diff" },
  { id: "runs_for", label: "Runs For" },
  { id: "runs_against", label: "Runs Ag" },
  { id: "run_rate_for", label: "RR For" },
  { id: "run_rate_against", label: "RR Ag" },
  { id: "wickets_lost", label: "Wkts L" },
  { id: "wickets_taken", label: "Wkts T" },
  { id: "won", label: "Won" },
  { id: "win_percentage", label: "Win %" },
];

/* ── Avatar colors ──────────────────────────────────────────── */
const AVATAR_COLORS = [
  { bg: "#1a3a2a", fg: C.green }, { bg: "#1a2e3a", fg: C.blue },
  { bg: "#2e2a10", fg: C.gold }, { bg: "#2e1a10", fg: C.red },
  { bg: "#1a1a2e", fg: "#d17bee" }, { bg: "#2e1a3a", fg: "#a855f7" },
];

function avatarColor(idx: number) { return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }

function pruneColumns(cols: { id: string; label: string }[], rows: any[]) {
  if (!rows || rows.length === 0) return cols;
  
  // Columns to check for pruning (only prune if ALL values are 0, null, or undefined)
  const pruneCandidates = [
    "partnership_50s", "partnership_100s", "back_to_back_wickets", 
    "fours", "sixes", "hundreds", "fifties", "ducks",
    "fours_hit", "sixes_hit", "fours_conceded", "sixes_conceded"
  ];

  return cols.filter(col => {
    if (!pruneCandidates.includes(col.id)) return true;
    const hasData = rows.some(r => r[col.id] != null && r[col.id] !== 0);
    return hasData;
  });
}

/* ── Summary Bar ─────────────────────────────────────────────── */
function SummaryBar({ summary, statType }: { summary: Summary; statType: string }) {
  let items: { v: number | string; l: string; cls: string }[] = [];
  
  if (statType === "team") {
    items = [
      { v: (summary.total_matches_played ?? 0).toLocaleString(), l: "Matches Played", cls: "hi" },
      { v: summary.result_count, l: "Results", cls: "" },
    ];
  } else if (statType === "team_bat") {
    items = [
      { v: (summary.total_runs ?? 0).toLocaleString(), l: "Total Runs", cls: "hi" },
      { v: summary.avg_average != null ? f(summary.avg_average, 2) : "—", l: "Avg Run Rate", cls: "hi" },
      { v: (summary.total_matches_played ?? 0).toLocaleString(), l: "Mat", cls: "" },
      { v: summary.result_count, l: "Results", cls: "" },
    ];
  } else if (statType === "team_bowl") {
    items = [
      { v: (summary.total_wickets ?? 0).toLocaleString(), l: "Total Wkts", cls: "hi" },
      { v: summary.avg_economy != null ? f(summary.avg_economy, 2) : "—", l: "Avg Econ", cls: "bl" },
      { v: (summary.total_matches_played ?? 0).toLocaleString(), l: "Mat", cls: "" },
      { v: summary.result_count, l: "Results", cls: "" },
    ];
  } else if (statType === "bowl") {
    items = [
      { v: summary.total_wickets ?? 0, l: "Total Wickets", cls: "hi" },
      { v: summary.avg_economy != null ? f(summary.avg_economy) : "—", l: "Avg Economy", cls: "bl" },
      { v: summary.total_innings ?? 0, l: "Total Inn", cls: "" },
      { v: summary.result_count, l: "Results", cls: "" },
    ];
  } else {
    items = [
      { v: (summary.total_runs ?? 0).toLocaleString(), l: "Total Runs", cls: "hi" },
      { v: summary.avg_average != null ? f(summary.avg_average) : "—", l: "Avg Average", cls: "hi" },
      { v: summary.avg_strike_rate != null ? f(summary.avg_strike_rate, 1) : "—", l: "Avg SR", cls: "bl" },
      { v: summary.total_innings ?? 0, l: "Total Inn", cls: "" },
      { v: summary.result_count, l: "Results", cls: "" },
    ];
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      borderBottom: `1px solid ${C.border}`, background: C.mid, flexShrink: 0,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ textAlign: "center", padding: "8px 4px", borderRight: i < items.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <div style={{
            fontSize: 14, fontWeight: 800, lineHeight: 1,
            color: it.cls === "hi" ? C.green : it.cls === "bl" ? C.blue : it.cls === "go" ? C.gold : C.text,
          }}>{it.v}</div>
          <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".04em", marginTop: 3 }}>{it.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
import H2HDashboardViewer from "./H2HDashboardViewer";

export default function ResultsViewer({
  statType, batRows, bowlRows, teamRows, compareRows, h2hData, summary, queryTimeMs, hasRun, loading,
  filterCount, groupBy, sortBy, sortDir, onSortChange, activeFilters, onRemoveFilter, resolvedOpponents = [],
}: Props) {
  const [view, setView] = useState<"table" | "graph">("table");
  const [showColPicker, setShowColPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setVisibleCols({});
  }, [statType]);

  const isBowl = statType === "bowl";
  const isTeam = statType.startsWith("team");
  const isH2H = statType === "h2h";

  const allCols = statType === "team_bat" ? TEAM_BATTING_COLS : 
                 statType === "team_bowl" ? TEAM_BOWLING_COLS : 
                 statType === "team_compare" ? TEAM_COMPARE_COLS :
                 statType === "team" ? TEAM_RESULTS_COLS : 
                 isBowl ? BOWLING_COLS : BATTING_COLS;

  useEffect(() => {
    if (view !== "table") setShowColPicker(false);
  }, [view]);
  
  // Initialize visible columns if empty
  const getVisible = (id: string) => visibleCols[id] !== false;
  const toggleCol = (id: string) => setVisibleCols(prev => ({ ...prev, [id]: prev[id] === false }));

  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
      {/* ── Header ──────────────────────────────────── */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {hasRun ? (isH2H ? "Head-to-Head Dashboard" : statType === "team_bat" ? "Team Batting Stats" : statType === "team_bowl" ? "Team Bowling Stats" : statType === "team_compare" ? "Team Bat vs Bowl Compare" : isTeam ? "Team Results & Standings" : isBowl ? "Bowling Stats" : "Batting Stats") : "Custom Stat Query"}
            </div>
            <div style={{ fontSize: 9, color: C.muted }}>
              {hasRun
                ? `${filterCount} filter${filterCount !== 1 ? "s" : ""} applied · ${isH2H ? "H2H" : statType === "team_bat" ? "Team Batting" : statType === "team_bowl" ? "Team Bowling" : statType === "team_compare" ? "Team Comparison" : isTeam ? "Team Results" : isBowl ? "Bowling" : "Batting"} · Grouped by ${groupBy} · ${queryTimeMs}ms`
                : "Apply filters on the left, then hit ▶ Run Query"}
            </div>
          </div>
        </div>
        {/* Active filter pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", minHeight: 26 }}>
          {activeFilters.length === 0 ? (
            <span style={{ fontSize: 10, color: C.muted }}>No filters applied yet</span>
          ) : (
            activeFilters.map((af, i) => (
              <div key={`${af.cat}-${af.val}-${i}`} style={{
                display: "flex", alignItems: "center", gap: 3,
                background: C.mid, border: `1px solid ${C.border}`, borderRadius: 20,
                padding: "2px 9px", fontSize: 10,
              }}>
                <span style={{ color: C.muted, fontSize: 9, marginRight: 1 }}>{af.cat}</span>
                {af.val}
                <span
                  onClick={() => onRemoveFilter(af.cat, af.val)}
                  style={{ color: C.muted, cursor: "pointer", fontSize: 12, lineHeight: 1, marginLeft: 2 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                >×</span>
              </div>
            ))
          )}
        </div>
        {/* Resolved Opponents List */}
        {resolvedOpponents && resolvedOpponents.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center", fontSize: 10, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
            <span style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
              {statType === "bat" ? "Opposing Bowlers:" : "Opposing Batters:"}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {resolvedOpponents.map((opp) => (
                <span key={opp.id} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255, 255, 255, 0.04)", borderRadius: 4, padding: "2px 6px", fontSize: 9, border: `1px solid ${C.border}` }}>
                  <span style={{ fontWeight: 700 }}>{opp.name}</span>
                  {opp.metric != null && opp.metric > 0 && (
                    <span style={{ color: statType === "bat" ? C.red : C.green, fontSize: 8, background: "rgba(0, 0, 0, 0.2)", padding: "0px 3px", borderRadius: 3 }}>
                      {opp.metric} {statType === "bat" ? "wkts" : "runs"}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── View toggle + sort ─────────────────────── */}
      {hasRun && !isH2H && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div style={{
            display: "flex", background: C.high, borderRadius: 20,
            padding: 2, gap: 2, border: `1px solid ${C.border}`,
          }}>
            {(["table", "graph"] as const).map((v) => (
              <div
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "4px 12px", borderRadius: 18, fontSize: 10, fontWeight: view === v ? 700 : 500,
                  color: view === v ? C.green : C.muted, cursor: "pointer",
                  background: view === v ? C.bg : "transparent", transition: "all .12s",
                }}
              >{v === "table" ? "Table" : "Graph"}</div>
            ))}
          </div>
          
          <div style={{ position: "relative", marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 9, color: C.muted }}>
              {(statType === "team_compare" ? compareRows?.length : isTeam ? teamRows.length : isBowl ? bowlRows.length : batRows.length)?.toLocaleString() || 0} result{(statType === "team_compare" ? compareRows?.length : isTeam ? teamRows.length : isBowl ? bowlRows.length : batRows.length) !== 1 ? "s" : ""}
            </span>
            
            {view === "table" && (
              <>
                <div 
                  onClick={() => setShowColPicker(!showColPicker)}
                  style={{
                    padding: "4px 8px", borderRadius: 6, background: showColPicker ? C.high : "transparent",
                    border: `1px solid ${showColPicker ? C.green : C.border}`, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5, color: showColPicker ? C.green : C.muted,
                    fontSize: 10, fontWeight: 600, transition: "all .12s"
                  }}
                >
                  <span style={{ fontSize: 12 }}>⚙️</span> Columns
                </div>

                {showColPicker && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
                    background: C.highest, border: `1px solid ${C.border}`, borderRadius: 12,
                    boxShadow: "0 12px 36px rgba(0,0,0,0.4)", width: 160, padding: 8,
                  }}>
                    <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", fontWeight: 700, padding: "4px 8px", marginBottom: 4 }}>Visible Columns</div>
                    {allCols.map(col => (
                      <div 
                        key={col.id} 
                        onClick={() => toggleCol(col.id)}
                        style={{
                          padding: "6px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                          cursor: "pointer", fontSize: 10, transition: "all .1s",
                          background: getVisible(col.id) ? "rgba(26, 255, 142, 0.05)" : "transparent"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = getVisible(col.id) ? "rgba(26, 255, 142, 0.05)" : "transparent")}
                      >
                        <div style={{ 
                          width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${getVisible(col.id) ? C.green : C.border}`,
                          background: getVisible(col.id) ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                          color: C.bg, fontSize: 10, fontWeight: 900
                        }}>{getVisible(col.id) && "✓"}</div>
                        <span style={{ color: getVisible(col.id) ? C.text : C.muted }}>{col.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Summary bar ───────────────────────────── */}
      {hasRun && summary && !isH2H && <SummaryBar summary={summary} statType={statType} />}

      {/* ── Results area ──────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {loading && hasRun && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(10,12,14,0.4)", backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none"
          }}>
            <div style={{ 
              padding: "8px 16px", background: C.highest, border: `1px solid ${C.border}`, 
              borderRadius: 20, fontSize: 10, fontWeight: 700, color: C.green,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
            }}>Updating...</div>
          </div>
        )}

        {loading && !hasRun ? (
          <EmptyState icon="⟳" title="Querying 9.6M deliveries…" subtitle="This may take a few seconds" />
        ) : !hasRun ? (
          <EmptyState
            icon="⚙️"
            title="Build your query"
            subtitle="Use the filter panel to combine any number of dimensions — format, phase, venue, opposition, date range, tournament and more. Then hit ▶ Run Query."
          />
        ) : isH2H ? (
          h2hData ? <H2HDashboardViewer data={h2hData} /> : <EmptyState icon="🔍" title="No results" subtitle="No H2H data returned." />
        ) : (statType === "team_compare" ? compareRows?.length : isTeam ? teamRows.length : isBowl ? bowlRows.length : batRows.length) === 0 ? (
          <EmptyState icon="🔍" title="No results" subtitle="Try adjusting or removing some filters." />
        ) : view === "table" ? (() => {
          const rows = statType === "team_compare" ? compareRows || [] : isTeam ? teamRows : isBowl ? bowlRows : batRows;
          const prunedCols = pruneColumns(allCols, rows);
          const prunedIds = new Set(prunedCols.map(c => c.id));
          const effectiveVisibleCols = { ...visibleCols };
          allCols.forEach(c => {
            if (!prunedIds.has(c.id)) effectiveVisibleCols[c.id] = false;
          });

          if (statType === "team_compare") return <CompareTable rows={compareRows || []} sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} visibleCols={effectiveVisibleCols} />;
          if (isTeam) return <TeamTable rows={teamRows} sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} groupBy={groupBy} visibleCols={effectiveVisibleCols} />;
          if (isBowl) return <BowlingTable rows={bowlRows} sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} groupBy={groupBy} visibleCols={effectiveVisibleCols} />;
          return <BattingTable rows={batRows} sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} groupBy={groupBy} visibleCols={effectiveVisibleCols} />;
        })() : (
          <GraphViewer
            rows={(statType === "team_compare" ? compareRows || [] : isTeam ? teamRows : isBowl ? bowlRows : batRows) as any}
            columns={allCols}
            statType={statType}
            sortBy={sortBy}
            groupBy={groupBy}
          />
        )}
      </div>
    </div>
  );
}

/* ── Empty State ──────────────────────────────────────────── */
function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 40px", color: C.muted, textAlign: "center", height: "100%",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.7 }}>{subtitle}</div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ opacity: 0.2, marginLeft: 4 }}>⇅</span>;
  return <span style={{ color: C.green, marginLeft: 4 }}>{dir === "desc" ? "↓" : "↑"}</span>;
}

/* ── Batting Table ────────────────────────────────────────── */
function BattingTable({ rows, sortBy, sortDir, onSortChange, groupBy, visibleCols }: { rows: BatRow[]; sortBy: string; sortDir: "asc" | "desc"; onSortChange: (c: string) => void; groupBy: string; visibleCols: Record<string, boolean> }) {
  const maxRuns = Math.max(...rows.map(r => r.runs), 1);
  const isV = (id: string) => visibleCols[id] !== false;
  const thStyle = (col: string): React.CSSProperties => ({
    padding: "8px 10px", fontSize: 8, fontWeight: 600, color: sortBy === col ? C.green : C.muted,
    textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" as const,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  });
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    textAlign: "right", color: C.muted, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.low, position: "sticky", top: 0, zIndex: 2 }}>
            {isV("rank") && <th style={{ ...thStyle("rank"), textAlign: "left" }} onClick={() => onSortChange("rank")}># <SortIcon active={sortBy === "rank"} dir={sortDir} /></th>}
            {isV("label") && <th style={{ ...thStyle("label"), textAlign: "left" }} onClick={() => onSortChange("label")}>{groupBy === "player" ? "Player" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} <SortIcon active={sortBy === "label"} dir={sortDir} /></th>}
            {isV("runs") && <th style={{ ...thStyle("runs"), width: 95 }} onClick={() => onSortChange("runs")}>Runs <SortIcon active={sortBy === "runs"} dir={sortDir} /></th>}
            {isV("average") && <th style={thStyle("average")} onClick={() => onSortChange("average")}>Avg <SortIcon active={sortBy === "average"} dir={sortDir} /></th>}
            {isV("strike_rate") && <th style={thStyle("strike_rate")} onClick={() => onSortChange("strike_rate")}>SR <SortIcon active={sortBy === "strike_rate"} dir={sortDir} /></th>}
            {isV("innings") && <th style={thStyle("innings")} onClick={() => onSortChange("innings")}>Inn <SortIcon active={sortBy === "innings"} dir={sortDir} /></th>}
            {isV("balls") && <th style={thStyle("balls")} onClick={() => onSortChange("balls")}>Balls <SortIcon active={sortBy === "balls"} dir={sortDir} /></th>}
            {isV("highest_score") && <th style={thStyle("highest_score")} onClick={() => onSortChange("highest_score")}>HS <SortIcon active={sortBy === "highest_score"} dir={sortDir} /></th>}
            {isV("fours") && <th style={thStyle("fours")} onClick={() => onSortChange("fours")}>4s <SortIcon active={sortBy === "fours"} dir={sortDir} /></th>}
            {isV("sixes") && <th style={thStyle("sixes")} onClick={() => onSortChange("sixes")}>6s <SortIcon active={sortBy === "sixes"} dir={sortDir} /></th>}
            {isV("fifties") && <th style={thStyle("fifties")} onClick={() => onSortChange("fifties")}>50s <SortIcon active={sortBy === "fifties"} dir={sortDir} /></th>}
            {isV("hundreds") && <th style={thStyle("hundreds")} onClick={() => onSortChange("hundreds")}>100s <SortIcon active={sortBy === "hundreds"} dir={sortDir} /></th>}
            {isV("ducks") && <th style={thStyle("ducks")} onClick={() => onSortChange("ducks")}>0s <SortIcon active={sortBy === "ducks"} dir={sortDir} /></th>}
            {isV("top_scores") && <th style={thStyle("top_scores")} onClick={() => onSortChange("top_scores")}>Top <SortIcon active={sortBy === "top_scores"} dir={sortDir} /></th>}
            {isV("won") && <th style={thStyle("won")} onClick={() => onSortChange("won")}>Won <SortIcon active={sortBy === "won"} dir={sortDir} /></th>}
            {isV("win_percentage") && <th style={thStyle("win_percentage")} onClick={() => onSortChange("win_percentage")}>Win% <SortIcon active={sortBy === "win_percentage"} dir={sortDir} /></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const barW = Math.round((r.runs / maxRuns) * 55);
            const ac = avatarColor(r.rank - 1);
            return (
              <tr key={r.rank} onMouseEnter={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = C.high; }} onMouseLeave={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = "transparent"; }}>
                {isV("rank") && <td style={{ ...tdStyle, textAlign: "left", fontSize: 9 }}>{r.rank}</td>}
                {isV("label") && (
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800,
                        background: ac.bg, color: ac.fg, flexShrink: 0,
                      }}>{initials(r.label)}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.label}</div>
                        {r.sub_label && <div style={{ fontSize: 8, color: C.muted }}>{r.sub_label}</div>}
                      </div>
                    </div>
                  </td>
                )}
                {isV("runs") && (
                  <td style={{ ...tdStyle, color: C.green, fontWeight: 700, width: 95 }}>
                    {r.runs.toLocaleString()}
                    <span style={{ height: 3, borderRadius: 2, display: "inline-block", verticalAlign: "middle", marginLeft: 5, opacity: 0.55, width: barW, background: C.green }} />
                  </td>
                )}
                {isV("average") && <td style={{ ...tdStyle, color: r.average != null && r.average > 50 ? C.green : r.average != null && r.average > 35 ? C.gold : C.muted }}>{f(r.average)}</td>}
                {isV("strike_rate") && <td style={{ ...tdStyle, color: r.strike_rate != null && r.strike_rate > 100 ? C.green : r.strike_rate != null && r.strike_rate > 80 ? C.gold : C.muted }}>{f(r.strike_rate, 1)}</td>}
                {isV("innings") && <td style={tdStyle}>{r.innings}</td>}
                {isV("balls") && <td style={tdStyle}>{r.balls}</td>}
                {isV("highest_score") && <td style={tdStyle}>{r.highest_score}</td>}
                {isV("fours") && <td style={tdStyle}>{r.fours}</td>}
                {isV("sixes") && <td style={tdStyle}>{r.sixes}</td>}
                {isV("fifties") && <td style={tdStyle}>{r.fifties}</td>}
                {isV("hundreds") && <td style={tdStyle}>{r.hundreds}</td>}
                {isV("ducks") && <td style={tdStyle}>{r.ducks}</td>}
                {isV("top_scores") && <td style={tdStyle}>{r.top_scores}</td>}
                {isV("won") && <td style={tdStyle}>{r.won}</td>}
                {isV("win_percentage") && <td style={tdStyle}>{r.win_percentage}%</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Bowling Table ────────────────────────────────────────── */
function BowlingTable({ rows, sortBy, sortDir, onSortChange, groupBy, visibleCols }: { rows: BowlRow[]; sortBy: string; sortDir: "asc" | "desc"; onSortChange: (c: string) => void; groupBy: string; visibleCols: Record<string, boolean> }) {
  const maxWkts = Math.max(...rows.map(r => r.wickets), 1);
  const isV = (id: string) => visibleCols[id] !== false;

  const thStyle = (col: string): React.CSSProperties => ({
    padding: "8px 10px", fontSize: 8, fontWeight: 600, color: sortBy === col ? C.green : C.muted,
    textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" as const,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  });
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    textAlign: "right", color: C.muted, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.low, position: "sticky", top: 0, zIndex: 2 }}>
            {isV("rank") && <th style={{ ...thStyle("rank"), textAlign: "left" }} onClick={() => onSortChange("rank")}># <SortIcon active={sortBy === "rank"} dir={sortDir} /></th>}
            {isV("label") && <th style={{ ...thStyle("label"), textAlign: "left" }} onClick={() => onSortChange("label")}>{groupBy === "player" ? "Player" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} <SortIcon active={sortBy === "label"} dir={sortDir} /></th>}
            {isV("wickets") && <th style={{ ...thStyle("wickets"), width: 85 }} onClick={() => onSortChange("wickets")}>Wkts <SortIcon active={sortBy === "wickets"} dir={sortDir} /></th>}
            {isV("bowling_average") && <th style={thStyle("bowling_average")} onClick={() => onSortChange("bowling_average")}>Avg <SortIcon active={sortBy === "bowling_average"} dir={sortDir} /></th>}
            {isV("economy") && <th style={thStyle("economy")} onClick={() => onSortChange("economy")}>Econ <SortIcon active={sortBy === "economy"} dir={sortDir} /></th>}
            {isV("bowling_strike_rate") && <th style={thStyle("bowling_strike_rate")} onClick={() => onSortChange("bowling_strike_rate")}>SR <SortIcon active={sortBy === "bowling_strike_rate"} dir={sortDir} /></th>}
            {isV("innings") && <th style={thStyle("innings")} onClick={() => onSortChange("innings")}>Inn <SortIcon active={sortBy === "innings"} dir={sortDir} /></th>}
            {isV("overs") && <th style={thStyle("overs")} onClick={() => onSortChange("overs")}>Overs <SortIcon active={sortBy === "overs"} dir={sortDir} /></th>}
            {isV("runs_conceded") && <th style={thStyle("runs_conceded")} onClick={() => onSortChange("runs_conceded")}>Runs <SortIcon active={sortBy === "runs_conceded"} dir={sortDir} /></th>}
            {isV("fours_conceded") && <th style={thStyle("fours_conceded")} onClick={() => onSortChange("fours_conceded")}>4s <SortIcon active={sortBy === "fours_conceded"} dir={sortDir} /></th>}
            {isV("sixes_conceded") && <th style={thStyle("sixes_conceded")} onClick={() => onSortChange("sixes_conceded")}>6s <SortIcon active={sortBy === "sixes_conceded"} dir={sortDir} /></th>}
            {isV("wides") && <th style={thStyle("wides")} onClick={() => onSortChange("wides")}>Wides <SortIcon active={sortBy === "wides"} dir={sortDir} /></th>}
            {isV("no_balls") && <th style={thStyle("no_balls")} onClick={() => onSortChange("no_balls")}>NB <SortIcon active={sortBy === "no_balls"} dir={sortDir} /></th>}
            {isV("best_bowling") && <th style={{ ...thStyle("best_bowling"), cursor: "default" }}>Best</th>}
            {isV("five_wkts") && <th style={thStyle("five_wkts")} onClick={() => onSortChange("five_wkts")}>5w <SortIcon active={sortBy === "five_wkts"} dir={sortDir} /></th>}
            {isV("top_wickets") && <th style={thStyle("top_wickets")} onClick={() => onSortChange("top_wickets")}>Top <SortIcon active={sortBy === "top_wickets"} dir={sortDir} /></th>}
            {isV("won") && <th style={thStyle("won")} onClick={() => onSortChange("won")}>Won <SortIcon active={sortBy === "won"} dir={sortDir} /></th>}
            {isV("win_percentage") && <th style={thStyle("win_percentage")} onClick={() => onSortChange("win_percentage")}>Win% <SortIcon active={sortBy === "win_percentage"} dir={sortDir} /></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const barW = Math.round((r.wickets / maxWkts) * 55);
            const ac = avatarColor(r.rank - 1);
            return (
              <tr key={r.rank} onMouseEnter={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = C.high; }} onMouseLeave={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = "transparent"; }}>
                {isV("rank") && <td style={{ ...tdStyle, textAlign: "left", fontSize: 9 }}>{r.rank}</td>}
                {isV("label") && (
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800,
                        background: ac.bg, color: ac.fg, flexShrink: 0,
                      }}>{initials(r.label)}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.label}</div>
                        {r.sub_label && <div style={{ fontSize: 8, color: C.muted }}>{r.sub_label}</div>}
                      </div>
                    </div>
                  </td>
                )}
                {isV("wickets") && (
                  <td style={{ ...tdStyle, color: C.green, fontWeight: 700, width: 85 }}>
                    {r.wickets}
                    <span style={{ height: 3, borderRadius: 2, display: "inline-block", verticalAlign: "middle", marginLeft: 5, opacity: 0.55, width: barW, background: C.green }} />
                  </td>
                )}
                {isV("bowling_average") && <td style={{ ...tdStyle, color: r.bowling_average != null && r.bowling_average < 22 ? C.green : r.bowling_average != null && r.bowling_average < 28 ? C.gold : C.muted }}>{f(r.bowling_average)}</td>}
                {isV("economy") && <td style={{ ...tdStyle, color: r.economy != null && r.economy < 3 ? C.green : r.economy != null && r.economy < 4 ? C.gold : r.economy != null && r.economy > 6 ? C.red : C.muted }}>{f(r.economy)}</td>}
                {isV("bowling_strike_rate") && <td style={tdStyle}>{f(r.bowling_strike_rate, 1)}</td>}
                {isV("innings") && <td style={tdStyle}>{r.innings}</td>}
                {isV("overs") && <td style={tdStyle}>{f(r.overs, 1)}</td>}
                {isV("runs_conceded") && <td style={tdStyle}>{r.runs_conceded}</td>}
                {isV("fours_conceded") && <td style={tdStyle}>{r.fours_conceded ?? 0}</td>}
                {isV("sixes_conceded") && <td style={tdStyle}>{r.sixes_conceded ?? 0}</td>}
                {isV("wides") && <td style={tdStyle}>{r.wides ?? 0}</td>}
                {isV("no_balls") && <td style={tdStyle}>{r.no_balls ?? 0}</td>}
                {isV("best_bowling") && <td style={tdStyle}>{r.best_bowling ?? "—"}</td>}
                {isV("five_wkts") && <td style={tdStyle}>{r.five_wicket_hauls ?? 0}</td>}
                {isV("top_wickets") && <td style={tdStyle}>{r.top_wickets}</td>}
                {isV("won") && <td style={tdStyle}>{r.won}</td>}
                {isV("win_percentage") && <td style={tdStyle}>{r.win_percentage}%</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Batting Cards ────────────────────────────────────────── */
function BattingCards({ rows, groupBy }: { rows: BatRow[]; groupBy?: string }) {
  const isAchievement = groupBy === "player_achievement_count" || groupBy === "player_season_achievement_count";
  
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, padding: 12 }}>
      {rows.map((r) => {
        const ac = avatarColor(r.rank - 1);
        return (
          <div key={r.rank} style={{ 
            background: C.low, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12,
            display: "flex", flexDirection: "column", gap: 10 
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800,
                background: ac.bg, color: ac.fg,
              }}>{initials(r.label)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.rank}. {r.label}</div>
                {r.sub_label && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{r.sub_label}</div>}
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <StatCell value={(isAchievement ? r.innings : r.runs).toLocaleString()} label={isAchievement ? "Times" : "Runs"} cls={C.green} />
              <StatCell value={f(r.average)} label="Average" cls={r.average != null && r.average > 50 ? C.green : r.average != null && r.average > 35 ? C.gold : C.text} />
              <StatCell value={f(r.strike_rate, 1)} label="SR" cls={r.strike_rate != null && r.strike_rate > 100 ? C.green : r.strike_rate != null && r.strike_rate > 80 ? C.gold : C.text} />
              <StatCell value={String(r.innings)} label="Innings" cls={C.text} />
            </div>

            {isAchievement && r.instances && r.instances.length > 0 && (
              <div style={{ 
                marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8,
                maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 
              }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 2 }}>Occurrences</div>
                {r.instances.map((inst: any, idx: number) => (
                  <div key={idx} style={{ 
                    fontSize: 10, display: "flex", justifyContent: "space-between", 
                    padding: "4px 6px", background: "rgba(255,255,255,0.02)", borderRadius: 4 
                  }}>
                    <span style={{ color: C.text, fontWeight: 500 }}>{inst.sub_label || inst.label}</span>
                    <span style={{ color: C.green, fontWeight: 700 }}>{inst.runs}{inst.dismissals === 0 ? '*' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Bowling Cards ────────────────────────────────────────── */
function BowlingCards({ rows, groupBy }: { rows: BowlRow[]; groupBy?: string }) {
  const isAchievement = groupBy === "player_achievement_count" || groupBy === "player_season_achievement_count";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, padding: 12 }}>
      {rows.map((r) => {
        const ac = avatarColor(r.rank - 1);
        return (
          <div key={r.rank} style={{ 
            background: C.low, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12,
            display: "flex", flexDirection: "column", gap: 10
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800,
                background: ac.bg, color: ac.fg,
              }}>{initials(r.label)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.rank}. {r.label}</div>
                {r.sub_label && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{r.sub_label}</div>}
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <StatCell value={(isAchievement ? r.innings : r.wickets).toLocaleString()} label={isAchievement ? "Times" : "Wickets"} cls={C.green} />
              <StatCell value={f(r.bowling_average)} label="Average" cls={r.bowling_average != null && r.bowling_average < 22 ? C.green : C.text} />
              <StatCell value={f(r.economy)} label="Economy" cls={r.economy != null && r.economy < 4 ? C.green : C.text} />
              <StatCell value={f(r.overs, 1)} label="Overs" cls={C.text} />
            </div>

            {isAchievement && r.instances && r.instances.length > 0 && (
              <div style={{ 
                marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8,
                maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 
              }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 2 }}>Occurrences</div>
                {r.instances.map((inst: any, idx: number) => (
                  <div key={idx} style={{ 
                    fontSize: 10, display: "flex", justifyContent: "space-between", 
                    padding: "4px 6px", background: "rgba(255,255,255,0.02)", borderRadius: 4 
                  }}>
                    <span style={{ color: C.text, fontWeight: 500 }}>{inst.sub_label || inst.label}</span>
                    <span style={{ color: C.green, fontWeight: 700 }}>{inst.wickets}/{inst.runs}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Team Table ────────────────────────────────────────────── */
function TeamTable({ rows, sortBy, sortDir, onSortChange, groupBy, visibleCols }: { rows: TeamRow[]; sortBy: string; sortDir: "asc" | "desc"; onSortChange: (c: string) => void; groupBy: string; visibleCols: Record<string, boolean> }) {
  const maxWins = rows[0]?.won || 1;
  const isV = (id: string) => visibleCols[id] !== false;

  const thStyle = (col: string): React.CSSProperties => ({
    padding: "8px 10px", fontSize: 8, fontWeight: 600, color: sortBy === col ? C.green : C.muted,
    textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" as const,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  });
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    textAlign: "right", color: C.muted, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.low, position: "sticky", top: 0, zIndex: 2 }}>
            {isV("rank") && <th style={{ ...thStyle("rank"), textAlign: "left" }} onClick={() => onSortChange("rank")}># <SortIcon active={sortBy === "rank"} dir={sortDir} /></th>}
            {isV("label") && <th style={{ ...thStyle("label"), textAlign: "left" }} onClick={() => onSortChange("label")}>Team <SortIcon active={sortBy === "label"} dir={sortDir} /></th>}
            {isV("matches_played") && <th style={thStyle("matches_played")} onClick={() => onSortChange("matches_played")}>Mat <SortIcon active={sortBy === "matches_played"} dir={sortDir} /></th>}
            {isV("won") && <th style={thStyle("won")} onClick={() => onSortChange("won")}>Won <SortIcon active={sortBy === "won"} dir={sortDir} /></th>}
            {isV("fours_hit") && <th style={thStyle("fours_hit")} onClick={() => onSortChange("fours_hit")}>4s <SortIcon active={sortBy === "fours_hit"} dir={sortDir} /></th>}
            {isV("sixes_hit") && <th style={thStyle("sixes_hit")} onClick={() => onSortChange("sixes_hit")}>6s <SortIcon active={sortBy === "sixes_hit"} dir={sortDir} /></th>}
            {isV("fours_conceded") && <th style={thStyle("fours_conceded")} onClick={() => onSortChange("fours_conceded")}>C4s <SortIcon active={sortBy === "fours_conceded"} dir={sortDir} /></th>}
            {isV("sixes_conceded") && <th style={thStyle("sixes_conceded")} onClick={() => onSortChange("sixes_conceded")}>C6s <SortIcon active={sortBy === "sixes_conceded"} dir={sortDir} /></th>}
            {isV("lost") && <th style={thStyle("lost")} onClick={() => onSortChange("lost")}>Lost <SortIcon active={sortBy === "lost"} dir={sortDir} /></th>}
            {isV("tied") && <th style={thStyle("tied")} onClick={() => onSortChange("tied")}>Tied <SortIcon active={sortBy === "tied"} dir={sortDir} /></th>}
            {isV("drawn") && <th style={thStyle("drawn")} onClick={() => onSortChange("drawn")}>Draw <SortIcon active={sortBy === "drawn"} dir={sortDir} /></th>}
            {isV("no_result") && <th style={thStyle("no_result")} onClick={() => onSortChange("no_result")}>NR <SortIcon active={sortBy === "no_result"} dir={sortDir} /></th>}
            {isV("win_percentage") && <th style={thStyle("win_percentage")} onClick={() => onSortChange("win_percentage")}>Win % <SortIcon active={sortBy === "win_percentage"} dir={sortDir} /></th>}
            {isV("batting_run_rate") && <th style={thStyle("batting_run_rate")} onClick={() => onSortChange("batting_run_rate")}>RR <SortIcon active={sortBy === "batting_run_rate"} dir={sortDir} /></th>}
            {isV("batting_strike_rate") && <th style={thStyle("batting_strike_rate")} onClick={() => onSortChange("batting_strike_rate")}>SR <SortIcon active={sortBy === "batting_strike_rate"} dir={sortDir} /></th>}
            {isV("batting_average") && <th style={thStyle("batting_average")} onClick={() => onSortChange("batting_average")}>Avg <SortIcon active={sortBy === "batting_average"} dir={sortDir} /></th>}
            {isV("wickets_lost") && <th style={thStyle("wickets_lost")} onClick={() => onSortChange("wickets_lost")}>Wkts L <SortIcon active={sortBy === "wickets_lost"} dir={sortDir} /></th>}
            {isV("balls_faced") && <th style={thStyle("balls_faced")} onClick={() => onSortChange("balls_faced")}>Balls <SortIcon active={sortBy === "balls_faced"} dir={sortDir} /></th>}
            {isV("highest_score") && <th style={thStyle("highest_score")} onClick={() => onSortChange("highest_score")}>HS <SortIcon active={sortBy === "highest_score"} dir={sortDir} /></th>}
            {isV("total_runs_conceded") && <th style={thStyle("total_runs_conceded")} onClick={() => onSortChange("total_runs_conceded")}>RC <SortIcon active={sortBy === "total_runs_conceded"} dir={sortDir} /></th>}
            {isV("bowling_run_rate") && <th style={thStyle("bowling_run_rate")} onClick={() => onSortChange("bowling_run_rate")}>Econ <SortIcon active={sortBy === "bowling_run_rate"} dir={sortDir} /></th>}
            {isV("wickets_taken") && <th style={thStyle("wickets_taken")} onClick={() => onSortChange("wickets_taken")}>Wkts <SortIcon active={sortBy === "wickets_taken"} dir={sortDir} /></th>}
            {isV("bowling_average") && <th style={thStyle("bowling_average")} onClick={() => onSortChange("bowling_average")}>Avg <SortIcon active={sortBy === "bowling_average"} dir={sortDir} /></th>}
            {isV("bowling_strike_rate") && <th style={thStyle("bowling_strike_rate")} onClick={() => onSortChange("bowling_strike_rate")}>SR <SortIcon active={sortBy === "bowling_strike_rate"} dir={sortDir} /></th>}
            {isV("balls_bowled") && <th style={thStyle("balls_bowled")} onClick={() => onSortChange("balls_bowled")}>Balls <SortIcon active={sortBy === "balls_bowled"} dir={sortDir} /></th>}
            {isV("lowest_score") && <th style={thStyle("lowest_score")} onClick={() => onSortChange("lowest_score")}>LS <SortIcon active={sortBy === "lowest_score"} dir={sortDir} /></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const barW = Math.round((r.won / maxWins) * 55);
            return (
              <tr key={r.rank} onMouseEnter={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = C.high; }} onMouseLeave={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = "transparent"; }}>
                {isV("rank") && <td style={{ ...tdStyle, textAlign: "left", fontSize: 9 }}>{r.rank}</td>}
                {isV("label") && (
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <TeamLogo teamName={r.label} size={26} showFallbackText={false} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.label}</div>
                        {r.sub_label && <div style={{ fontSize: 8, color: C.muted }}>{r.sub_label}</div>}
                      </div>
                    </div>
                  </td>
                )}
                {isV("matches_played") && <td style={tdStyle}>{r.matches_played}</td>}
                {isV("won") && (
                  <td style={{ ...tdStyle, color: C.green, fontWeight: 700 }}>
                    {r.won}
                    <span style={{ height: 3, borderRadius: 2, display: "inline-block", verticalAlign: "middle", marginLeft: 5, opacity: 0.55, width: barW, background: C.green }} />
                  </td>
                )}
                {isV("fours_hit") && <td style={tdStyle}>{r.fours_hit ?? 0}</td>}
                {isV("sixes_hit") && <td style={tdStyle}>{r.sixes_hit ?? 0}</td>}
                {isV("fours_conceded") && <td style={tdStyle}>{r.fours_conceded ?? 0}</td>}
                {isV("sixes_conceded") && <td style={tdStyle}>{r.sixes_conceded ?? 0}</td>}
                {isV("lost") && <td style={{ ...tdStyle, color: C.red }}>{r.lost}</td>}
                {isV("tied") && <td style={tdStyle}>{r.tied ?? 0}</td>}
                {isV("drawn") && <td style={tdStyle}>{r.drawn ?? 0}</td>}
                {isV("no_result") && <td style={tdStyle}>{r.no_result ?? 0}</td>}
                {isV("win_percentage") && <td style={{ ...tdStyle, color: r.win_percentage != null && r.win_percentage > 60 ? C.green : r.win_percentage != null && r.win_percentage > 40 ? C.gold : C.muted }}>{f(r.win_percentage, 1)}%</td>}
                {isV("batting_run_rate") && <td style={{ ...tdStyle, color: C.green }}>{f(r.batting_run_rate, 2)}</td>}
                {isV("batting_strike_rate") && <td style={{ ...tdStyle, color: C.blue }}>{f(r.batting_strike_rate, 1)}</td>}
                {isV("batting_average") && <td style={{ ...tdStyle, color: C.green }}>{f(r.batting_average, 2)}</td>}
                {isV("wickets_lost") && <td style={{ ...tdStyle, color: C.red }}>{r.wickets_lost || 0}</td>}
                {isV("balls_faced") && <td style={tdStyle}>{r.balls_faced?.toLocaleString() || "0"}</td>}
                {isV("highest_score") && <td style={tdStyle}>{r.highest_score ? `${r.highest_score}-${r.hs_wickets}` : "—"}</td>}
                {isV("total_runs_conceded") && <td style={tdStyle}>{r.total_runs_conceded?.toLocaleString() || "0"}</td>}
                {isV("bowling_run_rate") && <td style={{ ...tdStyle, color: C.blue }}>{f(r.bowling_run_rate, 2)}</td>}
                {isV("wickets_taken") && <td style={{ ...tdStyle, color: C.green }}>{r.wickets_taken || 0}</td>}
                {isV("bowling_average") && <td style={{ ...tdStyle, color: C.blue }}>{f(r.bowling_average, 2)}</td>}
                {isV("bowling_strike_rate") && <td style={{ ...tdStyle, color: C.gold }}>{f(r.bowling_strike_rate, 1)}</td>}
                {isV("balls_bowled") && <td style={tdStyle}>{r.balls_bowled?.toLocaleString() || "0"}</td>}
                {isV("lowest_score") && <td style={tdStyle}>{r.lowest_score ? `${r.lowest_score}-${r.ls_wickets}` : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Team Cards ───────────────────────────────────────────── */
function TeamCards({ rows }: { rows: TeamRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, padding: 12 }}>
      {rows.map((r) => {
        return (
          <div key={r.rank} style={{ background: C.low, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <TeamLogo teamName={r.label} size={32} showFallbackText={false} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{r.rank}. {r.label}</div>
                {r.sub_label && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{r.sub_label}</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <StatCell value={String(r.matches_played)} label="Matches" cls={C.text} />
              <StatCell value={f(r.win_percentage, 1) + "%"} label="Win %" cls={r.win_percentage != null && r.win_percentage > 60 ? C.green : r.win_percentage != null && r.win_percentage > 40 ? C.gold : C.text} />
              <StatCell value={String(r.won)} label="Won" cls={C.green} />
              <StatCell value={String(r.lost)} label="Lost" cls={C.red} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat Cell (card) ─────────────────────────────────────── */
function StatCell({ value, label, cls }: { value: string; label: string; cls: string }) {
  return (
    <div style={{ background: C.high, borderRadius: 7, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color: cls }}>{value}</div>
      <div style={{ fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".04em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ── Compare Table ───────────────────────────────────────────── */
function CompareTable({ rows, sortBy, sortDir, onSortChange, visibleCols }: { rows: TeamCompareRow[]; sortBy: string; sortDir: "asc" | "desc"; onSortChange: (c: string) => void; visibleCols: Record<string, boolean> }) {
  const isV = (id: string) => visibleCols[id] !== false;
  const thStyle = (col: string): React.CSSProperties => ({
    padding: "8px 10px", fontSize: 8, fontWeight: 600, color: sortBy === col ? C.green : C.muted,
    textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" as const,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  });
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    textAlign: "right", color: C.muted, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.low, position: "sticky", top: 0, zIndex: 2 }}>
            {TEAM_COMPARE_COLS.map(col => (
              isV(col.id) && (
                <th 
                  key={col.id} 
                  style={{ ...thStyle(col.id), textAlign: col.id === "rank" || col.id === "label" ? "left" : "right" }} 
                  onClick={() => onSortChange(col.id)}
                >
                  {col.label} <SortIcon active={sortBy === col.id} dir={sortDir} />
                </th>
              )
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} onMouseEnter={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = C.high; }} onMouseLeave={(e) => { for (const td of e.currentTarget.querySelectorAll("td")) (td as HTMLElement).style.background = "transparent"; }}>
              {isV("rank") && <td style={{ ...tdStyle, textAlign: "left", fontSize: 9 }}>{r.rank}</td>}
              {isV("label") && (
                <td style={{ ...tdStyle, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <TeamLogo teamName={r.label} size={20} showFallbackText={false} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.label}</div>
                      {r.sub_label && <div style={{ fontSize: 8, color: C.muted }}>{r.sub_label}</div>}
                    </div>
                  </div>
                </td>
              )}
              {isV("matches_played") && <td style={tdStyle}>{r.matches_played}</td>}
              {isV("run_diff") && <td style={{ ...tdStyle, color: r.run_diff > 0 ? C.green : r.run_diff < 0 ? C.red : C.muted, fontWeight: 700 }}>{r.run_diff > 0 ? "+" : ""}{r.run_diff}</td>}
              {isV("run_rate_diff") && <td style={{ ...tdStyle, color: r.run_rate_diff > 0 ? C.green : r.run_rate_diff < 0 ? C.red : C.muted, fontWeight: 600 }}>{r.run_rate_diff > 0 ? "+" : ""}{f(r.run_rate_diff, 2)}</td>}
              {isV("runs_for") && <td style={tdStyle}>{r.runs_for.toLocaleString()}</td>}
              {isV("runs_against") && <td style={tdStyle}>{r.runs_against.toLocaleString()}</td>}
              {isV("run_rate_for") && <td style={tdStyle}>{f(r.run_rate_for, 2)}</td>}
              {isV("run_rate_against") && <td style={tdStyle}>{f(r.run_rate_against, 2)}</td>}
              {isV("wickets_lost") && <td style={{ ...tdStyle, color: C.red }}>{r.wickets_lost}</td>}
              {isV("wickets_taken") && <td style={{ ...tdStyle, color: C.green }}>{r.wickets_taken}</td>}
              {isV("won") && <td style={{ ...tdStyle, color: C.green }}>{r.won}</td>}
              {isV("win_percentage") && <td style={tdStyle}>{f(r.win_percentage, 1)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
