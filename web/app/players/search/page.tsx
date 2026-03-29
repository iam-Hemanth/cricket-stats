export const dynamic = 'force-dynamic';

import Link from "next/link";

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
        <h1 className="text-2xl font-bold text-gray-900">Search players</h1>
        <p className="mt-2 text-gray-500">
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
        <h1 className="text-2xl font-bold text-gray-900">
          No players found for &lsquo;{query}&rsquo;
        </h1>
        <p className="mt-2 text-gray-500">Try a different spelling.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to homepage
        </Link>
      </div>
    );
  }

  /* ── Results ───────────────────────────────────────────── */
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Search results for &lsquo;{query}&rsquo;
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        {results.length} player{results.length !== 1 ? "s" : ""} found
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((player) => (
          <Link
            key={player.player_id}
            href={`/players/${player.player_id}`}
            className="group flex items-center gap-3 rounded-xl border border-gray-200 px-5 py-4 transition hover:border-blue-200 hover:shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {player.name.charAt(0)}
            </span>
            <div>
              <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">
                {player.name}
              </div>
              <div className="text-xs text-gray-400">
                {player.player_id}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
