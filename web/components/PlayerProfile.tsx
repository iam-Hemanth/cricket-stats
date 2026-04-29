"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import { usePlayerSearch } from "@/components/usePlayerSearch";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import RunsChart from "@/components/ui/RunsChart";
import HeroStatBar from "@/components/ui/HeroStatBar";
import api, {
  type BattingStats,
  type BowlingStats,
  type PartnershipStats,
  type PlayerForm,
  type PhaseStatBatting,
  type PhaseStatBowling,
  type TestSplitsResponse,
} from "@/lib/api";
import {
  HIGHLIGHT_THRESHOLDS,
  getHighlightBucketForFormat,
  getHighlightBucketForTab,
} from "@/lib/highlights";

/* Tab display order: All → IPL → T20I → T20 → ODI → ODM → Test → MDM */
const BATTING_TAB_ORDER = ["IPL", "T20I", "T20", "ODI", "ODM", "Test", "MDM"];
const IPL_COMPETITION = "Indian Premier League";

function sortStats<T extends { format: string }>(rows: T[]): T[] {
  const order: Record<string, number> = {
    Test: 0, MDM: 1, ODI: 2, ODM: 3, T20: 4, IT20: 5,
  };
  return [...rows].sort((a, b) => {
    const fa = order[a.format] ?? 99;
    const fb = order[b.format] ?? 99;
    if (fa !== fb) return fa - fb;
    const ay = (a as Record<string, unknown>).year as number | undefined;
    const by = (b as Record<string, unknown>).year as number | undefined;
    if (ay !== undefined && by !== undefined) return by - ay;
    const as = (a as Record<string, unknown>).season as string | undefined;
    const bs = (b as Record<string, unknown>).season as string | undefined;
    if (as !== undefined && bs !== undefined) return bs.localeCompare(as);
    return 0;
  });
}

/* ── Career aggregation ──────────────────────────────────── */

function battingCareer(rows: BattingStats[]): BattingStats {
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);
  const totalBalls = rows.reduce((s, r) => s + r.balls_faced, 0);
  const totalInnings = rows.reduce((s, r) => s + r.innings, 0);
  // Approximate dismissals from per-season avg: dismissals ≈ runs / avg
  let totalDismissals = 0;
  for (const r of rows) {
    if (r.average && r.average > 0) {
      totalDismissals += Math.round(r.runs / r.average);
    }
  }
  return {
    player_id: rows[0].player_id,
    player_name: rows[0].player_name,
    format: rows[0].format,
    year: 0,
    competition_name: null,
    matches: rows.reduce((s, r) => s + r.matches, 0),
    innings: totalInnings,
    runs: totalRuns,
    balls_faced: totalBalls,
    average: totalDismissals > 0 ? totalRuns / totalDismissals : null,
    strike_rate: totalBalls > 0 ? (totalRuns * 100) / totalBalls : null,
    fifties: rows.reduce((s, r) => s + r.fifties, 0),
    hundreds: rows.reduce((s, r) => s + r.hundreds, 0),
    ducks: rows.reduce((s, r) => s + r.ducks, 0),
    highest_score: Math.max(...rows.map((r) => r.highest_score)),
  };
}

function bowlingCareer(rows: BowlingStats[]): BowlingStats {
  const totalWkts = rows.reduce((s, r) => s + r.wickets, 0);
  const totalRuns = rows.reduce((s, r) => s + r.runs_conceded, 0);
  // Estimate total balls from per-season economy: balls ≈ (runs / eco) * 6
  let totalBalls = 0;
  for (const r of rows) {
    if (r.economy && r.economy > 0) {
      totalBalls += Math.round((r.runs_conceded / r.economy) * 6);
    }
  }
  return {
    player_id: rows[0].player_id,
    player_name: rows[0].player_name,
    format: rows[0].format,
    year: 0,
    competition_name: null,
    innings_bowled: rows.reduce((s, r) => s + r.innings_bowled, 0),
    wickets: totalWkts,
    runs_conceded: totalRuns,
    economy: totalBalls > 0 ? (totalRuns / totalBalls) * 6 : null,
    bowling_average: totalWkts > 0 ? totalRuns / totalWkts : null,
    strike_rate: totalWkts > 0 && totalBalls > 0 ? totalBalls / totalWkts : null,
  };
}

/* ── Batting table with format groups ────────────────────── */

/**
 * Filters batting data into a virtual tab group.
 * - "IPL"  = format T20 with competition_name === IPL_COMPETITION
 * - "T20"  = format T20 with competition_name !== IPL_COMPETITION
 * - "T20I" = format IT20
 * - Other tabs map 1:1 to format
 */
function filterBattingRows(data: BattingStats[], tab: string): BattingStats[] {
  switch (tab) {
    case "IPL":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name === IPL_COMPETITION
      );
    case "T20":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name !== IPL_COMPETITION
      );
    case "T20I":
      return data.filter((r) => r.format === "IT20");
    default:
      return data.filter((r) => r.format === tab);
  }
}

