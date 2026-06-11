"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── colour tokens (matching editorial dark theme) ────────── */
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

/* ── Types ────────────────────────────────────────────────── */
interface PhaseStats { phase: string; balls: number; runs: number; dismissals: number; strike_rate: number | null; average: number | null; }
interface YearStats  { year: number; balls: number; runs: number; dismissals: number; strike_rate: number | null; average: number | null; }
interface DismissalType { kind: string; count: number; }
interface VenueSplit {
  venue_type: string;
  label: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number | null;
  average: number | null;
}
interface FormatMatchup {
  format_bucket: string; balls: number; runs: number; dismissals: number;
  strike_rate: number | null; average: number | null;
  dot_ball_pct: number | null; boundary_pct: number | null;
  phases: PhaseStats[]; by_year: YearStats[];
  dismissal_types?: DismissalType[];
  venue_split?: VenueSplit[];
}
interface MatchupDelivery { date: string; over_number: number; ball_number: number; runs_batter: number; is_wicket: boolean; batting_team: string; bowling_team: string; venue: string | null; }
interface MatchupData {
  batter_id: string; batter_name: string | null; bowler_id: string; bowler_name: string | null;
  no_data: boolean;
  overall: { balls: number; runs: number; dismissals: number; strike_rate: number | null; average: number | null; dot_ball_pct: number | null; boundary_pct: number | null; };
  by_format: FormatMatchup[]; recent_deliveries: MatchupDelivery[];
}
interface Props { batterId: string; bowlerId: string; batterName: string; bowlerName: string; }

/* ── Helpers ──────────────────────────────────────────────── */
const f = (v: number | null | undefined, d = 2) => v != null ? v.toFixed(d) : "—";
const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

const FORMAT_ORDER = ["All", "Test", "ODI", "T20I", "IPL", "T20"];
const PHASE_ORDER  = ["powerplay", "middle", "death"];
const PHASE_LABELS: Record<string, string> = { powerplay: "Powerplay", middle: "Middle", death: "Death" };
const PHASE_COLORS: Record<string, string> = { powerplay: C.blue, middle: C.gold, death: C.red };
const PHASED_FMTS  = new Set(["All", "ODI", "T20I", "IPL", "T20"]);

const FORMAT_LABELS: Record<string, string> = {
  All: "All Formats",
  Test: "Tests",
  ODI: "ODIs",
  T20I: "T20Is",
  IPL: "IPL",
  T20: "T20s",
};

/* ball colour helper */
function ballStyle(runs: number, isW: boolean) {
  if (isW) return { bg: "color-mix(in srgb, var(--accent-red), transparent 90%)", color: C.red, bdr: "color-mix(in srgb, var(--accent-red), transparent 70%)" };
  if (runs === 6) return { bg: "color-mix(in srgb, var(--accent-gold), transparent 90%)", color: C.gold, bdr: "color-mix(in srgb, var(--accent-gold), transparent 70%)" };
  if (runs === 4) return { bg: "color-mix(in srgb, var(--accent-blue), transparent 90%)", color: C.blue, bdr: "color-mix(in srgb, var(--accent-blue), transparent 70%)" };
  if (runs > 0)   return { bg: "color-mix(in srgb, var(--accent-green), transparent 90%)", color: C.green, bdr: "color-mix(in srgb, var(--accent-green), transparent 70%)" };
  return { bg: "color-mix(in srgb, var(--text-muted), transparent 90%)", color: C.muted, bdr: C.border };
}

