"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api, {
  type TeamH2HResponse,
  type TeamHeadToHead,
  type TeamSearchResult,
  type TopBatterH2H,
  type TopBowlerH2H,
} from "@/lib/api";

import { getTeamIdentity } from "@/lib/teamIdentity";
import { TeamLogo } from "@/components/TeamLogo";
import TeamSearchBarWithCallback from "@/components/TeamSearchBarWithCallback";

const FORMAT_ORDER = ["Test", "ODI", "T20I", "IPL", "T20"];

// TEAM_META and getTeamMeta logic migrated to web/lib/teamIdentity.ts

function formatDate(date: string): string {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getFormatName(fmt: string) {
  if (fmt === "all" || fmt === "All") return "All Formats";
  if (fmt === "Test") return "Tests";
  if (fmt === "ODI") return "ODIs";
  if (fmt === "T20I") return "T20Is";
  if (fmt === "IPL") return "IPL";
  if (fmt === "T20") return "All T20s";
  return fmt;
}



function getWinsForTeam(row: TeamHeadToHead, team: string): number {
  if (row.team_a === team) return row.team_a_wins;
  if (row.team_b === team) return row.team_b_wins;
  return 0;
}

function TeamsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [team1, setTeam1] = useState<string | null>(null);
  const [team2, setTeam2] = useState<string | null>(null);
  const [format, setFormat] = useState<string>("All");

  const [data, setData] = useState<TeamH2HResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topBatters, setTopBatters] = useState<TopBatterH2H[]>([]);
  const [topBowlers, setTopBowlers] = useState<TopBowlerH2H[]>([]);
  const [showMoreBatters, setShowMoreBatters] = useState(false);
  const [showMoreBowlers, setShowMoreBowlers] = useState(false);
  const [showMoreRecentMatches, setShowMoreRecentMatches] = useState(false);

  useEffect(() => {
    const qpTeam1 = searchParams.get("team1");
    const qpTeam2 = searchParams.get("team2");
    const qpFormat = searchParams.get("format");
    setTeam1(qpTeam1?.trim() || null);
    setTeam2(qpTeam2?.trim() || null);
    setFormat(qpFormat?.trim() || "All");
  }, [searchParams]);

  const updateUrl = (nextTeam1: string | null, nextTeam2: string | null, nextFormat: string) => {
    const qp = new URLSearchParams();
    if (nextTeam1) qp.set("team1", nextTeam1);
    if (nextTeam2) qp.set("team2", nextTeam2);
    if (nextFormat !== "All") qp.set("format", nextFormat);
    const qs = qp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  useEffect(() => {
    if (!team1 || !team2) {
      setData(null);
      setError(null);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const formatVal = format === "All" ? undefined : format;
        const payload = await api.getTeamH2H(team1, team2, formatVal);
        setData(payload);
        
        // Fetch top performers
        const [batters, bowlers] = await Promise.all([
          api.getTeamH2HTopBatters(team1, team2, formatVal),
          api.getTeamH2HTopBowlers(team1, team2, formatVal),
        ]);
        setTopBatters(batters);
        setTopBowlers(bowlers);
        setShowMoreBatters(false);
        setShowMoreBowlers(false);
        setShowMoreRecentMatches(false);
      } catch {
        setData(null);
        setError("Failed to load head-to-head data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [team1, team2, format]);

  const availableFormats = useMemo(() => {
    const fromData = new Set((data?.by_format ?? []).map((r) => r.format_bucket));
    const ordered = FORMAT_ORDER.filter((f) => fromData.has(f));
    return ["All", ...ordered];
  }, [data]);

  const overall = useMemo(() => {
    if (!data || !team1 || !team2 || data.by_format.length === 0) return null;

    const rows = format === "All" 
      ? data.by_format 
      : data.by_format.filter(r => r.format_bucket === format);

    if (rows.length === 0) return null;

    const matches = rows.reduce((sum, row) => sum + row.matches_played, 0);
    const t1Wins = rows.reduce((sum, row) => sum + getWinsForTeam(row, team1), 0);
    const t2Wins = rows.reduce((sum, row) => sum + getWinsForTeam(row, team2), 0);

    const weightedFirst = rows.reduce(
      (sum, row) => sum + (row.avg_first_innings ?? 0) * row.matches_played,
      0
    );
    const weightedSecond = rows.reduce(
      (sum, row) => sum + (row.avg_second_innings ?? 0) * row.matches_played,
      0
    );

    const firstMatch = rows
      .map((r) => r.first_match)
      .filter((r): r is string => Boolean(r))
      .sort()[0] ?? null;

    const highestTotal = rows.reduce(
      (max, row) => Math.max(max, row.highest_team_total ?? 0),
      0
    );

    return {
      matches,
      team1Wins: t1Wins,
      team2Wins: t2Wins,
      noResults: matches - (t1Wins + t2Wins), // Simple approximation for now
      avgFirst: matches > 0 ? Number((weightedFirst / matches).toFixed(1)) : null,
      avgSecond: matches > 0 ? Number((weightedSecond / matches).toFixed(1)) : null,
      firstPlayedYear: firstMatch ? new Date(firstMatch).getFullYear() : null,
      highestTotal: highestTotal || null,
    };
  }, [data, team1, team2]);

  const winPct = useMemo(() => {
    if (!overall || (overall.team1Wins + overall.team2Wins) === 0) return { team1: 50, team2: 50 };
    const totalWins = overall.team1Wins + overall.team2Wins;
    const t1 = Math.round((overall.team1Wins / totalWins) * 100);
    return { team1: t1, team2: 100 - t1 };
  }, [overall]);

  const meta1 = getTeamIdentity(team1 || "");
  const meta2 = getTeamIdentity(team2 || "");

  const color1 = meta1.primary;
  const color2 = (meta1.colorFamily && meta2.colorFamily && meta1.colorFamily === meta2.colorFamily) || (meta1.primary === meta2.primary) 
    ? meta2.secondary 
    : meta2.primary;

  return (
    <div className="mx-auto max-w-2xl">
      <style>{`
        .search-sec{padding:0 0 16px}
        .search-title{font-size:18px;font-weight:800;letter-spacing:-0.4px;margin-bottom:4px;color:var(--text-primary)}
        .search-sub{font-size:11px;color:var(--text-muted);margin-bottom:14px}
        .search-row{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:14px}
        @media(max-width:640px){.search-row{grid-template-columns:1fr;gap:16px}}
        .search-box{background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:10px;padding:0;overflow:hidden}
        .search-box.selected{border-color:rgba(75,226,119,0.3)}
        .sb-top{display:flex;align-items:center;gap:8px;padding:10px 12px}
        .sb-flag{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;font-weight:800;color:var(--text-primary)}
        .sb-name{font-size:13px;font-weight:700;flex:1}
        .sb-change{font-size:9px;color:var(--accent-green);cursor:pointer;font-weight:600}
        .vs-pill{width:36px;height:36px;border-radius:50%;background:var(--bg-card);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text-muted);flex-shrink:0;margin:0 auto}

        .fmt-tabs{display:flex;gap:6px;padding:0 0 20px;flex-wrap:wrap}
        .ft{padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;color:var(--text-muted);cursor:pointer;border:1px solid var(--glass-border);transition:all .15s;background:var(--bg-card)}
        .ft.active{background:color-mix(in srgb, var(--text-primary), transparent 90%);border-color:color-mix(in srgb, var(--text-primary), transparent 60%);color:var(--text-primary)}

        .h2h-hero{margin:0 0 20px;background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:14px;overflow:hidden}
        .h2h-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:20px 24px;border-bottom:1px solid var(--glass-border)}
        @media(max-width:640px){.h2h-top{padding:16px}}
        .ht-team{display:flex;flex-direction:column}
        .ht-team.r{align-items:flex-end;text-align:right}
        .ht-name{font-size:14px;font-weight:800;letter-spacing:-0.2px}
        .ht-wins{font-size:36px;font-weight:900;letter-spacing:-1.5px;line-height:1;margin-top:6px}
        .ht-lbl{font-size:10px;color:var(--text-muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
        .ht-mid{display:flex;flex-direction:column;align-items:center;gap:2px}
        .ht-total{font-size:12px;font-weight:800;color:var(--text-primary)}
        .ht-tsub{font-size:9px;color:var(--text-muted);margin-top:2px}

        .winbar{padding:0 24px 20px}
        .wb-track{height:8px;background:var(--bg-card);border-radius:4px;overflow:hidden;display:flex}
        .wb-ind{height:8px;border-radius:4px 0 0 4px;transition:width .5s ease-out;background:${color1}}
        .wb-aus{height:8px;border-radius:0 4px 4px 0;transition:width .5s ease-out;background:${color2}}
        .wb-labels{display:flex;justify-content:space-between;margin-top:6px}
        .wb-l{font-size:10px;font-weight:700}
        .wb-l.t1{color:${color1}}
        .wb-l.t2{color:${color2}}

        .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--glass-border)}
        @media(max-width:640px){.stats-grid{grid-template-columns:repeat(2,1fr);border-top:none}.sg{border-top:1px solid var(--glass-border)}.sg:nth-child(2n){border-right:none}}
        .sg{text-align:center;padding:14px 8px;border-right:1px solid var(--glass-border)}
        .sg:last-child{border-right:none}
        .sg-v{font-size:16px;font-weight:800;line-height:1}
        .sg-l{font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:4px;font-weight:600}

        .sec{padding:0 0 14px}
        .sec-t{font-size:9px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;display:flex;align-items:center;gap:10px}
        .sec-t::after{content:'';flex:1;height:1px;background:var(--glass-border)}

        .yby{margin:0 0 20px;background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:14px;padding:16px 20px}
        .yby-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
        .yby-t{font-size:10px;font-weight:800;color:var(--text-primary);text-transform:uppercase;letter-spacing:.05em}
        .yby-leg{display:flex;gap:12px}
        .ybl{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:600;color:var(--text-muted)}
        .ybld{width:10px;height:10px;border-radius:2px}
        .bar-wrap{display:flex;gap:4px;align-items:flex-end;height:80px;overflow-x:auto;padding-bottom:4px}
        .bar-wrap::-webkit-scrollbar{height:4px}
        .bar-wrap::-webkit-scrollbar-thumb{background:var(--bg-card);border-radius:2px}
        .yr-grp{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;min-width:32px}
        .yr-bars{display:flex;gap:2px;align-items:flex-end;height:60px}
        .ybar{width:12px;border-radius:2px 2px 0 0;min-height:2px;transition:height .3s}
        .yr-lbl{font-size:8px;font-weight:600;color:var(--text-muted);white-space:nowrap}

        .perf-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:768px){.perf-grid{grid-template-columns:1fr}}
        .perf-card{background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:12px;overflow:hidden}
        .pc-hdr{padding:12px 16px;border-bottom:1px solid var(--glass-border);display:flex;align-items:center;gap:8px}
        .pc-flag{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}
        .pc-title{font-size:10px;font-weight:800;color:var(--text-primary);text-transform:uppercase;letter-spacing:.05em}
        .pc-sub{font-size:9px;color:var(--text-muted);margin-left:auto;font-weight:600}
        .p-row{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid color-mix(in srgb, var(--glass-border), transparent 50%)}
        .p-row:last-child{border-bottom:none}
        .p-rank{font-size:10px;font-weight:700;color:var(--text-muted);width:16px;flex-shrink:0;text-align:center}
        .pav{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;color:var(--text-primary)}
        .p-name{flex:1;font-size:12px;font-weight:700;color:var(--text-primary)}
        .p-meta{font-size:9px;color:var(--text-muted);margin-top:2px;font-weight:500}
        .p-stat{text-align:right;flex-shrink:0}
        .p-sv{font-size:14px;font-weight:800}
        .p-sl{font-size:9px;color:var(--text-muted);margin-top:1px;font-weight:600}

        .rmatch{background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:background .15s}
        .rmatch:hover{background:var(--bg-card)}
        .rmatch.knockout{
          background: #2a2210 !important;
          background: linear-gradient(135deg, rgba(255, 185, 95, 0.15) 0%, rgba(255, 185, 95, 0.05) 100%) !important;
          border: 1px solid rgba(255, 185, 95, 0.5) !important;
          box-shadow: 0 4px 20px -5px rgba(255, 185, 95, 0.2);
        }
        .rmatch.knockout .rm-fmt{
          background: #ffb95f !important;
          color: #10131a !important;
          font-weight: 900 !important;
          border: none !important;
        }
        .rmatch.home-glow-t1{
          border-left: 4px solid var(--t1-color) !important;
          box-shadow: -10px 0 30px -15px var(--t1-color);
        }
        .match-card-sm.home-glow-t2 {
          border-right: 3px solid var(--t2-color) !important;
          box-shadow: 8px 0 20px -10px var(--t2-color);
        }
        .rmatch.neutral-glow {
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          box-shadow: 0 4px 15px -5px rgba(255, 255, 255, 0.08);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01)) !important;
          transition: all 0.3s ease;
        }
        .rmatch.neutral-glow:hover {
          border-color: rgba(255, 255, 255, 0.25) !important;
          box-shadow: 0 4px 20px -2px rgba(255, 255, 255, 0.12);
        }
        .rmatch.home-glow-t2{
          border-left: 4px solid var(--t2-color) !important;
          box-shadow: -10px 0 30px -15px var(--t2-color);
        }
        .rm-win-t1 { color: var(--t1-color) !important; }
        .rm-win-t2 { color: var(--t2-color) !important; }
        .rm-win-muted { color: var(--text-muted) !important; }
        .rm-fmt{background:var(--bg-card);border:1px solid var(--glass-border);border-radius:6px;padding:3px 8px;font-size:9px;font-weight:800;color:var(--text-muted);flex-shrink:0}
        .rm-teams{flex:1;min-width:0}
        .rm-vs{font-size:12px;font-weight:800;color:var(--text-primary)}
        .rm-sub{font-size:10px;font-weight:500;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rm-result{text-align:right;flex-shrink:0}
        .rm-winner{font-size:11px;font-weight:800}
        .rm-margin{font-size:10px;color:var(--text-primary);margin-top:4px;font-weight:900;text-transform:uppercase;letter-spacing:0.02em;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;display:inline-block}
        .rm-date{font-size:10px;font-weight:600;color:var(--text-muted);width:60px;text-align:right;flex-shrink:0}
        .show-more-btn{width:100%;padding:12px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;justify-content:center;gap:4px;border-top:1px solid var(--glass-border);transition:all 0.2s;cursor:pointer;background:transparent}
        .show-more-btn:hover{color:var(--text-primary);background:rgba(255,255,255,0.02)}
        .show-more-btn.standalone{border:1px solid var(--glass-border);border-radius:12px;background:var(--bg-card);margin-top:8px}
      `}</style>

      <div className="search-sec">
        <div className="search-title">Team vs Team</div>
        <div className="search-sub">Select two teams to compare head-to-head statistics</div>
        <div className="search-row">
          {team1 ? (
            <div className="search-box selected" style={{ borderColor: `color-mix(in srgb, ${meta1.primary}, transparent 70%)` }}>
              <div className="sb-top">
                <TeamLogo teamName={team1} size={32} />
                <div className="sb-name">{team1}</div>
                <span className="sb-change" style={{ color: meta1.primary }} onClick={() => { setTeam1(null); setFormat("All"); updateUrl(null, team2, "All"); }}>Change ↓</span>
              </div>
            </div>
          ) : (
            <TeamSearchBarWithCallback
              onSelect={(val) => {
                setTeam1(val);
                updateUrl(val, team2, format);
              }}
              placeholder="Search Team 1..."
            />
          )}

          <div className="vs-pill">VS</div>

          {team2 ? (
            <div className="search-box selected right" style={{ borderColor: `color-mix(in srgb, ${meta2.primary}, transparent 70%)` }}>
              <div className="sb-top">
                <TeamLogo teamName={team2} size={32} />
                <div className="sb-name">{team2}</div>
                <span className="sb-change" style={{ color: meta2.primary }} onClick={() => { setTeam2(null); setFormat("All"); updateUrl(team1, null, "All"); }}>Change ↓</span>
              </div>
            </div>
          ) : (
            <TeamSearchBarWithCallback
              onSelect={(val) => {
                setTeam2(val);
                updateUrl(team1, val, format);
              }}
              placeholder="Search Team 2..."
            />
          )}
        </div>
      </div>

      {team1 && team2 && data && availableFormats.length > 0 && (
        <div className="fmt-tabs">
          {availableFormats.map(f => (
            <span key={f} className={`ft ${format === f ? 'active' : ''}`} onClick={() => { setFormat(f); updateUrl(team1, team2, f); }}>
              {getFormatName(f)}
            </span>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-text-muted">Loading head-to-head data...</p>}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {team1 && team2 && !loading && !error && overall && data && (
        <>
          <div className="h2h-hero">
            <div className="h2h-top">
              <div className="ht-team">
                <TeamLogo teamName={team1} size={48} loading="eager" className="mb-2" showFallbackText={false} />
                <div className="ht-name">{team1}</div>
                <div className="ht-wins" style={{ color: color1 }}>{overall.team1Wins}</div>
                <div className="ht-lbl">Wins</div>
              </div>
              <div className="ht-mid">
                <div className="ht-total">{overall.matches} Matches</div>
                <div className="ht-tsub">{overall.firstPlayedYear ? `Since ${overall.firstPlayedYear}` : ""}</div>
                {overall.noResults > 0 && (
                  <div style={{ marginTop: 8, textAlign: "center", background: "var(--bg-card)", borderRadius: 6, padding: "4px 8px" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)" }}>{overall.noResults}</div>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>No result</div>
                  </div>
                )}
              </div>
              <div className="ht-team r">
                <TeamLogo teamName={team2} size={48} loading="eager" className="mb-2" showFallbackText={false} />
                <div className="ht-name">{team2}</div>
                <div className="ht-wins" style={{ color: color2 }}>{overall.team2Wins}</div>
                <div className="ht-lbl">Wins</div>
              </div>
            </div>
            
            {(overall.team1Wins > 0 || overall.team2Wins > 0) && (
              <div className="winbar">
                <div className="wb-track">
                  <div className="wb-ind" style={{ width: `${winPct.team1}%`, background: color1 }}></div>
                  <div className="wb-aus" style={{ width: `${winPct.team2}%`, background: color2 }}></div>
                </div>
                <div className="wb-labels">
                  <span className="wb-l flex items-center" style={{ color: color1 }}><TeamLogo teamName={team1} size={12} className="inline-block mr-1" showFallbackText={false} />{meta1.abbr} {winPct.team1}%</span>
                  <span className="wb-l flex items-center" style={{ color: color2 }}><TeamLogo teamName={team2} size={12} className="inline-block mr-1" showFallbackText={false} />{meta2.abbr} {winPct.team2}%</span>
                </div>
              </div>
            )}

            <div className="stats-grid">
              <div className="sg"><div className="sg-v" style={{ color: color1 }}>{overall.avgFirst ?? "-"}</div><div className="sg-l">Avg 1st Inn</div></div>
              <div className="sg"><div className="sg-v" style={{ color: "var(--text-primary)" }}>{overall.avgSecond ?? "-"}</div><div className="sg-l">Avg 2nd Inn</div></div>
              <div className="sg"><div className="sg-v" style={{ color: color2 }}>{overall.highestTotal ?? "-"}</div><div className="sg-l">Highest Total</div></div>
              <div className="sg"><div className="sg-v" style={{ fontSize: 12, color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>{getFormatName(format)}</div><div className="sg-l">Selected</div></div>
            </div>
          </div>

          {/* Year by Year Chart */}
          {(() => {
            const seasons = data.seasons.filter(s => format === "All" ? true : s.format_bucket === format);
            if (seasons.length === 0) return null;
            
            const maxWins = Math.max(1, ...seasons.map(s => Math.max(s.team_a_wins, s.team_b_wins)));
            const team1IsTeamA = team1.localeCompare(team2) < 0;
            
            return (
              <div className="yby">
                <div className="yby-hdr">
                  <span className="yby-t">Year by Year · Wins</span>
                  <div className="yby-leg">
                    <span className="ybl"><TeamLogo teamName={team1} size={12} className="inline-block" showFallbackText={false} /> {meta1.abbr}</span>
                    <span className="ybl"><TeamLogo teamName={team2} size={12} className="inline-block" showFallbackText={false} /> {meta2.abbr}</span>
                  </div>
                </div>
                <div className="bar-wrap">
                  {seasons.map(s => {
                    const w1 = team1IsTeamA ? s.team_a_wins : s.team_b_wins;
                    const w2 = team1IsTeamA ? s.team_b_wins : s.team_a_wins;
                    const h1 = Math.max((w1 / maxWins) * 60, 2);
                    const h2 = Math.max((w2 / maxWins) * 60, 2);
                    
                    return (
                      <div className="yr-grp" key={`${s.year}-${s.format_bucket}`}>
                        <div className="yr-bars">
                          <div className="ybar" style={{ height: h1, background: color1 }} title={`${meta1.abbr}: ${w1}`}></div>
                          <div className="ybar" style={{ height: h2, background: color2 }} title={`${meta2.abbr}: ${w2}`}></div>
                        </div>
                        <div className="yr-lbl">{String(s.year).slice(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Top Performers */}
          {(topBatters.length > 0 || topBowlers.length > 0) && (
            <>
              <div className="sec"><div className="sec-t">Top Performers</div></div>
              <div className="perf-grid mb-6">
                
                {/* Batters */}
                {topBatters.length > 0 && (
                  <div className="perf-card">
                    <div className="pc-hdr">
                      <div className="pc-flag" style={{ background: `color-mix(in srgb, var(--accent-gold), transparent 80%)`, color: "var(--accent-gold)", fontSize: '10px' }}>⭐</div>
                      <span className="pc-title">Matchup · Top Batters</span>
                      <span className="pc-sub">{team1} & {team2}</span>
                    </div>
                    {topBatters.slice(0, showMoreBatters ? 15 : 5).map((p, i) => {
                      // Player initials
                      const inits = p.player_name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
                      return (
                        <Link href={`/players/${p.player_id}`} key={p.player_id} className="p-row hover:bg-bg-card transition-colors">
                          <span className="p-rank">{i+1}</span>
                          <div className="pav" style={{ background: `color-mix(in srgb, var(--accent-gold), transparent 85%)`, color: "var(--accent-gold)" }}>{inits}</div>
                          <div className="p-name">{p.player_name}<div className="p-meta">{p.innings} innings</div></div>
                          <div className="p-stat"><div className="p-sv" style={{ color: "var(--accent-gold)" }}>{p.runs}</div><div className="p-sl">runs</div></div>
                        </Link>
                      );
                    })}
                    {topBatters.length > 5 && (
                      <button className="show-more-btn" onClick={() => setShowMoreBatters(!showMoreBatters)}>
                        {showMoreBatters ? "↑ Show Less" : "↓ Show More"}
                      </button>
                    )}
                  </div>
                )}

                {/* Bowlers */}
                {topBowlers.length > 0 && (
                  <div className="perf-card">
                    <div className="pc-hdr">
                      <div className="pc-flag" style={{ background: `color-mix(in srgb, var(--accent-gold), transparent 80%)`, color: "var(--accent-gold)", fontSize: '10px' }}>⭐</div>
                      <span className="pc-title">Matchup · Top Bowlers</span>
                      <span className="pc-sub">{team1} & {team2}</span>
                    </div>
                    {topBowlers.slice(0, showMoreBowlers ? 15 : 5).map((p, i) => {
                      const inits = p.player_name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
                      return (
                        <Link href={`/players/${p.player_id}`} key={p.player_id} className="p-row hover:bg-bg-card transition-colors">
                          <span className="p-rank">{i+1}</span>
                          <div className="pav" style={{ background: `color-mix(in srgb, var(--accent-gold), transparent 85%)`, color: "var(--accent-gold)" }}>{inits}</div>
                          <div className="p-name">{p.player_name}<div className="p-meta">{p.innings_bowled} innings</div></div>
                          <div className="p-stat"><div className="p-sv" style={{ color: "var(--accent-red)" }}>{p.wickets}</div><div className="p-sl">wickets</div></div>
                        </Link>
                      );
                    })}
                    {topBowlers.length > 5 && (
                      <button className="show-more-btn" onClick={() => setShowMoreBowlers(!showMoreBowlers)}>
                        {showMoreBowlers ? "↑ Show Less" : "↓ Show More"}
                      </button>
                    )}
                  </div>
                )}
                
              </div>
            </>
          )}

          {/* Recent Matches */}
          <div className="sec"><div className="sec-t">Recent Matches · {getFormatName(format)}</div></div>
          <div>
            {data.recent_matches.length === 0 ? (
              <p className="text-sm text-text-muted">No recent matches found.</p>
            ) : (
              <>
                {data.recent_matches.slice(0, showMoreRecentMatches ? 15 : 5).map(m => {
                  const winnerColor = m.winner === team1 ? color1 : m.winner === team2 ? color2 : "var(--text-primary)";
                  let margin = "result unavailable";
                  if (m.win_by_runs && m.win_by_runs > 0) margin = `${m.win_by_runs} runs`;
                  else if (m.win_by_wickets && m.win_by_wickets > 0) margin = `${m.win_by_wickets} wkts`;

                  const inns = m.batting_first === team1 ? `${meta1.abbr} v ${meta2.abbr}` : `${meta2.abbr} v ${meta1.abbr}`;
                  
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
                    <Link 
                      href={`/match/${m.match_id}`} 
                      key={m.match_id} 
                      className={`rmatch ${isKnockout ? 'knockout' : isHomeT1 ? 'home-glow-t1' : isHomeT2 ? 'home-glow-t2' : 'neutral-glow'}`}
                      style={{ 
                        '--t1-color': color1, 
                        '--t2-color': color2 
                      } as any}
                    >
                      <span className="rm-fmt">{isKnockout ? (m.match_stage || m.format_bucket) : m.format_bucket}</span>
                      <div className="rm-teams">
                        <div className="rm-vs flex items-center gap-1.5 flex-wrap">
                          <TeamLogo teamName={team1} size={14} showFallbackText={false} /> {team1} <span className="text-[10px] text-text-muted font-medium mx-0.5">vs</span> <TeamLogo teamName={team2} size={14} showFallbackText={false} /> {team2}
                          {m.match_stage && (
                            <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center' }}>
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
                              <span style={{ 
                                marginLeft: 10, 
                                fontSize: '9px', 
                                color: isKnockout ? '#ffb95f' : '#72808a',
                                fontWeight: 800,
                                textTransform: 'uppercase'
                              }}>
                                {m.match_stage}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="rm-sub">{m.venue || "Unknown"} · {inns} bat first ({m.first_innings_score ?? "-"})</div>
                      </div>
                      <div className="rm-result">
                        <div className="rm-winner" style={{ color: winnerColor }}>{m.winner}</div>
                        <div className="rm-margin">{m.winner && m.winner !== "No Result" && m.winner !== "Draw" && m.winner !== "Tie" ? margin : ""}</div>
                      </div>
                      <div className="rm-date">{formatDate(m.date)}</div>
                    </Link>
                  );
                })}
                {data.recent_matches.length > 5 && (
                  <button 
                    className="show-more-btn standalone"
                    onClick={() => setShowMoreRecentMatches(!showMoreRecentMatches)}
                  >
                    {showMoreRecentMatches ? "↑ Show Less" : "↓ Show More"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TeamsPage() {
  return (
    <Suspense fallback={<div className="text-text-muted">Loading...</div>}>
      <TeamsPageInner />
    </Suspense>
  );
}
