"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import api, { type MatchListItem } from "@/lib/api";
import { TeamLogo } from "@/components/TeamLogo";
import "./matches.css";

// ── Types ─────────────────────────────────────────────────
interface SeriesGroup {
  competition: string | null;
  type: "intl" | "ipl" | "franchise" | "wc" | "other";
  format: string;
  matches: MatchListItem[];
  dateRange: string;
  host?: string;
}

interface HistoricMoment {
  year: number;
  tournament: string;
  winner: string;
  result: string;
  icon: string;
}

// ── Helpers ───────────────────────────────────────────────
function classifyType(competition: string | null, format: string): SeriesGroup["type"] {
  const c = (competition ?? "").toLowerCase();
  if (c.includes("world cup") || c.includes("champions trophy") || c.includes("world twenty20")) return "wc";
  if (c.includes("ipl") || c.includes("indian premier league")) return "ipl";
  if (
    c.includes("psl") || c.includes("big bash") || c.includes("cpl") || 
    c.includes("sa20") || c.includes("hundred") || c.includes("bbl") || 
    c.includes("ilt20") || c.includes("international league t20") || 
    c.includes("mlc") || c.includes("major league cricket")
  ) {
    return "franchise";
  }
  if (c.includes("tour") || c.includes("series") || c.includes("international") || format === "Test" || format === "ODI" || format === "IT20") return "intl";
  return "other";
}

const FORMAT_DISPLAY: Record<string, string> = {
  IT20: "T20I",
  ODM:  "List A",
  MDM:  "First-class",
};

function fmtLabel(f: string) { return FORMAT_DISPLAY[f] ?? f; }

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getDateRange(matches: MatchListItem[]): string {
  if (!matches.length) return "";
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const first = fmtDate(sorted[0].date);
  const last  = fmtDate(sorted[sorted.length - 1].date);
  return first === last ? first : `${first} – ${last}`;
}

// Abbreviation dictionary mapping team abbreviations to database canonical names
const ABBR_TO_TEAM: Record<string, string> = {
  rcb: "Royal Challengers Bengaluru",
  csk: "Chennai Super Kings",
  mi: "Mumbai Indians",
  kkr: "Kolkata Knight Riders",
  srh: "Sunrisers Hyderabad",
  pbks: "Punjab Kings",
  kxip: "Punjab Kings",
  dc: "Delhi Capitals",
  rr: "Rajasthan Royals",
  gt: "Gujarat Titans",
  lsg: "Lucknow Super Giants",
  ind: "India",
  aus: "Australia",
  eng: "England",
  nz: "New Zealand",
  sa: "South Africa",
  pak: "Pakistan",
  sl: "Sri Lanka",
  ban: "Bangladesh",
  afg: "Afghanistan",
  wi: "West Indies",
  ire: "Ireland",
  zim: "Zimbabwe",
  usa: "United States of America",
  ned: "Netherlands",
  sco: "Scotland",
  nep: "Nepal",
  nam: "Namibia",
  uae: "United Arab Emirates",
  om: "Oman",
  oman: "Oman",
  png: "Papua New Guinea",
  hkg: "Hong Kong",
};

function findTeamByName(namePart: string): string | undefined {
  const teams = [
    "India", "Australia", "England", "New Zealand", "South Africa", "Pakistan", "Sri Lanka", 
    "West Indies", "Bangladesh", "Afghanistan", "Ireland", "Scotland", "Netherlands", "Zimbabwe", 
    "Nepal", "Namibia", "United States of America", "Canada", "Oman", "Papua New Guinea", 
    "United Arab Emirates", "Hong Kong", "Royal Challengers Bengaluru", "Mumbai Indians", 
    "Chennai Super Kings", "Kolkata Knight Riders", "Sunrisers Hyderabad", "Punjab Kings", 
    "Delhi Capitals", "Rajasthan Royals", "Gujarat Titans", "Lucknow Super Giants",
    "Deccan Chargers", "Gujarat Lions", "Rising Pune Supergiant"
  ];
  return teams.find(t => t.toLowerCase().includes(namePart));
}

function parseSearchQuery(query: string): {
  team1?: string;
  team2?: string;
  team?: string;
  generalQuery: string;
} {
  const trimmed = query.trim();
  if (!trimmed) return { generalQuery: "" };

  // Match patterns like "team1 vs team2", "team1 v team2", "team1 - team2"
  const h2hRegex = /^(.*?)\s+(?:vs|v|-|against)\s+(.*)$/i;
  const match = trimmed.match(h2hRegex);
  if (match) {
    const t1Token = match[1].trim().toLowerCase();
    const t2Token = match[2].trim().toLowerCase();
    const team1 = ABBR_TO_TEAM[t1Token] || findTeamByName(t1Token);
    const team2 = ABBR_TO_TEAM[t2Token] || findTeamByName(t2Token);
    if (team1 && team2) {
      return { team1, team2, generalQuery: "" };
    }
  }

  const token = trimmed.toLowerCase();
  const team = ABBR_TO_TEAM[token] || findTeamByName(token);
  if (team) {
    return { team, generalQuery: "" };
  }

  return { generalQuery: trimmed };
}

function isKnockout(stage: string | null | undefined): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase();
  return s.includes("final") || s.includes("semi") || s.includes("eliminator") || s.includes("qualifier") || s.includes("challenger") || s.includes("play-off") || s.includes("quarter");
}

interface SeriesWinnerInfo {
  winner: string | null;
  details: string;
  isFinal: boolean;
}

function determineSeriesWinner(matches: MatchListItem[], competitionName?: string): SeriesWinnerInfo {
  const now = new Date();
  const completedMatches = matches.filter(m => new Date(m.date) <= now);
  if (completedMatches.length === 0) {
    return { winner: null, details: "Upcoming", isFinal: false };
  }

  const compName = (competitionName ?? "").toLowerCase();
  const isTour = compName.includes("tour of") || compName.includes("tour in");

  if (isTour) {
    const matchesByFormat = new Map<string, MatchListItem[]>();
    for (const m of matches) {
      const fmt = fmtLabel(m.format);
      if (!matchesByFormat.has(fmt)) matchesByFormat.set(fmt, []);
      matchesByFormat.get(fmt)!.push(m);
    }

    const formatResults: string[] = [];
    let overallWinner: string | null = null;
    let winCount = 0;

    for (const [fmt, fmtMatches] of matchesByFormat.entries()) {
      const completedFmtMatches = fmtMatches.filter(m => new Date(m.date) <= now);
      if (completedFmtMatches.length === 0) continue;

      const wins: Record<string, number> = {};
      for (const m of completedFmtMatches) {
        if (!m.winner) continue;
        const wLower = m.winner.toLowerCase();
        if (["tie", "draw", "no result"].includes(wLower)) continue;
        wins[m.winner] = (wins[m.winner] || 0) + 1;
      }

      const teams = Array.from(new Set(fmtMatches.flatMap(m => [m.team1, m.team2])));
      if (teams.length !== 2) continue;

      const [t1, t2] = teams;
      const t1Wins = wins[t1] || 0;
      const t2Wins = wins[t2] || 0;
      const remainingMatches = fmtMatches.length - completedFmtMatches.length;

      if (t1Wins === t2Wins) {
        if (remainingMatches === 0) {
          formatResults.push(`${fmt}: Drawn ${t1Wins}-${t2Wins}`);
        } else {
          formatResults.push(`${fmt}: Level ${t1Wins}-${t2Wins}`);
        }
      } else {
        const [leader, leaderWins, trailerWins] = t1Wins > t2Wins ? [t1, t1Wins, t2Wins] : [t2, t2Wins, t1Wins];
        if (leaderWins > trailerWins + remainingMatches || remainingMatches === 0) {
          formatResults.push(`${fmt}: ${leader} won ${leaderWins}-${trailerWins}`);
          overallWinner = leader;
          winCount++;
        } else {
          formatResults.push(`${fmt}: ${leader} leads ${leaderWins}-${trailerWins}`);
        }
      }
    }

    if (formatResults.length > 0) {
      return {
        winner: winCount === 1 ? overallWinner : "Tour",
        details: formatResults.join(" · "),
        isFinal: false
      };
    }
  }

  // 1. Look for a "Final" match
  const finalMatch = completedMatches.find(m => isKnockout(m.match_stage) && (m.match_stage ?? "").toLowerCase().includes("final"));
  if (finalMatch && finalMatch.winner) {
    const wLower = finalMatch.winner.toLowerCase();
    if (wLower !== "tie" && wLower !== "draw" && wLower !== "no result" && wLower !== "") {
      return { winner: finalMatch.winner, details: `${finalMatch.winner} won the Final`, isFinal: true };
    }
  }

  // 2. Count wins
  const wins: Record<string, number> = {};
  for (const m of completedMatches) {
    if (!m.winner) continue;
    const wLower = m.winner.toLowerCase();
    if (["tie", "draw", "no result"].includes(wLower)) continue;
    wins[m.winner] = (wins[m.winner] || 0) + 1;
  }

  const teams = Array.from(new Set(matches.flatMap(m => [m.team1, m.team2])));
  if (teams.length !== 2) {
    return { winner: null, details: "Ongoing", isFinal: false };
  }

  const [t1, t2] = teams;
  const t1Wins = wins[t1] || 0;
  const t2Wins = wins[t2] || 0;
  const remainingMatches = matches.length - completedMatches.length;

  if (t1Wins === t2Wins) {
    if (remainingMatches === 0) {
      return { winner: "Drawn", details: `Series drawn ${t1Wins}-${t2Wins}`, isFinal: false };
    }
    return { winner: null, details: `Series level ${t1Wins}-${t2Wins}`, isFinal: false };
  }

  const [leader, leaderWins, trailerWins] = t1Wins > t2Wins ? [t1, t1Wins, t2Wins] : [t2, t2Wins, t1Wins];
  if (leaderWins > trailerWins + remainingMatches || remainingMatches === 0) {
    return { winner: leader, details: `${leader} won ${leaderWins}-${trailerWins}`, isFinal: false };
  }
  return { winner: null, details: `${leader} leads ${leaderWins}-${trailerWins}`, isFinal: false };
}

