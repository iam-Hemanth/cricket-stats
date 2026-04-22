"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HomepageHighlights } from "@/lib/api";
import StatCard from "@/components/ui/StatCard";
import TabGroup from "@/components/ui/TabGroup";
import Avatar from "@/components/ui/Avatar";

type Props = {
  highlights: HomepageHighlights;
};

function formatStrikeRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(1);
}

function formatEconomy(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

type OnFireTab = "IPL" | "Big Leagues" | "International";
type RivalryTab = "IPL" | "International";

function competitionShortName(name: string | null | undefined): string | null {
  if (!name) return null;

  const map: Record<string, string> = {
    "Indian Premier League": "IPL",
    "Big Bash League": "BBL",
    "Pakistan Super League": "PSL",
    "Caribbean Premier League": "CPL",
    SA20: "SA20",
    "International League T20": "ILT20",
    "Major League Cricket": "MLC",
    "The Hundred Men's Competition": "The Hundred",
  };

  return map[name] ?? name;
}

// Featured matchups data — real Cricsheet player IDs
const featuredMatchups = [
  {
    id: "kohli-bumrah",
    batter: { id: "ba607b88", name: "Virat Kohli" },
    bowler: { id: "244048f6", name: "Jasprit Bumrah" },
    tagline: "India's batting maestro vs pace spearhead",
  },
  {
    id: "rohit-rashid",
    batter: { id: "740742ef", name: "Rohit Sharma" },
    bowler: { id: "5f547c8b", name: "Rashid Khan" },
    tagline: "Power hitter vs crafty leg-spinner",
  },
  {
    id: "rohit-bumrah",
    batter: { id: "740742ef", name: "Rohit Sharma" },
    bowler: { id: "244048f6", name: "Jasprit Bumrah" },
    tagline: "India's captain vs pace spearhead",
  },
];

export default function HomeHighlights({ highlights }: Props) {
  const statCards = useMemo(() => highlights.stat_cards ?? [], [highlights.stat_cards]);
  const onFireIplBatting = highlights.on_fire_ipl_batting ?? [];
  const onFireIplBowling = highlights.on_fire_ipl_bowling ?? [];
  const onFireBigLeaguesBatting = highlights.on_fire_big_leagues_batting ?? [];
  const onFireBigLeaguesBowling = highlights.on_fire_big_leagues_bowling ?? [];
  const onFireInternationalBatting =
    highlights.on_fire_international_batting ?? [];
  const onFireInternationalBowling =
    highlights.on_fire_international_bowling ?? [];
  const rivalryIpl = highlights.rivalry_ipl;
  const rivalryInternational = highlights.rivalry_international;

  const mobileCards = useMemo(() => statCards.slice(0, 4), [statCards]);
  const [activeIndex, setActiveIndex] = useState(0);
  const initialOnFireTab: OnFireTab =
    onFireIplBatting.length > 0
      ? "IPL"
      : onFireBigLeaguesBatting.length > 0
        ? "Big Leagues"
        : "International";
  const [activeOnFireTab, setActiveOnFireTab] = useState<OnFireTab>(initialOnFireTab);
  const [activeRivalryTab, setActiveRivalryTab] = useState<RivalryTab>("IPL");

  useEffect(() => {
    if (mobileCards.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % mobileCards.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [mobileCards.length]);

  const safeActiveIndex = mobileCards.length > 0 ? activeIndex % mobileCards.length : 0;

  const hasActiveTabData =
    (activeOnFireTab === "IPL" && (onFireIplBatting.length > 0 || onFireIplBowling.length > 0)) ||
    (activeOnFireTab === "Big Leagues" &&
      (onFireBigLeaguesBatting.length > 0 || onFireBigLeaguesBowling.length > 0)) ||
    (activeOnFireTab === "International" &&
      (onFireInternationalBatting.length > 0 || onFireInternationalBowling.length > 0));

  const effectiveOnFireTab: OnFireTab = hasActiveTabData ? activeOnFireTab : initialOnFireTab;

  const activeOnFireBatting =
    effectiveOnFireTab === "IPL"
      ? onFireIplBatting
      : effectiveOnFireTab === "Big Leagues"
        ? onFireBigLeaguesBatting
        : onFireInternationalBatting;

  const activeOnFireBowling =
    effectiveOnFireTab === "IPL"
      ? onFireIplBowling
      : effectiveOnFireTab === "Big Leagues"
        ? onFireBigLeaguesBowling
        : onFireInternationalBowling;

  const battingEmptyMessage =
    effectiveOnFireTab === "IPL"
      ? "IPL season starts late March - check back soon"
      : effectiveOnFireTab === "Big Leagues"
        ? "No big league matches in last 90 days"
        : "No recent international T20 matches";

  const activeRivalry =
    activeRivalryTab === "IPL" ? rivalryIpl : rivalryInternational;

  const showHighlights =
    mobileCards.length > 0 ||
    onFireIplBatting.length > 0 ||
    onFireIplBowling.length > 0 ||
    onFireBigLeaguesBatting.length > 0 ||
    onFireBigLeaguesBowling.length > 0 ||
    onFireInternationalBatting.length > 0 ||
    onFireInternationalBowling.length > 0 ||
    Boolean(rivalryIpl) ||
    Boolean(rivalryInternational);
  if (!showHighlights) return null;

  return (
    <section className="mx-auto mb-8 w-full max-w-6xl space-y-14 px-4 sm:px-0">
      {/* ── Record Board ─────────────────────────────────── */}
      {mobileCards.length > 0 && (
        <div>
          <SectionHeader
            title="Record Board"
            icon={
              <svg className="h-5 w-5 text-[--accent-gold]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            }
          />

          {/* Mobile carousel */}
          <div className="md:hidden">
            <div className="overflow-hidden rounded-2xl">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${safeActiveIndex * 100}%)` }}
              >
                {mobileCards.map((card) => (
                  <div key={card.stat_id} className="min-w-full">
                    <Link
                      href={
                        card.player_id
                          ? `/players/${card.player_id}`
                          : card.stat_id === "highest_total"
                            ? "/teams"
                            : "#"
                      }
                      className="block"
                    >
                      <StatCard
                        value={card.value}
                        label={card.label}
                        playerName={card.player_name}
                        badge={card.format_label}
                      />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
            {/* Carousel indicators */}
            <div className="mt-3 flex justify-center gap-1.5">
              {mobileCards.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === safeActiveIndex
                      ? "w-6 bg-[--accent-green]"
                      : "w-1.5 bg-[--text-muted]/40 hover:bg-[--text-muted]"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4 stagger-children">
            {mobileCards.map((card) => (
              <Link
                key={card.stat_id}
                href={
                  card.player_id
                    ? `/players/${card.player_id}`
                    : card.stat_id === "highest_total"
                      ? "/teams"
                      : "#"
                }
                className="block"
              >
                <StatCard
                  value={card.value}
                  label={card.label}
                  playerName={card.player_name}
                  badge={card.format_label}
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── On Fire Right Now 🔥 ─────────────────────────── */}
      <div>
        <SectionHeader
          title="On Fire Right Now"
          subtitle="Top performers in the last 90 days"
          icon={<span className="text-lg">🔥</span>}
        />

        <div className="mt-4">
          <TabGroup
            tabs={["IPL", "Big Leagues", "International"]}
            activeTab={effectiveOnFireTab}
            onChange={(tab) => setActiveOnFireTab(tab as OnFireTab)}
          />
        </div>

        {/* Batters Section */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[--text-muted]">
            BATTERS
          </h3>
          {activeOnFireBatting.length > 0 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2 stagger-children">
              {activeOnFireBatting.map((player) => {
                const average =
                  player.dismissals > 0
                    ? (player.recent_runs / player.dismissals).toFixed(1)
                    : null;
                const leagueName =
                  effectiveOnFireTab === "Big Leagues" && player.competition
                    ? competitionShortName(player.competition)
                    : effectiveOnFireTab;

                return (
                  <Link
                    key={`${player.player_id}-${effectiveOnFireTab}-bat`}
                    href={`/players/${player.player_id}`}
                    className="group glass-card card-hover min-w-[220px] rounded-xl p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={player.player_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[--text-primary]">
                          {player.player_name}
                        </div>
                        <div className="text-xs font-medium text-[--accent-green]">
                          {leagueName}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[--text-secondary]">
                      <span className="font-semibold text-[--text-primary]">{player.recent_runs}</span> runs
                      {average ? ` · avg ${average}` : ""} · SR{" "}
                      {formatStrikeRate(player.recent_sr)}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[--text-muted]/20 bg-[--bg-card]/50 px-4 py-5 text-sm text-[--text-secondary]">
              {battingEmptyMessage}
            </div>
          )}
        </div>

        {/* Bowlers Section */}
        {activeOnFireBowling.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[--text-muted]">
              BOWLERS
            </h3>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2 stagger-children">
              {activeOnFireBowling.map((bowler) => {
                const leagueName =
                  effectiveOnFireTab === "Big Leagues" && bowler.competition
                    ? competitionShortName(bowler.competition)
                    : effectiveOnFireTab;

                return (
                  <Link
                    key={`${bowler.player_id}-${effectiveOnFireTab}-bowl`}
                    href={`/players/${bowler.player_id}`}
                    className="group glass-card card-hover min-w-[220px] rounded-xl p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={bowler.player_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[--text-primary]">
                          {bowler.player_name}
                        </div>
                        <div className="text-xs font-medium text-[--accent-green]">
                          {leagueName}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[--text-secondary]">
                      <span className="font-semibold text-[--text-primary]">{bowler.wickets}</span> wkts · econ{" "}
                      {formatEconomy(bowler.recent_economy)} ·{" "}
                      {bowler.recent_matches} matches
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Rivalry of the Day ───────────────────────────── */}
      <div className="glass-card overflow-hidden rounded-2xl p-6">
        <SectionHeader
          title="Rivalry of the Day"
          subtitle="Changes daily"
          icon={<span className="text-lg">⚔️</span>}
        />

        <div className="mt-4">
          <TabGroup
            tabs={["IPL", "International"]}
            activeTab={activeRivalryTab}
            onChange={(tab) => setActiveRivalryTab(tab as RivalryTab)}
          />
        </div>

        {activeRivalry ? (
          <div className="mt-6">
            {/* Avatar row with vs badge */}
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center">
                <Avatar name={activeRivalry.batter_name} size="lg" />
                <div className="mt-2 text-center">
                  <div className="text-sm font-semibold text-[--text-primary]">
                    {activeRivalry.batter_name}
                  </div>
                  <div className="text-xs text-[--text-muted]">Batter</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[--glass-border] bg-[--bg-surface] text-sm font-bold text-[--accent-green]">
                  vs
                </div>
              </div>

              <div className="flex flex-col items-center">
                <Avatar name={activeRivalry.bowler_name} size="lg" />
                <div className="mt-2 text-center">
                  <div className="text-sm font-semibold text-[--text-primary]">
                    {activeRivalry.bowler_name}
                  </div>
                  <div className="text-xs text-[--text-muted]">Bowler</div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm">
              <RivalryStat label="balls" value={String(activeRivalry.total_balls)} />
              <RivalryStat label="runs" value={String(activeRivalry.total_runs)} />
              <RivalryStat label="dismissals" value={String(activeRivalry.total_dismissals)} />
              <RivalryStat
                label="SR"
                value={formatStrikeRate(activeRivalry.strike_rate)}
                highlight
              />
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href={`/players/${activeRivalry.batter_id}?bowler=${activeRivalry.bowler_id}`}
                className="inline-flex items-center justify-center rounded-xl bg-[--accent-green] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[--accent-green-glow] transition-all hover:shadow-xl hover:shadow-[--accent-green-glow] hover:brightness-110"
              >
                View full matchup →
              </Link>
              <Link
                href={`/players/${activeRivalry.batter_id}`}
                className="inline-flex items-center justify-center rounded-xl border border-[--glass-border] px-5 py-2.5 text-sm font-semibold text-[--text-secondary] transition-all hover:border-[--accent-green]/30 hover:text-[--accent-green]"
              >
                View profile →
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[--text-muted]/20 px-4 py-8 text-center text-sm text-[--text-secondary]">
            No rivalry available right now
          </div>
        )}
      </div>

      {/* ── Stats Bar ────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <CounterStat value="5,164+" label="MATCHES" />
          <CounterStat value="9.6M+" label="DELIVERIES" />
          <CounterStat value="10,900+" label="PLAYERS" />
          <CounterStat value="2008-2025" label="YEARS OF DATA" />
        </div>
      </div>

      {/* ── Featured Matchups ────────────────────────────── */}
      <div>
        <SectionHeader
          title="Featured Matchups"
          subtitle="Classic rivalries worth exploring"
          icon={
            <svg className="h-5 w-5 text-[--accent-purple]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {featuredMatchups.map((matchup) => (
            <div
              key={matchup.id}
              className="group glass-card gradient-border-top card-hover rounded-xl p-5"
            >
              <div className="flex items-center justify-center gap-3">
                <Avatar name={matchup.batter.name} size="md" />
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[--glass-border] bg-[--bg-surface] text-xs font-bold text-[--text-muted]">
                  vs
                </div>
                <Avatar name={matchup.bowler.name} size="md" />
              </div>

              <div className="mt-3 text-center">
                <div className="text-sm font-semibold text-[--text-primary]">
                  {matchup.batter.name} vs {matchup.bowler.name}
                </div>
                <div className="mt-1 text-xs text-[--text-muted]">
                  {matchup.tagline}
                </div>
              </div>

              <Link
                href={`/players/${matchup.batter.id}?bowler=${matchup.bowler.id}`}
                className="mt-4 block text-center text-sm font-medium text-[--accent-green] transition-all hover:underline group-hover:text-[--accent-green]"
              >
                View matchup →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Helper Components ────────────────────────────────── */

function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-[--text-primary] sm:text-2xl">
        {icon}
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm text-[--text-secondary]">{subtitle}</p>
      )}
    </div>
  );
}

function RivalryStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={`text-lg font-bold ${
          highlight ? "gradient-text-green" : "text-[--text-primary]"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-[--text-muted]">{label}</div>
    </div>
  );
}

function CounterStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl animate-scale-in">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[--text-muted]">
        {label}
      </div>
    </div>
  );
}