function BattingSection({ data }: { data: BattingStats[] }) {
  // Determine which virtual tabs have data
  const availableTabs = BATTING_TAB_ORDER.filter(
    (t) => filterBattingRows(data, t).length > 0
  );

  // Build groups
  const activeTabs = availableTabs;
  const groups = activeTabs
    .map((t) => {
      const rows = filterBattingRows(data, t).sort((a, b) => b.year - a.year);
      if (rows.length === 0) return null;
      return { label: t, career: battingCareer(rows), rows };
    })
    .filter(Boolean) as { label: string; career: BattingStats; rows: BattingStats[] }[];

  return (
    <div className="overflow-x-auto">
      <table className="year-table w-full min-w-[640px] text-sm">
        <thead className="year-table-head">
          <tr className="year-table-head-row text-left">
            <th className="year-table-head-cell px-5 py-3">Year</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Inn</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Runs</th>
            <th className="year-table-head-cell hidden px-5 py-3 text-right sm:table-cell">HS</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Avg</th>
            <th className="year-table-head-cell px-5 py-3 text-right">SR</th>
            <th className="year-table-head-cell hidden px-5 py-3 text-right sm:table-cell">100s</th>
            <th className="year-table-head-cell hidden px-5 py-3 text-right sm:table-cell">50s</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <BattingFormatGroup
              key={g.label}
              group={g}
              showHeader={false}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BattingFormatGroup({
  group,
  showHeader,
}: {
  group: { label: string; career: BattingStats; rows: BattingStats[] };
  showHeader: boolean;
}) {
  const { label, career, rows } = group;
  return (
    <>
      {showHeader && (
        <tr>
          <td
            colSpan={9}
            className="px-4 pb-1 pt-5 text-xs font-bold uppercase tracking-widest text-[--text-muted]"
          >
            ── {label} ──
          </td>
        </tr>
      )}
      <BattingRow row={career} isCareer formatLabel={label} />
      {rows.map((r) => (
        <BattingRow
          key={`${r.format}-${r.year}-${r.competition_name}`}
          row={r}
          formatLabel={label}
        />
      ))}
    </>
  );
}

function BattingRow({
  row: r,
  isCareer = false,
  formatLabel: _formatLabel,
}: {
  row: BattingStats;
  isCareer?: boolean;
  formatLabel?: string;
}) {
  const cls = isCareer
    ? "year-table-row year-table-row-career"
    : "year-table-row year-table-row-hover";

  const tColor = isCareer ? "text-[--text-primary]" : "text-[--text-secondary]";
  const thresholds = HIGHLIGHT_THRESHOLDS[getHighlightBucketForFormat(r.format)];

  // Format-aware highlighting rules
  const getRunsColor = (runs: number) => !isCareer && runs >= thresholds.batting.runsGreen ? "stat-pop-green" : tColor;
  const getAvgColor = (avg: number | null) => {
    if (isCareer || avg === null) return isCareer ? "text-[--text-primary]" : tColor;
    if (avg >= thresholds.batting.avgGreen) return "stat-pop-green";
    if (avg < thresholds.batting.avgRed) return "stat-pop-red";
    return tColor;
  };
  const getStrikeRateColor = (sr: number | null) => {
    if (isCareer || sr === null) return isCareer ? "text-[--text-primary]" : tColor;
    if (sr >= thresholds.batting.strikeRateGreen) return "stat-pop-green";
    if (sr < thresholds.batting.strikeRateRed) return "stat-pop-red";
    return tColor;
  };
  const getHighestScoreColor = (highestScore: number) => {
    if (isCareer) return "text-[--text-primary]";
    if (highestScore >= thresholds.batting.highestScoreGold) return "stat-pop-gold";
    return tColor;
  };
  const get100sColor = (hundreds: number) => {
    if (isCareer) return "text-[--text-primary]";
    return hundreds === 0 ? "stat-pop-red" : "stat-pop-gold";
  };
  const get50sColor = (fifties: number) => {
    if (isCareer) return "text-[--text-primary]";
    if (fifties >= thresholds.batting.fiftiesGold) return "stat-pop-gold";
    if (fifties === 0) return "stat-pop-red";
    return tColor;
  };

  return (
    <tr className={cls}>
      <td className="year-table-cell px-5 py-3 text-sm font-bold text-[--text-primary]">
        {isCareer ? "Career" : r.year}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>{r.innings}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getRunsColor(r.runs)}`}>
        {r.runs.toLocaleString()}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${getHighestScoreColor(r.highest_score)}`}>
        {r.highest_score}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getAvgColor(r.average)}`}>
        {r.average?.toFixed(2) ?? "–"}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getStrikeRateColor(r.strike_rate)}`}>
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${get100sColor(r.hundreds)}`}>
        {r.hundreds}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${get50sColor(r.fifties)}`}>
        {r.fifties}
      </td>
    </tr>
  );
}

/* ── Bowling table with format groups ────────────────────── */

/**
 * Filters bowling data into a virtual tab group.
 * - "IPL"  = format T20 with competition_name === IPL_COMPETITION
 * - "T20"  = format T20 with competition_name !== IPL_COMPETITION (includes null)
 * - "T20I" = format IT20
 * - Other tabs map 1:1 to format
 */
function filterBowlingRows(data: BowlingStats[], tab: string): BowlingStats[] {
  switch (tab) {
    case "IPL":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name === IPL_COMPETITION
      );
    case "T20":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name !== IPL_COMPETITION
      );
    case "T20I":
      return data.filter((r) => r.format === "IT20");
    default:
      return data.filter((r) => r.format === tab);
  }
}

function BowlingSection({ data }: { data: BowlingStats[] }) {
  // Determine which virtual tabs have data
  const availableTabs = BATTING_TAB_ORDER.filter(
    (t) => filterBowlingRows(data, t).length > 0
  );

  // Build groups
  const activeTabs = availableTabs;
  const groups = activeTabs
    .map((t) => {
      const rows = filterBowlingRows(data, t).sort((a, b) => b.year - a.year);
      if (rows.length === 0) return null;
      return { label: t, career: bowlingCareer(rows), rows };
    })
    .filter(Boolean) as { label: string; career: BowlingStats; rows: BowlingStats[] }[];

  return (
    <div className="overflow-x-auto">
      <table className="year-table w-full min-w-[560px] text-sm">
        <thead className="year-table-head">
          <tr className="year-table-head-row text-left">
            <th className="year-table-head-cell px-5 py-3">Year</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Inn</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Wkts</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Runs</th>
            <th className="year-table-head-cell px-5 py-3 text-right">Econ</th>
            <th className="year-table-head-cell hidden px-5 py-3 text-right sm:table-cell">Avg</th>
            <th className="year-table-head-cell hidden px-5 py-3 text-right sm:table-cell">SR</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <BowlingFormatGroup
              key={g.label}
              group={g}
              showHeader={false}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BowlingFormatGroup({
  group,
  showHeader,
}: {
  group: { label: string; career: BowlingStats; rows: BowlingStats[] };
  showHeader: boolean;
}) {
  const { label, career, rows } = group;
  return (
    <>
      {showHeader && (
        <tr>
          <td
            colSpan={7}
            className="px-4 pb-1 pt-5 text-xs font-bold uppercase tracking-widest text-[--text-muted]"
          >
            ── {label} ──
          </td>
        </tr>
      )}
      <BowlingRow row={career} isCareer />
      {rows.map((r) => (
        <BowlingRow key={`${r.format}-${r.year}-${r.competition_name ?? 'other'}`} row={r} />
      ))}
    </>
  );
}

function BowlingRow({
  row: r,
  isCareer = false,
}: {
  row: BowlingStats;
  isCareer?: boolean;
}) {
  const cls = isCareer
    ? "year-table-row year-table-row-career"
    : "year-table-row year-table-row-hover";

  const tColor = isCareer ? "text-[--text-primary]" : "text-[--text-secondary]";
  const thresholds = HIGHLIGHT_THRESHOLDS[getHighlightBucketForFormat(r.format)];

  // Format-aware bowling highlights
  const getWicketsColor = (wkts: number) => !isCareer && wkts >= thresholds.bowling.wicketsBlue ? "stat-pop-blue" : tColor;
  const getEconColor = (econ: number | null) => {
    if (isCareer || econ === null) return isCareer ? "text-[--text-primary]" : tColor;
    if (econ <= thresholds.bowling.economyGreen) return "stat-pop-green";
    if (econ > thresholds.bowling.economyRed) return "stat-pop-red";
    return tColor;
  };

  return (
    <tr className={cls}>
      <td className="year-table-cell px-5 py-3 text-sm font-bold text-[--text-primary]">
        {isCareer ? "Career" : r.year}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>{r.innings_bowled}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getWicketsColor(r.wickets)}`}>{r.wickets}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>{r.runs_conceded.toLocaleString()}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getEconColor(r.economy)}`}>{r.economy?.toFixed(2) ?? "–"}</td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${tColor}`}>
        {r.bowling_average?.toFixed(2) ?? "–"}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${tColor}`}>
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
    </tr>
  );
}

