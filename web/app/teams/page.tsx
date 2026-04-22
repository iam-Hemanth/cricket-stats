"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api, {
  type TeamH2HResponse,
  type TeamHeadToHead,
  type TeamSearchResult,
  type TopBatterH2H,
  type TopBowlerH2H,
} from "@/lib/api";
import TabGroup from "@/components/ui/TabGroup";
import Badge from "@/components/ui/Badge";

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
      <div className="glass-card rounded-xl px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[--text-muted]">{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[--bg-surface] px-3 py-2">
          <span className="text-sm font-semibold text-[--text-primary]">{selectedTeam}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-1 text-xs font-medium text-[--text-muted] transition hover:bg-[--text-muted]/10 hover:text-[--text-secondary]"
            aria-label={`Clear ${label}`}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[--text-muted]">{label}</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="w-full rounded-xl border border-[--glass-border] bg-[--bg-card] px-4 py-2.5 text-sm text-[--text-primary] placeholder-[--text-muted] outline-none transition-all duration-200 focus:border-[--accent-green]/40 focus:shadow-sm focus:shadow-[--accent-green-glow]"
      />
      {loading && <p className="mt-1 text-xs text-[--text-muted]">Searching...</p>}

      {open && (
        <div className="animate-slide-down absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[--glass-border] bg-[--bg-surface]/95 shadow-xl shadow-black/20 backdrop-blur-xl">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[--text-muted]">No teams found</p>
          ) : (
            <ul>
              {results.map((team) => (
                <li key={team.team}>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm text-[--text-secondary] transition hover:bg-[--bg-surface] hover:text-[--text-primary]"
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

function TeamsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [team1, setTeam1] = useState<string | null>(null);
  const [team2, setTeam2] = useState<string | null>(null);
  const [format, setFormat] = useState<string>("All");

  const [data, setData] = useState<TeamH2HResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topBatters, setTopBatters] = useState<TopBatterH2H[]>([]);
  const [topBowlers, setTopBowlers] = useState<TopBowlerH2H[]>([]);

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
        const formatVal = format === "All" ? undefined : format;
        const payload = await api.getTeamH2H(team1, team2, formatVal);
        setData(payload);
        
        // Fetch top performers
        const [batters, bowlers] = await Promise.all([
          api.getTeamH2HTopBatters(team1, team2, formatVal),
          api.getTeamH2HTopBowlers(team1, team2, formatVal),
        ]);
        setTopBatters(batters);
        setTopBowlers(bowlers);
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[--text-primary]">Team head-to-head</h1>
        <p className="mt-2 text-sm text-[--text-muted]">
          Compare rivalry records, yearly results, and recent outcomes.
        </p>
      </div>

      {/* Team Pickers */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
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

        <div className="pb-2 text-center text-xl font-bold text-[--text-muted]">vs</div>

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

      {/* Format Filter Tabs */}
      {team1 && team2 && data && (
        <TabGroup
          tabs={availableFormats}
          activeTab={format}
          onChange={(tab) => {
            setFormat(tab);
            updateUrl(team1, team2, tab);
          }}
        />
      )}

      {/* Loading & Error States */}
      {loading && <p className="text-sm text-[--text-muted]">Loading head-to-head data...</p>}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* H2H Comparison Card */}
      {team1 && team2 && !loading && !error && overall && (
        <section className="glass-card space-y-5 rounded-2xl p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-[--text-muted]">{team1}</p>
              <p className="text-4xl font-bold text-[--accent-green]">{overall.team1Wins} wins</p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-sm text-[--text-muted]">{team2}</p>
              <p className="text-4xl font-bold text-[--accent-gold]">{overall.team2Wins} wins</p>
            </div>
          </div>

          {/* Win Percentage Bar */}
          <div className="h-4 overflow-hidden rounded-full bg-[--bg-surface]">
            <div className="flex h-full">
              <div
                className="bg-gradient-to-r from-[--accent-green] to-emerald-400 transition-all duration-700 ease-out rounded-l-full"
                style={{ width: `${winPct.team1}%` }}
              />
              <div
                className="bg-gradient-to-r from-amber-400 to-[--accent-gold] transition-all duration-700 ease-out rounded-r-full"
                style={{ width: `${winPct.team2}%` }}
              />
            </div>
          </div>

          <p className="text-sm text-[--text-secondary]">
            {overall.matches} matches played
            {overall.firstPlayedYear ? ` · first played ${overall.firstPlayedYear}` : ""}
          </p>

          {/* Stats Comparison */}
          <div className="grid gap-4 border-t border-[--glass-border] pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[--text-muted]">Avg 1st innings</p>
              <p className="font-semibold text-[--text-primary]">{overall.avgFirst ?? "-"}</p>
            </div>
            <div>
              <p className="text-[--text-muted]">Avg 2nd innings</p>
              <p className="font-semibold text-[--text-primary]">{overall.avgSecond ?? "-"}</p>
            </div>
            <div>
              <p className="text-[--text-muted]">Highest total</p>
              <p className="font-semibold text-[--text-primary]">{overall.highestTotal ?? "-"}</p>
            </div>
          </div>
        </section>
      )}

      {/* Season Breakdown Table */}
      {team1 && team2 && !loading && !error && format === "IPL" && seasonRows.length > 0 && (
        <section className="glass-card space-y-4 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[--text-primary]">Season by season</h2>
          <div className="overflow-x-auto rounded-xl border border-[--glass-border]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[--glass-border] text-left">
                  <th className="py-3 pr-4 font-medium text-[--text-muted]">Season</th>
                  <th className="py-3 pr-4 font-medium text-[--text-muted]">Matches</th>
                  <th className="py-3 pr-4 font-medium text-[--text-muted]">{team1} wins</th>
                  <th className="py-3 font-medium text-[--text-muted]">{team2} wins</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map((row) => {
                  const refRow = data?.by_format.find((f) => f.format_bucket === "IPL");
                  const team1Wins = refRow && refRow.team_a === team1 ? row.team_a_wins : row.team_b_wins;
                  const team2Wins = refRow && refRow.team_a === team2 ? row.team_a_wins : row.team_b_wins;
                  return (
                    <tr
                      key={`${row.year}-${row.format_bucket}`}
                      className="border-b border-[--glass-border] transition-colors hover:bg-[--bg-card-hover]"
                    >
                      <td className="py-3 pr-4 font-medium text-[--text-primary]">{row.year}</td>
                      <td className="py-3 pr-4 text-[--text-secondary]">{row.matches_played}</td>
                      <td className="py-3 pr-4 font-semibold text-[--accent-green]">{team1Wins}</td>
                      <td className="py-3 font-semibold text-[--accent-gold]">{team2Wins}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top Performers in H2H */}
      {team1 && team2 && !loading && !error && data && (topBatters.length > 0 || topBowlers.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[--text-primary]">Top Performers</h2>
          
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Batters */}
            {topBatters.length > 0 && (
              <div className="glass-card rounded-xl p-4">
                <h3 className="mb-3 text-lg font-semibold text-[--text-primary]">Top Run Scorers</h3>
                <div className="space-y-2">
                  {topBatters.slice(0, 10).map((batter, idx) => (
                    <Link
                      key={batter.player_id}
                      href={`/players/${batter.player_id}`}
                      className="flex items-center justify-between rounded-lg p-2.5 transition-colors hover:bg-[--bg-card-hover]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-[--accent-gold]/20 text-[--accent-gold]' :
                          idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                          idx === 2 ? 'bg-amber-700/20 text-amber-600' :
                          'bg-[--bg-surface] text-[--text-muted]'
                        }`}>{idx + 1}</span>
                        <span className="font-medium text-[--text-primary]">{batter.player_name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-[--accent-green]">{batter.runs}</span>
                        <span className="text-[--text-muted]">
                          Avg: {batter.average?.toFixed(2) ?? '-'} | SR: {batter.strike_rate?.toFixed(2) ?? '-'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Top Bowlers */}
            {topBowlers.length > 0 && (
              <div className="glass-card rounded-xl p-4">
                <h3 className="mb-3 text-lg font-semibold text-[--text-primary]">Top Wicket Takers</h3>
                <div className="space-y-2">
                  {topBowlers.slice(0, 10).map((bowler, idx) => (
                    <Link
                      key={bowler.player_id}
                      href={`/players/${bowler.player_id}`}
                      className="flex items-center justify-between rounded-lg p-2.5 transition-colors hover:bg-[--bg-card-hover]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-[--accent-gold]/20 text-[--accent-gold]' :
                          idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                          idx === 2 ? 'bg-amber-700/20 text-amber-600' :
                          'bg-[--bg-surface] text-[--text-muted]'
                        }`}>{idx + 1}</span>
                        <span className="font-medium text-[--text-primary]">{bowler.player_name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-[--accent-green]">{bowler.wickets}</span>
                        <span className="text-[--text-muted]">
                          Avg: {bowler.bowling_average?.toFixed(2) ?? '-'} | Econ: {bowler.economy?.toFixed(2) ?? '-'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Matches */}
      {team1 && team2 && !loading && !error && data && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[--text-primary]">Recent results (last 5)</h2>

          <div className="grid gap-3">
            {data.recent_matches.length === 0 && (
              <p className="text-sm text-[--text-muted]">No recent matches found.</p>
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
                  className="glass-card card-hover rounded-xl p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[--text-muted]">
                    <span>{formatDate(match.date)}</span>
                    <span>·</span>
                    <span>{match.venue || "Unknown venue"}</span>
                    <Badge text={match.format_bucket} variant="outline" />
                  </div>
                  <p className="mt-2 text-base font-semibold text-[--text-primary]">
                    <span className="text-[--accent-green]">{match.winner}</span> won by {margin}
                  </p>
                  <p className="mt-1 text-sm text-[--text-secondary]">
                    {match.batting_first}{" "}
                    <span className="font-medium text-[--text-primary]">
                      {match.first_innings_score ?? "-"}
                    </span>{" "}
                    vs {match.bowling_first}
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

export default function TeamsPage() {
  return (
    <Suspense fallback={<div className="text-[--text-muted]">Loading...</div>}>
      <TeamsPageInner />
    </Suspense>
  );
}
