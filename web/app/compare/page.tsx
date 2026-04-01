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
} from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import TabGroup from "@/components/ui/TabGroup";
import Badge from "@/components/ui/Badge";

type SelectedPlayer = {
  player_id: string;
  name: string;
};

type CompareFormat = "All" | "IPL" | "T20I" | "T20" | "ODI" | "Test";

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
};

const TAB_ORDER: CompareFormat[] = ["All", "IPL", "T20I", "T20", "ODI", "Test"];
const IPL_COMPETITION = "Indian Premier League";

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
  if (row.format === "IT20") return "T20I";
  if (row.format === "T20") {
    if (row.competition_name === IPL_COMPETITION) return "IPL";
    return "T20";
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
  const mapped = playerVirtualFormat(row);
  return mapped === format;
}

function formatLabelForMessage(format: CompareFormat): string {
  return format === "All" ? "career" : format;
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
  if (side === "left" && leftBetter) return "text-[--accent-green] font-semibold";
  if (side === "right" && !leftBetter) return "text-[--accent-green] font-semibold";
  return "";
}

function BattingComparisonTable({
  player1,
  player2,
  left,
  right,
  format,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  left: BattingTotals | null;
  right: BattingTotals | null;
  format: CompareFormat;
}) {
  const noDataText = `No ${formatLabelForMessage(format)} batting data`;

  return (
    <section className="rounded-2xl bg-[--bg-card] p-5">
      <h2 className="text-lg font-semibold text-[--text-primary]">Batting comparison</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-[--bg-surface] text-left text-xs font-semibold uppercase tracking-wide text-[--text-muted]">
              <th className="py-2 pr-4">Stat</th>
              <th className="py-2 pr-4 text-right">{player1.name}</th>
              <th className="py-2 pr-0 text-right">{player2.name}</th>
            </tr>
          </thead>
          <tbody>
            <BattingRow
              label="Matches"
              left={left?.matches ?? null}
              right={right?.matches ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Innings"
              left={left?.innings ?? null}
              right={right?.innings ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Runs"
              left={left?.runs ?? null}
              right={right?.runs ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Average"
              left={left?.average ?? null}
              right={right?.average ?? null}
              preference="higher"
              formatter={(value) => value.toFixed(2)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Strike rate"
              left={left?.strikeRate ?? null}
              right={right?.strikeRate ?? null}
              preference="higher"
              formatter={(value) => value.toFixed(2)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Highest score"
              left={left?.highest ?? null}
              right={right?.highest ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="50s"
              left={left?.fifties ?? null}
              right={right?.fifties ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="100s"
              left={left?.hundreds ?? null}
              right={right?.hundreds ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
            <BattingRow
              label="Ducks"
              left={left?.ducks ?? null}
              right={right?.ducks ?? null}
              preference="lower"
              formatter={(value) => formatNumber(value)}
              leftMissingText={noDataText}
              rightMissingText={noDataText}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BattingRow({
  label,
  left,
  right,
  preference,
  formatter,
  leftMissingText,
  rightMissingText,
}: {
  label: string;
  left: number | null;
  right: number | null;
  preference: "higher" | "lower";
  formatter: (value: number) => string;
  leftMissingText: string;
  rightMissingText: string;
}) {
  return (
    <tr className="border-b border-[--bg-surface]">
      <td className="py-2.5 pr-4 text-[--text-secondary]">{label}</td>
      <td className={`py-2.5 pr-4 text-right text-[--text-primary] ${betterClass(left, right, preference, "left")}`}>
        {left === null ? <span className="text-xs text-[--text-muted]">{leftMissingText}</span> : formatter(left)}
      </td>
      <td className={`py-2.5 pr-0 text-right text-[--text-primary] ${betterClass(left, right, preference, "right")}`}>
        {right === null ? <span className="text-xs text-[--text-muted]">{rightMissingText}</span> : formatter(right)}
      </td>
    </tr>
  );
}

function BowlingComparisonTable({
  player1,
  player2,
  left,
  right,
  format,
  player1Bowls,
  player2Bowls,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  left: BowlingTotals | null;
  right: BowlingTotals | null;
  format: CompareFormat;
  player1Bowls: boolean;
  player2Bowls: boolean;
}) {
  const noDataText = `No ${formatLabelForMessage(format)} bowling data`;

  const leftMissingText = player1Bowls ? noDataText : "Does not bowl";
  const rightMissingText = player2Bowls ? noDataText : "Does not bowl";

  return (
    <section className="rounded-2xl bg-[--bg-card] p-5">
      <h2 className="text-lg font-semibold text-[--text-primary]">Bowling comparison</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-[--bg-surface] text-left text-xs font-semibold uppercase tracking-wide text-[--text-muted]">
              <th className="py-2 pr-4">Stat</th>
              <th className="py-2 pr-4 text-right">{player1.name}</th>
              <th className="py-2 pr-0 text-right">{player2.name}</th>
            </tr>
          </thead>
          <tbody>
            <BowlingRow
              label="Inn"
              left={left?.innings ?? null}
              right={right?.innings ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
            <BowlingRow
              label="Wickets"
              left={left?.wickets ?? null}
              right={right?.wickets ?? null}
              preference="higher"
              formatter={(value) => formatNumber(value)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
            <BowlingRow
              label="Runs"
              left={left?.runs ?? null}
              right={right?.runs ?? null}
              preference="lower"
              formatter={(value) => formatNumber(value)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
            <BowlingRow
              label="Economy"
              left={left?.economy ?? null}
              right={right?.economy ?? null}
              preference="lower"
              formatter={(value) => value.toFixed(2)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
            <BowlingRow
              label="Avg"
              left={left?.average ?? null}
              right={right?.average ?? null}
              preference="lower"
              formatter={(value) => value.toFixed(2)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
            <BowlingRow
              label="SR"
              left={left?.strikeRate ?? null}
              right={right?.strikeRate ?? null}
              preference="lower"
              formatter={(value) => value.toFixed(2)}
              leftMissingText={leftMissingText}
              rightMissingText={rightMissingText}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BowlingRow({
  label,
  left,
  right,
  preference,
  formatter,
  leftMissingText,
  rightMissingText,
}: {
  label: string;
  left: number | null;
  right: number | null;
  preference: "higher" | "lower";
  formatter: (value: number) => string;
  leftMissingText: string;
  rightMissingText: string;
}) {
  return (
    <tr className="border-b border-[--bg-surface]">
      <td className="py-2.5 pr-4 text-[--text-secondary]">{label}</td>
      <td className={`py-2.5 pr-4 text-right text-[--text-primary] ${betterClass(left, right, preference, "left")}`}>
        {left === null ? <span className="text-xs text-[--text-muted]">{leftMissingText}</span> : formatter(left)}
      </td>
      <td className={`py-2.5 pr-0 text-right text-[--text-primary] ${betterClass(left, right, preference, "right")}`}>
        {right === null ? <span className="text-xs text-[--text-muted]">{rightMissingText}</span> : formatter(right)}
      </td>
    </tr>
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
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
        const data = await api.searchPlayers(query.trim());
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
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="rounded-xl bg-[--bg-card] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[--text-muted]">{label}</p>
        <div className="flex items-center gap-3 rounded-lg bg-[--bg-surface] px-3 py-2">
          <Avatar name={selected.name} size="sm" />
          <span className="flex-1 truncate text-sm font-semibold text-[--text-primary]">{selected.name}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-[--text-muted] px-2 py-0.5 text-xs font-semibold text-[--text-muted] transition hover:border-[--text-secondary] hover:text-[--text-secondary]"
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
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[--text-muted]">{label}</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[--bg-surface] bg-[--bg-card] px-4 py-3 text-sm text-[--text-primary] placeholder-[--text-muted] outline-none transition focus:border-[--accent-green] focus:ring-1 focus:ring-[--accent-green]"
      />
      {loading && <p className="mt-1 text-xs text-[--text-muted]">Searching...</p>}

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[--bg-surface] bg-[--bg-card] shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[--text-muted]">No players found</p>
          ) : (
            <ul>
              {results.map((player) => (
                <li key={player.player_id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[--text-secondary] transition hover:bg-[--bg-surface] hover:text-[--text-primary]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect({ player_id: player.player_id, name: player.name });
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Avatar name={player.name} size="sm" />
                    <span>{player.name}</span>
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

function PlayerCard({
  player,
  batting,
  bowling,
}: {
  player: SelectedPlayer;
  batting: BattingTotals | null;
  bowling: BowlingTotals | null;
}) {
  return (
    <div className="rounded-2xl bg-[--bg-card] p-5">
      <div className="flex items-center gap-4">
        <Avatar name={player.name} size="lg" />
        <div>
          <h3 className="text-lg font-bold text-[--text-primary]">{player.name}</h3>
          <p className="text-sm text-[--text-muted]">
            {batting?.matches ?? 0} matches
          </p>
        </div>
      </div>
      
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
          <div className="text-xl font-bold text-[--text-primary]">{batting?.runs ? formatNumber(batting.runs) : "-"}</div>
          <div className="text-xs text-[--text-muted]">Runs</div>
        </div>
        <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
          <div className="text-xl font-bold text-[--accent-green]">{batting?.average ? batting.average.toFixed(1) : "-"}</div>
          <div className="text-xs text-[--text-muted]">Avg</div>
        </div>
        <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
          <div className="text-xl font-bold text-[--accent-gold]">{batting?.strikeRate ? batting.strikeRate.toFixed(1) : "-"}</div>
          <div className="text-xs text-[--text-muted]">SR</div>
        </div>
      </div>

      {bowling && bowling.wickets > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
            <div className="text-xl font-bold text-[--text-primary]">{formatNumber(bowling.wickets)}</div>
            <div className="text-xs text-[--text-muted]">Wickets</div>
          </div>
          <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
            <div className="text-xl font-bold text-[--accent-green]">{bowling.economy ? bowling.economy.toFixed(2) : "-"}</div>
            <div className="text-xs text-[--text-muted]">Econ</div>
          </div>
          <div className="rounded-lg bg-[--bg-surface] p-3 text-center">
            <div className="text-xl font-bold text-[--accent-gold]">{bowling.average ? bowling.average.toFixed(1) : "-"}</div>
            <div className="text-xs text-[--text-muted]">Bowl Avg</div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatComparisonBars({
  player1,
  player2,
  batting1,
  batting2,
  format,
}: {
  player1: SelectedPlayer;
  player2: SelectedPlayer;
  batting1: BattingTotals | null;
  batting2: BattingTotals | null;
  format: CompareFormat;
}) {
  const stats = [
    { label: "Runs", v1: batting1?.runs ?? 0, v2: batting2?.runs ?? 0, better: "higher" as const },
    { label: "Average", v1: batting1?.average ?? 0, v2: batting2?.average ?? 0, better: "higher" as const },
    { label: "Strike Rate", v1: batting1?.strikeRate ?? 0, v2: batting2?.strikeRate ?? 0, better: "higher" as const },
    { label: "50s", v1: batting1?.fifties ?? 0, v2: batting2?.fifties ?? 0, better: "higher" as const },
    { label: "100s", v1: batting1?.hundreds ?? 0, v2: batting2?.hundreds ?? 0, better: "higher" as const },
  ];

  const getBarWidth = (value: number, max: number) => {
    if (max === 0) return 0;
    return Math.min((value / max) * 100, 100);
  };

  return (
    <section className="rounded-2xl bg-[--bg-card] p-5">
      <h2 className="mb-4 text-lg font-semibold text-[--text-primary]">
        {format === "All" ? "Career" : format} Stats Comparison
      </h2>
      <div className="space-y-4">
        {stats.map((stat) => {
          const max = Math.max(stat.v1, stat.v2);
          const p1Better = stat.better === "higher" ? stat.v1 > stat.v2 : stat.v1 < stat.v2;
          const p2Better = stat.better === "higher" ? stat.v2 > stat.v1 : stat.v2 < stat.v1;

          return (
            <div key={stat.label}>
              <div className="mb-1 flex justify-between text-xs text-[--text-muted]">
                <span>{player1.name}</span>
                <span className="font-medium text-[--text-secondary]">{stat.label}</span>
                <span>{player2.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Player 1 bar (reversed) */}
                <div className="flex-1">
                  <div className="flex justify-end">
                    <div
                      className={`h-6 rounded-l-full transition-all ${p1Better ? "bg-[--accent-green]" : "bg-[--bg-surface]"}`}
                      style={{ width: `${getBarWidth(stat.v1, max)}%` }}
                    />
                  </div>
                </div>
                
                {/* Values */}
                <div className="flex w-28 items-center justify-center gap-1 text-sm font-semibold">
                  <span className={p1Better ? "text-[--accent-green]" : "text-[--text-primary]"}>
                    {typeof stat.v1 === "number" && stat.v1 % 1 !== 0 ? stat.v1.toFixed(1) : formatNumber(stat.v1)}
                  </span>
                  <span className="text-[--text-muted]">-</span>
                  <span className={p2Better ? "text-[--accent-green]" : "text-[--text-primary]"}>
                    {typeof stat.v2 === "number" && stat.v2 % 1 !== 0 ? stat.v2.toFixed(1) : formatNumber(stat.v2)}
                  </span>
                </div>

                {/* Player 2 bar */}
                <div className="flex-1">
                  <div
                    className={`h-6 rounded-r-full transition-all ${p2Better ? "bg-[--accent-green]" : "bg-[--bg-surface]"}`}
                    style={{ width: `${getBarWidth(stat.v2, max)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComparePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [player1, setPlayer1] = useState<SelectedPlayer | null>(null);
  const [player2, setPlayer2] = useState<SelectedPlayer | null>(null);
  const [format, setFormat] = useState<CompareFormat>("All");

  const [batting1, setBatting1] = useState<BattingStats[]>([]);
  const [batting2, setBatting2] = useState<BattingStats[]>([]);
  const [bowling1, setBowling1] = useState<BowlingStats[]>([]);
  const [bowling2, setBowling2] = useState<BowlingStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [partnershipRows, setPartnershipRows] = useState<PartnershipStats[]>([]);

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
      if (!player1 || !player2) {
        setPartnershipRows([]);
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
  }, [player1, player2]);

  const availableFormats = useMemo<CompareFormat[]>(() => {
    const set = new Set<CompareFormat>();
    const allRows = [...batting1, ...batting2, ...bowling1, ...bowling2];
    for (const row of allRows) {
      const mapped = playerVirtualFormat(row);
      if (mapped) set.add(mapped);
    }

    const ordered = TAB_ORDER.filter((tab) => tab !== "All" && set.has(tab));
    return ["All", ...ordered];
  }, [batting1, batting2, bowling1, bowling2]);

  useEffect(() => {
    if (format !== "All" && !availableFormats.includes(format)) {
      setFormat("All");
    }
  }, [availableFormats, format]);

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[--text-primary]">Player comparison</h1>
        <p className="mt-2 text-sm text-[--text-secondary]">
          Compare two players side by side across batting and bowling records.
        </p>
      </div>

      {/* Player selection */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <PlayerPicker
          label="Player 1"
          selected={player1}
          placeholder="Search for a player..."
          onSelect={setPlayer1}
          onClear={() => setPlayer1(null)}
        />

        <div className="hidden pb-3 text-center text-2xl font-bold text-[--accent-gold] md:block">VS</div>

        <PlayerPicker
          label="Player 2"
          selected={player2}
          placeholder="Search for a player..."
          onSelect={setPlayer2}
          onClear={() => setPlayer2(null)}
        />
      </div>

      {player1 && player2 && (
        <>
          {/* Format tabs */}
          <div className="flex items-center justify-center">
            <TabGroup
              tabs={availableFormats}
              activeTab={format}
              onChange={(tab) => setFormat(tab as CompareFormat)}
              size="sm"
            />
          </div>

          {loadingStats && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[--accent-green] border-t-transparent" />
            </div>
          )}

          {!loadingStats && (
            <>
              {/* Side-by-side player cards */}
              <div className="grid gap-4 md:grid-cols-2">
                <PlayerCard player={player1} batting={battingTotals1} bowling={bowlingTotals1} />
                <PlayerCard player={player2} batting={battingTotals2} bowling={bowlingTotals2} />
              </div>

              {/* Stats comparison with bar charts */}
              <StatComparisonBars
                player1={player1}
                player2={player2}
                batting1={battingTotals1}
                batting2={battingTotals2}
                format={format}
              />

              {/* Batting table */}
              <BattingComparisonTable
                player1={player1}
                player2={player2}
                left={battingTotals1}
                right={battingTotals2}
                format={format}
              />

              {/* Bowling table */}
              {hasBowlingData && (
                <BowlingComparisonTable
                  player1={player1}
                  player2={player2}
                  left={bowlingTotals1}
                  right={bowlingTotals2}
                  format={format}
                  player1Bowls={bowling1.length > 0}
                  player2Bowls={bowling2.length > 0}
                />
              )}

              {/* Head-to-head shortcut */}
              <section className="rounded-2xl bg-[--bg-card] p-5">
                <h2 className="text-lg font-semibold text-[--text-primary]">Head-to-head matchups</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/players/${player1.player_id}?bowler=${player2.player_id}`}
                    className="group flex items-center gap-2 rounded-lg bg-[--bg-surface] px-4 py-3 text-sm font-medium text-[--text-secondary] transition hover:text-[--accent-green]"
                  >
                    <Avatar name={player1.name} size="sm" />
                    <span>{player1.name}</span>
                    <span className="text-[--text-muted]">vs</span>
                    <Avatar name={player2.name} size="sm" />
                    <span>{player2.name}</span>
                    <span className="text-[--accent-green]">→</span>
                  </Link>
                  <Link
                    href={`/players/${player2.player_id}?bowler=${player1.player_id}`}
                    className="group flex items-center gap-2 rounded-lg bg-[--bg-surface] px-4 py-3 text-sm font-medium text-[--text-secondary] transition hover:text-[--accent-green]"
                  >
                    <Avatar name={player2.name} size="sm" />
                    <span>{player2.name}</span>
                    <span className="text-[--text-muted]">vs</span>
                    <Avatar name={player1.name} size="sm" />
                    <span>{player1.name}</span>
                    <span className="text-[--accent-green]">→</span>
                  </Link>
                </div>
              </section>

              {/* Partnership section */}
              {partnershipRows.length > 0 && (
                <section className="rounded-2xl bg-[--bg-card] p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar name={player1.name} size="sm" />
                    <h2 className="text-lg font-semibold text-[--text-primary]">Partnership record</h2>
                    <Avatar name={player2.name} size="sm" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {partnershipRows.map((row) => (
                      <div
                        key={`${row.format_bucket}-${row.partner_id}`}
                        className="rounded-xl bg-[--bg-surface] p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge text={row.format_bucket} />
                          <span className="text-xs text-[--text-muted]">{row.innings_together} inn</span>
                        </div>
                        <div className="text-2xl font-bold text-[--text-primary]">{formatNumber(row.total_runs)} <span className="text-sm font-normal text-[--text-muted]">runs</span></div>
                        <div className="mt-1 flex justify-between text-xs text-[--text-secondary]">
                          <span>Avg: <span className="text-[--accent-green] font-semibold">{formatMetric(row.avg_partnership)}</span></span>
                          <span>Best: <span className="text-[--accent-gold] font-semibold">{formatNumber(row.best_partnership)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[--accent-green] border-t-transparent" />
      </div>
    }>
      <ComparePageInner />
    </Suspense>
  );
}
