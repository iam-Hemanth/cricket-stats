export type HighlightBucket = "t20" | "odi" | "test" | "all";

type BattingThresholds = {
  runsGreen: number;
  avgGreen: number;
  avgRed: number;
  strikeRateGreen: number;
  strikeRateRed: number;
  highestScoreGold: number;
  fiftiesGold: number;
};

type BowlingThresholds = {
  wicketsBlue: number;
  economyGreen: number;
  economyRed: number;
};

type HeroThresholds = {
  highScoreGold: number;
  fiftiesGold: number;
};

export type HighlightThresholdSet = {
  batting: BattingThresholds;
  bowling: BowlingThresholds;
  hero: HeroThresholds;
};

export const HIGHLIGHT_THRESHOLDS: Record<HighlightBucket, HighlightThresholdSet> = {
  t20: {
    batting: {
      runsGreen: 500,
      avgGreen: 40,
      avgRed: 20,
      strikeRateGreen: 150,
      strikeRateRed: 115,
      highestScoreGold: 80,
      fiftiesGold: 4,
    },
    bowling: {
      wicketsBlue: 20,
      economyGreen: 7.2,
      economyRed: 9.2,
    },
    hero: {
      highScoreGold: 90,
      fiftiesGold: 20,
    },
  },
  odi: {
    batting: {
      runsGreen: 900,
      avgGreen: 55,
      avgRed: 30,
      strikeRateGreen: 100,
      strikeRateRed: 75,
      highestScoreGold: 130,
      fiftiesGold: 5,
    },
    bowling: {
      wicketsBlue: 30,
      economyGreen: 4.8,
      economyRed: 6.2,
    },
    hero: {
      highScoreGold: 150,
      fiftiesGold: 25,
    },
  },
  test: {
    batting: {
      runsGreen: 700,
      avgGreen: 50,
      avgRed: 30,
      strikeRateGreen: 70,
      strikeRateRed: 45,
      highestScoreGold: 150,
      fiftiesGold: 4,
    },
    bowling: {
      wicketsBlue: 35,
      economyGreen: 3.2,
      economyRed: 4.2,
    },
    hero: {
      highScoreGold: 200,
      fiftiesGold: 25,
    },
  },
  all: {
    batting: {
      runsGreen: 1200,
      avgGreen: 55,
      avgRed: 30,
      strikeRateGreen: 95,
      strikeRateRed: 65,
      highestScoreGold: 180,
      fiftiesGold: 12,
    },
    bowling: {
      wicketsBlue: 40,
      economyGreen: 4.8,
      economyRed: 6.2,
    },
    hero: {
      highScoreGold: 180,
      fiftiesGold: 30,
    },
  },
};

export function getHighlightBucketForFormat(format: string | null | undefined): HighlightBucket {
  const value = format?.toUpperCase();
  if (value === "T20" || value === "IT20" || value === "IPL" || value === "T20I") {
    return "t20";
  }
  if (value === "ODI" || value === "ODM") {
    return "odi";
  }
  if (value === "TEST" || value === "MDM") {
    return "test";
  }
  return "all";
}

export function getHighlightBucketForTab(tab: string | null | undefined): HighlightBucket {
  if (!tab || tab.toUpperCase() === "ALL") {
    return "all";
  }
  return getHighlightBucketForFormat(tab);
}
