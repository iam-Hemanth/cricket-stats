"use client";

import { useState, useEffect } from "react";
import api, {
  PlayerVsTeamData,
  PVTFormatStats as FormatStats,
  PVTPhaseStats as PhaseStats,
  PVTYearStats as YearStats,
  PVTVenueSplit as VenueSplit,
  PVTDismissedBy as DismissedBy,
  PVTRecentInning as RecentInning,
} from "@/lib/api";

const C = {
  bg: "var(--bg-base)",
  low: "var(--bg-surface)",
  mid: "var(--bg-card)",
  high: "var(--bg-card-hover)",
  highest: "var(--bg-surface)",
  green: "var(--accent-green)",
  gold: "var(--accent-gold)",
  red: "var(--accent-red)",
  blue: "var(--accent-blue)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  border: "var(--glass-border)",
};

interface Props { playerId: string; playerName: string; team: string; }

const f = (v: number | null | undefined, d = 2) => v != null ? v.toFixed(d) : "—";
const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
const FORMAT_ORDER = ["Test", "ODI", "T20I", "IPL", "T20"];
const PHASE_ORDER = ["powerplay", "middle", "death"];
const PHASE_LABELS: Record<string, string> = { powerplay: "Powerplay", middle: "Middle", death: "Death" };
const PHASE_COLORS: Record<string, string> = { powerplay: C.blue, middle: C.gold, death: C.red };

const FORMAT_LABELS: Record<string, string> = {
  all: "All Formats",
  Test: "Tests",
  ODI: "ODIs",
  T20I: "T20Is",
  IPL: "IPL",
  T20: "T20s",
};

function scoreColor(r: number) { return r >= 100 ? C.green : r >= 50 ? C.gold : C.text; }
function wktColor(w: number) { return w >= 5 ? C.green : w >= 3 ? C.gold : C.text; }

