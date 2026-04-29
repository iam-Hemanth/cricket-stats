"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const RunChart = dynamic(() => import("./RunChart"), { ssr: false });

/* ── Types ─────────────────────────────────────────────── */
export interface BatterScorecard { batter_name:string; dismissal_text:string; runs:number; balls:number; fours:number; sixes:number; strike_rate:number; }
export interface BowlerScorecard { bowler_name:string; overs:number; maidens:number; runs:number; wickets:number; economy:number; wides:number; no_balls:number; }
export interface FallOfWicket { wicket_num?:number; runs:number; wickets:number; batter_name:string; over:number; over_ball?:number; }
export interface PartnershipScorecard { batter1_name:string; batter2_name:string; batter1_runs:number; batter2_runs:number; total_runs:number; total_balls:number; }
export interface InningScorecard {
  innings_id:number; inning_number:number; batting_team:string; bowling_team:string;
  total_runs:number; total_wickets:number; overs:number; extras:number; extras_detail:string;
  batters:BatterScorecard[]; bowlers:BowlerScorecard[]; fow:FallOfWicket[];
  partnerships:PartnershipScorecard[]; over_runs:number[]; timeline?:string[];
}
export interface MatchCardData {
  match_id:string; date:string; venue:string|null; city:string|null;
  format:string; competition:string|null; team1:string; team2:string;
  winner:string|null; win_margin:string|null; toss_winner:string|null;
  toss_decision:string|null; player_of_match:string|null; day_night:string|null;
  playing_xi:Record<string,unknown>|null; scorecard:InningScorecard[];
}

/* ── Helpers ───────────────────────────────────────────── */
const abbr=(t:string)=>{const m=t.match(/\b[A-Z]/g);return m?m.slice(0,3).join(""):t.slice(0,3).toUpperCase();};
const fmtOv=(o:number)=>Number.isInteger(o)?`${o}.0`:`${o}`;
const ordinal=(n:number)=>n===1?"1st":n===2?"2nd":n===3?"3rd":`${n}th`;
function parseExtras(s:string){const g=(k:string)=>{const m=s.match(new RegExp(`${k}\\s*(\\d+)`));return m?+m[1]:0;};return{b:g("b"),lb:g("lb"),w:g("w"),nb:g("nb")};}

const TEAM_COLORS:Record<string,[string,string]>={
  "Delhi Capitals":["#1a2430","#7bbdee"],"Royal Challengers Bengaluru":["#2e1a1a","#ff6b6b"],
  "Mumbai Indians":["#1a2440","#5ba2d9"],"Chennai Super Kings":["#2e2a1a","#ffd700"],
  "Kolkata Knight Riders":["#2a1a30","#a855f7"],"Rajasthan Royals":["#251a2e","#e879a0"],
  "Sunrisers Hyderabad":["#2e2018","#ff8c42"],"Punjab Kings":["#2e1a1a","#e74040"],
  "Gujarat Titans":["#1a2a2e","#5bc8d8"],"Lucknow Super Giants":["#1a2530","#5ea0d0"],
  "India":["#1a2018","#ff9933"],"Australia":["#2a2a18","#ffcd00"],
  "England":["#1a1a2e","#5555cc"],"Pakistan":["#1a2e1a","#01411c"],
};
const teamBg=(t:string)=>(TEAM_COLORS[t]??["#1e2228","#72808a"])[0];
const teamFg=(t:string)=>(TEAM_COLORS[t]??["#1e2228","#72808a"])[1];

