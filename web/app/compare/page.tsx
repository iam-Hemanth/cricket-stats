"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import api, {
  type BattingStats,
  type BowlingStats,
  type PartnershipStats,
  type PlayerSearchResult,
  type PlayerPhasesResponse,
  type PlayerForm,
  type PlayerVenueSplitsResponse,
  type PlayerVenueSplit,
} from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import TabGroup from "@/components/ui/TabGroup";
import Badge from "@/components/ui/Badge";
import SearchBarWithCallback from "@/components/SearchBarWithCallback";

type SelectedPlayer = {
  player_id: string;
  name: string;
};

type CompareFormat = "All" | "Test" | "ODI" | "T20I" | "IPL" | "T20";

const FORMAT_LABELS: Record<CompareFormat, string> = {
  All: "All Formats",
  Test: "Tests",
  ODI: "ODIs",
  T20I: "T20Is",
  IPL: "IPL",
  T20: "All T20s",
};

type BattingTotals = {
  matches: number;
  innings: number;
  runs: number;
  average: number | null;
  strikeRate: number | null;
  highest: number;
  fifties: number;
  hundreds: number;
  ducks: number;
};

type BowlingTotals = {
  innings: number;
  wickets: number;
  runs: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
  fiveW: number;
  tenWM: number;
};


const TAB_ORDER: CompareFormat[] = ["All", "Test", "ODI", "T20I", "IPL", "T20"];
const IPL_COMPETITION = "Indian Premier League";
const DOMESTIC_T20_LEAGUES = ["SA20", "The Hundred Men's Competition", "International League T20", "Major League Cricket"];

function normalizeFormat(raw: string | null): CompareFormat {
  if (!raw) return "All";
  const value = raw.toUpperCase();
  if (value === "ALL") return "All";
  if (value === "IPL") return "IPL";
  if (value === "T20I" || value === "IT20") return "T20I";
  if (value === "T20") return "T20";
  if (value === "ODI") return "ODI";
  if (value === "TEST") return "Test";
  return "All";
}

function playerVirtualFormat(row: { format: string; competition_name: string | null }): CompareFormat | null {
  if (row.format === "IT20" || row.format === "T20I") return "T20I";
  if (row.format === "T20") {
    if (row.competition_name === IPL_COMPETITION) return "IPL";
    if (row.competition_name && DOMESTIC_T20_LEAGUES.includes(row.competition_name)) return "T20";
    return "T20I";
  }
  if (row.format === "ODI") return "ODI";
  if (row.format === "Test") return "Test";
  return null;
}

function rowMatchesFormat(
  row: { format: string; competition_name: string | null },
  format: CompareFormat
): boolean {
  if (format === "All") return true;
  if (format === "T20") return row.format === "T20" || row.format === "IT20" || row.format === "T20I";
  if (format === "IPL") return row.format === "T20" && row.competition_name === IPL_COMPETITION;
  if (format === "T20I") return row.format === "IT20" || row.format === "T20I" || (row.format === "T20" && row.competition_name !== IPL_COMPETITION && !(row.competition_name && DOMESTIC_T20_LEAGUES.includes(row.competition_name)));
  if (format === "ODI") return row.format === "ODI";
  if (format === "Test") return row.format === "Test";
  return false;
}

