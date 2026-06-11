import { HIGHLIGHT_THRESHOLDS, type HighlightBucket } from "@/lib/highlights";

interface HeroStatProps {
  value: string | number | null;
  label: string;
  accent?: boolean;
  color?: string;
  highlightClass?: string;
  role: "batting" | "bowling";
}

function HeroStat({
  value,
  label,
  accent = false,
  color,
  highlightClass,
  role,
}: HeroStatProps) {
  const displayValue = value === null || value === undefined ? "—" : value;
  return (
    <div className={`profile-kc ${role === "batting" ? "profile-kc-bat" : "profile-kc-bowl"}`}>
      <div
        className={`profile-kc-v text-xl sm:text-2xl ${
          accent ? (role === "batting" ? "gradient-text-green" : "text-accent-blue") : ""
        } ${highlightClass ?? ""}`}
        style={color && !accent && !highlightClass ? { color } : undefined}
      >
        {displayValue}
      </div>
      <div className="profile-kc-l">
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
  five_w?: number;
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
      <div className="profile-kpi-strip grid grid-cols-4 sm:grid-cols-7">
        <HeroStat value={batting.runs.toLocaleString()} label="Runs" highlightClass={runsClass} role="batting" />
        <HeroStat
          value={batting.average !== null ? batting.average.toFixed(2) : null}
          label="Average"
          highlightClass={avgClass}
          role="batting"
        />
        <HeroStat
          value={batting.strike_rate !== null ? batting.strike_rate.toFixed(2) : null}
          label="Strike Rate"
          color="var(--accent-blue)"
          highlightClass={strikeRateClass}
          role="batting"
        />
        <HeroStat value={batting.hundreds} label="Centuries" highlightClass={hundredsClass} role="batting" />
        <HeroStat value={batting.fifties} label="Half-Cents" highlightClass={fiftiesClass} role="batting" />
        <HeroStat value={batting.highest_score} label="High Score" highlightClass={highScoreClass} role="batting" />
        <HeroStat value={batting.innings} label="Innings" role="batting" />
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
    const fiveWClass = bowling.five_w && bowling.five_w > 0 ? "stat-pop-gold" : undefined;

    return (
      <div className="profile-kpi-strip grid grid-cols-3 sm:grid-cols-6">
        <HeroStat value={bowling.wickets.toLocaleString()} label="Wickets" highlightClass={wicketsClass} role="bowling" />
        <HeroStat
          value={bowling.economy !== null ? bowling.economy.toFixed(2) : null}
          label="Economy"
          color="var(--accent-blue)"
          highlightClass={economyClass}
          role="bowling"
        />
        <HeroStat
          value={bowling.bowling_average !== null ? bowling.bowling_average.toFixed(2) : null}
          label="Average"
          role="bowling"
        />
        <HeroStat
          value={bowling.strike_rate !== null ? bowling.strike_rate.toFixed(1) : null}
          label="Strike Rate"
          color="var(--accent-gold)"
          role="bowling"
        />
        <HeroStat value={bowling.five_w ?? 0} label="5W Hauls" highlightClass={fiveWClass} role="bowling" />
        <HeroStat value={bowling.innings_bowled} label="Innings" role="bowling" />
      </div>
    );
  }

  return null;
}
