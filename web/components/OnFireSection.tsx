'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { HomepageHighlights, OnFirePlayer, OnFireBowler } from '@/lib/api';

interface OnFireSectionProps {
  highlights: HomepageHighlights;
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function computeAverage(runs: number, dismissals: number, fallbackAvg?: number | null): string {
  if (fallbackAvg !== undefined && fallbackAvg !== null) return fallbackAvg.toFixed(1);
  if (dismissals === 0) return runs > 0 ? `${runs}*` : '—';
  return (runs / dismissals).toFixed(1);
}

function computeOvers(balls: number): string {
  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;
  return `${overs}.${remainingBalls}`;
}

const defaultBatters: Record<string, OnFirePlayer[]> = {
  ipl: [
    { player_id: "ba607b88", player_name: "Virat Kohli", competition: "Indian Premier League", recent_matches: 15, recent_runs: 741, balls_faced: 480, dismissals: 12, recent_sr: 154.4, average: 61.8, fifties: 5, hundreds: 1 },
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "Indian Premier League", recent_matches: 15, recent_runs: 567, balls_faced: 296, dismissals: 14, recent_sr: 191.6, average: 40.5, fifties: 4, hundreds: 1 },
    { player_id: "3e5a2893", player_name: "Heinrich Klaasen", competition: "Indian Premier League", recent_matches: 16, recent_runs: 479, balls_faced: 280, dismissals: 12, recent_sr: 171.1, average: 39.9, fifties: 4, hundreds: 0 },
    { player_id: "d412be81", player_name: "Sunil Narine", competition: "Indian Premier League", recent_matches: 15, recent_runs: 488, balls_faced: 270, dismissals: 14, recent_sr: 180.7, average: 34.9, fifties: 3, hundreds: 1 }
  ],
  big_leagues: [
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "Major League Cricket", recent_matches: 8, recent_runs: 336, balls_faced: 194, dismissals: 7, recent_sr: 173.2, average: 48.0, fifties: 3, hundreds: 0 },
    { player_id: "3e5a2893", player_name: "Heinrich Klaasen", competition: "SA20", recent_matches: 12, recent_runs: 447, balls_faced: 216, dismissals: 10, recent_sr: 206.9, average: 44.7, fifties: 4, hundreds: 0 },
    { player_id: "31d6837e", player_name: "Nicholas Pooran", competition: "Major League Cricket", recent_matches: 9, recent_runs: 388, balls_faced: 245, dismissals: 6, recent_sr: 158.4, average: 64.7, fifties: 3, hundreds: 1 }
  ],
  t20i: [
    { player_id: "71af762d", player_name: "Rohit Sharma", competition: "ICC Men's T20 World Cup", recent_matches: 8, recent_runs: 257, balls_faced: 164, dismissals: 7, recent_sr: 156.7, average: 36.7, fifties: 3, hundreds: 0 },
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "ICC Men's T20 World Cup", recent_matches: 7, recent_runs: 255, balls_faced: 161, dismissals: 6, recent_sr: 158.4, average: 42.5, fifties: 2, hundreds: 0 },
    { player_id: "31d6837e", player_name: "Nicholas Pooran", competition: "ICC Men's T20 World Cup", recent_matches: 7, recent_runs: 228, balls_faced: 156, dismissals: 6, recent_sr: 146.2, average: 38.0, fifties: 1, hundreds: 0 },
    { player_id: "ba607b88", player_name: "Virat Kohli", competition: "ICC Men's T20 World Cup", recent_matches: 8, recent_runs: 151, balls_faced: 134, dismissals: 8, recent_sr: 112.7, average: 18.9, fifties: 1, hundreds: 0 }
  ],
  odi: [
    { player_id: "ba607b88", player_name: "Virat Kohli", competition: "ICC Cricket World Cup", recent_matches: 11, recent_runs: 765, balls_faced: 847, dismissals: 8, recent_sr: 90.3, average: 95.6, fifties: 6, hundreds: 3, highest_score: 117 },
    { player_id: "71af762d", player_name: "Rohit Sharma", competition: "ICC Cricket World Cup", recent_matches: 11, recent_runs: 597, balls_faced: 474, dismissals: 11, recent_sr: 125.9, average: 54.3, fifties: 3, hundreds: 1, highest_score: 131 },
    { player_id: "46700c0f", player_name: "Quinton de Kock", competition: "ICC Cricket World Cup", recent_matches: 10, recent_runs: 594, balls_faced: 555, dismissals: 10, recent_sr: 107.0, average: 59.4, fifties: 0, hundreds: 4, highest_score: 174 },
    { player_id: "48c8b4fb", player_name: "Rachin Ravindra", competition: "ICC Cricket World Cup", recent_matches: 10, recent_runs: 578, balls_faced: 543, dismissals: 9, recent_sr: 106.4, average: 64.2, fifties: 2, hundreds: 3, highest_score: 123 }
  ],
  test: [
    { player_id: "43bf4201", player_name: "Yashasvi Jaiswal", competition: "World Test Championship", recent_matches: 8, recent_runs: 712, balls_faced: 1030, dismissals: 8, recent_sr: 69.1, average: 89.0, fifties: 3, hundreds: 2, highest_score: 214 },
    { player_id: "ba607b88", player_name: "Virat Kohli", competition: "World Test Championship", recent_matches: 6, recent_runs: 520, balls_faced: 890, dismissals: 9, recent_sr: 58.4, average: 57.8, fifties: 2, hundreds: 2, highest_score: 121 },
    { player_id: "08479e0a", player_name: "Joe Root", competition: "World Test Championship", recent_matches: 8, recent_runs: 656, balls_faced: 1010, dismissals: 10, recent_sr: 65.0, average: 65.6, fifties: 2, hundreds: 3, highest_score: 143 },
    { player_id: "71af762d", player_name: "Rohit Sharma", competition: "World Test Championship", recent_matches: 6, recent_runs: 452, balls_faced: 720, dismissals: 8, recent_sr: 62.8, average: 56.5, fifties: 2, hundreds: 2, highest_score: 131 }
  ]
};

