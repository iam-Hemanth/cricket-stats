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
    <section className="mx-auto mb-8 w-full max-w-6xl space-y-12 px-4 sm:px-0">
      {/* Record Board */}
      {mobileCards.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-bold text-[--text-primary] sm:text-2xl">
            Record Board
          </h2>

          {/* Mobile carousel */}
          <div className="md:hidden">
            <div className="overflow-hidden rounded-xl">
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
                  className={`h-1.5 rounded-full transition-all ${
                    idx === safeActiveIndex
                      ? "w-4 bg-[--accent-green]"
                      : "w-1.5 bg-[--text-muted]"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
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
                className="block transition-transform hover:-translate-y-1"
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

      {/* On Fire Right Now 🔥 */}
      <div>
        <h2 className="text-xl font-bold text-[--text-primary] sm:text-2xl">
          On Fire Right Now 🔥
        </h2>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Top performers in the last 90 days
        </p>

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
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
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
                    className="group min-w-[220px] rounded-xl bg-[--bg-card] p-4 transition-all hover:ring-1 hover:ring-[--accent-green]/30"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={player.player_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[--text-primary]">
                          {player.player_name}
                        </div>
                        <div className="text-xs text-[--accent-green]">
                          {leagueName}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[--text-secondary]">
                      {player.recent_runs} runs
                      {average ? ` · avg ${average}` : ""} · SR{" "}
                      {formatStrikeRate(player.recent_sr)}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[--text-muted]/30 bg-[--bg-card] px-4 py-5 text-sm text-[--text-secondary]">
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
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {activeOnFireBowling.map((bowler) => {
                const leagueName =
                  effectiveOnFireTab === "Big Leagues" && bowler.competition
                    ? competitionShortName(bowler.competition)
                    : effectiveOnFireTab;

                return (
                  <Link
                    key={`${bowler.player_id}-${effectiveOnFireTab}-bowl`}
                    href={`/players/${bowler.player_id}`}
                    className="group min-w-[220px] rounded-xl bg-[--bg-card] p-4 transition-all hover:ring-1 hover:ring-[--accent-green]/30"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={bowler.player_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[--text-primary]">
                          {bowler.player_name}
                        </div>
                        <div className="text-xs text-[--accent-green]">
                          {leagueName}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[--text-secondary]">
                      {bowler.wickets} wkts · econ{" "}
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

      {/* Rivalry of the Day */}
      <div className="rounded-xl bg-[--bg-card] p-6">
        <h2 className="text-xl font-bold text-[--text-primary] sm:text-2xl">
          Rivalry of the Day
        </h2>
        <p className="mt-1 text-sm text-[--text-secondary]">Changes daily</p>

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
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center">
                <Avatar name={activeRivalry.batter_name} size="lg" />
                <div className="mt-2 text-center">
                  <div className="text-sm font-semibold text-[--text-primary]">
                    {activeRivalry.batter_name}
                  </div>
                  <div className="text-xs text-[--text-muted]">Batter</div>
                </div>
              </div>

              <div className="rounded-full bg-[--bg-surface] px-3 py-1 text-xs font-bold text-[--text-secondary]">
                vs
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
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm sm:gap-6">
              <div className="text-center">
                <div className="font-semibold text-[--text-primary]">
                  {activeRivalry.total_balls}
                </div>
                <div className="text-xs text-[--text-muted]">balls</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[--text-primary]">
                  {activeRivalry.total_runs}
                </div>
                <div className="text-xs text-[--text-muted]">runs</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[--text-primary]">
                  {activeRivalry.total_dismissals}
                </div>
                <div className="text-xs text-[--text-muted]">dismissals</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[--accent-green]">
                  {formatStrikeRate(activeRivalry.strike_rate)}
                </div>
                <div className="text-xs text-[--text-muted]">SR</div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href={`/players/${activeRivalry.batter_id}?bowler=${activeRivalry.bowler_id}`}
                className="inline-flex items-center justify-center rounded-lg bg-[--accent-green] px-5 py-2.5 text-sm font-semibold text-[--bg-base] transition hover:bg-[--accent-green-hover]"
              >
                View full matchup →
              </Link>
              <Link
                href={`/players/${activeRivalry.batter_id}`}
                className="inline-flex items-center justify-center rounded-lg border border-[--accent-green] px-5 py-2.5 text-sm font-semibold text-[--accent-green] transition hover:bg-[--accent-green]/10"
              >
                View profile →
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[--text-muted]/30 px-4 py-8 text-center text-sm text-[--text-secondary]">
            No rivalry available right now
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="rounded-xl bg-[--bg-card] p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="text-center">
            <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl">
              5,164+
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              MATCHES
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl">
              9.6M+
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              DELIVERIES
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl">
              10,900+
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              PLAYERS
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold text-[--text-primary] sm:text-3xl">
              2008-2025
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[--text-muted]">
              YEARS OF DATA
            </div>
          </div>
        </div>
      </div>

      {/* Featured Matchups */}
      <div>
        <h2 className="text-xl font-bold text-[--text-primary] sm:text-2xl">
          Featured Matchups
        </h2>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Classic rivalries worth exploring
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredMatchups.map((matchup) => (
            <div
              key={matchup.id}
              className="group rounded-xl bg-[--bg-card] p-4 transition-all hover:ring-1 hover:ring-[--accent-green]/30"
            >
              <div className="flex items-center justify-center gap-3">
                <Avatar name={matchup.batter.name} size="md" />
                <div className="rounded-full bg-[--bg-surface] px-2 py-0.5 text-xs font-bold text-[--text-secondary]">
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
                className="mt-3 block text-center text-sm font-medium text-[--accent-green] transition hover:underline"
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
