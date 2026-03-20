import Link from "next/link";
import HeroSearch from "@/components/HeroSearch";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── Featured matchup cards ──────────────────────────────── */
const FEATURED_MATCHUPS = [
  {
    batter: { id: "ba607b88", name: "Virat Kohli" },
    bowler: { id: "462411b3", name: "Jasprit Bumrah" },
    label: "The ultimate modern rivalry",
  },
  {
    batter: { id: "94ed3e4b", name: "Rohit Sharma" },
    bowler: { id: "5f547c8b", name: "Rashid Khan" },
    label: "Power vs mystery spin",
  },
  {
    batter: { id: "ba607b88", name: "Virat Kohli" },
    bowler: { id: "3fb19989", name: "Mitchell Starc" },
    label: "Pace & bounce from down under",
  },
];

/* ── Server-side data fetching ───────────────────────────── */
async function getMatchCount(): Promise<number> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.matches_in_db ?? 0;
  } catch {
    return 0;
  }
}

/* ── Page ────────────────────────────────────────────────── */
export default async function HomePage() {
  const matchCount = await getMatchCount();

  const stats = [
    { value: matchCount > 0 ? matchCount.toLocaleString() + "+" : "17,000+", label: "Matches" },
    { value: "9.6M+", label: "Deliveries" },
    { value: "10,900+", label: "Players" },
    { value: "2008–2025", label: "Years of data" },
  ];

  return (
    <div className="-mt-8">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-6 pb-16 pt-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Every ball. Every match.{" "}
          <span className="text-blue-600">Every stat.</span>
        </h1>
        <p className="max-w-lg text-lg text-gray-500">
          Ball-by-ball cricket statistics for{" "}
          {matchCount > 0
            ? `${matchCount.toLocaleString()}+`
            : "17,000+"}{" "}
          men&apos;s matches across all formats.
        </p>

        {/* Hero search */}
        <div className="mt-2 w-full max-w-xl">
          <HeroSearch />
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────── */}
      <section className="mx-auto grid max-w-3xl grid-cols-2 gap-4 border-y border-gray-100 py-8 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">
              {s.label}
            </div>
          </div>
        ))}
      </section>

      {/* ── Featured matchups ─────────────────────────────── */}
      <section className="py-16">
        <h2 className="mb-2 text-center text-2xl font-bold text-gray-900">
          Featured Matchups
        </h2>
        <p className="mb-10 text-center text-sm text-gray-400">
          Explore head-to-head records between top players
        </p>

        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURED_MATCHUPS.map((m) => (
            <Link
              key={`${m.batter.id}-${m.bowler.id}`}
              href={`/players/${m.batter.id}?bowler=${m.bowler.id}`}
              className="group rounded-xl border border-gray-200 p-6 transition hover:border-blue-200 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                {/* Batter */}
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {m.batter.name.charAt(0)}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {m.batter.name}
                  </div>
                  <div className="text-xs text-gray-400">Batter</div>
                </div>

                {/* VS */}
                <span className="text-xs font-bold uppercase text-gray-300">
                  vs
                </span>

                {/* Bowler */}
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                    {m.bowler.name.charAt(0)}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {m.bowler.name}
                  </div>
                  <div className="text-xs text-gray-400">Bowler</div>
                </div>
              </div>

              <p className="mb-4 text-center text-xs text-gray-400">
                {m.label}
              </p>

              <div className="text-center text-sm font-medium text-blue-600 group-hover:underline">
                View matchup →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
