"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import api, {
  type BattingStats,
  type BowlingStats,
  type PartnershipStats,
  type PlayerSearchResult,
} from "@/lib/api";

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
  if (side === "left" && leftBetter) return "text-emerald-700 font-semibold";
  if (side === "right" && !leftBetter) return "text-emerald-700 font-semibold";
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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Batting comparison</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
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
    <tr className="border-b border-gray-100">
      <td className="py-2.5 pr-4 text-gray-700">{label}</td>
      <td className={`py-2.5 pr-4 text-right ${betterClass(left, right, preference, "left")}`}>
        {left === null ? <span className="text-xs text-gray-500">{leftMissingText}</span> : formatter(left)}
      </td>
      <td className={`py-2.5 pr-0 text-right ${betterClass(left, right, preference, "right")}`}>
        {right === null ? <span className="text-xs text-gray-500">{rightMissingText}</span> : formatter(right)}
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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Bowling comparison</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
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
    <tr className="border-b border-gray-100">
      <td className="py-2.5 pr-4 text-gray-700">{label}</td>
      <td className={`py-2.5 pr-4 text-right ${betterClass(left, right, preference, "left")}`}>
        {left === null ? <span className="text-xs text-gray-500">{leftMissingText}</span> : formatter(left)}
      </td>
      <td className={`py-2.5 pr-0 text-right ${betterClass(left, right, preference, "right")}`}>
        {right === null ? <span className="text-xs text-gray-500">{rightMissingText}</span> : formatter(right)}
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
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">{label}</p>
        <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
          <span className="truncate text-sm font-semibold text-gray-900">{selected.name}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-3 rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-800"
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
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {loading && <p className="mt-1 text-xs text-gray-400">Searching...</p>}

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No players found</p>
          ) : (
            <ul>
              {results.map((player) => (
                <li key={player.player_id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect({ player_id: player.player_id, name: player.name });
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {player.name}
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

export default function ComparePage() {
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Player comparison</h1>
        <p className="mt-2 text-sm text-gray-500">
          Compare two players side by side across batting and bowling records.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <PlayerPicker
          label="Player 1"
          selected={player1}
          placeholder="Player 1 search..."
          onSelect={setPlayer1}
          onClear={() => setPlayer1(null)}
        />

        <div className="pb-2 text-center text-xl font-semibold text-gray-400">vs</div>

        <PlayerPicker
          label="Player 2"
          selected={player2}
          placeholder="Player 2 search..."
          onSelect={setPlayer2}
          onClear={() => setPlayer2(null)}
        />
      </div>

      {player1 && player2 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {availableFormats.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFormat(tab)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  tab === format
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {loadingStats && (
            <p className="text-sm text-gray-500">Loading stats...</p>
          )}

          {!loadingStats && (
            <>
              <BattingComparisonTable
                player1={player1}
                player2={player2}
                left={battingTotals1}
                right={battingTotals2}
                format={format}
              />

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

              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Head-to-head shortcut</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/players/${player1.player_id}?bowler=${player2.player_id}`}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-500 hover:text-blue-600"
                  >
                    {player1.name} batting vs {player2.name} bowling →
                  </Link>
                  <Link
                    href={`/players/${player2.player_id}?bowler=${player1.player_id}`}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-500 hover:text-blue-600"
                  >
                    {player2.name} batting vs {player1.name} bowling →
                  </Link>
                </div>
              </section>

              {partnershipRows.length > 0 && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Partnership record together</h2>
                  <div className="mt-3 space-y-2 text-sm text-gray-700">
                    {partnershipRows.map((row) => (
                      <p key={`${row.format_bucket}-${row.partner_id}`}>
                        {row.format_bucket} · {row.innings_together} innings · {formatNumber(row.total_runs)} runs · avg {formatMetric(row.avg_partnership)} per stand · best {formatNumber(row.best_partnership)}
                      </p>
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
