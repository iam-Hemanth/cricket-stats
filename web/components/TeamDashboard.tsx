"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import api, { type TeamDashboardResponse } from "@/lib/api";
import { TeamLogo } from "@/components/TeamLogo";
import { getTeamIdentity } from "@/lib/teamIdentity";
import { InlineStatBar } from "@/components/team/InlineStatBar";
import { WinRateDonut } from "@/components/team/WinRateDonut";
import { FormPills } from "@/components/team/FormPills";
import { H2HBar } from "@/components/team/H2HBar";
import { SeasonBars } from "@/components/team/SeasonBars";
import { PlayerRow } from "@/components/team/PlayerRow";
import { BiDirectionalBar } from "@/components/team/BiDirectionalBar";

const DEFAULT_FORMATS = ["All", "Test", "ODI", "T20I", "IPL"];

const Card = ({ title, tag, children, className = "", noPadding = false }: { title: string; tag?: string; children: React.ReactNode; className?: string; noPadding?: boolean }) => (
  <div className={`bg-[#181c22] border border-[rgba(255,255,255,0.07)] rounded-[12px] overflow-hidden ${className}`}>
    <div className={noPadding ? "" : "p-[12px]"}>
      <div className={`text-[8px] font-[700] text-[#72808a] uppercase tracking-[.08em] mb-[8px] flex items-center justify-between ${noPadding ? "p-[12px] pb-0" : ""}`}>
        {title}
        {tag && <span className="text-[8px] bg-[#272a31] border border-[rgba(255,255,255,0.07)] rounded-[5px] px-[6px] py-[1px] text-[#72808a] font-[500] normal-case tracking-normal">{tag}</span>}
      </div>
      {children}
    </div>
  </div>
);

const StatBox = ({ value, label, color }: { value: string | number; label: string; color?: string }) => (
  <div className="bg-[#272a31] rounded-[8px] p-[8px_10px] text-center">
    <div className="text-[16px] font-[900] tracking-[-.4px] leading-[1]" style={{ color: color || "#e0e2eb" }}>{value}</div>
    <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.04em] mt-[3px]">{label}</div>
  </div>
);

