"use client";
import { useState, useMemo, useEffect } from "react";
import api, { StatBuilderMeta } from "@/lib/api";

/* ── Design tokens (same as rest of app) ────────────────────── */
const C = {
  bg: "var(--bg-base)",
  low: "var(--bg-surface)",
  mid: "var(--bg-card)",
  high: "var(--bg-card-hover)",
  highest: "#31353c",
  green: "var(--accent-green)",
  gold: "var(--accent-gold)",
  red: "var(--accent-red)",
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  border: "var(--glass-border)",
};

export type StatFilters = {
  player_name?: string;
  formats: string[];
  innings: string[];
  phases: string[];
  over_from?: number;
  over_to?: number;
  opposition: string[];
  venue_search?: string;
  countries: string[];
  ground_type?: string;
  year_from?: number;
  year_to?: number;
  tournaments: string[];
  match_result: string[];
  toss?: string;
  day_night?: string;
  min_innings: number;
  min_average?: number;
  min_strike_rate?: number;
  group_by: string;
  stat_type: string; // "bat" | "bowl" | "team" | "team_bat" | "team_bowl" | "h2h"
  min_runs?: number;
  min_wickets?: number;
  min_balls?: number;
  max_runs?: number;
  max_wickets?: number;
  max_balls?: number;
  min_fours?: number;
  min_sixes?: number;
  min_no_balls?: number;
  min_wides?: number;

  // V2 Additions
  match_stages: string[];
  match_groups: string[];
  cities: string[];
  teams: string[];
  players_involved: string[]; // List of player IDs (or names)
  date_from?: string; // YYYY-MM-DD
  date_to?: string;
  match_number_from?: number;
  match_number_to?: number;
  toss_decision?: string; // "bat" | "field"
  batting_positions: string[];
  dismissal_types: string[];
  player_of_match_only: boolean;
  super_over_only: boolean;
  min_win_by_runs?: number;
  max_win_by_runs?: number;
  min_win_by_wickets?: number;
  max_win_by_wickets?: number;
  venues: string[];

  // V3 Additions
  min_team_runs?: number;
  max_team_runs?: number;
  min_opp_runs?: number;
  max_opp_runs?: number;
  min_team_wickets?: number;
  max_team_wickets?: number;
  min_opp_wickets?: number;
  max_opp_wickets?: number;
  match_month?: number;
  match_day?: number;

  // Missing fields for page.tsx typecheck
  min_chasing_runs?: number;
  min_defending_runs?: number;
  is_not_out?: boolean;

  // V4 Additions
  partnership_number?: number;
  min_partnership_runs?: number;
  back_to_back_wickets: boolean;

  // Team Thresholds
  score_threshold?: number;
  team_score_mode: string; // "scored" | "conceded" | "diff"
  vs_top_limit?: number;
  opposing_players: { id: string; name: string }[];
};

export const defaultFilters: StatFilters = {
  formats: [], innings: [], phases: [], opposition: [], countries: [],
  tournaments: [], match_result: [], min_innings: 1,
  group_by: "player", stat_type: "bat",
  match_stages: [], match_groups: [], cities: [], teams: [], players_involved: [],
  batting_positions: [], dismissal_types: [], player_of_match_only: false, super_over_only: false,
  venues: [],
  min_runs: undefined, min_wickets: undefined, min_balls: undefined,
  min_team_runs: undefined, max_team_runs: undefined,
  min_opp_runs: undefined, max_opp_runs: undefined,
  min_team_wickets: undefined, max_team_wickets: undefined,
  back_to_back_wickets: false,
  team_score_mode: "scored",
  vs_top_limit: undefined,
  opposing_players: [],
  min_chasing_runs: undefined,
  min_defending_runs: undefined,
  is_not_out: false,
};

type Props = {
  filters: StatFilters;
  onChange: (f: StatFilters) => void;
  onRun: () => void;
  onReset: () => void;
  loading: boolean;
};

/* ── Helpers ─────────────────────────────────────────────────── */
function toggleArr(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

/* ── Sub-components ──────────────────────────────────────────── */
function FilterGroup({ id, icon, label, count, defaultOpen, children }: {
  id: string; icon: string; label: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px", cursor: "pointer", userSelect: "none",
          transition: "background .1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.high)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          {icon} {label}
          {count > 0 && (
            <span style={{
              background: "rgba(75,226,119,0.15)", border: "1px solid rgba(75,226,119,0.25)",
              borderRadius: 10, padding: "0 5px", fontSize: 8, color: C.green, fontWeight: 700,
            }}>{count}</span>
          )}
        </span>
        <span style={{ fontSize: 9, color: C.muted, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </div>
      {open && <div style={{ padding: "8px 14px 12px" }}>{children}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 4, marginTop: 9 }}>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        background: active ? "rgba(75,226,119,0.1)" : C.high,
        border: `1px solid ${active ? "rgba(75,226,119,0.3)" : C.border}`,
        borderRadius: 6, padding: "3px 8px", fontSize: 10,
        color: active ? C.green : C.muted, cursor: "pointer", userSelect: "none",
        fontWeight: active ? 600 : 400, transition: "all .1s",
      }}
    >{label}</span>
  );
}

