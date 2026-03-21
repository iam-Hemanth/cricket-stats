"use client";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import type {
  BattingStats,
  BowlingStats,
  PartnershipStats,
  PlayerSearchResult,
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
    <div className="mt-4 flex flex-wrap gap-1.5">
      {tabs.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
            f === active
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {f}
        </button>
      ))}
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
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="py-3 pr-4">Year</th>
              <th className="py-3 pr-4 text-right">Mat</th>
              <th className="py-3 pr-4 text-right">Inn</th>
              <th className="py-3 pr-4 text-right">Runs</th>
              <th className="hidden py-3 pr-4 text-right sm:table-cell">HS</th>
              <th className="py-3 pr-4 text-right">Avg</th>
              <th className="py-3 pr-4 text-right">SR</th>
              <th className="hidden py-3 pr-4 text-right sm:table-cell">50s</th>
              <th className="hidden py-3 pr-4 text-right sm:table-cell">100s</th>
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
            className="pb-1 pt-5 text-xs font-bold uppercase tracking-widest text-gray-400"
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
    ? "bg-blue-50/60 font-semibold border-b border-blue-100"
    : "border-b border-gray-100 hover:bg-gray-50";
  return (
    <tr className={`transition ${cls}`}>
      <td className="py-2.5 pr-4 text-gray-900">
        {isCareer ? (
          <span className="text-blue-700">Career</span>
        ) : (
          r.year
        )}
      </td>
      <td className="py-2.5 pr-4 text-right text-gray-600">{r.matches}</td>
      <td className="py-2.5 pr-4 text-right text-gray-600">{r.innings}</td>
      <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
        {r.runs.toLocaleString()}
      </td>
      <td className="hidden py-2.5 pr-4 text-right text-gray-600 sm:table-cell">
        {r.highest_score}
      </td>
      <td className="py-2.5 pr-4 text-right text-gray-600">
        {r.average?.toFixed(2) ?? "–"}
      </td>
      <td className="py-2.5 pr-4 text-right text-gray-600">
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
      <td className="hidden py-2.5 pr-4 text-right text-gray-600 sm:table-cell">
        {r.fifties}
      </td>
      <td className="hidden py-2.5 pr-4 text-right text-gray-600 sm:table-cell">
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
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="py-3 pr-4">Year</th>
              <th className="py-3 pr-4 text-right">Inn</th>
              <th className="py-3 pr-4 text-right">Wkts</th>
              <th className="py-3 pr-4 text-right">Runs</th>
              <th className="py-3 pr-4 text-right">Econ</th>
              <th className="hidden py-3 pr-4 text-right sm:table-cell">Avg</th>
              <th className="hidden py-3 pr-4 text-right sm:table-cell">SR</th>
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
            className="pb-1 pt-5 text-xs font-bold uppercase tracking-widest text-gray-400"
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
    ? "bg-blue-50/60 font-semibold border-b border-blue-100"
    : "border-b border-gray-100 hover:bg-gray-50";
  return (
    <tr className={`transition ${cls}`}>
      <td className="py-2.5 pr-4 text-gray-900">
        {isCareer ? (
          <span className="text-blue-700">Career</span>
        ) : (
          r.year
        )}
      </td>
      <td className="py-2.5 pr-4 text-right text-gray-600">{r.innings_bowled}</td>
      <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">{r.wickets}</td>
      <td className="py-2.5 pr-4 text-right text-gray-600">{r.runs_conceded.toLocaleString()}</td>
      <td className="py-2.5 pr-4 text-right text-gray-600">{r.economy?.toFixed(2) ?? "–"}</td>
      <td className="hidden py-2.5 pr-4 text-right text-gray-600 sm:table-cell">
        {r.bowling_average?.toFixed(2) ?? "–"}
      </td>
      <td className="hidden py-2.5 pr-4 text-right text-gray-600 sm:table-cell">
        {r.strike_rate?.toFixed(2) ?? "–"}
      </td>
    </tr>
  );
}

/* ── Skeleton loader ─────────────────────────────────────── */

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 pt-4">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="flex gap-2">
        <div className="h-6 w-12 rounded-full bg-gray-200" />
        <div className="h-6 w-12 rounded-full bg-gray-200" />
        <div className="h-6 w-14 rounded-full bg-gray-200" />
      </div>
      <div className="mt-6 flex gap-4">
        <div className="h-9 w-20 rounded bg-gray-200" />
        <div className="h-9 w-20 rounded bg-gray-100" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

/* ── Matchup mini-search ─────────────────────────────────── */

