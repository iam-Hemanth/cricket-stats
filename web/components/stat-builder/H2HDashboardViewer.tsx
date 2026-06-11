"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import type { StatBuilderH2HResponse, TeamSeasonRecord, TopBatterH2H, TopBowlerH2H, TeamRecentMatch } from "@/lib/api";

const C = {
  bg: "var(--bg-base)", surface: "var(--bg-surface)", card: "var(--bg-card)",
  border: "var(--glass-border)", text: "var(--text-primary)", muted: "var(--text-muted)",
  gold: "var(--accent-gold)", red: "var(--accent-red)", blue: "var(--accent-blue)",
};

import { getTeamIdentity } from "@/lib/teamIdentity";
import { TeamLogo } from "@/components/TeamLogo";

// TEAM_META and getTeamMeta logic migrated to web/lib/teamIdentity.ts

function formatDate(date: string): string {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const WinSplitDonut = ({ t1Wins, t2Wins, color1, color2, total }: { t1Wins: number; t2Wins: number; color1: string; color2: string; total: number }) => {
  const t1Pct = total > 0 ? (t1Wins / total) * 100 : 50;
  const radius = 15.915; // Makes circumference exactly 100
  
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 40 40" className="donut-svg">
        <circle cx="20" cy="20" r={radius} fill="transparent" stroke={color2} strokeWidth="6" opacity="0.15" />
        <circle cx="20" cy="20" r={radius} fill="transparent" stroke={color2} strokeWidth="6" />
        <circle 
          cx="20" cy="20" r={radius} fill="transparent" 
          stroke={color1} strokeWidth="6" 
          strokeDasharray={`${t1Pct} 100`} 
          transform="rotate(-90 20 20)"
        />
      </svg>
      <div className="donut-center">
        <div className="dc-val">{total}</div>
        <div className="dc-lbl">Matches</div>
      </div>
    </div>
  );
};