function formatLabelForMessage(format: CompareFormat): string {
  return format === "All" ? "career" : FORMAT_LABELS[format];
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatMetric(value: number | null, digits = 2): string {
  if (value === null) return "-";
  return value.toFixed(digits);
}

function aggregateBatting(rows: BattingStats[]): BattingTotals | null {
  if (rows.length === 0) return null;

  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  const balls = rows.reduce((sum, row) => sum + row.balls_faced, 0);

  let dismissals = 0;
  for (const row of rows) {
    if (row.average && row.average > 0) {
      dismissals += Math.round(row.runs / row.average);
    }
  }

  return {
    matches: rows.reduce((sum, row) => sum + row.matches, 0),
    innings: rows.reduce((sum, row) => sum + row.innings, 0),
    runs,
    average: dismissals > 0 ? runs / dismissals : null,
    strikeRate: balls > 0 ? (runs * 100) / balls : null,
    highest: Math.max(...rows.map((row) => row.highest_score)),
    fifties: rows.reduce((sum, row) => sum + row.fifties, 0),
    hundreds: rows.reduce((sum, row) => sum + row.hundreds, 0),
    ducks: rows.reduce((sum, row) => sum + row.ducks, 0),
  };
}

function aggregateBowling(rows: BowlingStats[]): BowlingTotals | null {
  if (rows.length === 0) return null;

  const wickets = rows.reduce((sum, row) => sum + row.wickets, 0);
  const runs = rows.reduce((sum, row) => sum + row.runs_conceded, 0);
  let balls = 0;

  for (const row of rows) {
    if (row.economy && row.economy > 0) {
      balls += Math.round((row.runs_conceded / row.economy) * 6);
    }
  }

  return {
    innings: rows.reduce((sum, row) => sum + row.innings_bowled, 0),
    wickets,
    runs,
    economy: balls > 0 ? (runs / balls) * 6 : null,
    average: wickets > 0 ? runs / wickets : null,
    strikeRate: wickets > 0 && balls > 0 ? balls / wickets : null,
    fiveW: rows.reduce((sum, row) => sum + (row.five_w || 0), 0),
    tenWM: rows.reduce((sum, row) => sum + (row.ten_w || 0), 0),
  };
}


function betterClass(
  left: number | null,
  right: number | null,
  preference: "higher" | "lower",
  side: "left" | "right"
): string {
  if (left === null || right === null || left === right) return "";

  const leftBetter = preference === "higher" ? left > right : left < right;
  if (side === "left" && leftBetter) return "text-[var(--accent-green)] font-semibold";
  if (side === "right" && !leftBetter) return "text-[var(--accent-green)] font-semibold";
  return "";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function ClashHeroCard({
  player1,
  player2,
  batting1,
  batting2,
  bowling1,
  bowling2,
  battingTotals1,
  battingTotals2,
  bowlingTotals1,
  bowlingTotals2,
  format,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  batting1: BattingStats[];
  batting2: BattingStats[];
  bowling1: BowlingStats[];
  bowling2: BowlingStats[];
  battingTotals1: BattingTotals | null;
  battingTotals2: BattingTotals | null;
  bowlingTotals1: BowlingTotals | null;
  bowlingTotals2: BowlingTotals | null;
  format: CompareFormat;
}) {
  const getPlayerMeta = (batting: BattingStats[], bowling: BowlingStats[]) => {
    const years = [...batting.map(r => r.year), ...bowling.map(r => r.year)];
    const activeRange = years.length > 0 ? `Active ${Math.min(...years)}–${Math.max(...years)}` : "No active data";
    const totalBatRuns = batting.reduce((sum, r) => sum + r.runs, 0);
    const totalWickets = bowling.reduce((sum, r) => sum + r.wickets, 0);
    
    let role = "All-rounder";
    if (totalBatRuns > 1000 && totalWickets < 10) role = "Batter";
    else if (totalWickets > 30 && totalBatRuns < 300) role = "Bowler";
    
    return { activeRange, role };
  };

  const p1Meta = getPlayerMeta(batting1, bowling1);
  const p2Meta = getPlayerMeta(batting2, bowling2);

  const r1 = battingTotals1?.runs ?? 0;
  const r2 = battingTotals2?.runs ?? 0;
  const totalRuns = r1 + r2 || 1;
  const batPct1 = Math.round((r1 / totalRuns) * 100);
  const batPct2 = 100 - batPct1;
  const batDiff = Math.abs(r1 - r2);
  const batLeader = r1 > r2 ? player1.name : player2.name;
  const batColor = r1 > r2 ? "text-[var(--accent-green)]" : "text-[var(--accent-gold)]";

  const w1 = bowlingTotals1?.wickets ?? 0;
  const w2 = bowlingTotals2?.wickets ?? 0;
  const totalWickets = w1 + w2 || 1;
  const bowlPct1 = Math.round((w1 / totalWickets) * 100);
  const bowlPct2 = 100 - bowlPct1;
  const bowlDiff = Math.abs(w1 - w2);
  const bowlLeader = w1 > w2 ? player1.name : player2.name;
  const bowlColor = w1 > w2 ? "text-[var(--accent-green)]" : "text-[var(--accent-gold)]";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-6 reveal shadow-xl before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_40%_80%_at_15%_50%,rgba(75,226,119,0.06)_0%,transparent_60%),radial-gradient(ellipse_40%_80%_at_85%_50%,rgba(255,185,95,0.06)_0%,transparent_60%)] before:pointer-events-none">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        {/* Player 1 Details */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] text-[16px] font-mono font-black text-[var(--accent-green)] shrink-0 shadow-[0_0_15px_rgba(75,226,119,0.1)]">
            {getInitials(player1.name)}
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)] leading-none truncate">{player1.name}</h2>
            <div className="text-[10px] font-mono text-[var(--text-muted)]">{p1Meta.activeRange}</div>
            <div className="flex gap-1.5 flex-wrap">
              <span className="rounded bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-green)] font-semibold">{p1Meta.role}</span>
              <span className="rounded bg-[var(--bg-card)] border border-[var(--glass-border)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--text-secondary)]">{battingTotals1?.matches ?? 0} matches</span>
            </div>
          </div>
        </div>

        {/* VS Middle */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-card-hover)] border border-[var(--glass-border)] text-[10px] font-mono font-bold text-[var(--text-muted)]">VS</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{format === "All" ? "All Formats" : format}</div>
        </div>

        {/* Player 2 Details */}
        <div className="flex items-center gap-4 flex-row-reverse text-right min-w-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(255,185,95,0.08)] border border-[rgba(255,185,95,0.2)] text-[16px] font-mono font-black text-[var(--accent-gold)] shrink-0 shadow-[0_0_15px_rgba(255,185,95,0.1)]">
            {getInitials(player2.name)}
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)] leading-none truncate">{player2.name}</h2>
            <div className="text-[10px] font-mono text-[var(--text-muted)]">{p2Meta.activeRange}</div>
            <div className="flex gap-1.5 flex-wrap justify-end">
              <span className="rounded bg-[rgba(255,185,95,0.08)] border border-[rgba(255,185,95,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-gold)] font-semibold">{p2Meta.role}</span>
              <span className="rounded bg-[var(--bg-card)] border border-[var(--glass-border)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--text-secondary)]">{battingTotals2?.matches ?? 0} matches</span>
            </div>
          </div>
        </div>
      </div>

      {/* Batting Label Row */}
      <div className="mt-6 grid grid-cols-[1fr_60px_1fr] border-t border-[var(--glass-border)] pt-4 items-center">
        <div className="flex items-center gap-2 pl-2">
          <span className="rounded bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-green)] uppercase tracking-wider font-bold">🏏 Batting</span>
        </div>
        <div className="text-center"></div>
        <div className="flex items-center gap-2 justify-end pr-2">
          <span className="rounded bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-green)] uppercase tracking-wider font-bold">🏏 Batting</span>
        </div>
      </div>

      {/* Batting KPI Grid */}
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_60px_1fr_1fr_1fr] border-b border-[var(--glass-border)] pb-4">
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{r1 ? r1.toLocaleString("en-IN") : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Runs</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{battingTotals1?.average ? battingTotals1.average.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Average</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{battingTotals1?.strikeRate ? battingTotals1.strikeRate.toFixed(1) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">SR</div>
        </div>

        <div className="flex items-center justify-center bg-[var(--bg-card-hover)] border-x border-[var(--glass-border)] h-full text-[9px] font-mono font-semibold text-[var(--text-muted)] tracking-widest py-2" style={{ writingMode: "vertical-rl" }}>
          BAT
        </div>

        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{battingTotals2?.strikeRate ? battingTotals2.strikeRate.toFixed(1) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">SR</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{battingTotals2?.average ? battingTotals2.average.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Average</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{r2 ? r2.toLocaleString("en-IN") : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Runs</div>
        </div>
      </div>

      {/* Bowling Label Row */}
      <div className="mt-4 grid grid-cols-[1fr_60px_1fr] items-center">
        <div className="flex items-center gap-2 pl-2">
          <span className="rounded bg-[rgba(59,158,255,0.08)] border border-[rgba(59,158,255,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-blue)] uppercase tracking-wider font-bold">🔴 Bowling</span>
        </div>
        <div className="text-center"></div>
        <div className="flex items-center gap-2 justify-end pr-2">
          <span className="rounded bg-[rgba(59,158,255,0.08)] border border-[rgba(59,158,255,0.2)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-blue)] uppercase tracking-wider font-bold">🔴 Bowling</span>
        </div>
      </div>

      {/* Bowling KPI Grid */}
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_60px_1fr_1fr_1fr] border-b border-[var(--glass-border)] pb-4">
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{w1 ? w1.toLocaleString("en-IN") : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Wickets</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{bowlingTotals1?.average ? bowlingTotals1.average.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Average</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-green)]">{bowlingTotals1?.economy ? bowlingTotals1.economy.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Economy</div>
        </div>

        <div className="flex items-center justify-center bg-[var(--bg-card-hover)] border-x border-[var(--glass-border)] h-full text-[9px] font-mono font-semibold text-[var(--text-muted)] tracking-widest py-2" style={{ writingMode: "vertical-rl" }}>
          BOWL
        </div>

        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{bowlingTotals2?.economy ? bowlingTotals2.economy.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Economy</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{bowlingTotals2?.average ? bowlingTotals2.average.toFixed(2) : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Average</div>
        </div>
        <div className="text-center relative">
          <div className="text-base font-mono font-bold text-[var(--accent-gold)]">{w2 ? w2.toLocaleString("en-IN") : "-"}</div>
          <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider mt-1">Wickets</div>
        </div>
      </div>

      {/* Advantage Bars */}
      <div className="mt-4 flex flex-col gap-3 px-2">
        {/* Batting Adv Bar */}
        <div className="flex items-center gap-3">
          <span className="rounded bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] px-1 py-0.5 text-[8px] font-mono text-[var(--accent-green)] font-bold shrink-0">BAT</span>
          <span className="text-[10px] font-mono font-bold text-[var(--accent-green)] w-8">{getInitials(player1.name)}</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden flex border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--glass-border)" }}>
            <div className="h-full transition-all duration-500" style={{ width: `${batPct1}%`, backgroundColor: "var(--accent-green)" }}></div>
            <div className="h-full transition-all duration-500" style={{ width: `${batPct2}%`, backgroundColor: "var(--accent-gold)" }}></div>
          </div>
          <span className="text-[10px] font-mono font-bold text-[var(--accent-gold)] w-8 text-right">{getInitials(player2.name)}</span>
          <span className="text-[9px] font-mono text-[var(--text-secondary)] min-w-[210px] text-right">
            Bat Edge: <span className={`${batColor} font-bold`}>{batLeader}</span> leads by {batDiff.toLocaleString("en-IN")} runs
          </span>
        </div>

        {/* Bowling Adv Bar */}
        <div className="flex items-center gap-3">
          <span className="rounded bg-[rgba(59,158,255,0.08)] border border-[rgba(59,158,255,0.2)] px-1 py-0.5 text-[8px] font-mono text-[var(--accent-blue)] font-bold shrink-0">BOWL</span>
          <span className="text-[10px] font-mono font-bold text-[var(--accent-green)] w-8">{getInitials(player1.name)}</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden flex border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--glass-border)" }}>
            <div className="h-full transition-all duration-500" style={{ width: `${bowlPct1}%`, backgroundColor: "var(--accent-green)" }}></div>
            <div className="h-full transition-all duration-500" style={{ width: `${bowlPct2}%`, backgroundColor: "var(--accent-gold)" }}></div>
          </div>
          <span className="text-[10px] font-mono font-bold text-[var(--accent-gold)] w-8 text-right">{getInitials(player2.name)}</span>
          <span className="text-[9px] font-mono text-[var(--text-secondary)] min-w-[210px] text-right">
            Bowl Edge: <span className={`${bowlColor} font-bold`}>{bowlLeader}</span> leads by {bowlDiff.toLocaleString("en-IN")} wkts
          </span>
        </div>
      </div>
    </div>
  );
}

function DBCRow({
  label,
  v1,
  v2,
  higherIsBetter = true,
}: {
  label: string;
  v1: number | string | null;
  v2: number | string | null;
  higherIsBetter?: boolean;
}) {
  const parseNum = (s: any) => {
    if (s === null || s === undefined) return 0;
    return parseFloat(String(s).replace(/[^0-9.]/g, "")) || 0;
  };
  const n1 = parseNum(v1);
  const n2 = parseNum(v2);
  const maxVal = Math.max(n1, n2) || 1;
  
  const pct1 = Math.min(100, Math.round((n1 / maxVal) * 100));
  const pct2 = Math.min(100, Math.round((n2 / maxVal) * 100));
  
  let winner: 0 | 1 | 2 = 0;
  if (n1 !== n2 && v1 !== "-" && v2 !== "-") {
    if (higherIsBetter) winner = n1 > n2 ? 1 : 2;
    else winner = n1 < n2 ? 1 : 2;
  }
  
  return (
    <div className="grid grid-cols-[1fr_110px_1fr] items-center py-3 px-4 border-b border-[rgba(255,255,255,0.03)] last:border-b-0 hover:bg-[rgba(255,255,255,0.01)] transition">
      {/* Left Player Bar */}
      <div className="flex items-center justify-end gap-3">
        {winner === 1 && <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--accent-green)" }}></div>}
        <span className={`font-mono text-xs text-[var(--text-secondary)]`} style={winner === 1 ? { color: "var(--accent-green)", fontWeight: "bold" } : {}}>{v1 ?? "-"}</span>
        <div className="h-1 rounded-full overflow-hidden w-24 shrink-0 flex justify-end" style={{ backgroundColor: "var(--bg-card-hover)" }}>
          <div className="h-full transition-all duration-500" style={{ width: `${pct1}%`, backgroundColor: "var(--accent-green)" }}></div>
        </div>
      </div>

      {/* Center Label */}
      <div className="text-center font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</div>

      {/* Right Player Bar */}
      <div className="flex items-center gap-3">
        <div className="h-1 rounded-full overflow-hidden w-24 shrink-0" style={{ backgroundColor: "var(--bg-card-hover)" }}>
          <div className="h-full transition-all duration-500" style={{ width: `${pct2}%`, backgroundColor: "var(--accent-gold)" }}></div>
        </div>
        <span className={`font-mono text-xs text-[var(--text-secondary)]`} style={winner === 2 ? { color: "var(--accent-gold)", fontWeight: "bold" } : {}}>{v2 ?? "-"}</span>
        {winner === 2 && <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--accent-gold)" }}></div>}
      </div>
    </div>
  );
}

function StatComparisonBars({
  player1,
  player2,
  batting1,
  batting2,
  bowling1,
  bowling2,
  format,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  batting1: BattingTotals | null;
  batting2: BattingTotals | null;
  bowling1: BowlingTotals | null;
  bowling2: BowlingTotals | null;
  format: CompareFormat;
}) {
  return (
    <section className="reveal">
      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
        <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">01</span>
        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Career Stats Comparison</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
        <span className="font-mono text-[9px] text-[var(--text-muted)]">{format === "All" ? "All Formats" : format}</span>
      </div>

      <div className="flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-md">
        {/* Batting Section Header */}
        <div className="grid grid-cols-[1fr_110px_1fr] bg-[var(--bg-card-hover)] border-b border-[var(--glass-border)] py-2 px-4 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-green)] font-bold">
          <span>🏏 Batting</span>
          <span className="text-center text-[var(--text-muted)]">Stat</span>
          <span className="text-right">🏏 Batting</span>
        </div>
        <DBCRow label="Runs" v1={batting1?.runs ?? 0} v2={batting2?.runs ?? 0} />
        <DBCRow label="Average" v1={batting1?.average ? batting1.average.toFixed(2) : "-"} v2={batting2?.average ? batting2.average.toFixed(2) : "-"} />
        <DBCRow label="Strike Rate" v1={batting1?.strikeRate ? batting1.strikeRate.toFixed(1) : "-"} v2={batting2?.strikeRate ? batting2.strikeRate.toFixed(1) : "-"} />
        <DBCRow label="50s" v1={batting1?.fifties ?? 0} v2={batting2?.fifties ?? 0} />
        <DBCRow label="100s" v1={batting1?.hundreds ?? 0} v2={batting2?.hundreds ?? 0} />
        <DBCRow label="Innings" v1={batting1?.innings ?? 0} v2={batting2?.innings ?? 0} higherIsBetter={false} />
        <DBCRow label="High Score" v1={batting1?.highest ?? 0} v2={batting2?.highest ?? 0} />

        {/* Bowling Section Header */}
        <div className="grid grid-cols-[1fr_110px_1fr] bg-[var(--bg-card-hover)] border-t border-b border-[var(--glass-border)] py-2 px-4 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-blue)] font-bold mt-2">
          <span>🔴 Bowling</span>
          <span className="text-center text-[var(--text-muted)]">Stat</span>
          <span className="text-right">🔴 Bowling</span>
        </div>
        <DBCRow label="Wickets" v1={bowling1?.wickets ?? 0} v2={bowling2?.wickets ?? 0} />
        <DBCRow label="Economy" v1={bowling1?.economy ? bowling1.economy.toFixed(2) : "-"} v2={bowling2?.economy ? bowling2.economy.toFixed(2) : "-"} higherIsBetter={false} />
        <DBCRow label="Average" v1={bowling1?.average ? bowling1.average.toFixed(2) : "-"} v2={bowling2?.average ? bowling2.average.toFixed(2) : "-"} higherIsBetter={false} />
        <DBCRow label="Strike Rate" v1={bowling1?.strikeRate ? bowling1.strikeRate.toFixed(1) : "-"} v2={bowling2?.strikeRate ? bowling2.strikeRate.toFixed(1) : "-"} higherIsBetter={false} />
        <DBCRow label="5-wkt hauls" v1={bowling1?.fiveW ?? 0} v2={bowling2?.fiveW ?? 0} />
        <DBCRow label="10-wkt matches" v1={bowling1?.tenWM ?? 0} v2={bowling2?.tenWM ?? 0} />
      </div>
    </section>
  );
}

function BattingComparisonTable({
  player1,
  player2,
  left,
  right,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  left: BattingTotals | null;
  right: BattingTotals | null;
}) {
  const renderRow = (label: string, k1: any, k2: any, higherIsBetter = true) => {
    const v1 = k1 ?? "-";
    const v2 = k2 ?? "-";
    const n1 = parseFloat(String(v1).replace(/[^0-9.]/g, "")) || 0;
    const n2 = parseFloat(String(v2).replace(/[^0-9.]/g, "")) || 0;
    
    let win = 0;
    if (n1 !== n2 && v1 !== "-" && v2 !== "-") {
      if (higherIsBetter) win = n1 > n2 ? 1 : 2;
      else win = n1 < n2 ? 1 : 2;
    }
    return (
      <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-[rgba(255,255,255,0.03)] last:border-b-0 py-2.5 px-4 text-xs font-mono items-center hover:bg-[rgba(255,255,255,0.01)] transition">
        <span className="text-[var(--text-secondary)] font-sans">{label}</span>
        <span className={`text-right ${win === 1 ? "text-[var(--accent-green)] font-bold" : "text-[var(--text-muted)]"}`}>
          {win === 1 && "✦ "}{typeof v1 === "number" && v1 % 1 !== 0 ? v1.toFixed(2) : v1.toLocaleString()}
        </span>
        <span className={`text-right ${win === 2 ? "text-[var(--accent-gold)] font-bold" : "text-[var(--text-muted)]"}`}>
          {win === 2 && "✦ "}{typeof v2 === "number" && v2 % 1 !== 0 ? v2.toFixed(2) : v2.toLocaleString()}
        </span>
      </div>
    );
  };

  return (
    <section className="reveal">
      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
        <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">02</span>
        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Batting Card</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-md">
        <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-[var(--bg-card-hover)] border-b border-[var(--glass-border)] py-2.5 px-4 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
          <span>Stat</span>
          <span className="text-right text-[var(--accent-green)]">{player1.name}</span>
          <span className="text-right text-[var(--accent-gold)]">{player2.name}</span>
        </div>
        {renderRow("Matches", left?.matches, right?.matches)}
        {renderRow("Innings", left?.innings, right?.innings)}
        {renderRow("Runs", left?.runs, right?.runs)}
        {renderRow("Average", left?.average, right?.average)}
        {renderRow("Strike Rate", left?.strikeRate, right?.strikeRate)}
        {renderRow("Highest Score", left?.highest, right?.highest)}
        {renderRow("50s", left?.fifties, right?.fifties)}
        {renderRow("100s", left?.hundreds, right?.hundreds)}
        {renderRow("Ducks", left?.ducks, right?.ducks, false)}
      </div>
    </section>
  );
}

function BowlingComparisonTable({
  player1,
  player2,
  left,
  right,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  left: BowlingTotals | null;
  right: BowlingTotals | null;
}) {
  const renderRow = (label: string, k1: any, k2: any, higherIsBetter = true) => {
    const v1 = k1 ?? "-";
    const v2 = k2 ?? "-";
    const n1 = parseFloat(String(v1).replace(/[^0-9.]/g, "")) || 0;
    const n2 = parseFloat(String(v2).replace(/[^0-9.]/g, "")) || 0;
    
    let win = 0;
    if (n1 !== n2 && v1 !== "-" && v2 !== "-") {
      if (higherIsBetter) win = n1 > n2 ? 1 : 2;
      else win = n1 < n2 ? 1 : 2;
    }
    return (
      <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-[rgba(255,255,255,0.03)] last:border-b-0 py-2.5 px-4 text-xs font-mono items-center hover:bg-[rgba(255,255,255,0.01)] transition">
        <span className="text-[var(--text-secondary)] font-sans">{label}</span>
        <span className={`text-right ${win === 1 ? "text-[var(--accent-green)] font-bold" : "text-[var(--text-muted)]"}`}>
          {win === 1 && "✦ "}{typeof v1 === "number" && v1 % 1 !== 0 ? v1.toFixed(2) : v1.toLocaleString()}
        </span>
        <span className={`text-right ${win === 2 ? "text-[var(--accent-gold)] font-bold" : "text-[var(--text-muted)]"}`}>
          {win === 2 && "✦ "}{typeof v2 === "number" && v2 % 1 !== 0 ? v2.toFixed(2) : v2.toLocaleString()}
        </span>
      </div>
    );
  };

  return (
    <section className="reveal">
      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
        <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">03</span>
        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Bowling Card</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-md">
        <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-[var(--bg-card-hover)] border-b border-[var(--glass-border)] py-2.5 px-4 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
          <span>Stat</span>
          <span className="text-right text-[var(--accent-green)]">{player1.name}</span>
          <span className="text-right text-[var(--accent-gold)]">{player2.name}</span>
        </div>
        {renderRow("Innings", left?.innings, right?.innings)}
        {renderRow("Wickets", left?.wickets, right?.wickets)}
        {renderRow("Runs Conceded", left?.runs, right?.runs, false)}
        {renderRow("Economy", left?.economy, right?.economy, false)}
        {renderRow("Average", left?.average, right?.average, false)}
        {renderRow("Strike Rate", left?.strikeRate, right?.strikeRate, false)}
      </div>
    </section>
  );
}

function PlayerPicker({
  label,
  selected,
  placeholder,
  onSelect,
  onClear,
}: {
  label: string;
  selected: SelectedPlayer | null;
  placeholder: string;
  onSelect: (player: SelectedPlayer) => void;
  onClear: () => void;
}) {
  if (selected) {
    return (
      <div className="glass-card rounded-xl p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--glass-border)] px-3 py-2">
          <Avatar name={selected.name} size="sm" />
          <span className="flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{selected.name}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-[var(--text-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
            aria-label={`Clear ${label}`}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <SearchBarWithCallback
        onSelect={(id, name) => onSelect({ player_id: id, name })}
        placeholder={placeholder}
        variant={label === "Player 1" ? "batter" : "bowler"}
      />
    </div>
  );
}

function PhaseRow({ label, val1, val2 }: { label: string; val1: string; val2: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[rgba(255,255,255,0.03)] last:border-0">
      <span className="text-[10px] font-mono text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <span className="font-bold text-[var(--accent-green)]">{val1}</span>
        <span className="text-[var(--text-muted)]/50">/</span>
        <span className="font-bold text-[var(--accent-gold)]">{val2}</span>
      </div>
    </div>
  );
}

function ComparePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [player1, setPlayer1] = useState<SelectedPlayer | null>(null);
  const [player2, setPlayer2] = useState<SelectedPlayer | null>(null);
  const [format, setFormat] = useState<CompareFormat>("All");
  const [seasonTab, setSeasonTab] = useState<"runs" | "wickets">("runs");

  const [batting1, setBatting1] = useState<BattingStats[]>([]);
  const [batting2, setBatting2] = useState<BattingStats[]>([]);
  const [bowling1, setBowling1] = useState<BowlingStats[]>([]);
  const [bowling2, setBowling2] = useState<BowlingStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [partnershipRows, setPartnershipRows] = useState<PartnershipStats[]>([]);

  const [phases1, setPhases1] = useState<PlayerPhasesResponse | null>(null);
  const [phases2, setPhases2] = useState<PlayerPhasesResponse | null>(null);
  const [venueSplits1, setVenueSplits1] = useState<PlayerVenueSplitsResponse | null>(null);
  const [venueSplits2, setVenueSplits2] = useState<PlayerVenueSplitsResponse | null>(null);
  const [form1, setForm1] = useState<PlayerForm | null>(null);
  const [form2, setForm2] = useState<PlayerForm | null>(null);


  useEffect(() => {
    const qpPlayer1 = searchParams.get("player1")?.trim() ?? "";
    const qpPlayer2 = searchParams.get("player2")?.trim() ?? "";
    const qpFormat = normalizeFormat(searchParams.get("format"));

    setPlayer1((prev) => {
      if (!qpPlayer1) return null;
      if (prev && prev.player_id === qpPlayer1) return prev;
      return { player_id: qpPlayer1, name: qpPlayer1 };
    });

    setPlayer2((prev) => {
      if (!qpPlayer2) return null;
      if (prev && prev.player_id === qpPlayer2) return prev;
      return { player_id: qpPlayer2, name: qpPlayer2 };
    });

    setFormat(qpFormat);
  }, [searchParams]);

  useEffect(() => {
    const resolveName = async (
      current: SelectedPlayer | null,
      setter: React.Dispatch<React.SetStateAction<SelectedPlayer | null>>
    ) => {
      if (!current || current.name !== current.player_id) return;
      try {
        const results = await api.searchPlayers(current.player_id);
        const match = results.find((player) => player.player_id === current.player_id);
        if (match) {
          setter({ player_id: match.player_id, name: match.name });
        }
      } catch {
        // Keep fallback player_id label when search cannot resolve.
      }
    };

    void resolveName(player1, setPlayer1);
    void resolveName(player2, setPlayer2);
  }, [player1, player2]);

  useEffect(() => {
    const qp = new URLSearchParams();
    if (player1?.player_id) qp.set("player1", player1.player_id);
    if (player2?.player_id) qp.set("player2", player2.player_id);
    if (format !== "All") qp.set("format", format);

    const next = qp.toString();
    const current = searchParams.toString();
    if (next === current) return;

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [player1?.player_id, player2?.player_id, format, pathname, router, searchParams]);

  useEffect(() => {
    const loadStats = async () => {
      if (!player1 || !player2) {
        setBatting1([]);
        setBatting2([]);
        setBowling1([]);
        setBowling2([]);
        return;
      }

      setLoadingStats(true);
      try {
        const [b1, b2, bw1, bw2] = await Promise.all([
          api.getPlayerBatting(player1.player_id),
          api.getPlayerBatting(player2.player_id),
          api.getPlayerBowling(player1.player_id),
          api.getPlayerBowling(player2.player_id),
        ]);

        setBatting1(b1);
        setBatting2(b2);
        setBowling1(bw1);
        setBowling2(bw2);

        if (b1[0]?.player_name && player1.name === player1.player_id) {
          setPlayer1({ player_id: player1.player_id, name: b1[0].player_name });
        }
        if (b2[0]?.player_name && player2.name === player2.player_id) {
          setPlayer2({ player_id: player2.player_id, name: b2[0].player_name });
        }
      } catch {
        setBatting1([]);
        setBatting2([]);
        setBowling1([]);
        setBowling2([]);
      } finally {
        setLoadingStats(false);
      }
    };

    void loadStats();
  }, [player1, player2]);

  useEffect(() => {
    const loadPartnership = async () => {
      if (!player1 || !player2 || loadingStats) {
        if (!player1 || !player2) {
          setPartnershipRows([]);
        }
        return;
      }

      try {
        const rows = await api.getPlayerPartnerships(player1.player_id);
        const filtered = rows.filter((row) => row.partner_id === player2.player_id);
        setPartnershipRows(filtered);
      } catch {
        setPartnershipRows([]);
      }
    };

    void loadPartnership();
  }, [player1, player2, loadingStats]);

  useEffect(() => {
    const loadExtraStats = async () => {
      if (!player1 || !player2 || loadingStats) {
        if (!player1 || !player2) {
          setPhases1(null);
          setPhases2(null);
          setVenueSplits1(null);
          setVenueSplits2(null);
          setForm1(null);
          setForm2(null);
        }
        return;
      }
      try {
        const fmtParam = format === "All" ? undefined : format;
        if (format === "Test") {
          const [v1, v2, f1, f2] = await Promise.all([
            api.getPlayerVenueSplits(player1.player_id, fmtParam),
            api.getPlayerVenueSplits(player2.player_id, fmtParam),
            api.getPlayerForm(player1.player_id, fmtParam),
            api.getPlayerForm(player2.player_id, fmtParam),
          ]);
          setPhases1(null);
          setPhases2(null);
          setVenueSplits1(v1);
          setVenueSplits2(v2);
          setForm1(f1);
          setForm2(f2);
        } else {
          const [p1, p2, f1, f2] = await Promise.all([
            api.getPlayerPhases(player1.player_id, fmtParam),
            api.getPlayerPhases(player2.player_id, fmtParam),
            api.getPlayerForm(player1.player_id, fmtParam),
            api.getPlayerForm(player2.player_id, fmtParam),
          ]);
          setPhases1(p1);
          setPhases2(p2);
          setVenueSplits1(null);
          setVenueSplits2(null);
          setForm1(f1);
          setForm2(f2);
        }
      } catch {
        setPhases1(null);
        setPhases2(null);
        setVenueSplits1(null);
        setVenueSplits2(null);
        setForm1(null);
        setForm2(null);
      }
    };
    void loadExtraStats();
  }, [player1, player2, format, loadingStats]);

  const availableFormats = useMemo<CompareFormat[]>(() => {
    const set = new Set<CompareFormat>();
    const allRows = [...batting1, ...batting2, ...bowling1, ...bowling2];
    for (const row of allRows) {
      const mapped = playerVirtualFormat(row);
      if (mapped) set.add(mapped);
    }
    if (set.has("IPL") || set.has("T20I") || set.has("T20")) {
      set.add("T20");
    }

    const ordered = TAB_ORDER.filter((tab) => tab !== "All" && set.has(tab));
    return ["All", ...ordered];
  }, [batting1, batting2, bowling1, bowling2]);

  useEffect(() => {
    if (format !== "All" && !availableFormats.includes(format)) {
      setFormat("All");
    }
  }, [availableFormats, format]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
          }
        });
      },
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [player1, player2, format, phases1, venueSplits1, form1]);

  const filteredBatting1 = useMemo(
    () => batting1.filter((row) => rowMatchesFormat(row, format)),
    [batting1, format]
  );
  const filteredBatting2 = useMemo(
    () => batting2.filter((row) => rowMatchesFormat(row, format)),
    [batting2, format]
  );
  const filteredBowling1 = useMemo(
    () => bowling1.filter((row) => rowMatchesFormat(row, format)),
    [bowling1, format]
  );
  const filteredBowling2 = useMemo(
    () => bowling2.filter((row) => rowMatchesFormat(row, format)),
    [bowling2, format]
  );

  const battingTotals1 = useMemo(() => aggregateBatting(filteredBatting1), [filteredBatting1]);
  const battingTotals2 = useMemo(() => aggregateBatting(filteredBatting2), [filteredBatting2]);
  const bowlingTotals1 = useMemo(() => aggregateBowling(filteredBowling1), [filteredBowling1]);
  const bowlingTotals2 = useMemo(() => aggregateBowling(filteredBowling2), [filteredBowling2]);

  const hasBowlingData = bowling1.length > 0 || bowling2.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-4 stadium-bg min-h-screen">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--accent-green)] transition">Home</Link>
        <span>›</span>
        <span className="text-[var(--text-secondary)]">Player Comparison</span>
      </div>

      {/* Header */}
      <div className="reveal animate-fade-in">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-3xl">
          Player Comparison
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1 font-light">
          Compare two players side by side across batting, bowling, phases, and partnerships
        </p>
      </div>

      {/* Player selectors */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-sm:grid-cols-1 max-sm:gap-4 reveal">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface)] px-4 py-3 shadow-[0_0_15px_rgba(75,226,119,0.03)] border-l-2 border-l-[var(--accent-green)]">
          {player1 ? (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] text-[11px] font-mono font-bold text-[var(--accent-green)] shrink-0">
                {getInitials(player1.name)}
              </div>
              <div className="flex-1 truncate">
                <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wide">Player 1</div>
                <div className="text-sm font-bold text-[var(--text-primary)] truncate">{player1.name}</div>
              </div>
              <button onClick={() => setPlayer1(null)} className="text-[10px] font-mono text-[var(--accent-green)] hover:underline">Change</button>
            </>
          ) : (
            <div className="w-full">
              <PlayerPicker
                label="Player 1"
                selected={player1}
                placeholder="Search Player 1..."
                onSelect={setPlayer1}
                onClear={() => setPlayer1(null)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-card-hover)] border border-[var(--glass-border)] text-[10px] font-bold text-[var(--text-muted)] mx-auto shrink-0">
          VS
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface)] px-4 py-3 shadow-[0_0_15px_rgba(255,185,95,0.03)] border-l-2 border-l-[var(--accent-gold)]">
          {player2 ? (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,185,95,0.08)] border border-[rgba(255,185,95,0.2)] text-[11px] font-mono font-bold text-[var(--accent-gold)] shrink-0">
                {getInitials(player2.name)}
              </div>
              <div className="flex-1 truncate">
                <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wide">Player 2</div>
                <div className="text-sm font-bold text-[var(--text-primary)] truncate">{player2.name}</div>
              </div>
              <button onClick={() => setPlayer2(null)} className="text-[10px] font-mono text-[var(--accent-gold)] hover:underline">Change</button>
            </>
          ) : (
            <div className="w-full">
              <PlayerPicker
                label="Player 2"
                selected={player2}
                placeholder="Search Player 2..."
                onSelect={setPlayer2}
                onClear={() => setPlayer2(null)}
              />
            </div>
          )}
        </div>
      </div>

      {player1 && player2 && (
        <>
          {/* Format tabs */}
          <div className="flex items-center justify-center gap-1.5 reveal">
            {availableFormats.map((tab) => {
              const active = tab === format;
              return (
                <button
                  key={tab}
                  onClick={() => setFormat(tab)}
                  className={`font-mono text-[10px] px-3.5 py-1.5 rounded-full border transition-all duration-150 cursor-pointer tracking-wider ${
                    active
                      ? "bg-[rgba(75,226,119,0.08)] border-[rgba(75,226,119,0.3)] text-[var(--accent-green)]"
                      : "border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.12)]"
                  }`}
                >
                  {FORMAT_LABELS[tab]}
                </button>
              );
            })}
          </div>

          {loadingStats && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-green)] border-t-transparent" />
            </div>
          )}

          {!loadingStats && (
            <>
              {/* Clash Hero Card */}
              <ClashHeroCard
                player1={player1}
                player2={player2}
                batting1={batting1}
                batting2={batting2}
                bowling1={bowling1}
                bowling2={bowling2}
                battingTotals1={battingTotals1}
                battingTotals2={battingTotals2}
                bowlingTotals1={bowlingTotals1}
                bowlingTotals2={bowlingTotals2}
                format={format}
              />


              {/* Stats comparison with visual comparative bars */}
              <StatComparisonBars
                player1={player1}
                player2={player2}
                batting1={battingTotals1}
                batting2={battingTotals2}
                bowling1={bowlingTotals1}
                bowling2={bowlingTotals2}
                format={format}
              />


              {/* Batting table */}
              <BattingComparisonTable
                player1={player1}
                player2={player2}
                left={battingTotals1}
                right={battingTotals2}
              />

              {/* Bowling table */}
              {hasBowlingData && (
                <BowlingComparisonTable
                  player1={player1}
                  player2={player2}
                  left={bowlingTotals1}
                  right={bowlingTotals2}
                />
              )}

              {/* Phase Breakdown / Venue Splits */}
              {format === "Test" ? (
                (() => {
                  const getVenueStatBatting = (splits: PlayerVenueSplitsResponse | null, venueType: string) => {
                    const stat = splits?.batting.find(v => v.venue_type.toLowerCase() === venueType.toLowerCase());
                    return {
                      runs: stat?.runs != null ? stat.runs.toLocaleString("en-IN") : "-",
                      avg: stat?.average != null ? stat.average.toFixed(2) : "-",
                      sr: stat?.strike_rate != null ? stat.strike_rate.toFixed(1) : "-",
                    };
                  };

                  const getVenueStatBowling = (splits: PlayerVenueSplitsResponse | null, venueType: string) => {
                    const stat = splits?.bowling.find(v => v.venue_type.toLowerCase() === venueType.toLowerCase());
                    return {
                      wickets: stat?.wickets != null ? stat.wickets : "-",
                      avg: stat?.average != null ? stat.average.toFixed(2) : "-",
                      econ: stat?.economy != null ? stat.economy.toFixed(2) : "-",
                    };
                  };

                  const p1HomeBat = getVenueStatBatting(venueSplits1, "home");
                  const p2HomeBat = getVenueStatBatting(venueSplits2, "home");
                  const p1AwayBat = getVenueStatBatting(venueSplits1, "away");
                  const p2AwayBat = getVenueStatBatting(venueSplits2, "away");
                  const p1NeutralBat = getVenueStatBatting(venueSplits1, "neutral");
                  const p2NeutralBat = getVenueStatBatting(venueSplits2, "neutral");

                  const p1HomeBowl = getVenueStatBowling(venueSplits1, "home");
                  const p2HomeBowl = getVenueStatBowling(venueSplits2, "home");
                  const p1AwayBowl = getVenueStatBowling(venueSplits1, "away");
                  const p2AwayBowl = getVenueStatBowling(venueSplits2, "away");
                  const p1NeutralBowl = getVenueStatBowling(venueSplits1, "neutral");
                  const p2NeutralBowl = getVenueStatBowling(venueSplits2, "neutral");

                  return (
                    <section className="reveal">
                      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                        <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">04</span>
                        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Venue Splits</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                        <span className="font-mono text-[9px] text-[var(--text-muted)]">Test Match Breakdown</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                        {/* Home Card */}
                        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                          <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-green), transparent)" }} />
                          <div className="text-[10px] font-mono font-bold text-[var(--accent-green)] uppercase tracking-wider mb-3">🏡 Home</div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5">Batting</div>
                              <div className="space-y-1.5">
                                <PhaseRow label="Runs" val1={p1HomeBat.runs} val2={p2HomeBat.runs} />
                                <PhaseRow label="Average" val1={p1HomeBat.avg} val2={p2HomeBat.avg} />
                                <PhaseRow label="Strike Rate" val1={p1HomeBat.sr} val2={p2HomeBat.sr} />
                              </div>
                            </div>

                            {hasBowlingData && (
                              <div>
                                <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5 mt-2">Bowling</div>
                                <div className="space-y-1.5">
                                  <PhaseRow label="Wickets" val1={String(p1HomeBowl.wickets)} val2={String(p2HomeBowl.wickets)} />
                                  <PhaseRow label="Average" val1={p1HomeBowl.avg} val2={p2HomeBowl.avg} />
                                  <PhaseRow label="Economy" val1={p1HomeBowl.econ} val2={p2HomeBowl.econ} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Away Card */}
                        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                          <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-blue), transparent)" }} />
                          <div className="text-[10px] font-mono font-bold text-[var(--accent-blue)] uppercase tracking-wider mb-3">✈️ Away</div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5">Batting</div>
                              <div className="space-y-1.5">
                                <PhaseRow label="Runs" val1={p1AwayBat.runs} val2={p2AwayBat.runs} />
                                <PhaseRow label="Average" val1={p1AwayBat.avg} val2={p2AwayBat.avg} />
                                <PhaseRow label="Strike Rate" val1={p1AwayBat.sr} val2={p2AwayBat.sr} />
                              </div>
                            </div>

                            {hasBowlingData && (
                              <div>
                                <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5 mt-2">Bowling</div>
                                <div className="space-y-1.5">
                                  <PhaseRow label="Wickets" val1={String(p1AwayBowl.wickets)} val2={String(p2AwayBowl.wickets)} />
                                  <PhaseRow label="Average" val1={p1AwayBowl.avg} val2={p2AwayBowl.avg} />
                                  <PhaseRow label="Economy" val1={p1AwayBowl.econ} val2={p2AwayBowl.econ} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Neutral Card */}
                        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                          <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-gold), transparent)" }} />
                          <div className="text-[10px] font-mono font-bold text-[var(--accent-gold)] uppercase tracking-wider mb-3">🌍 Neutral</div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5">Batting</div>
                              <div className="space-y-1.5">
                                <PhaseRow label="Runs" val1={p1NeutralBat.runs} val2={p2NeutralBat.runs} />
                                <PhaseRow label="Average" val1={p1NeutralBat.avg} val2={p2NeutralBat.avg} />
                                <PhaseRow label="Strike Rate" val1={p1NeutralBat.sr} val2={p2NeutralBat.sr} />
                              </div>
                            </div>

                            {hasBowlingData && (
                              <div>
                                <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[rgba(255,255,255,0.03)] pb-1 mb-1.5 mt-2">Bowling</div>
                                <div className="space-y-1.5">
                                  <PhaseRow label="Wickets" val1={String(p1NeutralBowl.wickets)} val2={String(p2NeutralBowl.wickets)} />
                                  <PhaseRow label="Average" val1={p1NeutralBowl.avg} val2={p2NeutralBowl.avg} />
                                  <PhaseRow label="Economy" val1={p1NeutralBowl.econ} val2={p2NeutralBowl.econ} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })()
              ) : (
                (() => {
                  const getPhaseStat = (phases: PlayerPhasesResponse | null, phaseName: string) => {
                    const stat = phases?.batting.find(p => p.phase_name.toLowerCase() === phaseName.toLowerCase());
                    return {
                      runs: stat?.runs != null ? (stat.runs / 1000).toFixed(1) + "k" : "-",
                      avg: stat?.average != null ? stat.average.toFixed(1) : "-",
                      sr: stat?.strike_rate != null ? stat.strike_rate.toFixed(1) : "-",
                      dot: stat?.dot_ball_pct != null ? Math.round(stat.dot_ball_pct) + "%" : "-",
                    };
                  };

                  const getBowlingPhaseStat = (
                    phases: PlayerPhasesResponse | null,
                    phaseName: string,
                    overallBowling: BowlingTotals | null
                  ) => {
                    const stat = phases?.bowling.find(p => p.phase_name.toLowerCase() === phaseName.toLowerCase());
                    const wickets = stat?.wickets ?? 0;
                    const balls = stat?.balls ?? 0;
                    const econ = stat?.economy ?? null;
                    const sr = wickets > 0 ? (balls / wickets).toFixed(1) : "-";
                    const wktsPerInn = overallBowling && overallBowling.innings > 0 
                      ? (wickets / overallBowling.innings).toFixed(2) 
                      : "-";
                    return {
                      econ: econ !== null ? econ.toFixed(2) : "-",
                      wktsPerInn,
                      sr,
                    };
                  };

                  const p1PP = getPhaseStat(phases1, "powerplay");
                  const p2PP = getPhaseStat(phases2, "powerplay");
                  const p1Mid = getPhaseStat(phases1, "middle");
                  const p2Mid = getPhaseStat(phases2, "middle");
                  const p1Death = getPhaseStat(phases1, "death");
                  const p2Death = getPhaseStat(phases2, "death");

                  const p1BowlPP = getBowlingPhaseStat(phases1, "powerplay", bowlingTotals1);
                  const p2BowlPP = getBowlingPhaseStat(phases2, "powerplay", bowlingTotals2);
                  const p1BowlMid = getBowlingPhaseStat(phases1, "middle", bowlingTotals1);
                  const p2BowlMid = getBowlingPhaseStat(phases2, "middle", bowlingTotals2);
                  const p1BowlDeath = getBowlingPhaseStat(phases1, "death", bowlingTotals1);
                  const p2BowlDeath = getBowlingPhaseStat(phases2, "death", bowlingTotals2);

                  return (
                    <section className="reveal">
                      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                        <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">04</span>
                        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Phase Breakdown</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                        <span className="font-mono text-[9px] text-[var(--text-muted)]">{format === "All" ? "All Formats" : format} · Both disciplines</span>
                      </div>

                      <div className="space-y-4">
                        {/* Batting Phases */}
                        <div>
                          <div className="font-mono text-[8px] text-[var(--accent-green)] uppercase tracking-wider mb-2 border-b border-[rgba(255,255,255,0.03)] pb-1">🏏 Batting Phases</div>
                          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                            {/* Powerplay Card */}
                            <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-blue), transparent)" }} />
                              <div className="text-[10px] font-mono font-bold text-[var(--accent-blue)] uppercase tracking-wider mb-3">⚡ Powerplay</div>
                              <div className="space-y-2.5">
                                <PhaseRow label="Strike Rate" val1={p1PP.sr} val2={p2PP.sr} />
                                <PhaseRow label="Average" val1={p1PP.avg} val2={p2PP.avg} />
                                <PhaseRow label="Runs" val1={p1PP.runs} val2={p2PP.runs} />
                                <PhaseRow label="Dot%" val1={p1PP.dot} val2={p2PP.dot} />
                              </div>
                            </div>

                            {/* Middle Overs Card */}
                            <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-gold), transparent)" }} />
                              <div className="text-[10px] font-mono font-bold text-[var(--accent-gold)] uppercase tracking-wider mb-3">🏏 Middle Overs</div>
                              <div className="space-y-2.5">
                                <PhaseRow label="Strike Rate" val1={p1Mid.sr} val2={p2Mid.sr} />
                                <PhaseRow label="Average" val1={p1Mid.avg} val2={p2Mid.avg} />
                                <PhaseRow label="Runs" val1={p1Mid.runs} val2={p2Mid.runs} />
                                <PhaseRow label="Dot%" val1={p1Mid.dot} val2={p2Mid.dot} />
                              </div>
                            </div>

                            {/* Death Overs Card */}
                            <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-red), transparent)" }} />
                              <div className="text-[10px] font-mono font-bold text-[var(--accent-red)] uppercase tracking-wider mb-3">💥 Death Overs</div>
                              <div className="space-y-2.5">
                                <PhaseRow label="Strike Rate" val1={p1Death.sr} val2={p2Death.sr} />
                                <PhaseRow label="Average" val1={p1Death.avg} val2={p2Death.avg} />
                                <PhaseRow label="Runs" val1={p1Death.runs} val2={p2Death.runs} />
                                <PhaseRow label="Dot%" val1={p1Death.dot} val2={p2Death.dot} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bowling Phases */}
                        {hasBowlingData && (
                          <div>
                            <div className="font-mono text-[8px] text-[var(--accent-blue)] uppercase tracking-wider mb-2 border-b border-[rgba(255,255,255,0.03)] pb-1">🔴 Bowling Phases</div>
                            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                              {/* Powerplay Card */}
                              <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-blue), transparent)" }} />
                                <div className="text-[10px] font-mono font-bold text-[var(--accent-blue)] uppercase tracking-wider mb-3">⚡ Powerplay</div>
                                <div className="space-y-2.5">
                                  <PhaseRow label="Economy" val1={p1BowlPP.econ} val2={p2BowlPP.econ} />
                                  <PhaseRow label="Wkts/inn" val1={p1BowlPP.wktsPerInn} val2={p2BowlPP.wktsPerInn} />
                                  <PhaseRow label="Strike Rate" val1={p1BowlPP.sr} val2={p2BowlPP.sr} />
                                </div>
                              </div>

                              {/* Middle Overs Card */}
                              <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-gold), transparent)" }} />
                                <div className="text-[10px] font-mono font-bold text-[var(--accent-gold)] uppercase tracking-wider mb-3">🏏 Middle Overs</div>
                                <div className="space-y-2.5">
                                  <PhaseRow label="Economy" val1={p1BowlMid.econ} val2={p2BowlMid.econ} />
                                  <PhaseRow label="Wkts/inn" val1={p1BowlMid.wktsPerInn} val2={p2BowlMid.wktsPerInn} />
                                  <PhaseRow label="Strike Rate" val1={p1BowlMid.sr} val2={p2BowlMid.sr} />
                                </div>
                              </div>

                              {/* Death Overs Card */}
                              <div className="glass-card rounded-xl p-4 relative overflow-hidden">
                                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--accent-red), transparent)" }} />
                                <div className="text-[10px] font-mono font-bold text-[var(--accent-red)] uppercase tracking-wider mb-3">💥 Death Overs</div>
                                <div className="space-y-2.5">
                                  <PhaseRow label="Economy" val1={p1BowlDeath.econ} val2={p2BowlDeath.econ} />
                                  <PhaseRow label="Wkts/inn" val1={p1BowlDeath.wktsPerInn} val2={p2BowlDeath.wktsPerInn} />
                                  <PhaseRow label="Strike Rate" val1={p1BowlDeath.sr} val2={p2BowlDeath.sr} />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })()

              )}

              {/* Season by Season grouped bar chart */}
              {(() => {
                const map1 = new Map<number, number>();
                const map2 = new Map<number, number>();
                
                if (seasonTab === "runs") {
                  batting1.filter(r => rowMatchesFormat(r, format)).forEach(r => {
                    map1.set(r.year, (map1.get(r.year) || 0) + r.runs);
                  });
                  batting2.filter(r => rowMatchesFormat(r, format)).forEach(r => {
                    map2.set(r.year, (map2.get(r.year) || 0) + r.runs);
                  });
                } else {
                  bowling1.filter(r => rowMatchesFormat(r, format)).forEach(r => {
                    map1.set(r.year, (map1.get(r.year) || 0) + r.wickets);
                  });
                  bowling2.filter(r => rowMatchesFormat(r, format)).forEach(r => {
                    map2.set(r.year, (map2.get(r.year) || 0) + r.wickets);
                  });
                }
                
                const allYears = Array.from(new Set([...map1.keys(), ...map2.keys()])).sort((a, b) => a - b);
                const chartData = allYears.map(year => ({
                  year: year,
                  p1: map1.get(year) || 0,
                  p2: map2.get(year) || 0,
                }));
                
                const maxV = Math.max(...chartData.map(d => Math.max(d.p1, d.p2)), 1);

                if (chartData.length === 0) return null;

                const barColor1 = seasonTab === "runs" ? "var(--accent-green)" : "var(--accent-blue)";
                const barColor2 = seasonTab === "runs" ? "var(--accent-gold)" : "rgba(255,185,95,0.8)";

                return (
                  <section className="reveal">
                    <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                      <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">05</span>
                      <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Season by Season</h2>
                      <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">
                        {seasonTab === "runs" ? "Runs per year comparison" : "Wickets per year comparison"}
                      </span>
                    </div>

                    <div className="glass-card rounded-xl p-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSeasonTab("runs")}
                            className={`font-mono text-[9px] px-3.5 py-1.5 rounded-full border transition-all duration-150 cursor-pointer ${
                              seasonTab === "runs"
                                ? "bg-[rgba(75,226,119,0.08)] border-[rgba(75,226,119,0.3)] text-[var(--accent-green)]"
                                : "border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            Runs
                          </button>
                          {hasBowlingData && (
                            <button
                              onClick={() => setSeasonTab("wickets")}
                              className={`font-mono text-[9px] px-3.5 py-1.5 rounded-full border transition-all duration-150 cursor-pointer ${
                                seasonTab === "wickets"
                                  ? "bg-[rgba(59,158,255,0.08)] border-[rgba(59,158,255,0.3)] text-[var(--accent-blue)]"
                                  : "border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                              }`}
                            >
                              Wickets
                            </button>
                          )}
                        </div>
                        <div className="flex gap-3 text-[10px] font-mono">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1 w-2.5 rounded" style={{ backgroundColor: barColor1 }}></span>
                            {player1.name}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1 w-2.5 rounded" style={{ backgroundColor: barColor2 }}></span>
                            {player2.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-4 items-end h-[110px] overflow-x-auto pb-2 scrollbar-thin">
                        {chartData.map(d => {
                          const h1 = d.p1 > 0 ? Math.max(3, Math.round((d.p1 / maxV) * 80)) : 0;
                          const h2 = d.p2 > 0 ? Math.max(3, Math.round((d.p2 / maxV) * 80)) : 0;
                          
                          return (
                            <div key={d.year} className="flex flex-col items-center gap-2 shrink-0">
                              <div className="flex gap-0.5 items-end h-[85px] px-1">
                                <div
                                  className="w-2.5 rounded-t-sm hover:opacity-80 transition cursor-pointer"
                                  style={{ height: `${h1}px`, backgroundColor: barColor1 }}
                                  title={`${player1.name} ${d.year}: ${d.p1} ${seasonTab}`}
                                ></div>
                                <div
                                  className="w-2.5 rounded-t-sm hover:opacity-80 transition cursor-pointer"
                                  style={{ height: `${h2}px`, backgroundColor: barColor2 }}
                                  title={`${player2.name} ${d.year}: ${d.p2} ${seasonTab}`}
                                ></div>
                              </div>
                              <div className="font-mono text-[8px] text-[var(--text-muted)]">{d.year}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* Recent Form */}
              {(() => {
                const getRecentForm = (form: PlayerForm | null) => {
                  const list = form?.batting.slice(0, 8) ?? [];
                  const avg = list.length > 0 ? list.reduce((sum, e) => sum + e.runs, 0) / list.length : 0;
                  return { list, avg };
                };

                const getRecentBowlingForm = (form: PlayerForm | null) => {
                  const list = form?.bowling.slice(0, 8) ?? [];
                  const avg = list.length > 0 ? list.reduce((sum, e) => sum + e.wickets, 0) / list.length : 0;
                  return { list, avg };
                };

                const p1Form = getRecentForm(form1);
                const p2Form = getRecentForm(form2);
                const p1BowlForm = getRecentBowlingForm(form1);
                const p2BowlForm = getRecentBowlingForm(form2);

                const hasBattingForm = p1Form.list.length > 0 || p2Form.list.length > 0;
                const hasBowlingForm = hasBowlingData && (p1BowlForm.list.length > 0 || p2BowlForm.list.length > 0);

                if (!hasBattingForm && !hasBowlingForm) return null;

                return (
                  <section className="reveal">
                    <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                      <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">06</span>
                      <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Recent Form</h2>
                      <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">Last 8 Innings</span>
                    </div>

                    <div className="glass-card rounded-xl p-4 space-y-4">
                      {/* Batting Form Section */}
                      {hasBattingForm && (
                        <div className="space-y-4">
                          <div className="font-mono text-[8px] text-[var(--accent-green)] uppercase tracking-wider">🏏 Batting form</div>
                          
                          {/* Player 1 Batting Form */}
                          <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-stretch">
                            <span className="font-mono text-[10px] font-bold text-[var(--accent-green)] w-8 shrink-0">{getInitials(player1.name)}</span>
                            <div className="flex gap-2.5 flex-1 flex-wrap">
                              {p1Form.list.map((e, idx) => {
                                let toneClass = "fpill-lo";
                                if (e.runs >= 50) toneClass = "fpill-hi";
                                else if (e.runs >= 20 || !e.was_dismissed) toneClass = "fpill-md";
                                
                                return (
                                  <div key={idx} className={`fpill ${toneClass}`}>
                                    <div>{e.runs}{!e.was_dismissed && "*"}</div>
                                    <div className="fpill-fmt">{e.format_bucket}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="bg-[var(--bg-card-hover)] border border-[var(--glass-border)] rounded-lg px-3 py-1 text-center shrink-0">
                              <div className="font-mono text-sm font-bold text-[var(--accent-green)]">{p1Form.avg.toFixed(1)}</div>
                              <div className="text-[8px] text-[var(--text-muted)]">8-inn avg</div>
                            </div>
                          </div>

                          {/* Player 2 Batting Form */}
                          <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-stretch">
                            <span className="font-mono text-[10px] font-bold text-[var(--accent-gold)] w-8 shrink-0">{getInitials(player2.name)}</span>
                            <div className="flex gap-2.5 flex-1 flex-wrap">
                              {p2Form.list.map((e, idx) => {
                                let toneClass = "fpill-lo";
                                if (e.runs >= 50) toneClass = "fpill-hi";
                                else if (e.runs >= 20 || !e.was_dismissed) toneClass = "fpill-md";
                                
                                return (
                                  <div key={idx} className={`fpill ${toneClass}`}>
                                    <div>{e.runs}{!e.was_dismissed && "*"}</div>
                                    <div className="fpill-fmt">{e.format_bucket}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="bg-[var(--bg-card-hover)] border border-[var(--glass-border)] rounded-lg px-3 py-1 text-center shrink-0">
                              <div className="font-mono text-sm font-bold text-[var(--accent-gold)]">{p2Form.avg.toFixed(1)}</div>
                              <div className="text-[8px] text-[var(--text-muted)]">8-inn avg</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Divider */}
                      {hasBattingForm && hasBowlingForm && (
                        <div className="h-px bg-[var(--glass-border)] my-4" />
                      )}

                      {/* Bowling Form Section */}
                      {hasBowlingForm && (
                        <div className="space-y-4">
                          <div className="font-mono text-[8px] text-[var(--accent-blue)] uppercase tracking-wider">🔴 Bowling form (wickets per innings)</div>
                          
                          {/* Player 1 Bowling Form */}
                          <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-stretch">
                            <span className="font-mono text-[10px] font-bold text-[var(--accent-green)] w-8 shrink-0">{getInitials(player1.name)}</span>
                            <div className="flex gap-2.5 flex-1 flex-wrap">
                              {p1BowlForm.list.map((e, idx) => {
                                const toneClass = e.wickets > 0 ? "fpill-wkt" : "fpill-wkt0";
                                return (
                                  <div key={idx} className={`fpill ${toneClass}`}>
                                    <div>{e.wickets}</div>
                                    <div className="fpill-fmt">{e.format_bucket}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="bg-[var(--bg-card-hover)] border border-[var(--glass-border)] rounded-lg px-3 py-1 text-center shrink-0">
                              <div className="font-mono text-sm font-bold text-[var(--accent-blue)]">{p1BowlForm.avg.toFixed(1)}</div>
                              <div className="text-[8px] text-[var(--text-muted)]">W/inn</div>
                            </div>
                          </div>

                          {/* Player 2 Bowling Form */}
                          <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-stretch">
                            <span className="font-mono text-[10px] font-bold text-[var(--accent-gold)] w-8 shrink-0">{getInitials(player2.name)}</span>
                            <div className="flex gap-2.5 flex-1 flex-wrap">
                              {p2BowlForm.list.map((e, idx) => {
                                const toneClass = e.wickets > 0 ? "fpill-wkt" : "fpill-wkt0";
                                return (
                                  <div key={idx} className={`fpill ${toneClass}`}>
                                    <div>{e.wickets}</div>
                                    <div className="fpill-fmt">{e.format_bucket}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="bg-[var(--bg-card-hover)] border border-[var(--glass-border)] rounded-lg px-3 py-1 text-center shrink-0">
                              <div className="font-mono text-sm font-bold text-[var(--accent-blue)]">{p2BowlForm.avg.toFixed(1)}</div>
                              <div className="text-[8px] text-[var(--text-muted)]">W/inn</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })()}

              {/* Partnership Record */}
              {partnershipRows.length > 0 && (
                <section className="reveal">
                  <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                    <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">07</span>
                    <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Partnership Record</h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                    <span className="font-mono text-[9px] text-[var(--text-muted)]">{player1.name} + {player2.name}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                    {partnershipRows.map((row) => {
                      let bucketClass = "fmt-t20";
                      if (row.format_bucket === "ODI") {
                        bucketClass = "fmt-odi";
                      } else if (row.format_bucket === "Test") {
                        bucketClass = "fmt-test";
                      }
                      
                      return (
                        <div key={row.format_bucket} className="glass-card rounded-xl p-4 relative overflow-hidden">
                          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, var(${row.format_bucket === "ODI" ? "--accent-blue" : row.format_bucket === "Test" ? "--accent-gold" : "--accent-green"}), transparent)` }} />
                          <span className={`inline-block font-mono text-[8px] border rounded px-1.5 py-0.5 mb-2.5 ${bucketClass}`}>{row.format_bucket}</span>
                          <div className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-1">{row.total_runs.toLocaleString()}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] mb-2">{row.innings_together} innings together</div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="bg-[rgba(255,255,255,0.02)] rounded p-2 text-center">
                              <div className="font-mono text-xs font-bold text-[var(--accent-green)]">{row.avg_partnership}</div>
                              <div className="text-[8px] text-[var(--text-muted)] mt-0.5">Average</div>
                            </div>
                            <div className="bg-[rgba(255,255,255,0.02)] rounded p-2 text-center">
                              <div className="font-mono text-xs font-bold text-[var(--accent-gold)]">{row.best_partnership.toLocaleString()}</div>
                              <div className="text-[8px] text-[var(--text-muted)] mt-0.5">Best stand</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Head-to-Head Matchups */}
              <section className="reveal">
                <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3 mb-4">
                  <span className="font-mono text-[9px] text-[var(--accent-green)] bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.18)] px-2 py-0.5 rounded">08</span>
                  <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Head-to-Head Matchups</h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-[var(--glass-border)] to-transparent"></div>
                </div>

                <div className="flex gap-3 max-sm:flex-col">
                  <Link
                    href={`/players/${player1.player_id}?bowler=${player2.player_id}`}
                    className="group flex-1 flex items-center justify-between gap-3 border border-[var(--glass-border)] bg-[var(--bg-surface)] rounded-xl px-4 py-3 hover:border-[rgba(75,226,119,0.25)] hover:bg-[var(--bg-card-hover)] transition duration-200"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] text-[8px] font-mono font-bold text-[var(--accent-green)] shrink-0">
                        {getInitials(player1.name)}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">as batter vs</span>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(255,185,95,0.08)] border border-[rgba(255,185,95,0.2)] text-[8px] font-mono font-bold text-[var(--accent-gold)] shrink-0">
                        {getInitials(player2.name)}
                      </div>
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)] ml-2 truncate">{player1.name} vs {player2.name} bowling</span>
                    </div>
                    <span className="text-[var(--accent-green)] font-bold transition group-hover:translate-x-1 shrink-0">→</span>
                  </Link>

                  <Link
                    href={`/players/${player2.player_id}?bowler=${player1.player_id}`}
                    className="group flex-1 flex items-center justify-between gap-3 border border-[var(--glass-border)] bg-[var(--bg-surface)] rounded-xl px-4 py-3 hover:border-[rgba(75,226,119,0.25)] hover:bg-[var(--bg-card-hover)] transition duration-200"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(255,185,95,0.08)] border border-[rgba(255,185,95,0.2)] text-[8px] font-mono font-bold text-[var(--accent-gold)] shrink-0">
                        {getInitials(player2.name)}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">as batter vs</span>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(75,226,119,0.08)] border border-[rgba(75,226,119,0.2)] text-[8px] font-mono font-bold text-[var(--accent-green)] shrink-0">
                        {getInitials(player1.name)}
                      </div>
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)] ml-2 truncate">{player2.name} vs {player1.name} bowling</span>
                    </div>
                    <span className="text-[var(--accent-green)] font-bold transition group-hover:translate-x-1 shrink-0">→</span>
                  </Link>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-green)] border-t-transparent" />
      </div>
    }>
      <ComparePageInner />
    </Suspense>
  );
}
