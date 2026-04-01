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
    <div className="mx-auto max-w-2xl rounded-xl border border-[--text-muted]/20 bg-[--bg-card] p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[--text-primary]">
          On This Day in Cricket
        </h3>
        <span className="text-xs text-[--text-muted]">
          {match.years_ago} {match.years_ago === 1 ? 'year' : 'years'} ago
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-[--text-primary]">
            {match.team1} vs {match.team2}
          </span>
          <span className="rounded-full bg-[--accent-green]/10 px-2 py-1 text-xs font-medium text-[--accent-green]">
            {match.format}
          </span>
        </div>
        
        {match.winner && (
          <p className="text-sm text-[--text-secondary]">
            <span className="text-[--accent-green]">{match.winner}</span> won
          </p>
        )}
        
        {match.venue && (
          <p className="text-xs text-[--text-muted]">
            📍 {match.venue}
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
      <section className="stadium-bg flex flex-col items-center gap-6 pb-20 pt-24 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl" style={{ color: 'var(--text-primary)' }}>
          Every ball. Every match.
          <br />
          <span style={{ color: 'var(--accent-green)' }}>Every stat.</span>
        </h1>
        <p className="max-w-xl text-lg" style={{ color: 'var(--text-secondary)' }}>
          Ball-by-ball cricket statistics for{" "}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {displayCount}+
          </span>{" "}
          men&apos;s matches across all formats.
        </p>

        {/* Hero search */}
        <div className="mt-4 w-full max-w-xl">
          <HeroSearch />
        </div>
      </section>

      {/* ── Record Board Section Label ───────────────────── */}
      <div className="mb-6 text-center">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
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
