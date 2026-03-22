"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HomepageHighlights } from "@/lib/api";

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

type OnFireTab = "ipl" | "big_leagues" | "international";
type RivalryTab = "ipl" | "international";

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

export default function HomeHighlights({ highlights }: Props) {
  const statCards = highlights.stat_cards ?? [];
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
  const [activeOnFireTab, setActiveOnFireTab] = useState<OnFireTab>(
    onFireIplBatting.length > 0
      ? "ipl"
      : onFireBigLeaguesBatting.length > 0
        ? "big_leagues"
        : "international"
  );
  const [activeRivalryTab, setActiveRivalryTab] = useState<RivalryTab>("ipl");

  useEffect(() => {
    if (mobileCards.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % mobileCards.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [mobileCards.length]);

  useEffect(() => {
    if (activeIndex >= mobileCards.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, mobileCards.length]);

  useEffect(() => {
    if (onFireIplBatting.length > 0) {
      setActiveOnFireTab("ipl");
      return;
    }
    if (onFireBigLeaguesBatting.length > 0) {
      setActiveOnFireTab("big_leagues");
      return;
    }
    setActiveOnFireTab("international");
  }, [
    onFireIplBatting.length,
    onFireBigLeaguesBatting.length,
    onFireInternationalBatting.length,
  ]);

  const activeOnFireBatting =
    activeOnFireTab === "ipl"
      ? onFireIplBatting
      : activeOnFireTab === "big_leagues"
        ? onFireBigLeaguesBatting
        : onFireInternationalBatting;

  const activeOnFireBowling =
    activeOnFireTab === "ipl"
      ? onFireIplBowling
      : activeOnFireTab === "big_leagues"
        ? onFireBigLeaguesBowling
        : onFireInternationalBowling;

  const battingEmptyMessage =
    activeOnFireTab === "ipl"
      ? "IPL season starts late March - check back soon"
      : activeOnFireTab === "big_leagues"
        ? "No big league matches in last 90 days"
        : "No recent international T20 matches";

  const activeRivalry =
    activeRivalryTab === "ipl" ? rivalryIpl : rivalryInternational;

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
    <section className="mx-auto mb-8 w-full max-w-6xl px-4 sm:px-0">
      {mobileCards.length > 0 ? (
        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Record board</h2>
            <div className="hidden text-xs text-gray-500 md:block">Auto-rotates on mobile</div>
          </div>

          <div className="md:hidden">
            <div className="overflow-hidden rounded-2xl">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {mobileCards.map((card) => {
                  const href =
                    card.player_id
                      ? `/players/${card.player_id}`
                      : card.stat_id === "highest_total"
                        ? "/teams"
                        : "#";

                  return (
                    <Link
                      key={card.stat_id}
                      href={href}
                      className="min-w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                    >
                      <div className="text-4xl font-black tracking-tight text-gray-900">{card.value}</div>
                      <div className="mt-2 text-sm font-semibold text-gray-700">{card.label}</div>
                      <div className="mt-1 text-sm text-gray-500">{card.player_name}</div>
                      <span className="mt-4 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {card.format_label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden grid-cols-4 gap-4 md:grid">
            {mobileCards.map((card) => {
              const href =
                card.player_id
                  ? `/players/${card.player_id}`
                  : card.stat_id === "highest_total"
                    ? "/teams"
                    : "#";

              return (
                <Link
                  key={card.stat_id}
                  href={href}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="text-3xl font-black tracking-tight text-gray-900">{card.value}</div>
                  <div className="mt-2 text-sm font-semibold text-gray-700">{card.label}</div>
                  <div className="mt-1 text-sm text-gray-500">{card.player_name}</div>
                  <span className="mt-4 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {card.format_label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-12">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">On fire right now 🔥</h2>
        <p className="mt-1 text-sm text-gray-500">Top performers in the last 90 days</p>

        <div className="mt-4 inline-flex rounded-lg border border-orange-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveOnFireTab("ipl")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              activeOnFireTab === "ipl"
                ? "bg-orange-100 text-orange-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            IPL
          </button>
          <button
            type="button"
            onClick={() => setActiveOnFireTab("big_leagues")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              activeOnFireTab === "big_leagues"
                ? "bg-orange-100 text-orange-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Big Leagues
          </button>
          <button
            type="button"
            onClick={() => setActiveOnFireTab("international")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              activeOnFireTab === "international"
                ? "bg-orange-100 text-orange-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            International
          </button>
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Batters</h3>
          {activeOnFireBatting.length > 0 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {activeOnFireBatting.map((player) => {
                const average =
                  player.dismissals > 0
                    ? (player.recent_runs / player.dismissals).toFixed(1)
                    : null;

                return (
                  <Link
                    key={`${player.player_id}-${activeOnFireTab}-bat`}
                    href={`/players/${player.player_id}`}
                    className="min-w-[240px] rounded-xl border border-orange-200 bg-orange-50 p-4"
                  >
                    <div className="text-base font-semibold text-gray-900">{player.player_name}</div>
                    {activeOnFireTab === "big_leagues" && player.competition ? (
                      <div className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-orange-800">
                        {competitionShortName(player.competition)}
                      </div>
                    ) : null}
                    <div className="mt-2 text-sm text-gray-700">
                      {player.recent_runs} runs
                      {average ? ` · avg ${average}` : ""} · SR {formatStrikeRate(player.recent_sr)}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/70 px-4 py-5 text-sm text-gray-600">
              {battingEmptyMessage}
            </div>
          )}

          {activeOnFireBowling.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Bowlers</h3>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {activeOnFireBowling.map((bowler) => (
                  <Link
                    key={`${bowler.player_id}-${activeOnFireTab}-bowl`}
                    href={`/players/${bowler.player_id}`}
                    className="min-w-[240px] rounded-xl border border-sky-200 bg-sky-50 p-4"
                  >
                    <div className="text-base font-semibold text-gray-900">{bowler.player_name}</div>
                    {activeOnFireTab === "big_leagues" && bowler.competition ? (
                      <div className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sky-800">
                        {competitionShortName(bowler.competition)}
                      </div>
                    ) : null}
                    <div className="mt-2 text-sm text-gray-700">
                      {bowler.wickets} wkts · econ {formatEconomy(bowler.recent_economy)} · {bowler.recent_matches} matches
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Rivalry of the day</h2>
        <p className="mt-1 text-sm text-gray-600">Changes daily</p>

        <div className="mt-4 inline-flex rounded-lg border border-blue-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveRivalryTab("ipl")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              activeRivalryTab === "ipl"
                ? "bg-blue-100 text-blue-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            IPL
          </button>
          <button
            type="button"
            onClick={() => setActiveRivalryTab("international")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              activeRivalryTab === "international"
                ? "bg-blue-100 text-blue-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            International
          </button>
        </div>

        {activeRivalry ? (
          <>
            <div className="mt-4 text-lg font-semibold text-gray-900">
              {activeRivalry.batter_name} vs {activeRivalry.bowler_name}
            </div>
            <div className="mt-2 text-sm text-gray-700">
              {activeRivalry.total_balls} balls · {activeRivalry.total_runs} runs · {activeRivalry.total_dismissals} dismissals · SR{" "}
              {formatStrikeRate(activeRivalry.strike_rate)}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/players/${activeRivalry.batter_id}?bowler=${activeRivalry.bowler_id}`}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                View full matchup →
              </Link>
              <Link
                href={`/players/${activeRivalry.batter_id}`}
                className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                View {activeRivalry.batter_name}&apos;s profile →
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-blue-300 bg-white/80 px-4 py-5 text-sm text-gray-600">
            No rivalry available right now
          </div>
        )}
      </div>
    </section>
  );
}
