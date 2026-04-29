import { HIGHLIGHT_THRESHOLDS, type HighlightBucket } from "@/lib/highlights";

interface HeroStatProps {
  value: string | number | null;
  label: string;
  accent?: boolean;
  color?: string;
  highlightClass?: string;
}

function HeroStat({
  value,
  label,
  accent = false,
  color,
  highlightClass,
}: HeroStatProps) {
  const displayValue = value === null || value === undefined ? "—" : value;
  return (
    <div className="flex flex-col items-start min-w-0">
      <div
        className={`hero-stat-value font-display text-2xl font-bold tracking-tight sm:text-3xl ${
          accent ? "gradient-text-green" : ""
        } ${highlightClass ?? ""}`}
        style={color && !accent && !highlightClass ? { color } : undefined}
      >
        {displayValue}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[--text-muted] truncate">
        {label}
      </div>
    </div>
  );
}

export interface BattingHeroStats {
  runs: number;
  average: number | null;
  strike_rate: number | null;
  hundreds: number;
  fifties: number;
  highest_score: number;
  innings: number;
}

export interface BowlingHeroStats {
  wickets: number;
  bowling_average: number | null;
  economy: number | null;
  strike_rate: number | null;
  innings_bowled: number;
}

interface HeroStatBarProps {
  batting?: BattingHeroStats | null;
  bowling?: BowlingHeroStats | null;
  role: "batting" | "bowling";
  highlightBucket?: HighlightBucket;
}

export default function HeroStatBar({
  batting,
  bowling,
  role,
  highlightBucket = "all",
}: HeroStatBarProps) {
  const thresholds = HIGHLIGHT_THRESHOLDS[highlightBucket];

  if (role === "batting" && batting) {
    const runsClass = batting.runs >= thresholds.batting.runsGreen ? "stat-pop-green" : undefined;
    const avgClass =
      batting.average !== null
        ? batting.average >= thresholds.batting.avgGreen
          ? "stat-pop-green"
          : batting.average < thresholds.batting.avgRed
          ? "stat-pop-red"
          : undefined
        : undefined;
    const strikeRateClass =
      batting.strike_rate !== null
        ? batting.strike_rate >= thresholds.batting.strikeRateGreen
          ? "stat-pop-green"
          : batting.strike_rate < thresholds.batting.strikeRateRed
          ? "stat-pop-red"
          : undefined
        : undefined;
    const hundredsClass = batting.hundreds > 0 ? "stat-pop-gold" : "stat-pop-red";
    const fiftiesClass =
      batting.fifties >= thresholds.hero.fiftiesGold
        ? "stat-pop-gold"
        : batting.fifties === 0
        ? "stat-pop-red"
        : undefined;
    const highScoreClass =
      batting.highest_score >= thresholds.hero.highScoreGold ? "stat-pop-gold" : undefined;

    return (
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-4 gap-y-3 rounded-2xl border border-[--glass-border] bg-[--bg-card] px-5 py-4 sm:px-6">
        <HeroStat value={batting.runs.toLocaleString()} label="Runs" highlightClass={runsClass} />
        <HeroStat
          value={batting.average !== null ? batting.average.toFixed(2) : null}
          label="Average"
          highlightClass={avgClass}
        />
        <HeroStat
          value={batting.strike_rate !== null ? batting.strike_rate.toFixed(2) : null}
          label="Strike Rate"
          color="var(--accent-blue)"
          highlightClass={strikeRateClass}
        />
        <HeroStat value={batting.hundreds} label="Centuries" highlightClass={hundredsClass} />
        <HeroStat value={batting.fifties} label="Half-Cents" highlightClass={fiftiesClass} />
        <HeroStat value={batting.highest_score} label="High Score" highlightClass={highScoreClass} />
        <HeroStat value={batting.innings} label="Innings" />
      </div>
    );
  }

  if (role === "bowling" && bowling) {
    const wicketsClass =
      bowling.wickets >= thresholds.bowling.wicketsBlue ? "stat-pop-blue" : undefined;
    const economyClass =
      bowling.economy !== null
        ? bowling.economy <= thresholds.bowling.economyGreen
          ? "stat-pop-green"
          : bowling.economy > thresholds.bowling.economyRed
          ? "stat-pop-red"
          : undefined
        : undefined;

    return (
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-3 rounded-2xl border border-[--glass-border] bg-[--bg-card] px-5 py-4 sm:px-6">
        <HeroStat value={bowling.wickets.toLocaleString()} label="Wickets" highlightClass={wicketsClass} />
        <HeroStat
          value={bowling.bowling_average !== null ? bowling.bowling_average.toFixed(2) : null}
          label="Average"
        />
        <HeroStat
          value={bowling.economy !== null ? bowling.economy.toFixed(2) : null}
          label="Economy"
          color="var(--accent-blue)"
          highlightClass={economyClass}
        />
        <HeroStat
          value={bowling.strike_rate !== null ? bowling.strike_rate.toFixed(1) : null}
          label="Strike Rate"
          color="var(--accent-gold)"
        />
        <HeroStat value={bowling.innings_bowled} label="Innings" />
      </div>
    );
  }

  return null;
}