/* ── Skeleton loader ─────────────────────────────────────── */

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4 pt-4 animate-fade-in">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full shimmer" />
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg shimmer" />
          <div className="flex gap-2">
            <div className="h-5 w-14 rounded-full shimmer" />
            <div className="h-5 w-14 rounded-full shimmer" />
            <div className="h-5 w-16 rounded-full shimmer" />
          </div>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <div className="h-9 w-24 rounded-lg shimmer" />
        <div className="h-9 w-24 rounded-lg shimmer" />
      </div>
      <div className="mt-4 space-y-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg shimmer" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}

/* ── Redesigned Phase card (dashboard style) ─────────────── */

const PHASE_META: Record<string, { label: string; cls: string; accentCls: string; barColor: string }> = {
  powerplay: { label: "Powerplay", cls: "phase-powerplay", accentCls: "phase-powerplay-accent", barColor: "#3b82f6" },
  middle:    { label: "Middle Overs", cls: "phase-middle", accentCls: "phase-middle-accent", barColor: "#f59e0b" },
  death:     { label: "Death Overs", cls: "phase-death", accentCls: "phase-death-accent", barColor: "#ef4444" },
};

function PhaseCard({ phase, isBatting, maxHeroVal }: {
  phase: PhaseStatBatting | PhaseStatBowling;
  isBatting: boolean;
  maxHeroVal: number;
}) {
  const meta = PHASE_META[phase.phase_name] ?? { label: phase.phase_name, cls: "", accentCls: "text-[--text-muted]", barColor: "#6b7280" };
  const heroVal = isBatting
    ? ((phase as PhaseStatBatting).strike_rate ?? 0)
    : ((phase as PhaseStatBowling).economy ?? 0);
  const barPct = maxHeroVal > 0 ? Math.min((heroVal / maxHeroVal) * 100, 100) : 0;
  const bat = phase as PhaseStatBatting;
  const bowl = phase as PhaseStatBowling;

  return (
    <div className={`glass-card card-hover rounded-2xl p-5 ${meta.cls} flex flex-col gap-1`}>
      <div className={`section-eyebrow ${meta.accentCls}`}>{meta.label}</div>
      <div className={`phase-hero-stat mt-1 ${meta.accentCls}`}>
        {isBatting ? (bat.strike_rate ?? "—") : (bowl.economy ?? "—")}
      </div>
      <div className="text-xs text-[--text-muted] mb-1">{isBatting ? "Strike Rate" : "Economy"}</div>
      <div className="phase-bar-track">
        <div className="phase-bar-fill" style={{ width: `${barPct}%`, background: meta.barColor }} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
        <div>
          <div className="text-xs text-[--text-muted]">Avg</div>
          <div className="font-semibold text-[--text-primary]">{isBatting ? (bat.average ?? "—") : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-[--text-muted]">Runs</div>
          <div className="font-semibold text-[--text-primary]">{isBatting ? bat.runs.toLocaleString() : bowl.runs_conceded.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-[--text-muted]">Balls</div>
          <div className="font-semibold text-[--text-secondary]">{isBatting ? bat.balls : bowl.balls}</div>
        </div>
        <div>
          <div className="text-xs text-[--text-muted]">Dot%</div>
          <div className="font-semibold text-[--text-secondary]">{isBatting ? (bat.dot_ball_pct ?? "—") : (bowl.dot_ball_pct ?? "—")}</div>
        </div>
        {isBatting && (
          <div>
            <div className="text-xs text-[--text-muted]">Boundary%</div>
            <div className="font-semibold text-[--accent-gold]">{bat.boundary_pct ?? "—"}</div>
          </div>
        )}
        {!isBatting && (
          <div>
            <div className="text-xs text-[--text-muted]">Wickets</div>
            <div className="font-semibold gradient-text-green">{bowl.wickets}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Test innings split section ──────────────────────────── */

function InningsSplitSection({ splits, role }: { splits: TestSplitsResponse; role: "batting" | "bowling" }) {
  const data = role === "batting" ? splits.batting : splits.bowling;
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[--text-muted]">
        No Test {role} data available.
      </div>
    );
  }
  const labels = ["1st Innings", "2nd Innings"];
  const clsSide = ["innings-1st", "innings-2nd"];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
      {data.map((d, i) => (
        <div key={d.innings_number} className={`innings-split-card glass-card rounded-2xl p-5 pl-7 ${clsSide[i] ?? ""}`}>
          <div className="section-eyebrow mb-1">{labels[i] ?? `Innings ${d.innings_number}`}</div>
          {role === "batting" ? (
            <>
              <div className="phase-hero-stat gradient-text-green">
                {(d as import("@/lib/api").TestInningsSplitBatting).average?.toFixed(2) ?? "—"}
              </div>
              <div className="text-xs text-[--text-muted] mb-3">Average</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-[--text-muted]">Innings</div><div className="font-semibold">{d.innings_count}</div></div>
                <div><div className="text-xs text-[--text-muted]">SR</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBatting).strike_rate?.toFixed(2) ?? "—"}</div></div>
                <div><div className="text-xs text-[--text-muted]">Runs</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBatting).runs.toLocaleString()}</div></div>
                <div><div className="text-xs text-[--text-muted]">HS</div><div className="font-semibold text-[--accent-gold]">{(d as import("@/lib/api").TestInningsSplitBatting).highest_score}</div></div>
                <div><div className="text-xs text-[--text-muted]">100s</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBatting).hundreds}</div></div>
                <div><div className="text-xs text-[--text-muted]">50s</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBatting).fifties}</div></div>
              </div>
            </>
          ) : (
            <>
              <div className="phase-hero-stat" style={{ color: "#3b82f6" }}>
                {(d as import("@/lib/api").TestInningsSplitBowling).economy?.toFixed(2) ?? "—"}
              </div>
              <div className="text-xs text-[--text-muted] mb-3">Economy</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-[--text-muted]">Innings</div><div className="font-semibold">{d.innings_count}</div></div>
                <div><div className="text-xs text-[--text-muted]">Wickets</div><div className="font-semibold gradient-text-green">{(d as import("@/lib/api").TestInningsSplitBowling).wickets}</div></div>
                <div><div className="text-xs text-[--text-muted]">Avg</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBowling).bowling_average?.toFixed(2) ?? "—"}</div></div>
                <div><div className="text-xs text-[--text-muted]">SR</div><div className="font-semibold">{(d as import("@/lib/api").TestInningsSplitBowling).strike_rate?.toFixed(1) ?? "—"}</div></div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}