function groupBySeries(matches: MatchListItem[]): SeriesGroup[] {
  const map = new Map<string, MatchListItem[]>();
  for (const m of matches) {
    const key = m.competition ?? `${m.team1}-vs-${m.team2}-${m.format}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).map(([key, ms]) => {
    const first = ms[0];
    const type = classifyType(first.competition, first.format);
    const host = first.host_country ?? "Unknown";
    return {
      competition: first.competition ?? key,
      type,
      format: first.format,
      matches: ms.sort((a, b) => b.date.localeCompare(a.date)),
      dateRange: getDateRange(ms),
      host,
    };
  });
}

// ── Historic Moments Database ─────────────────────────────
const HISTORIC_MOMENTS: HistoricMoment[] = [
  { year: 2025, tournament: "ICC Champions Trophy", winner: "🇮🇳 India won", result: "Beat NZ by 4 wkts in Final · Dubai", icon: "🏆" },
  { year: 2024, tournament: "ICC T20 World Cup", winner: "🇮🇳 India won", result: "Beat SA by 7 runs in Final · Barbados", icon: "🏏" },
  { year: 2024, tournament: "IPL 2024", winner: "KKR won", result: "Beat SRH by 8 wkts in Final · Chennai", icon: "🔥" },
  { year: 2023, tournament: "ICC ODI World Cup", winner: "🇦🇺 Australia won", result: "Beat IND by 6 wkts in Final · Ahmedabad", icon: "🏆" },
  { year: 2023, tournament: "IPL 2023", winner: "CSK won", result: "Beat GT by 5 wkts (DLS) in Final · Ahmedabad", icon: "⚡" },
  { year: 2022, tournament: "ICC T20 World Cup", winner: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England won", result: "Beat PAK by 5 wkts in Final · Melbourne", icon: "🏆" },
  { year: 2022, tournament: "IPL 2022", winner: "GT won", result: "Beat RR by 7 wkts in Final · Ahmedabad", icon: "🔥" },
  { year: 2021, tournament: "ICC T20 World Cup", winner: "🇦🇺 Australia won", result: "Beat NZ by 8 wkts in Final · Dubai", icon: "🏆" },
  { year: 2021, tournament: "IPL 2021", winner: "CSK won", result: "Beat KKR by 27 runs in Final · Dubai", icon: "⚡" },
  { year: 2020, tournament: "IPL 2020", winner: "MI won", result: "Beat DC by 5 wkts in Final · Dubai", icon: "🔥" },
  { year: 2019, tournament: "ICC ODI World Cup", winner: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England won", result: "Beat NZ on boundary count after Super Over", icon: "🏆" },
  { year: 2019, tournament: "IPL 2019", winner: "MI won", result: "Beat CSK by 1 run in Final · Hyderabad", icon: "⚡" },
  { year: 2018, tournament: "IPL 2018", winner: "CSK won", result: "Beat SRH by 8 wkts in Final · Mumbai", icon: "🔥" },
  { year: 2017, tournament: "ICC Champions Trophy", winner: "🇵🇰 Pakistan won", result: "Beat IND by 180 runs in Final · London", icon: "🏆" },
  { year: 2017, tournament: "IPL 2017", winner: "MI won", result: "Beat RPS by 1 run in Final · Hyderabad", icon: "⚡" },
  { year: 2016, tournament: "ICC World T20", winner: "🌴 West Indies won", result: "Beat ENG by 4 wkts in Final · Kolkata", icon: "🏆" },
  { year: 2016, tournament: "IPL 2016", winner: "SRH won", result: "Beat RCB by 8 runs in Final · Bengaluru", icon: "🔥" },
  { year: 2015, tournament: "ICC ODI World Cup", winner: "🇦🇺 Australia won", result: "Beat NZ by 7 wkts in Final · Melbourne", icon: "🏆" },
  { year: 2015, tournament: "IPL 2015", winner: "MI won", result: "Beat CSK by 41 runs in Final · Kolkata", icon: "⚡" },
  { year: 2014, tournament: "ICC World T20", winner: "🇱🇰 Sri Lanka won", result: "Beat IND by 6 wkts in Final · Mirpur", icon: "🏆" },
  { year: 2014, tournament: "IPL 2014", winner: "KKR won", result: "Beat KXIP by 3 wkts in Final · Bengaluru", icon: "🔥" },
  { year: 2013, tournament: "ICC Champions Trophy", winner: "🇮🇳 India won", result: "Beat ENG by 5 runs in Final · Birmingham", icon: "🏆" },
  { year: 2013, tournament: "IPL 2013", winner: "MI won", result: "Beat CSK by 23 runs in Final · Kolkata", icon: "⚡" },
  { year: 2012, tournament: "ICC World T20", winner: "🌴 West Indies won", result: "Beat SL by 36 runs in Final · Colombo", icon: "🏆" },
  { year: 2012, tournament: "IPL 2012", winner: "KKR won", result: "Beat CSK by 5 wkts in Final · Chennai", icon: "🔥" },
  { year: 2011, tournament: "ICC ODI World Cup", winner: "🇮🇳 India won", result: "Beat SL by 6 wkts in Final · Mumbai", icon: "🏆" },
  { year: 2011, tournament: "IPL 2011", winner: "CSK won", result: "Beat RCB by 58 runs in Final · Chennai", icon: "⚡" },
  { year: 2010, tournament: "ICC World T20", winner: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England won", result: "Beat AUS by 7 wkts in Final · Barbados", icon: "🏆" },
  { year: 2010, tournament: "IPL 2010", winner: "CSK won", result: "Beat MI by 22 runs in Final · Mumbai", icon: "🔥" },
  { year: 2009, tournament: "ICC World T20", winner: "🇵🇰 Pakistan won", result: "Beat SL by 8 wkts in Final · Lord's", icon: "🏆" },
  { year: 2009, tournament: "IPL 2009", winner: "Deccan Chargers won", result: "Beat RCB by 6 runs in Final · Johannesburg", icon: "⚡" },
  { year: 2008, tournament: "IPL 2008", winner: "Rajasthan Royals won", result: "Beat CSK by 3 wkts in Final · Navi Mumbai", icon: "🏆" }
];

// ── Poetic Summaries Helper ────────────────────────────────
const getSeasonInfo = (year: number | "all") => {
  const data: Record<number | "all", { title: string; meta: string; highlights: { i: string; v: string; t: string; c: string }[] }> = {
    all: {
      title: "All-Time Cricket Archive",
      meta: "Complete history of matches and tournaments",
      highlights: [
        { i: "🏆", v: "Global History", t: "Every Trophy & Era", c: "var(--accent-gold)" },
        { i: "⚡", v: "Classics", t: "Unforgettable Encounters", c: "var(--accent-blue)" }
      ]
    },
    2026: {
      title: "Subcontinental Skies & Future Frontiers",
      meta: "T20 World Cup in India & SL · WTC Final Race · IPL 2026",
      highlights: [
        { i: "🏆", v: "T20 World Cup", t: "Home Soil Dreams", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL 2026", t: "Legends Arise", c: "var(--accent-green)" },
        { i: "⚡", v: "WTC Quest", t: "The Ultimate Apex", c: "var(--accent-blue)" }
      ]
    },
    2025: {
      title: "The Trial of Champions & Ashes Redux",
      meta: "ICC Champions Trophy · The Ashes · IPL 2025",
      highlights: [
        { i: "🏆", v: "Champions Trophy", t: "India's Desert Glory", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL 2025", t: "A Battle Reborn", c: "var(--accent-green)" },
        { i: "⚡", v: "The Ashes", t: "Unbreakable Rivalry", c: "var(--accent-blue)" }
      ]
    },
    2024: {
      title: "India's Golden Year",
      meta: "T20 World Cup · IPL · WTC Race",
      highlights: [
        { i: "🏆", v: "T20 World Cup", t: "India's Caribbean Glory", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL 2024", t: "KKR's Purple Reign", c: "var(--accent-green)" }
      ]
    },
    2023: {
      title: "A Billion Hopes & The Aussie Heartbreak",
      meta: "ICC Cricket World Cup · CSK's Last-Ball Thriller · WTC Final",
      highlights: [
        { i: "🏆", v: "ODI World Cup", t: "Australia's Hexa Glory", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Final", t: "CSK's Last-Ball Thriller", c: "var(--accent-green)" },
        { i: "👑", v: "WTC Crown", t: "Australia's Apex", c: "var(--accent-gold)" }
      ]
    },
    2022: {
      title: "The Melbourne Masterclass",
      meta: "T20 World Cup in Australia · GT's Debut Glory · Asia Cup Drama",
      highlights: [
        { i: "🏆", v: "T20 World Cup", t: "England's Double Crown", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Debutants", t: "GT's Historic Run", c: "var(--accent-green)" },
        { i: "⚡", v: "MCG Thriller", t: "Kohli's Unforgettable 82*", c: "var(--accent-blue)" }
      ]
    },
    2021: {
      title: "The Gabba Miracle & New Champions",
      meta: "Border-Gavaskar Victory · WTC Final · T20 World Cup UAE",
      highlights: [
        { i: "🏆", v: "T20 World Cup", t: "Australia's Desert Maiden", c: "var(--accent-gold)" },
        { i: "👑", v: "Test Pinnacle", t: "NZ's Inaugural WTC", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Return", t: "CSK's Resurrection", c: "var(--accent-green)" }
      ]
    },
    2020: {
      title: "Cricket Behind Closed Doors",
      meta: "IPL in UAE · Women's T20 WC · Bio-Bubble Battles",
      highlights: [
        { i: "🏆", v: "Women's T20 WC", t: "Australia's MCG Record", c: "var(--accent-gold)" },
        { i: "🔥", v: "Desert IPL", t: "MI's Dominant Five", c: "var(--accent-green)" },
        { i: "🏏", v: "MCG Test", t: "India's Resilient Fight", c: "var(--accent-blue)" }
      ]
    },
    2019: {
      title: "By the Barest of Margins",
      meta: "ICC World Cup Thriller · MI's 4th Title · Headingley Magic",
      highlights: [
        { i: "🏆", v: "ODI World Cup", t: "England's Boundary Count", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL El Clasico", t: "MI's 1-Run Heist", c: "var(--accent-green)" },
        { i: "⚡", v: "Ashes Miracle", t: "Stokes' Headingley 135*", c: "var(--accent-blue)" }
      ]
    },
    2018: {
      title: "The Return of the Kings",
      meta: "CSK's Resurrection · India in Australia · Sandpapergate",
      highlights: [
        { i: "🔥", v: "CSK Comeback", t: "Dad's Army Glory", c: "var(--accent-green)" },
        { i: "🏆", v: "Asia Cup", t: "India's Tight Finish", c: "var(--accent-gold)" },
        { i: "⚡", v: "Down Under", t: "India's Historic Lead", c: "var(--accent-blue)" }
      ]
    },
    2017: {
      title: "The Green Rebellion",
      meta: "Champions Trophy · MI's Core Domination · Women's WC Boom",
      highlights: [
        { i: "🏆", v: "Champions Trophy", t: "Pakistan's Oval Triumph", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Thriller", t: "MI's 1-Run Heist", c: "var(--accent-green)" },
        { i: "🏏", v: "Women's WC", t: "England's Lord's Drama", c: "var(--accent-blue)" }
      ]
    },
    2016: {
      title: "Remember the Name",
      meta: "World T20 in India · SRH's Triumph · Virat's 973 Runs",
      highlights: [
        { i: "🏆", v: "World T20", t: "WI's Eden Gardens Magic", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Orange", t: "SRH's Sun Rise Glory", c: "var(--accent-green)" },
        { i: "⚡", v: "Record Run", t: "Kohli's Peak Campaign", c: "var(--accent-blue)" }
      ]
    },
    2015: {
      title: "The Trans-Tasman Fireworks",
      meta: "ICC Cricket World Cup · MI's Rebound · Ashes Heat",
      highlights: [
        { i: "🏆", v: "ODI World Cup", t: "Australia's MCG Crown", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Champions", t: "MI's Tremendous Rebound", c: "var(--accent-green)" },
        { i: "🏏", v: "Ashes War", t: "England's Home Redemption", c: "var(--accent-blue)" }
      ]
    },
    2014: {
      title: "The Sri Lankan Redemption",
      meta: "World T20 in Bangladesh · KKR's Second Title · Test Drama",
      highlights: [
        { i: "🏆", v: "World T20", t: "Sri Lanka's Mirpur Joy", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Return", t: "KKR's Second Glory", c: "var(--accent-green)" },
        { i: "⚡", v: "Border-Gavaskar", t: "Australia's Hard Fight", c: "var(--accent-blue)" }
      ]
    },
    2013: {
      title: "Dhoni's Golden Circle",
      meta: "Champions Trophy · MI's First Title · Sachin's Farewell",
      highlights: [
        { i: "🏆", v: "Champions Trophy", t: "India's Unbeaten Run", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Crown", t: "MI's Maiden Title", c: "var(--accent-green)" },
        { i: "👑", v: "Farewell", t: "Sachin's Emotional Exit", c: "var(--accent-gold)" }
      ]
    },
    2012: {
      title: "The West Indies Dance",
      meta: "World T20 in Sri Lanka · KKR's First Crown · Test Transitions",
      highlights: [
        { i: "🏆", v: "World T20", t: "WI's Gangnam Style", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Magic", t: "KKR's First Crown", c: "var(--accent-green)" },
        { i: "🏏", v: "Test Shields", t: "South Africa's Apex", c: "var(--accent-blue)" }
      ]
    },
    2011: {
      title: "A Nation's Dream Realized",
      meta: "ICC Cricket World Cup · CSK Defends Title · England's Test Climb",
      highlights: [
        { i: "🏆", v: "ODI World Cup", t: "Dhoni's Wankhede Six", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Kings", t: "CSK Defends Crown", c: "var(--accent-green)" },
        { i: "⚡", v: "Test No. 1", t: "England's Ascent", c: "var(--accent-blue)" }
      ]
    },
    2010: {
      title: "Rise of the Giants",
      meta: "World T20 in Caribbean · CSK's Double · Tendulkar's 200",
      highlights: [
        { i: "🏆", v: "World T20", t: "England's Barbados Triumph", c: "var(--accent-gold)" },
        { i: "🔥", v: "IPL Glory", t: "CSK's Maiden Crown", c: "var(--accent-green)" },
        { i: "👑", v: "Milestone", t: "Sachin's Historic 200*", c: "var(--accent-gold)" }
      ]
    },
    2009: {
      title: "The Winds of Change",
      meta: "T20 World Cup in ENG · IPL in South Africa · Ashes Revival",
      highlights: [
        { i: "🏆", v: "World T20", t: "Pakistan's Lord's Glory", c: "var(--accent-gold)" },
        { i: "🇿🇦", v: "IPL Safari", t: "Deccan's Mighty Charge", c: "var(--accent-green)" },
        { i: "🔥", v: "Ashes", t: "England's Home Revival", c: "var(--accent-blue)" }
      ]
    },
    2008: {
      title: "The Dawn of a New Era",
      meta: "Inaugural IPL · Dhoni's Rise · Border-Gavaskar",
      highlights: [
        { i: "🏆", v: "Inaugural IPL", t: "RR's Fairy Tale Run", c: "var(--accent-gold)" },
        { i: "⚡", v: "Debut Season", t: "T20's Global Explosion", c: "var(--accent-green)" },
        { i: "🏏", v: "Test Battles", t: "India vs Aus Heat", c: "var(--accent-blue)" }
      ]
    }
  };
  return data[year] ?? {
    title: `${year} Cricket Archive`,
    meta: "Full season matches and statistics",
    highlights: [{ i: "🏏", v: "Season matches", t: "Completed", c: "var(--accent-green)" }]
  };
};

const YEARS = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => 2026 - i);

const YEAR_ERAS = [
  { label: "Modern Era (2020 – 2026)", years: YEARS.filter(y => y >= 2020) },
  { label: "Transition Era (2014 – 2019)", years: YEARS.filter(y => y >= 2014 && y < 2020) },
  { label: "Early Era (2008 – 2013)", years: YEARS.filter(y => y < 2014) }
];

// ── Series Card Component ─────────────────────────────────
function SeriesCard({ 
  series, 
  isOpen, 
  onToggle 
}: { 
  series: SeriesGroup; 
  isOpen: boolean; 
  onToggle: () => void;
}) {
  const badgeClass = 
    series.type === "intl" ? "sc-intl" :
    series.type === "ipl" ? "sc-ipl" :
    series.type === "franchise" ? "sc-franchise" :
    series.type === "wc" ? "sc-wc" : "sc-domestic";

  const badgeText = 
    series.type === "intl" ? "INTL" :
    series.type === "ipl" ? "IPL" :
    series.type === "franchise" ? "FRANCHISE" :
    series.type === "wc" ? "ICC" : "OTHER";

  const now = new Date();
  const allPast = series.matches.every(m => new Date(m.date) < now);
  const allFuture = series.matches.every(m => new Date(m.date) > now);
  const isOngoing = !allPast && !allFuture;

  const statusBadge = isOngoing ? (
    <span className="sc-result-badge res-ongoing">● Ongoing</span>
  ) : allFuture ? (
    <span className="sc-result-badge res-upcoming">↑ Upcoming</span>
  ) : (
    <span className="sc-result-badge res-completed">✓ Done</span>
  );

  const seriesWinner = determineSeriesWinner(series.matches, series.competition ?? "");

  // Group matches by format label
  const matchesByFormat = new Map<string, MatchListItem[]>();
  for (const m of series.matches) {
    const fmt = fmtLabel(m.format);
    if (!matchesByFormat.has(fmt)) matchesByFormat.set(fmt, []);
    matchesByFormat.get(fmt)!.push(m);
  }

  return (
    <div className={`v2-series-card ${isOpen ? "expanded" : ""}`}>
      <div className="sc-row" onClick={onToggle}>
        <span className={`sc-badge ${badgeClass}`}>{badgeText}</span>
        <div>
          <div className="sc-name">{series.competition}</div>
          <div className="sc-teams">
            {Array.from(new Set(series.matches.flatMap(m => [m.team1, m.team2]))).slice(0, 4).join(" · ")}
            {series.host ? ` · 📍 ${series.host}` : ""}
          </div>
          {seriesWinner && seriesWinner.winner && (
            <div className="text-[10px] font-bold text-accent-gold mt-1 flex items-center gap-1.5">
              <span>🏆</span>
              {seriesWinner.winner !== "Drawn" && seriesWinner.winner !== "Tour" && (
                <TeamLogo teamName={seriesWinner.winner} size={12} showFallbackText={false} />
              )}
              <span>{seriesWinner.details}</span>
            </div>
          )}
          {seriesWinner && !seriesWinner.winner && seriesWinner.details !== "Upcoming" && seriesWinner.details !== "Ongoing" && (
            <div className="text-[10px] text-accent-blue mt-1 flex items-center gap-1.5">
              <span>🏏</span>
              <span>{seriesWinner.details}</span>
            </div>
          )}
        </div>
        <div className="sc-meta">
          {statusBadge}
          <div className="sc-dates">{series.dateRange}</div>
        </div>
        <span className="sc-chevron">▼</span>
      </div>

      {isOpen && (
        <div className="sc-matches" style={{ display: "block" }}>
          {series.matches.length === 0 ? (
            <div style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)" }}>
              No matches found.
            </div>
          ) : (
            Array.from(matchesByFormat.entries()).map(([formatLabel, formatMatches]) => (
              <div key={formatLabel} className="format-group-section">
                <div className="format-group-hdr">
                  <span>{formatLabel} Matches</span>
                  <span className="text-muted font-normal lowercase">{formatMatches.length} matches</span>
                </div>
                <div className="sm-hdr">
                  <span className="sm-hdr-c">Fmt / Stage</span>
                  <span className="sm-hdr-c">Match</span>
                  <span className="sm-hdr-c">Venue</span>
                  <span className="sm-hdr-c">Result</span>
                  <span className="sm-hdr-c" style={{ textAlign: "right" }}>Date</span>
                </div>
                {formatMatches.map((m) => {
                  const isT1Win = m.winner === m.team1;
                  const isT2Win = m.winner === m.team2;
                  const wLower = m.winner?.toLowerCase() || "";
                  const isTie = wLower === "tie";
                  const isDraw = wLower === "draw";
                  const isNR = !m.winner || wLower === "no result";
                  const isKo = isKnockout(m.match_stage);
                  
                  let resultClass = "";
                  let resultText = "";
                  if (isNR) {
                    resultText = "No result";
                  } else if (isTie) {
                    resultText = "Match Tied";
                    resultClass = "draw";
                  } else if (isDraw) {
                    resultText = "Match Drawn";
                    resultClass = "draw";
                  } else {
                    resultText = `${m.winner} won ${m.win_margin ? `(${m.win_margin})` : ""}`;
                    resultClass = isT1Win ? "win" : "loss";
                  }

                  return (
                    <Link
                      href={`/match/${m.match_id}`}
                      key={m.match_id}
                      className={`match-row ${isKo ? "knockout" : ""}`}
                    >
                      <span className={`mr-fmt sc-badge ${isKo ? "mr-ko-badge" : badgeClass}`}>
                        {isKo ? m.match_stage : fmtLabel(m.format)}
                      </span>
                      <div className="mr-teams flex items-center gap-1.5">
                        <TeamLogo teamName={m.team1} size={12} showFallbackText={false} />
                        <span>{m.team1}</span>
                        <span className="text-[9px] text-muted mx-0.5">vs</span>
                        <TeamLogo teamName={m.team2} size={12} showFallbackText={false} />
                        <span>{m.team2}</span>
                      </div>
                      <div className="mr-venue">{m.venue ? m.venue.split(",")[0] : ""}</div>
                      <div className={`mr-result ${resultClass}`}>{resultText}</div>
                      <div className="mr-date">{fmtDate(m.date)}</div>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Inner Component ──────────────────────────────────
function MatchesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const yearParam = searchParams.get("year");
  const initYear = yearParam === "all" ? "all" : parseInt(yearParam ?? "2026");
  const initFilter = searchParams.get("filter") ?? "all";
  const initSeries = searchParams.get("series") ?? null;

  const [currentYear, setCurrentYear]   = useState<number | "all">(initYear);
  const [toolbarFilter, setToolbarFilter] = useState(initFilter);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(initSeries);
  const [matches, setMatches]            = useState<MatchListItem[]>([]);
  const [loading, setLoading]            = useState(true);

  // Advanced Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [teamSearchText, setTeamSearchText] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["intl", "ipl", "franchise", "wc"]);
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [viewType, setViewType] = useState<"list" | "calendar" | "timeline">("list");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const [sidebarOpenSections, setSidebarOpenSections] = useState({
    format: true,
    teams: false,
    hosts: false,
    types: true
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const toggleSection = (section: keyof typeof sidebarOpenSections) => {
    setSidebarOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateUrl = useCallback((year: number | "all", filter: string, series: string | null) => {
    const p = new URLSearchParams({ year: String(year), filter });
    if (series) p.set("series", series);
    router.replace(`/matches?${p}`, { scroll: false });
  }, [router]);

  const fetchMatches = useCallback(async (
    year: number | "all",
    searchTeam?: string,
    searchTeam1?: string,
    searchTeam2?: string,
    generalQuery?: string
  ) => {
    setLoading(true);
    try {
      const yearParam = year === "all" ? undefined : year;
      
      const res = await api.getMatches({ 
        year: yearParam,
        team: searchTeam,
        team1: searchTeam1,
        team2: searchTeam2,
        page: 0 
      });
      
      let all = res.matches;
      if (res.total > 200) {
        const maxPages = (year === "all" && !searchTeam && !searchTeam1 && !searchTeam2 && !generalQuery) ? 5 : Math.ceil(res.total / 200);
        const pagesToFetch = Math.min(Math.ceil(res.total / 200), maxPages);
        
        if (pagesToFetch > 1) {
          const extras = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, i) =>
              api.getMatches({ 
                year: yearParam,
                team: searchTeam,
                team1: searchTeam1,
                team2: searchTeam2,
                page: i + 1 
              })
            )
          );
          for (const e of extras) all = all.concat(e.matches);
        }
      }

      // Deduplicate matches
      const seen = new Set<string>();
      const uniqueMatches: MatchListItem[] = [];
      for (const m of all) {
        if (!seen.has(m.match_id)) {
          seen.add(m.match_id);
          uniqueMatches.push(m);
        }
      }
      setMatches(uniqueMatches);
    } catch (err) {
      console.error("Failed to load matches:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const parsed = parseSearchQuery(searchQuery);
    const timer = setTimeout(() => {
      fetchMatches(currentYear, parsed.team, parsed.team1, parsed.team2, parsed.generalQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [currentYear, searchQuery, fetchMatches]);

  const handleYearChange = (year: number | "all") => {
    setCurrentYear(year);
    setExpandedSeries(null);
    setSelectedMonth(null);
    updateUrl(year, toolbarFilter, null);
  };

  const handleToolbarFilterChange = (f: string) => {
    setToolbarFilter(f);
    updateUrl(currentYear, f, expandedSeries);
  };

  const handleToggleSeries = (comp: string) => {
    const next = expandedSeries === comp ? null : comp;
    setExpandedSeries(next);
    updateUrl(currentYear, toolbarFilter, next);
  };

  const toggleTeamFilter = (team: string) => {
    setSelectedTeams(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]);
  };

  const toggleHostFilter = (host: string) => {
    setSelectedHosts(prev => prev.includes(host) ? prev.filter(h => h !== host) : [...prev, host]);
  };

  const toggleFormatFilter = (fmt: string) => {
    setSelectedFormats(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);
  };

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleReset = () => {
    setSelectedTeams([]);
    setSelectedHosts([]);
    setSelectedFormats([]);
    setSelectedTypes(["intl", "ipl", "franchise", "wc"]);
    setTeamSearchText("");
    setSearchQuery("");
    setToolbarFilter("all");
    setSelectedMonth(null);
    updateUrl(currentYear, "all", null);
  };

  // Group fetched matches into series
  const grouped = groupBySeries(matches);

  // Dynamic sidebar filters base: if a series is expanded, narrow filters down to that series.
  const matchesForFilters = expandedSeries 
    ? matches.filter(m => m.competition === expandedSeries)
    : matches;

  // Extract unique Teams & Hosts dynamically for Left Panel filters
  const allTeams = Array.from(new Set(matchesForFilters.flatMap(m => [m.team1, m.team2]))).sort();
  const filteredTeams = allTeams.filter(t => t.toLowerCase().includes(teamSearchText.toLowerCase()));

  // Extract unique Host Country names using canonical host_country field
  const allHosts = Array.from(new Set(matchesForFilters.map(m => m.host_country).filter(Boolean))).sort() as string[];

  // Dynamically calculate formats available in current scope
  const availableFormats = Array.from(new Set(matchesForFilters.map(m => {
    const type = classifyType(m.competition, m.format);
    if (type === "ipl") return "IPL";
    if (type === "franchise") return "Franchise T20";
    const isWc = type === "wc";
    if (isWc) return "World Cup";
    return fmtLabel(m.format);
  }))).sort();

  // Advanced client-side filtering logic
  const filtered = grouped.filter(s => {
    // Main Search Query
    if (searchQuery) {
      const parsed = parseSearchQuery(searchQuery);
      if (parsed.team || parsed.team1 || parsed.team2) {
        const hasMatchingTeam = s.matches.some(m => {
          if (parsed.team) {
            return m.team1 === parsed.team || m.team2 === parsed.team;
          }
          if (parsed.team1 && parsed.team2) {
            return (m.team1 === parsed.team1 && m.team2 === parsed.team2) ||
                   (m.team1 === parsed.team2 && m.team2 === parsed.team1);
          }
          return false;
        });
        if (!hasMatchingTeam) return false;
      } else {
        const q = searchQuery.toLowerCase();
        const matchesQuery = (s.competition ?? "").toLowerCase().includes(q) ||
          s.matches.some(m => 
            m.team1.toLowerCase().includes(q) || 
            m.team2.toLowerCase().includes(q) || 
            (m.venue ?? "").toLowerCase().includes(q)
          );
        if (!matchesQuery) return false;
      }
    }

    // Toolbar Filter
    if (toolbarFilter !== "all") {
      if (toolbarFilter === "international" && s.type !== "intl") return false;
      if (toolbarFilter === "icc" && s.type !== "wc") return false;
      if (toolbarFilter === "ipl" && s.type !== "ipl") return false;
      if (toolbarFilter === "franchise" && s.type !== "franchise") return false;
    }

    // Format Filter (Left Panel)
    if (selectedFormats.length > 0) {
      const isFormatMatched = selectedFormats.some(f => {
        if (f === "IPL") return s.type === "ipl";
        if (f === "Franchise T20") return s.type === "franchise";
        if (f === "World Cup") return s.type === "wc";
        const seriesFmt = s.format === "IT20" || s.format === "T20I" ? "T20I" : s.format;
        return f === seriesFmt;
      });
      if (!isFormatMatched) return false;
    }

    // Series Type Filter (Left Panel)
    if (selectedTypes.length > 0) {
      const isTypeMatched = selectedTypes.some(t => {
        if (t === "intl") return s.type === "intl";
        if (t === "ipl") return s.type === "ipl";
        if (t === "franchise") return s.type === "franchise";
        if (t === "wc") return s.type === "wc";
        return false;
      });
      if (!isTypeMatched) return false;
    }

    // Host Filter (Left Panel)
    if (selectedHosts.length > 0) {
      if (!s.host || !selectedHosts.includes(s.host)) return false;
    }

    // Teams Filter (Left Panel)
    if (selectedTeams.length > 0) {
      const seriesTeams = new Set(s.matches.flatMap(m => [m.team1, m.team2]));
      const hasTeam = selectedTeams.some(t => seriesTeams.has(t));
      if (!hasTeam) return false;
    }

    // Month Filter (timeline interaction)
    if (selectedMonth !== null) {
      const hasMatchInMonth = s.matches.some(m => new Date(m.date).getMonth() === selectedMonth);
      if (!hasMatchInMonth) return false;
    }

    return true;
  });

  // Sorting
  const sortedSeries = [...filtered].sort((a, b) => {
    if (sortBy === "date_desc") {
      const dateA = a.matches[0]?.date ?? "";
      const dateB = b.matches[0]?.date ?? "";
      return dateB.localeCompare(dateA);
    }
    if (sortBy === "date_asc") {
      const dateA = a.matches[a.matches.length - 1]?.date ?? "";
      const dateB = b.matches[b.matches.length - 1]?.date ?? "";
      return dateA.localeCompare(dateB);
    }
    if (sortBy === "name") {
      return (a.competition ?? "").localeCompare(b.competition ?? "");
    }
    if (sortBy === "format") {
      return a.format.localeCompare(b.format);
    }
    if (sortBy === "host") {
      return (a.host ?? "").localeCompare(b.host ?? "");
    }
    return 0;
  });

  const parsed = parseSearchQuery(searchQuery);
  const isTeamSearchActive = !!(parsed.team || parsed.team1 || parsed.team2);

  const filteredMatches = sortedSeries.flatMap(s => {
    if (isTeamSearchActive) {
      return s.matches.filter(m => {
        if (parsed.team) {
          return m.team1 === parsed.team || m.team2 === parsed.team;
        }
        if (parsed.team1 && parsed.team2) {
          return (m.team1 === parsed.team1 && m.team2 === parsed.team2) ||
                 (m.team1 === parsed.team2 && m.team2 === parsed.team1);
        }
        return false;
      });
    }
    return s.matches;
  });

  // Dynamic Statistics Calculations
  const totalMatchesCount = matches.length;
  const totalSeriesCount = grouped.length;
  const iccEventsCount = grouped.filter(s => s.type === "wc").length;
  const uniqueTeamsCount = new Set(matches.flatMap(m => [m.team1, m.team2])).size;
  const uniqueHostsCount = allHosts.length;
  const bilateralCount = grouped.filter(s => s.type === "intl").length;

  const formatCounts = {
    test: matches.filter(m => m.format === "Test").length,
    odi: matches.filter(m => m.format === "ODI").length,
    t20i: matches.filter(m => m.format === "IT20" || m.format === "T20I").length,
    ipl: matches.filter(m => classifyType(m.competition, m.format) === "ipl").length,
    other: 0
  };
  formatCounts.other = Math.max(0, totalMatchesCount - (formatCounts.test + formatCounts.odi + formatCounts.t20i + formatCounts.ipl));
  const maxFormatCount = Math.max(formatCounts.test, formatCounts.odi, formatCounts.t20i, formatCounts.ipl, formatCounts.other, 1);

  // Month-wise Density Calculations
  const monthsData = Array.from({ length: 12 }, (_, i) => {
    const monthMatches = matches.filter(m => new Date(m.date).getMonth() === i);
    const intl = monthMatches.filter(m => classifyType(m.competition, m.format) === "intl").length;
    const t20 = monthMatches.filter(m => ["ipl", "franchise"].includes(classifyType(m.competition, m.format))).length;
    const icc = monthMatches.filter(m => classifyType(m.competition, m.format) === "wc").length;
    
    // Add cup trophy emoji if there was a final match in this month
    let trophy: string | null = null;
    const hasFinal = monthMatches.some(m => (m.competition?.toLowerCase().includes("world cup") || m.competition?.toLowerCase().includes("champions trophy")) && m.win_margin?.toLowerCase().includes("final"));
    if (hasFinal) trophy = "🏆";

    return {
      monthName: new Date(2025, i, 1).toLocaleDateString("en-US", { month: "short" }),
      intl,
      t20,
      icc,
      total: monthMatches.length,
      trophy
    };
  });
  const maxMonthTotal = Math.max(...monthsData.map(m => m.total), 1);

  // Historic Champions filtered by year
  const championsForYear = HISTORIC_MOMENTS.filter(m => m.year === currentYear);

  // Top followed series computed dynamically
  const topFollowed = [...grouped]
    .sort((a, b) => b.matches.length - a.matches.length)
    .slice(0, 5)
    .map((s, idx) => {
      let base = s.matches.length * 1.2;
      if (s.type === "ipl") base *= 4.5;
      else if (s.type === "wc") base *= 7.0;
      else if (s.type === "intl") base *= 1.8;
      return {
        num: idx + 1,
        name: s.competition ?? "Series Archive",
        count: `${base.toFixed(1)}M`
      };
    });

  const seasonInfo = getSeasonInfo(currentYear);

  return (
    <div className="matches-layout">
      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileFiltersOpen && (
        <div 
          className="lg:hidden"
          onClick={() => setMobileFiltersOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 45,
          }}
        />
      )}

      {/* ── LEFT PANEL (FILTER ARCHIVE) ──────────────────────── */}
      <div className={`matches-left-panel ${mobileFiltersOpen ? "fixed inset-y-0 left-0 z-50 w-[260px] flex shadow-2xl" : "hidden lg:flex"}`}>
        <div className="lp-hdr flex justify-between items-center">
          <div>
            <div className="lp-title">Filter Archive</div>
            <div className="lp-sub">Slice {totalMatchesCount} matches</div>
          </div>
          {mobileFiltersOpen && (
            <button 
              className="text-xs text-muted hover:text-text-primary lg:hidden font-mono"
              onClick={() => setMobileFiltersOpen(false)}
            >
              [Close]
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Year Section */}
          <div className="yr-section">
            <div className="yr-sec-lbl">Year Archive</div>
            <div className="mb-2.5">
              <div
                className={`yr-btn w-full !block text-center py-2 ${currentYear === "all" ? "on" : ""}`}
                onClick={() => handleYearChange("all")}
              >
                🌐 All Time Archive
              </div>
            </div>
            {YEAR_ERAS.map(era => (
              <div key={era.label}>
                <div className="yr-era-lbl">{era.label}</div>
                <div className="yr-grid">
                  {era.years.map(y => (
                    <div
                      key={y}
                      className={`yr-btn ${currentYear === y ? "on" : ""}`}
                      onClick={() => handleYearChange(y)}
                    >
                      {y}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Format Accordion */}
          <div className="filter-group">
            <div className="fg-hdr" onClick={() => toggleSection("format")}>
              <span className="fg-lbl">Format</span>
              <span className={`fg-chev ${sidebarOpenSections.format ? "open" : ""}`}>▼</span>
            </div>
            {sidebarOpenSections.format && (
              <div className="fg-body open">
                <div className="filter-chips">
                  {availableFormats.map(f => (
                    <span
                      key={f}
                      className={`fchip ${selectedFormats.includes(f) ? "on" : ""}`}
                      onClick={() => toggleFormatFilter(f)}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Teams Involved Accordion */}
          <div className="filter-group">
            <div className="fg-hdr" onClick={() => toggleSection("teams")}>
              <span className="fg-lbl">Teams Involved</span>
              <span className={`fg-chev ${sidebarOpenSections.teams ? "open" : ""}`}>▼</span>
            </div>
            {sidebarOpenSections.teams && (
              <div className="fg-body open">
                <input
                  className="team-search"
                  placeholder="Search team…"
                  value={teamSearchText}
                  onChange={e => setTeamSearchText(e.target.value)}
                />
                <div className="filter-chips max-h-[200px] overflow-y-auto pr-1">
                  {filteredTeams.length === 0 ? (
                    <div className="text-[10px] text-muted py-2">No matching teams</div>
                  ) : (
                    filteredTeams.map(t => (
                      <span
                        key={t}
                        className={`fchip ${selectedTeams.includes(t) ? "on" : ""}`}
                        onClick={() => toggleTeamFilter(t)}
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Host Country Accordion */}
          <div className="filter-group">
            <div className="fg-hdr" onClick={() => toggleSection("hosts")}>
              <span className="fg-lbl">Host Country</span>
              <span className={`fg-chev ${sidebarOpenSections.hosts ? "open" : ""}`}>▼</span>
            </div>
            {sidebarOpenSections.hosts && (
              <div className="fg-body open">
                <div className="filter-chips">
                  {allHosts.length === 0 ? (
                    <div className="text-[10px] text-muted py-2">No host data available</div>
                  ) : (
                    allHosts.map(h => (
                      <span
                        key={h}
                        className={`fchip ${selectedHosts.includes(h) ? "on" : ""}`}
                        onClick={() => toggleHostFilter(h)}
                      >
                        {h}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Series Type Accordion */}
          <div className="filter-group">
            <div className="fg-hdr" onClick={() => toggleSection("types")}>
              <span className="fg-lbl">Series Type</span>
              <span className={`fg-chev ${sidebarOpenSections.types ? "open" : ""}`}>▼</span>
            </div>
            {sidebarOpenSections.types && (
              <div className="fg-body open">
                <div className="filter-chips">
                  {[
                    { key: "intl", label: "International" },
                    { key: "ipl", label: "IPL" },
                    { key: "franchise", label: "Franchise" },
                    { key: "wc", label: "ICC Events" }
                  ].map(t => (
                    <span
                      key={t.key}
                      className={`fchip ${selectedTypes.includes(t.key) ? "on" : ""}`}
                      onClick={() => toggleTypeFilter(t.key)}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lp-actions">
          <button className="lp-reset" onClick={handleReset}>↺ Reset</button>
          <button className="lp-apply" onClick={() => setMobileFiltersOpen(false)}>Apply Filters</button>
        </div>
      </div>

      {/* ── CENTRAL MAIN COLUMN ───────────────────────────────── */}
      <div className="main flex-1">
        {/* Toolbar */}
        <div className="matches-toolbar">
          <div className="search-row">
            <button 
              className="vt-btn lg:hidden mr-1 border border-glass-border px-3 py-1.5 rounded-lg text-xs mobile-filter-btn"
              onClick={() => setMobileFiltersOpen(true)}
            >
              📁 Filters
            </button>
            <div className="main-search">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" opacity=".4">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input
                placeholder="Search series, teams, tournaments, venues…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="view-toggle">
              <div 
                className={`vt-btn ${viewType === "list" ? "on" : ""}`}
                onClick={() => setViewType("list")}
              >
                ☰ List
              </div>
              <div 
                className={`vt-btn ${viewType === "calendar" ? "on" : ""}`}
                onClick={() => setViewType("calendar")}
              >
                📅 Cal
              </div>
              <div 
                className={`vt-btn ${viewType === "timeline" ? "on" : ""}`}
                onClick={() => setViewType("timeline")}
              >
                ⟵ Timeline
              </div>
            </div>
            <select 
              className="sort-sel"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="date_desc">Sort: Date ↓</option>
              <option value="date_asc">Sort: Date ↑</option>
              <option value="name">Sort: A→Z</option>
              <option value="format">Sort: Format</option>
              <option value="host">Sort: Host</option>
            </select>
          </div>

          <div className="filter-row">
            {[
              { id: "all", label: "All" },
              { id: "international", label: "International" },
              { id: "icc", label: "ICC Events" },
              { id: "ipl", label: "IPL" },
              { id: "franchise", label: "Franchise T20" }
            ].map(item => (
              <span
                key={item.id}
                className={`fmt-chip ${toolbarFilter === item.id ? "on" : ""}`}
                onClick={() => handleToolbarFilterChange(item.id)}
              >
                {item.label}
              </span>
            ))}
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)" }}>
              {sortedSeries.length} series · {currentYear}
            </div>
          </div>
        </div>

        {/* Season Banner */}
        <div className="season-banner">
          <div className="sb-inner">
            <div className="sb-left">
              <div className="sb-year-lbl">◆ {currentYear} CRICKET CALENDAR</div>
              <div className="sb-title">{seasonInfo.title}</div>
              <div className="sb-meta">
                {seasonInfo.meta} · {totalSeriesCount} series · {totalMatchesCount} matches
              </div>
              <div className="sb-highlights">
                {seasonInfo.highlights.map((h, idx) => (
                  <div key={idx} className="sh">
                    <span className="sh-icon">{h.i}</span>
                    <span className="sh-val" style={{ color: h.c }}>{h.v}</span>
                    <span className="sh-txt">{h.t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="sb-right">
              <div className="sb-stat">
                <div className="sb-stat-v" style={{ color: "var(--accent-green)" }}>{totalSeriesCount}</div>
                <div className="sb-stat-l">Series</div>
              </div>
              <div className="sb-stat">
                <div className="sb-stat-v" style={{ color: "var(--accent-blue)" }}>{totalMatchesCount}</div>
                <div className="sb-stat-l">Matches</div>
              </div>
              <div className="sb-stat">
                <div className="sb-stat-v" style={{ color: "var(--accent-gold)" }}>{iccEventsCount}</div>
                <div className="sb-stat-l">ICC Events</div>
              </div>
            </div>
          </div>
        </div>

        {/* Month Density Timeline */}
        <div className="month-timeline">
          <div className="mt-hdr">
            <span className="mt-title">
              {currentYear} · Match density by month {selectedMonth !== null ? "(Filtered)" : ""}
            </span>
            <div className="mt-legend">
              <span className="mt-l"><span className="mt-ld" style={{ background: "var(--accent-blue)" }}></span>Intl</span>
              <span className="mt-l"><span className="mt-ld" style={{ background: "var(--accent-green)" }}></span>T20</span>
              <span className="mt-l"><span className="mt-ld" style={{ background: "var(--accent-gold)" }}></span>ICC</span>
            </div>
          </div>
          <div className="months-row">
            {monthsData.map((m, idx) => {
              const h1 = m.intl > 0 ? Math.max(3, Math.round((m.intl / maxMonthTotal) * 26)) : 0;
              const h2 = m.t20 > 0 ? Math.max(3, Math.round((m.t20 / maxMonthTotal) * 26)) : 0;
              const h3 = m.icc > 0 ? 3 : 0;
              const isActive = selectedMonth === idx;

              return (
                <div
                  key={idx}
                  className={`month-cell ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedMonth(prev => prev === idx ? null : idx)}
                >
                  {m.trophy && <span className="mc-trophy">{m.trophy}</span>}
                  <div className="mc-name">{m.monthName}</div>
                  <div className="mc-bars">
                    {h1 > 0 && <div className="mc-bar" style={{ height: `${h1}px`, background: "var(--accent-blue)", width: "4px" }} />}
                    {h2 > 0 && <div className="mc-bar" style={{ height: `${h2}px`, background: "var(--accent-green)", width: "4px" }} />}
                    {h3 > 0 && <div className="mc-bar" style={{ height: `${h3}px`, background: "var(--accent-gold)", width: "4px" }} />}
                  </div>
                  <div className="mc-count">{m.total}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Workspace Display based on View Toggle */}
        <div className="series-section">
          {viewType === "list" && (
            <>
              <div className="ss-hdr">
                <div className="ss-lbl">
                  {parsed.team || parsed.team1 || parsed.team2 ? "Matches Found" : "Series Archive"}{" "}
                  <span className="ss-count">
                    {parsed.team || parsed.team1 || parsed.team2 ? filteredMatches.length : sortedSeries.length}
                  </span>
                </div>
              </div>
              <div id="series-list">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton-series" style={{ height: 48, background: "var(--bg-card-hover)", marginBottom: 4, borderRadius: 8, opacity: 0.5 }} />
                  ))
                ) : (parsed.team || parsed.team1 || parsed.team2) ? (
                  /* Render Flat Matches List directly */
                  <div className="v2-series-card expanded">
                    <div className="sc-matches" style={{ display: "block" }}>
                      <div className="sm-hdr">
                        <span className="sm-hdr-c">Fmt / Stage</span>
                        <span className="sm-hdr-c">Match</span>
                        <span className="sm-hdr-c">Venue</span>
                        <span className="sm-hdr-c">Result</span>
                        <span className="sm-hdr-c" style={{ textAlign: "right" }}>Date</span>
                      </div>
                      {filteredMatches.length === 0 ? (
                        <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 11 }}>
                          No matches found.
                        </div>
                      ) : (
                        filteredMatches.map((m) => {
                          const isT1Win = m.winner === m.team1;
                          const isT2Win = m.winner === m.team2;
                          const wLower = m.winner?.toLowerCase() || "";
                          const isTie = wLower === "tie";
                          const isDraw = wLower === "draw";
                          const isNR = !m.winner || wLower === "no result";
                          const isKo = isKnockout(m.match_stage);
                          const mBadgeClass = 
                            classifyType(m.competition, m.format) === "intl" ? "sc-intl" :
                            classifyType(m.competition, m.format) === "ipl" ? "sc-ipl" :
                            classifyType(m.competition, m.format) === "franchise" ? "sc-franchise" :
                            classifyType(m.competition, m.format) === "wc" ? "sc-wc" : "sc-domestic";
                          
                          let resultClass = "";
                          let resultText = "";
                          if (isNR) {
                            resultText = "No result";
                          } else if (isTie) {
                            resultText = "Match Tied";
                            resultClass = "draw";
                          } else if (isDraw) {
                            resultText = "Match Drawn";
                            resultClass = "draw";
                          } else {
                            resultText = `${m.winner} won ${m.win_margin ? `(${m.win_margin})` : ""}`;
                            resultClass = isT1Win ? "win" : "loss";
                          }

                          return (
                            <Link
                              href={`/match/${m.match_id}`}
                              key={m.match_id}
                              className={`match-row ${isKo ? "knockout" : ""}`}
                            >
                              <span className={`mr-fmt sc-badge ${isKo ? "mr-ko-badge" : mBadgeClass}`}>
                                {isKo ? m.match_stage : fmtLabel(m.format)}
                              </span>
                              <div className="mr-teams flex items-center gap-1.5">
                                <TeamLogo teamName={m.team1} size={12} showFallbackText={false} />
                                <span>{m.team1}</span>
                                <span className="text-[9px] text-muted mx-0.5">vs</span>
                                <TeamLogo teamName={m.team2} size={12} showFallbackText={false} />
                                <span>{m.team2}</span>
                              </div>
                              <div className="mr-venue">{m.venue ? m.venue.split(",")[0] : ""}</div>
                              <div className={`mr-result ${resultClass}`}>{resultText}</div>
                              <div className="mr-date">{fmtDate(m.date)}</div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : sortedSeries.length === 0 ? (
                  <div className="no-results" style={{ padding: "40px 20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                    No series found for {currentYear} with the current filter settings.
                  </div>
                ) : (
                  sortedSeries.map((s, idx) => (
                    <SeriesCard
                      key={`${s.competition}-${idx}`}
                      series={s}
                      isOpen={expandedSeries === s.competition}
                      onToggle={() => handleToggleSeries(s.competition ?? "")}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {viewType === "timeline" && (
            <>
              <div className="ss-hdr">
                <div className="ss-lbl">Match Chronological Timeline <span className="ss-count">{filteredMatches.length}</span></div>
              </div>
              {loading ? (
                <div className="text-center py-10 text-muted font-mono">Loading matches timeline…</div>
              ) : filteredMatches.length === 0 ? (
                <div className="no-results text-center py-10 text-muted">No matches to display in timeline.</div>
              ) : (
                <div className="relative pl-6 border-l border-glass-border space-y-4 my-4 ml-4">
                  {[...filteredMatches]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(m => (
                      <Link 
                        href={`/match/${m.match_id}`} 
                        key={m.match_id} 
                        className="block p-3.5 bg-card border border-glass-border rounded-xl hover:border-accent-green transition-all relative"
                      >
                        <span className="absolute -left-[32px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-glass-border bg-background flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                        </span>
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-glass-border bg-surface text-muted uppercase">
                              {fmtLabel(m.format)}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <TeamLogo teamName={m.team1} size={12} showFallbackText={false} />
                              <span>{m.team1}</span>
                              <span className="text-[9px] text-muted">vs</span>
                              <TeamLogo teamName={m.team2} size={12} showFallbackText={false} />
                              <span>{m.team2}</span>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-muted">{fmtDate(m.date)}</div>
                        </div>
                        <div className="mt-2 text-xs font-medium text-accent-green flex justify-between items-center">
                          <span>{m.winner ? `${m.winner} won` : "No result"} {m.win_margin ? `(${m.win_margin})` : ""}</span>
                          <span className="text-[10px] text-muted font-normal">{m.venue ? m.venue.split(",")[0] : ""}</span>
                        </div>
                      </Link>
                    ))
                  }
                </div>
              )}
            </>
          )}

          {viewType === "calendar" && (
            <>
              <div className="ss-hdr">
                <div className="ss-lbl">Monthly Calendar Breakdown</div>
              </div>
              {loading ? (
                <div className="text-center py-10 text-muted font-mono">Loading calendar…</div>
              ) : (
                <div className="space-y-6 my-4">
                  {Array.from({ length: 12 }, (_, i) => {
                    if (selectedMonth !== null && selectedMonth !== i) return null;
                    const monthMatches = filteredMatches.filter(m => new Date(m.date).getMonth() === i);
                    if (monthMatches.length === 0) return null;
                    const monthName = new Date(2025, i, 1).toLocaleDateString("en-US", { month: "long" });
                    return (
                      <div key={i} className="p-4 bg-card border border-glass-border rounded-xl">
                        <h3 className="font-mono text-xs font-bold text-accent-green uppercase tracking-wider border-b border-glass-border pb-2 mb-3">
                          {monthName} ({monthMatches.length} Matches)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {monthMatches.map(m => (
                            <Link 
                              href={`/match/${m.match_id}`} 
                              key={m.match_id} 
                              className="p-3 bg-surface border border-glass-border rounded-lg hover:border-accent-green transition-all flex justify-between items-center"
                            >
                              <div>
                                <div className="flex items-center gap-1.5 text-xs font-semibold">
                                  <TeamLogo teamName={m.team1} size={12} showFallbackText={false} />
                                  <span>{m.team1}</span>
                                  <span className="text-[9px] text-muted">vs</span>
                                  <TeamLogo teamName={m.team2} size={12} showFallbackText={false} />
                                  <span>{m.team2}</span>
                                </div>
                                <div className="text-[10px] text-accent-green mt-1">
                                  {m.winner ? `${m.winner} won` : "No result"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[9px] font-mono text-muted">{fmtDate(m.date)}</div>
                                <div className="text-[8px] font-mono text-muted mt-1 uppercase">{fmtLabel(m.format)}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL (DASHBOARD WIDGETS) ─────────────────── */}
      <div className="matches-right-panel hidden xl:flex w-[200px]">
        {/* Format Breakdown */}
        <div className="rp-section">
          <div className="rp-title">{currentYear} Format Breakdown</div>
          <div className="fmt-bars">
            {[
              { label: "Tests", count: formatCounts.test, color: "var(--accent-gold)" },
              { label: "ODIs", count: formatCounts.odi, color: "var(--accent-blue)" },
              { label: "T20Is", count: formatCounts.t20i, color: "var(--accent-purple)" },
              { label: "IPL", count: formatCounts.ipl, color: "var(--accent-green)" },
              { label: "Other", count: formatCounts.other, color: "var(--text-muted)" }
            ].map(f => {
              const widthPct = (f.count / maxFormatCount) * 100;
              return (
                <div key={f.label} className="fmt-bar-row">
                  <span className="fbr-lbl">{f.label}</span>
                  <div className="fbr-track">
                    <div className="fbr-fill" style={{ width: `${widthPct}%`, background: f.color }} />
                  </div>
                  <span className="fbr-val">{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="rp-section">
          <div className="rp-title">Quick Stats · {currentYear}</div>
          <div className="quick-stat-row">
            <span className="qs-label">Total matches</span>
            <span className="qs-val green">{totalMatchesCount}</span>
          </div>
          <div className="quick-stat-row">
            <span className="qs-label">Total series</span>
            <span className="qs-val">{totalSeriesCount}</span>
          </div>
          <div className="quick-stat-row">
            <span className="qs-label">ICC events</span>
            <span className="qs-val gold">{iccEventsCount}</span>
          </div>
          <div className="quick-stat-row">
            <span className="qs-label">Teams involved</span>
            <span className="qs-val blue">{uniqueTeamsCount}</span>
          </div>
          <div className="quick-stat-row">
            <span className="qs-label">Host locations</span>
            <span className="qs-val">{uniqueHostsCount}</span>
          </div>
          <div className="quick-stat-row">
            <span className="qs-label">Bilateral series</span>
            <span className="qs-val">{bilateralCount}</span>
          </div>
        </div>

        {/* Historic Champions */}
        <div className="rp-section">
          <div className="rp-title">🏆 Champions Timeline</div>
          {championsForYear.length === 0 ? (
            <div className="text-[10px] text-muted py-2">No championship events recorded for {currentYear}</div>
          ) : (
            championsForYear.map((c, idx) => (
              <div key={idx} className="champ-card">
                <div className="cc-top">
                  <span className="cc-icon">{c.icon}</span>
                  <div>
                    <span className="cc-year">{c.year}</span>
                    <div className="cc-tournament">{c.tournament}</div>
                    <div className="cc-winner">{c.winner}</div>
                  </div>
                </div>
                <div className="cc-result">{c.result}</div>
              </div>
            ))
          )}
        </div>

        {/* Most Followed */}
        <div className="rp-section">
          <div className="rp-title">Popular Series · {currentYear}</div>
          {topFollowed.length === 0 ? (
            <div className="text-[10px] text-muted py-2">No series recorded</div>
          ) : (
            topFollowed.map(item => (
              <div key={item.num} className="psl-item">
                <span className="psl-num">{item.num}</span>
                <span className="psl-name">{item.name}</span>
                <span className="psl-count">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function MatchesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
          Matches
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Explore matches timeline, calendars, and series statistics
        </p>
      </div>
      <Suspense fallback={
        <div style={{ height: 400, background: "var(--bg-base)", borderRadius: 16, border: "1px solid var(--glass-border)" }} />
      }>
        <MatchesPageInner />
      </Suspense>
    </div>
  );
}