export default function PlayerVsTeamCard({ playerId, playerName, team }: Props) {
  const [data, setData] = useState<PlayerVsTeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [mode, setMode] = useState<"auto" | "batting" | "bowling">("auto");

  useEffect(() => {
    setActiveTab("all");
    setMode("auto");
  }, [playerId, team]);

  useEffect(() => {
    (async () => {
      setLoading(true); setNotFound(false);
      try {
        const d = await api.getPlayerVsTeam(
          playerId,
          team,
          mode,
          activeTab === "all" ? undefined : activeTab
        );
        if (!d) {
          setNotFound(true);
        } else {
          setData(d);
        }
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId, team, activeTab, mode]);

  if (loading && !data) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, borderRadius:18, padding:48 }}>
      <div style={{ width:24, height:24, border:`2px solid ${C.border}`, borderTopColor:C.green, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
    </div>
  );
  if (notFound || !data) return (
    <div style={{ background:C.bg, borderRadius:18, padding:"40px 24px", textAlign:"center", color:C.muted, fontSize:13, border:`1px solid ${C.border}` }}>
      No records found for {playerName} against {team}.
    </div>
  );

  const availableFmts = ["all", ...FORMAT_ORDER.filter(fo => data.available_formats.includes(fo))];
  const isAll = activeTab === "all";
  const activeFmt = isAll ? data.overall : data.by_format.find(f => f.format_bucket === activeTab) ?? data.overall;
  
  const isBowling = data.active_mode === "bowling";

  // Advantage: approx. based on average
  const avg = activeFmt.average ?? 0;
  let batterEdge = 50;
  if (isBowling) {
      batterEdge = Math.min(90, Math.max(10, avg > 0 ? (35 / avg) * 50 : 0)); // Lower bowling avg is better
  } else {
      batterEdge = Math.min(90, Math.max(10, avg > 0 ? (avg / 60) * 100 : 0));
  }
  
  const showPhases = !isAll && ["ODI", "T20I", "IPL", "T20"].includes(activeTab);
  const showVenues = isAll || ["Test", "IPL", "ODI", "T20I", "T20"].includes(activeTab);

  // Filter recent innings if needed
  const recentInnings = isAll ? data.recent_innings : data.recent_innings.filter(i => i.format_bucket === activeTab);
  const years = data.by_year;

  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"var(--font-sans)", fontSize:12, borderRadius:18, overflow:"hidden", width:"100%", border:`1px solid ${C.border}`, boxShadow:"0 32px 80px rgba(0,0,0,0.45)", margin:"0 auto" }}>
      
      {/* ── Format Tabs & Mode Toggle ──────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${C.border}`, background:C.low }}>
        <div style={{ display:"flex", gap:4, padding:"12px 18px", overflowX:"auto" }}>
            {availableFmts.map(fmt => (
            <div key={fmt} onClick={() => setActiveTab(fmt)}
                style={{ padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap",
                color: activeTab === fmt ? C.green : C.muted,
                background: activeTab === fmt ? "color-mix(in srgb, var(--accent-green), transparent 90%)" : "transparent",
                border: `1px solid ${activeTab === fmt ? "color-mix(in srgb, var(--accent-green), transparent 75%)" : "transparent"}`,
                }}>
                {FORMAT_LABELS[fmt] || fmt}
            </div>
            ))}
        </div>
        
        <div style={{ display: "flex", gap: 4, background: C.highest, padding: "4px", borderRadius: 8, marginRight: 16 }}>
            {(["batting", "bowling"] as const).map(m => (
                <div key={m} onClick={() => setMode(m)}
                style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    textTransform: "uppercase",
                    background: data.active_mode === m ? C.mid : "transparent",
                    color: data.active_mode === m ? C.green : C.muted,
                    boxShadow: data.active_mode === m ? "0 2px 4px rgba(0,0,0,0.2)" : "none"
                }}>
                {m}
                </div>
            ))}
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:48, height:48, borderRadius:"50%", background:"color-mix(in srgb, var(--accent-green), transparent 85%)", color:C.green, fontSize:15, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", border:`2px solid ${C.green}` }}>
              {initials(data.player_name ?? playerName)}
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:800 }}>{data.player_name ?? playerName}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2, textTransform:"capitalize" }}>{isBowling ? "Bowler" : "Batter"}</div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C.highest, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:C.muted }}>VS</div>
            <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".05em" }}>{isAll ? "All Formats" : activeTab}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexDirection:"row-reverse" }}>
            <div style={{ width:44, height:44, borderRadius:10, background:"color-mix(in srgb, var(--accent-gold), transparent 85%)", color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, border:`1.5px solid color-mix(in srgb, var(--accent-gold), transparent 70%)` }}>
              {team.charAt(0)}
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:16, fontWeight:800 }}>{team}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{activeFmt.matches} matches</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${C.border}` }}>
        {isBowling ? (
            ([
                ["Wickets", activeFmt.wickets?.toString() ?? "0", C.green],
                ["Average", f(activeFmt.average), C.green],
                ["Economy", f(activeFmt.economy), C.blue],
                ["Innings", activeFmt.innings.toString(), ""],
                ["BBI", activeFmt.bbi ?? "—", C.gold],
                ["4W", activeFmt.four_w?.toString() ?? "0", ""],
                ["5W", activeFmt.five_w?.toString() ?? "0", ""],
            ] as [string, string, string][]).map(([l, v, c], i) => (
                <div key={l} style={{ textAlign:"center", padding:"12px 4px", borderRight: i < 6 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize:17, fontWeight:900, letterSpacing:"-.5px", lineHeight:1, color: c || C.text }}>{v}</div>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", marginTop:4 }}>{l}</div>
                </div>
            ))
        ) : (
            ([
            ["Runs", activeFmt.runs.toLocaleString(), C.green],
            ["Average", f(activeFmt.average), C.green],
            ["Strike Rate", f(activeFmt.strike_rate), C.blue],
            ["Innings", activeFmt.innings.toString(), ""],
            ["100s", activeFmt.hundreds?.toString() ?? "0", C.gold],
            ["50s", activeFmt.fifties?.toString() ?? "0", ""],
            ["High Score", activeFmt.highest_score?.toString() ?? "0", ""],
            ] as [string, string, string][]).map(([l, v, c], i) => (
            <div key={l} style={{ textAlign:"center", padding:"12px 4px", borderRight: i < 6 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize:17, fontWeight:900, letterSpacing:"-.5px", lineHeight:1, color: c || C.text }}>{v}</div>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", marginTop:4 }}>{l}</div>
            </div>
            ))
        )}
      </div>

      {/* ── Advantage Bar ────────────────────────────────── */}
      <div style={{ padding:"12px 20px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${C.border}`, background:C.mid }}>
        <span style={{ fontSize:10, fontWeight:600, color:C.green }}>{data.player_name?.split(" ").pop() ?? "Player"}</span>
        <div style={{ flex:1, height:6, background:C.highest, borderRadius:3, overflow:"hidden", position:"relative" }}>
          <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:3, width:`${batterEdge}%`, background:C.green }} />
        </div>
        <span style={{ fontSize:10, fontWeight:600, color:C.gold }}>{team}</span>
        <span style={{ fontSize:10, color:C.muted, marginLeft:12 }}>Edge: <b style={{ color: (isBowling ? avg <= 30 && avg > 0 : avg >= 35) ? C.green : C.muted }}>{isBowling ? "Bowler" : "Batter"}</b> · avg {f(avg)}</span>
      </div>

      {/* ── Extra Detail Grid ────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderBottom:`1px solid ${C.border}` }}>
        {isBowling ? (
            ([
                ["Dot ball %", activeFmt.dot_ball_pct != null ? `${f(activeFmt.dot_ball_pct)}%` : "—", C.muted],
                ["Boundary %", activeFmt.boundary_pct != null ? `${f(activeFmt.boundary_pct)}%` : "—", ""],
                ["Runs Conceded", activeFmt.runs.toString(), C.red],
                ["Strike Rate", f(activeFmt.strike_rate), C.green],
            ] as [string, string, string][]).map(([l, v, c], i) => (
                <div key={l} style={{ textAlign:"center", padding:"10px 4px", borderRight: i < 3 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize:14, fontWeight:800, lineHeight:1, color: c || C.text }}>{v}</div>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", marginTop:4 }}>{l}</div>
                </div>
            ))
        ) : (
            ([
            ["Dot ball %", activeFmt.dot_ball_pct != null ? `${f(activeFmt.dot_ball_pct)}%` : "—", C.muted],
            ["Boundary %", activeFmt.boundary_pct != null ? `${f(activeFmt.boundary_pct)}%` : "—", ""],
            ["Times out", activeFmt.dismissals?.toString() ?? "0", C.red],
            ["Not outs", activeFmt.not_outs?.toString() ?? "0", C.green],
            ] as [string, string, string][]).map(([l, v, c], i) => (
            <div key={l} style={{ textAlign:"center", padding:"10px 4px", borderRight: i < 3 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize:14, fontWeight:800, lineHeight:1, color: c || C.text }}>{v}</div>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", marginTop:4 }}>{l}</div>
            </div>
            ))
        )}
      </div>

      <div style={{ padding:"16px" }}>
        {/* ── Phase / Venue Breakdown ────────────────────── */}
        {showPhases && data.phases.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>Phase Breakdown</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"space-evenly" }}>
              {PHASE_ORDER.map(pn => {
                const ph = data.phases.find(p => p.phase === pn);
                if (!ph) return null;
                const clr = PHASE_COLORS[pn] ?? C.text;
                return (
                  <div key={pn} style={{ background:C.high, border:`1px solid ${C.border}`, borderRadius:10, padding:10, flex:"1 1 120px", maxWidth:"calc(33.3% - 6px)", minWidth:100 }}>
                    <div style={{ fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", marginBottom:8, color:clr }}>{PHASE_LABELS[pn]}</div>
                    
                    {isBowling ? (
                        <>
                            <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-0.8px", lineHeight:1, color:clr }}>{f(ph.economy, 1)}</div>
                            <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", margin:"2px 0 8px" }}>Economy</div>
                            <div style={{ height:3, background:C.highest, borderRadius:2, marginBottom:8, overflow:"hidden" }}>
                                <div style={{ height:3, borderRadius:2, background:clr, width:`${Math.min(100, (ph.wickets ?? 0 / Math.max(1, activeFmt.wickets ?? 1)) * 100)}%` }} />
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:`1px solid ${C.border}` }}>
                                <span style={{ fontSize:8, color:C.muted }}>Wkts</span>
                                <span style={{ fontSize:10, fontWeight:700 }}>{ph.wickets}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:`1px solid ${C.border}` }}>
                                <span style={{ fontSize:8, color:C.muted }}>Avg / SR</span>
                                <span style={{ fontSize:10, fontWeight:700 }}>{f(ph.average, 1)} / {f(ph.strike_rate, 1)}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0 0", borderTop:`1px solid ${C.border}` }}>
                                <span style={{ fontSize:8, color:C.muted }}>Runs</span>
                                <span style={{ fontSize:10, fontWeight:700 }}>{ph.runs.toLocaleString()}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-0.8px", lineHeight:1, color:clr }}>{f(ph.strike_rate, 1)}</div>
                            <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".04em", margin:"2px 0 8px" }}>Strike Rate</div>
                            <div style={{ height:3, background:C.highest, borderRadius:2, marginBottom:8, overflow:"hidden" }}>
                            <div style={{ height:3, borderRadius:2, background:clr, width:`${Math.min(100, (ph.runs / Math.max(1, activeFmt.runs)) * 100)}%` }} />
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:`1px solid ${C.border}` }}>
                            <span style={{ fontSize:8, color:C.muted }}>Avg</span>
                            <span style={{ fontSize:10, fontWeight:700 }}>{f(ph.average, 1)}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0 0", borderTop:`1px solid ${C.border}` }}>
                            <span style={{ fontSize:8, color:C.muted }}>Runs</span>
                            <span style={{ fontSize:10, fontWeight:700 }}>{ph.runs.toLocaleString()}</span>
                            </div>
                        </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showVenues && data.venue_split.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>Venue Breakdown</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"space-evenly" }}>
              {data.venue_split.map(vs => {
                const clr = vs.venue_type === "home" ? C.green : vs.venue_type === "away" ? C.red : C.gold;
                return (
                  <div key={vs.venue_type} style={{ background:C.high, border:`1px solid ${C.border}`, borderRadius:10, padding:10, borderTop:`2px solid ${clr}`, flex:"1 1 120px", maxWidth:"calc(33.3% - 6px)", minWidth:100 }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:clr, marginBottom:2 }}>{vs.venue_type}</div>
                    <div style={{ fontSize:8, color:C.muted, marginBottom:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{vs.label}</div>
                    
                    {isBowling ? (
                        <>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, marginBottom:3 }}>
                            <div style={{ background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                                <div style={{ fontSize:12, fontWeight:700 }}>{vs.wickets}</div>
                                <div style={{ fontSize:8, color:C.muted }}>Wkts</div>
                            </div>
                            <div style={{ background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                                <div style={{ fontSize:12, fontWeight:700 }}>{f(vs.average, 1)}</div>
                                <div style={{ fontSize:8, color:C.muted }}>Avg</div>
                            </div>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                                <div style={{ fontSize:8, color:C.muted }}>Econ</div>
                                <div style={{ fontSize:12, fontWeight:700 }}>{f(vs.economy, 1)}</div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, marginBottom:3 }}>
                            <div style={{ background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                                <div style={{ fontSize:12, fontWeight:700 }}>{vs.runs}</div>
                                <div style={{ fontSize:8, color:C.muted }}>Runs</div>
                            </div>
                            <div style={{ background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                                <div style={{ fontSize:12, fontWeight:700 }}>{f(vs.average, 1)}</div>
                                <div style={{ fontSize:8, color:C.muted }}>Avg</div>
                            </div>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.highest, borderRadius:5, padding:"5px 6px" }}>
                            <div style={{ fontSize:8, color:C.muted }}>Strike Rate</div>
                            <div style={{ fontSize:12, fontWeight:700 }}>{f(vs.strike_rate, 1)}</div>
                            </div>
                        </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Year-by-year SVG Chart ─────────────────────── */}
        {years.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".08em" }}>{isBowling ? "Wickets per year" : "Runs per year"} vs {team}</span>
              <div style={{ display:"flex", gap:10 }}>
                {isBowling ? (
                    <>
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:8, color:C.muted }}><span style={{ width:8, height:8, borderRadius:2, background:C.green }}/>10+ wkts</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:8, color:C.muted }}><span style={{ width:8, height:8, borderRadius:2, background:C.gold }}/>5-9 wkts</span>
                    </>
                ) : (
                    <>
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:8, color:C.muted }}><span style={{ width:8, height:8, borderRadius:2, background:C.green }}/>100+ runs</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:8, color:C.muted }}><span style={{ width:8, height:8, borderRadius:2, background:C.gold }}/>50–99 runs</span>
                    </>
                )}
              </div>
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:68, overflowX:"auto", paddingBottom:4 }}>
              {(() => {
                const maxVal = Math.max(...years.map(y => isBowling ? (y.wickets ?? 0) : y.runs), 1);
                return [...years].sort((a,b) => a.year - b.year).map(y => {
                  const val = isBowling ? (y.wickets ?? 0) : y.runs;
                  const h = Math.max(Math.round((val / maxVal) * 56), 2);
                  
                  let col = C.muted;
                  if (isBowling) {
                      col = val >= 10 ? C.green : val >= 5 ? C.gold : C.muted;
                  } else {
                      col = val >= 400 ? C.green : val >= 150 ? C.gold : C.muted;
                  }

                  return (
                    <div key={y.year} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, flexShrink:0, minWidth:22 }}>
                      <div style={{ display:"flex", gap:1, alignItems:"flex-end", height:56 }}>
                        <div title={`${y.year}: ${val} ${isBowling ? "wickets" : "runs"}`} style={{ width:9, borderRadius:"2px 2px 0 0", minHeight:2, cursor:"pointer", background:col, height:h }} />
                      </div>
                      <div style={{ fontSize:7, color:C.muted }}>{y.year.toString().slice(-2)}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── Dismissed By / Dismissed Batters ───────────── */}
        {data.dismissed_by.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>{isBowling ? "Most times dismissed" : "Most times dismissed by"}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {(() => {
                const maxC = Math.max(...data.dismissed_by.map(x => x.times_dismissed), 1);
                return data.dismissed_by.slice(0, 5).map((x, i) => {
                  const name = isBowling ? x.batter_name : x.bowler_name;
                  const id = isBowling ? x.batter_id : x.bowler_id;
                  if (!name) return null;
                  return (
                    <div key={id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:10, color:C.muted, width:14, flexShrink:0 }}>{i + 1}</span>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:C.low, border:`1px solid color-mix(in srgb, var(--accent-gold), transparent 80%)`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, flexShrink:0 }}>
                        {initials(name)}
                        </div>
                        <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600 }}>{name}</div>
                        </div>
                        <div style={{ width:100, height:4, background:C.highest, borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:4, background: isBowling ? C.green : C.red, borderRadius:2, width:`${Math.round((x.times_dismissed / maxC) * 100)}%` }} />
                        </div>
                        <div style={{ textAlign:"right", minWidth:32 }}>
                        <div style={{ fontSize:13, fontWeight:800, color: isBowling ? C.green : C.red }}>{x.times_dismissed}</div>
                        <div style={{ fontSize:8, color:C.muted }}>wkts</div>
                        </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── Recent Innings / Spells ─────────────────────────────── */}
        {recentInnings.length > 0 && (
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>Recent {isBowling ? "Spells" : "Innings"} vs {team}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {recentInnings.slice(0, 8).map(inn => {
                const isOut = !inn.not_out && inn.how_out;
                return (
                  <div key={`${inn.match_id}-${inn.date}-${inn.innings_number}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:C.low, borderRadius:10, border:`1px solid ${C.border}` }}>
                    
                    {isBowling ? (
                        <div style={{ width:48, height:44, borderRadius:10, background:C.high, border:`1px solid ${(inn.wickets ?? 0) >= 3 ? C.green : C.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", flexShrink:0 }}>
                            <div style={{ fontSize:15, fontWeight:900, lineHeight:1, color:(inn.wickets ?? 0) >= 3 ? C.green : C.text }}>{inn.wickets}-{inn.runs}</div>
                            <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", marginTop:2 }}>{inn.overs} overs</div>
                        </div>
                    ) : (
                        <div style={{ width:44, height:44, borderRadius:10, background:C.high, border:`1px solid ${scoreColor(inn.runs) === C.text ? C.border : scoreColor(inn.runs)}`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", flexShrink:0 }}>
                            <div style={{ fontSize:15, fontWeight:900, lineHeight:1, color:scoreColor(inn.runs) }}>{inn.runs}{inn.not_out ? "*" : ""}</div>
                            <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", marginTop:2 }}>{inn.balls}b</div>
                        </div>
                    )}

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                        <span style={{ background:C.highest, borderRadius:4, padding:"2px 6px", fontSize:8, color:C.muted }}>{inn.format_bucket}</span>
                        <span style={{ fontSize:9, color:C.muted }}>{new Date(inn.date).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</span>
                      </div>
                      <div style={{ fontSize:12, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{inn.batting_team} vs {inn.bowling_team}</div>
                      <div style={{ display:"flex", gap:10, marginTop:4 }}>
                        {isBowling ? (
                            <>
                                <span style={{ fontSize:9, color:C.muted }}>Econ: <b style={{ color:C.text }}>{f(inn.economy, 1)}</b></span>
                                {inn.maidens ? <span style={{ fontSize:9, color:C.muted }}>M: <b style={{ color:C.text }}>{inn.maidens}</b></span> : null}
                            </>
                        ) : (
                            <>
                                <span style={{ fontSize:9, color:C.muted }}>SR: <b style={{ color:C.text }}>{f(inn.strike_rate, 1)}</b></span>
                                <span style={{ fontSize:9, color:C.muted }}>4s: <b style={{ color:C.text }}>{inn.fours}</b></span>
                                <span style={{ fontSize:9, color:C.muted }}>6s: <b style={{ color:C.text }}>{inn.sixes}</b></span>
                            </>
                        )}
                      </div>
                    </div>
                    
                    {!isBowling && (
                        <div style={{ textAlign:"right", flexShrink:0, maxWidth:100 }}>
                        {!isOut ? (
                            <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>not out</span>
                        ) : (
                            <>
                            <div style={{ fontSize:10, color:C.muted }}>{inn.how_out === 'bowled' ? 'b' : inn.how_out === 'lbw' ? 'lbw' : inn.how_out === 'caught' ? 'c' : inn.how_out}</div>
                            {inn.dismissed_by_name && <div style={{ fontSize:9, color:C.red, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>b {inn.dismissed_by_name.split(" ").pop()}</div>}
                            </>
                        )}
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
