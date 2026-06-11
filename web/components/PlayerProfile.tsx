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
  type PlayerVenueSplit,
  type PlayerVenueSplitsResponse,
  type PlayerMetadata,
  type TestInningsSplitBatting,
  type TestInningsSplitBowling,
  type PlayerPhasesResponse,
} from "@/lib/api";
import {
  HIGHLIGHT_THRESHOLDS,
  getHighlightBucketForFormat,
  getHighlightBucketForTab,
} from "@/lib/highlights";

const BATTING_TAB_ORDER = ["Test", "ODI", "T20I", "IPL", "T20"];
const IPL_COMPETITION = "Indian Premier League";

const TAB_LABELS: Record<string, string> = {
  Test: "Tests",
  ODI: "ODIs",
  T20I: "T20Is",
  IPL: "IPL",
  T20: "All T20s",
};

const COUNTRY_FLAGS: Record<string, string> = {
  India: "🇮🇳",
  Australia: "🇦🇺",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "South Africa": "🇿🇦",
  "New Zealand": "🇳🇿",
  Pakistan: "🇵🇰",
  "Sri Lanka": "🇱🇰",
  Bangladesh: "🇧🇩",
  "West Indies": "🌴",
  Zimbabwe: "🇿🇼",
  Afghanistan: "🇦🇫",
  Ireland: "🇮🇪",
  Netherlands: "🇳🇱",
  Nepal: "🇳🇵",
  Namibia: "🇳🇦",
  Oman: "🇴🇲",
  USA: "🇺🇸",
  UAE: "🇦🇪",
  Canada: "🇨🇦",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
};

function sortStats<T extends { format: string }>(rows: T[]): T[] {
  const order: Record<string, number> = {
    Test: 0,
    ODI: 1,
    T20I: 2,
    IPL: 3,
    T20: 4,
    IT20: 5,
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
    five_w: rows.reduce((s, r) => s + (r.five_w || 0), 0),
    ten_w: rows.reduce((s, r) => s + (r.ten_w || 0), 0),
  };
}

function aggregateBattingByYear(rows: BattingStats[]): BattingStats[] {
  const yearsMap = new Map<number, BattingStats[]>();
  for (const r of rows) {
    if (!yearsMap.has(r.year)) {
      yearsMap.set(r.year, []);
    }
    yearsMap.get(r.year)!.push(r);
  }

  const aggregated: BattingStats[] = [];
  for (const [year, yearRows] of yearsMap.entries()) {
    const totalRuns = yearRows.reduce((s, r) => s + r.runs, 0);
    const totalBalls = yearRows.reduce((s, r) => s + r.balls_faced, 0);
    const totalInnings = yearRows.reduce((s, r) => s + r.innings, 0);
    const dismissals = yearRows.reduce((sum, r) => sum + (r.average && r.average > 0 ? Math.round(r.runs / r.average) : 0), 0);
    const avg = dismissals > 0 ? totalRuns / dismissals : null;
    const sr = totalBalls > 0 ? (totalRuns * 100) / totalBalls : null;

    aggregated.push({
      player_id: yearRows[0].player_id,
      player_name: yearRows[0].player_name,
      format: "Combined",
      year,
      competition_name: null,
      matches: yearRows.reduce((s, r) => s + (r.matches || 0), 0),
      innings: totalInnings,
      runs: totalRuns,
      balls_faced: totalBalls,
      average: avg,
      strike_rate: sr,
      hundreds: yearRows.reduce((s, r) => s + r.hundreds, 0),
      fifties: yearRows.reduce((s, r) => s + r.fifties, 0),
      highest_score: Math.max(...yearRows.map((r) => r.highest_score)),
      ducks: yearRows.reduce((s, r) => s + (r.ducks || 0), 0),
    });
  }

  return aggregated.sort((a, b) => b.year - a.year);
}

function aggregateBowlingByYear(rows: BowlingStats[]): BowlingStats[] {
  const yearsMap = new Map<number, BowlingStats[]>();
  for (const r of rows) {
    if (!yearsMap.has(r.year)) {
      yearsMap.set(r.year, []);
    }
    yearsMap.get(r.year)!.push(r);
  }

  const aggregated: BowlingStats[] = [];
  for (const [year, yearRows] of yearsMap.entries()) {
    const totalWickets = yearRows.reduce((s, r) => s + r.wickets, 0);
    const totalRuns = yearRows.reduce((s, r) => s + r.runs_conceded, 0);
    let totalBalls = 0;
    for (const r of yearRows) {
      if (r.economy && r.economy > 0) {
        totalBalls += Math.round((r.runs_conceded / r.economy) * 6);
      }
    }
    const economy = totalBalls > 0 ? (totalRuns / totalBalls) * 6 : null;
    const avg = totalWickets > 0 ? totalRuns / totalWickets : null;
    const sr = totalWickets > 0 && totalBalls > 0 ? totalBalls / totalWickets : null;

    aggregated.push({
      player_id: yearRows[0].player_id,
      player_name: yearRows[0].player_name,
      format: "Combined",
      year,
      competition_name: null,
      innings_bowled: yearRows.reduce((s, r) => s + r.innings_bowled, 0),
      wickets: totalWickets,
      runs_conceded: totalRuns,
      economy,
      bowling_average: avg,
      strike_rate: sr,
      five_w: yearRows.reduce((s, r) => s + (r.five_w || 0), 0),
      ten_w: yearRows.reduce((s, r) => s + (r.ten_w || 0), 0),
    });
  }

  return aggregated.sort((a, b) => b.year - a.year);
}

/* ── Batting/Bowling rows filtering ────────────────────── */

function filterBattingRows(data: BattingStats[], tab: string): BattingStats[] {
  switch (tab) {
    case "IPL":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name === IPL_COMPETITION
      );
    case "T20I":
      return data.filter(
        (r) =>
          r.format === "IT20" ||
          r.format === "T20I" ||
          (r.format === "T20" &&
            (r.competition_name === null ||
              !["Indian Premier League", "SA20", "The Hundred Men's Competition", "International League T20", "Major League Cricket"].includes(
                r.competition_name
              )))
      );
    case "T20":
      return data.filter((r) => r.format === "T20" || r.format === "IT20" || r.format === "T20I");
    default:
      return data.filter((r) => r.format === tab);
  }
}

function filterBowlingRows(data: BowlingStats[], tab: string): BowlingStats[] {
  switch (tab) {
    case "IPL":
      return data.filter(
        (r) => r.format === "T20" && r.competition_name === IPL_COMPETITION
      );
    case "T20I":
      return data.filter(
        (r) =>
          r.format === "IT20" ||
          r.format === "T20I" ||
          (r.format === "T20" &&
            (r.competition_name === null ||
              !["Indian Premier League", "SA20", "The Hundred Men's Competition", "International League T20", "Major League Cricket"].includes(
                r.competition_name
              )))
      );
    case "T20":
      return data.filter((r) => r.format === "T20" || r.format === "IT20" || r.format === "T20I");
    default:
      return data.filter((r) => r.format === tab);
  }
}

/* ── Batting Table ────────────────────── */

