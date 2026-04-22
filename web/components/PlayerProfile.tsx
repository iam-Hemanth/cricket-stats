"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import Avatar from "@/components/ui/Avatar";
import TabGroup from "@/components/ui/TabGroup";
import Badge from "@/components/ui/Badge";
import api, {
  type BattingStats,
  type BowlingStats,
  type PartnershipStats,
  type PlayerForm,
  type PlayerSearchResult,
  type PhaseStatBatting,
  type PhaseStatBowling,
} from "@/lib/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

/* ── Format filter pill bar ──────────────────────────────── */

function FormatFilter({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (f: string) => void;
}) {
  return (
    <div className="mt-4">
      <TabGroup tabs={tabs} activeTab={active} onChange={onChange} size="sm" />
    </div>
  );
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
  const [fmt, setFmt] = useState("All");

  // Determine which virtual tabs have data
  const availableTabs = BATTING_TAB_ORDER.filter(
    (t) => filterBattingRows(data, t).length > 0
  );
  const tabList = ["All", ...availableTabs];

  // Build groups
  const activeTabs = fmt === "All" ? availableTabs : [fmt];
  const groups = activeTabs
    .map((t) => {
      const rows = filterBattingRows(data, t).sort((a, b) => b.year - a.year);
      if (rows.length === 0) return null;
      return { label: t, career: battingCareer(rows), rows };
    })
    .filter(Boolean) as { label: string; career: BattingStats; rows: BattingStats[] }[];

  return (
    <>
      <FormatFilter tabs={tabList} active={fmt} onChange={setFmt} />
      <div className="mt-4 overflow-x-auto rounded-xl border border-[--glass-border] bg-[--bg-card]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[--glass-border] text-left text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3 text-right">Mat</th>
              <th className="px-4 py-3 text-right">Inn</th>
              <th className="px-4 py-3 text-right">Runs</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">HS</th>
              <th className="px-4 py-3 text-right">Avg</th>
              <th className="px-4 py-3 text-right">SR</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">50s</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">100s</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <BattingFormatGroup
                key={g.label}
                group={g}
                showHeader={fmt === "All"}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
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
      <BattingRow row={career} isCareer />
      {rows.map((r) => (
        <BattingRow key={`${r.format}-${r.year}-${r.competition_name}`} row={r} />
      ))}
    </>
  );
}