const defaultBowlers: Record<string, OnFireBowler[]> = {
  ipl: [
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "Indian Premier League", recent_matches: 13, balls_bowled: 312, runs_conceded: 337, wickets: 20, recent_economy: 6.48, bowling_average: 16.85, five_w: 1 },
    { player_id: "244048f6", player_name: "Arshdeep Singh", competition: "Indian Premier League", recent_matches: 14, balls_bowled: 302, runs_conceded: 505, wickets: 19, recent_economy: 10.03, bowling_average: 26.58, five_w: 0 },
    { player_id: "d412be81", player_name: "Sunil Narine", competition: "Indian Premier League", recent_matches: 15, balls_bowled: 360, runs_conceded: 402, wickets: 17, recent_economy: 6.70, bowling_average: 23.65, five_w: 0 }
  ],
  big_leagues: [
    { player_id: "49b4cc5d", player_name: "Rashid Khan", competition: "SA20", recent_matches: 10, balls_bowled: 240, runs_conceded: 260, wickets: 16, recent_economy: 6.50, bowling_average: 16.25, five_w: 0 },
    { player_id: "3235b2e9", player_name: "Trent Boult", competition: "Major League Cricket", recent_matches: 8, balls_bowled: 192, runs_conceded: 224, wickets: 13, recent_economy: 7.00, bowling_average: 17.23, five_w: 0 }
  ],
  t20i: [
    { player_id: "244048f6", player_name: "Arshdeep Singh", competition: "ICC Men's T20 World Cup", recent_matches: 8, balls_bowled: 180, runs_conceded: 215, wickets: 17, recent_economy: 7.17, bowling_average: 12.65, five_w: 0 },
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "ICC Men's T20 World Cup", recent_matches: 8, balls_bowled: 178, runs_conceded: 124, wickets: 15, recent_economy: 4.18, bowling_average: 8.27, five_w: 0 },
    { player_id: "6ab088b2", player_name: "Fazalhaq Farooqi", competition: "ICC Men's T20 World Cup", recent_matches: 8, balls_bowled: 152, runs_conceded: 160, wickets: 17, recent_economy: 6.31, bowling_average: 9.41, five_w: 1 }
  ],
  odi: [
    { player_id: "42a35368", player_name: "Mohammed Shami", competition: "ICC Cricket World Cup", recent_matches: 7, balls_bowled: 293, runs_conceded: 257, wickets: 24, recent_economy: 5.26, bowling_average: 10.70, five_w: 3 },
    { player_id: "47f5a9e1", player_name: "Adam Zampa", competition: "ICC Cricket World Cup", recent_matches: 11, balls_bowled: 576, runs_conceded: 515, wickets: 23, recent_economy: 5.35, bowling_average: 22.39, five_w: 0 },
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "ICC Cricket World Cup", recent_matches: 11, balls_bowled: 551, runs_conceded: 373, wickets: 20, recent_economy: 4.06, bowling_average: 18.65, five_w: 0 }
  ],
  test: [
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "World Test Championship", recent_matches: 7, balls_bowled: 840, runs_conceded: 474, wickets: 32, recent_economy: 3.38, bowling_average: 14.81, five_w: 2 },
    { player_id: "2781b0a5", player_name: "Ravichandran Ashwin", competition: "World Test Championship", recent_matches: 6, balls_bowled: 810, runs_conceded: 645, wickets: 26, recent_economy: 4.77, bowling_average: 24.80, five_w: 2 },
    { player_id: "01b2a95e", player_name: "Pat Cummins", competition: "World Test Championship", recent_matches: 7, balls_bowled: 890, runs_conceded: 575, wickets: 27, recent_economy: 3.87, bowling_average: 21.29, five_w: 1 }
  ]
};

