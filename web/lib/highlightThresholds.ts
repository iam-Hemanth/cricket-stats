export type HighlightFormatKey =
  | "All"
  | "IPL"
  | "T20"
  | "T20I"
  | "ODI"
  | "ODM"
  | "Test"
  | "MDM";

export interface BattingHighlightThresholds {
  runsHigh: number;
  avgHigh: number;
  avgLow: number;
  srHigh: number;
  srLow: number;
  hsHigh: number;
  fiftiesHigh: number;
}

export interface BowlingHighlightThresholds {
  wicketsHigh: number;
  economyGood: number;
  economyBad: number;
}

export interface HeroBattingHighlightThresholds {
  hsHigh: number;
  fiftiesHigh: number;
}

const BATTING_THRESHOLDS: Record<HighlightFormatKey, BattingHighlightThresholds> = {
  All: {
    runsHigh: 1000,
    avgHigh: 50,
    avgLow: 30,
    srHigh: 95,
    srLow: 65,
    hsHigh: 140,
    fiftiesHigh: 6,
  },
  IPL: {
    runsHigh: 500,
    avgHigh: 40,
    avgLow: 20,
    srHigh: 150,
    srLow: 115,
    hsHigh: 80,
    fiftiesHigh: 4,
  },
  T20: {
    runsHigh: 500,
    avgHigh: 40,
    avgLow: 20,
    srHigh: 150,
    srLow: 115,
    hsHigh: 80,
    fiftiesHigh: 4,
  },
  T20I: {
    runsHigh: 500,
    avgHigh: 40,
    avgLow: 20,
    srHigh: 150,
    srLow: 115,
    hsHigh: 80,
    fiftiesHigh: 4,
  },
  ODI: {
    runsHigh: 900,
    avgHigh: 55,
    avgLow: 30,
    srHigh: 100,
    srLow: 75,
    hsHigh: 130,
    fiftiesHigh: 5,
  },
  ODM: {
    runsHigh: 900,
    avgHigh: 55,
    avgLow: 30,
    srHigh: 100,
    srLow: 75,
    hsHigh: 130,
    fiftiesHigh: 5,
  },
  Test: {
    runsHigh: 700,
    avgHigh: 50,
    avgLow: 30,
    srHigh: 70,
    srLow: 45,
    hsHigh: 150,
    fiftiesHigh: 4,
  },
  MDM: {
    runsHigh: 700,
    avgHigh: 50,
    avgLow: 30,
    srHigh: 70,
    srLow: 45,
    hsHigh: 150,
    fiftiesHigh: 4,
  },
};

const BOWLING_THRESHOLDS: Record<HighlightFormatKey, BowlingHighlightThresholds> = {
  All: {
    wicketsHigh: 45,
    economyGood: 5.2,
    economyBad: 7.4,
  },
  IPL: {
    wicketsHigh: 20,
    economyGood: 7.2,
    economyBad: 9.2,
  },
  T20: {
    wicketsHigh: 20,
    economyGood: 7.2,
    economyBad: 9.2,
  },
  T20I: {
    wicketsHigh: 20,
    economyGood: 7.2,
    economyBad: 9.2,
  },
  ODI: {
    wicketsHigh: 30,
    economyGood: 4.8,
    economyBad: 6.2,
  },
  ODM: {
    wicketsHigh: 30,
    economyGood: 4.8,
    economyBad: 6.2,
  },
  Test: {
    wicketsHigh: 35,
    economyGood: 3.2,
    economyBad: 4.2,
  },
  MDM: {
    wicketsHigh: 35,
    economyGood: 3.2,
    economyBad: 4.2,
  },
};

const HERO_BATTING_THRESHOLDS: Record<HighlightFormatKey, HeroBattingHighlightThresholds> = {
  All: {
    hsHigh: 180,
    fiftiesHigh: 30,
  },
  IPL: {
    hsHigh: 90,
    fiftiesHigh: 20,
  },
  T20: {
    hsHigh: 90,
    fiftiesHigh: 20,
  },
  T20I: {
    hsHigh: 90,
    fiftiesHigh: 20,
  },
  ODI: {
    hsHigh: 150,
    fiftiesHigh: 25,
  },
  ODM: {
    hsHigh: 150,
    fiftiesHigh: 25,
  },
  Test: {
    hsHigh: 200,
    fiftiesHigh: 25,
  },
  MDM: {
    hsHigh: 200,
    fiftiesHigh: 25,
  },
};

export function normalizeHighlightFormat(raw: string | null | undefined): HighlightFormatKey {
  if (!raw) return "All";
  const value = raw.trim().toUpperCase();
  if (value === "ALL") return "All";
  if (value === "IT20" || value === "T20I") return "T20I";
  if (value === "IPL") return "IPL";
  if (value === "T20") return "T20";
  if (value === "ODI") return "ODI";
  if (value === "ODM") return "ODM";
  if (value === "TEST") return "Test";
  if (value === "MDM") return "MDM";
  return "All";
}

export function getBattingHighlightThresholds(
  format: string | null | undefined
): BattingHighlightThresholds {
  return BATTING_THRESHOLDS[normalizeHighlightFormat(format)];
}

export function getBowlingHighlightThresholds(
  format: string | null | undefined
): BowlingHighlightThresholds {
  return BOWLING_THRESHOLDS[normalizeHighlightFormat(format)];
}

export function getHeroBattingHighlightThresholds(
  format: string | null | undefined
): HeroBattingHighlightThresholds {
  return HERO_BATTING_THRESHOLDS[normalizeHighlightFormat(format)];
}