function BattingRow({
  row: r,
  isCareer = false,
}: {
  row: BattingStats;
  isCareer?: boolean;
}) {
  const cls = isCareer
    ? "bg-[--accent-green]/8 font-semibold border-b border-[--accent-green]/20"
    : "border-b border-[--glass-border] hover:bg-[--bg-card-hover] transition-colors";
  return (
    <tr className={`transition ${cls}`}>
      <td className="px-4 py-2.5 text-[--text-primary]">
        {isCareer ? (
          <span className="text-[--accent-green]">Career</span>
        ) : (
          r.year
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">{r.matches}</td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">{r.innings}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-[--text-primary]">
        {r.runs.toLocaleString()}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-[--text-secondary] sm:table-cell">
        {r.highest_score}
      </td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">
        {r.average?.toFixed(2) ?? "–"}
      </td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-[--text-secondary] sm:table-cell">
        {r.fifties}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-[--text-secondary] sm:table-cell">
        {r.hundreds}
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
  const [fmt, setFmt] = useState("All");

  // Determine which virtual tabs have data
  const availableTabs = BATTING_TAB_ORDER.filter(
    (t) => filterBowlingRows(data, t).length > 0
  );
  const tabList = ["All", ...availableTabs];

  // Build groups
  const activeTabs = fmt === "All" ? availableTabs : [fmt];
  const groups = activeTabs
    .map((t) => {
      const rows = filterBowlingRows(data, t).sort((a, b) => b.year - a.year);
      if (rows.length === 0) return null;
      return { label: t, career: bowlingCareer(rows), rows };
    })
    .filter(Boolean) as { label: string; career: BowlingStats; rows: BowlingStats[] }[];

  return (
    <>
      <FormatFilter tabs={tabList} active={fmt} onChange={setFmt} />
      <div className="mt-4 overflow-x-auto rounded-xl border border-[--glass-border] bg-[--bg-card]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[--glass-border] text-left text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3 text-right">Inn</th>
              <th className="px-4 py-3 text-right">Wkts</th>
              <th className="px-4 py-3 text-right">Runs</th>
              <th className="px-4 py-3 text-right">Econ</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">Avg</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">SR</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <BowlingFormatGroup
                key={g.label}
                group={g}
                showHeader={fmt === "All"}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
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
    ? "bg-[--accent-green]/8 font-semibold border-b border-[--accent-green]/20"
    : "border-b border-[--glass-border] hover:bg-[--bg-card-hover] transition-colors";
  return (
    <tr className={`transition ${cls}`}>
      <td className="px-4 py-2.5 text-[--text-primary]">
        {isCareer ? (
          <span className="text-[--accent-green]">Career</span>
        ) : (
          r.year
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">{r.innings_bowled}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-[--text-primary]">{r.wickets}</td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">{r.runs_conceded.toLocaleString()}</td>
      <td className="px-4 py-2.5 text-right text-[--text-secondary]">{r.economy?.toFixed(2) ?? "–"}</td>
      <td className="hidden px-4 py-2.5 text-right text-[--text-secondary] sm:table-cell">
        {r.bowling_average?.toFixed(2) ?? "–"}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-[--text-secondary] sm:table-cell">
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

/* ── Phase specialist cards ──────────────────────────────── */

interface PhaseCardProps {
  phase: PhaseStatBatting | PhaseStatBowling;
  isBatting: boolean;
  isHighest: boolean;
}

function PhaseCard({ phase, isBatting, isHighest }: PhaseCardProps) {
  const phaseColors: Record<string, { border: string; accent: string }> = {
    powerplay: { border: "border-l-blue-500", accent: "text-blue-400" },
    middle: { border: "border-l-amber-500", accent: "text-amber-400" },
    death: { border: "border-l-red-500", accent: "text-red-400" },
  };

  const colors = phaseColors[phase.phase_name] || { border: "border-l-gray-500", accent: "text-[--text-muted]" };

  return (
    <div
      className={`glass-card rounded-xl p-4 border-l-4 ${colors.border} transition-all duration-300 ${
        isHighest ? "glow-gold ring-1 ring-[--accent-gold]/30" : "hover:border-l-[6px]"
      }`}
    >
      <h4 className={`text-lg font-bold capitalize mb-3 ${colors.accent}`}>{phase.phase_name}</h4>
      <div className="grid grid-cols-3 gap-4 text-sm">
        {isBatting ? (
          <>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Balls</div>
              <div className="font-semibold mt-1 text-[--text-primary]">{(phase as PhaseStatBatting).balls}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Runs</div>
              <div className="font-semibold mt-1 text-[--text-primary]">{(phase as PhaseStatBatting).runs}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">SR</div>
              <div className="font-semibold mt-1 gradient-text-green">{(phase as PhaseStatBatting).strike_rate ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Avg</div>
              <div className={`font-semibold mt-1 ${(phase as PhaseStatBatting).dismissals === 0 ? "text-[--text-muted]" : "text-[--text-primary]"}`}>
                {(phase as PhaseStatBatting).average ?? "–"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Dot%</div>
              <div className="font-semibold mt-1 text-[--text-secondary]">{(phase as PhaseStatBatting).dot_ball_pct ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">4+%</div>
              <div className="font-semibold mt-1 text-[--accent-gold]">{(phase as PhaseStatBatting).boundary_pct ?? "–"}</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Balls</div>
              <div className="font-semibold mt-1 text-[--text-primary]">{(phase as PhaseStatBowling).balls}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Runs</div>
              <div className="font-semibold mt-1 text-[--text-primary]">{(phase as PhaseStatBowling).runs_conceded}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Wickets</div>
              <div className="font-semibold mt-1 gradient-text-green">{(phase as PhaseStatBowling).wickets}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Econ</div>
              <div className="font-semibold mt-1 text-[--text-primary]">{(phase as PhaseStatBowling).economy ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">Dot%</div>
              <div className="font-semibold mt-1 text-[--accent-gold]">{(phase as PhaseStatBowling).dot_ball_pct ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[--text-muted]">—</div>
              <div className="font-semibold mt-1 text-[--text-muted]">—</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PhasesSection({
  battingPhases,
  bowlingPhases,
}: {
  battingPhases: PhaseStatBatting[];
  bowlingPhases: PhaseStatBowling[];
}) {
  const [battingFormat, setBattingFormat] = useState<string>("T20");
  const [bowlingFormat, setBowlingFormat] = useState<string>("T20");

  // Get unique formats for each role
  const battingFormats = Array.from(
    new Set(battingPhases.map((p) => p.format_bucket))
  ).sort();
  const bowlingFormats = Array.from(
    new Set(bowlingPhases.map((p) => p.format_bucket))
  ).sort();

  // Filter phases by format
  const filteredBatting = battingPhases.filter(
    (p) => p.format_bucket === battingFormat
  );
  const filteredBowling = bowlingPhases.filter(
    (p) => p.format_bucket === bowlingFormat
  );

  // Find best phases (highest SR for batting, lowest economy for bowling)
  let bestBattingPhase: string | null = null;
  if (filteredBatting.length > 0) {
    const maxSR = Math.max(
      ...filteredBatting
        .map((p) => p.strike_rate ?? 0)
        .filter((sr) => sr > 0)
    );
    bestBattingPhase =
      filteredBatting.find((p) => p.strike_rate === maxSR)?.phase_name || null;
  }

  let bestBowlingPhase: string | null = null;
  if (filteredBowling.length > 0) {
    const minEcon = Math.min(
      ...filteredBowling
        .map((p) => p.economy ?? Infinity)
        .filter((e) => e !== Infinity)
    );
    bestBowlingPhase =
      filteredBowling.find((p) => p.economy === minEcon)?.phase_name || null;
  }

  // Phase order
  const phaseOrder = ["powerplay", "middle", "death"];

  return (
    <div className="mt-8 space-y-10">
      {/* Batting Phases */}
      {battingPhases.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-[--text-primary] mb-4">Batting Phases</h2>
          <div className="mb-4">
            <TabGroup tabs={battingFormats} activeTab={battingFormat} onChange={setBattingFormat} size="sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {phaseOrder.map((phaseName) => {
              const phase = filteredBatting.find((p) => p.phase_name === phaseName);
              return phase ? (
                <PhaseCard
                  key={phaseName}
                  phase={phase}
                  isBatting={true}
                  isHighest={phaseName === bestBattingPhase}
                />
              ) : null;
            })}
          </div>
        </section>
      )}

      {/* Bowling Phases */}
      {bowlingPhases.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-[--text-primary] mb-4">Bowling Phases</h2>
          <div className="mb-4">
            <TabGroup tabs={bowlingFormats} activeTab={bowlingFormat} onChange={setBowlingFormat} size="sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {phaseOrder.map((phaseName) => {
              const phase = filteredBowling.find((p) => p.phase_name === phaseName);
              return phase ? (
                <PhaseCard
                  key={phaseName}
                  phase={phase}
                  isBatting={false}
                  isHighest={phaseName === bestBowlingPhase}
                />
              ) : null;
            })}
          </div>
        </section>
      )}
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/players/search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data: PlayerSearchResult[] = await res.json();
          setResults(data.filter((p) => p.player_id !== playerId));
          setIsOpen(true);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, playerId]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setIsOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

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
                  onClick={() => {
                    onSelectBowler({ id: p.player_id, name: p.name });
                    setIsOpen(false);
                    setQuery("");
                  }}
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

  const getBattingBadgeColor = (
    runs: number,
    ballsFaced: number,
    wasDismissed: boolean,
    formatBucket: string
  ): string => {
    const isT20Format = formatBucket === "T20" || formatBucket === "IT20" || formatBucket === "IPL";

    if (isT20Format) {
      const sr = ballsFaced > 0 ? (runs * 100) / ballsFaced : 0;

      // Duck
      if (runs === 0 && wasDismissed) return "bg-red-700 text-white";

      // Excellent: big score at high SR
      if (runs >= 40 && sr >= 160) return "bg-green-700 text-white";

      // Good: decent score at good SR
      if (runs >= 25 && sr >= 140) return "bg-green-400 text-white";

      // OK: got going at acceptable SR
      if (runs >= 10 && sr >= 100) return "bg-amber-400 text-white";

      // Poor: everything else
      return "bg-red-400 text-white";
    }

    if (runs >= 100) return "bg-green-700 text-white";
    if (runs >= 50) return "bg-green-400 text-white";
    if (runs >= 20) return "bg-amber-400 text-white";
    if (runs === 0) return "bg-red-700 text-white";
    return "bg-red-400 text-white";
  };

  const getBowlingBadgeColor = (economy: number | null): string => {
    if (economy === null) return "bg-gray-400 text-white";
    if (economy < 6.0) return "bg-green-700 text-white";
    if (economy < 7.5) return "bg-green-400 text-white";
    if (economy < 9.0) return "bg-amber-400 text-white";
    return "bg-red-400 text-white";
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
                className={`${getBattingBadgeColor(entry.runs, entry.balls_faced, entry.was_dismissed, entry.format_bucket)} flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-sm font-semibold transition hover:shadow-md cursor-pointer`}
                onClick={() => router.push(`/teams?team1=${entry.batting_team}&team2=${entry.opposition}`)}
              >
                <div>{entry.runs}{!entry.was_dismissed ? '*' : ''}</div>
                <div className="text-xs opacity-75 font-normal">{entry.format_bucket}</div>
              </div>
            ))}
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
                  className={`${getBowlingBadgeColor(entry.economy)} flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-sm font-semibold transition hover:shadow-md cursor-pointer`}
                  onClick={() => router.push(`/teams?team1=${entry.bowling_team}&team2=${entry.opposition}`)}
                >
                  <div>
                    {economyDisplay}
                    {entry.wickets > 0 && (
                      <sup className="text-xs font-bold">{entry.wickets}</sup>
                    )}
                  </div>
                  <div className="text-xs opacity-75 font-normal">{entry.format_bucket}</div>
                </div>
              );
            })}
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
  const [partnershipsFilter, setPartnershipsFilter] = useState<string | null>(null);
  const [phases, setPhases] = useState<{ batting: PhaseStatBatting[]; bowling: PhaseStatBowling[]; batting_specialist_badge?: string | null; bowling_specialist_badge?: string | null }>({ batting: [], bowling: [] });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"batting" | "bowling" | "phases">("batting");
  const [selectedBowler, setSelectedBowler] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
      try {
        const [batRes, bowlRes, partRes, phaseRes, formRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/players/${playerId}/batting`),
          fetch(`${API_URL}/api/v1/players/${playerId}/bowling`),
          fetch(`${API_URL}/api/v1/players/${playerId}/partnerships`),
          fetch(`${API_URL}/api/v1/players/${playerId}/phases`),
          fetch(`${API_URL}/api/v1/players/${playerId}/form`),
        ]);

        if (batRes.status === 404 && bowlRes.status === 404) {
          setNotFound(true);
          return;
        }

        const batData: BattingStats[] = batRes.ok ? await batRes.json() : [];
        const bowlData: BowlingStats[] = bowlRes.ok
          ? await bowlRes.json()
          : [];
        const partData: PartnershipStats[] = partRes.ok ? await partRes.json() : [];
        const phaseData = phaseRes.ok ? await phaseRes.json() : { batting: [], bowling: [] };
        const formData: PlayerForm = formRes.ok ? await formRes.json() : { batting: [], bowling: [], last_updated: null };

        setBatting(sortStats(batData));
        setBowling(sortStats(bowlData));
        setPartnerships(partData);
        setPhases(phaseData);
        setForm(formData);
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
  const playerName =
    batting?.[0]?.player_name ?? bowling?.[0]?.player_name ?? "Unknown";
  // Derive display badges — show IPL if player has IPL data
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

  // Detect phase specialists
  const phaseSpecialists = detectPhaseSpecialists(phases.batting, phases.bowling, phases.batting_specialist_badge, phases.bowling_specialist_badge);

  // Build main tab list
  const mainTabs = ["Batting", "Bowling"];
  if (phases.batting.length > 0 || phases.bowling.length > 0) {
    mainTabs.push("Phases");
  }

  return (
    <div className="animate-fade-in">
      {/* Header: Avatar + Name + Format badges + Phase specialist badges */}
      <div className="flex items-start gap-5">
        <Avatar name={playerName} size="xl" />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[--text-primary] sm:text-4xl">
            {playerName}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 stagger-children">
            {badgeFormats.map((f: string) => (
              <Badge key={f} text={f} />
            ))}
            {phaseSpecialists.map((specialist) => (
              <Badge key={`${specialist.type}-${specialist.phase}`} text={specialist.label} variant="gold" />
            ))}
          </div>
        </div>
      </div>

      {/* Form Guide Section */}
      {form && <FormGuide form={form} selectedFormat={formFilter} onFormatChange={setFormFilter} />}

      {/* Batting / Bowling / Phases tabs */}
      <div className="mt-8 pb-3">
        <TabGroup
          tabs={mainTabs}
          activeTab={tab.charAt(0).toUpperCase() + tab.slice(1)}
          onChange={(t) => setTab(t.toLowerCase() as "batting" | "bowling" | "phases")}
        />
      </div>

      {/* Batting */}
      {tab === "batting" && batting && batting.length > 0 && (
        <BattingSection data={batting} />
      )}

      {/* Bowling */}
      {tab === "bowling" &&
        (totalWickets === 0 ? (
          <p className="py-12 text-center text-sm text-[--text-muted]">
            No bowling data available for this player.
          </p>
        ) : (
          <BowlingSection data={bowling!} />
        ))}

      {/* Phases */}
      {tab === "phases" && (
        <PhasesSection
          battingPhases={phases.batting}
          bowlingPhases={phases.bowling}
        />
      )}

      {/* ── Batting partnerships ─────────────────────────── */}
      {partnerships && partnerships.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-bold text-[--text-primary]">
            Batting partnerships
          </h2>

          {/* Format filter tabs */}
          <div className="mt-4">
            <TabGroup
              tabs={[
                "All",
                ...Array.from(new Set(partnerships.map((p) => p.format_bucket)))
                  .sort(
                    (a, b) =>
                      ["Test", "ODI", "ODM", "IT20", "T20", "IPL", "MDM"].indexOf(a) -
                      ["Test", "ODI", "ODM", "IT20", "T20", "IPL", "MDM"].indexOf(b)
                  ),
              ]}
              activeTab={partnershipsFilter ?? "All"}
              onChange={(t) => setPartnershipsFilter(t === "All" ? null : t)}
              size="sm"
            />
          </div>

          {/* Partnerships cards */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(partnershipsFilter
              ? partnerships.filter((p) => p.format_bucket === partnershipsFilter)
              : partnerships
            )
              .slice(0, 15)
              .map((p, idx) => (
                <div
                  key={`${p.partner_id}-${p.format_bucket}-${idx}`}
                  className="glass-card card-hover rounded-xl p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={p.partner_name} size="sm" />
                    <div>
                      <Link
                        href={`/players/${p.partner_id}`}
                        className="font-medium text-[--text-primary] transition-colors hover:text-[--accent-green]"
                      >
                        {p.partner_name}
                      </Link>
                      <div className="text-xs text-[--text-muted]">{p.format_bucket}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-[--text-muted]">Inns</div>
                      <div className="font-semibold text-[--text-primary]">{p.innings_together}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[--text-muted]">Runs</div>
                      <div className="font-semibold gradient-text-green">{p.total_runs.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[--text-muted]">Avg</div>
                      <div className="font-semibold text-[--text-primary]">
                        {p.avg_partnership !== null ? p.avg_partnership.toFixed(1) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[--text-muted]">Best</div>
                      <div className="font-semibold text-[--accent-gold]">{p.best_partnership}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          <p className="mt-4 text-xs text-[--text-muted]">
            * Based on available Cricsheet data
          </p>
        </section>
      )}

      {/* ── Matchup search ───────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-lg font-bold text-[--text-primary]">
          Head-to-head matchups
        </h2>
        <p className="mb-4 text-sm text-[--text-muted]">
          Search for a bowler to see how {playerName.split(" ").pop()} performs
          against them.
        </p>
        <MatchupSearch
          playerId={playerId}
          onSelectBowler={setSelectedBowler}
        />

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
