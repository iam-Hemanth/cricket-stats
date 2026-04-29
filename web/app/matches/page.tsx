"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import api, { type MatchListItem } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────
interface SeriesGroup {
  competition: string | null;
  type: "intl" | "ipl" | "wc" | "dom" | "other";
  format: string;
  matches: MatchListItem[];
  dateRange: string;
}

// ── Helpers ───────────────────────────────────────────────
function classifyType(competition: string | null, format: string): SeriesGroup["type"] {
  const c = (competition ?? "").toLowerCase();
  if (c.includes("world cup") || c.includes("champions trophy") || c.includes("world twenty20")) return "wc";
  if (c.includes("ipl") || c.includes("indian premier league")) return "ipl";
  if (c.includes("tour") || c.includes("series") || c.includes("international") || format === "Test" || format === "ODI" || format === "IT20") return "intl";
  if (c.includes("psl") || c.includes("big bash") || c.includes("cpl") || c.includes("sa20") || c.includes("hundred") || c.includes("bbl")) return "dom";
  return "other";
}

const TYPE_META: Record<SeriesGroup["type"], { label: string; cls: string }> = {
  intl:  { label: "International", cls: "t-intl" },
  ipl:   { label: "IPL",           cls: "t-ipl"  },
  wc:    { label: "World Cup",     cls: "t-wc"   },
  dom:   { label: "Domestic",      cls: "t-dom"  },
  other: { label: "Other",         cls: "t-other"},
};

const FORMAT_DISPLAY: Record<string, string> = {
  IT20: "T20I",
  ODM:  "List A",
  MDM:  "First-class",
};

function fmtLabel(f: string) { return FORMAT_DISPLAY[f] ?? f; }

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getDateRange(matches: MatchListItem[]): string {
  if (!matches.length) return "";
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const first = fmtDate(sorted[0].date);
  const last  = fmtDate(sorted[sorted.length - 1].date);
  return first === last ? first : `${first} – ${last}`;
}

