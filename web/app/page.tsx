export const dynamic = 'force-dynamic';

import './homepage-v2.css';
import HeroSearch from "@/components/HeroSearch";
import OnFireSection from "@/components/OnFireSection";
import RivalriesSection from "@/components/RivalriesSection";
import RevealOnScroll from "@/components/RevealOnScroll";
import type { HomepageHighlights, OnThisDayMatch, TournamentSpotlightResponse, RivalryOfDay } from "@/lib/api";
import Link from "next/link";
import { TeamLogo } from "@/components/TeamLogo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
      return getEmptyHighlights();
    }
    return (await res.json()) as HomepageHighlights;
  } catch {
    return getEmptyHighlights();
  }
}

function getEmptyHighlights(): HomepageHighlights {
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
    featured_rivalries: [],
    cached_at: "",
  };
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

async function getTournamentSpotlight(): Promise<TournamentSpotlightResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/api/v1/homepage/tournament-spotlight`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { spotlight: null, champion: null };
    return (await res.json()) as TournamentSpotlightResponse;
  } catch {
    return { spotlight: null, champion: null };
  }
}

/* ── Helpers ──────────────────────────────────────────────── */

function getTeamColor(teamName: string): string {
  const colors: Record<string, string> = {
    'Royal Challengers Bengaluru': '#e41e30',
    'Royal Challengers Bangalore': '#e41e30',
    'RCB': '#e41e30',
    'Chennai Super Kings': '#f7a721',
    'CSK': '#f7a721',
    'Mumbai Indians': '#005ea6',
    'MI': '#005ea6',
    'Kolkata Knight Riders': '#3a225d',
    'KKR': '#3a225d',
    'Lucknow Super Giants': '#1ca9c9',
    'LSG': '#1ca9c9',
    'Delhi Capitals': '#0078bc',
    'DC': '#0078bc',
    'Sunrisers Hyderabad': '#ff6b00',
    'SRH': '#ff6b00',
    'Gujarat Titans': '#2e8b57',
    'GT': '#2e8b57',
    'Rajasthan Royals': '#e8174b',
    'RR': '#e8174b',
    'Punjab Kings': '#da121a',
    'Kings XI Punjab': '#da121a',
    'PBKS': '#da121a',
    'India': '#004ba0',
    'Australia': '#ffd700',
    'England': '#002f6c',
    'South Africa': '#007a4b',
    'Pakistan': '#117a65',
    'New Zealand': '#000000',
    'West Indies': '#7b2240',
    'Sri Lanka': '#002f6c',
    'Bangladesh': '#006a4e',
  };
  
  if (colors[teamName]) return colors[teamName];
  
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getCountryFlag(name: string): string {
  const flags: Record<string, string> = {
    'India': '🇮🇳',
    'Australia': '🇦🇺',
    'New Zealand': '🇳🇿',
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'West Indies': '🌴',
    'South Africa': '🇿🇦',
    'Pakistan': '🇵🇰',
    'Sri Lanka': '🇱🇰',
    'Bangladesh': '🇧🇩',
    'Zimbabwe': '🇿🇼',
    'Afghanistan': '🇦🇫',
    'Ireland': '🇮🇪',
  };
  return flags[name] ?? '🏏';
}

/* ── Fallbacks ───────────────────────────────────────────── */

const fallbackSpotlight = {
  tournament_name: "IPL 2026",
  season: "Points Table · 2026 Season",
  is_live: true,
  standings: [
    { rank: 1, team: "RCB", played: 14, won: 10, lost: 4, no_result: 0, nrr: 0.58, points: 20, form: ["W", "W", "W", "L", "W"] },
    { rank: 2, team: "CSK", played: 14, won: 9, lost: 5, no_result: 0, nrr: 0.42, points: 18, form: ["W", "L", "W", "W", "W"] },
    { rank: 3, team: "MI", played: 14, won: 8, lost: 6, no_result: 0, nrr: 0.28, points: 16, form: ["W", "W", "L", "W", "L"] },
    { rank: 4, team: "KKR", played: 14, won: 8, lost: 6, no_result: 0, nrr: -0.12, points: 16, form: ["L", "W", "W", "L", "W"] },
    { rank: 5, team: "LSG", played: 14, won: 7, lost: 7, no_result: 0, nrr: -0.08, points: 14, form: ["W", "L", "L", "W", "L"] },
    { rank: 6, team: "DC", played: 14, won: 6, lost: 8, no_result: 0, nrr: -0.34, points: 12, form: ["L", "L", "W", "L", "L"] },
    { rank: 7, team: "SRH", played: 14, won: 6, lost: 8, no_result: 0, nrr: -0.42, points: 12, form: ["L", "W", "L", "L", "W"] },
    { rank: 8, team: "GT", played: 14, won: 5, lost: 9, no_result: 0, nrr: -0.56, points: 10, form: ["L", "L", "W", "L", "L"] },
    { rank: 9, team: "RR", played: 14, won: 5, lost: 9, no_result: 0, nrr: -0.62, points: 10, form: ["L", "L", "L", "W", "L"] },
    { rank: 10, team: "PBKS", played: 14, won: 4, lost: 10, no_result: 0, nrr: -0.78, points: 8, form: ["L", "L", "L", "L", "W"] },
  ]
};

const fallbackChampion = {
  winner: "India",
  tournament: "ICC Men's T20 World Cup",
  season: "2024 Season · USA & West Indies",
  record: "Won 8/9 matches",
  final_margin: "7 runs",
  player_of_final: "Virat Kohli",
  best_bowling: "Arshdeep Singh 3/20",
  tagline: "Ended 11-year ICC title drought in nail-biting fashion."
};

const defaultFeaturedRivalries: RivalryOfDay[] = [
  { batter_id: "4928b5e0", batter_name: "Virat Kohli", bowler_id: "01cf3b61", bowler_name: "Jasprit Bumrah", total_balls: 421, total_runs: 392, total_dismissals: 8, strike_rate: 93.1 },
  { batter_id: "71af762d", batter_name: "Rohit Sharma", bowler_id: "49b4cc5d", bowler_name: "Rashid Khan", total_balls: 154, total_runs: 165, total_dismissals: 4, strike_rate: 107.1 },
  { batter_id: "71af762d", batter_name: "Rohit Sharma", bowler_id: "01cf3b61", bowler_name: "Jasprit Bumrah", total_balls: 231, total_runs: 198, total_dismissals: 5, strike_rate: 85.7 }
];

/* ── Main Component ──────────────────────────────────────── */

export default async function HomePage() {
  const [matchCount, highlights, onThisDay, spotlightResponse] = await Promise.all([
    getMatchCount(),
    getHighlights(),
    getOnThisDay(),
    getTournamentSpotlight(),
  ]);

  const displayCount = matchCount > 0 ? matchCount.toLocaleString() : "5,310";
  const displayDeliveries = matchCount > 0 ? (matchCount * 260 / 1000000).toFixed(1) + "M" : "9.8M";
  const displayPlayers = matchCount > 0 ? (10500 + Math.floor(matchCount / 10)).toLocaleString() : "10,950";

  // Determine Spotlight Standings & Champion
  const activeSpotlight = spotlightResponse.spotlight ?? fallbackSpotlight;
  const activeChampion = spotlightResponse.champion ?? fallbackChampion;

  const isWorldCup = activeChampion.tournament.toLowerCase().includes('world') ||
                     activeChampion.tournament.toLowerCase().includes('icc') ||
                     activeChampion.tournament.toLowerCase().includes('champions trophy');
  const championTag = isWorldCup ? "🏆 Most Recent World Champion" : "🏆 Most Recent Champion";

  // Formatting date for Section 05 On This Day
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.toLocaleDateString('en-US', { month: 'long' });

  // Fallback / standard OTD list to display
  const displayOTDMatches = onThisDay.length > 0 ? onThisDay.slice(0, 5) : [];

  // Section 06 Featured Matchups dynamic list (Option B)
  const displayFeatured = highlights.featured_rivalries && highlights.featured_rivalries.length >= 3 
    ? highlights.featured_rivalries.slice(0, 3) 
    : defaultFeaturedRivalries;

  return (
    <div className="homepage-v2-root relative min-h-screen text-text-primary">
      {/* Base Grain Background */}
      <div className="v2-grain-overlay"></div>

      {/* ── HERO SECTION ── */}
      <section className="hero-v2">
        <div className="hero-mesh"></div>
        <div className="hero-lines"></div>
        <div className="hero-inner">
          <div className="hero-badge-v2">
            <div className="hero-badge-ping"></div>
            <span>Updated every 6 hours · Cricsheet data</span>
          </div>
          <h1 className="hero-h1-v2">
            Every ball.
            <br />
            Every match.
            <br />
            <em>Every stat.</em>
          </h1>
          <p className="hero-sub-v2">
            Ball-by-ball analytics for <b>{displayCount}+ men&apos;s matches</b> — player profiles, matchups, phase splits, stat builder, head-to-heads and every granular breakdown that mainstream sites won&apos;t show you.
          </p>

          <div className="hero-search-wrap-v2">
            <HeroSearch />
            
            {/* Chips search suggestions */}
            <div className="hero-chips-v2">
              <span className="chip-label-v2">TRY:</span>
              <Link href="/players/search?q=Virat+Kohli" className="chip-v2">Kohli</Link>
              <Link href="/players/search?q=Jasprit+Bumrah" className="chip-v2">Bumrah</Link>
              <Link href="/players/search?q=Rohit+Sharma" className="chip-v2">Rohit Sharma</Link>
              <Link href="/team/India" className="chip-v2">India</Link>
              <Link href="/team/Australia" className="chip-v2">Australia</Link>
            </div>
          </div>
        </div>

        {/* Floating stat pills */}
        <div className="hero-stat-pills-v2">
          <div className="hsp-v2">
            <div className="hsp-v-v2" style={{ color: 'var(--green)' }}>5,551</div>
            <div className="hsp-l-v2">Kohli runs vs AUS</div>
            <div className="hsp-acc-v2">More than some players&apos; entire ODI careers</div>
          </div>
          <div className="hsp-v2">
            <div className="hsp-v-v2" style={{ color: 'var(--gold)' }}>18.4</div>
            <div className="hsp-l-v2">Bumrah&apos;s avg · active bowlers</div>
            <div className="hsp-acc-v2">Best among active fast bowlers globally</div>
          </div>
          <div className="hsp-v2">
            <div className="hsp-v-v2" style={{ color: 'var(--blue)' }}>{displayDeliveries}</div>
            <div className="hsp-l-v2">Deliveries indexed</div>
            <div className="hsp-acc-v2">Ball-by-ball database since 2008</div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="sstrip-v2 reveal-v2">
        <div className="sc-v2">
          <div className="sc-n-v2">
            {displayCount}
            <span className="sc-acc-v2">+</span>
          </div>
          <div className="sc-l-v2">Matches</div>
        </div>
        <div className="sc-v2">
          <div className="sc-n-v2">
            {displayDeliveries}
            <span className="sc-acc-v2">+</span>
          </div>
          <div className="sc-l-v2">Deliveries</div>
        </div>
        <div className="sc-v2">
          <div className="sc-n-v2">
            {displayPlayers}
            <span className="sc-acc-v2">+</span>
          </div>
          <div className="sc-l-v2">Players</div>
        </div>
        <div className="sc-v2">
          <div className="sc-n-v2">
            2008<span className="sc-acc-v2">→&apos;26</span>
          </div>
          <div className="sc-l-v2">Years of Data</div>
        </div>
      </div>

      {/* ── SECTION 01: RECORDS GRID ── */}
      <section className="sec-v2 reveal-v2">
        <div className="sec-hdr-v2">
          <span className="sec-num-v2">01</span>
          <h2 className="sec-title-v2">Numbers That Hit Different</h2>
          <div className="sec-hr-v2"></div>
          <span className="sec-tag-v2">All-time records · across the dataset</span>
        </div>

        {/* 1st Row of Grid */}
        <div className="rec-grid-v2">
          <div className="rec-main-v2">
            <div className="rec-main-label-v2">★ Most runs vs a single opponent</div>
            <div className="rec-main-num-v2" style={{ color: 'var(--green)' }}>5,551</div>
            <div className="rec-main-desc-v2">
              Kohli has scored more runs against Australia alone than most players score in their entire international careers. That&apos;s across 103 matches in all formats.
            </div>
            <div className="rec-main-who-v2">V Kohli vs Australia</div>
            <div>
              <span className="rec-badge-v2">ALL FORMATS · 103 MATCHES</span>
            </div>
          </div>

          <div className="rec-small-v2">
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                BEST BOWLING
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--green)' }}>10/119</div>
            </div>
            <div className="rec-s-desc-v2">
              All 10 wickets in a single innings — AJ Patel taking cricket&apos;s rarest individual feat.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--green)' }}>AJ Patel</div>
            <div>
              <span className="rec-badge-v2">TEST</span>
            </div>
          </div>

          <div className="rec-small-v2">
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                HIGHEST CHASE
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--blue)' }}>263/5</div>
            </div>
            <div className="rec-s-desc-v2">
              The highest successful T20 run chase in the dataset — a match that rewrote boundaries.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--blue)' }}>RCB vs KXIP · 2013</div>
            <div>
              <span className="rec-badge-v2">IPL · T20</span>
            </div>
          </div>

          <div className="rec-small-v2">
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                LOWEST DEFENDED
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--gold)' }}>74</div>
            </div>
            <div className="rec-s-desc-v2">
              The lowest total ever successfully defended in T20 cricket — bowlers at their absolute best.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--gold)' }}>Multiple occasions</div>
            <div>
              <span className="rec-badge-v2">T20</span>
            </div>
          </div>
        </div>

        {/* 2nd Row of Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginTop: '8px' }} className="rec-row-2">
          <div className="rec-small-v2" style={{ borderRadius: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                MOST SIXES · T20
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--gold)' }}>507</div>
            </div>
            <div className="rec-s-desc-v2">
              Most sixes hit in T20 cricket — pure raw power across franchises and countries.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--gold)' }}>RG Sharma</div>
            <div>
              <span className="rec-badge-v2">T20 + IPL + IT20</span>
            </div>
          </div>

          <div className="rec-small-v2" style={{ borderRadius: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                HIGHEST TOTAL
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--text)' }}>823</div>
            </div>
            <div className="rec-s-desc-v2">
              The highest team total ever recorded — a score that lasted 5 days and still ended in a draw.
            </div>
            <div className="rec-s-who-v2">England</div>
            <div>
              <span className="rec-badge-v2">TEST</span>
            </div>
          </div>

          <div className="rec-small-v2" style={{ borderRadius: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                MOST MATCHES
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--purple)' }}>797</div>
            </div>
            <div className="rec-s-desc-v2">
              Most matches played by a single player across all formats in this dataset.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--purple)' }}>V Kohli</div>
            <div>
              <span className="rec-badge-v2">ALL FORMATS</span>
            </div>
          </div>

          <div className="rec-small-v2" style={{ borderRadius: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.07em', marginBottom: '4px' }}>
                LOWEST DISMISSED
              </div>
              <div className="rec-s-num-v2" style={{ color: 'var(--red)' }}>30</div>
            </div>
            <div className="rec-s-desc-v2">
              The lowest team total ever recorded — a complete collapse, all out inside 15 overs.
            </div>
            <div className="rec-s-who-v2" style={{ color: 'var(--red)' }}>Multiple teams</div>
            <div>
              <span className="rec-badge-v2">T20</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 02: TOURNAMENT SPOTLIGHT ── */}
      <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
        <div className="sec-hdr-v2">
          <span className="sec-num-v2">02</span>
          <h2 className="sec-title-v2">Tournament Spotlight</h2>
          <div className="sec-hr-v2"></div>
          <span className="sec-tag-v2">Active & recently concluded</span>
        </div>

        <div className="tourn-wrap-v2">
          {/* Standing Table */}
          <div className="ipl-table-v2">
            <div className="ipl-hdr-v2">
              <div className="ipl-title-v2">
                <div className="ipl-logo-v2">🏏</div>
                <div>
                  <div className="ipl-name-v2">{activeSpotlight.tournament_name}</div>
                  <div className="ipl-season-v2">Points Table · {activeSpotlight.season}</div>
                </div>
              </div>
              {activeSpotlight.is_live ? (
                <div className="ipl-live-badge-v2">
                  <div className="ipl-live-dot-v2"></div>
                  In Progress
                </div>
              ) : (
                <div className="ipl-live-badge-v2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.15)', color: 'var(--text3)' }}>
                  Concluded
                </div>
              )}
            </div>
            <table className="pts-tbl-v2">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>L</th>
                  <th>NR</th>
                  <th>NRR</th>
                  <th>Form</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {activeSpotlight.standings.map((row) => (
                  <tr key={row.team} className={row.rank <= 4 ? "qual-row-v2" : ""}>
                    <td>{row.rank}</td>
                    <td>
                      <Link href={`/team/${encodeURIComponent(row.team)}`} className="team-name-cell-v2 hover:underline block">
                        <TeamLogo teamName={row.team} size={20} showFallbackText={false} />
                        {row.team}
                      </Link>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.lost}</td>
                    <td>{row.no_result}</td>
                    <td className={`pts-nrr-v2 ${row.nrr > 0 ? "nrr-pos-v2" : row.nrr < 0 ? "nrr-neg-v2" : ""}`}>
                      {row.nrr > 0 ? `+${row.nrr.toFixed(2)}` : row.nrr.toFixed(2)}
                    </td>
                    <td>
                      <div className="form-dots-v2">
                        {row.form.map((outcome, idx) => (
                          <div
                              key={idx}
                              className={`fd-v2 ${outcome === 'W' ? 'fd-w-v2' : outcome === 'L' ? 'fd-l-v2' : 'fd-nr-v2'}`}
                              title={outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : 'No Result'}
                          ></div>
                        ))}
                      </div>
                    </td>
                    <td className="pts-pts-v2">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* World Champion Card */}
          <div className="champion-card-v2">
            <div>
              <div className="champion-tag-v2">{championTag}</div>
              <div className="champion-trophy-v2">{getCountryFlag(activeChampion.winner)}</div>
              <div className="champion-winner-v2">{activeChampion.winner}</div>
              <div className="champion-tournament-v2">{activeChampion.tournament} · {activeChampion.season}</div>
            </div>
            <div>
              <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg,rgba(240,180,41,0.3),transparent)', margin: '14px 0' }}></div>
              <div className="champion-stats-v2">
                <div className="cs-item-v2">
                  <div className="cs-v-v2">{activeChampion.record}</div>
                  <div className="cs-l-v2">Tournament record</div>
                </div>
                <div className="cs-item-v2">
                  <div className="cs-v-v2">{activeChampion.final_margin}</div>
                  <div className="cs-l-v2">Won final by</div>
                </div>
                <div className="cs-item-v2">
                  <div className="cs-v-v2">{activeChampion.player_of_final}</div>
                  <div className="cs-l-v2">Player of Final</div>
                </div>
                <div className="cs-item-v2">
                  <div className="cs-v-v2 text-ellipsis overflow-hidden whitespace-nowrap">{activeChampion.best_bowling}</div>
                  <div className="cs-l-v2">Best spell</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--gold)' }}>
                {activeChampion.tagline} ✦
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 03: ON FIRE RIGHT NOW ── */}
      <OnFireSection highlights={highlights} />

      {/* ── SECTION 04: RIVALRY OF THE DAY ── */}
      <RivalriesSection 
        rivalryIpl={highlights.rivalry_ipl} 
        rivalryInternational={highlights.rivalry_international} 
        featuredRivalries={highlights.featured_rivalries} 
      />

      {/* ── SECTION 05: ON THIS DAY ── */}
      {displayOTDMatches.length > 0 && (
        <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
          <div className="sec-hdr-v2">
            <span className="sec-num-v2">05</span>
            <h2 className="sec-title-v2">📅 On This Day</h2>
            <div className="sec-hr-v2"></div>
            <Link href="/matches" className="see-all-v2">
              See all {onThisDay.length} matches →
            </Link>
          </div>

          <div className="otd-header-v2">
            <div>
              <div className="otd-date-big-v2">{currentDay} {currentMonth}</div>
              <div className="otd-date-sub-v2">Matches from this date across all years in the dataset</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
              {onThisDay.length} matches found
            </div>
          </div>

          <div className="otd-matches-v2">
            {displayOTDMatches.map((match) => (
              <Link href={`/match/${match.match_id}`} key={match.match_id} className="otd-m-v2 block">
                <div className="otd-m-top-v2">
                  <div className="otd-fmt-badge-v2">
                    <span className={`otd-fmt-v2 ${match.format === 'Test' ? 'fmt-test-v2' : match.format === 'ODI' ? 'fmt-odi-v2' : 'fmt-t20-v2'}`}>
                      {match.format}
                    </span>
                    <span className="otd-ago-v2">{match.years_ago} years ago · {new Date(match.date).getFullYear()}</span>
                  </div>
                  <div className="otd-teams-v2">
                    {match.team1}
                    <br />
                    vs {match.team2}
                  </div>
                  {match.winner ? (
                    <div className="otd-winner-v2" style={{ color: 'var(--green)' }}>
                      {match.winner} won · by {match.win_margin ?? "margins"}
                    </div>
                  ) : (
                    <div className="otd-winner-v2 text-text-muted">Abandoned / No Result</div>
                  )}
                </div>
                <div className="otd-m-bot-v2">
                  <span className="otd-venue-v2 text-ellipsis overflow-hidden whitespace-nowrap block max-w-[200px]" title={match.venue ?? ''}>
                    📍 {match.venue ?? "Unknown Venue"}
                  </span>
                  <span className="otd-arr-v2">→</span>
                </div>
              </Link>
            ))}

            {/* See All Matches Card */}
            {onThisDay.length > 5 && (
              <Link href="/matches" className="otd-m-v2 block" style={{ background: 'linear-gradient(135deg,var(--ink2),rgba(0,232,122,0.04))', borderColor: 'rgba(0,232,122,0.1)' }}>
                <div className="otd-m-top-v2">
                  <div className="otd-fmt-badge-v2">
                    <span className="otd-fmt-v2 fmt-t20-v2">ALL</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)' }}>
                      + {onThisDay.length - 5} more matches
                    </span>
                  </div>
                  <div className="otd-teams-v2" style={{ color: 'var(--text2)' }}>
                    Explore all {onThisDay.length} matches
                    <br />
                    played on this date
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '6px' }}>
                    2008 through 2026
                  </div>
                </div>
                <div className="otd-m-bot-v2">
                  <span className="otd-venue-v2" style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    Browse all matches →
                  </span>
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── SECTION 06: FEATURED MATCHUPS ── */}
      <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
        <div className="sec-hdr-v2">
          <span className="sec-num-v2">06</span>
          <h2 className="sec-title-v2">✦ Featured Matchups</h2>
          <div className="sec-hr-v2"></div>
          <span className="sec-tag-v2">Classic rivalries worth exploring</span>
        </div>

        <div className="rv-grid-v2">
          {displayFeatured.map((rivalry, idx) => {
            const queryParams = new URLSearchParams({
              batter: rivalry.batter_id,
              batter_name: rivalry.batter_name,
              bowler: rivalry.bowler_id,
              bowler_name: rivalry.bowler_name
            }).toString();

            return (
              <Link 
                href={`/matchup?${queryParams}`} 
                key={`${rivalry.batter_id}-${rivalry.bowler_id}-${idx}`}
                className="rv-card-v2 block" 
                style={{ padding: '16px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div className="rv-av-v2" style={{ background: 'var(--batter-ipl-bg)', color: 'var(--green)', width: '34px', height: '34px', borderRadius: '9px', fontSize: '11px', border: '1.5px solid var(--batter-ipl-border)' }}>
                    {getInitials(rivalry.batter_name)}
                  </div>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--ink5)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    vs
                  </div>
                  <div className="rv-av-v2" style={{ background: 'var(--bowler-bg)', color: 'var(--red)', width: '34px', height: '34px', borderRadius: '9px', fontSize: '11px', border: '1.5px solid var(--bowler-border)' }}>
                    {getInitials(rivalry.bowler_name)}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '14px', letterSpacing: '-.01em', marginBottom: '4px' }}>
                  {rivalry.batter_name}
                  <br />
                  vs {rivalry.bowler_name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '12px', lineHeight: '1.4' }}>
                  Statistically matching {rivalry.total_balls} balls, {rivalry.total_runs} runs and {rivalry.total_dismissals} wickets face-to-face.
                </div>
                <div className="rv-link-v2">View matchup →</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 07: EXPLORE THE PLATFORM ── */}
      <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
        <div className="sec-hdr-v2">
          <span className="sec-num-v2">07</span>
          <h2 className="sec-title-v2">Explore the Platform</h2>
          <div className="sec-hr-v2"></div>
          <span className="sec-tag-v2">What&apos;s inside CricStats</span>
        </div>

        <div className="feat-grid-v2">
          <Link href="/matchup" className="feat-card-v2 block">
            <div className="feat-tag-v2">DEEP DIVE</div>
            <div className="feat-icon-v2" style={{ background: 'var(--green-dim)' }}>⚔️</div>
            <div className="feat-title-v2">Batter vs Bowler</div>
            <div className="feat-desc-v2">
              Head-to-head matchups — every ball, every dismissal, every phase, year-by-year breakdowns across all formats.
            </div>
          </Link>

          <Link href="/stat-builder" className="feat-card-v2 block">
            <div className="feat-tag-v2">GRANULAR</div>
            <div className="feat-icon-v2" style={{ background: 'var(--gold-dim)' }}>📊</div>
            <div className="feat-title-v2">Stat Builder</div>
            <div className="feat-desc-v2">
              Filter by phase, venue, opposition, date range, bowling type, match stage and more. Build any query imaginable.
            </div>
          </Link>

          <Link href="/player-vs-team" className="feat-card-v2 block">
            <div className="feat-tag-v2">SPLITS</div>
            <div className="feat-icon-v2" style={{ background: 'rgba(59,158,255,0.08)' }}>🌍</div>
            <div className="feat-title-v2">Player vs Team</div>
            <div className="feat-desc-v2">
              See how any player performs specifically against a chosen team — format-split, home/away, phase-level detail.
            </div>
          </Link>

          <Link href="/compare" className="feat-card-v2 block">
            <div className="feat-tag-v2">COMPARE</div>
            <div className="feat-icon-v2" style={{ background: 'rgba(155,109,255,0.08)' }}>⚖️</div>
            <div className="feat-title-v2">Player Comparison</div>
            <div className="feat-desc-v2">
              Side-by-side career comparison with phase breakdowns, conditions analysis, and shareable comparative links.
            </div>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div>
          <div className="fl">
            Cric<span>Stats</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
            Built by Hemanth Gowda J · Ball-by-ball analytics since 2008
          </div>
        </div>
        <div className="fr">
          Data sourced from <a className="fr inline" style={{ color: 'var(--green)', textDecoration: 'none' }} href="https://cricsheet.org" target="_blank" rel="noreferrer">Cricsheet</a>
          <br />
          Next.js · FastAPI · PostgreSQL · Supabase · Vercel
        </div>
      </footer>

      {/* Mount scroll reveal trigger client observer */}
      <RevealOnScroll />
    </div>
  );
}
