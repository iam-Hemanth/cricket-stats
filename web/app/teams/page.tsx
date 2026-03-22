"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api, {
  type TeamH2HResponse,
  type TeamHeadToHead,
  type TeamSearchResult,
} from "@/lib/api";

const FORMAT_ORDER = ["Test", "ODI", "IT20", "T20", "IPL", "ODM", "MDM"];

function formatDate(date: string): string {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TeamPicker({
  label,
  selectedTeam,
  onSelect,
  onClear,
}: {
  label: string;
  selectedTeam: string | null;
  onSelect: (team: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await api.searchTeams(query.trim());
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (selectedTeam) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
          <span className="text-sm font-semibold text-gray-900">{selectedTeam}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label={`Clear ${label}`}
          >
            X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {loading && <p className="mt-1 text-xs text-gray-400">Searching...</p>}

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No teams found</p>
          ) : (
            <ul>
              {results.map((team) => (
                <li key={team.team}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(team.team);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {team.team}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function getWinsForTeam(row: TeamHeadToHead, team: string): number {
  if (row.team_a === team) return row.team_a_wins;
  if (row.team_b === team) return row.team_b_wins;
  return 0;
}

export default function TeamsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [team1, setTeam1] = useState<string | null>(null);
  const [team2, setTeam2] = useState<string | null>(null);
  const [format, setFormat] = useState<string>("All");

  const [data, setData] = useState<TeamH2HResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qpTeam1 = searchParams.get("team1");
    const qpTeam2 = searchParams.get("team2");
    const qpFormat = searchParams.get("format");
    setTeam1(qpTeam1?.trim() || null);
    setTeam2(qpTeam2?.trim() || null);
    setFormat(qpFormat?.trim() || "All");
  }, [searchParams]);

  const updateUrl = (nextTeam1: string | null, nextTeam2: string | null, nextFormat: string) => {
    const qp = new URLSearchParams();
    if (nextTeam1) qp.set("team1", nextTeam1);
    if (nextTeam2) qp.set("team2", nextTeam2);
    if (nextFormat !== "All") qp.set("format", nextFormat);
    const qs = qp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  useEffect(() => {
    if (!team1 || !team2) {
      setData(null);
      setError(null);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const payload = await api.getTeamH2H(
          team1,
          team2,
          format === "All" ? undefined : format
        );
        setData(payload);
      } catch {
        setData(null);
        setError("Failed to load head-to-head data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [team1, team2, format]);

  const availableFormats = useMemo(() => {
    const fromData = new Set((data?.by_format ?? []).map((r) => r.format_bucket));
    const ordered = FORMAT_ORDER.filter((f) => fromData.has(f));
    return ["All", ...ordered];
  }, [data]);

  const overall = useMemo(() => {
    if (!data || !team1 || !team2 || data.by_format.length === 0) return null;

    const rows = data.by_format;
    const matches = rows.reduce((sum, row) => sum + row.matches_played, 0);
    const t1Wins = rows.reduce((sum, row) => sum + getWinsForTeam(row, team1), 0);
    const t2Wins = rows.reduce((sum, row) => sum + getWinsForTeam(row, team2), 0);

    const weightedFirst = rows.reduce(
      (sum, row) => sum + (row.avg_first_innings ?? 0) * row.matches_played,
      0
    );
    const weightedSecond = rows.reduce(
      (sum, row) => sum + (row.avg_second_innings ?? 0) * row.matches_played,
      0
    );

    const firstMatch = rows
      .map((r) => r.first_match)
      .filter((r): r is string => Boolean(r))
      .sort()[0] ?? null;

    const highestTotal = rows.reduce(
      (max, row) => Math.max(max, row.highest_team_total ?? 0),
      0
    );

    return {
      matches,
      team1Wins: t1Wins,
      team2Wins: t2Wins,
      avgFirst: matches > 0 ? Number((weightedFirst / matches).toFixed(1)) : null,
      avgSecond: matches > 0 ? Number((weightedSecond / matches).toFixed(1)) : null,
      firstPlayedYear: firstMatch ? new Date(firstMatch).getFullYear() : null,
      highestTotal: highestTotal || null,
    };
  }, [data, team1, team2]);

  const seasonRows = useMemo(() => {
    if (!data || format !== "IPL") return [];
    return data.seasons
      .filter((row) => row.format_bucket === "IPL")
      .slice(0, 15);
  }, [data, format]);

  const winPct = useMemo(() => {
    if (!overall || overall.matches === 0) return { team1: 50, team2: 50 };
    const t1 = (overall.team1Wins / overall.matches) * 100;
    return { team1: t1, team2: 100 - t1 };
  }, [overall]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Team head-to-head</h1>
        <p className="mt-2 text-sm text-gray-500">
          Compare rivalry records, yearly results, and recent outcomes.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <TeamPicker
          label="Team 1"
          selectedTeam={team1}
          onSelect={(value) => {
            setTeam1(value);
            updateUrl(value, team2, format);
          }}
          onClear={() => {
            setTeam1(null);
            setFormat("All");
            updateUrl(null, team2, "All");
          }}
        />

        <div className="pb-2 text-center text-xl font-semibold text-gray-400">vs</div>

        <TeamPicker
          label="Team 2"
          selectedTeam={team2}
          onSelect={(value) => {
            setTeam2(value);
            updateUrl(team1, value, format);
          }}
          onClear={() => {
            setTeam2(null);
            setFormat("All");
            updateUrl(team1, null, "All");
          }}
        />
      </div>

      {team1 && team2 && data && (
        <div className="flex flex-wrap items-center gap-2">
          {availableFormats.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setFormat(tab);
                updateUrl(team1, team2, tab);
              }}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                format === tab
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading head-to-head data...</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {team1 && team2 && !loading && !error && overall && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">{team1}</p>
              <p className="text-4xl font-bold text-blue-700">{overall.team1Wins} wins</p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-sm text-gray-500">{team2}</p>
              <p className="text-4xl font-bold text-orange-600">{overall.team2Wins} wins</p>
            </div>
          </div>

          <div className="h-4 overflow-hidden rounded-full bg-gray-200">
            <div className="flex h-full">
              <div className="bg-blue-600" style={{ width: `${winPct.team1}%` }} />
              <div className="bg-orange-500" style={{ width: `${winPct.team2}%` }} />
            </div>
          </div>

          <p className="text-sm text-gray-600">
            {overall.matches} matches played
            {overall.firstPlayedYear ? ` · first played ${overall.firstPlayedYear}` : ""}
          </p>

          <div className="grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 sm:grid-cols-3">
            <p>Avg 1st innings: {overall.avgFirst ?? "-"}</p>
            <p>Avg 2nd innings: {overall.avgSecond ?? "-"}</p>
            <p>Highest total: {overall.highestTotal ?? "-"}</p>
          </div>
        </section>
      )}

      {team1 && team2 && !loading && !error && format === "IPL" && seasonRows.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Season by season</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Season</th>
                  <th className="py-2 pr-4 font-medium">Matches</th>
                  <th className="py-2 pr-4 font-medium">{team1} wins</th>
                  <th className="py-2 font-medium">{team2} wins</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map((row) => {
                  const refRow = data?.by_format.find((f) => f.format_bucket === "IPL");
                  const team1Wins = refRow && refRow.team_a === team1 ? row.team_a_wins : row.team_b_wins;
                  const team2Wins = refRow && refRow.team_a === team2 ? row.team_a_wins : row.team_b_wins;
                  return (
                    <tr key={`${row.year}-${row.format_bucket}`} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-900">{row.year}</td>
                      <td className="py-2 pr-4 text-gray-700">{row.matches_played}</td>
                      <td className="py-2 pr-4 text-gray-700">{team1Wins}</td>
                      <td className="py-2 text-gray-700">{team2Wins}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {team1 && team2 && !loading && !error && data && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Recent results (last 5)</h2>

          <div className="grid gap-3">
            {data.recent_matches.length === 0 && (
              <p className="text-sm text-gray-500">No recent matches found.</p>
            )}
            {data.recent_matches.map((match) => {
              let margin = "result unavailable";
              if (match.win_by_runs && match.win_by_runs > 0) {
                margin = `${match.win_by_runs} runs`;
              } else if (match.win_by_wickets && match.win_by_wickets > 0) {
                margin = `${match.win_by_wickets} wickets`;
              }

              return (
                <article
                  key={match.match_id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm text-gray-500">
                    {formatDate(match.date)} · {match.venue || "Unknown venue"} · {match.format_bucket}
                  </p>
                  <p className="mt-1 text-base font-semibold text-gray-900">
                    {match.winner} won by {margin}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {match.batting_first} {match.first_innings_score ?? "-"} vs {match.bowling_first}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
