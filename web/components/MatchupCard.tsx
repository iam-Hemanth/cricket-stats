"use client";

import { useState, useEffect } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface MatchupData {
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
}

interface Delivery {
  date: string;
  match_id: string;
  batting_team: string;
  bowling_team: string;
  over_number: number;
  ball_number: number;
  runs_batter: number;
  runs_extras: number;
  runs_total: number;
  is_wide: boolean;
  is_noball: boolean;
  wicket_kind: string | null;
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
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/matchup?batter_id=${batterId}&bowler_id=${bowlerId}`
        );
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setMatchup(data.matchup);
        setDeliveries(data.recent_deliveries ?? []);
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

  /* ── Last 5 deliveries for mini-timeline ─────────────── */
  const last5 = deliveries.slice(0, 5);

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

      {/* ── Stats grid 2×3 ───────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <Stat label="Balls" value={String(matchup.balls)} />
        <Stat label="Runs" value={String(matchup.runs)} />
        <Stat label="Dismissals" value={String(matchup.dismissals)} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <Stat label="Avg" value={fmt(matchup.average)} />
        <Stat label="SR" value={fmt(matchup.strike_rate)} />
        <Stat
          label="Dot ball %"
          value={matchup.dot_ball_pct !== null ? `${fmt(matchup.dot_ball_pct)}%` : "–"}
        />
      </div>

      {/* ── Mini timeline ────────────────────────────────── */}
      {last5.length > 0 && (
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Last {last5.length} deliveries
          </div>
          <div className="flex gap-2">
            {last5.map((d, i) => {
              const isWicket = !!d.wicket_kind;
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
      {deliveries.length > 0 && (
        <div className="px-6 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <span>See all deliveries</span>
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
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

          {expanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left font-medium uppercase tracking-wider text-gray-400">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Over</th>
                    <th className="pb-2 pr-3 text-right">Runs</th>
                    <th className="pb-2 pr-3">Extras</th>
                    <th className="pb-2 pr-3">Wicket</th>
                    <th className="pb-2 pr-3">Teams</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d, i) => (
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
                      <td className="py-1.5 pr-3 text-gray-500">
                        {d.is_wide ? "wd" : d.is_noball ? "nb" : "–"}
                      </td>
                      <td className="py-1.5 pr-3">
                        {d.wicket_kind ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                            {d.wicket_kind}
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-400">
                        {d.batting_team} v {d.bowling_team}
                      </td>
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
    <div className="px-4 py-3 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-400">{label}</div>
    </div>
  );
}
