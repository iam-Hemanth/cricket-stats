export const dynamic = 'force-dynamic';

import HeroSearch from "@/components/HeroSearch";
import HomeHighlights from "@/components/HomeHighlights";
import type { HomepageHighlights, OnThisDayMatch } from "@/lib/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

async function getHighlights(): Promise<HomepageHighlights> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_URL}/api/v1/highlights`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return {
        stat_cards: [],
        on_fire_ipl_batting: [],
        on_fire_ipl_bowling: [],
        on_fire_big_leagues_batting: [],
        on_fire_big_leagues_bowling: [],
        on_fire_international_batting: [],
        on_fire_international_bowling: [],
        rivalry_ipl: null,
        rivalry_international: null,
        cached_at: "",
      };
    }
    return (await res.json()) as HomepageHighlights;
  } catch {
    return {
      stat_cards: [],
      on_fire_ipl_batting: [],
      on_fire_ipl_bowling: [],
      on_fire_big_leagues_batting: [],
      on_fire_big_leagues_bowling: [],
      on_fire_international_batting: [],
      on_fire_international_bowling: [],
      rivalry_ipl: null,
      rivalry_international: null,
      cached_at: "",
    };
  }
}

async function getOnThisDay(): Promise<OnThisDayMatch[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/api/v1/on-this-day`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    return (await res.json()) as OnThisDayMatch[];
  } catch {
    return [];
  }
}

/* ── On This Day card ────────────────────────────────────── */
function OnThisDayCard({ matches }: { matches: OnThisDayMatch[] }) {
  if (!matches.length) return null;

  const today = new Date();
  const dayLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const formatColor: Record<string, string> = {
    IPL:  "bg-[--accent-gold]/10 text-[--accent-gold] border-[--accent-gold]/20",
    T20:  "bg-[--accent-blue]/10 text-[--accent-blue] border-[--accent-blue]/20",
    IT20: "bg-[--accent-blue]/10 text-[--accent-blue] border-[--accent-blue]/20",
    ODI:  "bg-[--accent-green]/10 text-[--accent-green] border-[--accent-green]/20",
    ODM:  "bg-[--accent-green]/10 text-[--accent-green] border-[--accent-green]/20",
    Test: "bg-[--accent-purple]/10 text-[--accent-purple] border-[--accent-purple]/20",
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[--text-primary]">
          <span className="text-lg">📅</span>
          On This Day
        </h2>
        <span className="text-sm font-medium text-[--text-muted]">{dayLabel}</span>
      </div>

      {/* Match list */}
      <div className="glass-card overflow-hidden rounded-2xl">
        {matches.map((match, idx) => {
          const colorClass =
            formatColor[match.format] ??
            "bg-[--text-muted]/10 text-[--text-muted] border-[--text-muted]/20";

          return (
            <div
              key={match.match_id}
              className={`relative flex flex-col gap-1.5 px-5 py-4 transition-colors hover:bg-[--bg-card-hover] ${
                idx !== 0 ? "border-t border-[--glass-border]" : ""
              }`}
            >
              {/* Top row: teams + format badge */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[--text-primary]">
                  {match.team1} vs {match.team2}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
                >
                  {match.format}
                </span>
              </div>

              {/* Winner */}
              {match.winner ? (
                <p className="text-sm text-[--text-secondary]">
                  <span className="font-semibold gradient-text-green">{match.winner}</span> won
                </p>
              ) : (
                <p className="text-sm text-[--text-muted]">No result / abandoned</p>
              )}

              {/* Bottom row: venue + years ago */}
              <div className="flex items-center justify-between gap-2">
                {match.venue ? (
                  <p className="flex items-center gap-1 text-xs text-[--text-muted] truncate">
                    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{match.venue}</span>
                  </p>
                ) : (
                  <span />
                )}
                <span className="shrink-0 rounded-full bg-[--bg-surface] px-2 py-0.5 text-xs text-[--text-muted]">
                  {match.years_ago}y ago
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {matches.length > 1 && (
        <p className="mt-2 text-center text-xs text-[--text-muted]">
          {matches.length} matches played on this day in history
        </p>
      )}
    </div>
  );
}

export default async function HomePage() {
  const [matchCount, highlights, onThisDay] = await Promise.all([
    getMatchCount(),
    getHighlights(),
    getOnThisDay(),
  ]);

  const displayCount = matchCount > 0 ? matchCount.toLocaleString() : "5,164";

  return (
    <div className="-mt-8">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center gap-6 pb-20 pt-28 text-center">
        {/* Floating particles */}
        <div className="hero-particles" />

        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[--accent-green]/5 blur-[100px]" />
          <div className="absolute right-1/4 top-1/2 h-48 w-48 rounded-full bg-[--accent-blue]/5 blur-[80px]" />
        </div>

        <h1 className="relative text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-[--text-primary]">
          Every ball. Every match.
          <br />
          <span className="text-shimmer">Every stat.</span>
        </h1>
        <p className="relative max-w-xl text-lg text-[--text-secondary]">
          Ball-by-ball cricket statistics for{" "}
          <span className="font-semibold text-[--text-primary]">
            {displayCount}+
          </span>{" "}
          men&apos;s matches across all formats.
        </p>

        {/* Hero search */}
        <div className="relative mt-4 w-full max-w-xl">
          <HeroSearch />
        </div>

        {/* Quick links */}
        <div className="relative mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-[--text-muted]">
          <span>Try:</span>
          {["Kohli", "Bumrah", "Rohit Sharma"].map((name) => (
            <a
              key={name}
              href={`/players/search?q=${encodeURIComponent(name)}`}
              className="rounded-full border border-[--glass-border] bg-[--bg-card]/50 px-3 py-1 transition-all hover:border-[--accent-green]/30 hover:text-[--accent-green]"
            >
              {name}
            </a>
          ))}
        </div>
      </section>

      {/* ── Record Board Section Label ───────────────────── */}
      <div className="mb-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-[--text-muted]">
          Record Board
        </span>
      </div>

      <HomeHighlights highlights={highlights} />

      {/* On This Day */}
      {onThisDay.length > 0 && (
        <div className="mx-auto mt-14 max-w-6xl px-4 sm:px-0">
          <OnThisDayCard matches={onThisDay} />
        </div>
      )}
    </div>
  );
}
