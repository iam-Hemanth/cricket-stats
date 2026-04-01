export const dynamic = 'force-dynamic';

import Link from "next/link";
import Avatar from "@/components/ui/Avatar";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PlayerSearchResult {
  player_id: string;
  name: string;
}

export default async function SearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  /* ── Too short ─────────────────────────────────────────── */
  if (query.length < 2) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-[--text-primary]">Search players</h1>
        <p className="mt-2 text-[--text-secondary]">
          Enter at least 2 characters to search.
        </p>
      </div>
    );
  }

  /* ── Fetch ─────────────────────────────────────────────── */
  let results: PlayerSearchResult[] = [];
  try {
    const res = await fetch(
      `${API_URL}/api/v1/players/search?q=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    if (res.ok) results = await res.json();
  } catch {
    /* API down — show empty results */
  }

  /* ── No results ────────────────────────────────────────── */
  if (results.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[--bg-card]">
          <svg
            className="h-10 w-10 text-[--text-secondary]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[--text-primary]">
          No players found for &lsquo;{query}&rsquo;
        </h1>
        <p className="mt-2 text-[--text-secondary]">Try a different spelling or search term.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-[--accent-green] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Back to homepage
        </Link>
      </div>
    );
  }

  /* ── Results ───────────────────────────────────────────── */
  return (
    <div>
      <h1 className="text-2xl font-bold text-[--text-primary]">
        Search results for &lsquo;{query}&rsquo;
      </h1>
      <p className="mt-1 text-sm text-[--text-secondary]">
        {results.length} player{results.length !== 1 ? "s" : ""} found
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((player) => (
          <Link
            key={player.player_id}
            href={`/players/${player.player_id}`}
            className="group flex items-center gap-3 rounded-xl bg-[--bg-card] px-5 py-4 transition hover:bg-[--bg-surface]"
          >
            <Avatar name={player.name} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[--text-primary] group-hover:text-[--accent-green]">
                {player.name}
              </div>
              <div className="text-xs text-[--text-secondary]">
                {player.player_id}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