function BattingSection({ data, expanded = false }: { data: BattingStats[]; expanded?: boolean }) {
  if (data.length === 0) return null;

  const career = battingCareer(data);
  const aggregated = aggregateBattingByYear(data);
  const displayRows = expanded ? aggregated : aggregated.slice(0, 5);

  return (
    <div className="overflow-x-auto">
      <table className="year-table w-full min-w-[640px] text-sm font-mono">
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
          <BattingRow row={career} isCareer />
          {displayRows.map((r) => (
            <BattingRow
              key={`${r.format}-${r.year}-${r.competition_name ?? "other"}`}
              row={r}
            />
          ))}
        </tbody>
      </table>
    </div>
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

  const tColor = isCareer ? "text-text-primary" : "text-text-secondary";
  const thresholds = HIGHLIGHT_THRESHOLDS[getHighlightBucketForFormat(r.format)];

  const getRunsColor = (runs: number) =>
    !isCareer && runs >= thresholds.batting.runsGreen ? "stat-pop-green" : tColor;
  const getAvgColor = (avg: number | null) => {
    if (isCareer || avg === null) return isCareer ? "text-text-primary" : tColor;
    if (avg >= thresholds.batting.avgGreen) return "stat-pop-green";
    if (avg < thresholds.batting.avgRed) return "stat-pop-red";
    return tColor;
  };
  const getStrikeRateColor = (sr: number | null) => {
    if (isCareer || sr === null) return isCareer ? "text-text-primary" : tColor;
    if (sr >= thresholds.batting.strikeRateGreen) return "stat-pop-green";
    if (sr < thresholds.batting.strikeRateRed) return "stat-pop-red";
    return tColor;
  };
  const getHighestScoreColor = (highestScore: number) => {
    if (isCareer) return "text-text-primary";
    if (highestScore >= thresholds.hero.highScoreGold) return "stat-pop-gold";
    return tColor;
  };
  const get100sColor = (hundreds: number) => {
    if (isCareer) return "text-text-primary";
    return hundreds === 0 ? "stat-pop-red" : "stat-pop-gold";
  };
  const get50sColor = (fifties: number) => {
    if (isCareer) return "text-text-primary";
    if (fifties >= thresholds.hero.fiftiesGold) return "stat-pop-gold";
    if (fifties === 0) return "stat-pop-red";
    return tColor;
  };

  return (
    <tr className={cls}>
      <td className="year-table-cell px-5 py-3 text-sm font-bold text-text-primary">
        {isCareer ? "Career" : r.year}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>{r.innings}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getRunsColor(r.runs)}`}>
        {r.runs.toLocaleString()}
      </td>
      <td
        className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${getHighestScoreColor(
          r.highest_score
        )}`}
      >
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

/* ── Bowling Table ────────────────────── */

function BowlingSection({ data, expanded = false }: { data: BowlingStats[]; expanded?: boolean }) {
  if (data.length === 0) return null;

  const career = bowlingCareer(data);
  const aggregated = aggregateBowlingByYear(data);
  const displayRows = expanded ? aggregated : aggregated.slice(0, 5);

  return (
    <div className="overflow-x-auto">
      <table className="year-table w-full min-w-[560px] text-sm font-mono">
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
          <BowlingRow row={career} isCareer />
          {displayRows.map((r) => (
            <BowlingRow key={`${r.format}-${r.year}-${r.competition_name ?? "other"}`} row={r} />
          ))}
        </tbody>
      </table>
    </div>
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

  const tColor = isCareer ? "text-text-primary" : "text-text-secondary";
  const thresholds = HIGHLIGHT_THRESHOLDS[getHighlightBucketForFormat(r.format)];

  const getWicketsColor = (wkts: number) =>
    !isCareer && wkts >= thresholds.bowling.wicketsBlue ? "stat-pop-blue" : tColor;
  const getEconColor = (econ: number | null) => {
    if (isCareer || econ === null) return isCareer ? "text-text-primary" : tColor;
    if (econ <= thresholds.bowling.economyGreen) return "stat-pop-green";
    if (econ > thresholds.bowling.economyRed) return "stat-pop-red";
    return tColor;
  };

  return (
    <tr className={cls}>
      <td className="year-table-cell px-5 py-3 text-sm font-bold text-text-primary">
        {isCareer ? "Career" : r.year}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>{r.innings_bowled}</td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getWicketsColor(r.wickets)}`}>
        {r.wickets}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${tColor}`}>
        {r.runs_conceded.toLocaleString()}
      </td>
      <td className={`year-table-cell px-5 py-3 text-right text-sm ${getEconColor(r.economy)}`}>
        {r.economy?.toFixed(2) ?? "–"}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${tColor}`}>
        {r.bowling_average?.toFixed(2) ?? "–"}
      </td>
      <td className={`year-table-cell hidden px-5 py-3 text-right text-sm sm:table-cell ${tColor}`}>
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
    </tr>
  );
}

/* ── Skeleton Loader ────────────────────── */

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
          <div
            key={i}
            className="h-10 rounded-lg shimmer"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Redesigned Phase Card ────────────────────── */

const PHASE_META: Record<
  string,
  { label: string; cls: string; accentCls: string; barColor: string }
> = {
  powerplay: {
    label: "Powerplay",
    cls: "phase-powerplay",
    accentCls: "phase-powerplay-accent text-accent-blue",
    barColor: "#3b82f6",
  },
  middle: {
    label: "Middle Overs",
    cls: "phase-middle",
    accentCls: "phase-middle-accent text-accent-gold",
    barColor: "#f59e0b",
  },
  death: {
    label: "Death Overs",
    cls: "phase-death",
    accentCls: "phase-death-accent text-accent-red",
    barColor: "#ef4444",
  },
};

function PhaseCard({
  phase,
  isBatting,
  maxHeroVal,
}: {
  phase: PhaseStatBatting | PhaseStatBowling;
  isBatting: boolean;
  maxHeroVal: number;
}) {
  const meta = PHASE_META[phase.phase_name] ?? {
    label: phase.phase_name,
    cls: "",
    accentCls: "text-text-muted",
    barColor: "#6b7280",
  };
  const heroVal = isBatting
    ? (phase as PhaseStatBatting).strike_rate ?? 0
    : (phase as PhaseStatBowling).economy ?? 0;
  const barPct = maxHeroVal > 0 ? Math.min((heroVal / maxHeroVal) * 100, 100) : 0;
  const bat = phase as PhaseStatBatting;
  const bowl = phase as PhaseStatBowling;

  return (
    <div className={`profile-card p-5 ${meta.cls} flex flex-col gap-1`}>
      <div className={`section-eyebrow font-mono ${meta.accentCls}`}>{meta.label}</div>
      <div className={`phase-hero-stat mt-1 font-serif text-2xl font-bold ${meta.accentCls}`}>
        {isBatting ? (bat.strike_rate ?? "—") : (bowl.economy ?? "—")}
      </div>
      <div className="text-xs text-text-muted mb-1 font-mono uppercase tracking-wider">{isBatting ? "Strike Rate" : "Economy"}</div>
      <div className="phase-bar-track h-1 bg-bg-surface rounded-full overflow-hidden mb-3">
        <div
          className="phase-bar-fill h-full transition-all duration-500"
          style={{ width: `${barPct}%`, background: meta.barColor }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 text-sm font-mono">
        <div>
          <div className="text-[10px] text-text-muted">Avg</div>
          <div className="font-semibold text-text-primary text-xs">
            {isBatting
              ? bat.average !== null
                ? bat.average.toFixed(2)
                : "—"
              : bowl.wickets > 0
              ? (bowl.runs_conceded / bowl.wickets).toFixed(2)
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted">Runs</div>
          <div className="font-semibold text-text-primary text-xs">
            {isBatting ? bat.runs.toLocaleString() : bowl.runs_conceded.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted">Balls</div>
          <div className="font-semibold text-text-secondary text-xs">{isBatting ? bat.balls : bowl.balls}</div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted">Dot%</div>
          <div className="font-semibold text-text-secondary text-xs">
            {isBatting
              ? bat.dot_ball_pct !== null
                ? bat.dot_ball_pct.toFixed(1) + "%"
                : "—"
              : bowl.dot_ball_pct !== null
              ? bowl.dot_ball_pct.toFixed(1) + "%"
              : "—"}
          </div>
        </div>
        {isBatting && (
          <div>
            <div className="text-[10px] text-text-muted">Boundary%</div>
            <div className="font-semibold text-accent-gold text-xs">
              {bat.boundary_pct !== null ? bat.boundary_pct.toFixed(1) + "%" : "—"}
            </div>
          </div>
        )}
        {!isBatting && (
          <div>
            <div className="text-[10px] text-text-muted">Wickets</div>
            <div className="font-semibold text-accent-green text-xs">{bowl.wickets}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Test Innings Split ────────────────────── */

function InningsSplitSection({
  splits,
  role,
}: {
  splits: TestSplitsResponse;
  role: "batting" | "bowling";
}) {
  const data = role === "batting" ? splits.batting : splits.bowling;
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-text-muted font-mono">
        No Test {role} data available.
      </div>
    );
  }
  const labels = ["1st Innings", "2nd Innings"];
  const clsSide = ["innings-1st", "innings-2nd"];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
      {data.map((d, i) => (
        <div
          key={d.innings_number}
          className={`innings-split-card profile-card p-5 pl-7 ${clsSide[i] ?? ""}`}
        >
          <div className="section-eyebrow mb-1 font-mono">{labels[i] ?? `Innings ${d.innings_number}`}</div>
          {role === "batting" ? (
            <>
              <div className="phase-hero-stat font-serif text-3xl font-bold text-accent-green mb-0.5">
                {(d as TestInningsSplitBatting).average?.toFixed(2) ?? "—"}
              </div>
              <div className="text-xs text-text-muted mb-3 font-mono uppercase tracking-wider">Average</div>
              <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                <div>
                  <div className="text-[10px] text-text-muted">Innings</div>
                  <div className="font-semibold text-xs">{d.innings_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">SR</div>
                  <div className="font-semibold text-xs">
                    {(d as TestInningsSplitBatting).strike_rate?.toFixed(2) ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Runs</div>
                  <div className="font-semibold text-xs">
                    {(d as TestInningsSplitBatting).runs.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">HS</div>
                  <div className="font-semibold text-accent-gold text-xs">
                    {(d as TestInningsSplitBatting).highest_score}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">100s</div>
                  <div className="font-semibold text-xs">{(d as TestInningsSplitBatting).hundreds}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">50s</div>
                  <div className="font-semibold text-xs">{(d as TestInningsSplitBatting).fifties}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="phase-hero-stat font-serif text-3xl font-bold text-accent-blue mb-0.5">
                {(d as TestInningsSplitBowling).economy?.toFixed(2) ?? "—"}
              </div>
              <div className="text-xs text-text-muted mb-3 font-mono uppercase tracking-wider">Economy</div>
              <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                <div>
                  <div className="text-[10px] text-text-muted">Innings</div>
                  <div className="font-semibold text-xs">{d.innings_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Wickets</div>
                  <div className="font-semibold text-accent-green text-xs">
                    {(d as TestInningsSplitBowling).wickets}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Avg</div>
                  <div className="font-semibold text-xs">
                    {(d as TestInningsSplitBowling).bowling_average?.toFixed(2) ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">SR</div>
                  <div className="font-semibold text-xs">
                    {(d as TestInningsSplitBowling).strike_rate?.toFixed(1) ?? "—"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Head-to-Head Search ────────────────────── */

function MatchupSearch({
  playerId,
  onSelectBowler,
  role,
}: {
  playerId: string;
  onSelectBowler: (bowler: { id: string; name: string }) => void;
  role: "batting" | "bowling";
}) {
  const router = useRouter();
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
      router.push(
        `/players/${playerId}?bowler=${player.player_id}&bowler_name=${encodeURIComponent(
          player.name
        )}`,
        { scroll: false }
      );
    },
  });

  return (
    <div ref={wrapperRef} className="relative max-w-sm">
      <div className={`profile-search-wrap ${role === "bowling" ? "profile-search-wrap-bowl" : ""}`}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" opacity=".4">
          <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a bowler to compare against..."
        />
      </div>
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-accent-green" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-text-muted/30 bg-bg-card shadow-lg">
          <ul>
            {results.map((p) => (
              <li key={p.player_id}>
                <Link
                  href={`/players/${playerId}?bowler=${p.player_id}&bowler_name=${encodeURIComponent(
                    p.name
                  )}`}
                  scroll={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlayer(p)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary"
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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-text-muted/30 bg-bg-card px-4 py-3 text-sm text-text-muted shadow-lg">
          No players found
        </div>
      )}
    </div>
  );
}

/* ── Form Guide ────────────────────── */

interface FormGuideProps {
  form: PlayerForm;
  selectedFormat: string | null;
  onFormatChange: (format: string | null) => void;
  role: "batting" | "bowling";
}

function FormGuide({ form, selectedFormat, onFormatChange, role }: FormGuideProps) {
  const router = useRouter();

  if (!form || (form.batting.length === 0 && form.bowling.length === 0)) {
    return null;
  }

  // Calculate batting trend
  let battingTrend: "in-form" | "out-of-form" | null = null;
  if (form.batting.length >= 5) {
    const recent5Avg = form.batting.slice(0, 5).reduce((sum, e) => sum + e.runs, 0) / 5;
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
  const bowlingWickets10 = bowlingRecent.reduce((sum, entry) => sum + entry.wickets, 0);
  const bowlingEcon10 = bowlingBalls10 > 0 ? (bowlingRuns10 * 6) / bowlingBalls10 : null;

  const getBattingChipTone = (
    runs: number,
    ballsFaced: number,
    wasDismissed: boolean,
    formatBucket: string
  ): string => {
    const isT20Format =
      formatBucket === "T20" ||
      formatBucket === "T20I" ||
      formatBucket === "IT20" ||
      formatBucket === "IPL";

    if (isT20Format) {
      const sr = ballsFaced > 0 ? (runs * 100) / ballsFaced : 0;
      if (runs === 0 && wasDismissed) return "form-chip-duck";
      if (runs >= 40 && sr >= 160) return "form-chip-elite";
      if (runs >= 25 && sr >= 140) return "form-chip-good";
      if (runs >= 10 && sr >= 100) return "form-chip-ok";
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

  const showBatting = form.batting.length > 0;
  const showBowling = form.bowling.length > 0;

  const battingStrip = showBatting && (
    <div className="animate-fade-in w-full">
      <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-accent-green mb-2">
        🏏 Batting
      </div>
      <div className="profile-form-row">
        <span className="profile-form-discipline">Runs</span>
        <div className="profile-fpills">
          {form.batting.map((entry, idx) => {
            const tone = getBattingChipTone(
              entry.runs,
              entry.balls_faced,
              entry.was_dismissed,
              entry.format_bucket
            );
            const toneClass =
              tone === "form-chip-elite" ? "profile-fp-hi" :
              tone === "form-chip-good" ? "profile-fp-md" :
              tone === "form-chip-ok" ? "profile-fp-zero" :
              tone === "form-chip-poor" || tone === "form-chip-duck" ? "profile-fp-lo" :
              "profile-fp-zero";
            return (
              <div
                key={`bat-${entry.match_id}-${idx}`}
                title={`${entry.runs}${!entry.was_dismissed ? "*" : ""} vs ${entry.opposition} (${
                  entry.format_bucket
                }) · ${entry.date}`}
                className={`profile-fp ${toneClass} cursor-pointer`}
                onClick={() => router.push(`/match/${entry.match_id}`)}
              >
                <div>
                  {entry.runs}
                  {!entry.was_dismissed ? "*" : ""}
                </div>
                <span className="profile-fp-fmt">{entry.format_bucket}</span>
              </div>
            );
          })}
        </div>
        <div className="profile-form-summary">
          {battingAvg10 !== null && (
            <div className="profile-fsb">
              <div className="profile-fsb-v text-accent-gold">{battingAvg10.toFixed(1)}</div>
              <div className="profile-fsb-l">Avg</div>
            </div>
          )}
          {battingSr10 !== null && (
            <div className="profile-fsb">
              <div className="profile-fsb-v text-accent-blue">{battingSr10.toFixed(1)}</div>
              <div className="profile-fsb-l">SR</div>
            </div>
          )}
        </div>
      </div>
      <div className="profile-form-status">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
        {battingTrend === "in-form" && (
          <span className="text-accent-green font-bold ml-1.5">↑ In Form</span>
        )}
        {battingTrend === "out-of-form" && (
          <span className="text-accent-red font-bold ml-1.5">↓ Lean patch</span>
        )}
        {!battingTrend && (
          <span className="text-text-muted ml-1.5">Stable Form</span>
        )}
        <span className="text-text-muted opacity-60">
          &nbsp;· Last 10 innings · Most recent: {form.last_updated || "—"}
        </span>
      </div>
    </div>
  );

  const bowlingStrip = showBowling && (
    <div className="animate-fade-in w-full">
      <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-accent-blue mb-2">
        🔴 Bowling Economy
      </div>
      <div className="profile-form-row">
        <span className="profile-form-discipline">Econ</span>
        <div className="profile-fpills">
          {form.bowling.map((entry, idx) => {
            const economyDisplay = entry.economy !== null ? entry.economy.toFixed(1) : "–";
            const tone = getBowlingChipTone(entry.economy);
            const toneClass =
              tone === "form-chip-elite" ? "profile-fp-wkt" :
              tone === "form-chip-good" ? "profile-fp-wkt" :
              tone === "form-chip-ok" ? "profile-fp-wkt" :
              tone === "form-chip-poor" ? "profile-fp-lo" :
              "profile-fp-zero";
            return (
              <div
                key={`bowl-${entry.match_id}-${idx}`}
                title={`${entry.wickets}/${entry.runs_conceded} vs ${entry.opposition} (${
                  entry.format_bucket
                }) · ${entry.date}`}
                className={`profile-fp ${toneClass} cursor-pointer`}
                onClick={() => router.push(`/match/${entry.match_id}`)}
              >
                <div>
                  {economyDisplay}
                  {entry.wickets > 0 && <sup className="text-[8px] font-bold ml-0.5">{entry.wickets}</sup>}
                </div>
                <span className="profile-fp-fmt">{entry.format_bucket}</span>
              </div>
            );
          })}
        </div>
        <div className="profile-form-summary">
          {bowlingEcon10 !== null && (
            <div className="profile-fsb">
              <div className="profile-fsb-v text-accent-blue">{bowlingEcon10.toFixed(1)}</div>
              <div className="profile-fsb-l">Econ</div>
            </div>
          )}
          <div className="profile-fsb">
            <div className="profile-fsb-v text-accent-green">{bowlingWickets10}</div>
            <div className="profile-fsb-l">Wkts</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-6 space-y-6 pt-2">
      {/* Format Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onFormatChange(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedFormat === null
              ? "bg-accent-green text-white"
              : "bg-bg-card text-text-secondary hover:bg-bg-surface border border-glass-border"
          }`}
        >
          All Formats
        </button>
        {["Test", "ODI", "T20I", "IPL", "T20"].map((fmt) => (
          <button
            key={fmt}
            onClick={() => onFormatChange(fmt)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedFormat === fmt
                ? "bg-accent-green text-white"
                : "bg-bg-card text-text-secondary hover:bg-bg-surface border border-glass-border"
            }`}
          >
            {TAB_LABELS[fmt] ?? fmt}
          </button>
        ))}
      </div>

      <div className="profile-form-wrap">
        {role === "batting" ? (
          <>
            {battingStrip}
            {showBatting && showBowling && (
              <div className="profile-form-divider" />
            )}
            {bowlingStrip}
          </>
        ) : (
          <>
            {bowlingStrip}
            {showBatting && showBowling && (
              <div className="profile-form-divider" />
            )}
            {battingStrip}
          </>
        )}
      </div>

      <div className="mt-2 text-xs text-text-muted">
        Last 10 innings · Most recent: {form.last_updated || "—"}
      </div>
    </div>
  );
}

/* ── Phase Specialist Detection ────────────────────── */

interface PhaseSpecialist {
  label: string;
  phase: number; // -1=badge, 0=powerplay, 1=middle, 2=death
  type: "batting" | "bowling";
}

function detectPhaseSpecialists(
  battingPhases: PhaseStatBatting[],
  bowlingPhases: PhaseStatBowling[],
  battingBadge?: string | null,
  bowlingBadge?: string | null
): PhaseSpecialist[] {
  const specialists: PhaseSpecialist[] = [];

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

  let totalBattingRuns = 0;
  let totalBattingBalls = 0;
  for (const phase of battingPhases) {
    totalBattingRuns += phase.runs;
    totalBattingBalls += phase.balls;
  }
  const overallBattingSR = totalBattingBalls > 0 ? (totalBattingRuns * 100) / totalBattingBalls : 0;

  let totalBowlingRuns = 0;
  let totalBowlingBalls = 0;
  for (const phase of bowlingPhases) {
    totalBowlingRuns += phase.runs_conceded;
    totalBowlingBalls += phase.balls;
  }
  const overallBowlingEconomy = totalBowlingBalls > 0 ? (totalBowlingRuns / totalBowlingBalls) * 6 : 0;

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

  if (!battingBadge) {
    for (const phase of battingPhases) {
      const phaseNum = phaseNameToNum[phase.phase_name] ?? -1;
      if (
        phaseNum >= 0 &&
        phase.strike_rate !== null &&
        phase.strike_rate >= overallBattingSR * 1.15 &&
        phase.balls >= 100
      ) {
        specialists.push({
          label: battingLabels[phaseNum],
          phase: phaseNum,
          type: "batting",
        });
      }
    }
  }

  if (!bowlingBadge) {
    for (const phase of bowlingPhases) {
      const phaseNum = phaseNameToNum[phase.phase_name] ?? -1;
      if (
        phaseNum >= 0 &&
        phase.economy !== null &&
        phase.economy <= overallBowlingEconomy * 0.85 &&
        phase.balls >= 100
      ) {
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

function getSpecialistBadgeVariant(
  label: string
): "gold" | "phasePowerplay" | "phaseMiddle" | "phaseDeath" | "test" | "odi" | "t20" | "ipl" | "special" {
  const normalized = label.toLowerCase();
  if (normalized.includes("powerplay")) return "t20";
  if (normalized.includes("middle")) return "test";
  if (normalized.includes("death")) return "special";
  return "special";
}

function getFormatBadgeVariant(format: string): "gold" | "glass" | "outline" | "filled" | "test" | "odi" | "t20" | "ipl" | "special" {
  if (format === "Test") return "test";
  if (format === "ODI") return "odi";
  if (format === "T20I" || format === "T20") return "t20";
  return "ipl";
}

/* ── Venue Card ────────────────────── */

function VenueCard({
  split,
  role,
  totalRuns,
  totalWickets,
}: {
  split: PlayerVenueSplit;
  role: "batting" | "bowling";
  totalRuns: number;
  totalWickets: number;
}) {
  const isBat = role === "batting";
  const pct = isBat
    ? totalRuns > 0
      ? (split.runs / totalRuns) * 100
      : 0
    : totalWickets > 0
    ? ((split.wickets || 0) / totalWickets) * 100
    : 0;

  const barColor = isBat ? "bg-accent-green" : "bg-accent-blue";

  const icon = split.venue_type === "home" ? "🏠" : split.venue_type === "away" ? "✈️" : "🌐";
  const label = split.venue_type === "home" ? "Home" : split.venue_type === "away" ? "Away" : "Neutral";

  return (
    <div className="profile-card p-5 text-center flex flex-col justify-between">
      <div>
        <div className="section-eyebrow text-xs text-text-muted font-mono">
          {icon} {label}
        </div>
        <div
          className={`text-3xl font-serif font-bold mt-2 ${
            isBat ? "text-accent-green" : "text-accent-blue"
          }`}
        >
          {isBat ? split.runs.toLocaleString() : (split.wickets || 0).toLocaleString()}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5 font-mono uppercase tracking-wider">
          {isBat ? "runs scored" : "wickets taken"}
        </div>
        <div className="flex gap-2 justify-center mt-3 text-sm">
          <div className="flex-1 bg-ink4 rounded-lg p-2">
            <div className={`font-serif font-bold text-base ${isBat ? "text-accent-green" : "text-accent-blue"}`}>
              {split.average !== null ? split.average.toFixed(2) : "—"}
            </div>
            <div className="text-[9px] text-text-muted font-mono uppercase tracking-wider">Average</div>
          </div>
          <div className="flex-1 bg-ink4 rounded-lg p-2">
            <div className="font-serif font-bold text-base text-text-primary">
              {isBat
                ? split.strike_rate !== null
                  ? split.strike_rate.toFixed(1)
                  : "—"
                : split.economy !== null
                ? split.economy.toFixed(2)
                : "—"}
            </div>
            <div className="text-[9px] text-text-muted font-mono uppercase tracking-wider">{isBat ? "SR" : "Econ"}</div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 w-full bg-bg-surface rounded-full overflow-hidden border border-glass-border/20">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[10px] text-text-muted text-right mt-1.5 font-mono">
          {pct.toFixed(0)}% of total
        </div>
      </div>
    </div>
  );
}

/* ── Achievements Helper ────────────────────── */

function getAchievements(
  role: "batting" | "bowling",
  careerBat: BattingStats | null,
  careerBowl: BowlingStats | null,
  pomCount: number,
  yearsStr: string
) {
  const achs: { icon: string; title: string; desc: string }[] = [];

  if (pomCount > 0) {
    achs.push({
      icon: "🥇",
      title: `${pomCount}×`,
      desc: "Player of the Match awards in matches featured",
    });
  }

  if (role === "batting" && careerBat) {
    if (careerBat.hundreds > 0) {
      achs.push({
        icon: "🏆",
        title: `${careerBat.hundreds}`,
        desc: "Career centuries scored across selected format",
      });
    }
    if (careerBat.runs >= 1000) {
      achs.push({
        icon: "🎯",
        title: careerBat.runs.toLocaleString(),
        desc: "Total career runs scored in this format",
      });
    }
    if (careerBat.average && careerBat.average >= 40) {
      achs.push({
        icon: "📈",
        title: careerBat.average.toFixed(2),
        desc: "Career batting average — high-tier consistency",
      });
    }
    if (careerBat.highest_score > 0) {
      achs.push({
        icon: "⚡",
        title: `${careerBat.highest_score}`,
        desc: "Highest individual score in an innings",
      });
    }
    if (careerBat.fifties > 0) {
      achs.push({
        icon: "🏏",
        title: `${careerBat.fifties}`,
        desc: "Career half-centuries scored",
      });
    }
  } else if (role === "bowling" && careerBowl) {
    if (careerBowl.wickets > 0) {
      achs.push({
        icon: "🏆",
        title: `${careerBowl.wickets}`,
        desc: "Career wickets taken across selected format",
      });
    }
    if (careerBowl.economy && careerBowl.economy > 0) {
      achs.push({
        icon: "🎯",
        title: careerBowl.economy.toFixed(2),
        desc: "Career economy rate — run-scoring control",
      });
    }
    if (careerBowl.bowling_average && careerBowl.bowling_average > 0) {
      achs.push({
        icon: "📈",
        title: careerBowl.bowling_average.toFixed(2),
        desc: "Career bowling average — wicket-taking value",
      });
    }
    if (careerBowl.five_w > 0) {
      achs.push({
        icon: "⚡",
        title: `${careerBowl.five_w}`,
        desc: "Five-wicket hauls in an innings",
      });
    }
  }

  if (yearsStr) {
    achs.push({
      icon: "📅",
      title: yearsStr.replace("–", "-"),
      desc: "Active years duration in professional cricket",
    });
  }

  return achs;
}

/* ── Main Profile Component ────────────────────── */

export default function PlayerProfile({ playerId }: { playerId: string }) {
  const searchParams = useSearchParams();
  const [batting, setBatting] = useState<BattingStats[] | null>(null);
  const [bowling, setBowling] = useState<BowlingStats[] | null>(null);
  const [form, setForm] = useState<PlayerForm | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [partnerships, setPartnerships] = useState<PartnershipStats[]>([]);
  const [phases, setPhases] = useState<PlayerPhasesResponse>({ batting: [], bowling: [] });
  const [testSplits, setTestSplits] = useState<TestSplitsResponse>({ batting: [], bowling: [] });
  const [venueSplits, setVenueSplits] = useState<PlayerVenueSplitsResponse>({ batting: [], bowling: [] });
  const [playerMetadata, setPlayerMetadata] = useState<PlayerMetadata | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeFormat, setActiveFormat] = useState<string>("All");
  const [role, setRole] = useState<"batting" | "bowling">("batting");
  const [chartView, setChartView] = useState<string>("runs");
  
  const [showAllPartnerships, setShowAllPartnerships] = useState(false);
  const [selectedBowler, setSelectedBowler] = useState<{ id: string; name: string } | null>(null);
  const [showYearTable, setShowYearTable] = useState(false);

  // Read ?bowler= param and resolve bowler name
  useEffect(() => {
    const bowlerId = searchParams.get("bowler");
    const bowlerName = searchParams.get("bowler_name");

    if (!bowlerId) {
      setSelectedBowler(null);
      return;
    }

    if (bowlerName) {
      setSelectedBowler({ id: bowlerId, name: bowlerName });
      return;
    }

    setSelectedBowler({ id: bowlerId, name: bowlerId });
  }, [searchParams]);

  // Main page data fetch
  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const [batData, bowlData, partData, metaData] = await Promise.all([
          api.getPlayerBatting(playerId),
          api.getPlayerBowling(playerId),
          api.getPlayerPartnerships(playerId),
          api.getPlayerMetadata(playerId),
        ]);

        if (batData.length === 0 && bowlData.length === 0) {
          setNotFound(true);
          return;
        }

        const sortedBat = sortStats(batData);
        const sortedBowl = sortStats(bowlData);
        
        setBatting(sortedBat);
        setBowling(sortedBowl);
        setPartnerships(partData);
        setPlayerMetadata(metaData);

        // Auto fallback role if batting is empty
        if (sortedBat.length === 0 && sortedBowl.length > 0) {
          setRole("bowling");
          setChartView("wickets");
        } else {
          setRole("batting");
          setChartView("runs");
        }
      } catch (err) {
        console.error("Failed to load player data:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  // Sync Form guide filter with global format tab
  useEffect(() => {
    setFormFilter(activeFormat === "All" ? null : activeFormat);
  }, [activeFormat]);

  // Fetch format & role-specific slices (prevents skeleton layout flashes)
  useEffect(() => {
    if (!playerId) return;

    async function loadFormatSplits() {
      try {
        const fmt = activeFormat === "All" ? undefined : activeFormat;
        const [phaseData, venueSplitData, formData, testSplitData] = await Promise.all([
          api.getPlayerPhases(playerId, fmt),
          api.getPlayerVenueSplits(playerId, fmt),
          api.getPlayerForm(playerId, formFilter || undefined),
          api.getPlayerTestSplits(playerId),
        ]);
        setPhases(phaseData);
        setVenueSplits(venueSplitData);
        setForm(formData);
        setTestSplits(testSplitData);
      } catch (err) {
        console.error("Failed to load format specific splits:", err);
      }
    }
    loadFormatSplits();
  }, [playerId, activeFormat, formFilter]);

  if (loading) return <Skeleton />;

  if (notFound || (!batting?.length && !bowling?.length)) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Player not found</h1>
        <p className="mt-2 text-text-muted">We couldn&apos;t find any data for this player.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-accent-green px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Back to homepage
        </Link>
      </div>
    );
  }

  /* ── Derived data ────────────────────── */
  const playerName = batting?.[0]?.player_name ?? bowling?.[0]?.player_name ?? "Unknown";

  const badgeFormats = BATTING_TAB_ORDER.filter((t) => {
    return (
      (batting && filterBattingRows(batting, t).length > 0) ||
      (bowling && filterBowlingRows(bowling, t).length > 0)
    );
  });

  const totalWickets = bowling?.reduce((s, r) => s + r.wickets, 0) ?? 0;
  const phaseSpecialists = detectPhaseSpecialists(
    phases.batting,
    phases.bowling,
    phases.batting_specialist_badge,
    phases.bowling_specialist_badge
  );

  const formatTabs = ["All", ...badgeFormats];
  const activeHighlightBucket = getHighlightBucketForTab(activeFormat);

  const activeBatting =
    activeFormat === "All" ? batting ?? [] : filterBattingRows(batting ?? [], activeFormat);
  const activeBowling =
    activeFormat === "All" ? bowling ?? [] : filterBowlingRows(bowling ?? [], activeFormat);

  const careerBat = activeBatting.length > 0 ? battingCareer(activeBatting) : null;
  const careerBowl = activeBowling.length > 0 ? bowlingCareer(activeBowling) : null;

  const bestBatSeason =
    activeBatting.length > 0
      ? activeBatting.reduce((best, cur) => (cur.runs > (best?.runs || 0) ? cur : best), activeBatting[0])
      : null;

  const bestBowlSeason =
    activeBowling.length > 0
      ? activeBowling.reduce(
          (best, cur) => (cur.wickets > (best?.wickets || 0) ? cur : best),
          activeBowling[0]
        )
      : null;

  const activeDatasetLength = role === "batting"
    ? new Set(activeBatting.map(r => r.year)).size
    : new Set(activeBowling.map(r => r.year)).size;
  const showExpandButton = activeDatasetLength > 5;


  // Aggregate yearly data for chart based on role and selected chartView
  const getChartData = () => {
    if (role === "batting") {
      if (chartView === "runs") {
        return activeBatting
          .reduce<{ year: number; value: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            if (existing) existing.value += cur.runs;
            else acc.push({ year: cur.year, value: cur.runs });
            return acc;
          }, [])
          .sort((a, b) => a.year - b.year);
      } else if (chartView === "avg") {
        return activeBatting
          .reduce<{ year: number; runs: number; dismissals: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            const dismissals = cur.average && cur.average > 0 ? Math.round(cur.runs / cur.average) : 0;
            if (existing) {
              existing.runs += cur.runs;
              existing.dismissals += dismissals;
            } else {
              acc.push({ year: cur.year, runs: cur.runs, dismissals });
            }
            return acc;
          }, [])
          .map((x) => ({
            year: x.year,
            value: x.dismissals > 0 ? parseFloat((x.runs / x.dismissals).toFixed(2)) : x.runs,
          }))
          .sort((a, b) => a.year - b.year);
      } else {
        return activeBatting
          .reduce<{ year: number; value: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            if (existing) existing.value += cur.hundreds;
            else acc.push({ year: cur.year, value: cur.hundreds });
            return acc;
          }, [])
          .sort((a, b) => a.year - b.year);
      }
    } else {
      if (chartView === "wickets") {
        return activeBowling
          .reduce<{ year: number; value: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            if (existing) existing.value += cur.wickets;
            else acc.push({ year: cur.year, value: cur.wickets });
            return acc;
          }, [])
          .sort((a, b) => a.year - b.year);
      } else if (chartView === "economy") {
        return activeBowling
          .reduce<{ year: number; runs: number; balls: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            const balls = cur.economy && cur.economy > 0 ? Math.round((cur.runs_conceded / cur.economy) * 6) : 0;
            if (existing) {
              existing.runs += cur.runs_conceded;
              existing.balls += balls;
            } else {
              acc.push({ year: cur.year, runs: cur.runs_conceded, balls });
            }
            return acc;
          }, [])
          .map((x) => ({
            year: x.year,
            value: x.balls > 0 ? parseFloat(((x.runs / x.balls) * 6).toFixed(2)) : 0,
          }))
          .sort((a, b) => a.year - b.year);
      } else {
        return activeBowling
          .reduce<{ year: number; value: number }[]>((acc, cur) => {
            const existing = acc.find((x) => x.year === cur.year);
            if (existing) existing.value += cur.five_w || 0;
            else acc.push({ year: cur.year, value: cur.five_w || 0 });
            return acc;
          }, [])
          .sort((a, b) => a.year - b.year);
      }
    }
  };

  const activeChartData = getChartData();

  const chartOptions =
    role === "batting"
      ? [
          { key: "runs" as const, label: "Runs", color: "#4be277" },
          { key: "avg" as const, label: "Average", color: "#ffb95f" },
          { key: "hundreds" as const, label: "100s", color: "#7bbdee" },
        ]
      : [
          { key: "wickets" as const, label: "Wickets", color: "#7bbdee" },
          { key: "economy" as const, label: "Economy", color: "#ffb95f" },
          { key: "fiveW" as const, label: "5W Hauls", color: "#4be277" },
        ];

  const currentOption = chartOptions.find((opt) => opt.key === chartView) || chartOptions[0];

  // Phase data filtered (and aggregated) for active format.
  // The SQL always emits format_bucket='T20I' for IT20 rows (never 'IT20').
  // For All T20s the API returns rows per (phase, format_bucket); aggregate them.
  function aggregateBatPhases(rows: PhaseStatBatting[]): PhaseStatBatting[] {
    const map = new Map<string, PhaseStatBatting>();
    for (const p of rows) {
      if (!map.has(p.phase_name)) {
        map.set(p.phase_name, { ...p });
      } else {
        const e = map.get(p.phase_name)!;
        const balls = e.balls + p.balls;
        const runs = e.runs + p.runs;
        const dis = e.dismissals + p.dismissals;
        const dots = (e.dot_balls || 0) + (p.dot_balls || 0);
        const bounds = (e.boundaries || 0) + (p.boundaries || 0);
        map.set(p.phase_name, {
          ...e,
          balls, runs, dismissals: dis, dot_balls: dots, boundaries: bounds,
          format_bucket: "T20",
          strike_rate: balls > 0 ? Math.round(runs * 10000 / balls) / 100 : null,
          average: dis > 0 ? Math.round(runs * 100 / dis) / 100 : null,
          dot_ball_pct: balls > 0 ? Math.round(dots * 10000 / balls) / 100 : null,
          boundary_pct: balls > 0 ? Math.round(bounds * 10000 / balls) / 100 : null,
        });
      }
    }
    return Array.from(map.values());
  }
  function aggregateBowlPhases(rows: PhaseStatBowling[]): PhaseStatBowling[] {
    const map = new Map<string, PhaseStatBowling>();
    for (const p of rows) {
      if (!map.has(p.phase_name)) {
        map.set(p.phase_name, { ...p });
      } else {
        const e = map.get(p.phase_name)!;
        const balls = e.balls + p.balls;
        const runs = e.runs_conceded + p.runs_conceded;
        const dots = (e.dot_balls || 0) + (p.dot_balls || 0);
        const wkts = e.wickets + p.wickets;
        map.set(p.phase_name, {
          ...e,
          balls, runs_conceded: runs, dot_balls: dots, wickets: wkts,
          format_bucket: "T20",
          economy: balls > 0 ? Math.round(runs * 600 / balls) / 100 : null,
          dot_ball_pct: balls > 0 ? Math.round(dots * 10000 / balls) / 100 : null,
        });
      }
    }
    return Array.from(map.values());
  }

  const filteredBatPhases: PhaseStatBatting[] =
    activeFormat === "All"
      ? phases.batting
      : activeFormat === "T20"
      ? aggregateBatPhases(phases.batting)
      : phases.batting.filter((p) => p.format_bucket === activeFormat);
  const filteredBowlPhases: PhaseStatBowling[] =
    activeFormat === "All"
      ? phases.bowling
      : activeFormat === "T20"
      ? aggregateBowlPhases(phases.bowling)
      : phases.bowling.filter((p) => p.format_bucket === activeFormat);

  const activePhases = role === "batting" ? filteredBatPhases : filteredBowlPhases;
  const isTestFormat = activeFormat === "Test";
  const PHASE_ORDER = ["powerplay", "middle", "death"];

  const maxPhaseHeroVal =
    activePhases.length > 0
      ? Math.max(
          ...activePhases.map((p) =>
            role === "batting"
              ? (p as PhaseStatBatting).strike_rate ?? 0
              : (p as PhaseStatBowling).economy ?? 0
          )
        )
      : 0;

  // Partnerships — format_bucket in partnerships uses raw DB values ('IT20' for T20I, 'IPL', 'T20', 'ODI', 'Test')
  const fmtPartners = partnerships
    .filter((p) => {
      if (activeFormat === "All") return true;
      if (activeFormat === "T20I") return p.format_bucket === "IT20" || p.format_bucket === "T20I";
      if (activeFormat === "T20") return ["T20", "IT20", "IPL", "T20I"].includes(p.format_bucket);
      return p.format_bucket === activeFormat;
    })
    .sort((a, b) => b.total_runs - a.total_runs);

  const maxPartnerRuns = fmtPartners[0]?.total_runs ?? 1;
  const featuredPartners = fmtPartners.slice(0, 3);
  const remainingPartners = fmtPartners.slice(3);

  // Form trend callout
  let formTrend: "in-form" | "out-of-form" | null = null;
  let recentAvg: number | null = null;
  const careerAvg = careerBat?.average ?? null;
  if (form && form.batting.length >= 5) {
    recentAvg =
      form.batting.slice(0, 10).reduce((s, e) => s + e.runs, 0) /
      Math.min(form.batting.length, 10);
    if (careerAvg && recentAvg > careerAvg * 1.1) formTrend = "in-form";
    else if (careerAvg && recentAvg < careerAvg * 0.7) formTrend = "out-of-form";
  }

  const handleRoleChange = (newRole: "batting" | "bowling") => {
    setRole(newRole);
    setChartView(newRole === "batting" ? "runs" : "wickets");
  };

  const activeVenueSplits = role === "batting" ? venueSplits.batting : venueSplits.bowling;
  const yearsActiveStr =
    playerMetadata?.min_year && playerMetadata?.max_year
      ? `${playerMetadata.min_year}–${playerMetadata.max_year}`
      : "";

  const achievementsList = getAchievements(
    role,
    careerBat,
    careerBowl,
    playerMetadata?.pom_count ?? 0,
    yearsActiveStr
  );

  return (
    <div className="animate-fade-in min-h-screen">
      {/* ── Full-Bleed Hero Banner ── */}
      <div className="profile-hero mb-8">
        <div className="profile-hero-mesh" />
        <div className="profile-hero-lines" />
        
        {/* Centered Hero Content Container */}
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 relative z-10">
          
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted select-none mb-4">
            <Link href="/" className="hover:text-accent-green transition-colors">
              Home
            </Link>
            <span>›</span>
            <span className="opacity-60">Players</span>
            <span>›</span>
            <span className="text-text-secondary">{playerName}</span>
          </div>

          {/* Player Identity Card */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-6">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <div className="relative p-[2px] rounded-[21px] bg-gradient-to-br from-accent-green/40 to-accent-green/5 shadow-[0_0_28px_rgba(75,226,119,0.12)]">
                  <Avatar name={playerName} size="xl" />
                </div>
                {formTrend && (
                  <div
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-bg-base font-bold ${
                      formTrend === "in-form"
                        ? "bg-accent-green text-black"
                        : "bg-accent-red text-white"
                    }`}
                    title={formTrend === "in-form" ? "In Form" : "Lean Patch"}
                  >
                    {formTrend === "in-form" ? "↑" : "↓"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
                  {playerName}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                  {playerMetadata?.primary_team && (
                    <>
                      <span className="text-sm">{COUNTRY_FLAGS[playerMetadata.primary_team] ?? "🏏"}</span>
                      <span className="font-mono font-semibold text-text-secondary tracking-wide">
                        {playerMetadata.primary_team}
                      </span>
                      <span className="opacity-40">•</span>
                    </>
                  )}
                  {playerMetadata?.min_year && playerMetadata?.max_year && (
                    <>
                      <span className="font-mono">
                        Active {playerMetadata.min_year}–{playerMetadata.max_year}
                      </span>
                      <span className="opacity-40">•</span>
                    </>
                  )}
                  {playerMetadata?.total_matches ? (
                    <span className="font-mono">{playerMetadata.total_matches} matches</span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {badgeFormats.map((f) => (
                    <Badge key={f} text={f} variant={getFormatBadgeVariant(f)} />
                  ))}
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

            {/* Batting/Bowling Toggle */}
            <div className="flex gap-1 rounded-xl bg-bg-surface/70 backdrop-blur-md p-1 self-start shrink-0 border border-glass-border">
              <button
                onClick={() => handleRoleChange("batting")}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
                  role === "batting"
                    ? "bg-bg-card text-accent-green shadow-sm font-bold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                🏏 Batting
              </button>
              <button
                disabled={!bowling || bowling.length === 0}
                onClick={() => handleRoleChange("bowling")}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
                  role === "bowling"
                    ? "bg-bg-card text-accent-blue shadow-sm font-bold"
                    : "text-text-muted hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
              >
                🔴 Bowling
              </button>
            </div>
          </div>

          {/* Format Tabs */}
          <div className="profile-fmt-tabs relative z-10">
            {formatTabs.map((fmt) => (
              <button
                key={fmt}
                onClick={() => {
                  setActiveFormat(fmt);
                  setShowAllPartnerships(false);
                }}
                className={`profile-ft ${
                  activeFormat === fmt
                    ? (role === "batting" ? "profile-ft-active-bat" : "profile-ft-active-bowl")
                    : ""
                }`}
              >
                {TAB_LABELS[fmt] ?? (fmt === "All" ? "All Formats" : fmt)}
              </button>
            ))}
          </div>

        </div>

        {/* Full-width KPI Strip border boundary container */}
        <div className="mx-auto max-w-6xl relative z-10">
          {role === "batting" && careerBat && (
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
          {role === "bowling" && careerBowl && (
            <HeroStatBar
              role="bowling"
              highlightBucket={activeHighlightBucket}
              bowling={{
                wickets: careerBowl.wickets,
                economy: careerBowl.economy,
                bowling_average: careerBowl.bowling_average,
                strike_rate: careerBowl.strike_rate,
                five_w: careerBowl.five_w,
                innings_bowled: careerBowl.innings_bowled,
              }}
            />
          )}
        </div>

      </div>

      {/* ── Main Content Body (Centered and Padded) ── */}
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 space-y-8">

      {/* ── Dynamic Chart ── */}
      {activeChartData.length > 1 && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="section-eyebrow font-mono">
              {activeFormat === "All" ? "" : `${activeFormat.toUpperCase()} · `}
              {currentOption.label.toUpperCase()} BY YEAR
            </div>
            <div className="flex gap-1 bg-bg-surface p-0.5 rounded-lg border border-glass-border self-start">
              {chartOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setChartView(opt.key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${
                    chartView === opt.key
                      ? "bg-bg-card text-text-primary shadow-sm font-bold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-4 pb-2">
            <RunsChart
              data={activeChartData}
              color={currentOption.color}
              label={currentOption.label}
            />
          </div>
        </section>
      )}

      {/* ── Section 01: Milestones & Records ── */}
      {achievementsList.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-glass-border pb-2">
            <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>01</span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Milestones & Records</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-bg-surface">
            {achievementsList.map((ach, i) => (
              <div
                key={i}
                className="min-w-[160px] flex-shrink-0 profile-card p-3 transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-accent-green to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <span className="text-xl mb-1 block">{ach.icon}</span>
                <div className={`font-serif text-xl sm:text-2xl font-extrabold tracking-tight ${role === "batting" ? "text-accent-green" : "text-accent-blue"}`}>
                  {ach.title}
                </div>
                <div className="text-[10px] text-text-muted leading-normal mt-0.5 font-mono">
                  {ach.desc}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 02: Innings Breakdown (Test only) ── */}
      {isTestFormat && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-glass-border pb-2">
            <div className="flex items-center gap-2">
              <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>02</span>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Innings Breakdown</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2 w-20 sm:w-40" />
            </div>
            <div className="text-[10px] font-mono text-text-muted">
              {activeFormat} · {role === "batting" ? "Batting" : "Bowling"}
            </div>
          </div>
          <InningsSplitSection splits={testSplits} role={role} />
        </section>
      )}

      {/* ── Section 03: Phase Breakdown (Non-Test only) ── */}
      {!isTestFormat && activePhases.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-glass-border pb-2">
            <div className="flex items-center gap-2">
              <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>03</span>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Phase Breakdown</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2 w-20 sm:w-40" />
            </div>
            <div className="text-[10px] font-mono text-text-muted">
              {activeFormat === "All" ? "All Formats" : activeFormat} · {role === "batting" ? "Batting" : "Bowling"}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PHASE_ORDER.map((phaseName) => {
              const phase = activePhases.find((p) => p.phase_name === phaseName);
              return phase ? (
                <PhaseCard
                  key={phaseName}
                  phase={phase}
                  isBatting={role === "batting"}
                  maxHeroVal={maxPhaseHeroVal}
                />
              ) : null;
            })}
          </div>
        </section>
      )}

      {/* ── Section 04: Conditions Breakdown ── */}
      {activeVenueSplits.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-glass-border pb-2">
            <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>04</span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Conditions Breakdown</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2" />
            <span className="text-[10px] font-mono text-text-muted">Home · Away · Neutral</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {activeVenueSplits
              .filter((v) => ["home", "away", "neutral"].includes(v.venue_type))
              .map((v) => (
                <VenueCard
                  key={v.venue_type}
                  split={v}
                  role={role}
                  totalRuns={careerBat?.runs ?? 0}
                  totalWickets={careerBowl?.wickets ?? 0}
                />
              ))}
          </div>
        </section>
      )}

      {/* ── Section 05: Year-by-Year Table ── */}
      {((role === "batting" && activeBatting.length > 0) ||
        (role === "bowling" && activeBowling.length > 0)) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-glass-border pb-2">
            <div className="flex items-center gap-2">
              <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>05</span>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                Year-by-Year · <span className="text-text-secondary">{activeFormat === "All" ? "All Formats" : activeFormat}</span>
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2 w-10 sm:w-20" />
            </div>
            <div className="flex items-center gap-3">
              {role === "batting" && bestBatSeason && (
                <span className="text-[10px] font-mono text-accent-green hidden sm:inline">
                  Best: {bestBatSeason.runs.toLocaleString()} runs ({bestBatSeason.year})
                </span>
              )}
              {role === "bowling" && bestBowlSeason && (
                <span className="text-[10px] font-mono text-accent-blue hidden sm:inline">
                  Best: {bestBowlSeason.wickets} wickets ({bestBowlSeason.year})
                </span>
              )}
              {showExpandButton && (
                <button
                  onClick={() => setShowYearTable(!showYearTable)}
                  className="px-3 py-1 rounded bg-bg-surface hover:bg-bg-surface/80 text-text-secondary border border-glass-border text-[10px] font-semibold flex items-center gap-1 transition"
                >
                  {showYearTable ? "▲ Collapse" : "▼ Expand"}
                </button>
              )}
            </div>
          </div>
          <div className="year-table-shell overflow-hidden rounded-2xl border border-glass-border bg-bg-card">
            {role === "batting" ? (
              <BattingSection data={activeBatting} expanded={showYearTable} />
            ) : (
              <BowlingSection data={activeBowling} expanded={showYearTable} />
            )}
          </div>
        </section>
      )}

      {/* ── Section 06: Bowling Summary (shown when batting active and player bowled) ── */}
      {role === "batting" && totalWickets > 0 && careerBowl && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-glass-border pb-2">
            <span className="profile-sec-num profile-sec-num-bowl">06</span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Bowling Summary</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2" />
            <span className="text-[10px] font-mono text-text-muted">Part-time contributions</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="profile-card p-4 text-center">
              <div className="font-serif text-xl sm:text-2xl font-bold text-accent-green">{careerBowl.wickets}</div>
              <div className="text-[9px] text-text-muted uppercase font-mono tracking-wider mt-1">Wickets</div>
            </div>
            <div className="profile-card p-4 text-center">
              <div className="font-serif text-xl sm:text-2xl font-bold text-accent-gold">{careerBowl.economy?.toFixed(2) ?? "—"}</div>
              <div className="text-[9px] text-text-muted uppercase font-mono tracking-wider mt-1">Economy</div>
            </div>
            <div className="profile-card p-4 text-center">
              <div className="font-serif text-xl sm:text-2xl font-bold text-accent-blue">{careerBowl.bowling_average?.toFixed(2) ?? "—"}</div>
              <div className="text-[9px] text-text-muted uppercase font-mono tracking-wider mt-1">Bowl Avg</div>
            </div>
            <div className="profile-card p-4 text-center">
              <div className="font-serif text-xl sm:text-2xl font-bold text-text-primary">{careerBowl.innings_bowled}</div>
              <div className="text-[9px] text-text-muted uppercase font-mono tracking-wider mt-1">Bowl Innings</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 07: Recent Form ── */}
      {form && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-glass-border pb-2">
            <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>07</span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Recent Form</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2" />
            <span className="text-[10px] font-mono text-text-muted">Last 10 innings</span>
          </div>
          <FormGuide
            form={form}
            selectedFormat={formFilter}
            onFormatChange={setFormFilter}
            role={role}
          />
        </section>
      )}

      {/* ── Key Partnerships ── */}
      {role === "batting" && fmtPartners.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-glass-border pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Key Partnerships{activeFormat !== "All" ? ` · ${activeFormat}` : ""}</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2 w-10 sm:w-20" />
            </div>
            <span className="text-[10px] text-text-muted font-mono">* Ball-by-ball synced data</span>
          </div>

          <div className="space-y-3">
            {featuredPartners.map((p, idx) => {
              const rankCls = ["rank-1", "rank-2", "rank-3"][idx] ?? "rank-n";
              const barPct = Math.round((p.total_runs / maxPartnerRuns) * 100);
              return (
                <div key={`${p.partner_id}-${idx}`} className="profile-card p-4 hover:-translate-y-0.5">
                  <div className="flex items-start gap-3">
                    <div className={`rank-badge ${rankCls} mt-0.5`}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <Link
                          href={`/players/${p.partner_id}`}
                          className="font-semibold text-text-primary hover:text-accent-green transition-colors"
                        >
                          {p.partner_name}
                        </Link>
                        <div className="flex gap-4 text-sm font-mono">
                          <div>
                            <span className="text-text-muted text-[10px] uppercase mr-1">Inns</span>
                            <span className="font-semibold">{p.innings_together}</span>
                          </div>
                          <div>
                            <span className="text-text-muted text-[10px] uppercase mr-1">Runs</span>
                            <span className="font-bold text-accent-green">
                              {p.total_runs.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted text-[10px] uppercase mr-1">Avg</span>
                            <span className="font-semibold">
                              {p.avg_partnership?.toFixed(1) ?? "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted text-[10px] uppercase mr-1">Best</span>
                            <span className="font-semibold text-accent-gold">
                              {p.best_partnership}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="partnership-bar-track h-1 bg-bg-surface rounded-full overflow-hidden">
                        <div
                          className="partnership-bar-fill h-full bg-accent-green"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {remainingPartners.length > 0 && (
            <div className="mt-3">
              {showAllPartnerships && (
                <div className="overflow-x-auto rounded-xl border border-glass-border bg-bg-card mt-3 animate-fade-in">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-glass-border text-left text-xs font-medium uppercase tracking-wider text-text-muted bg-bg-surface/30">
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
                        <tr
                          key={`${p.partner_id}-${idx}`}
                          className="hover:bg-bg-surface/40 even:bg-bg-surface/10 border-b border-glass-border/40 last:border-b-0 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="rank-badge rank-n text-xs">{idx + 4}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/players/${p.partner_id}`}
                              className="font-medium text-text-primary hover:text-accent-green transition-colors"
                            >
                              {p.partner_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right text-text-secondary font-mono">
                            {p.innings_together}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-accent-green font-mono">
                            {p.total_runs.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-text-secondary font-mono">
                            {p.avg_partnership?.toFixed(1) ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-accent-gold font-semibold font-mono">
                            {p.best_partnership}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                onClick={() => setShowAllPartnerships(!showAllPartnerships)}
                className="mt-3 text-xs font-semibold text-accent-green hover:opacity-85 transition-opacity"
              >
                {showAllPartnerships
                  ? "↑ Show less"
                  : `↓ Show all ${fmtPartners.length} partnerships`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Section 08: Head-to-Head Matchups ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-glass-border pb-2">
          <span className={`profile-sec-num ${role === "batting" ? "profile-sec-num-bat" : "profile-sec-num-bowl"}`}>08</span>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">Head-to-Head Matchups</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-glass-border to-transparent ml-2" />
        </div>
        <p className="text-xs text-text-muted">
          Search for a bowler to see how {playerName.split(" ").pop()} performs against them.
        </p>
        <MatchupSearch playerId={playerId} onSelectBowler={setSelectedBowler} role={role} />
        {selectedBowler && (
          <div className="mt-6 max-w-4xl animate-fade-in">
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
    </div>
  );
}