/* ── Component ────────────────────────────────────────────── */
export default function MatchupCard({ batterId, bowlerId, batterName, bowlerName }: Props) {
  const [matchup, setMatchup]         = useState<MatchupData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [activeTab, setActiveTab]     = useState<string | null>(null);
  const [yrOpen, setYrOpen]           = useState(true);
  const [allBalls, setAllBalls]       = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true); setNotFound(false); setAllBalls(false);
      try {
        const res = await fetch(`${API_URL}/api/v1/matchup?batter_id=${batterId}&bowler_id=${bowlerId}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("API error");
        const data: MatchupData = await res.json();
        if (data.no_data) { setNotFound(true); setMatchup(null); return; }
        setMatchup(data);
        /* auto-select first format tab */
        const sorted = FORMAT_ORDER.filter(fo => data.by_format.some(bf => bf.format_bucket === fo));
        setActiveTab(sorted[0] ?? null);
      } catch { setNotFound(true); } finally { setLoading(false); }
    })();
  }, [batterId, bowlerId]);

  /* ── Loading / Empty ───────────────────────────────────── */
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, borderRadius:18, padding:48 }}>
      <div style={{ width:24, height:24, border:`2px solid ${C.border}`, borderTopColor:C.green, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
    </div>
  );
  if (notFound || !matchup) return (
    <div style={{ background:C.bg, borderRadius:18, padding:"40px 24px", textAlign:"center", color:C.muted, fontSize:13, border:`1px solid ${C.border}` }}>
      These players have never faced each other in the database.
    </div>
  );

  const sorted = FORMAT_ORDER.map(fo => matchup.by_format.find(bf => bf.format_bucket === fo)).filter(Boolean) as FormatMatchup[];
  const activeFmt = sorted.find(s => s.format_bucket === activeTab) ?? sorted[0];

  /* advantage calc */
  const srAdv = (matchup.overall.strike_rate ?? 50);
  const batterEdge = Math.min(95, Math.max(5, srAdv / 2));
  const bowlerEdge = 100 - batterEdge;

  /* recent balls */
  const recentBalls = allBalls ? matchup.recent_deliveries : matchup.recent_deliveries.slice(0, 10);

  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"var(--font-sans)", fontSize:12, borderRadius:18, overflow:"hidden", width:"100%", maxWidth:"1000px", border:`1px solid ${C.border}`, boxShadow:"0 32px 80px rgba(0,0,0,0.45)", margin:"0 auto" }}>

      {/* ── Clash Header ─────────────────────────────────── */}
      <div style={{ background:C.low, borderBottom:`1px solid ${C.border}`, padding:"20px 20px 0" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", gap:12, marginBottom:16 }}>
          {/* Batter */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:44, height:44, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, flexShrink:0, background:"color-mix(in srgb, var(--accent-green), transparent 85%)", color:C.green, border:`2px solid ${C.green}` }}>
              {initials(batterName)}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:"-0.3px" }}>{batterName}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>Batter</div>
              <div style={{ display:"inline-block", background:"color-mix(in srgb, var(--accent-green), transparent 90%)", border:`1px solid color-mix(in srgb, var(--accent-green), transparent 80%)`, borderRadius:5, padding:"1px 6px", fontSize:9, color:C.green, marginTop:3 }}>BAT</div>
            </div>
          </div>
          {/* VS */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:C.highest, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:C.muted }}>VS</div>
            <div style={{ fontSize:8, color:C.muted }}>{matchup.overall.balls} balls</div>
          </div>
          {/* Bowler */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexDirection:"row-reverse", textAlign:"right" }}>
            <div style={{ width:44, height:44, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, flexShrink:0, background:"color-mix(in srgb, var(--accent-blue), transparent 85%)", color:C.blue, border:`2px solid ${C.blue}` }}>
              {initials(bowlerName)}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:"-0.3px" }}>{bowlerName}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>Bowler</div>
              <div style={{ display:"inline-block", background:"color-mix(in srgb, var(--accent-blue), transparent 90%)", border:`1px solid color-mix(in srgb, var(--accent-blue), transparent 80%)`, borderRadius:5, padding:"1px 6px", fontSize:9, color:C.blue, marginTop:3 }}>BOWL</div>
            </div>
          </div>
        </div>

        {/* ── Overall KPI strip ─────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", borderTop:`1px solid ${C.border}` }}>
          {([
            ["Balls", String(matchup.overall.balls), ""],
            ["Runs",  String(matchup.overall.runs), C.green],
            ["Dismissals",  String(matchup.overall.dismissals), C.red],
            ["Average",   f(matchup.overall.average), C.green],
            ["Strike Rate",    f(matchup.overall.strike_rate), ""],
            ["Dot Ball %", matchup.overall.dot_ball_pct != null ? `${f(matchup.overall.dot_ball_pct)}%` : "—", C.gold],
          ] as [string, string, string][]).map(([label, val, clr]) => (
            <div key={label} style={{ textAlign:"center", padding:"12px 4px", borderRight:`1px solid ${C.border}` }}>
              <div style={{ fontSize:17, fontWeight:800, lineHeight:1, letterSpacing:"-0.5px", color: clr || C.text }}>{val}</div>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".06em", marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Advantage bar ────────────────────────────────── */}
      <div style={{ padding:"10px 16px", background:C.mid, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ fontSize:9, color:C.green, whiteSpace:"nowrap" }}>Batter edge</div>
        <div style={{ flex:1, height:4, background:C.highest, borderRadius:2, overflow:"hidden", position:"relative" }}>
          <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:2, background:C.green, width:`${batterEdge}%` }} />
          <div style={{ position:"absolute", right:0, top:0, height:"100%", borderRadius:2, background:C.blue, width:`${bowlerEdge}%` }} />
          <div style={{ position:"absolute", left:"50%", top:-3, width:2, height:10, background:C.border, transform:"translateX(-50%)" }} />
        </div>
        <div style={{ fontSize:9, color:C.blue, whiteSpace:"nowrap" }}>Bowler edge</div>
      </div>

      {/* ── Recent deliveries ────────────────────────────── */}
      {matchup.recent_deliveries.length > 0 && (
        <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:8, background:C.low, borderBottom:`1px solid ${C.border}`, overflowX:"auto" }}>
          <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:".07em", flexShrink:0, marginRight:4 }}>Recent</div>
          {recentBalls.map((d, i) => {
            const bs = ballStyle(d.runs_batter, d.is_wicket);
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                {i > 0 && <div style={{ fontSize:9, color:C.muted }}>›</div>}
                <div title={`Over ${d.over_number}.${d.ball_number} — ${d.date}`} style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, border:`1.5px solid ${bs.bdr}`, background:bs.bg, color:bs.color }}>
                  {d.is_wicket ? "W" : d.runs_batter}
                </div>
              </div>
            );
          })}
          {matchup.recent_deliveries.length > 10 && (
            <div onClick={() => setAllBalls(!allBalls)} style={{ marginLeft:"auto", fontSize:10, color:C.green, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
              {allBalls ? "Show less" : "See all"} ›
            </div>
          )}
        </div>
      )}

      {/* ── Format tabs ──────────────────────────────────── */}
      {sorted.length > 0 && (
        <div style={{ display:"flex", gap:4, padding:"12px 16px", background:C.bg, borderBottom:`1px solid ${C.border}` }}>
          {sorted.map(fm => (
            <div key={fm.format_bucket} onClick={() => setActiveTab(fm.format_bucket)}
              style={{ padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", transition:"all .15s",
                color: activeTab === fm.format_bucket ? C.green : C.muted,
                background: activeTab === fm.format_bucket ? "color-mix(in srgb, var(--accent-green), transparent 90%)" : "transparent",
                border: `1px solid ${activeTab === fm.format_bucket ? "color-mix(in srgb, var(--accent-green), transparent 75%)" : "transparent"}`,
              }}>
              {FORMAT_LABELS[fm.format_bucket] || fm.format_bucket} <span style={{ display:"inline-block", background:C.highest, borderRadius:4, padding:"0 5px", fontSize:9, marginLeft:4, color:C.muted }}>{fm.balls}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Format detail ────────────────────────────────── */}
      {activeFmt && (
        <div style={{ padding:"12px 16px" }}>
          {/* Format KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
            {([
              ["Balls", String(activeFmt.balls), ""],
              ["Runs", String(activeFmt.runs), C.green],
              ["Wkts", String(activeFmt.dismissals), C.red],
              ["Average", f(activeFmt.average), C.green],
              ["Strike Rate", f(activeFmt.strike_rate), ""],
            ] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
                <div style={{ fontSize:15, fontWeight:800, lineHeight:1, color: c || C.text }}>{v}</div>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".05em", marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Dot% & Boundary% bar */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            <div style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".05em", marginBottom:6 }}>Dot Ball %</div>
              <div style={{ background:C.highest, height:5, borderRadius:3, overflow:"hidden", marginBottom:4 }}>
                <div style={{ height:5, borderRadius:3, background:C.red, width:`${activeFmt.dot_ball_pct ?? 0}%` }} />
              </div>
              <div style={{ fontSize:14, fontWeight:800, color:C.red }}>{activeFmt.dot_ball_pct != null ? `${f(activeFmt.dot_ball_pct)}%` : "—"}</div>
            </div>
            <div style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".05em", marginBottom:6 }}>Boundary %</div>
              <div style={{ background:C.highest, height:5, borderRadius:3, overflow:"hidden", marginBottom:4 }}>
                <div style={{ height:5, borderRadius:3, background:C.green, width:`${Math.min(100, (activeFmt.boundary_pct ?? 0) * 2)}%` }} />
              </div>
              <div style={{ fontSize:14, fontWeight:800, color:C.green }}>{activeFmt.boundary_pct != null ? `${f(activeFmt.boundary_pct)}%` : "—"}</div>
            </div>
          </div>

          {/* Dismissal Types */}
          {activeFmt.dismissal_types && activeFmt.dismissal_types.length > 0 && (
            <>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".07em", marginBottom:7 }}>Dismissal Types</div>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {activeFmt.dismissal_types.map(dt => (
                    <div key={dt.kind} style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", textAlign:"center", minWidth: 50 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:C.red, lineHeight:1 }}>{dt.count}</div>
                      <div style={{ fontSize:8, color:C.muted, textTransform:"capitalize", marginTop:4 }}>{dt.kind}</div>
                    </div>
                  ))}
                </div>
                {activeFmt.balls > 0 && (
                  <div style={{ flex:1, background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:6 }}>
                      <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".05em" }}>Dismissal Rate per 50 balls</div>
                      <div style={{ fontSize:14, fontWeight:800, color:C.red, lineHeight:1 }}>{f((activeFmt.dismissals / activeFmt.balls) * 50)}</div>
                    </div>
                    <div style={{ background:C.highest, height:4, borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:4, borderRadius:2, background:C.red, width:`${Math.min(100, (activeFmt.dismissals / activeFmt.balls) * 50 * 10)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Venue breakdown */}
          {activeFmt.venue_split && activeFmt.venue_split.length > 0 && (
            <>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".07em", marginBottom:7 }}>Venue breakdown</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"space-evenly", marginBottom:12 }}>
                {activeFmt.venue_split.map(vs => {
                  const clr = vs.venue_type === "home" ? C.green : vs.venue_type === "away" ? C.red : C.gold;
                  return (
                    <div key={vs.venue_type} style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:10, borderTop:`2px solid ${clr}`, flex:"1 1 120px", maxWidth:"calc(33.3% - 6px)", minWidth:100 }}>
                      <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:clr }}>{vs.venue_type}</div>
                      <div style={{ fontSize:8, color:C.muted, marginBottom:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{vs.label}</div>
                      
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, marginBottom:3 }}>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{vs.balls}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Balls</div>
                        </div>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{vs.runs}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Runs</div>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, marginBottom:6 }}>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color: vs.dismissals > 0 ? C.red : C.text }}>{vs.dismissals}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Wkts</div>
                        </div>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{f(vs.strike_rate, 1)}</div>
                          <div style={{ fontSize:8, color:C.muted }}>SR</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.high, borderRadius:5, padding:"5px 6px" }}>
                        <div style={{ fontSize:8, color:C.muted }}>Average</div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{f(vs.average)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Phase breakdown (for limited-overs) */}
          {activeFmt.format_bucket !== "Test" && PHASED_FMTS.has(activeFmt.format_bucket) && activeFmt.phases.length > 0 && (
            <>
              <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:".07em", marginBottom:7 }}>Phase breakdown</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"space-evenly", marginBottom:12 }}>
                {PHASE_ORDER.map(pn => {
                  const ph = activeFmt.phases.find(p => p.phase === pn);
                  if (!ph) return null;
                  const clr = PHASE_COLORS[pn] ?? C.text;
                  const wC = ph.dismissals > 0 ? C.red : C.text;
                  return (
                    <div key={pn} style={{ background:C.low, border:`1px solid ${C.border}`, borderRadius:10, padding:10, flex:"1 1 120px", maxWidth:"calc(33.3% - 6px)", minWidth:100 }}>
                      <div style={{ fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", marginBottom:8, color:clr }}>{PHASE_LABELS[pn]}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3 }}>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:clr }}>{f(ph.strike_rate, 1)}</div>
                          <div style={{ fontSize:8, color:C.muted }}>SR</div>
                        </div>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:wC }}>{ph.dismissals}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Wkts</div>
                        </div>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{ph.balls}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Balls</div>
                        </div>
                        <div style={{ background:C.high, borderRadius:5, padding:"5px 6px" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{ph.runs}</div>
                          <div style={{ fontSize:8, color:C.muted }}>Runs</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Year-by-year */}
          {activeFmt.by_year.length > 0 && (
            <>
              <div onClick={() => setYrOpen(!yrOpen)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, cursor:"pointer", padding:"8px 10px", background:C.high, borderRadius:8 }}>
                <span style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:".08em", textTransform:"uppercase" }}>Year-by-year breakdown</span>
                <span style={{ fontSize:10, color:C.muted, transition:"transform .2s", transform: yrOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
              </div>
              {yrOpen && (
                <div style={{ overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
                    <thead><tr>
                      {["Year","Balls","Runs","Wkts","Avg","SR"].map((h,i) => (
                        <th key={h} style={{ color:C.muted, padding:"6px 8px", fontWeight:500, fontSize:8, letterSpacing:".06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, textAlign: i===0 ? "left" : "right" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {[...activeFmt.by_year].sort((a,b) => b.year - a.year).map(y => (
                        <tr key={y.year} style={{ cursor:"default" }} onMouseEnter={e => (e.currentTarget.style.background = C.high)} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                          <td style={{ padding:"6px 8px", textAlign:"left", color:C.text, fontWeight:600, borderBottom:`1px solid ${C.border}` }}>{y.year}</td>
                          <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted, borderBottom:`1px solid ${C.border}` }}>{y.balls}</td>
                          <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted, borderBottom:`1px solid ${C.border}` }}>{y.runs}</td>
                          <td style={{ padding:"6px 8px", textAlign:"right", color: y.dismissals > 0 ? C.red : C.muted, borderBottom:`1px solid ${C.border}` }}>{y.dismissals}</td>
                          <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted, borderBottom:`1px solid ${C.border}` }}>{f(y.average)}</td>
                          <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted, borderBottom:`1px solid ${C.border}` }}>{f(y.strike_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
