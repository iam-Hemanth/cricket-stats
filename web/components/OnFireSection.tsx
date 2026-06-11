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

export default function OnFireSection({ highlights }: OnFireSectionProps) {
  const [activeTab, setActiveTab] = useState<'ipl' | 'big_leagues' | 'intl'>('ipl');

  const batters = 
    activeTab === 'ipl' 
      ? highlights.on_fire_ipl_batting 
      : activeTab === 'big_leagues' 
      ? highlights.on_fire_big_leagues_batting 
      : highlights.on_fire_international_batting;

  const bowlers = 
    activeTab === 'ipl' 
      ? highlights.on_fire_ipl_bowling 
      : activeTab === 'big_leagues' 
      ? highlights.on_fire_big_leagues_bowling 
      : highlights.on_fire_international_bowling;

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
