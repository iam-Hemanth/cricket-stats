'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { HomepageHighlights } from '@/lib/api';

interface OnFireSectionProps {
  highlights: HomepageHighlights;
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function computeAverage(runs: number, dismissals: number): string {
  if (dismissals === 0) return runs > 0 ? `${runs}*` : '—';
  return (runs / dismissals).toFixed(1);
}

function computeOvers(balls: number): string {
  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;
  return `${overs}.${remainingBalls}`;
}

const defaultBatters = {
  ipl: [
    { player_id: "ba607b88", player_name: "Virat Kohli", competition: "Indian Premier League", recent_matches: 15, recent_runs: 741, balls_faced: 480, dismissals: 12, recent_sr: 154.4 },
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "Indian Premier League", recent_matches: 15, recent_runs: 567, balls_faced: 296, dismissals: 14, recent_sr: 191.6 },
    { player_id: "3e5a2893", player_name: "Heinrich Klaasen", competition: "Indian Premier League", recent_matches: 16, recent_runs: 479, balls_faced: 280, dismissals: 12, recent_sr: 171.1 },
    { player_id: "d412be81", player_name: "Sunil Narine", competition: "Indian Premier League", recent_matches: 15, recent_runs: 488, balls_faced: 270, dismissals: 14, recent_sr: 180.7 }
  ],
  big_leagues: [
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "Major League Cricket", recent_matches: 8, recent_runs: 336, balls_faced: 194, dismissals: 7, recent_sr: 173.2 },
    { player_id: "3e5a2893", player_name: "Heinrich Klaasen", competition: "SA20", recent_matches: 12, recent_runs: 447, balls_faced: 216, dismissals: 10, recent_sr: 206.9 },
    { player_id: "31d6837e", player_name: "Nicholas Pooran", competition: "Major League Cricket", recent_matches: 9, recent_runs: 388, balls_faced: 245, dismissals: 6, recent_sr: 158.4 }
  ],
  intl: [
    { player_id: "71af762d", player_name: "Rohit Sharma", competition: "ICC Men's T20 World Cup", recent_matches: 8, recent_runs: 257, balls_faced: 164, dismissals: 7, recent_sr: 156.7 },
    { player_id: "e4029eb1", player_name: "Travis Head", competition: "ICC Men's T20 World Cup", recent_matches: 7, recent_runs: 255, balls_faced: 161, dismissals: 6, recent_sr: 158.4 },
    { player_id: "31d6837e", player_name: "Nicholas Pooran", competition: "ICC Men's T20 World Cup", recent_matches: 7, recent_runs: 228, balls_faced: 156, dismissals: 6, recent_sr: 146.2 }
  ]
};

const defaultBowlers = {
  ipl: [
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "Indian Premier League", recent_matches: 13, balls_bowled: 312, runs_conceded: 337, wickets: 20, recent_economy: 6.48 },
    { player_id: "244048f6", player_name: "Arshdeep Singh", competition: "Indian Premier League", recent_matches: 14, balls_bowled: 302, runs_conceded: 505, wickets: 19, recent_economy: 10.03 },
    { player_id: "d412be81", player_name: "Sunil Narine", competition: "Indian Premier League", recent_matches: 15, balls_bowled: 360, runs_conceded: 402, wickets: 17, recent_economy: 6.70 }
  ],
  big_leagues: [
    { player_id: "49b4cc5d", player_name: "Rashid Khan", competition: "SA20", recent_matches: 10, balls_bowled: 240, runs_conceded: 260, wickets: 16, recent_economy: 6.50 },
    { player_id: "3235b2e9", player_name: "Trent Boult", competition: "Major League Cricket", recent_matches: 8, balls_bowled: 192, runs_conceded: 224, wickets: 13, recent_economy: 7.00 }
  ],
  intl: [
    { player_id: "244048f6", player_name: "Arshdeep Singh", competition: "ICC Men's T20 World Cup", recent_matches: 8, balls_bowled: 180, runs_conceded: 215, wickets: 17, recent_economy: 7.17 },
    { player_id: "01cf3b61", player_name: "Jasprit Bumrah", competition: "ICC Men's T20 World Cup", recent_matches: 8, balls_bowled: 178, runs_conceded: 124, wickets: 15, recent_economy: 4.18 }
  ]
};

export default function OnFireSection({ highlights }: OnFireSectionProps) {
  const [activeTab, setActiveTab] = useState<'ipl' | 'big_leagues' | 'intl'>('ipl');

  const rawBatters = 
    activeTab === 'ipl' 
      ? highlights.on_fire_ipl_batting 
      : activeTab === 'big_leagues' 
      ? highlights.on_fire_big_leagues_batting 
      : highlights.on_fire_international_batting;

  const rawBowlers = 
    activeTab === 'ipl' 
      ? highlights.on_fire_ipl_bowling 
      : activeTab === 'big_leagues' 
      ? highlights.on_fire_big_leagues_bowling 
      : highlights.on_fire_international_bowling;

  const batters = (rawBatters && rawBatters.length > 0) ? rawBatters : defaultBatters[activeTab];
  const bowlers = (rawBowlers && rawBowlers.length > 0) ? rawBowlers : defaultBowlers[activeTab];

  return (
    <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
      <div className="sec-hdr-v2">
        <span className="sec-num-v2">03</span>
        <h2 className="sec-title-v2">🔥 On Fire Right Now</h2>
        <div className="sec-hr-v2"></div>
        <span className="sec-tag-v2">Top performers · last 90 days</span>
      </div>

      <div className="fire-tabs-v2">
        <span 
          className={`ftab-v2 ${activeTab === 'ipl' ? 'on' : ''}`}
          onClick={() => setActiveTab('ipl')}
        >
          IPL
        </span>
        <span 
          className={`ftab-v2 ${activeTab === 'big_leagues' ? 'on' : ''}`}
          onClick={() => setActiveTab('big_leagues')}
        >
          Big Leagues
        </span>
        <span 
          className={`ftab-v2 ${activeTab === 'intl' ? 'on' : ''}`}
          onClick={() => setActiveTab('intl')}
        >
          International
        </span>
      </div>

      <div className="fsec-l-v2">BATTERS</div>
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
                    {player.competition || 'T20 League'}
                  </div>
                </div>
              </div>
              <div className="pstats-v2">
                <div className="ps-v2">
                  <div className="psv-v2 g">{player.recent_runs}</div>
                  <div className="psl-v2">Runs</div>
                </div>
                <div className="ps-v2">
                  <div className="psv-v2 gold">{computeAverage(player.recent_runs, player.dismissals)}</div>
                  <div className="psl-v2">Avg</div>
                </div>
                <div className="ps-v2">
                  <div className="psv-v2 g">{player.recent_sr ? player.recent_sr.toFixed(1) : '—'}</div>
                  <div className="psl-v2">SR</div>
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

      <div className="fsec-l-v2">BOWLERS</div>
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
                    {player.competition || 'T20 League'}
                  </div>
                </div>
              </div>
              <div className="pstats-v2">
                <div className="ps-v2">
                  <div className="psv-v2 g">{player.wickets}</div>
                  <div className="psl-v2">Wickets</div>
                </div>
                <div className="ps-v2">
                  <div className="psv-v2 gold">{player.recent_economy ? player.recent_economy.toFixed(2) : '—'}</div>
                  <div className="psl-v2">Economy</div>
                </div>
                <div className="ps-v2">
                  <div className="psv-v2 g">{computeOvers(player.balls_bowled)}</div>
                  <div className="psl-v2">Overs</div>
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
    </section>
  );
}