/* ── Innings Accordion ─────────────────────────────────── */
function InningsBlock({inn,isWinner,potm,isSuperOver}:{inn:InningScorecard;isWinner:boolean;potm:string|null;isSuperOver?:boolean}){
  const [open,setOpen]=useState(true);
  const [tab,setTab]=useState<"bat"|"bowl">("bat");
  const fg=teamFg(inn.batting_team), bg=teamBg(inn.batting_team);
  const extras=parseExtras(inn.extras_detail??"");
  const played=inn.batters.filter(b=>b.dismissal_text!=="did not bat");
  const dnb=inn.batters.filter(b=>b.dismissal_text==="did not bat");

  return (
    <div style={{borderTop:"1px solid rgba(255,255,255,0.07)"}}>
      {/* Header */}
      <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:"#1c2026",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.07)",borderLeft:`3px solid ${fg}55`}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:28,height:28,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,background:bg,color:fg,border:`1px solid ${fg}33`}}>{abbr(inn.batting_team)}</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#e0e2eb"}}>{inn.batting_team} — {isSuperOver ? "Super Over" : `${ordinal(inn.inning_number)} Innings`}</div>
            <div style={{fontSize:8,color:"#72808a",marginTop:1}}>{fmtOv(inn.overs)} overs</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16,fontWeight:900,letterSpacing:"-0.5px",color:isWinner?"#4be277":fg}}>{inn.total_runs}/{inn.total_wickets}</span>
          <span style={{fontSize:10,color:"#72808a",transition:"transform .18s",transform:open?"rotate(0)":"rotate(-90deg)"}}>▼</span>
        </div>
      </div>

      {open && <>
        {/* Super Over Timeline */}
        {isSuperOver && inn.timeline && inn.timeline.length > 0 && (
          <div style={{padding:"10px 16px",background:"#10131a",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{fontSize:9,fontWeight:700,color:"#72808a",marginRight:2,textTransform:"uppercase",letterSpacing:".03em"}}>Timeline</div>
            {inn.timeline.map((b,i)=>{
              const isW = b.includes("W");
              const isB = b.includes("4") || b.includes("6");
              const bg = isW ? "rgba(226,75,75,0.12)" : isB ? "rgba(75,226,119,0.12)" : "rgba(255,255,255,0.04)";
              const color = isW ? "#e24b4b" : isB ? "#4be277" : "#b0b5c0";
              const bdr = isW ? "rgba(226,75,75,0.25)" : isB ? "rgba(75,226,119,0.25)" : "rgba(255,255,255,0.08)";
              return <div key={i} style={{fontSize:9.5,fontWeight:700,minWidth:26,height:26,padding:"0 4px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:13,background:bg,color,border:`1px solid ${bdr}`}}>{b}</div>
            })}
          </div>
        )}

        {/* Inner tabs */}
        <div style={{display:"flex",background:"#181c22",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          {(["bat","bowl"] as const).map(t=>(
            <div key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"7px 4px",textAlign:"center",fontSize:10,fontWeight:500,cursor:"pointer",
              color:tab===t?"#4be277":"#72808a",borderBottom:tab===t?"2px solid #4be277":"2px solid transparent",transition:"all .12s"}}>{t==="bat"?"Batting":"Bowling"}</div>
          ))}
        </div>

        {tab==="bat" && <div style={{overflowX:"auto"}}>
          {/* Batting table */}
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead><tr>
              {["BATTER","DISMISSAL","R","B","4S","6S","SR"].map((h,i)=>(
                <th key={h} style={{padding:"5px 7px",fontSize:8,fontWeight:500,color:"#72808a",textTransform:"uppercase",letterSpacing:".04em",borderBottom:"1px solid rgba(255,255,255,0.07)",textAlign:i<2?"left":"right",background:"#10131a",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {played.map((b,i)=>{
                const rClass=b.runs>=50?"#4be277":b.runs>=30?"#ffb95f":b.runs>=15?"#7bbdee":"";
                const srClass=(b.strike_rate??0)>=150?"#4be277":(b.strike_rate??0)>=100?"#ffb95f":"";
                return (
                  <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                    <td style={{padding:"5px 7px",color:"#e0e2eb",fontWeight:600,whiteSpace:"nowrap"}}>{b.batter_name}{b.dismissal_text==="not out"?" *":""}</td>
                    <td style={{padding:"5px 7px",fontSize:8.5,color:"#72808a",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.dismissal_text==="not out"?"not out":b.dismissal_text}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:rClass||"#72808a",fontWeight:rClass?700:400}}>{b.runs}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:"#72808a"}}>{b.balls}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:b.fours>0?"#4be277":"#72808a",fontWeight:b.fours>0?700:400}}>{b.fours}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:b.sixes>0?"#4be277":"#72808a",fontWeight:b.sixes>0?700:400}}>{b.sixes}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:srClass||"#72808a",fontWeight:srClass?700:400}}>{b.strike_rate?.toFixed(1)??"0.0"}</td>
                  </tr>
                );
              })}
              {dnb.map((b,i)=>(
                <tr key={`dnb-${i}`}><td style={{padding:"5px 7px",color:"#31353c",fontStyle:"italic"}}>{b.batter_name}</td>
                <td style={{padding:"5px 7px",fontSize:8.5,color:"#31353c",fontStyle:"italic"}}>dnb</td>
                {[...Array(5)].map((_,j)=><td key={j} style={{padding:"5px 7px",textAlign:"right",color:"#31353c"}}>—</td>)}</tr>
              ))}
            </tbody>
          </table>
          {/* Extras row */}
          <div style={{display:"flex",gap:4,padding:"8px 10px",background:"#181c22",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
            {[{v:inn.extras,l:"EXTRAS"},{v:extras.w,l:"WIDES",c:"#ffb95f"},{v:extras.nb,l:"NB",c:"#ff6b6b"},{v:extras.lb,l:"LB"},{v:extras.b,l:"BYES"}].map(({v,l,c})=>(
              <div key={l} style={{background:"#272a31",borderRadius:6,padding:"4px 7px",textAlign:"center",flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:c||"#e0e2eb"}}>{v}</div>
                <div style={{fontSize:7,color:"#72808a",textTransform:"uppercase",marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>
          {/* FOW */}
          {inn.fow.length>0 && (
            <div style={{padding:"8px 12px",background:"#10131a",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:7,color:"#72808a",textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Fall of wickets</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {inn.fow.map((f,i)=>(
                  <span key={i} style={{background:"#272a31",border:"1px solid rgba(255,255,255,0.07)",borderRadius:4,padding:"2px 6px",fontSize:8,color:"#72808a"}}>
                    <span style={{color:"#ff6b6b"}}>{f.wickets??f.wicket_num??i+1}</span>-{f.runs} ({f.batter_name},{f.over??f.over_ball})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>}

        {tab==="bowl" && <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead><tr>
              {[`BOWLER (${abbr(inn.bowling_team)})`,"O","M","R","W","ECON","WD","NB"].map((h,i)=>(
                <th key={h} style={{padding:"5px 7px",fontSize:8,fontWeight:500,color:"#72808a",textTransform:"uppercase",letterSpacing:".04em",borderBottom:"1px solid rgba(255,255,255,0.07)",textAlign:i===0?"left":"right",background:"#10131a",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {inn.bowlers.map((b,i)=>{
                const isPotm=potm&&b.bowler_name.includes(potm.split(" ").pop()??"__");
                return (
                  <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                    <td style={{padding:"5px 7px",color:"#e0e2eb",fontWeight:600,whiteSpace:"nowrap"}}>{b.bowler_name}{isPotm?" ⭐":""}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:"#72808a"}}>{fmtOv(b.overs)}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:"#72808a"}}>{b.maidens??0}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:b.runs<=15?"#4be277":"#72808a",fontWeight:b.runs<=15?700:400}}>{b.runs}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:b.wickets>=3?"#ff6b6b":b.wickets>=1?"#ffb95f":"#72808a",fontWeight:b.wickets>0?700:400}}>{b.wickets}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:(b.economy??99)<=6?"#4be277":(b.economy??0)>=10?"#ff6b6b":"#72808a",fontWeight:(b.economy??99)<=6||(b.economy??0)>=10?700:400}}>{b.economy!=null?b.economy.toFixed(2):"-"}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:"#72808a"}}>{b.wides}</td>
                    <td style={{padding:"5px 7px",textAlign:"right",color:"#72808a"}}>{b.no_balls}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </>}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function MatchCard({matchId}:{matchId:string}){
  const [data,setData]=useState<MatchCardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [showChart,setShowChart]=useState(false);

  useEffect(()=>{
    if(!matchId||matchId==="undefined")return;
    setLoading(true);setError(null);setData(null);
    fetch(`${process.env.NEXT_PUBLIC_API_URL??"http://localhost:8000"}/api/v1/match/${matchId}`)
      .then(r=>{if(!r.ok)throw new Error("Match not found");return r.json();})
      .then(d=>{setData(d);setLoading(false);})
      .catch(e=>{setError(e.message);setLoading(false);});
  },[matchId]);

  const chartData=useMemo(()=>{
    if(!data)return null;
    const isTest = data.format.toLowerCase().includes("test") || data.format.toLowerCase().includes("mdm");
    const regularScorecards = data.scorecard.filter(inn => isTest || inn.inning_number < 3);
    const colors=["#7bbdee","#ff6b6b","#4be277","#ffb95f"];
    const maxO=Math.max(...regularScorecards.map(i=>Math.ceil(i.overs)),20);
    const maxR=Math.max(...regularScorecards.flatMap(i=>i.over_runs??[]),10);
    const lines=regularScorecards.map((inn,idx)=>({
      label:`${abbr(inn.batting_team)} (Inn ${inn.inning_number})`,
      color:colors[idx%4],
      overRuns:inn.over_runs??[],maxOvers:maxO,
      fow:inn.fow??[],
    }));
    return {lines,maxRuns:Math.ceil(maxR/10)*10||80};
  },[data]);

  if(loading)return <div className="max-w-[780px] mx-auto animate-pulse space-y-3"><div className="h-48 rounded-xl bg-[#1c2026]"/><div className="h-32 rounded-xl bg-[#1c2026]"/><div className="h-64 rounded-xl bg-[#1c2026]"/></div>;
  if(error||!data)return <div className="max-w-[780px] mx-auto p-8 text-center rounded-xl border border-red-500/20 bg-red-500/5"><div className="text-4xl mb-3">🏏</div><div className="text-red-400 font-semibold">Error: {error??"Not found"}</div><Link href="/" className="mt-4 inline-block text-sm text-[#72808a] hover:text-white">← Back</Link></div>;

  const byTeam:Record<string,InningScorecard[]>={};
  data.scorecard.forEach(i=>(byTeam[i.batting_team]??=[]).push(i));
  const score=(t:string)=>(byTeam[t]??[]).map(i=>`${i.total_runs}/${i.total_wickets}`).join(" & ")||"–";
  const overs=(t:string)=>(byTeam[t]??[]).map(i=>`${fmtOv(i.overs)} overs`).join(" & ")||"";
  const firstBat=data.scorecard[0]?.batting_team??data.team1;
  const formatDate=(d:string)=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

  const isTest = data.format.toLowerCase().includes("test") || data.format.toLowerCase().includes("mdm");
  const regularScorecards = data.scorecard.filter(inn => isTest || inn.inning_number < 3);
  const superOvers = data.scorecard.filter(inn => !isTest && inn.inning_number >= 3);

  return (
    <div className="max-w-[780px] mx-auto" style={{background:"#10131a",color:"#e0e2eb",fontFamily:"-apple-system,'Inter',sans-serif",fontSize:12}}>
      {/* Back nav */}
      <div style={{padding:"8px 16px",display:"flex",alignItems:"center",gap:6}}>
        <Link href="/matches" style={{fontSize:11,color:"#72808a",textDecoration:"none"}}>← All Matches</Link>
        <span style={{fontSize:11,color:"#72808a"}}>·</span>
        <Link href={`/matches?team=${encodeURIComponent(data.team1)}&team2=${encodeURIComponent(data.team2)}`} style={{fontSize:11,color:"#72808a",textDecoration:"none"}}>H2H</Link>
      </div>

      {/* HERO */}
      <div style={{background:"#0d1510",padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        {/* Top pills */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:5,marginBottom:10}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            <span style={{background:"rgba(255,185,95,0.1)",border:"1px solid rgba(255,185,95,0.2)",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#ffb95f"}}>
              <Link href={`/matches?format=${data.format}`} style={{color:"inherit",textDecoration:"none"}}>{data.format}</Link>
              {data.competition && <>
                {" · "}
                <Link href={`/matches?competition=${encodeURIComponent(data.competition)}`} style={{color:"inherit",textDecoration:"none"}}>{data.competition}</Link>
              </>}
            </span>
            <span style={{background:"rgba(75,226,119,0.08)",border:"1px solid rgba(75,226,119,0.15)",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#4be277"}}>Completed</span>
          </div>
          <div style={{fontSize:9,color:"#72808a"}}>{formatDate(data.date)} · {data.venue??""}{data.city?`, ${data.city}`:""}</div>
        </div>

        {/* Teams */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:8,marginBottom:10}}>
          {/* Team 1 */}
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:36,height:36,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,background:teamBg(data.team1),color:teamFg(data.team1),border:`1px solid ${teamFg(data.team1)}33`}}>{abbr(data.team1)}</div>
            <div>
              <Link href={`/matches?team=${encodeURIComponent(data.team1)}`} style={{fontSize:12,fontWeight:800,color:"#e0e2eb",textDecoration:"none"}} className="hover:text-[#4be277] transition-colors">{data.team1}</Link>
              <div style={{fontSize:20,fontWeight:900,letterSpacing:"-0.8px",lineHeight:1,color:data.winner===data.team1?"#4be277":!data.winner?teamFg(data.team1):"#72808a"}}>{score(data.team1)}</div>
              <div style={{fontSize:9,color:"#72808a"}}>{overs(data.team1)}</div>
              {data.winner===data.team1&&<div style={{fontSize:8,background:"rgba(75,226,119,0.1)",border:"1px solid rgba(75,226,119,0.2)",color:"#4be277",borderRadius:4,padding:"1px 5px",marginTop:2,display:"inline-block"}}>Winner ✓</div>}
            </div>
          </div>
          {/* VS */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"#31353c",border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#72808a"}}>VS</div>
            <div style={{fontSize:8,color:"#72808a",textAlign:"center",marginTop:2}}>{abbr(firstBat)} bat {data.scorecard[0]?.inning_number===1?"1st":"2nd"}</div>
          </div>
          {/* Team 2 */}
          <div style={{display:"flex",alignItems:"center",gap:9,flexDirection:"row-reverse",textAlign:"right"}}>
            <div style={{width:36,height:36,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,background:teamBg(data.team2),color:teamFg(data.team2),border:`1px solid ${teamFg(data.team2)}33`}}>{abbr(data.team2)}</div>
            <div>
              <Link href={`/matches?team=${encodeURIComponent(data.team2)}`} style={{fontSize:12,fontWeight:800,color:"#e0e2eb",textDecoration:"none"}} className="hover:text-[#4be277] transition-colors">{data.team2}</Link>
              <div style={{fontSize:20,fontWeight:900,letterSpacing:"-0.8px",lineHeight:1,color:data.winner===data.team2?"#4be277":!data.winner?teamFg(data.team2):"#72808a"}}>{score(data.team2)}</div>
              <div style={{fontSize:9,color:"#72808a"}}>{overs(data.team2)}</div>
              {data.winner===data.team2&&<div style={{fontSize:8,background:"rgba(75,226,119,0.1)",border:"1px solid rgba(75,226,119,0.2)",color:"#4be277",borderRadius:4,padding:"1px 5px",marginTop:2,display:"inline-block"}}>Winner ✓</div>}
            </div>
          </div>
        </div>

        {/* Result */}
        {(()=>{
          let computedSOWinner = null;
          if (superOvers.length > 0 && (!data.winner || data.winner.toLowerCase() === "tie")) {
            const lastTwo = superOvers.slice(-2);
            if (lastTwo.length === 2 && lastTwo[0].batting_team !== lastTwo[1].batting_team) {
               if (lastTwo[0].total_runs > lastTwo[1].total_runs) computedSOWinner = lastTwo[0].batting_team;
               else if (lastTwo[1].total_runs > lastTwo[0].total_runs) computedSOWinner = lastTwo[1].batting_team;
            }
          }

          const finalWinner = (data.winner && data.winner.toLowerCase() !== "tie") ? data.winner : computedSOWinner;
          const wLower = finalWinner?.toLowerCase() || "";
          
          const isTie = wLower === "tie" || (superOvers.length > 0 && !finalWinner) || (data.winner?.toLowerCase() === "tie");
          const isDraw = wLower === "draw" || data.win_margin === "draw";
          const isNR = !finalWinner && !isTie && !isDraw;
          
          let resultText, rColor, rBg, rBorder, icon;

          if (superOvers.length > 0 && finalWinner && wLower !== "tie") {
            resultText = `Match Tied (${finalWinner} won Super Over)`;
            rColor = "#4be277"; rBg = "rgba(75,226,119,0.05)"; rBorder = "rgba(75,226,119,0.1)"; icon = "🏆";
          } else if (superOvers.length > 0) {
            resultText = "Match Tied (Super Over)";
            rColor = "#ffb95f"; rBg = "rgba(255,185,95,0.05)"; rBorder = "rgba(255,185,95,0.1)"; icon = "🤝";
          } else if (isNR) {
            resultText = "No Result";
            rColor = "#72808a"; rBg = "rgba(255,255,255,0.05)"; rBorder = "rgba(255,255,255,0.1)"; icon = "🤝";
          } else if (isTie) {
            resultText = "Match Tied";
            rColor = "#ffb95f"; rBg = "rgba(255,185,95,0.05)"; rBorder = "rgba(255,185,95,0.1)"; icon = "🤝";
          } else if (isDraw) {
            resultText = "Match Drawn";
            rColor = "#ffb95f"; rBg = "rgba(255,185,95,0.05)"; rBorder = "rgba(255,185,95,0.1)"; icon = "🤝";
          } else {
            resultText = data.win_margin === "Super Over" ? `${finalWinner} won (Super Over)` : `${finalWinner} won by ${data.win_margin}`;
            rColor = "#4be277"; rBg = "rgba(75,226,119,0.05)"; rBorder = "rgba(75,226,119,0.1)"; icon = "🏆";
          }

          return (
            <div style={{background:rBg,border:`1px solid ${rBorder}`,borderRadius:7,padding:"6px 10px",display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
              <span>{icon}</span>
              <span style={{fontSize:11,fontWeight:500}}>
                <b style={{color:rColor}}>{resultText}</b>
                {data.player_of_match&&<> &nbsp;·&nbsp; POTM: <b style={{color:"#ffb95f"}}><Link href={`/players/search?q=${encodeURIComponent(data.player_of_match)}`} style={{color:"inherit",textDecoration:"none"}} className="hover:underline">{data.player_of_match}</Link></b></>}
              </span>
            </div>
          );
        })()}

        {/* Info pills */}
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {data.toss_winner&&<span style={{background:"#272a31",border:"1px solid rgba(255,255,255,0.07)",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#72808a"}}>🪙 Toss: <b style={{color:"#e0e2eb"}}>{data.toss_winner}</b> chose to {data.toss_decision}</span>}
          {data.venue&&<span style={{background:"#272a31",border:"1px solid rgba(255,255,255,0.07)",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#72808a"}}>📍 <b style={{color:"#e0e2eb"}}>{data.venue}{data.city?`, ${data.city}`:""}</b></span>}
          {data.day_night&&<span style={{background:"#272a31",border:"1px solid rgba(255,255,255,0.07)",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#72808a"}}>{data.day_night==="day"?"☀️":"🌙"} <b style={{color:"#e0e2eb"}}>{data.day_night==="day"?"Day match":"Day/Night"}</b></span>}
        </div>
      </div>

      {/* RUN CHART */}
      {chartData&&chartData.lines.some(l=>l.overRuns.length>0)&&(
        <div style={{borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          <div 
            onClick={()=>setShowChart(!showChart)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",cursor:"pointer",userSelect:"none",background:"#1c2026"}}
          >
            <span style={{fontSize:10,fontWeight:700,color:"#e0e2eb",textTransform:"uppercase",letterSpacing:".07em"}}>Run Progression · Over by Over</span>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {chartData.lines.map((l,i)=>(
                <span key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#72808a"}}>
                  <span style={{width:16,height:2,borderRadius:1,display:"inline-block",background:l.color}}/>{l.label}
                </span>
              ))}
              <span style={{fontSize:10,color:"#72808a",transition:"transform .18s",transform:showChart?"rotate(0)":"rotate(-90deg)"}}>▼</span>
            </div>
          </div>
          {showChart && (
            <div style={{padding:"12px 16px",background:"#10131a"}}>
              <RunChart innings={chartData.lines} maxRuns={chartData.maxRuns}/>
            </div>
          )}
        </div>
      )}

      {/* INNINGS ACCORDIONS */}
      {regularScorecards.map(inn=>(
        <InningsBlock key={inn.innings_id} inn={inn} isWinner={inn.batting_team===data.winner} potm={data.player_of_match}/>
      ))}

      {/* SUPER OVERS SECTION */}
      {superOvers.length > 0 && (
        <div style={{ marginTop: 24, paddingBottom: 16 }}>
          <div style={{
            background: "rgba(255, 107, 107, 0.08)", 
            border: "1px solid rgba(255, 107, 107, 0.2)", 
            borderBottom: "none",
            borderRadius: "12px 12px 0 0", 
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12
          }}>
            <div style={{ background: "rgba(255, 107, 107, 0.2)", width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔥</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ff6b6b" }}>Super Over</div>
              <div style={{ fontSize: 10, color: "rgba(255, 107, 107, 0.8)", marginTop: 1 }}>Match decided by one-over eliminator</div>
            </div>
          </div>
          {superOvers.map(inn=>(
            <InningsBlock key={inn.innings_id} inn={inn} isWinner={inn.batting_team===data.winner} potm={data.player_of_match} isSuperOver={true}/>
          ))}
        </div>
      )}

      <div style={{height:80}}/>
    </div>
  );
}