function ToggleGroup({ options, value, onChange }: { options: { label: string; value: string }[]; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {options.map((o) => (
        <div
          key={o.value}
          onClick={() => onChange(o.value === "Any" ? undefined : (value === o.value ? undefined : o.value))}
          style={{
            flex: 1, background: value === o.value ? "rgba(75,226,119,0.1)" : C.high,
            border: `1px solid ${value === o.value ? "rgba(75,226,119,0.3)" : C.border}`,
            borderRadius: 6, padding: "4px 4px", fontSize: 9, fontWeight: 600,
            color: value === o.value ? C.green : C.muted, cursor: "pointer", textAlign: "center",
            transition: "all .1s",
          }}
        >{o.label}</div>
      ))}
    </div>
  );
}

function SearchInput({ placeholder, value, onChange, onSelect, onSelectPlayer, type }: { 
  placeholder: string; 
  value: string; 
  onChange: (v: string) => void; 
  onSelect: (v: string) => void;
  onSelectPlayer?: (p: { player_id: string; name: string }) => void;
  type: "player" | "venue" 
}) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value || value.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      if (type === "player") {
        api.searchPlayers(value).then(res => setResults(res));
      } else {
        api.searchVenues(value).then(res => setResults(res));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value, type]);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{
          background: C.high, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "5px 8px", fontSize: 11, color: C.text, width: "100%",
          fontFamily: "inherit", outline: "none",
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: C.mid, border: `1px solid ${C.border}`, borderRadius: 6,
          marginTop: 4, maxHeight: 150, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        }}>
          {results.map((r, i) => {
            const displayName = typeof r === "string" ? r : r.name;
            return (
              <div
                key={i}
                onClick={() => {
                  if (typeof r === "string") {
                    onSelect(r);
                  } else {
                    if (onSelectPlayer) {
                      onSelectPlayer(r);
                    } else {
                      onSelect(r.name);
                    }
                  }
                  setOpen(false);
                }}
                style={{ padding: "6px 10px", fontSize: 10, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.high)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {displayName}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterInput({ placeholder, value, onChange, type, min, max }: { placeholder: string; value: string | number | undefined; onChange: (v: string) => void; type?: string; min?: number; max?: number }) {
  return (
    <input
      type={type || "text"}
      placeholder={placeholder}
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: C.high, border: `1px solid ${C.border}`, borderRadius: 6,
        padding: "5px 8px", fontSize: 11, color: C.text, width: "100%",
        fontFamily: "inherit", outline: "none",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(75,226,119,0.4)")}
      onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
    />
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function FilterPanel({ filters, onChange, onRun, onReset, loading }: Props) {
  const [meta, setMeta] = useState<StatBuilderMeta | null>(null);
  const [oppSearch, setOppSearch] = useState("");
  
  const u = (patch: Partial<StatFilters>) => onChange({ ...filters, ...patch });

  // Fetch dynamic meta options based on current format/tournament/year selections
  useEffect(() => {
    let active = true;
    api.getStatBuilderMeta({
      formats: filters.formats,
      tournaments: filters.tournaments,
      countries: filters.countries,
      year_from: filters.year_from,
      year_to: filters.year_to,
    }).then(res => {
      if (active) setMeta(res);
    }).catch(err => {
      console.error("Failed to load meta", err);
    });
    return () => { active = false; };
  }, [filters.formats, filters.tournaments, filters.countries, filters.year_from, filters.year_to]);

  // Auto-switch TO H2H when exactly 2 teams are selected, or 1 team + 1 opposition
  useEffect(() => {
    const isH2HScenario = (filters.teams.length === 2 && filters.opposition.length === 0) || 
                          (filters.teams.length === 1 && filters.opposition.length === 1);
    
    if (isH2HScenario && filters.stat_type !== "h2h") {
      onChange({ ...filters, stat_type: "h2h" });
    }
    // We don't auto-switch AWAY from H2H here to allow the user to select teams one by one
    // without the UI jumping back and forth.
  }, [filters.teams.length, filters.opposition.length, filters.stat_type]);

  const totalActive = useMemo(() => {
    let c = 0;
    if (filters.player_name) c++;
    c += filters.formats.length;
    c += filters.innings.length;
    c += filters.phases.length;
    if (filters.over_from != null) c++;
    if (filters.over_to != null) c++;
    c += filters.opposition.length;
    if (filters.venue_search) c++;
    c += filters.countries.length;
    if (filters.ground_type) c++;
    if (filters.year_from != null) c++;
    if (filters.year_to != null) c++;
    c += filters.tournaments.length;
    c += filters.match_result.length;
    c += filters.teams.length;
    if (filters.toss) c++;
    if (filters.day_night) c++;
    
    // V2
    c += filters.match_stages.length;
    c += filters.match_groups.length;
    c += filters.cities.length;
    // filters.teams already added above
    c += filters.players_involved.length;
    if (filters.date_from) c++;
    if (filters.date_to) c++;
    if (filters.match_number_from != null) c++;
    if (filters.match_number_to != null) c++;
    if (filters.toss_decision) c++;
    c += filters.batting_positions.length;
    c += filters.dismissal_types.length;
    if (filters.player_of_match_only) c++;
    if (filters.super_over_only) c++;
    if (filters.min_win_by_runs != null) c++;
    if (filters.max_win_by_runs != null) c++;
    if (filters.min_win_by_wickets != null) c++;
    if (filters.max_win_by_wickets != null) c++;
    c += filters.venues.length;
    if (filters.partnership_number != null) c++;
    if (filters.min_partnership_runs != null) c++;
    if (filters.back_to_back_wickets) c++;
    if (filters.score_threshold != null) c++;
    if (filters.vs_top_limit != null) c++;
    c += filters.opposing_players.length;
    return c;
  }, [filters]);

  // Counts per section
  const playerCount = (filters.player_name ? 1 : 0) + filters.players_involved.length + (filters.vs_top_limit ? 1 : 0) + filters.opposing_players.length;
  const roleCount = filters.batting_positions.length + filters.dismissal_types.length + filters.phases.length + (filters.over_from != null ? 1 : 0) + (filters.over_to != null ? 1 : 0);
  const formatCount = filters.formats.length + filters.innings.length + (filters.day_night ? 1 : 0) + filters.teams.length + filters.opposition.length;
  const matchDetailsCount = filters.match_stages.length + filters.match_groups.length + (filters.match_number_from != null ? 1 : 0) + (filters.match_number_to != null ? 1 : 0) + (filters.toss ? 1 : 0) + (filters.toss_decision ? 1 : 0);
  const resultCount = filters.match_result.length + (filters.player_of_match_only ? 1 : 0) + (filters.super_over_only ? 1 : 0) + (filters.min_win_by_runs != null ? 1 : 0) + (filters.max_win_by_runs != null ? 1 : 0) + (filters.min_win_by_wickets != null ? 1 : 0) + (filters.max_win_by_wickets != null ? 1 : 0);
  const venueCount = (filters.venue_search ? 1 : 0) + filters.venues.length + filters.countries.length + filters.cities.length + (filters.ground_type ? 1 : 0);
  const dateCount = (filters.year_from != null ? 1 : 0) + (filters.year_to != null ? 1 : 0) + (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0) + filters.tournaments.length;
  const scoreCount = (filters.min_innings > 1 ? 1 : 0) + (filters.min_average != null ? 1 : 0) + (filters.min_strike_rate != null ? 1 : 0) + (filters.min_runs != null ? 1 : 0) + (filters.min_wickets != null ? 1 : 0) + (filters.min_balls != null ? 1 : 0) + (filters.min_no_balls != null ? 1 : 0) + (filters.min_wides != null ? 1 : 0);

  // Dynamic Options (Fallback to static defaults if meta loading)
  const availableTournaments = meta?.competitions?.length ? meta.competitions : [
    "Indian Premier League", "ICC Cricket World Cup", "ICC Men's T20 World Cup", "ICC Champions Trophy", "The Ashes", "Big Bash League", "Pakistan Super League"
  ];
  const availableTeams = meta?.teams?.length ? meta.teams : [
    "Australia", "England", "India", "South Africa", "New Zealand", "Pakistan", "Sri Lanka", "West Indies", "Bangladesh", "Afghanistan"
  ];
  const availableCountries = meta?.countries?.length ? meta.countries : [
    "India", "Australia", "England", "South Africa", "West Indies", "New Zealand", "Sri Lanka", "UAE", "Pakistan", "Zimbabwe"
  ];

  return (
    <div style={{
      width: 280, background: C.low, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Stat Builder 
          {totalActive > 0 && (
             <span style={{
                background: "rgba(75,226,119,0.15)", borderRadius: 10, padding: "0 6px", 
                fontSize: 9, color: C.green, fontWeight: 800, border: "1px solid rgba(75,226,119,0.3)"
             }}>{totalActive} Active</span>
          )}
        </div>
        <div style={{ fontSize: 9, color: C.muted }}>BI-style query engine for match statistics</div>
      </div>

      {/* Scrollable Filters */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        
        {/* ── Player / Personnel ──────────────────────────── */}
        {!filters.stat_type.startsWith("team") && (
          <FilterGroup id="player" icon="👤" label="Personnel" count={playerCount} defaultOpen>
            <SectionLabel>Search Primary Player</SectionLabel>
            <SearchInput
              placeholder="V Kohli, JR Hazlewood…"
              value={filters.player_name || ""}
              onChange={(v) => u({ player_name: v })}
              onSelect={(v) => u({ player_name: v })}
              type="player"
            />
            <SectionLabel>Players involved (comma separated)</SectionLabel>
            <FilterInput
              placeholder="e.g., MS Dhoni, RG Sharma"
              value={filters.players_involved.join(", ")}
              onChange={(v) => u({ players_involved: v ? v.split(",").map(s => s.trim()).filter(Boolean) : [] })}
            />

            {/* ── Opposing Player Matchups (Approach 1) ── */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Matchup Filters
              </div>
              
              <SectionLabel>
                {filters.stat_type === "bat" ? "Vs Top Bowlers" : "Vs Top Batters"}
              </SectionLabel>
              <select
                value={filters.vs_top_limit || ""}
                onChange={(e) => u({ vs_top_limit: e.target.value ? parseInt(e.target.value) : undefined })}
                style={{
                  background: C.high, border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: "5px 8px", fontSize: 11, color: C.text, width: "100%",
                  fontFamily: "inherit", outline: "none", cursor: "pointer",
                }}
              >
                <option value="">None (All Opponents)</option>
                <option value="5">Top 5 of Tournament</option>
                <option value="10">Top 10 of Tournament</option>
                <option value="15">Top 15 of Tournament</option>
                <option value="20">Top 20 of Tournament</option>
              </select>

              <SectionLabel>
                {filters.stat_type === "bat" ? "Opposing Bowlers" : "Opposing Batters"}
              </SectionLabel>
              <SearchInput
                placeholder={filters.stat_type === "bat" ? "Search bowler..." : "Search batter..."}
                value={oppSearch}
                onChange={setOppSearch}
                onSelect={() => {}}
                onSelectPlayer={(p) => {
                  if (!filters.opposing_players.some(op => op.id === p.player_id)) {
                    u({ opposing_players: [...filters.opposing_players, { id: p.player_id, name: p.name }] });
                  }
                  setOppSearch("");
                }}
                type="player"
              />
              {filters.opposing_players.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {filters.opposing_players.map((p) => (
                    <span
                      key={p.id}
                      onClick={() => u({ opposing_players: filters.opposing_players.filter(op => op.id !== p.id) })}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "2px 6px", fontSize: 9,
                        color: C.text, cursor: "pointer", userSelect: "none",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(235, 94, 94, 0.15)"; e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
                    >
                      {p.name} <span style={{ fontSize: 8 }}>✕</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </FilterGroup>
        )}

        {/* ── Format & Teams ──────────────────────────────── */}
        <FilterGroup id="fmt" icon="🏆" label="Format & Teams" count={filters.formats.length + filters.teams.length + filters.opposition.length + filters.tournaments.length + (filters.day_night ? 1 : 0)}>
          <SectionLabel>Match Format</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {["Test", "ODI", "T20I", "IPL", "T20"].map((f) => {
              const labelMap: Record<string, string> = {
                Test: "Tests",
                ODI: "ODIs",
                T20I: "T20Is",
                IPL: "IPL",
                T20: "All T20s",
              };
              return (
                <Chip key={f} label={labelMap[f] || f} active={filters.formats.includes(f)} onClick={() => u({ formats: toggleArr(filters.formats, f) })} />
              );
            })}
          </div>
          <SectionLabel>Innings</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {[{ l: "1st Inn", v: "1st" }, { l: "2nd Inn", v: "2nd" }, { l: "Chasing", v: "Chase" }, { l: "Setting target", v: "Setting" }].map((o) => (
              <Chip key={o.v} label={o.l} active={filters.innings.includes(o.v)} onClick={() => u({ innings: toggleArr(filters.innings, o.v) })} />
            ))}
          </div>
          <SectionLabel>Team</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {availableTeams.slice(0, 30).map((t) => (
              <Chip key={t} label={t} active={filters.teams.includes(t)} onClick={() => u({ teams: toggleArr(filters.teams, t) })} />
            ))}
          </div>
          <SectionLabel>Against Opposition</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {availableTeams.slice(0, 30).map((t) => (
              <Chip key={t} label={t} active={filters.opposition.includes(t)} onClick={() => u({ opposition: toggleArr(filters.opposition, t) })} />
            ))}
          </div>
          <SectionLabel>Day / Night</SectionLabel>
          <ToggleGroup
            options={[{ label: "Day", value: "day" }, { label: "D/N", value: "day/night" }, { label: "Night", value: "night" }, { label: "Any", value: "Any" }]}
            value={filters.day_night}
            onChange={(v) => u({ day_night: v })}
          />
        </FilterGroup>

        {/* ── Match Details ───────────────────────────────── */}
        <FilterGroup id="details" icon="📄" label="Match Details" count={matchDetailsCount}>
          <SectionLabel>Toss Details</SectionLabel>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <ToggleGroup
                options={[{ label: "Won Toss", value: "Won" }, { label: "Lost Toss", value: "Lost" }, { label: "Any", value: "Any" }]}
                value={filters.toss}
                onChange={(v) => u({ toss: v })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <ToggleGroup
                options={[{ label: "Batted First", value: "bat" }, { label: "Fielded First", value: "field" }, { label: "Any", value: "Any" }]}
                value={filters.toss_decision}
                onChange={(v) => u({ toss_decision: v })}
              />
            </div>
          </div>
          
          <SectionLabel>Match Stage</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
             {(meta?.stages || ["Final", "Semi Final", "Qualifier 1", "Qualifier 2", "Eliminator"]).map(s => (
                <Chip key={s} label={s} active={filters.match_stages.includes(s)} onClick={() => u({ match_stages: toggleArr(filters.match_stages, s) })} />
             ))}
          </div>
        </FilterGroup>

        {/* ── Match Result ────────────────────────────────── */}
        <FilterGroup id="result" icon="🏆" label="Match Result" count={resultCount}>
          <SectionLabel>Result</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {["Won", "Lost", "Draw", "Tie", "NR"].map((r) => (
              <Chip key={r} label={r} active={filters.match_result.includes(r)} onClick={() => u({ match_result: toggleArr(filters.match_result, r) })} />
            ))}
          </div>
          
          <SectionLabel>Win Margin (Runs)</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
             <FilterInput type="number" placeholder="Min (e.g. 1)" value={filters.min_win_by_runs} onChange={(v) => u({ min_win_by_runs: v ? parseInt(v) : undefined })} />
             <FilterInput type="number" placeholder="Max (e.g. 100)" value={filters.max_win_by_runs} onChange={(v) => u({ max_win_by_runs: v ? parseInt(v) : undefined })} />
          </div>

          <SectionLabel>Win Margin (Wickets)</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
             <FilterInput type="number" placeholder="Min (1)" value={filters.min_win_by_wickets} onChange={(v) => u({ min_win_by_wickets: v ? parseInt(v) : undefined })} />
             <FilterInput type="number" placeholder="Max (10)" value={filters.max_win_by_wickets} onChange={(v) => u({ max_win_by_wickets: v ? parseInt(v) : undefined })} />
          </div>

          <SectionLabel>Special Matches</SectionLabel>
          <div style={{ display: "flex", gap: 4 }}>
             <Chip label="Super Over Only" active={filters.super_over_only} onClick={() => u({ super_over_only: !filters.super_over_only })} />
             {!filters.stat_type.startsWith("team") && (
               <Chip label="Player of Match" active={filters.player_of_match_only} onClick={() => u({ player_of_match_only: !filters.player_of_match_only })} />
             )}
          </div>
        </FilterGroup>

        {/* ── Role & Phase ─────────────────────────────────── */}
        {true && (
          <FilterGroup id="role" icon="🎯" label="Role & Phase" count={roleCount}>
            {!filters.stat_type.startsWith("team") && (
              <>
                <SectionLabel>Batting Position</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {[{l: "Opener (1-2)", v: "opener"}, {l: "Top (1-3)", v: "top_order"}, {l: "Middle (4-5)", v: "middle"}, {l: "Lower (6-7)", v: "lower"}, {l: "Tail (8-11)", v: "tail"}].map(p => (
                    <Chip key={p.v} label={p.l} active={filters.batting_positions.includes(p.v)} onClick={() => u({ batting_positions: toggleArr(filters.batting_positions, p.v) })} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => (
                    <Chip key={n} label={`#${n}`} active={filters.batting_positions.includes(n.toString())} onClick={() => u({ batting_positions: toggleArr(filters.batting_positions, n.toString()) })} />
                  ))}
                </div>

                <SectionLabel>Dismissal Type</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
                  <Chip label="Not Out Only" active={filters.is_not_out || false} onClick={() => u({ is_not_out: !filters.is_not_out })} />
                  {["bowled", "caught", "lbw", "run out", "stumped", "hit wicket"].map(d => (
                     <Chip key={d} label={d} active={filters.dismissal_types.includes(d)} onClick={() => u({ dismissal_types: toggleArr(filters.dismissal_types, d) })} />
                  ))}
                </div>
              </>
            )}

            <SectionLabel>Phase</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
                <Chip label="All Phases" active={filters.phases.length === 0} onClick={() => u({ phases: [] })} />
                {[{ l: "Powerplay", v: "powerplay" }, { l: "Middle Overs", v: "middle" }, { l: "Death Overs", v: "death" }].map((o) => (
                  <Chip key={o.v} label={o.l} active={filters.phases.includes(o.v)} onClick={() => u({ phases: toggleArr(filters.phases, o.v) })} />
                ))}
              </div>
              <SectionLabel>Specific Over Range</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>From</div>
                  <FilterInput type="number" placeholder="1" min={1} max={filters.formats.some(f => ["ODI", "Test"].includes(f)) ? 50 : 20} value={filters.over_from} onChange={(v) => u({ over_from: v ? parseInt(v) : undefined })} />
                </div>
                <div>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>To</div>
                  <FilterInput type="number" placeholder={filters.formats.some(f => ["ODI", "Test"].includes(f)) ? "50" : "20"} min={1} max={filters.formats.some(f => ["ODI", "Test"].includes(f)) ? 50 : 20} value={filters.over_to} onChange={(v) => u({ over_to: v ? parseInt(v) : undefined })} />
                </div>
              </div>
          </FilterGroup>
        )}

        {/* ── Venue & Conditions ──────────────────────────── */}
        <FilterGroup id="venue" icon="📍" label="Venue & Conditions" count={venueCount}>
          <SectionLabel>Select Venues</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, maxHeight: 120, overflowY: "auto", padding: 2, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {(meta?.venues || []).map((v) => (
              <Chip key={v} label={v} active={filters.venues?.includes(v) || false} onClick={() => u({ venues: toggleArr(filters.venues || [], v) })} />
            ))}
          </div>
          <SectionLabel>Search Venue</SectionLabel>
          <SearchInput
            placeholder="Wankhede, MCG, Lord's…"
            value={filters.venue_search || ""}
            onChange={(v) => u({ venue_search: v })}
            onSelect={(v) => u({ venue_search: v })}
            type="venue"
          />
          <SectionLabel>Country</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {availableCountries.slice(0, 30).map((c) => (
              <Chip key={c} label={c} active={filters.countries.includes(c)} onClick={() => u({ countries: toggleArr(filters.countries, c) })} />
            ))}
          </div>
          <SectionLabel>City</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
            {(meta?.cities || []).slice(0, 30).map((c) => (
              <Chip key={c} label={c} active={filters.cities.includes(c)} onClick={() => u({ cities: toggleArr(filters.cities, c) })} />
            ))}
          </div>
          <SectionLabel>Home / Away / Neutral</SectionLabel>
          <ToggleGroup
            options={[{ label: "Home", value: "Home" }, { label: "Away", value: "Away" }, { label: "Neutral", value: "Neutral" }, { label: "Any", value: "Any" }]}
            value={filters.ground_type}
            onChange={(v) => u({ ground_type: v })}
          />
        </FilterGroup>

        {/* ── Score & Thresholds ──────────────────────────── */}
        <FilterGroup id="score" icon="📊" label="Score & Thresholds" count={scoreCount}>
          {(filters.stat_type === "bat" || filters.stat_type === "bowl") && (
            <>
              <SectionLabel>Min innings</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range" min={1} max={100} value={filters.min_innings}
                  onChange={(e) => u({ min_innings: parseInt(e.target.value) })}
                  style={{ flex: 1, accentColor: C.green }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, minWidth: 26, textAlign: "right" }}>{filters.min_innings}</span>
              </div>
              <SectionLabel>Min average</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range" min={0} max={100} value={filters.min_average ?? 0}
                  onChange={(e) => { const v = parseInt(e.target.value); u({ min_average: v > 0 ? v : undefined }); }}
                  style={{ flex: 1, accentColor: C.green }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, minWidth: 26, textAlign: "right" }}>{filters.min_average ?? 0}</span>
              </div>
              <SectionLabel>Min strike rate</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range" min={0} max={200} value={filters.min_strike_rate ?? 0}
                  onChange={(e) => { const v = parseInt(e.target.value); u({ min_strike_rate: v > 0 ? v : undefined }); }}
                  style={{ flex: 1, accentColor: C.green }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, minWidth: 26, textAlign: "right" }}>{filters.min_strike_rate ?? 0}</span>
              </div>

              {filters.stat_type === "bowl" && (
                <>
                  <SectionLabel>Min No-Balls</SectionLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={200} value={filters.min_no_balls ?? 0}
                      onChange={(e) => { const v = parseInt(e.target.value); u({ min_no_balls: v > 0 ? v : undefined }); }}
                      style={{ flex: 1, accentColor: C.green }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, minWidth: 26, textAlign: "right" }}>{filters.min_no_balls ?? 0}</span>
                  </div>
                  <SectionLabel>Min Wides</SectionLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={200} value={filters.min_wides ?? 0}
                      onChange={(e) => { const v = parseInt(e.target.value); u({ min_wides: v > 0 ? v : undefined }); }}
                      style={{ flex: 1, accentColor: C.green }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, minWidth: 26, textAlign: "right" }}>{filters.min_wides ?? 0}</span>
                  </div>
                </>
              )}
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, borderBottom: `1px solid ${C.low}`, paddingBottom: 10, marginBottom: 10 }}>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Min Runs Conceded" : "Min Runs Scored"}</SectionLabel>
                  <FilterInput type="number" placeholder="e.g. 500" value={filters.min_runs} onChange={(v) => u({ min_runs: v ? parseInt(v) : undefined })} />
                </div>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Min Wickets" : "Min Balls Faced"}</SectionLabel>
                  {filters.stat_type === "bowl" ? (
                    <FilterInput type="number" placeholder="e.g. 30" value={filters.min_wickets} onChange={(v) => u({ min_wickets: v ? parseInt(v) : undefined })} />
                  ) : (
                    <FilterInput type="number" placeholder="e.g. 300" value={filters.min_balls} onChange={(v) => u({ min_balls: v ? parseInt(v) : undefined })} />
                  )}
                </div>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Max Runs Conceded" : "Max Runs Scored"}</SectionLabel>
                  <FilterInput type="number" placeholder="e.g. 1000" value={filters.max_runs} onChange={(v) => u({ max_runs: v ? parseInt(v) : undefined })} />
                </div>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Max Wickets" : "Max Balls Faced"}</SectionLabel>
                  {filters.stat_type === "bowl" ? (
                    <FilterInput type="number" placeholder="e.g. 100" value={filters.max_wickets} onChange={(v) => u({ max_wickets: v ? parseInt(v) : undefined })} />
                  ) : (
                    <FilterInput type="number" placeholder="e.g. 600" value={filters.max_balls} onChange={(v) => u({ max_balls: v ? parseInt(v) : undefined })} />
                  )}
                </div>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Min 4s Conceded" : "Min 4s Hit"}</SectionLabel>
                  <FilterInput type="number" placeholder="e.g. 10" value={filters.min_fours} onChange={(v) => u({ min_fours: v ? parseInt(v) : undefined })} />
                </div>
                <div>
                  <SectionLabel>{filters.stat_type === "bowl" ? "Min 6s Conceded" : "Min 6s Hit"}</SectionLabel>
                  <FilterInput type="number" placeholder="e.g. 5" value={filters.min_sixes} onChange={(v) => u({ min_sixes: v ? parseInt(v) : undefined })} />
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <SectionLabel>Performance Thresholds</SectionLabel>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 8 }}>Aggregates matches meeting these criteria</div>

            <SectionLabel>Team Score Target</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {[180, 200, 220].map(val => (
                <Chip 
                  key={val} 
                  label={`${val}+`} 
                  active={filters.score_threshold === val && filters.team_score_mode === 'scored'} 
                  onClick={() => u({ score_threshold: filters.score_threshold === val && filters.team_score_mode === 'scored' ? undefined : val, team_score_mode: 'scored' })} 
                />
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "100%", marginTop: 4 }}>
                <FilterInput type="number" placeholder="Min" value={filters.min_team_runs} onChange={(v) => u({ min_team_runs: v ? parseInt(v) : undefined })} />
                <FilterInput type="number" placeholder="Max" value={filters.max_team_runs} onChange={(v) => u({ max_team_runs: v ? parseInt(v) : undefined })} />
              </div>
            </div>

            <SectionLabel>Opp. Score Target</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {[180, 200, 220].map(val => (
                <Chip 
                  key={val} 
                  label={`${val}+`} 
                  active={filters.score_threshold === val && filters.team_score_mode === 'conceded'} 
                  onClick={() => u({ score_threshold: filters.score_threshold === val && filters.team_score_mode === 'conceded' ? undefined : val, team_score_mode: 'conceded' })} 
                />
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "100%", marginTop: 4 }}>
                <FilterInput type="number" placeholder="Min" value={filters.min_opp_runs} onChange={(v) => u({ min_opp_runs: v ? parseInt(v) : undefined })} />
                <FilterInput type="number" placeholder="Max" value={filters.max_opp_runs} onChange={(v) => u({ max_opp_runs: v ? parseInt(v) : undefined })} />
              </div>
            </div>

            <SectionLabel>Wickets Lost</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
              <FilterInput type="number" placeholder="Min" value={filters.min_team_wickets} onChange={(v) => u({ min_team_wickets: v ? parseInt(v) : undefined })} />
              <FilterInput type="number" placeholder="Max" value={filters.max_team_wickets} onChange={(v) => u({ max_team_wickets: v ? parseInt(v) : undefined })} />
            </div>

            <SectionLabel>Opp. Wickets</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
              <FilterInput type="number" placeholder="Min" value={filters.min_opp_wickets} onChange={(v) => u({ min_opp_wickets: v ? parseInt(v) : undefined })} />
              <FilterInput type="number" placeholder="Max" value={filters.max_opp_wickets} onChange={(v) => u({ max_opp_wickets: v ? parseInt(v) : undefined })} />
            </div>
          </div>
        </FilterGroup>

        {/* ── Date & Tournament ───────────────────────────── */}
        <FilterGroup id="date" icon="📅" label="Date & Tournament" count={dateCount}>
          <SectionLabel>Year range</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>From</div>
              <FilterInput type="number" placeholder="2008" value={filters.year_from} onChange={(v) => u({ year_from: v ? parseInt(v) : undefined })} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>To</div>
              <FilterInput type="number" placeholder="2026" value={filters.year_to} onChange={(v) => u({ year_to: v ? parseInt(v) : undefined })} />
            </div>
          </div>
          <SectionLabel>Exact Date Range</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
             <FilterInput type="date" placeholder="" value={filters.date_from} onChange={(v) => u({ date_from: v || undefined })} />
             <FilterInput type="date" placeholder="" value={filters.date_to} onChange={(v) => u({ date_to: v || undefined })} />
          </div>
          <SectionLabel>On This Day (Any Year)</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>Month</div>
              <FilterInput type="number" placeholder="MM (1-12)" value={filters.match_month} onChange={(v) => u({ match_month: v ? parseInt(v) : undefined })} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>Day</div>
              <FilterInput type="number" placeholder="DD (1-31)" value={filters.match_day} onChange={(v) => u({ match_day: v ? parseInt(v) : undefined })} />
            </div>
          </div>
          <SectionLabel>Tournament</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {availableTournaments.slice(0, 30).map((t) => (
              <Chip key={t} label={t} active={filters.tournaments.includes(t)} onClick={() => u({ tournaments: toggleArr(filters.tournaments, t) })} />
            ))}
          </div>
        </FilterGroup>

        {/* ── Partnerships & Momentum (V4) ────────────────── */}
        <FilterGroup id="momentum" icon="🤝" label="Partnerships & Momentum" count={(filters.partnership_number != null ? 1 : 0) + (filters.min_partnership_runs != null ? 1 : 0) + (filters.back_to_back_wickets ? 1 : 0)}>
           <SectionLabel>Partnership Filter</SectionLabel>
           <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>Wicket #</div>
                <FilterInput type="number" placeholder="1 = Opening" value={filters.partnership_number} onChange={(v) => u({ partnership_number: v ? parseInt(v) : undefined })} />
              </div>
              <div>
                <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 2 }}>Min Runs</div>
                <FilterInput type="number" placeholder="e.g. 50" value={filters.min_partnership_runs} onChange={(v) => u({ min_partnership_runs: v ? parseInt(v) : undefined })} />
              </div>
           </div>
           
           <SectionLabel>Bowling Momentum</SectionLabel>
           <div style={{ display: "flex", gap: 4 }}>
              <Chip 
                label="Back-to-Back Wickets" 
                active={filters.back_to_back_wickets} 
                onClick={() => u({ back_to_back_wickets: !filters.back_to_back_wickets })} 
                title="Filter for deliveries where a wicket fell and the previous ball was also a wicket"
              />
           </div>
        </FilterGroup>

        {/* ── Group & Display ─────────────────────────────── */}
        <FilterGroup id="grp" icon="⚙️" label="Group & Display" count={0} defaultOpen>
          <SectionLabel>Stat type</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
            {[
              { l: "Batting", v: "bat" }, 
              { l: "Bowling", v: "bowl" }, 
              { l: "Team Results", v: "team" }, 
              { l: "Team Batting", v: "team_bat" },
              { l: "Team Bowling", v: "team_bowl" },
              { l: "Team Bat vs Bowl", v: "team_compare" },
              { l: "Head-to-Head", v: "h2h" }
            ].map((s) => (
              <Chip key={s.v} label={s.l} active={filters.stat_type === s.v} onClick={() => {
                const patch: Partial<StatFilters> = { stat_type: s.v };
                // Group_by cleanup when toggling stat types
                if (s.v.startsWith("team") && (filters.group_by?.startsWith("player") || filters.group_by === "phase" || filters.group_by === "innings")) {
                  patch.group_by = "team";
                }
                if (!s.v.startsWith("team") && filters.group_by === "team" && s.v !== "h2h") {
                  patch.group_by = "player";
                }
                u(patch);
              }} />
            ))}
          </div>
          {filters.stat_type !== "h2h" && (
            <>
              <SectionLabel>Group results by</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[
                  { l: "Player", v: "player", hide: filters.stat_type.startsWith("team") }, 
                  { l: "Player by Year", v: "player_year", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by Team", v: "player_team", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by Opposition", v: "player_opposition", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by Venue", v: "player_venue", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by City", v: "player_city", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by Competition", v: "player_competition", hide: filters.stat_type.startsWith("team") },
                  { l: "Player by Stage", v: "player_match_stage", hide: filters.stat_type.startsWith("team") },
                  { l: "Individual Innings", v: "player_match", hide: filters.stat_type.startsWith("team") },
                  { l: "Achievement (Match)", v: "player_achievement_count", hide: filters.stat_type.startsWith("team") },
                  { l: "Achievement (Season)", v: "player_season_achievement_count", hide: filters.stat_type.startsWith("team") },
                  { l: "Team", v: "team" }, 
                  { l: "Venue", v: "venue" },
                  { l: "City", v: "city" },
                  { l: "Year", v: "year" }, 
                  { l: "Opposition", v: "opposition" }, 
                  { l: "Competition", v: "competition" },
                  { l: "Match Stage", v: "match_stage" },
                  { l: "Individual Matches", v: "match", hide: !filters.stat_type.startsWith("team") },
                  { l: "Innings", v: "innings", hide: filters.stat_type.startsWith("team") },
                  { l: "Phase", v: "phase", hide: filters.stat_type.startsWith("team") },
                ].filter(g => !g.hide).map((g) => (
                  <Chip key={g.v} label={g.l} active={filters.group_by === g.v} onClick={() => u({ group_by: g.v })} />
                ))}
              </div>
            </>
          )}
        </FilterGroup>

      </div>

      {/* Run & Reset buttons */}
      <div
        onClick={loading ? undefined : onRun}
        style={{
          margin: "8px 14px", padding: 9, background: loading ? C.high : C.green,
          borderRadius: 8, fontSize: 11, fontWeight: 800,
          color: loading ? C.muted : "#052e16", textAlign: "center",
          cursor: loading ? "not-allowed" : "pointer", flexShrink: 0, letterSpacing: ".02em",
          opacity: loading ? 0.6 : 1,
        }}
      >{loading ? "⟳ Querying…" : "▶ Run Query"}</div>
      <div
        onClick={onReset}
        style={{
          margin: "0 14px 10px", padding: 7, background: C.high,
          border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 10,
          color: C.muted, textAlign: "center", cursor: "pointer", flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = "rgba(255,107,107,0.3)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
      >↺ Reset all filters</div>
    </div>
  );
}
