import Link from "next/link";

interface StatCardProps {
  /** Large stat value displayed prominently (e.g., "10/126", "823") */
  value: string;
  /** Description text below the stat (e.g., "Best bowling figures") */
  label: string;
  /** Player or team name displayed in accent color */
  playerName?: string;
  /** If provided, playerName becomes a clickable link */
  playerId?: string;
  /** Format badge shown at bottom (e.g., "Test", "T20 + IPL") */
  badge?: string;
}

export default function StatCard({
  value,
  label,
  playerName,
  playerId,
  badge,
}: StatCardProps) {
  return (
    <div className="group rounded-xl bg-[--bg-card] p-5 transition-all hover:ring-1 hover:ring-[--accent-green]/30">
      {/* Large stat value */}
      <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl">
        {value}
      </div>

      {/* Description label */}
      <p className="mt-1 text-sm text-[--text-secondary]">{label}</p>

      {/* Player/team name */}
      {playerName && (
        <div className="mt-3">
          {playerId ? (
            <Link
              href={`/players/${playerId}`}
              className="text-sm font-medium text-[--accent-green] transition hover:underline"
            >
              {playerName}
            </Link>
          ) : (
            <span className="text-sm font-medium text-[--accent-green]">
              {playerName}
            </span>
          )}
        </div>
      )}

      {/* Format badge */}
      {badge && (
        <div className="mt-3">
          <span className="inline-block rounded-full border border-[--accent-green]/40 px-2.5 py-0.5 text-xs font-medium text-[--accent-green]">
            {badge}
          </span>
        </div>
      )}
    </div>
  );
}