export default function TeamDashboard({ teamName: initialTeamName }: { teamName: string }) {
  const [teamName, setTeamName] = useState(initialTeamName);
  const [format, setFormat] = useState<string>("All");
  const [data, setData] = useState<TeamDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatOptions = useMemo(() => {
    if (data?.available_formats && data.available_formats.length > 0) {
      return ["All", ...data.available_formats];
    }
    return DEFAULT_FORMATS;
  }, [data]);

  useEffect(() => {
    if (!data?.available_formats || data.available_formats.length === 0) return;
    if (format !== "All" && !data.available_formats.includes(format)) {
      setFormat("All");
    }
  }, [data, format]);

  const bestSeason = useMemo(() => {
    if (!data?.yearly_performance || data.yearly_performance.length === 0) return null;
    return data.yearly_performance.reduce((best, current) => {
      if (!best) return current;
      if (current.won > best.won) return current;
      if (current.won === best.won && current.played > best.played) return current;
      return best;
    }, null as (typeof data.yearly_performance)[number] | null);
  }, [data]);

  const bestSeasonWinRate = bestSeason && bestSeason.played
    ? Math.round((bestSeason.won / bestSeason.played) * 100)
    : null;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getTeamDashboard(teamName, format === "All" ? undefined : format);
        setData(res);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load team dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [teamName, format]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto p-4 animate-pulse space-y-4">
        <div className="h-20 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-5 gap-2 h-16">
          {[1,2,3,4,5].map(i => <div key={i} className="bg-white/5 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 h-64">
          <div className="md:col-span-1 bg-white/5 rounded-xl" />
          <div className="md:col-span-1 bg-white/5 rounded-xl" />
          <div className="md:col-span-1 bg-white/5 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto bg-[#10131a] text-[#e0e2eb] min-h-screen font-sans text-[12px] overflow-x-hidden">
      {/* TEAM HEADER */}
      <div className="p-[16px_18px] border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between gap-[12px]" style={{ background: 'linear-gradient(135deg,#0d1810 0%,#10131a 60%)' }}>
        <div className="flex items-center gap-[14px]">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[#1a3a20] border-2 border-[rgba(75,226,119,0.3)] flex items-center justify-center text-2xl shrink-0 overflow-hidden">
            <TeamLogo teamName={teamName} size={40} />
          </div>
          <div>
            <h1 className="text-[20px] font-[900] tracking-[-.5px] leading-none">{teamName}</h1>
            <p className="text-[9px] text-[#72808a] mt-[2px]">International Cricket Team {" • "} {data?.metadata?.active_since ? `Active since ${data.metadata.active_since}` : 'Stats Dashboard'}</p>
          </div>
        </div>
        <div className="flex gap-[6px] items-center">
          <div className="flex gap-[4px]">
            {formatOptions.map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-[13px] py-[5px] rounded-[20px] text-[10px] font-[600] transition-all border ${
                  format === f ? 'bg-[rgba(75,226,119,0.1)] border-[rgba(75,226,119,0.3)] text-[#4be277]' : 'border-transparent text-[#72808a] hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error || !data ? (
        <div className="max-w-2xl mx-auto p-24 text-center">
          <div className="text-5xl mb-6 opacity-20">📉</div>
          <h2 className="text-xl font-black tracking-tighter uppercase">{error || "No Data Found"}</h2>
          <p className="text-[10px] text-[#72808a] mt-2 uppercase tracking-widest font-bold">Try selecting a different format above</p>
          <button 
            onClick={() => setFormat("All")} 
            className="mt-8 px-8 py-3 bg-[#4be277] text-black font-black rounded-full text-[11px] uppercase tracking-tighter hover:scale-105 transition-transform"
          >
            Reset to All Formats
          </button>
        </div>
      ) : (
        <>
          {/* KPI STRIP */}
          <div className="grid border-b border-[rgba(255,255,255,0.07)]" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="text-center py-[10px] px-[4px] border-r border-[rgba(255,255,255,0.07)]">
              <div className="text-[18px] font-[900] tracking-[-.5px] leading-[1] text-[#4be277]">{data.kpi.matches_played}</div>
              <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.05em] mt-[3px]">Matches</div>
              <div className="text-[8px] mt-[2px] text-[#72808a]">{format} stats</div>
            </div>
            <div className="text-center py-[10px] px-[4px] border-r border-[rgba(255,255,255,0.07)]">
              <div className="text-[18px] font-[900] tracking-[-.5px] leading-[1] text-[#4be277]">{data.kpi.won}</div>
              <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.05em] mt-[3px]">Wins</div>
              <div className="text-[8px] mt-[2px] text-[#4be277] font-[700]">{data.kpi.win_percentage}% WR</div>
            </div>
            <div className="text-center py-[10px] px-[4px] border-r border-[rgba(255,255,255,0.07)]">
              <div className="text-[18px] font-[900] tracking-[-.5px] leading-[1]">{data.kpi.lost}</div>
              <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.05em] mt-[3px]">Losses</div>
              <div className="text-[8px] mt-[2px] text-[#ff6b6b] font-[700]">{((data.kpi.lost/(data.kpi.matches_played||1))*100).toFixed(1)}% LR</div>
            </div>
            <div className="text-center py-[10px] px-[4px] border-r border-[rgba(255,255,255,0.07)]">
              <div className="text-[18px] font-[900] tracking-[-.5px] leading-[1] text-[#ffb95f]">{data.kpi.tied + data.kpi.no_result}</div>
              <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.05em] mt-[3px]">Draws / NR</div>
              <div className="text-[8px] mt-[2px] text-[#72808a]">{data.kpi.win_streak}-match streak</div>
            </div>
            <div className="text-center py-[10px] px-[4px]">
              <div className="text-[18px] font-[900] tracking-[-.5px] leading-[1] text-[#7bbdee]">{data.metadata.achievement?.match(/\d+/)?.[0] || data.metadata.active_since || '—'}</div>
              <div className="text-[7.5px] text-[#72808a] uppercase tracking-[.05em] mt-[3px]">Key Achievement</div>
              <div className="text-[8px] mt-[2px] text-[#72808a] truncate px-[8px]">{data.metadata.achievement || 'Consistent Performance'}</div>
            </div>
          </div>

          <div className="grid gap-[8px] p-[10px_14px]">
            {/* ROW 1: g-532 */}
            <div className="grid gap-[8px]" style={{ gridTemplateColumns: '5fr 3fr 2fr' }}>
              <Card title="Win Rate & Form" tag={format === "All" ? "All Formats" : format}>
                <div className="flex flex-col h-full justify-between gap-[12px]">
                  <WinRateDonut 
                    winRate={data.kpi.win_percentage} 
                    wins={data.kpi.won} 
                    losses={data.kpi.lost} 
                    draws={data.kpi.tied + data.kpi.no_result} 
                  />
                  <div className="mt-[12px]">
                    <div className="text-[8px] font-[700] text-[#72808a] uppercase tracking-[.08em] mb-[6px] flex items-center justify-between">Last 10 matches</div>
                    <FormPills pills={data.form_pills} />
                  </div>
                </div>
              </Card>



              <Card title="Batting" tag={format}>
                <div className="grid grid-cols-2 gap-[6px] mb-[10px]">
                  <StatBox label="Team Avg" value={format === "Test" ? (data.batting_splits.home_avg || '—') : (data.batting_phases.middle_avg || '—')} color="#4be277" />
                  <StatBox label="Strike Rate" value={format === "Test" ? '—' : (data.batting_phases.death_sr || '—')} color="#7bbdee" />
                  <StatBox label="Highest Total" value={data.kpi.highest_score ?? '—'} />
                  <StatBox label="Lowest All-Out" value={data.kpi.lowest_score ?? '—'} color="#ff6b6b" />
                </div>
                <div className="space-y-[4px]">
                  {format === "Test" ? (
                    <>
                      {data.batting_splits.home_avg && <InlineStatBar label="Home Avg" value={data.batting_splits.home_avg} percentage={((data.batting_splits.home_avg)/60)*100} color="#4be277" />}
                      {data.batting_splits.away_avg && <InlineStatBar label="Away Avg" value={data.batting_splits.away_avg} percentage={((data.batting_splits.away_avg)/60)*100} color="#7bbdee" />}
                      {data.batting_splits.neutral_avg && <InlineStatBar label="Neutral Avg" value={data.batting_splits.neutral_avg} percentage={((data.batting_splits.neutral_avg)/60)*100} color="#ffb95f" />}
                    </>
                  ) : (
                    <>
                      <BiDirectionalBar 
                        label="Powerplay" 
                        leftValue={data.batting_phases.powerplay_avg || 0} 
                        rightValue={data.batting_phases.powerplay_sr || 0} 
                      />
                      <BiDirectionalBar 
                        label="Middle" 
                        leftValue={data.batting_phases.middle_avg || 0} 
                        rightValue={data.batting_phases.middle_sr || 0} 
                      />
                      <BiDirectionalBar 
                        label="Death" 
                        leftValue={data.batting_phases.death_avg || 0} 
                        rightValue={data.batting_phases.death_sr || 0} 
                      />
                    </>
                  )}
                </div>
              </Card>

              <Card title="Bowling" tag={format}>
                <div className="grid grid-cols-2 gap-[6px] mb-[10px]">
                  <StatBox label="Bowling Avg" value={data.bowling_splits.bowling_avg || '—'} color="#4be277" />
                  <StatBox label="Economy" value={data.bowling_splits.bowling_economy || '—'} color="#7bbdee" />
                  {format !== "Test" && data.targets && (
                    <>
                      <StatBox label="Lowest Defended" value={data.targets.lowest_target_defended ?? '—'} color="#ffb95f" />
                      <StatBox label="Highest Conceded" value={data.targets.highest_target_conceded ?? '—'} color="#ff6b6b" />
                    </>
                  )}
                </div>
                <div className="space-y-[1px]">
                  {data.bowling_splits.bowling_avg && <InlineStatBar label="Overall Avg" value={data.bowling_splits.bowling_avg} percentage={Math.max(0, Math.min(100, (30 / (data.bowling_splits.bowling_avg || 1)) * 100))} color="#4be277" />}
                  {data.bowling_splits.bowling_economy && <InlineStatBar label="Economy Rate" value={data.bowling_splits.bowling_economy} percentage={Math.max(0, Math.min(100, (8 / (data.bowling_splits.bowling_economy || 1)) * 100))} color="#ffb95f" />}
                </div>
              </Card>
            </div>

            {/* ROW 2: g-55 */}
            <div className="grid gap-[8px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Card title="Head to Head" tag={format === "All" ? "All Formats" : format}>
                <div className="space-y-[1px]">
                  {data.h2h_summary.map((h, i) => (
                    <H2HBar key={i} opposition={h.opposition} teamWins={h.won} oppWins={h.played - h.won} />
                  ))}
                </div>
              </Card>

              <Card title="Season Performance" tag="Wins per year">
                <div className="flex gap-[10px] mb-[8px]">
                  <div>
                    <div className="text-[16px] font-[800] text-[#4be277] leading-none">{data.metadata.best_year?.split(' ')[0] || '—'}</div>
                    <div className="text-[8px] text-[#72808a] mt-[1px]">Best year</div>
                  </div>
                  <div>
                    <div className="text-[16px] font-[800] text-[#ffb95f] leading-none">{data.metadata.best_year?.match(/\d+/g)?.[1] || '—'}</div>
                    <div className="text-[8px] text-[#72808a] mt-[1px]">Wins that year</div>
                  </div>
                  <div>
                    <div className="text-[16px] font-[800] text-[#e0e2eb] leading-none">{bestSeasonWinRate != null ? `${bestSeasonWinRate}%` : '—'}</div>
                    <div className="text-[8px] text-[#72808a] mt-[1px]">Win rate</div>
                  </div>
                </div>
                <SeasonBars records={data.yearly_performance} />
              </Card>
            </div>

            {/* ROW 3: g-3 */}
            <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <Card title="Top Batters" tag={format}>
                <div className="space-y-[1px]">
                  {data.top_batters.slice(0, 10).map((p, i) => (
                    <PlayerRow key={i} rank={i + 1} name={p.player_name} id={p.player_id} stat1={p.runs} label1="runs" stat2={p.average ?? '—'} label2="avg" />
                  ))}
                </div>
              </Card>

              <Card title="Top Bowlers" tag={format}>
                <div className="space-y-[1px]">
                  {data.top_bowlers.slice(0, 10).map((p, i) => (
                    <PlayerRow key={i} rank={i + 1} name={p.player_name} id={p.player_id} stat1={p.wickets} label1="wkts" stat2={p.bowling_average ?? '—'} label2="avg" />
                  ))}
                </div>
              </Card>

              <Card title="Best Venues" tag="Win %" noPadding>
                <div className="p-[12px] pb-[6px] space-y-[1px]">
                  {data.venue_performance.length > 0 ? data.venue_performance.slice(0, 5).map((v, i) => {
                    const winPct = v.chasing_win_pct ?? 0;
                    return (
                    <div key={i} className="flex items-center gap-[8px] py-[6px] border-b border-[rgba(255,255,255,0.04)] last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-[600] truncate">{v.venue}</div>
                        <div className="text-[8px] text-[#72808a] truncate">{v.matches_played} matches · {v.format}</div>
                      </div>
                      <div className="w-[70px] h-[4px] bg-[rgba(255,255,255,0.05)] rounded-[2px] overflow-hidden shrink-0 mr-[6px]">
                        <div className="h-full bg-[#4be277]" style={{ width: `${Math.min(100, Math.max(0, winPct))}%` }} />
                      </div>
                      <div className="text-[10px] font-[700] text-[#4be277] min-w-[32px] text-right">{winPct.toFixed(1)}%</div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-12 text-[#72808a] text-[10px]">No venue data for this filter</div>
                )}
                </div>
                <div className="border-t border-[rgba(255,255,255,0.07)]">
                  <div className="p-[8px_12px_4px] text-[8px] font-[700] text-[#72808a] uppercase tracking-[.08em]">Recent Matches</div>
                  <div className="divide-y divide-[rgba(255,255,255,0.07)]">
                    {data.recent_matches.slice(0, 5).map((m, i) => (
                      <Link href={`/match/${m.match_id}`} key={i} className="px-[12px] py-[7px] flex items-center justify-between hover:bg-[#272a31] transition-colors">
                        <div className="flex items-center gap-[8px] min-w-0">
                          <span className="bg-[#31353c] border border-[rgba(255,255,255,0.07)] rounded-[4px] px-[5px] py-[1px] text-[8px] text-[#72808a] shrink-0">{m.format_bucket}</span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-[600] truncate">vs {m.batting_first === teamName ? m.bowling_first : m.batting_first}</div>
                            <div className="text-[8.5px] text-[#72808a] mt-[1px] truncate">{m.venue}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-[8px]">
                          <div className="flex items-center justify-end gap-[4px]">
                            <div className={`text-[10px] font-[700] ${m.winner === teamName ? 'text-[#4be277]' : 'text-[#ff6b6b]'}`}>
                              {m.winner === teamName ? 'Won' : 'Lost'}
                            </div>
                            <div className="text-[8px] text-[#72808a]">{m.win_by_runs ? `${m.win_by_runs} runs` : m.win_by_wickets ? `${m.win_by_wickets} wkts` : '—'}</div>
                          </div>
                          <div className="text-[8px] text-[#72808a] min-w-[54px] mt-[1px]">
                            {new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* ALL-TIME RECORDS */}
            <div>
              <div className="p-[8px_14px_4px] text-[8px] font-[700] text-[#72808a] uppercase tracking-[.1em] flex items-center gap-[8px]">
                All-Time Records <div className="h-[1px] bg-[rgba(255,255,255,0.07)] flex-1" />
              </div>
              <div className="grid gap-[8px] pt-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="bg-[#181c22] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-[12px] text-center">
                  <div className="text-[22px] font-[900] text-[#4be277]">{data.all_time_records.most_runs_value?.toLocaleString()}</div>
                  <div className="text-[9px] text-[#72808a] mt-[3px]">Most runs — {data.all_time_records.most_runs_player}</div>
                  <div className="text-[8px] text-[#72808a] mt-[2px]">All formats combined</div>
                </div>
                <div className="bg-[#181c22] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-[12px] text-center">
                  <div className="text-[22px] font-[900] text-[#7bbdee]">{data.all_time_records.most_wickets_value}</div>
                  <div className="text-[9px] text-[#72808a] mt-[3px]">Most wickets — {data.all_time_records.most_wickets_player}</div>
                  <div className="text-[8px] text-[#72808a] mt-[2px]">Career record</div>
                </div>
                <div className="bg-[#181c22] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-[12px] text-center">
                  <div className="text-[22px] font-[900] text-[#ffb95f]">{data.all_time_records.highest_total}</div>
                  <div className="text-[9px] text-[#72808a] mt-[3px]">Highest team total</div>
                  <div className="text-[8px] text-[#72808a] mt-[2px]">Match record</div>
                </div>
                <div className="bg-[#181c22] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-[12px] text-center">
                  <div className="text-[22px] font-[900] text-[#ff6b6b]">
                    {data.metadata.achievement?.match(/\b(19|20)\d{2}\b/)?.[0] || '—'}
                  </div>
                  <div className="text-[9px] text-[#72808a] mt-[3px]">{data.metadata.achievement || '—'}</div>
                  <div className="text-[8px] text-[#72808a] mt-[2px]">Achievement</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <footer className="mt-12 p-8 text-center opacity-30 text-[10px] tracking-widest uppercase font-bold">
        Built for <span className="text-[#4be277]">CricStats</span> {" • "} Data from Cricsheet
      </footer>
    </div>
  );
}
