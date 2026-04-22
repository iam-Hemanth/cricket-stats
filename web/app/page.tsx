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

async function getOnThisDay(): Promise<OnThisDayMatch | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/api/v1/on-this-day`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return (await res.json()) as OnThisDayMatch;
  } catch {
    return null;
  }
}

/* ── Page ────────────────────────────────────────────────── */
function OnThisDayCard({ match }: { match: OnThisDayMatch | null }) {
  if (!match) return null;

  return (
    <div className="glass-card card-hover mx-auto max-w-2xl rounded-2xl p-6">
      {/* Gradient left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b from-[--accent-green] via-[--accent-blue] to-[--accent-purple]" />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <h3 className="text-lg font-semibold text-[--text-primary]">
            On This Day
          </h3>
        </div>
        <span className="rounded-full bg-[--accent-green]/10 px-2.5 py-1 text-xs font-semibold text-[--accent-green]">
          {match.years_ago} {match.years_ago === 1 ? 'year' : 'years'} ago
        </span>
      </div>
      
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-[--text-primary]">
            {match.team1} vs {match.team2}
          </span>
          <span className="rounded-full border border-[--accent-green]/30 bg-[--accent-green]/5 px-2.5 py-0.5 text-xs font-medium text-[--accent-green]">
            {match.format}
          </span>
        </div>
        
        {match.winner && (
          <p className="text-sm text-[--text-secondary]">
            <span className="font-semibold gradient-text-green">{match.winner}</span> won
          </p>
        )}
        
        {match.venue && (
          <p className="flex items-center gap-1.5 text-xs text-[--text-muted]">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {match.venue}
          </p>
        )}
        
        <p className="text-xs text-[--text-muted]">
          {new Date(match.date).toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric' 
          })}
        </p>
      </div>
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
        <span
          className="text-xs font-semibold uppercase tracking-widest text-[--text-muted]"
        >
          Record Board
        </span>
      </div>

      <HomeHighlights highlights={highlights} />

      {/* On This Day Card */}
      {onThisDay && (
        <div className="mt-12">
          <OnThisDayCard match={onThisDay} />
        </div>
      )}
    </div>
  );
}
