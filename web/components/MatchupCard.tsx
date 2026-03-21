"use client";

import { useState, useEffect } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PhaseStats {
  phase: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}

interface YearStats {
  year: number;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}

interface FormatMatchup {
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

interface MatchupDelivery {
  date: string;
  over_number: number;
  ball_number: number;
  runs_batter: number;
  is_wicket: boolean;
  batting_team: string;
  bowling_team: string;
  venue: string | null;
}

interface MatchupData {
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

interface Props {
  batterId: string;
  bowlerId: string;
  batterName: string;
  bowlerName: string;
}

export default function MatchupCard({
  batterId,
  bowlerId,
  batterName,
  bowlerName,
}: Props) {
  const [matchup, setMatchup] = useState<MatchupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedFormats, setExpandedFormats] = useState<Set<string>>(new Set());
  const [deliveriesExpanded, setDeliveriesExpanded] = useState(false);

  const formatOrder = ["Test", "ODI", "ODM", "IT20", "T20", "IPL", "MDM"];
  const phaseOrder = ["powerplay", "middle", "death"];
  const phaseLabels: Record<string, string> = {
    powerplay: "Powerplay",
    middle: "Middle",
    death: "Death",
  };
  const phasedFormats = new Set(["T20", "IT20", "IPL"]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      setExpandedFormats(new Set());
      setDeliveriesExpanded(false);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/matchup?batter_id=${batterId}&bowler_id=${bowlerId}`
        );
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("API error");
        const data: MatchupData = await res.json();
        setMatchup(data);
      } catch (err) {
        console.error("Matchup fetch failed:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [batterId, bowlerId]);

  /* ── Loading ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 p-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  /* ── Not found ───────────────────────────────────────── */
  if (notFound || !matchup) {
    return (
      <div className="rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
        These players have never faced each other in the database.
      </div>
    );
  }

  /* ── Stat helper ─────────────────────────────────────── */
  const fmt = (v: number | null, decimals = 2) =>
    v !== null && v !== undefined ? v.toFixed(decimals) : "–";

  const sortedFormats = formatOrder
    .map((fmtName) => matchup.by_format.find((f) => f.format_bucket === fmtName))
    .filter((f): f is FormatMatchup => Boolean(f));

  const toggleFormat = (formatName: string) => {
    setExpandedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(formatName)) {
        next.delete(formatName);
      } else {
        next.add(formatName);
      }
      return next;
    });
  };

  /* ── Last 5 deliveries for mini-timeline ─────────────── */
  const last5 = matchup.recent_deliveries.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {/* ── Header: Batter vs Bowler ─────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
            {batterName.charAt(0)}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {batterName}
          </span>
        </div>

        <span className="text-xs font-bold uppercase text-gray-300">vs</span>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {bowlerName}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
            {bowlerName.charAt(0)}
          </span>
        </div>
      </div>

      {/* ── Overall stats row ────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-gray-100 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Balls" value={String(matchup.overall.balls)} />
        <Stat label="Runs" value={String(matchup.overall.runs)} />
        <Stat label="Dismissals" value={String(matchup.overall.dismissals)} />
        <Stat label="Avg" value={fmt(matchup.overall.average)} />
        <Stat label="SR" value={fmt(matchup.overall.strike_rate)} />
        <Stat
          label="Dot%"
          value={
            matchup.overall.dot_ball_pct !== null
              ? `${fmt(matchup.overall.dot_ball_pct)}%`
              : "–"
          }
        />
      </div>

      {/* ── By format collapsibles ───────────────────────── */}
      {sortedFormats.length > 0 && (
        <div className="border-b border-gray-100">
          {sortedFormats.map((format) => {
            const isExpanded = expandedFormats.has(format.format_bucket);
            const showPhases =
              phasedFormats.has(format.format_bucket) && format.phases.length > 0;
            const phaseLookup = new Map(format.phases.map((p) => [p.phase, p]));
            const years = [...format.by_year].sort((a, b) => b.year - a.year);

            return (
              <div key={format.format_bucket} className="border-t border-gray-100 first:border-t-0">
                <button
                  onClick={() => toggleFormat(format.format_bucket)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {format.format_bucket}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {format.balls} balls  {format.runs} runs  {format.dismissals} wkts  avg {fmt(format.average)}  sr {fmt(format.strike_rate)}
                    </div>
                  </div>
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="space-y-4 bg-gray-50 px-4 pb-4 pt-1 sm:px-6">
                    {showPhases && (
                      <div>
                        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                          Phase breakdown
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-left uppercase tracking-wider text-gray-400">
                                <th className="px-3 py-2">Phase</th>
                                <th className="px-3 py-2 text-right">Balls</th>
                                <th className="px-3 py-2 text-right">Runs</th>
                                <th className="px-3 py-2 text-right">Wkts</th>
                                <th className="px-3 py-2 text-right">SR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {phaseOrder.map((phaseName) => {
                                const phase = phaseLookup.get(phaseName);
                                return (
                                  <tr key={phaseName} className="border-b border-gray-50 last:border-b-0">
                                    <td className="px-3 py-2 font-medium text-gray-700">
                                      {phaseLabels[phaseName]}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {phase?.balls ?? 0}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {phase?.runs ?? 0}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {phase?.dismissals ?? 0}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {phase ? fmt(phase.strike_rate) : "–"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                        Year by year
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-left uppercase tracking-wider text-gray-400">
                              <th className="px-3 py-2">Year</th>
                              <th className="px-3 py-2 text-right">Balls</th>
                              <th className="px-3 py-2 text-right">Runs</th>
                              <th className="px-3 py-2 text-right">Wkts</th>
                              <th className="px-3 py-2 text-right">Avg</th>
                              <th className="px-3 py-2 text-right">SR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {years.map((y) => {
                              const smallSample = y.balls < 6;
                              const tone = smallSample ? "text-gray-400" : "text-gray-700";
                              return (
                                <tr key={y.year} className="border-b border-gray-50 last:border-b-0">
                                  <td className="px-3 py-2 font-medium text-gray-700">{y.year}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{y.balls}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{y.runs}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{y.dismissals}</td>
                                  <td className={`px-3 py-2 text-right ${tone}`}>{fmt(y.average)}</td>
                                  <td className={`px-3 py-2 text-right ${tone}`}>{fmt(y.strike_rate)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Mini timeline ────────────────────────────────── */}
      {last5.length > 0 && (
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Last {last5.length} deliveries
          </div>
          <div className="flex gap-2">
            {last5.map((d, i) => {
              const isWicket = d.is_wicket;
              const isDot = d.runs_batter === 0 && !isWicket;

              let bg = "bg-emerald-500";
              let text = String(d.runs_batter);
              if (isWicket) {
                bg = "bg-red-500";
                text = "W";
              } else if (isDot) {
                bg = "bg-gray-300";
                text = "0";
              }

              return (
                <span
                  key={i}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${bg}`}
                  title={`Over ${d.over_number}.${d.ball_number} — ${d.date}`}
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Expandable deliveries table ──────────────────── */}
      {matchup.recent_deliveries.length > 0 && (
        <div className="px-6 py-3">
          <button
            onClick={() => setDeliveriesExpanded(!deliveriesExpanded)}
            className="flex w-full items-center justify-between text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <span>See all deliveries</span>
            <svg
              className={`h-4 w-4 transition-transform ${
                deliveriesExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {deliveriesExpanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left font-medium uppercase tracking-wider text-gray-400">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Over</th>
                    <th className="pb-2 pr-3 text-right">Runs</th>
                    <th className="pb-2 pr-3">Wicket</th>
                    <th className="pb-2 pr-3">Teams</th>
                    <th className="pb-2 pr-3">Venue</th>
                  </tr>
                </thead>
                <tbody>
                  {matchup.recent_deliveries.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-1.5 pr-3 text-gray-600">{d.date}</td>
                      <td className="py-1.5 pr-3 text-gray-600">
                        {d.over_number}.{d.ball_number}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium text-gray-900">
                        {d.runs_batter}
                      </td>
                      <td className="py-1.5 pr-3">
                        {d.is_wicket ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">W</span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-400">
                        {d.batting_team} v {d.bowling_team}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-400">{d.venue ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small stat cell ─────────────────────────────────────── */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-gray-100 px-4 py-3 text-center last:border-r-0">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-400">{label}</div>
    </div>
  );
}
