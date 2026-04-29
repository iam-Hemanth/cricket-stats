"use client";
import Link from "next/link";
import type { MatchListItem } from "@/lib/api";

const FORMAT_COLORS: Record<string, string> = {
  T20:  "#f97316",
  IT20: "#f59e0b",
  ODI:  "#3b82f6",
  ODM:  "#60a5fa",
  Test: "#a855f7",
  MDM:  "#c084fc",
};

const FORMAT_LABELS: Record<string, string> = {
  IT20: "T20I",
  ODM:  "List A",
  MDM:  "First-class",
};

function formatLabel(f: string) {
  return FORMAT_LABELS[f] ?? f;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  match: MatchListItem;
}

export default function MatchListCard({ match }: Props) {
  const color = FORMAT_COLORS[match.format] ?? "#6b7280";
  const isTeam1Winner = match.winner === match.team1;
  const isTeam2Winner = match.winner === match.team2;

  return (
    <Link
      href={`/match/${match.match_id}`}
      className="group block glass-card card-hover rounded-xl overflow-hidden"
    >
      <div className="p-4 sm:p-5">
        {/* Top row: format + date + competition */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}22`, color }}
            >
              {formatLabel(match.format)}
            </span>
            {match.competition && (
              <Link
                href={`/matches?competition=${encodeURIComponent(match.competition)}`}
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-[--text-muted] hover:text-[--accent-green] transition-colors truncate max-w-[180px]"
              >
                {match.competition}
              </Link>
            )}
          </div>
          <span className="text-[11px] text-[--text-muted] shrink-0">{formatDate(match.date)}</span>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3">
          {/* Team 1 */}
          <div className="flex-1 min-w-0">
            <Link
              href={`/matches?team=${encodeURIComponent(match.team1)}`}
              onClick={e => e.stopPropagation()}
              className={`font-semibold text-sm truncate block transition-colors hover:text-[--accent-green] ${isTeam1Winner ? "text-[--text-primary]" : "text-[--text-secondary]"}`}
            >
              {match.team1}
            </Link>
          </div>

          {/* vs divider */}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-[--text-muted] font-mono">vs</span>
          </div>

          {/* Team 2 */}
          <div className="flex-1 min-w-0 text-right">
            <Link
              href={`/matches?team=${encodeURIComponent(match.team2)}`}
              onClick={e => e.stopPropagation()}
              className={`font-semibold text-sm truncate block transition-colors hover:text-[--accent-green] ${isTeam2Winner ? "text-[--text-primary]" : "text-[--text-secondary]"}`}
            >
              {match.team2}
            </Link>
          </div>
        </div>

        {/* Bottom row: result + venue */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {match.winner ? (
            <span className="text-[11px] font-medium" style={{ color }}>
              <span className="text-[--accent-green]">{match.winner}</span>
              {match.win_margin ? ` won ${match.win_margin}` : " won"}
            </span>
          ) : (
            <span className="text-[11px] text-[--text-muted] italic">No result</span>
          )}

          {match.venue && (
            <span className="text-[10px] text-[--text-muted] truncate max-w-[160px] text-right">
              📍 {match.venue}
            </span>
          )}
        </div>
      </div>

      {/* Hover indicator line */}
      <div
        className="h-0.5 w-0 group-hover:w-full transition-all duration-300"
        style={{ backgroundColor: color }}
      />
    </Link>
  );
}