export default function H2HDashboardViewer({ data }: { data: StatBuilderH2HResponse }) {
  const { team1, team2 } = data;
  const meta1 = getTeamIdentity(team1);
  const meta2 = getTeamIdentity(team2);

  const color1 = meta1.primary;
  const color2 = (meta1.colorFamily && meta2.colorFamily && meta1.colorFamily === meta2.colorFamily) || (meta1.primary === meta2.primary) 
    ? meta2.secondary 
    : meta2.primary;
  const [visibleCount, setVisibleCount] = useState(20);

  const winPct = useMemo(() => {
    const totalWins = data.team1_wins + data.team2_wins;
    if (totalWins === 0) return { t1: 50, t2: 50 };
    const t1 = Math.round((data.team1_wins / totalWins) * 100);
    return { t1, t2: 100 - t1 };
  }, [data.team1_wins, data.team2_wins]);

  const yearGroups = useMemo(() => {
    const groups: Record<number, TeamRecentMatch[]> = {};
    data.recent_matches.slice(0, visibleCount).forEach(m => {
      const yr = new Date(m.date).getFullYear();
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(m);
    });
    return Object.entries(groups).map(([year, matches]) => ({
      year: parseInt(year),
      matches
    })).sort((a, b) => b.year - a.year);
  }, [data.recent_matches, visibleCount]);

  return (
    <div className="h2h-container">
      <style>{`
        .h2h-container { 
          display: flex; gap: 32px; padding: 24px; max-width: 1400px; margin: 0 auto; color: var(--text-primary); font-family: var(--font-inter); 
          --t1-color: ${color1};
          --t2-color: ${color2};
        }
        @media (max-width: 1200px) { .h2h-container { flex-direction: column; } }

        /* Timeline Styles - Dual Sided */
        .timeline-sidebar { width: 420px; flex-shrink: 0; position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 20px; }
        @media (max-width: 1200px) { .timeline-sidebar { width: 100%; order: 2; } }
        
        .timeline-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 40px; display: flex; align-items: center; gap: 10px; width: 100%; }
        .timeline-title::after { content: ''; flex: 1; height: 1px; background: var(--glass-border); }
        
        .timeline-main { position: relative; width: 100%; }
        .timeline-v-line { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--glass-border); transform: translateX(-50%); opacity: 0.5; }
        
        .year-section { position: relative; margin-bottom: 50px; z-index: 2; width: 100%; }
        .year-circle { width: 48px; height: 48px; border-radius: 50%; background: var(--bg-surface); border: 2px solid var(--glass-border); position: relative; left: 50%; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: var(--text-primary); box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 10; margin-bottom: 20px; }
        
        .match-pair { display: grid; grid-template-columns: 1fr 1fr; position: relative; min-height: 70px; align-items: center; width: 100%; margin-bottom: 16px; }
        
        .side-slot { position: relative; display: flex; align-items: center; width: 100%; height: 100%; }
        .side-slot.left { justify-content: flex-end; padding-right: 45px; }
        .side-slot.right { justify-content: flex-start; padding-left: 45px; }

        .timeline-card-wrap { width: 160px; position: relative; z-index: 5; }

        /* SVG Branching Lines */
        .branch-svg { position: absolute; top: 50%; width: 45px; height: 40px; transform: translateY(-50%); pointer-events: none; z-index: 1; }
        .side-slot.left .branch-svg { right: 0; }
        .side-slot.right .branch-svg { left: 0; }
        
        .match-card-sm { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px; font-size: 9px; position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; }
        .match-card-sm:hover { background: var(--bg-card); border-color: var(--text-muted); transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
        
        .mc-header { display: flex; justify-content: space-between; font-size: 7px; font-weight: 800; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .mc-title { font-weight: 800; line-height: 1.3; margin-bottom: 4px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mc-res { font-size: 9px; font-weight: 700; margin-top: 6px; border-top: 1px solid var(--glass-border); padding-top: 6px; display: flex; align-items: center; justify-content: space-between; }

        .match-card-sm.knockout {
          background: #2a2210 !important;
          background: linear-gradient(135deg, rgba(255, 185, 95, 0.15) 0%, rgba(255, 185, 95, 0.05) 100%) !important;
          border: 1px solid rgba(255, 185, 95, 0.5) !important;
          box-shadow: 0 4px 20px -5px rgba(255, 185, 95, 0.2);
        }
        .match-card-sm.knockout .mc-header span:first-child {
          color: #ffb95f !important;
          font-weight: 900;
        }
        .match-card-sm.knockout .mc-res {
          border-top-color: rgba(255, 185, 95, 0.2);
        }

        .match-card-sm.home-glow-t1 {
          border-left: 3px solid var(--t1-color) !important;
          box-shadow: -8px 0 20px -10px var(--t1-color);
        }
        .match-card-sm.home-glow-t2 {
          border-right: 3px solid var(--t2-color) !important;
          box-shadow: 8px 0 20px -10px var(--t2-color);
        }
        .match-card-sm.neutral-glow {
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          box-shadow: 0 4px 15px -4px rgba(255, 255, 255, 0.08);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01)) !important;
          transition: all 0.3s ease;
        }
        .match-card-sm.neutral-glow:hover {
          border-color: rgba(255, 255, 255, 0.25) !important;
          box-shadow: 0 4px 20px -2px rgba(255, 255, 255, 0.12);
        }

        .extend-circle-btn { 
          width: 56px; height: 56px; border-radius: 50%; 
          background: var(--bg-surface); border: 2px solid var(--glass-border); 
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
          margin: 40px 0; position: relative; z-index: 10;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .extend-circle-btn:hover { background: var(--bg-card); border-color: var(--text-primary); transform: scale(1.1); box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
        .ec-inner { font-size: 14px; font-weight: 900; color: var(--text-primary); line-height: 1; }
        .ec-lbl { font-size: 8px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-top: 2px; letter-spacing: 0.05em; }

        /* Main Dashboard Styles */
        .main-dash { flex: 1; min-width: 0; padding-left: 24px; border-left: 1px solid var(--glass-border); }
        @media (max-width: 1200px) { .main-dash { padding-left: 0; border-left: none; width: 100%; order: 1; margin-bottom: 40px; } }
        
        .hero { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 20px; padding: 32px; margin-bottom: 24px; position: relative; overflow: hidden; }
        .hero-teams { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px; }
        .team-blk { text-align: left; min-width: 140px; }
        .team-blk.r { text-align: right; }
        .t-abbr { font-size: 14px; font-weight: 800; letter-spacing: 0.2em; opacity: 0.8; margin-bottom: 8px; display: block; }
        .t-wins { font-size: 64px; font-weight: 900; line-height: 0.9; letter-spacing: -0.04em; }
        .t-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-top: 8px; font-weight: 700; }
        .mid-blk { text-align: center; flex: 1; }
        .mid-val { font-size: 36px; font-weight: 900; color: var(--text-primary); }
        .mid-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 700; }
        .mid-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
        
        .wbar { height: 8px; background: var(--glass-border); border-radius: 4px; overflow: hidden; display: flex; margin: 16px 0 8px; }
        .wbar-fill { height: 100%; }
        .wbar-meta { display: flex; justify-content: space-between; margin-top: 12px; font-size: 12px; font-weight: 800; }

        .card { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .card-t { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
        .card-t::after { content: ''; flex: 1; height: 1px; background: var(--glass-border); }
        .card-dot { width: 6px; height: 6px; border-radius: 50%; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        @media (max-width: 800px) { .grid-2 { grid-template-columns: 1fr; } }

        .charts-grid { display: grid; grid-template-columns: 180px 1fr; gap: 16px; margin-bottom: 24px; }
        @media (max-width: 800px) { .charts-grid { grid-template-columns: 1fr; } }

        .donut-wrap { position: relative; width: 140px; height: 140px; margin: 0 auto; }
        .donut-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .donut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
        .dc-val { font-size: 24px; font-weight: 900; color: var(--text-primary); line-height: 1; }
        .dc-lbl { font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }

        .p-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--glass-border); }
        .p-row:last-child { border-bottom: none; }
        .p-idx { font-size: 10px; font-weight: 800; color: var(--text-muted); width: 14px; }
        .p-info { flex: 1; }
        .p-name { font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
        .p-sub { font-size: 10px; color: var(--text-muted); font-weight: 600; }
        .p-val { text-align: right; }
        .p-v { font-size: 18px; font-weight: 900; color: var(--text-primary); line-height: 1; }
        .p-l { font-size: 8px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-top: 2px; font-weight: 800; }

        .tot-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--glass-border); }
        .tot-row:last-child { border-bottom: none; }
        .tot-info { flex: 1; }
        .tot-score { font-size: 15px; font-weight: 900; margin-bottom: 2px; }
        .tot-meta { font-size: 10px; color: var(--text-muted); }
        .tot-venue { font-size: 10px; color: var(--text-muted); text-align: right; max-width: 120px; line-height: 1.2; }

        .yby-wrap { display: flex; align-items: flex-end; gap: 6px; height: 100px; padding: 10px 0; overflow-x: auto; flex-direction: row-reverse; }
        .yby-grp { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; min-width: 32px; }
        .yby-bars { display: flex; gap: 3px; align-items: flex-end; height: 60px; }
        .yby-bar { width: 10px; border-radius: 2px 2px 0 0; min-height: 2px; }
        .yby-yr { font-size: 9px; font-weight: 700; color: var(--text-muted); }

        .ko-card { background: color-mix(in srgb, var(--accent-gold), transparent 95%); border: 1px solid color-mix(in srgb, var(--accent-gold), transparent 80%); border-radius: 16px; padding: 20px; margin-bottom: 24px; }
        .ko-pill { display: inline-block; font-size: 9px; font-weight: 800; color: var(--accent-gold); background: color-mix(in srgb, var(--accent-gold), transparent 90%); padding: 2px 8px; border-radius: 4px; letter-spacing: 0.1em; margin-bottom: 12px; }
        .ko-scores { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
        .ko-team { display: flex; flex-direction: column; gap: 4px; }
        .ko-tn { font-size: 11px; font-weight: 700; color: var(--text-muted); }
        .ko-ts { font-size: 20px; font-weight: 900; line-height: 1.2; }
        .ko-res { font-size: 13px; font-weight: 800; border-top: 1px solid color-mix(in srgb, var(--accent-gold), transparent 85%); padding-top: 10px; }
        .ko-meta { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
      `}</style>

      {/* ── LEFT SIDEBAR: Dual-Sided Vertical Timeline ── */}
      <div className="timeline-sidebar">
        <div className="timeline-title">Head-to-Head Timeline</div>
        <div className="timeline-main">
          <div className="timeline-v-line" />
          {yearGroups.map((group) => (
            <div key={group.year} className="year-section">
              <div className="year-circle">{group.year}</div>
              {group.matches.map((m, idx) => {
                const isLeft = idx % 2 === 0;
                const isOdd = idx % 2 === 0;
                const y1 = 20;
                const y2 = isOdd ? 10 : 30; // Alternating up/down bend
                
                const stage = (m.match_stage || "").toLowerCase();
                const isKnockout = stage && (
                  stage.includes("final") || 
                  stage.includes("semi") || 
                  stage.includes("qualifier") || 
                  stage.includes("eliminator") ||
                  stage.includes("play-off") ||
                  stage.includes("playoff") ||
                  stage.includes("challenger")
                );
                
                const isHomeT1 = !isKnockout && (
                  (m.match_country && meta1.homeCountry && m.match_country.toLowerCase().includes(meta1.homeCountry.toLowerCase())) ||
                  (m.city && meta1.homeCities?.some(hc => m.city?.toLowerCase().includes(hc.toLowerCase())))
                );
                const isHomeT2 = !isKnockout && (
                  (m.match_country && meta2.homeCountry && m.match_country.toLowerCase().includes(meta2.homeCountry.toLowerCase())) ||
                  (m.city && meta2.homeCities?.some(hc => m.city?.toLowerCase().includes(hc.toLowerCase())))
                );
                
                return (
                  <div key={m.match_id} className="match-pair">
                    <div className="side-slot left">
                      {isLeft && (
                        <>
                          <div className="timeline-card-wrap">
                            <Link href={`/match/${m.match_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                              <div 
                                className={`match-card-sm ${isKnockout ? 'knockout' : isHomeT1 ? 'home-glow-t1' : isHomeT2 ? 'home-glow-t2' : 'neutral-glow'}`}
                                style={{ '--t1-color': color1, '--t2-color': color2 } as any}
                              >
                                <div className="mc-header">
                                  <span>{isKnockout ? (m.match_stage || m.format_bucket) : m.format_bucket}</span>
                                  <span>{formatDate(m.date)}</span>
                                </div>
                                <div className="mc-title">{m.batting_first || team1} vs {m.bowling_first || team2}</div>
                                <div className="mc-res" style={{ color: m.winner === team1 ? color1 : m.winner === team2 ? color2 : C.muted }}>
                                  {m.winner === 'Tie' || m.winner === 'No Result' ? m.winner : `${m.winner} won`}
                                  <span style={{ 
                                    marginLeft: 6, 
                                    fontWeight: 900, 
                                    fontSize: 9, 
                                    color: isKnockout ? '#ffb95f' : 'var(--text-primary)',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em'
                                  }}>
                                    {m.win_by_runs ? `by ${m.win_by_runs}r` : m.win_by_wickets ? `by ${m.win_by_wickets}w` : ''}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </div>
                          <svg className="branch-svg" viewBox="0 0 45 40">
                            <path d={`M 45 20 H 35 L 15 ${y2} H 0`} fill="none" stroke="var(--glass-border)" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </>
                      )}
                    </div>
                    <div className="side-slot right">
                      {!isLeft && (
                        <>
                          <svg className="branch-svg" viewBox="0 0 45 40">
                            <path d={`M 0 20 H 10 L 30 ${y2} H 45`} fill="none" stroke="var(--glass-border)" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          <div className="timeline-card-wrap">
                            <Link href={`/match/${m.match_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                              <div 
                                className={`match-card-sm ${isKnockout ? 'knockout' : isHomeT1 ? 'home-glow-t1' : isHomeT2 ? 'home-glow-t2' : 'neutral-glow'}`}
                                style={{ '--t1-color': color1, '--t2-color': color2 } as any}
                              >
                                <div className="mc-header">
                                  <span>{isKnockout ? (m.match_stage || m.format_bucket) : m.format_bucket}</span>
                                  <span>{formatDate(m.date)}</span>
                                </div>
                                <div className="mc-title">{m.batting_first || team1} vs {m.bowling_first || team2}</div>
                                <div className="mc-res" style={{ color: m.winner === team1 ? color1 : m.winner === team2 ? color2 : C.muted }}>
                                  {m.winner === 'Tie' || m.winner === 'No Result' ? m.winner : `${m.winner} won`}
                                  <span style={{ 
                                    marginLeft: 6, 
                                    fontWeight: 900, 
                                    fontSize: 9, 
                                    color: isKnockout ? '#ffb95f' : 'var(--text-primary)',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em'
                                  }}>
                                    {m.win_by_runs ? `by ${m.win_by_runs}r` : m.win_by_wickets ? `by ${m.win_by_wickets}w` : ''}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {data.recent_matches.length > visibleCount && (
          <button className="extend-circle-btn" onClick={() => setVisibleCount(v => v + 20)}>
            <div className="ec-inner">+{Math.min(20, data.recent_matches.length - visibleCount)}</div>
            <span className="ec-lbl">More</span>
          </button>
        )}
      </div>

      {/* ── MAIN DASHBOARD ── */}
      <div className="main-dash">
        {/* 1. Hero Summary */}
        <div className="hero">
          <div className="hero-teams">
            <div className="team-blk">
              <span className="t-abbr" style={{ color: color1 }}><TeamLogo teamName={team1} size={36} loading="eager" className="mb-2" showFallbackText={false} />{meta1.abbr}</span>
              <div className="t-wins" style={{ color: color1 }}>{data.team1_wins}</div>
              <div className="t-lbl">Wins</div>
            </div>
            <div className="mid-blk">
              <div className="mid-val">{data.total_matches}</div>
              <div className="mid-lbl">Matches</div>
              <div className="mid-sub">{data.ties} Ties · {data.no_results} No Results</div>
            </div>
            <div className="team-blk r">
              <span className="t-abbr" style={{ color: color2 }}><TeamLogo teamName={team2} size={36} loading="eager" className="mb-2 ml-auto" showFallbackText={false} />{meta2.abbr}</span>
              <div className="t-wins" style={{ color: color2 }}>{data.team2_wins}</div>
              <div className="t-lbl">Wins</div>
            </div>
          </div>
          <div className="wbar">
            <div className="wbar-fill" style={{ width: `${winPct.t1}%`, background: color1 }} />
            <div className="wbar-fill" style={{ width: `${winPct.t2}%`, background: color2 }} />
          </div>
          <div className="wbar-meta">
            <span style={{ color: color1 }}>{winPct.t1}% Win Rate</span>
            <span style={{ color: color2 }}>{winPct.t2}% Win Rate</span>
          </div>
        </div>

        {/* 2. Charts Grid: Win Split + Year-by-Year */}
        <div className="charts-grid">
          <div className="card">
            <div className="card-t">Win Split</div>
            <WinSplitDonut 
              t1Wins={data.team1_wins} 
              t2Wins={data.team2_wins} 
              total={data.total_matches} 
              color1={color1}
              color2={color2}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 10, fontWeight: 700 }}>
               <span style={{ color: color1 }} className="flex items-center gap-1.5"><TeamLogo teamName={team1} size={14} showFallbackText={false} />{meta1.abbr}: {data.team1_wins}</span>
               <span style={{ color: color2 }} className="flex items-center gap-1.5"><TeamLogo teamName={team2} size={14} showFallbackText={false} />{meta2.abbr}: {data.team2_wins}</span>
            </div>
          </div>

          {data.seasons.length > 0 && (
            <div className="card">
              <div className="card-t">Year-by-Year Results</div>
              <div className="yby-wrap">
                {data.seasons.map(s => {
                  const max = Math.max(...data.seasons.map(x => Math.max(x.team_a_wins, x.team_b_wins)));
                  const h1 = max > 0 ? (s.team_a_wins / max) * 60 : 2;
                  const h2 = max > 0 ? (s.team_b_wins / max) * 60 : 2;
                  return (
                    <div key={s.year} className="yby-grp">
                      <div className="yby-bars">
                        <div className="yby-bar" style={{ height: h1, background: color1, opacity: s.team_a_wins ? 1 : 0.3 }} />
                        <div className="yby-bar" style={{ height: h2, background: color2, opacity: s.team_b_wins ? 1 : 0.3 }} />
                      </div>
                      <div className="yby-yr">{s.year}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. Historic / Knockout Match (Special) */}
        {data.historic_matches.length > 0 && (
          <div className="ko-card">
            <div className="ko-pill">NOTABLE MATCHUP</div>
            {data.historic_matches.slice(0, 1).map(m => (
              <div key={m.match_id}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-gold)', marginBottom: 8 }}>{m.match_stage}</div>
                <div className="ko-scores">
                  <div className="ko-team">
                    <div className="ko-tn">{team1}</div>
                    <div className="ko-ts">{m.team1_score}</div>
                  </div>
                  <div className="ko-team" style={{ textAlign: 'right' }}>
                    <div className="ko-tn">{team2}</div>
                    <div className="ko-ts">{m.team2_score}</div>
                  </div>
                </div>
                <div className="ko-res">{m.winner} won by {m.margin}</div>
                <div className="ko-meta">{formatDate(m.date)} · {m.venue}</div>
              </div>
            ))}
          </div>
        )}

        {/* 4. Performers Grid */}
        <div className="grid-2">
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team1} size={16} showFallbackText={false} /> {meta1.abbr} Highest Run Scorers</div>
            {data.top_batters_team1.map((b, i) => (
              <div key={b.player_id} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{b.player_name}</div>
                  <div className="p-sub">{b.innings} inn · Avg: {b.average?.toFixed(1)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{b.runs}</div>
                  <div className="p-l">Runs</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team2} size={16} showFallbackText={false} /> {meta2.abbr} Highest Run Scorers</div>
            {data.top_batters_team2.map((b, i) => (
              <div key={b.player_id} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{b.player_name}</div>
                  <div className="p-sub">{b.innings} inn · Avg: {b.average?.toFixed(1)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{b.runs}</div>
                  <div className="p-l">Runs</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team1} size={16} showFallbackText={false} /> {meta1.abbr} Leading Wicket Takers</div>
            {data.top_bowlers_team1.map((b, i) => (
              <div key={b.player_id} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{b.player_name}</div>
                  <div className="p-sub">{b.innings_bowled} inn · Econ: {b.economy?.toFixed(1)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{b.wickets}</div>
                  <div className="p-l">Wickets</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team2} size={16} showFallbackText={false} /> {meta2.abbr} Leading Wicket Takers</div>
            {data.top_bowlers_team2.map((b, i) => (
              <div key={b.player_id} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{b.player_name}</div>
                  <div className="p-sub">{b.innings_bowled} inn · Econ: {b.economy?.toFixed(1)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{b.wickets}</div>
                  <div className="p-l">Wickets</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Totals Grid */}
        <div className="grid-2">
          <div className="card">
            <div className="card-t">Highest Team Totals</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 9, fontWeight: 800, color: color1, marginBottom: 8 }}><TeamLogo teamName={team1} size={14} showFallbackText={false} /> {meta1.abbr}</div>
              {data.team1_highest_totals.map((t, i) => (
                <div key={i} className="tot-row">
                  <div className="tot-info">
                    <div className="tot-score">{t.runs}/{t.wickets || 10}</div>
                    <div className="tot-meta">{t.overs} ov · {formatDate(t.date)}</div>
                  </div>
                  <div className="tot-venue">{t.venue}</div>
                </div>
              ))}
              <div style={{ height: 20 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 9, fontWeight: 800, color: color2, marginBottom: 8 }}><TeamLogo teamName={team2} size={14} showFallbackText={false} /> {meta2.abbr}</div>
              {data.team2_highest_totals.map((t, i) => (
                <div key={i} className="tot-row">
                  <div className="tot-info">
                    <div className="tot-score">{t.runs}/{t.wickets || 10}</div>
                    <div className="tot-meta">{t.overs} ov · {formatDate(t.date)}</div>
                  </div>
                  <div className="tot-venue">{t.venue}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-t">Lowest Team Totals</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 9, fontWeight: 800, color: color1, marginBottom: 8 }}><TeamLogo teamName={team1} size={14} showFallbackText={false} /> {meta1.abbr}</div>
              {data.team1_lowest_totals.map((t, i) => (
                <div key={i} className="tot-row">
                  <div className="tot-info">
                    <div className="tot-score">{t.runs}/{t.wickets || 10}</div>
                    <div className="tot-meta">{t.overs} ov · {formatDate(t.date)}</div>
                  </div>
                  <div className="tot-venue">{t.venue}</div>
                </div>
              ))}
              <div style={{ height: 20 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 9, fontWeight: 800, color: color2, marginBottom: 8 }}><TeamLogo teamName={team2} size={14} showFallbackText={false} /> {meta2.abbr}</div>
              {data.team2_lowest_totals.map((t, i) => (
                <div key={i} className="tot-row">
                  <div className="tot-info">
                    <div className="tot-score">{t.runs}/{t.wickets || 10}</div>
                    <div className="tot-meta">{t.overs} ov · {formatDate(t.date)}</div>
                  </div>
                  <div className="tot-venue">{t.venue}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Individual Highs */}
        <div className="grid-2">
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team1} size={16} showFallbackText={false} /> {meta1.abbr} Highest Individual Scores</div>
            {data.team1_highest_individual.map((t, i) => (
              <div key={i} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{t.player_name}</div>
                  <div className="p-sub">{t.balls} balls · {formatDate(t.date)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{t.runs}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team2} size={16} showFallbackText={false} /> {meta2.abbr} Highest Individual Scores</div>
            {data.team2_highest_individual.map((t, i) => (
              <div key={i} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{t.player_name}</div>
                  <div className="p-sub">{t.balls} balls · {formatDate(t.date)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{t.runs}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 7. Individual Bowling Highs */}
        <div className="grid-2">
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team1} size={16} showFallbackText={false} /> {meta1.abbr} Best Bowling Figures</div>
            {data.team1_best_bowling.map((t, i) => (
              <div key={i} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{t.player_name}</div>
                  <div className="p-sub">{t.overs} overs · {formatDate(t.date)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{t.wickets}/{t.runs}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-t"><TeamLogo teamName={team2} size={16} showFallbackText={false} /> {meta2.abbr} Best Bowling Figures</div>
            {data.team2_best_bowling.map((t, i) => (
              <div key={i} className="p-row">
                <div className="p-idx">{i + 1}</div>
                <div className="p-info">
                  <div className="p-name">{t.player_name}</div>
                  <div className="p-sub">{t.overs} overs · {formatDate(t.date)}</div>
                </div>
                <div className="p-val">
                  <div className="p-v">{t.wickets}/{t.runs}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