export default function OnFireSection({ highlights }: OnFireSectionProps) {
  const [activeCategory, setActiveCategory] = useState<'ipl' | 'big_leagues' | 'intl'>('ipl');
  const [intlFormat, setIntlFormat] = useState<'t20i' | 'odi' | 'test'>('t20i');

  const activeKey = activeCategory === 'intl' ? intlFormat : activeCategory;

  const rawBatters = 
    activeKey === 'ipl' 
      ? highlights.on_fire_ipl_batting 
      : activeKey === 'big_leagues' 
      ? highlights.on_fire_big_leagues_batting 
      : activeKey === 't20i'
      ? (highlights.on_fire_t20i_batting?.length ? highlights.on_fire_t20i_batting : highlights.on_fire_international_batting)
      : activeKey === 'odi'
      ? highlights.on_fire_odi_batting
      : highlights.on_fire_test_batting;

  const rawBowlers = 
    activeKey === 'ipl' 
      ? highlights.on_fire_ipl_bowling 
      : activeKey === 'big_leagues' 
      ? highlights.on_fire_big_leagues_bowling 
      : activeKey === 't20i'
      ? (highlights.on_fire_t20i_bowling?.length ? highlights.on_fire_t20i_bowling : highlights.on_fire_international_bowling)
      : activeKey === 'odi'
      ? highlights.on_fire_odi_bowling
      : highlights.on_fire_test_bowling;

  const batters = (rawBatters && rawBatters.length > 0) ? rawBatters : (defaultBatters[activeKey] || []);
  const bowlers = (rawBowlers && rawBowlers.length > 0) ? rawBowlers : (defaultBowlers[activeKey] || []);

  const isOdiOrTest = activeKey === 'odi' || activeKey === 'test';
  const isTest = activeKey === 'test';

  return (
    <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
      <div className="sec-hdr-v2">
        <span className="sec-num-v2">03</span>
        <h2 className="sec-title-v2">🔥 On Fire Right Now</h2>
        <div className="sec-hr-v2"></div>
        <span className="sec-tag-v2">
          {activeKey === 'test' ? 'Top Test performers' : activeKey === 'odi' ? 'Top ODI performers' : 'Top T20 performers'} · recent seasons
        </span>
      </div>

      {/* Primary Category Tabs */}
      <div className="fire-tabs-v2" style={{ marginBottom: activeCategory === 'intl' ? '10px' : '16px' }}>
        <button 
          type="button"
          className={`ftab-v2 ${activeCategory === 'ipl' ? 'on' : ''}`}
          onClick={() => setActiveCategory('ipl')}
        >
          IPL
        </button>
        <button 
          type="button"
          className={`ftab-v2 ${activeCategory === 'big_leagues' ? 'on' : ''}`}
          onClick={() => setActiveCategory('big_leagues')}
        >
          Big Leagues
        </button>
        <button 
          type="button"
          className={`ftab-v2 ${activeCategory === 'intl' ? 'on' : ''}`}
          onClick={() => setActiveCategory('intl')}
        >
          International
        </button>
      </div>

      {/* Sub-format Pills for International */}
      {activeCategory === 'intl' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: '4px' }}>
            FORMAT:
          </span>
          {(['t20i', 'odi', 'test'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setIntlFormat(fmt)}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '9.5px',
                padding: '3px 12px',
                borderRadius: '6px',
                border: intlFormat === fmt ? '1px solid rgba(0, 232, 122, 0.4)' : '1px solid var(--border)',
                background: intlFormat === fmt ? 'var(--green-dim)' : 'var(--ink3)',
                color: intlFormat === fmt ? 'var(--green)' : 'var(--text3)',
                cursor: 'pointer',
                transition: 'all .12s',
                textTransform: 'uppercase',
                letterSpacing: '.04em'
              }}
            >
              {fmt === 't20i' ? 'T20I' : fmt === 'odi' ? 'ODI' : 'Test'}
            </button>
          ))}
        </div>
      )}

      {/* ── BATTERS ROW ── */}
      <div className="fsec-l-v2">
        {activeKey === 'test' ? 'BATTERS · RUNS & CENTURIES' : activeKey === 'odi' ? 'BATTERS · RUNS & AVERAGE' : 'BATTERS · RUNS & STRIKE RATE'}
      </div>
      <div className="hscroll-v2" style={{ marginBottom: '14px' }}>
        {batters.length === 0 ? (
          <div className="text-text-muted py-4 text-xs font-mono">No active player data for this filter.</div>
        ) : (
          batters.slice(0, 8).map((player) => (
            <Link 
              href={`/players/${player.player_id}`} 
              key={player.player_id} 
              className="pcard-v2"
            >
              <div className="pcard-top-v2">
                <div className="pav-v2 pav-batter">
                  {getInitials(player.player_name)}
                </div>
                <div>
                  <div className="pn-v2 text-ellipsis overflow-hidden whitespace-nowrap max-w-[105px]">
                    {player.player_name}
                  </div>
                  <div className="pt-v2 text-ellipsis overflow-hidden whitespace-nowrap max-w-[105px]">
                    {player.competition || (activeKey === 'test' ? 'Test Series' : activeKey === 'odi' ? 'ODI Series' : 'T20 Match')}
                  </div>
                </div>
              </div>
              <div className="pstats-v2">
                <div className="ps-v2">
                  <div className="psv-v2 g">{player.recent_runs}</div>
                  <div className="psl-v2">Runs</div>
                </div>
                <div className="ps-v2">
                  <div className="psv-v2 gold">{computeAverage(player.recent_runs, player.dismissals, player.average)}</div>
                  <div className="psl-v2">Avg</div>
                </div>
                <div className="ps-v2">
                  {isOdiOrTest ? (
                    <>
                      <div className="psv-v2 g">
                        {player.hundreds || 0}<span style={{ color: 'var(--text3)', fontSize: '10px' }}>/</span>{player.fifties || 0}
                      </div>
                      <div className="psl-v2">100s/50s</div>
                    </>
                  ) : (
                    <>
                      <div className="psv-v2 g">{player.recent_sr ? player.recent_sr.toFixed(1) : '—'}</div>
                      <div className="psl-v2">SR</div>
                    </>
                  )}
                </div>
                <div className="ps-v2">
                  <div className="psv-v2">{player.recent_matches}</div>
                  <div className="psl-v2">Matches</div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* ── BOWLERS ROW ── */}
      <div className="fsec-l-v2">
        {isTest ? 'BOWLERS · WICKETS & 5-WKT HAULS' : activeKey === 'odi' ? 'BOWLERS · WICKETS & AVERAGE' : 'BOWLERS · WICKETS & ECONOMY'}
      </div>
      <div className="hscroll-v2">
        {bowlers.length === 0 ? (
          <div className="text-text-muted py-4 text-xs font-mono">No active bowler data for this filter.</div>
        ) : (
          bowlers.slice(0, 8).map((player) => (
            <Link 
              href={`/players/${player.player_id}`} 
              key={player.player_id} 
              className="pcard-v2"
            >
              <div className="pcard-top-v2">
                <div className="pav-v2 pav-bowler">
                  {getInitials(player.player_name)}
                </div>
                <div>
                  <div className="pn-v2 text-ellipsis overflow-hidden whitespace-nowrap max-w-[105px]">
                    {player.player_name}
                  </div>
                  <div className="pt-v2 text-ellipsis overflow-hidden whitespace-nowrap max-w-[105px]">
                    {player.competition || (activeKey === 'test' ? 'Test Series' : activeKey === 'odi' ? 'ODI Series' : 'T20 Match')}
                  </div>
                </div>
              </div>
              <div className="pstats-v2">
                <div className="ps-v2">
                  <div className="psv-v2 g">{player.wickets}</div>
                  <div className="psl-v2">Wickets</div>
                </div>

                {isTest ? (
                  <>
                    <div className="ps-v2">
                      <div className="psv-v2 gold">{player.five_w || 0}</div>
                      <div className="psl-v2">5W Hauls</div>
                    </div>
                    <div className="ps-v2">
                      <div className="psv-v2 g">{player.bowling_average ? player.bowling_average.toFixed(1) : (player.recent_economy ? player.recent_economy.toFixed(1) : '—')}</div>
                      <div className="psl-v2">Avg</div>
                    </div>
                  </>
                ) : activeKey === 'odi' ? (
                  <>
                    <div className="ps-v2">
                      <div className="psv-v2 gold">{player.bowling_average ? player.bowling_average.toFixed(1) : (player.recent_economy ? player.recent_economy.toFixed(1) : '—')}</div>
                      <div className="psl-v2">Avg</div>
                    </div>
                    <div className="ps-v2">
                      <div className="psv-v2 g">{player.recent_economy ? player.recent_economy.toFixed(2) : '—'}</div>
                      <div className="psl-v2">Econ</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ps-v2">
                      <div className="psv-v2 gold">{player.recent_economy ? player.recent_economy.toFixed(2) : '—'}</div>
                      <div className="psl-v2">Economy</div>
                    </div>
                    <div className="ps-v2">
                      <div className="psv-v2 g">{computeOvers(player.balls_bowled)}</div>
                      <div className="psl-v2">Overs</div>
                    </div>
                  </>
                )}

                <div className="ps-v2">
                  <div className="psv-v2">{player.recent_matches}</div>
                  <div className="psl-v2">Matches</div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