function groupBySeries(matches: MatchListItem[]): SeriesGroup[] {
  const map = new Map<string, MatchListItem[]>();
  for (const m of matches) {
    const key = m.competition ?? `${m.team1}-vs-${m.team2}-${m.format}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).map(([key, ms]) => {
    const first = ms[0];
    const type = classifyType(first.competition, first.format);
    return {
      competition: first.competition ?? key,
      type,
      format: first.format,
      matches: ms.sort((a, b) => b.date.localeCompare(a.date)),
      dateRange: getDateRange(ms),
    };
  });
}

const YEARS = Array.from(
  { length: new Date().getFullYear() - 2006 + 1 },
  (_, i) => new Date().getFullYear() - i
);

const YEAR_GROUPS = [
  { label: `${new Date().getFullYear()} – 2020`, years: YEARS.filter(y => y >= 2020) },
  { label: "2019 – 2010", years: YEARS.filter(y => y >= 2010 && y < 2020) },
  { label: "2009 – 2007", years: YEARS.filter(y => y < 2010) },
];

type FilterType = "all" | "intl" | "ipl" | "wc" | "dom";

// ── Series Item ───────────────────────────────────────────
function SeriesItem({ series, defaultOpen }: { series: SeriesGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const meta = TYPE_META[series.type];

  return (
    <div className="series-item">
      {/* Series header */}
      <div
        className={`s-hdr${open ? " open" : ""}`}
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpen(!open)}
      >
        <span className={`s-type ${meta.cls}`}>{meta.label}</span>
        <span className="s-name">{series.competition}</span>
        <span className="s-dates">{series.dateRange}</span>
        <span className={`s-chev${open ? " open" : ""}`}>▼</span>
      </div>

      {/* Matches dropdown */}
      {open && (
        <div className="matches-drop open">
          {series.matches.map((m, mi) => {
            const isT1Win = m.winner === m.team1;
            const isT2Win = m.winner === m.team2;
            const wLower = m.winner?.toLowerCase() || "";
            const isTie = wLower === "tie";
            const isDraw = wLower === "draw";
            const isNR = !m.winner || wLower === "no result";
            
            const winColor = isT1Win ? "var(--green)" : isT2Win ? "var(--gold)" : "var(--muted)";
            
            let resultJSX;
            if (isNR) {
              resultJSX = <div className="m-winner" style={{ color: "var(--muted)" }}>No result</div>;
            } else if (isTie) {
              resultJSX = <div className="m-winner" style={{ color: "var(--muted)" }}>Match Tied</div>;
            } else if (isDraw) {
              resultJSX = <div className="m-winner" style={{ color: "var(--muted)" }}>Match Drawn</div>;
            } else {
              resultJSX = (
                <>
                  <div className="m-winner" style={{ color: winColor }}>{m.winner} won</div>
                  {m.win_margin && <div className="m-margin">{m.win_margin}</div>}
                </>
              );
            }

            return (
              <Link
                href={`/match/${m.match_id}`}
                key={m.match_id}
                className="m-item"
              >
                <span className="m-num">{mi + 1}</span>
                <div className="m-teams">
                  <div className="m-vs">{m.team1} vs {m.team2}</div>
                  {m.venue && <div className="m-sub">{m.venue}</div>}
                </div>
                <span className="m-fmt">{fmtLabel(m.format)}</span>
                <div className="m-result">
                  {resultJSX}
                </div>
                <span className="m-date">{fmtDate(m.date)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main inner ─────────────────────────────────────────────
function MatchesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initYear = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const initFilter = (searchParams.get("filter") ?? "all") as FilterType;

  const [currentYear, setCurrentYear]   = useState(initYear);
  const [currentFilter, setCurrentFilter] = useState<FilterType>(initFilter);
  const [matches, setMatches]            = useState<MatchListItem[]>([]);
  const [loading, setLoading]            = useState(true);

  const fetchYear = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const res = await api.getMatches({ year, page: 0 });
      // Fetch all pages for this year (most years have <500 matches)
      let all = res.matches;
      if (res.total > 200) {
        const pages = Math.ceil(res.total / 200);
        const extras = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            api.getMatches({ year, page: i + 1 })
          )
        );
        for (const e of extras) all = all.concat(e.matches);
      }
      setMatches(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchYear(currentYear); }, [currentYear, fetchYear]);

  const handleYearChange = (year: number) => {
    setCurrentYear(year);
    const p = new URLSearchParams({ year: String(year), filter: currentFilter });
    router.replace(`/matches?${p}`, { scroll: false });
  };

  const handleFilterChange = (f: FilterType) => {
    setCurrentFilter(f);
    const p = new URLSearchParams({ year: String(currentYear), filter: f });
    router.replace(`/matches?${p}`, { scroll: false });
  };

  const grouped = groupBySeries(matches);
  const filtered = currentFilter === "all"
    ? grouped
    : grouped.filter(s => s.type === currentFilter);

  return (
    <>
      {/* Inline CSS matching the reference design */}
      <style>{`
        .wrap{display:grid;grid-template-columns:1fr 240px;gap:0;min-height:600px;border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;background:#10131a}
        @media(max-width:640px){.wrap{grid-template-columns:1fr}.sidebar{border-left:none!important;border-top:1px solid rgba(255,255,255,0.07)}}
        .main{border-right:1px solid rgba(255,255,255,0.07)}
        .main-hdr{padding:14px 18px 10px;border-bottom:1px solid rgba(255,255,255,0.07);position:sticky;top:0;background:#10131a;z-index:10}
        .main-title{font-size:17px;font-weight:800;letter-spacing:-0.4px;color:#e0e2eb}
        .main-year{font-size:13px;color:#4be277;font-weight:700}
        .filter-row{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
        .ftag{background:#272a31;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:4px 11px;font-size:10px;color:#72808a;cursor:pointer;transition:all .12s;user-select:none}
        .ftag.active,.ftag:hover{background:rgba(75,226,119,0.1);border-color:rgba(75,226,119,0.3);color:#4be277}
        .year-lbl{padding:12px 18px 5px;font-size:10px;font-weight:700;color:#72808a;letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:8px}
        .year-lbl::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.07)}
        .series-item{border-bottom:1px solid rgba(255,255,255,0.07)}
        .s-hdr{display:flex;align-items:center;gap:10px;padding:10px 18px;cursor:pointer;transition:background .1s;user-select:none}
        .s-hdr:hover,.s-hdr.open{background:#181c22}
        .s-type{font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:4px;flex-shrink:0;min-width:52px;text-align:center}
        .t-intl{background:rgba(123,189,238,0.1);color:#7bbdee}
        .t-ipl{background:rgba(75,226,119,0.1);color:#4be277}
        .t-dom{background:rgba(209,123,238,0.12);color:#d17bee}
        .t-wc{background:rgba(255,185,95,0.12);color:#ffb95f}
        .t-other{background:rgba(255,255,255,0.05);color:#72808a}
        .s-name{flex:1;font-size:11px;font-weight:600;color:#e0e2eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .s-dates{font-size:9px;color:#72808a;flex-shrink:0;white-space:nowrap}
        .s-chev{font-size:9px;color:#72808a;transition:transform .18s;flex-shrink:0}
        .s-chev.open{transform:rotate(180deg)}
        .matches-drop{background:#181c22;border-bottom:1px solid rgba(255,255,255,0.07)}
        .m-item{display:flex;align-items:center;gap:10px;padding:8px 18px 8px 26px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:background .1s;text-decoration:none;color:inherit}
        .m-item:last-child{border-bottom:none}
        .m-item:hover{background:#272a31}
        .m-num{font-size:8px;color:#72808a;width:18px;flex-shrink:0;text-align:center}
        .m-teams{flex:1;min-width:0}
        .m-vs{font-size:11px;font-weight:600;color:#e0e2eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .m-sub{font-size:9px;color:#72808a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .m-result{font-size:9px;text-align:right;flex-shrink:0}
        .m-winner{font-weight:700}
        .m-margin{color:#72808a;font-size:8px}
        .m-date{font-size:8px;color:#72808a;width:52px;text-align:right;flex-shrink:0}
        .m-fmt{background:#31353c;border-radius:4px;padding:1px 5px;font-size:8px;color:#72808a;flex-shrink:0}
        .no-results{padding:32px 18px;text-align:center;color:#72808a;font-size:12px}
        .sidebar{padding:14px;background:#181c22}
        .sb-title{font-size:9px;font-weight:700;color:#72808a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .yr-group{margin-bottom:14px}
        .yr-group-lbl{font-size:8px;color:#72808a;margin-bottom:6px;letter-spacing:.06em}
        .yr-chips{display:flex;flex-wrap:wrap;gap:4px}
        .yc{background:#272a31;border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:4px 8px;font-size:10px;color:#72808a;cursor:pointer;transition:all .12s;user-select:none}
        .yc:hover{color:#e0e2eb;border-color:rgba(255,255,255,0.15)}
        .yc.active{background:rgba(75,226,119,0.12);border-color:rgba(75,226,119,0.35);color:#4be277;font-weight:700}
        .skeleton-series{height:42px;background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.07);animation:shimmer 1.4s infinite}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
      `}</style>

      <div className="wrap">
        {/* ── LEFT PANEL ───────────────────────────────────── */}
        <div className="main">
          <div className="main-hdr">
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div className="main-title">Series Archive</div>
              <div className="main-year">{currentYear}</div>
            </div>
            <div className="filter-row">
              {(["all", "intl", "ipl", "wc", "dom"] as FilterType[]).map(f => (
                <span
                  key={f}
                  className={`ftag${currentFilter === f ? " active" : ""}`}
                  onClick={() => handleFilterChange(f)}
                >
                  {f === "all" ? "All" : f === "intl" ? "International" : f === "ipl" ? "IPL" : f === "wc" ? "World Cups" : "Domestic"}
                </span>
              ))}
            </div>
          </div>

          {/* Series list */}
          <div id="series-list">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-series" />
              ))
            ) : filtered.length === 0 ? (
              <div className="no-results">
                No series found for {currentYear}
                {currentFilter !== "all" ? ` · ${currentFilter}` : ""}.
              </div>
            ) : (
              <>
                <div className="year-lbl">{currentYear}</div>
                {filtered.map((s, i) => (
                  <SeriesItem key={`${s.competition}-${i}`} series={s} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────── */}
        <div className="sidebar">
          <div className="sb-title">All Seasons</div>
          {YEAR_GROUPS.map(g => (
            <div key={g.label} className="yr-group">
              <div className="yr-group-lbl">{g.label}</div>
              <div className="yr-chips">
                {g.years.map(y => (
                  <span
                    key={y}
                    className={`yc${currentYear === y ? " active" : ""}`}
                    onClick={() => handleYearChange(y)}
                  >
                    {y}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function MatchesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#e0e2eb", letterSpacing: "-0.4px" }}>
          Matches
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "#72808a" }}>
          Browse by year · click a series to expand matches
        </p>
      </div>
      <Suspense fallback={
        <div style={{ height: 400, background: "#10131a", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)" }} />
      }>
        <MatchesPageInner />
      </Suspense>
    </div>
  );
}
