'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { RivalryOfDay } from '@/lib/api';

interface RivalriesSectionProps {
  rivalryIpl: RivalryOfDay | null;
  rivalryInternational: RivalryOfDay | null;
  featuredRivalries: RivalryOfDay[];
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const defaultRivalries: RivalryOfDay[] = [
  { batter_id: "ba607b88", batter_name: "Virat Kohli", bowler_id: "244048f6", bowler_name: "Arshdeep Singh", total_balls: 52, total_runs: 78, total_dismissals: 2, strike_rate: 150.0 },
  { batter_id: "ba607b88", batter_name: "Virat Kohli", bowler_id: "01cf3b61", bowler_name: "Jasprit Bumrah", total_balls: 92, total_runs: 140, total_dismissals: 4, strike_rate: 152.2 },
  { batter_id: "71af762d", batter_name: "Rohit Sharma", bowler_id: "01cf3b61", bowler_name: "Jasprit Bumrah", total_balls: 85, total_runs: 112, total_dismissals: 3, strike_rate: 131.8 }
];

export default function RivalriesSection({
  rivalryIpl,
  rivalryInternational,
  featuredRivalries
}: RivalriesSectionProps) {
  const [activeTab, setActiveTab] = useState<'ipl' | 'intl'>('ipl');

  // We need 3 cards to show in the grid
  let displayRivalries: RivalryOfDay[] = [];

  const candidatePool = [...(featuredRivalries || []), ...defaultRivalries];

  if (activeTab === 'ipl') {
    if (rivalryIpl) displayRivalries.push(rivalryIpl);
    candidatePool.forEach((r) => {
      if (displayRivalries.length < 3 && !displayRivalries.some(d => d.batter_id === r.batter_id && d.bowler_id === r.bowler_id)) {
        displayRivalries.push(r);
      }
    });
  } else {
    if (rivalryInternational) displayRivalries.push(rivalryInternational);
    candidatePool.forEach((r) => {
      if (displayRivalries.length < 3 && !displayRivalries.some(d => d.batter_id === r.batter_id && d.bowler_id === r.bowler_id)) {
        displayRivalries.push(r);
      }
    });
  }

  while (displayRivalries.length < 3 && defaultRivalries.length > displayRivalries.length) {
    const nextFeat = defaultRivalries[displayRivalries.length];
    if (nextFeat && !displayRivalries.some(d => d.batter_id === nextFeat.batter_id && d.bowler_id === nextFeat.bowler_id)) {
      displayRivalries.push(nextFeat);
    }
  }

  return (
    <section className="sec-v2 reveal-v2" style={{ paddingTop: 0 }}>
      <div className="sec-hdr-v2">
        <span className="sec-num-v2">04</span>
        <h2 className="sec-title-v2">✕ Rivalry of the Day</h2>
        <div className="sec-hr-v2"></div>
        <div className="fire-tabs-v2" style={{ margin: 0 }}>
          <span 
            className={`ftab-v2 ${activeTab === 'ipl' ? 'on' : ''}`}
            style={{ margin: 0 }}
            onClick={() => setActiveTab('ipl')}
          >
            IPL
          </span>
          <span 
            className={`ftab-v2 ${activeTab === 'intl' ? 'on' : ''}`}
            style={{ margin: 0 }}
            onClick={() => setActiveTab('intl')}
          >
            International
          </span>
        </div>
      </div>

      <div className="rv-grid-v2">
        {displayRivalries.length === 0 ? (
          <div className="col-span-3 text-text-muted text-center py-8 font-mono text-xs border border-border rounded-xl bg-ink2">
            No daily rivalries computed for this category.
          </div>
        ) : (
          displayRivalries.map((rivalry, idx) => {
            const queryParams = new URLSearchParams({
              batter: rivalry.batter_id,
              batter_name: rivalry.batter_name,
              bowler: rivalry.bowler_id,
              bowler_name: rivalry.bowler_name
            }).toString();

            // Set different visual styles for cards to feel cohesive
            const batterBg = activeTab === 'ipl' ? 'var(--batter-ipl-bg)' : 'var(--batter-intl-bg)';
            const batterColor = activeTab === 'ipl' ? 'var(--green)' : 'var(--blue)';
            const bowlerBg = 'var(--bowler-bg)';
            const bowlerColor = 'var(--red)';
            const batterBorder = activeTab === 'ipl' ? 'var(--batter-ipl-border)' : 'var(--batter-intl-border)';
            const bowlerBorder = 'var(--bowler-border)';

            return (
              <Link 
                href={`/matchup?${queryParams}`}
                key={`${rivalry.batter_id}-vs-${rivalry.bowler_id}-${idx}`}
                className="rv-card-v2 block"
              >
                <div className="rv-players-v2">
                  <div className="rv-p-v2">
                    <div 
                      className="rv-av-v2" 
                      style={{ 
                        background: batterBg, 
                        color: batterColor,
                        border: `1.5px solid ${batterBorder}` 
                      }}
                    >
                      {getInitials(rivalry.batter_name)}
                    </div>
                    <div className="rv-name-v2 truncate max-w-[100px]">{rivalry.batter_name}</div>
                    <div className="rv-role-v2">BATTER</div>
                  </div>
                  <div className="rv-mid-v2">
                    <div className="rv-vs-b-v2">VS</div>
                  </div>
                  <div className="rv-p-v2 r">
                    <div 
                      className="rv-av-v2" 
                      style={{ 
                        background: bowlerBg, 
                        color: bowlerColor,
                        border: `1.5px solid ${bowlerBorder}`
                      }}
                    >
                      {getInitials(rivalry.bowler_name)}
                    </div>
                    <div className="rv-name-v2 truncate max-w-[100px]">{rivalry.bowler_name}</div>
                    <div className="rv-role-v2">BOWLER</div>
                  </div>
                </div>

                <div className="rv-nums-v2">
                  <div className="rvn-v2">
                    <div className="rvn-v-v2">{rivalry.total_balls}</div>
                    <div className="rvn-l-v2">Balls</div>
                  </div>
                  <div className="rvn-v2">
                    <div className="rvn-v-v2">{rivalry.total_runs}</div>
                    <div className="rvn-l-v2">Runs</div>
                  </div>
                  <div className="rvn-v2">
                    <div className="rvn-v-v2 r">{rivalry.total_dismissals}</div>
                    <div className="rvn-l-v2">Dismissed</div>
                  </div>
                  <div className="rvn-v2">
                    <div className="rvn-v-v2 g">{rivalry.strike_rate ? rivalry.strike_rate.toFixed(1) : '—'}</div>
                    <div className="rvn-l-v2">SR</div>
                  </div>
                </div>

                <div className="rv-link-v2">View full matchup →</div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