/* ── Matchup mini-search ─────────────────────────────────── */

function MatchupSearch({
  playerId,
  onSelectBowler,
}: {
  playerId: string;
  onSelectBowler: (bowler: { id: string; name: string }) => void;
}) {
  const {
    isOpen,
    loading,
    query,
    results,
    selectPlayer,
    setQuery,
    wrapperRef,
  } = usePlayerSearch({
    excludePlayerId: playerId,
    onSelect: (player) => {
      onSelectBowler({ id: player.player_id, name: player.name });
    },
  });

  return (
    <div ref={wrapperRef} className="relative max-w-sm">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a bowler to compare against..."
        className="w-full rounded-lg border border-[--text-muted]/30 bg-[--bg-card] px-4 py-2.5 text-sm text-[--text-primary] placeholder-[--text-muted] outline-none focus:border-[--accent-green] focus:ring-1 focus:ring-[--accent-green]"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[--text-muted] border-t-[--accent-green]" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[--text-muted]/30 bg-[--bg-card] shadow-lg">
          <ul>
            {results.map((p) => (
              <li key={p.player_id}>
                <Link
                  href={`/players/${playerId}?bowler=${p.player_id}&bowler_name=${encodeURIComponent(p.name)}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlayer(p)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[--text-secondary] hover:bg-[--bg-surface] hover:text-[--text-primary]"
                >
                  <Avatar name={p.name} size="sm" />
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOpen && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-[--text-muted]/30 bg-[--bg-card] px-4 py-3 text-sm text-[--text-muted] shadow-lg">
          No players found
        </div>
      )}
    </div>
  );
}

/* ── Form guide component ────────────────────────────────── */

interface FormGuideProps {
  form: PlayerForm;
  selectedFormat: string | null;
  onFormatChange: (format: string | null) => void;
}

function FormGuide({ form, selectedFormat, onFormatChange }: FormGuideProps) {
  const router = useRouter();
  
  if (!form || (form.batting.length === 0 && form.bowling.length === 0)) {
    return null;
  }

  // Calculate batting trend
  let battingTrend: "in-form" | "out-of-form" | null = null;
  if (form.batting.length >= 5) {
    // Recent 5 (indices 0-4, most recent first)
    const recent5Avg = form.batting.slice(0, 5).reduce((sum, e) => sum + e.runs, 0) / 5;
    // Older 5 (indices 5-9)
    const older5Avg = form.batting.slice(5, 10).reduce((sum, e) => sum + e.runs, 0) / 5;
    
    if (recent5Avg > older5Avg + 10) {
      battingTrend = "in-form";
    } else if (recent5Avg < older5Avg - 10) {
      battingTrend = "out-of-form";
    }
  }

  const battingRecent = form.batting.slice(0, 10);
  const battingRuns10 = battingRecent.reduce((sum, entry) => sum + entry.runs, 0);
  const battingBalls10 = battingRecent.reduce((sum, entry) => sum + entry.balls_faced, 0);
  const battingDismissals10 = battingRecent.reduce(
    (sum, entry) => sum + (entry.was_dismissed ? 1 : 0),
    0
  );
  const battingAvg10 = battingDismissals10 > 0 ? battingRuns10 / battingDismissals10 : null;
  const battingSr10 = battingBalls10 > 0 ? (battingRuns10 * 100) / battingBalls10 : null;

  const bowlingRecent = form.bowling.slice(0, 10);
  const bowlingRuns10 = bowlingRecent.reduce((sum, entry) => sum + entry.runs_conceded, 0);
  const bowlingBalls10 = bowlingRecent.reduce((sum, entry) => sum + entry.balls_bowled, 0);
  const bowlingEcon10 = bowlingBalls10 > 0 ? (bowlingRuns10 * 6) / bowlingBalls10 : null;

  const getBattingChipTone = (
    runs: number,
    ballsFaced: number,
    wasDismissed: boolean,
    formatBucket: string
  ): string => {
    const isT20Format = formatBucket === "T20" || formatBucket === "IT20" || formatBucket === "IPL";

    if (isT20Format) {
      const sr = ballsFaced > 0 ? (runs * 100) / ballsFaced : 0;

      // Duck
      if (runs === 0 && wasDismissed) return "form-chip-duck";

      // Excellent: big score at high SR
      if (runs >= 40 && sr >= 160) return "form-chip-elite";

      // Good: decent score at good SR
      if (runs >= 25 && sr >= 140) return "form-chip-good";

      // OK: got going at acceptable SR
      if (runs >= 10 && sr >= 100) return "form-chip-ok";

      // Poor: everything else
      return "form-chip-poor";
    }

    if (runs >= 100) return "form-chip-elite";
    if (runs >= 50) return "form-chip-good";
    if (runs >= 20) return "form-chip-ok";
    if (runs === 0 && wasDismissed) return "form-chip-duck";
    return "form-chip-poor";
  };

  const getBowlingChipTone = (economy: number | null): string => {
    if (economy === null) return "form-chip-na";
    if (economy < 6.0) return "form-chip-elite";
    if (economy < 7.5) return "form-chip-good";
    if (economy < 9.0) return "form-chip-ok";
    return "form-chip-poor";
  };

  return (
    <div className="mt-6 space-y-6 border-t border-[--text-muted]/20 pt-6">
      {/* Format Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onFormatChange(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedFormat === null
              ? 'bg-[--accent-green] text-white'
              : 'bg-[--bg-card] text-[--text-secondary] hover:bg-[--bg-hover]'
          }`}
        >
          All
        </button>
        {['IPL', 'T20', 'IT20', 'ODI', 'ODM', 'Test'].map((fmt) => (
          <button
            key={fmt}
            onClick={() => onFormatChange(fmt)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedFormat === fmt
                ? 'bg-[--accent-green] text-white'
                : 'bg-[--bg-card] text-[--text-secondary] hover:bg-[--bg-hover]'
            }`}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* Batting Form Strip */}
      {form.batting.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--text-muted]">
            Recent batting form
          </h3>
          <div className="flex flex-wrap gap-2">
            {form.batting.map((entry, idx) => (
              <div
                key={`bat-${entry.match_id}-${idx}`}
                title={`${entry.runs}${!entry.was_dismissed ? '*' : ''} vs ${entry.opposition} (${entry.format_bucket}) · ${entry.date}`}
                className={`form-chip ${getBattingChipTone(entry.runs, entry.balls_faced, entry.was_dismissed, entry.format_bucket)} cursor-pointer`}
                onClick={() => router.push(`/match/${entry.match_id}`)}
              >
                <div className="form-chip-value">{entry.runs}{!entry.was_dismissed ? '*' : ''}</div>
                <div className="form-chip-format">{entry.format_bucket}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {battingAvg10 !== null && (
              <div className="form-metric-pill">
                <div className="form-metric-pill-value">{battingAvg10.toFixed(1)}</div>
                <div className="form-metric-pill-label">10-inn avg</div>
              </div>
            )}
            {battingSr10 !== null && (
              <div className="form-metric-pill">
                <div className="form-metric-pill-value">{battingSr10.toFixed(1)}</div>
                <div className="form-metric-pill-label">10-inn sr</div>
              </div>
            )}
          </div>

          {/* Trend indicator */}
          <div className="mt-3 flex items-center gap-2">
            {battingTrend === "in-form" && (
              <span className="text-sm font-medium text-[--accent-green]">↑ In form</span>
            )}
            {battingTrend === "out-of-form" && (
              <span className="text-sm font-medium text-red-500">↓ Out of form</span>
            )}
          </div>

          {/* Last updated */}
          <div className="mt-2 text-xs text-[--text-muted]">
            Last 10 innings · Most recent: {form.last_updated}
          </div>
        </div>
      )}

      {/* Bowling Form Strip */}
      {form.bowling.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--text-muted]">
            Recent bowling form
          </h3>
          <div className="flex flex-wrap gap-2">
            {form.bowling.map((entry, idx) => {
              const economyDisplay = entry.economy !== null 
                ? entry.economy.toFixed(1) 
                : "–";
              return (
                <div
                  key={`bowl-${entry.match_id}-${idx}`}
                  title={`${entry.wickets}/${entry.runs_conceded} vs ${entry.opposition} (${entry.format_bucket}) · ${entry.date}`}
                  className={`form-chip ${getBowlingChipTone(entry.economy)} cursor-pointer`}
                  onClick={() => router.push(`/match/${entry.match_id}`)}
                >
                  <div className="form-chip-value">
                    {economyDisplay}
                    {entry.wickets > 0 && (
                      <sup className="text-xs font-bold">{entry.wickets}</sup>
                    )}
                  </div>
                  <div className="form-chip-format">{entry.format_bucket}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {bowlingEcon10 !== null && (
              <div className="form-metric-pill">
                <div className="form-metric-pill-value">{bowlingEcon10.toFixed(1)}</div>
                <div className="form-metric-pill-label">10-inn econ</div>
              </div>
            )}
          </div>

          {/* Last updated */}
          <div className="mt-2 text-xs text-[--text-muted]">
            Last 10 innings · Most recent: {form.last_updated}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Phase specialist detection ──────────────────────────────── */

interface PhaseSpecialist {
  label: string;
  phase: number; // 0=powerplay, 1=middle, 2=death
  type: "batting" | "bowling";
}

function detectPhaseSpecialists(
  battingPhases: PhaseStatBatting[],
  bowlingPhases: PhaseStatBowling[],
  battingBadge?: string | null,
  bowlingBadge?: string | null
): PhaseSpecialist[] {
  const specialists: PhaseSpecialist[] = [];

  // Add API badge fields if they exist
  if (battingBadge) {
    specialists.push({
      label: battingBadge,
      phase: -1,
      type: "batting",
    });
  }

  if (bowlingBadge) {
    specialists.push({
      label: bowlingBadge,
      phase: -1,
      type: "bowling",
    });
  }

  // Calculate overall batting SR from all phases
  let totalBattingRuns = 0;
  let totalBattingBalls = 0;
  for (const phase of battingPhases) {
    totalBattingRuns += phase.runs;
    totalBattingBalls += phase.balls;
  }
  const overallBattingSR = totalBattingBalls > 0 ? (totalBattingRuns * 100) / totalBattingBalls : 0;

  // Calculate overall bowling economy from all phases
  let totalBowlingRuns = 0;
  let totalBowlingBalls = 0;
  for (const phase of bowlingPhases) {
    totalBowlingRuns += phase.runs_conceded;
    totalBowlingBalls += phase.balls;
  }
  const overallBowlingEconomy = totalBowlingBalls > 0 ? (totalBowlingRuns / totalBowlingBalls) * 6 : 0;

  // Map phase names to phase numbers
  const phaseNameToNum: Record<string, number> = {
    powerplay: 0,
    middle: 1,
    death: 2,
  };

  const battingLabels: Record<number, string> = {
    0: "Powerplay Hitter",
    1: "Middle Overs Anchor",
    2: "Death Overs Finisher",
  };

  const bowlingLabels: Record<number, string> = {
    0: "Powerplay Specialist",
    1: "Middle Overs Controller",
    2: "Death Overs Expert",
  };

  // Check batting specialists
  if (!battingBadge) {
    for (const phase of battingPhases) {
      const phaseNum = phaseNameToNum[phase.phase_name] ?? -1;
      if (phaseNum >= 0 && phase.strike_rate !== null && phase.strike_rate >= overallBattingSR * 1.15 && phase.balls >= 100) {
        specialists.push({
          label: battingLabels[phaseNum],
          phase: phaseNum,
          type: "batting",
        });
      }
    }
  }

  // Check bowling specialists
  if (!bowlingBadge) {
    for (const phase of bowlingPhases) {
      const phaseNum = phaseNameToNum[phase.phase_name] ?? -1;
      if (phaseNum >= 0 && phase.economy !== null && phase.economy <= overallBowlingEconomy * 0.85 && phase.balls >= 100) {
        specialists.push({
          label: bowlingLabels[phaseNum],
          phase: phaseNum,
          type: "bowling",
        });
      }
    }
  }

  return specialists;
}

function getSpecialistBadgeVariant(label: string): "gold" | "phasePowerplay" | "phaseMiddle" | "phaseDeath" {
  const normalized = label.toLowerCase();
  if (normalized.includes("powerplay")) return "phasePowerplay";
  if (normalized.includes("middle")) return "phaseMiddle";
  if (normalized.includes("death")) return "phaseDeath";
  return "gold";
}

/* ── Main profile component ──────────────────────────────── */

export default function PlayerProfile({
  playerId,
}: {
  playerId: string;
}) {
  const searchParams = useSearchParams();
  const [batting, setBatting] = useState<BattingStats[] | null>(null);
  const [bowling, setBowling] = useState<BowlingStats[] | null>(null);
  const [form, setForm] = useState<PlayerForm | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [partnerships, setPartnerships] = useState<PartnershipStats[]>([]);
  const [phases, setPhases] = useState<{ batting: PhaseStatBatting[]; bowling: PhaseStatBowling[]; batting_specialist_badge?: string | null; bowling_specialist_badge?: string | null }>({ batting: [], bowling: [] });
  const [testSplits, setTestSplits] = useState<TestSplitsResponse>({ batting: [], bowling: [] });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Format is now the primary nav axis; role toggle lives inside sections
  const [activeFormat, setActiveFormat] = useState<string>("All");
  const [phaseRole, setPhaseRole] = useState<"batting" | "bowling">("batting");
  const [showAllPartnerships, setShowAllPartnerships] = useState(false);
  const [selectedBowler, setSelectedBowler] = useState<{ id: string; name: string } | null>(null);
  const [showYearBatting, setShowYearBatting] = useState(false);
  const [showYearBowling, setShowYearBowling] = useState(false);

  // Read ?bowler= param and resolve bowler name
  useEffect(() => {
    const bowlerId = searchParams.get("bowler");
    const bowlerName = searchParams.get("bowler_name");

    if (!bowlerId) {
      setSelectedBowler(null);
      return;
    }

    // If name is in URL, use it directly — no API call needed
    if (bowlerName) {
      setSelectedBowler({ id: bowlerId, name: bowlerName });
      return;
    }

    // Fallback when URL has no bowler_name param
    setSelectedBowler({ id: bowlerId, name: bowlerId });
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const [batData, bowlData, partData, phaseData, formData, testSplitData] = await Promise.all([
          api.getPlayerBatting(playerId),
          api.getPlayerBowling(playerId),
          api.getPlayerPartnerships(playerId),
          api.getPlayerPhases(playerId),
          api.getPlayerForm(playerId),
          api.getPlayerTestSplits(playerId),
        ]);

        if (batData.length === 0 && bowlData.length === 0) {
          setNotFound(true);
          return;
        }

        setBatting(sortStats(batData));
        setBowling(sortStats(bowlData));
        setPartnerships(partData);
        setPhases(phaseData);
        setForm(formData);
        setTestSplits(testSplitData);
      } catch (err) {
        console.error("Failed to load player data:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  // Refetch form when filter changes
  useEffect(() => {
    if (!playerId) return;
    
    const fetchForm = async () => {
      try {
        const formData = await api.getPlayerForm(playerId, formFilter || undefined);
        setForm(formData);
      } catch (error) {
        console.error('Error fetching form:', error);
      }
    };
    
    fetchForm();
  }, [playerId, formFilter]);

  if (loading) return <Skeleton />;

  if (notFound || (!batting?.length && !bowling?.length)) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-[--text-primary]">Player not found</h1>
        <p className="mt-2 text-[--text-muted]">
          We couldn&apos;t find any data for this player.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-[--accent-green] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Back to homepage
        </Link>
      </div>
    );
  }

  /* ── Derived data ────────────────────────────────────── */
  const playerName = batting?.[0]?.player_name ?? bowling?.[0]?.player_name ?? "Unknown";

  const hasIPL = batting?.some((r) => r.format === "T20" && r.competition_name === IPL_COMPETITION) ?? false;
  const badgeFormats = [
    ...(hasIPL ? ["IPL"] : []),
    ...BATTING_TAB_ORDER.filter(
      (t) => t !== "IPL" && (
        batting?.some((r) => {
          if (t === "T20I") return r.format === "IT20";
          if (t === "T20") return r.format === "T20" && r.competition_name !== IPL_COMPETITION;
          return r.format === t;
        }) ||
        bowling?.some((r) => r.format === (t === "T20I" ? "IT20" : t))
      )
    ),
  ];

  const totalWickets = bowling?.reduce((s, r) => s + r.wickets, 0) ?? 0;
  const phaseSpecialists = detectPhaseSpecialists(phases.batting, phases.bowling, phases.batting_specialist_badge, phases.bowling_specialist_badge);

  // Format tabs — only show formats that have data
  const formatTabs = ["All", ...badgeFormats];
  const activeHighlightBucket = getHighlightBucketForTab(activeFormat);

  // Filter batting/bowling rows for the active format tab
  const activeBatting = activeFormat === "All" ? (batting ?? []) : filterBattingRows(batting ?? [], activeFormat);
  const activeBowling = activeFormat === "All" ? (bowling ?? []) : filterBowlingRows(bowling ?? [], activeFormat);

  // Career aggregates for the active format (for HeroStatBar)
  const careerBat = activeBatting.length > 0 ? battingCareer(activeBatting) : null;
  const careerBowl = activeBowling.length > 0 ? bowlingCareer(activeBowling) : null;

  // Runs-by-year data for chart
  const runsChartData = activeBatting.map((r) => ({ year: r.year, value: r.runs }))
    .reduce<{ year: number; value: number }[]>((acc, cur) => {
      const existing = acc.find((x) => x.year === cur.year);
      if (existing) existing.value += cur.value;
      else acc.push({ ...cur });
      return acc;
    }, [])
    .sort((a, b) => a.year - b.year);

  // Wickets-by-year chart data
  const wicketsChartData = activeBowling.map((r) => ({ year: r.year, value: r.wickets }))
    .reduce<{ year: number; value: number }[]>((acc, cur) => {
      const existing = acc.find((x) => x.year === cur.year);
      if (existing) existing.value += cur.value;
      else acc.push({ ...cur });
      return acc;
    }, [])
    .sort((a, b) => a.year - b.year);

  // Phase data filtered to active format
  const fmtBucket = activeFormat === "T20I" ? "IT20" : activeFormat;
  const filteredBatPhases = activeFormat === "All"
    ? phases.batting
    : phases.batting.filter((p) => p.format_bucket === fmtBucket);
  const filteredBowlPhases = activeFormat === "All"
    ? phases.bowling
    : phases.bowling.filter((p) => p.format_bucket === fmtBucket);

  const activePhases = phaseRole === "batting" ? filteredBatPhases : filteredBowlPhases;
  const isTestFormat = activeFormat === "Test";
  const PHASE_ORDER = ["powerplay", "middle", "death"];

  const maxPhaseHeroVal = activePhases.length > 0
    ? Math.max(...activePhases.map((p) =>
        phaseRole === "batting"
          ? ((p as PhaseStatBatting).strike_rate ?? 0)
          : ((p as PhaseStatBowling).economy ?? 0)
      ))
    : 0;

  // Partnerships auto-filtered to active format
  const fmtPartners = partnerships.filter((p) => {
    if (activeFormat === "All") return true;
    if (activeFormat === "T20I") return p.format_bucket === "IT20";
    return p.format_bucket === fmtBucket;
  }).sort((a, b) => b.total_runs - a.total_runs);

  const maxPartnerRuns = fmtPartners[0]?.total_runs ?? 1;
  const featuredPartners = fmtPartners.slice(0, 3);
  const remainingPartners = fmtPartners.slice(3);

  // Batting form trend for callout
  let formTrend: "in-form" | "out-of-form" | null = null;
  let recentAvg: number | null = null;
  const careerAvg: number | null = careerBat?.average ?? null;
  if (form && form.batting.length >= 5) {
    recentAvg = form.batting.slice(0, 10).reduce((s, e) => s + e.runs, 0) / Math.min(form.batting.length, 10);
    if (careerAvg && recentAvg > careerAvg * 1.1) formTrend = "in-form";
    else if (careerAvg && recentAvg < careerAvg * 0.7) formTrend = "out-of-form";
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-5">
          <Avatar name={playerName} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-[--text-primary] sm:text-4xl">{playerName}</h1>
            <div className="mt-2 flex flex-wrap gap-2 stagger-children">
              {badgeFormats.map((f) => <Badge key={f} text={f} />)}
              {phaseSpecialists.map((s) => (
                <Badge
                  key={`${s.type}-${s.phase}`}
                  text={s.label}
                  variant={getSpecialistBadgeVariant(s.label)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Form alert callout */}
        {formTrend && recentAvg !== null && careerAvg !== null && (
          <div className={`form-status-pill ${formTrend === "in-form" ? "form-status-pill-in" : "form-status-pill-out"}`}>
            <div className="text-sm font-bold tracking-tight">
              {formTrend === "in-form" ? "↑ In form" : "↓ Lean patch"}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold tracking-wide opacity-80">
              10-inn avg {recentAvg.toFixed(1)} vs career {careerAvg.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {/* ── Format tabs (primary nav) ────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {formatTabs.map((fmt) => (
          <button
            key={fmt}
            onClick={() => { setActiveFormat(fmt); setShowAllPartnerships(false); }}
            className={`format-tab-pill ${
              activeFormat === fmt
                ? "format-tab-active"
                : "format-tab-inactive"
            }`}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* ── Hero stat bar ────────────────────────────────── */}
      {careerBat && (
        <HeroStatBar
          role="batting"
          highlightBucket={activeHighlightBucket}
          batting={{
            runs: careerBat.runs,
            average: careerBat.average,
            strike_rate: careerBat.strike_rate,
            hundreds: careerBat.hundreds,
            fifties: careerBat.fifties,
            highest_score: careerBat.highest_score,
            innings: careerBat.innings,
          }}
        />
      )}
      {!careerBat && careerBowl && (
        <HeroStatBar
          role="bowling"
          highlightBucket={activeHighlightBucket}
          bowling={{
            wickets: careerBowl.wickets,
            bowling_average: careerBowl.bowling_average,
            economy: careerBowl.economy,
            strike_rate: careerBowl.strike_rate,
            innings_bowled: careerBowl.innings_bowled,
          }}
        />
      )}

      {/* ── Runs by year chart ───────────────────────────── */}
      {runsChartData.length > 1 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="section-eyebrow">{activeFormat === "All" ? "RUNS" : `${activeFormat.toUpperCase()} RUNS`} BY YEAR</div>
          </div>
          <div className="rounded-2xl border border-[--glass-border] bg-[--bg-card] px-4 pt-4 pb-2">
            <RunsChart data={runsChartData} color="#f59e0b" label="Runs" />
          </div>
        </section>
      )}
      {wicketsChartData.length > 1 && totalWickets > 0 && !careerBat && (
        <section>
          <div className="section-eyebrow mb-2">{activeFormat === "All" ? "WICKETS" : `${activeFormat.toUpperCase()} WICKETS`} BY YEAR</div>
          <div className="rounded-2xl border border-[--glass-border] bg-[--bg-card] px-4 pt-4 pb-2">
            <RunsChart data={wicketsChartData} color="#3b82f6" label="Wickets" />
          </div>
        </section>
      )}

      {/* ── Phase / Innings breakdown ─────────────────────── */}
      {(filteredBatPhases.length > 0 || filteredBowlPhases.length > 0 || isTestFormat) && (
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="section-eyebrow">{isTestFormat ? "INNINGS BREAKDOWN" : "PHASE PERFORMANCE"}</div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-[10px] font-bold tracking-wider text-[--accent-green] uppercase">
                {activeFormat !== "All" ? `${activeFormat} · ` : ""}{phaseRole}
              </div>
              {!isTestFormat && (
                <div className="inline-flex items-center gap-1 rounded-xl bg-[--bg-surface] p-1">
                {(["batting", "bowling"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setPhaseRole(r)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-all duration-200 ${
                      phaseRole === r
                        ? "bg-[--bg-card] text-[--text-primary] shadow-sm"
                        : "text-[--text-muted] hover:text-[--text-secondary]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            {isTestFormat && (
              <div className="inline-flex items-center gap-1 rounded-xl bg-[--bg-surface] p-1">
                {(["batting", "bowling"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setPhaseRole(r)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-all duration-200 ${
                      phaseRole === r
                        ? "bg-[--bg-card] text-[--text-primary] shadow-sm"
                        : "text-[--text-muted] hover:text-[--text-secondary]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
          {isTestFormat ? (
            <InningsSplitSection splits={testSplits} role={phaseRole} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PHASE_ORDER.map((phaseName) => {
                const phase = activePhases.find((p) => p.phase_name === phaseName);
                return phase ? (
                  <PhaseCard key={phaseName} phase={phase} isBatting={phaseRole === "batting"} maxHeroVal={maxPhaseHeroVal} />
                ) : null;
              })}
              {activePhases.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-[--text-muted]">
                  No phase data for this format.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Year-by-year batting table ───────────────────── */}
      {activeBatting.length > 0 && (
        <section>
          {(() => {
            const bestBatSeason = activeBatting.reduce((best, cur) => cur.runs > (best?.runs || 0) ? cur : best, activeBatting[0]);
            return (
              <div 
                className="flex items-center justify-between py-3 cursor-pointer group select-none"
                onClick={() => setShowYearBatting(!showYearBatting)}
              >
                <div className="text-base font-bold text-[--text-primary] group-hover:text-[--accent-green] transition-colors tracking-tight">
                  Year-by-Year · {activeFormat === "All" ? "Batting" : activeFormat}
                </div>
                {bestBatSeason && (
                  <div className="flex items-center gap-5 text-sm">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-bold text-[--accent-green] text-base">{bestBatSeason.runs.toLocaleString()}</span>
                      <span className="text-[10px] uppercase tracking-widest text-[--text-muted]">Best season</span>
                    </div>
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-bold text-[--accent-green] text-base">{bestBatSeason.year}</span>
                      <span className="text-[10px] uppercase tracking-widest text-[--text-muted]">Peak year</span>
                    </div>
                    <span className="text-[--text-muted] text-xs">{showYearBatting ? "▲" : "▼"}</span>
                  </div>
                )}
              </div>
            );
          })()}
          {showYearBatting && (
            <div className="year-table-shell overflow-hidden rounded-2xl">
              <BattingSection data={activeBatting} />
            </div>
          )}
        </section>
      )}

      {/* ── Year-by-year bowling table ───────────────────── */}
      {totalWickets > 0 && activeBowling.length > 0 && (
        <section>
          {(() => {
            const bestBowlSeason = activeBowling.reduce((best, cur) => cur.wickets > (best?.wickets || 0) ? cur : best, activeBowling[0]);
            return (
              <div 
                className="flex items-center justify-between py-3 cursor-pointer group select-none"
                onClick={() => setShowYearBowling(!showYearBowling)}
              >
                <div className="text-base font-bold text-[--text-primary] group-hover:text-[--accent-blue] transition-colors tracking-tight">
                  Year-by-Year · {activeFormat === "All" ? "Bowling" : activeFormat}
                </div>
                {bestBowlSeason && (
                  <div className="flex items-center gap-5 text-sm">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-bold text-[--accent-blue] text-base">{bestBowlSeason.wickets}</span>
                      <span className="text-[10px] uppercase tracking-widest text-[--text-muted]">Best season</span>
                    </div>
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-bold text-[--accent-blue] text-base">{bestBowlSeason.year}</span>
                      <span className="text-[10px] uppercase tracking-widest text-[--text-muted]">Peak year</span>
                    </div>
                    <span className="text-[--text-muted] text-xs">{showYearBowling ? "▲" : "▼"}</span>
                  </div>
                )}
              </div>
            );
          })()}
          {showYearBowling && (
            <div className="year-table-shell overflow-hidden rounded-2xl">
              <BowlingSection data={activeBowling} />
            </div>
          )}
        </section>
      )}

      {/* ── Recent form (bottom) ─────────────────────────── */}
      {form && (
        <section className="border-t border-[--glass-border] pt-6">
          <FormGuide form={form} selectedFormat={formFilter} onFormatChange={setFormFilter} />
        </section>
      )}

      {/* ── Partnerships (redesigned) ────────────────────── */}
      {fmtPartners.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="section-eyebrow">Key Partnerships{activeFormat !== "All" ? ` · ${activeFormat}` : ""}</div>
            <span className="text-xs text-[--text-muted]">* Cricsheet data</span>
          </div>

          {/* Top 3 featured cards */}
          <div className="space-y-3">
            {featuredPartners.map((p, idx) => {
              const rankCls = ["rank-1", "rank-2", "rank-3"][idx] ?? "rank-n";
              const barPct = Math.round((p.total_runs / maxPartnerRuns) * 100);
              return (
                <div key={`${p.partner_id}-${idx}`} className="glass-card card-hover rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`rank-badge ${rankCls} mt-0.5`}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Link href={`/players/${p.partner_id}`} className="font-semibold text-[--text-primary] hover:text-[--accent-green] transition-colors">
                          {p.partner_name}
                        </Link>
                        <div className="flex gap-4 text-sm">
                          <div><span className="text-[--text-muted] text-xs mr-1">Inns</span><span className="font-semibold">{p.innings_together}</span></div>
                          <div><span className="text-[--text-muted] text-xs mr-1">Runs</span><span className="font-bold gradient-text-green">{p.total_runs.toLocaleString()}</span></div>
                          <div><span className="text-[--text-muted] text-xs mr-1">Avg</span><span className="font-semibold">{p.avg_partnership?.toFixed(1) ?? "—"}</span></div>
                          <div><span className="text-[--text-muted] text-xs mr-1">Best</span><span className="font-semibold text-[--accent-gold]">{p.best_partnership}</span></div>
                        </div>
                      </div>
                      <div className="partnership-bar-track">
                        <div className="partnership-bar-fill" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Remaining partnerships compact table */}
          {remainingPartners.length > 0 && (
            <div className="mt-3">
              {showAllPartnerships && (
                <div className="overflow-x-auto rounded-xl border border-[--glass-border] bg-[--bg-card]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[--glass-border] text-left text-xs font-medium uppercase tracking-wider text-[--text-muted]">
                        <th className="px-4 py-2">#</th>
                        <th className="px-4 py-2">Partner</th>
                        <th className="px-4 py-2 text-right">Inns</th>
                        <th className="px-4 py-2 text-right">Runs</th>
                        <th className="px-4 py-2 text-right">Avg</th>
                        <th className="px-4 py-2 text-right">Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remainingPartners.map((p, idx) => (
                        <tr key={`${p.partner_id}-${idx}`} className="hover:bg-[--bg-card-hover] even:bg-[--bg-surface]/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="rank-badge rank-n text-xs">{idx + 4}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Link href={`/players/${p.partner_id}`} className="font-medium text-[--text-primary] hover:text-[--accent-green] transition-colors">
                              {p.partner_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right text-[--text-secondary]">{p.innings_together}</td>
                          <td className="px-4 py-2.5 text-right font-semibold gradient-text-green">{p.total_runs.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-[--text-secondary]">{p.avg_partnership?.toFixed(1) ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right text-[--accent-gold] font-semibold">{p.best_partnership}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                onClick={() => setShowAllPartnerships(!showAllPartnerships)}
                className="mt-3 text-xs font-semibold text-[--accent-green] hover:opacity-80 transition-opacity"
              >
                {showAllPartnerships ? "↑ Show less" : `↓ Show all ${fmtPartners.length} partnerships`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Head-to-head matchup ─────────────────────────── */}
      <section className="border-t border-[--glass-border] pt-6">
        <h2 className="text-lg font-bold text-[--text-primary]">Head-to-head matchups</h2>
        <p className="mb-4 text-sm text-[--text-muted]">
          Search for a bowler to see how {playerName.split(" ").pop()} performs against them.
        </p>
        <MatchupSearch playerId={playerId} onSelectBowler={setSelectedBowler} />
        {selectedBowler && (
          <div className="mt-6 max-w-lg">
            <MatchupCard
              batterId={playerId}
              bowlerId={selectedBowler.id}
              batterName={playerName}
              bowlerName={selectedBowler.name}
            />
          </div>
        )}
      </section>
    </div>
  );
}