function MatchupSearch({ playerId }: { playerId: string }) {
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
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:bg-white"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <ul>
            {results.map((p) => (
              <li key={p.player_id}>
                <Link
                  href={`/players/${playerId}?bowler=${p.player_id}&bowler_name=${encodeURIComponent(p.name)}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedBowler({ id: p.player_id, name: p.name });
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                    {p.name.charAt(0)}
                  </span>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOpen && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
          No players found
        </div>
      )}
    </div>
  );
}

/* ── Main profile component ──────────────────────────────── */

export default function PlayerProfile({
  playerId,
}: {
  playerId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [batting, setBatting] = useState<BattingStats[] | null>(null);
  const [bowling, setBowling] = useState<BowlingStats[] | null>(null);
  const [partnerships, setPartnerships] = useState<PartnershipStats[]>([]);
  const [partnershipsFilter, setPartnershipsFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"batting" | "bowling">("batting");
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
        const [batRes, bowlRes, partRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/players/${playerId}/batting`),
          fetch(`${API_URL}/api/v1/players/${playerId}/bowling`),
          fetch(`${API_URL}/api/v1/players/${playerId}/partnerships`),
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

        setBatting(sortStats(batData));
        setBowling(sortStats(bowlData));
        setPartnerships(partData);
      } catch (err) {
        console.error("Failed to load player data:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  if (loading) return <Skeleton />;

  if (notFound || (!batting?.length && !bowling?.length)) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Player not found</h1>
        <p className="mt-2 text-gray-500">
          We couldn&apos;t find any data for this player.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
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

  return (
    <div>
      {/* Name & format badges */}
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
        {playerName}
      </h1>
      <div className="mt-2 flex flex-wrap gap-2">
        {badgeFormats.map((f: string) => (
          <span
            key={f}
            className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600"
          >
            {f}
          </span>
        ))}
      </div>

      {/* Batting / Bowling tabs */}
      <div className="mt-8 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("batting")}
          className={`px-4 py-2.5 text-sm font-medium transition ${
            tab === "batting"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Batting
        </button>
        <button
          onClick={() => setTab("bowling")}
          className={`px-4 py-2.5 text-sm font-medium transition ${
            tab === "bowling"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Bowling
        </button>
      </div>

      {/* Batting */}
      {tab === "batting" && batting && batting.length > 0 && (
        <BattingSection data={batting} />
      )}

      {/* Bowling */}
      {tab === "bowling" &&
        (totalWickets === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No bowling data available for this player.
          </p>
        ) : (
          <BowlingSection data={bowling!} />
        ))}

      {/* ── Batting partnerships ─────────────────────────── */}
      {partnerships && partnerships.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-bold text-gray-900">
            Batting partnerships
          </h2>

          {/* Format filter tabs */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 pb-0">
            <button
              onClick={() => setPartnershipsFilter(null)}
              className={`px-3 py-2 text-sm font-medium transition ${
                partnershipsFilter === null
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            {[
              ...Array.from(new Set(partnerships.map((p) => p.format_bucket))),
            ]
              .sort(
                (a, b) =>
                  ["Test", "ODI", "ODM", "IT20", "T20", "IPL", "MDM"].indexOf(
                    a
                  ) -
                  ["Test", "ODI", "ODM", "IT20", "T20", "IPL", "MDM"].indexOf(
                    b
                  )
              )
              .map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setPartnershipsFilter(fmt)}
                  className={`px-3 py-2 text-sm font-medium transition ${
                    partnershipsFilter === fmt
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {fmt}
                </button>
              ))}
          </div>

          {/* Partnerships table */}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                    Partner
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                    Format
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    Inns
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    Runs
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    Avg stand
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    Best
                  </th>
                </tr>
              </thead>
              <tbody>
                {(partnershipsFilter
                  ? partnerships.filter((p) => p.format_bucket === partnershipsFilter)
                  : partnerships
                )
                  .slice(0, 15)
                  .map((p, idx) => (
                    <tr
                      key={`${p.partner_id}-${p.format_bucket}-${idx}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 text-sm">
                        <Link
                          href={`/players/${p.partner_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {p.partner_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {p.format_bucket}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">
                        {p.innings_together}
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                        {p.total_runs.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">
                        {p.avg_partnership !== null
                          ? p.avg_partnership.toFixed(2)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">
                        {p.best_partnership}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-gray-400">
            * Based on available Cricsheet data
          </p>
        </section>
      )}

      {/* ── Matchup search ───────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-lg font-bold text-gray-900">
          Head-to-head matchups
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Search for a bowler to see how {playerName.split(" ").pop()} performs
          against them.
        </p>
        <MatchupSearch playerId={playerId} />

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
