"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { getTeamIdentity } from "@/lib/teamIdentity";
import { TeamLogo } from "@/components/TeamLogo";

const C = {
  bg: "var(--bg-base)",
  low: "var(--bg-surface)",
  mid: "var(--bg-card)",
  high: "var(--bg-card-hover)",
  green: "var(--accent-green)",
  gold: "var(--accent-gold)",
  red: "var(--accent-red)",
  blue: "var(--accent-blue)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  border: "var(--glass-border)",
};

const PALETTE = [
  "#00e87a", "#3b9eff", "#f0b429", "#9b6dff", "#ff4040", "#ff7043",
  "#26c6da", "#ab47bc", "#66bb6a", "#ffa726", "#29b6f6", "#ec407a",
  "#8d6e63", "#78909c", "#d4e157",
];

const DEFAULT_SELECT_COUNT = 15;
const MAX_PLOT = 50;

type ColumnDef = { id: string; label: string };

type GraphRow = {
  rank?: number;
  label: string;
  sub_label?: string | null;
  [key: string]: string | number | null | undefined;
};

type StatType = "bat" | "bowl" | "team" | "team_bat" | "team_bowl" | "team_compare" | "h2h";

type ChartKind =
  | "line"
  | "area"
  | "slope"
  | "stream"
  | "bar"
  | "column"
  | "groupedBar"
  | "stackedBar"
  | "groupedCol"
  | "dot"
  | "pyramid"
  | "arrow"
  | "pie"
  | "donut"
  | "waffle"
  | "treemap"
  | "proportional"
  | "parliament"
  | "scatter"
  | "bubble"
  | "heatmap"
  | "radar";

type Props = {
  rows: GraphRow[];
  columns: ColumnDef[];
  statType: StatType;
  sortBy: string;
  groupBy: string;
};

const CHART_GROUPS: { title: string; types: ChartKind[] }[] = [
  { title: "Trends", types: ["line", "area", "slope", "stream"] },
  { title: "Absolute", types: ["bar", "column", "groupedBar", "stackedBar", "groupedCol", "dot", "pyramid", "arrow"] },
  { title: "Shares", types: ["pie", "donut", "waffle", "treemap", "proportional", "parliament"] },
  { title: "Correlations", types: ["scatter", "bubble", "heatmap", "radar"] },
];

const CHART_LABELS: Record<ChartKind, string> = {
  line: "Line",
  area: "Area",
  slope: "Slope",
  stream: "Stream",
  bar: "Bar",
  column: "Column",
  groupedBar: "Grouped Bar",
  stackedBar: "Stacked Bar",
  groupedCol: "Grouped Column",
  dot: "Dot Plot",
  pyramid: "Pyramid",
  arrow: "Arrow",
  pie: "Pie",
  donut: "Donut",
  waffle: "Waffle",
  treemap: "Treemap",
  proportional: "Proportional",
  parliament: "Parliament",
  scatter: "Scatter",
  bubble: "Bubble",
  heatmap: "Heatmap",
  radar: "Radar",
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000 || Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(digits);
}

function pickFirstAvailable(candidates: string[], valid: Set<string>, exclude?: string) {
  for (const key of candidates) {
    if (key && valid.has(key) && key !== exclude) return key;
  }
  return "";
}

function titleFromGroup(groupBy: string) {
  if (!groupBy) return "Label";
  if (groupBy === "player") return "Player";
  return groupBy.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function paletteColor(i: number, alpha = 1) {
  const hex = PALETTE[i % PALETTE.length];
  if (alpha >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTeamColor(label: string, defaultColor: string) {
  const id = getTeamIdentity(label);
  if (id.primary && id.primary.startsWith("#")) return id.primary;
  // If it's a CSS variable like var(--accent-blue), we might need to resolve it or just use it
  if (id.primary && id.primary.startsWith("var")) return id.primary;
  return defaultColor;
}

function getNumber(row: GraphRow, key: string) {
  const value = row[key];
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

export default function GraphViewer({ rows, columns, statType, sortBy, groupBy }: Props) {
  const [chartType, setChartType] = useState<ChartKind>("bar");
  const [xKey, setXKey] = useState("label");
  const [yKey, setYKey] = useState("");
  const [y2Key, setY2Key] = useState("");
  const [zKey, setZKey] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allowLarge, setAllowLarge] = useState(false);
  const [showChartLabels, setShowChartLabels] = useState(true);

  const chartRef = useRef<Chart | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logoImages, setLogoImages] = useState<Record<string, HTMLImageElement>>({});


  const rowItems = useMemo(() => {
    return rows.map((row, idx) => ({
      id: typeof row.rank === "number" ? row.rank : idx + 1,
      row,
    }));
  }, [rows]);

  const numericColumns = useMemo(() => {
    const exclude = ["label", "rank", "player_id", "team_id", "match_id", "sub_label", "logo", "flag"];
    return columns.filter((col) => !exclude.includes(col.id));
  }, [columns]);

  const numericKeys = useMemo(() => new Set(numericColumns.map((col) => col.id)), [numericColumns]);

  const labelAxisName = titleFromGroup(groupBy);

  const labelMap = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((col) => map.set(col.id, col.label));
    map.set("label", labelAxisName);
    return map;
  }, [columns, labelAxisName]);

  const xOptions = useMemo(() => [{ id: "label", label: labelAxisName }, ...numericColumns], [labelAxisName, numericColumns]);
  const yOptions = numericColumns;

  const labelFor = useCallback(
    (key: string) => (key === "label" ? labelAxisName : labelMap.get(key) || key),
    [labelAxisName, labelMap]
  );

  useEffect(() => {
    const defaults: Record<string, string[]> = {
      bat: [sortBy, "runs", "average", "strike_rate", "innings", "fours", "sixes"],
      bowl: [sortBy, "wickets", "economy", "bowling_average", "bowling_strike_rate", "innings"],
      team: [sortBy, "batting_run_rate", "win_percentage", "won", "matches_played", "total_runs_scored"],
      team_bat: [sortBy, "batting_run_rate", "total_runs_scored", "balls_faced", "win_percentage", "partnership_50s"],
      team_bowl: [sortBy, "bowling_run_rate", "wickets_taken", "total_runs_conceded", "win_percentage", "back_to_back_wickets"],
      team_compare: [sortBy, "run_diff", "run_rate_diff", "powerplay_diff", "death_diff", "won", "win_percentage"],
    };
    const next = pickFirstAvailable(defaults[statType], numericKeys) || numericColumns[0]?.id || "";
    setYKey((prev) => (prev && numericKeys.has(prev) ? prev : next));
  }, [numericColumns, numericKeys, statType, sortBy]);

  useEffect(() => {
    const zDefault = pickFirstAvailable(["innings", "runs", "wickets", "won"], numericKeys, yKey)
      || numericColumns.find((col) => col.id !== yKey)?.id
      || "";
    setZKey((prev) => (prev && numericKeys.has(prev) ? prev : zDefault));
  }, [numericColumns, numericKeys, yKey]);

  useEffect(() => {
    if (!["groupedBar", "stackedBar", "groupedCol", "stream", "slope", "pyramid"].includes(chartType)) return;
    const defaults: Record<string, string[]> = {
      bat: [sortBy, "strike_rate", "average", "sixes", "fours"],
      bowl: [sortBy, "economy", "bowling_average", "bowling_strike_rate"],
      team: [sortBy, "batting_run_rate", "win_percentage", "won", "matches_played"],
      team_bat: [sortBy, "batting_run_rate", "total_runs_scored", "win_percentage"],
      team_bowl: [sortBy, "bowling_run_rate", "wickets_taken", "win_percentage"],
    };
    const candidate = pickFirstAvailable(defaults[statType], numericKeys, yKey)
      || numericColumns.find((col) => col.id !== yKey)?.id
      || "";
    setY2Key((prev) => (prev && numericKeys.has(prev) && prev !== yKey ? prev : candidate));
  }, [chartType, numericColumns, numericKeys, sortBy, statType, yKey]);

  useEffect(() => {
    if (!["scatter", "bubble"].includes(chartType)) return;
    if (xKey !== "label" && numericKeys.has(xKey)) return;
    const candidate = numericColumns.find((col) => col.id !== yKey)?.id || numericColumns[0]?.id || "label";
    setXKey(candidate);
  }, [chartType, numericColumns, numericKeys, xKey, yKey]);

  useEffect(() => {
    if (rowItems.length === 0) return;
    const initialCount = Math.min(DEFAULT_SELECT_COUNT, rowItems.length);
    setSelected(new Set(rowItems.slice(0, initialCount).map((item) => item.id)));
    setAllowLarge(false);
  }, [rowItems]);

  const selectedRows = useMemo(() => rowItems.filter((item) => selected.has(item.id)).map((item) => item.row), [rowItems, selected]);

  const plotRows = useMemo(() => {
    if (allowLarge || selectedRows.length <= MAX_PLOT) return selectedRows;
    return selectedRows.slice(0, MAX_PLOT);
  }, [allowLarge, selectedRows]);

  // Pre-load logos
  useEffect(() => {
    const isTeamContext = statType.startsWith("team") || groupBy === "team" || groupBy === "opposition";
    if (!isTeamContext) {
      setLogoImages({});
      return;
    }

    const labels = Array.from(new Set(plotRows.map(r => r.label)));
    const loaded: Record<string, HTMLImageElement> = {};
    let count = 0;

    labels.forEach(label => {
      const identity = getTeamIdentity(label);
      if (identity.logoUrl) {
        const img = new Image();
        img.src = identity.logoUrl;
        img.onload = () => {
          loaded[label] = img;
          count++;
          if (count === labels.length) {
            setLogoImages({ ...loaded });
          }
        };
        img.onerror = () => {
          count++;
          if (count === labels.length) {
            setLogoImages({ ...loaded });
          }
        };
      } else {
        count++;
        if (count === labels.length) {
          setLogoImages({ ...loaded });
        }
      }
    });
  }, [plotRows, statType, groupBy]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || plotRows.length === 0 || !yKey) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    Chart.defaults.color = "#8b8fa8";
    Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
    Chart.defaults.font.family = "var(--font-dm-sans), system-ui, sans-serif";
    Chart.defaults.font.size = 10;

    const labels = plotRows.map((row) => {
      if (xKey === "label") return row.label;
      const value = getNumber(row, xKey);
      return value != null ? String(value) : row.label;
    });

    const yValues = plotRows.map((row) => getNumber(row, yKey) ?? 0);
    const y2Values = plotRows.map((row) => getNumber(row, y2Key) ?? 0);

    const labelFor = (key: string) => labelMap.get(key) || key;

    // Helper datasets/rows to ensure correct 1:1 mapping with data indices
    const scatterPoints: { x: number; y: number; r?: number }[] = [];
    const scatterRows: GraphRow[] = [];
    if (chartType === "scatter" || chartType === "bubble") {
      const maxZ = Math.max(...plotRows.map((row) => getNumber(row, zKey) ?? 0), 1);
      plotRows.forEach((row) => {
        const xVal = getNumber(row, xKey);
        const yVal = getNumber(row, yKey);
        if (xVal == null || yVal == null) return;
        const point: { x: number; y: number; r?: number } = { x: xVal, y: yVal };
        if (chartType === "bubble") {
          const zVal = getNumber(row, zKey) ?? 0;
          point.r = Math.max(5, Math.sqrt(zVal / maxZ) * 28);
        }
        scatterPoints.push(point);
        scatterRows.push(row);
      });
    }

    const arrowRows = chartType === "arrow" ? [...plotRows].sort((a, b) => (getNumber(a, yKey) ?? 0) - (getNumber(b, yKey) ?? 0)) : [];

    const getElementLabel = (datasetIndex: number, index: number) => {
      if (["slope", "radar", "treemap", "proportional"].includes(chartType)) {
        const dataset = config?.data?.datasets?.[datasetIndex];
        return dataset?.label || "";
      }
      if (chartType === "scatter" || chartType === "bubble") {
        return scatterRows[index]?.label || "";
      }
      if (chartType === "arrow") {
        return arrowRows[index]?.label || "";
      }
      return plotRows[index]?.label || "";
    };

    const tooltipBase = {
      backgroundColor: "rgba(13, 15, 20, 0.96)",
      borderColor: "rgba(0, 232, 122, 0.2)",
      borderWidth: 1,
      padding: 9,
      titleColor: "#eeeef2",
      bodyColor: "#8b8fa8",
      titleFont: { size: 11, weight: "700" },
    } as const;

    let config: any = null;
    const isTeamGroup = groupBy === "team" || groupBy === "player_team" || groupBy === "opposition";
    const teamColors = plotRows.map((row, i) => isTeamGroup ? getTeamColor(row.label, paletteColor(i)) : paletteColor(i));
    const teamColorsAlpha = plotRows.map((row, i) => isTeamGroup ? getTeamColor(row.label, paletteColor(i, 0.72)) : paletteColor(i, 0.72));

    const logoPlugin = {
      id: 'logoPlugin',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        const isTeamContext = statType.startsWith("team") || groupBy === "team" || groupBy === "opposition";
        if (!isTeamContext) return;

        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          if (meta.hidden) return;

          meta.data.forEach((element: any, index: number) => {
            const label = getElementLabel(i, index);
            const img = logoImages[label];
            if (!img || !img.complete) return;

            const size = 20; // Controlled pixel size
            let x, y;

            const isHorizontalBar = chart.config.type === 'bar' && chart.options.indexAxis === 'y';
            const isVerticalBar = chart.config.type === 'bar' && chart.options.indexAxis !== 'y';
            const isScatterBubble = ['scatter', 'bubble'].includes(chart.config.type) || chartType === 'dot';
            const isLineArea = ['line'].includes(chart.config.type);

            if (isVerticalBar) {
              x = element.x - size / 2;
              y = element.y - size - 8;
            } else if (isHorizontalBar) {
              // Draw at the start (left) of the bar
              x = element.base - size - 10;
              y = element.y - size / 2;
            } else if (isScatterBubble) {
              x = element.x - size / 2;
              y = element.y - size / 2;
            } else if (isLineArea) {
              // Only draw on points if series is small, or last point
              const isSmall = plotRows.length <= 12;
              const isLast = index === meta.data.length - 1;
              if (isSmall || isLast) {
                x = element.x - size / 2;
                y = element.y - size - 10;
              } else return;
            } else {
              return;
            }

            ctx.drawImage(img, x, y, size, size);
          });
        });
      }
    };

    if (chartType === "bar") {
      config = {
        type: "bar",
        plugins: [logoPlugin],
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              backgroundColor: teamColorsAlpha,
              borderColor: teamColors,
              borderWidth: 1.5,
              borderRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => plotRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(plotRows[ctx.dataIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, grace: '15%' },
            y: { grid: { display: false }, ticks: { color: "#eeeef2", font: { size: 10, weight: "600" } } },
          },
        },
      };
    } else if (chartType === "column") {
      config = {
        type: "bar",
        plugins: [logoPlugin],
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              backgroundColor: teamColorsAlpha,
              borderColor: teamColors,
              borderWidth: 1.5,
              borderRadius: { topLeft: 5, topRight: 5 },
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => plotRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(plotRows[ctx.dataIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#eeeef2", maxRotation: 30 } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, grace: '15%' },
          },
        },
      };
    } else if (chartType === "line" || chartType === "area") {
      config = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              borderColor: teamColors[0] || C.green,
              backgroundColor: chartType === "area" ? (teamColors[0] ? `${teamColors[0]}33` : "rgba(0,232,122,0.12)") : "transparent",
              fill: chartType === "area",
              tension: 0.35,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: teamColors[0] || C.green,
              borderWidth: 2.5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => plotRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(plotRows[ctx.dataIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#eeeef2", maxRotation: 30 } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, grace: '10%' },
          },
        },
      };
    } else if (chartType === "slope") {
      const topRows = plotRows.slice(0, Math.min(10, plotRows.length));
      config = {
        type: "line",
        data: {
          labels: [labelFor(yKey), labelFor(y2Key)],
          datasets: topRows.map((row, i) => {
            const color = isTeamGroup ? getTeamColor(row.label, paletteColor(i)) : paletteColor(i);
            return {
              label: row.label,
              data: [getNumber(row, yKey) ?? 0, getNumber(row, y2Key) ?? 0],
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: color,
              tension: 0,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#eeeef2" } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
          },
        },
      };
    } else if (chartType === "stream") {
      config = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: labelFor(yKey),
              data: yValues,
              borderColor: C.green,
              backgroundColor: "rgba(0,232,122,0.2)",
              fill: true,
              tension: 0.45,
              borderWidth: 2,
            },
            {
              label: labelFor(y2Key),
              data: y2Values,
              borderColor: C.gold,
              backgroundColor: "rgba(240,180,41,0.16)",
              fill: true,
              tension: 0.45,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#eeeef2" } },
            y: { stacked: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
          },
        },
      };
    } else if (chartType === "pie" || chartType === "donut") {
      const total = yValues.reduce((a, b) => a + b, 0) || 1;
      config = {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              backgroundColor: teamColorsAlpha,
              borderColor: teamColors,
              borderWidth: 2,
              hoverOffset: 8,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: chartType === "donut" ? "58%" : "0%",
          plugins: {
            legend: { display: true, position: "right", labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 6 } },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                label: (ctx: any) => {
                  const value = yValues[ctx.dataIndex] || 0;
                  const pct = ((value / total) * 100).toFixed(1);
                  return `${ctx.label}: ${formatNumber(value)} (${pct}%)`;
                },
              },
            },
          },
        },
      };
    } else if (chartType === "scatter" || chartType === "bubble") {
      config = {
        type: chartType === "bubble" ? "bubble" : "scatter",
        plugins: [logoPlugin],
        data: {
          datasets: [
            {
              data: scatterPoints,
              backgroundColor: teamColorsAlpha,
              borderColor: teamColors,
              borderWidth: 1.5,
              pointRadius: (ctx: any) => {
                return chartType === "scatter" ? 6 : undefined;
              },
              pointHoverRadius: 10
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => scatterRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => {
                  const row = scatterRows[ctx.dataIndex];
                  if (!row) return "";
                  const xVal = getNumber(row, xKey);
                  const yVal = getNumber(row, yKey);
                  const zVal = getNumber(row, zKey);
                  const base = `${labelFor(xKey)}: ${formatNumber(xVal)}  |  ${labelFor(yKey)}: ${formatNumber(yVal)}`;
                  return chartType === "bubble" ? `${base}  |  ${labelFor(zKey)}: ${formatNumber(zVal)}` : base;
                },
              },
            },
          },
          scales: {
            x: { title: { display: true, text: labelFor(xKey), color: "#8b8fa8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, grace: '10%' },
            y: { title: { display: true, text: labelFor(yKey), color: "#8b8fa8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, grace: '10%' },
          },
        },
      };
    } else if (chartType === "radar") {
      const radarKeys: Record<string, string[]> = {
        bat: ["runs", "average", "strike_rate", "fours", "sixes", "fifties"],
        bowl: ["wickets", "bowling_average", "economy", "bowling_strike_rate", "fours_conceded", "sixes_conceded"],
        team: ["win_percentage", "matches_played", "won", "total_runs_scored", "batting_run_rate", "partnership_50s", "back_to_back_wickets"],
        team_bat: ["batting_run_rate", "total_runs_scored", "balls_faced", "win_percentage", "partnership_50s", "partnership_100s"],
        team_bowl: ["bowling_run_rate", "wickets_taken", "total_runs_conceded", "win_percentage", "back_to_back_wickets", "lowest_score"],
        team_compare: ["run_diff", "run_rate_diff", "powerplay_diff", "death_diff", "big_score_diff", "win_percentage"],
      };
      const keys = radarKeys[statType].filter((k) => numericKeys.has(k));
      const topRows = plotRows.slice(0, Math.min(6, plotRows.length));

      config = {
        type: "radar",
        data: {
          labels: keys.map((k) => labelFor(k)),
          datasets: topRows.map((row, i) => {
            const color = isTeamGroup ? getTeamColor(row.label, paletteColor(i)) : paletteColor(i);
            return {
              label: row.label,
              data: keys.map((k) => getNumber(row, k) ?? 0),
              borderColor: color,
              backgroundColor: color.startsWith("var") ? `rgba(0,0,0,0.1)` : `${color}20`,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: color,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            r: {
              grid: { color: "rgba(255,255,255,0.07)" },
              ticks: { display: false, backdropColor: "transparent" },
              pointLabels: { color: "#8b8fa8", font: { size: 10 } },
            },
          },
        },
      };
    } else if (chartType === "groupedBar") {
      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: labelFor(yKey), data: yValues, backgroundColor: paletteColor(0, 0.72), borderColor: paletteColor(0, 1), borderWidth: 1, borderRadius: 3 },
            { label: labelFor(y2Key), data: y2Values, backgroundColor: paletteColor(1, 0.72), borderColor: paletteColor(1, 1), borderWidth: 1, borderRadius: 3 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
            y: { grid: { display: false }, ticks: { color: "#eeeef2" } },
          },
        },
      };
    } else if (chartType === "stackedBar") {
      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: labelFor(yKey), data: yValues, backgroundColor: paletteColor(0, 0.75), stack: "s", borderWidth: 0 },
            { label: labelFor(y2Key), data: y2Values, backgroundColor: paletteColor(1, 0.65), stack: "s", borderWidth: 0 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            x: { stacked: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
            y: { stacked: true, grid: { display: false }, ticks: { color: "#eeeef2" } },
          },
        },
      };
    } else if (chartType === "groupedCol") {
      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: labelFor(yKey), data: yValues, backgroundColor: paletteColor(0, 0.72), borderColor: paletteColor(0, 1), borderWidth: 1, borderRadius: { topLeft: 4, topRight: 4 } },
            { label: labelFor(y2Key), data: y2Values, backgroundColor: paletteColor(1, 0.72), borderColor: paletteColor(1, 1), borderWidth: 1, borderRadius: { topLeft: 4, topRight: 4 } },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: tooltipBase,
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#eeeef2", maxRotation: 30 } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
          },
        },
      };
    } else if (chartType === "heatmap") {
      const maxValue = Math.max(...yValues, 1);
      const heat = ["#0d2d1a", "#1a4a28", "#00e87a", "#f0b429", "#ff7043", "#ff4040"];
      const colors = yValues.map((value) => {
        const ratio = value / maxValue;
        if (ratio > 0.85) return heat[5];
        if (ratio > 0.65) return heat[4];
        if (ratio > 0.45) return heat[3];
        if (ratio > 0.25) return heat[2];
        if (ratio > 0.1) return heat[1];
        return heat[0];
      });

      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              backgroundColor: colors,
              borderWidth: 0,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: tooltipBase,
          },
          scales: {
            x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
            y: { grid: { display: false }, ticks: { color: "#eeeef2" } },
          },
        },
      };
    } else if (chartType === "dot") {
      const points = plotRows.map((row, idx) => ({ x: getNumber(row, yKey) ?? 0, y: plotRows.length - idx }));
      config = {
        type: "scatter",
        data: {
          datasets: [
            {
              data: points,
              backgroundColor: points.map((_, i) => paletteColor(i, 0.85)),
              borderColor: points.map((_, i) => paletteColor(i, 1)),
              borderWidth: 1.5,
              pointRadius: 8,
              pointHoverRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => plotRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(plotRows[ctx.dataIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { title: { display: true, text: labelFor(yKey), color: "#8b8fa8" }, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" } },
            y: { display: false, min: 0, max: plotRows.length + 1 },
          },
        },
      };
    } else if (chartType === "pyramid") {
      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: labelFor(yKey), data: yValues.map((v) => -v), backgroundColor: paletteColor(0, 0.7), borderRadius: 3, borderWidth: 0 },
            { label: labelFor(y2Key), data: y2Values, backgroundColor: paletteColor(1, 0.7), borderRadius: 3, borderWidth: 0 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: true, labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                label: (ctx: any) => `${ctx.dataset.label}: ${formatNumber(Math.abs(ctx.raw))}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: "#8b8fa8", callback: (v: any) => Math.abs(v).toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } },
            y: { grid: { display: false }, ticks: { color: "#eeeef2" } },
          },
        },
      };
    } else if (chartType === "arrow") {
      config = {
        type: "scatter",
        data: {
          datasets: [
            {
              type: "line",
              label: "Trend",
              data: arrowRows.map((row, idx) => ({ x: idx, y: getNumber(row, yKey) ?? 0 })),
              borderColor: "rgba(0,232,122,0.3)",
              backgroundColor: "transparent",
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              showLine: true,
            },
            {
              type: "scatter",
              data: arrowRows.map((row, idx) => ({ x: idx, y: getNumber(row, yKey) ?? 0 })),
              backgroundColor: arrowRows.map((_, i) => paletteColor(i, 0.8)),
              borderColor: arrowRows.map((_, i) => paletteColor(i, 1)),
              borderWidth: 1.5,
              pointRadius: 7,
              pointHoverRadius: 9,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => arrowRows[items[0].dataIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(arrowRows[ctx.dataIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { display: false },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8" }, title: { display: true, text: labelFor(yKey), color: "#8b8fa8" } },
          },
        },
      };
    } else if (chartType === "waffle") {
      const maxValue = Math.max(...yValues, 1);
      const pcts = yValues.map((value) => Math.round((value / maxValue) * 100));
      config = {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: labelFor(yKey), data: pcts, backgroundColor: plotRows.map((_, i) => paletteColor(i, 0.75)), borderWidth: 0, borderRadius: 4 },
            { data: pcts.map((v) => 100 - v), backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 0, borderRadius: 4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                label: (ctx: any) => {
                  if (ctx.datasetIndex !== 0) return null;
                  const value = yValues[ctx.dataIndex] ?? 0;
                  return `${labelFor(yKey)}: ${formatNumber(value)} (${pcts[ctx.dataIndex]}% of top)`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, min: 0, max: 100, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b8fa8", callback: (v: any) => `${v}%` } },
            y: { stacked: true, grid: { display: false }, ticks: { color: "#eeeef2" } },
          },
        },
      };
    } else if (chartType === "treemap" || chartType === "proportional") {
      const sorted = [...plotRows].sort((a, b) => (getNumber(b, yKey) ?? 0) - (getNumber(a, yKey) ?? 0));
      const cols = 5;
      const points = sorted.map((row, i) => {
        const x = (i % cols) * 18 + 9;
        const y = Math.floor(i / cols) * 20 + 10;
        const value = getNumber(row, yKey) ?? 0;
        const maxValue = Math.max(...yValues, 1);
        const r = chartType === "proportional" ? Math.max(5, Math.cbrt(value) * 3) : Math.max(5, Math.sqrt(value / maxValue) * 32);
        return { x, y, r };
      });

      config = {
        type: "bubble",
        data: {
          datasets: sorted.map((row, i) => ({
            label: row.label,
            data: [points[i]],
            backgroundColor: paletteColor(i, 0.65),
            borderColor: paletteColor(i, 1),
            borderWidth: 1.5,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                title: (items: any[]) => sorted[items[0].datasetIndex]?.label || "",
                label: (ctx: any) => `${labelFor(yKey)}: ${formatNumber(getNumber(sorted[ctx.datasetIndex], yKey))}`,
              },
            },
          },
          scales: {
            x: { display: false, min: 0, max: 100 },
            y: { display: false, min: 0, max: 100 },
          },
        },
      };
    } else if (chartType === "parliament") {
      const total = yValues.reduce((a, b) => a + b, 0) || 1;
      config = {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: yValues,
              backgroundColor: plotRows.map((_, i) => paletteColor(i, 0.8)),
              borderColor: plotRows.map((_, i) => paletteColor(i, 1)),
              borderWidth: 2,
              hoverOffset: 8,
              circumference: 180,
              rotation: -90,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "50%",
          plugins: {
            legend: { display: true, position: "bottom", labels: { color: "#8b8fa8", font: { size: 9 }, boxWidth: 10, padding: 6 } },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                label: (ctx: any) => {
                  const value = yValues[ctx.dataIndex] || 0;
                  const pct = ((value / total) * 100).toFixed(1);
                  return `${ctx.label}: ${formatNumber(value)} (${pct}%)`;
                },
              },
            },
          },
        },
      };
    }

    const labelsPlugin = {
      id: 'labelsPlugin',
      afterDatasetsDraw(chart: any) {
        if (!showChartLabels) return;
        const { ctx } = chart;

        if (['pie', 'doughnut', 'radar'].includes(chart.config.type)) return;
        if (chartType === 'stream') return;

        ctx.save();
        ctx.fillStyle = "#eeeef2";
        ctx.font = "600 9px var(--font-dm-sans), sans-serif";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(13, 15, 20, 0.95)";
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        const isTeamContext = statType.startsWith("team") || groupBy === "team" || groupBy === "opposition";

        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          if (meta.hidden) return;

          const isMultiDatasetMetric = ["groupedBar", "stackedBar", "groupedCol", "pyramid", "waffle"].includes(chartType);
          if (isMultiDatasetMetric && i > 0) return;

          meta.data.forEach((element: any, index: number) => {
            const label = getElementLabel(i, index);
            if (!label) return;

            const x = element.x;
            const y = element.y;

            const isHorizontalBar = chart.config.type === 'bar' && chart.options.indexAxis === 'y';
            const isVerticalBar = chart.config.type === 'bar' && chart.options.indexAxis !== 'y';
            const isScatterBubble = ['scatter', 'bubble'].includes(chart.config.type) || chartType === 'dot';
            const isLineArea = ['line'].includes(chart.config.type);

            const img = logoImages[label];
            const hasLogo = isTeamContext && img && img.complete;

            if (isScatterBubble) {
              const radius = element.options.radius || element.options.pointRadius || 4;
              ctx.textAlign = "left";
              ctx.fillText(label, x + radius + 5, y);
            } else if (isLineArea) {
              const isSmall = plotRows.length <= 12;
              const isLast = index === meta.data.length - 1;
              if (isSmall || isLast) {
                if (hasLogo) {
                  ctx.textAlign = "center";
                  ctx.fillText(label, x, y - 34);
                } else {
                  const radius = element.options.radius || element.options.pointRadius || 4;
                  ctx.textAlign = "center";
                  ctx.fillText(label, x, y - radius - 5);
                }
              }
            } else if (chartType === "slope") {
              if (index === 1) {
                ctx.textAlign = "left";
                ctx.fillText(label, x + 8, y);
              }
            } else if (chartType === "arrow") {
              ctx.textAlign = "left";
              ctx.fillText(label, x + 6, y);
            } else if (isVerticalBar) {
              if (hasLogo) {
                ctx.textAlign = "center";
                ctx.fillText(label, x, y - 32);
              } else {
                ctx.textAlign = "center";
                ctx.fillText(label, x, y - 8);
              }
            } else if (isHorizontalBar) {
              ctx.textAlign = "left";
              ctx.fillText(label, x + 6, y);
            }
          });
        });
        ctx.restore();
      }
    };

    if (config) {
      if (!config.plugins) {
        config.plugins = [];
      }
      config.plugins.push(labelsPlugin);
      chartRef.current = new Chart(ctx, config);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartType, labelFor, plotRows, xKey, yKey, y2Key, zKey, statType, numericKeys, showChartLabels, logoImages, groupBy]);

  const handleSelectAll = (value: boolean) => {
    if (!value) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rowItems.map((item) => item.id)));
  };

  const handleSelectTop = (count: number) => {
    setSelected(new Set(rowItems.slice(0, Math.min(count, rowItems.length)).map((item) => item.id)));
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showZ = chartType === "bubble";
  const showY2 = ["groupedBar", "stackedBar", "groupedCol", "stream", "slope", "pyramid"].includes(chartType);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "100%", minHeight: 0 }}>
      <div style={{ background: C.low, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 2 }}>Graph Mode</div>
          <div style={{ fontSize: 9, color: C.muted }}>Chart presets and axis mapping</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {CHART_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: ".1em",
                color: C.muted,
                padding: "6px 12px 4px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                {group.title}
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "0 10px" }}>
                {group.types.map((type) => (
                  <div
                    key={type}
                    onClick={() => setChartType(type)}
                    style={{
                      background: chartType === type ? "rgba(0,232,122,0.1)" : C.mid,
                      border: `1px solid ${chartType === type ? "rgba(0,232,122,0.35)" : "rgba(255,255,255,0.03)"}`,
                      borderRadius: 8,
                      padding: "7px 8px",
                      cursor: "pointer",
                      transition: "all .12s",
                      color: chartType === type ? C.green : C.text,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {CHART_LABELS[type]}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 8, color: C.green, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Axis Configuration</div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>X Axis / Category</div>
            <select
              value={xKey}
              onChange={(e) => setXKey(e.target.value)}
              style={{ width: "100%", background: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: C.text }}
            >
              {xOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>Y Axis / Value</div>
            <select
              value={yKey}
              onChange={(e) => setYKey(e.target.value)}
              style={{ width: "100%", background: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: C.text }}
            >
              {yOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{labelMap.get(opt.id) || opt.id}</option>
              ))}
            </select>
          </div>

          {showZ && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>Size / Z (bubble)</div>
              <select
                value={zKey}
                onChange={(e) => setZKey(e.target.value)}
                style={{ width: "100%", background: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: C.text }}
              >
                {yOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{labelMap.get(opt.id) || opt.id}</option>
                ))}
              </select>
            </div>
          )}

          {showY2 && (
            <div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>Y2 (grouped/stacked)</div>
              <select
                value={y2Key}
                onChange={(e) => setY2Key(e.target.value)}
                style={{ width: "100%", background: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: C.text }}
              >
                {yOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{labelMap.get(opt.id) || opt.id}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
            <input
              id="show-chart-labels"
              type="checkbox"
              checked={showChartLabels}
              onChange={(e) => setShowChartLabels(e.target.checked)}
              style={{ accentColor: C.green, cursor: "pointer", width: 12, height: 12 }}
            />
            <label htmlFor="show-chart-labels" style={{ fontSize: 9, color: C.text, cursor: "pointer", userSelect: "none" }}>
              Show names directly on chart
            </label>
          </div>
        </div>

        <div style={{ padding: "0 14px 10px", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", margin: "8px 0 6px" }}>Select Rows</div>
            <div style={{ display: "flex", gap: 6, fontSize: 8 }}>
              <span style={{ color: C.green, cursor: "pointer" }} onClick={() => handleSelectAll(true)}>All</span>
              <span style={{ color: C.muted, cursor: "pointer" }} onClick={() => handleSelectAll(false)}>None</span>
              <span style={{ color: C.gold, cursor: "pointer" }} onClick={() => handleSelectTop(5)}>Top 5</span>
              <span style={{ color: C.gold, cursor: "pointer" }} onClick={() => handleSelectTop(10)}>Top 10</span>
            </div>
          </div>

          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {rowItems.map((item) => {
              const value = yKey ? formatNumber(getNumber(item.row, yKey)) : "—";
              return (
                <div
                  key={item.id}
                  onClick={() => toggleRow(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", cursor: "pointer", opacity: selected.has(item.id) ? 1 : 0.6 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleRow(item.id)}
                    style={{ accentColor: C.green, cursor: "pointer" }}
                  />
                  <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, background: C.mid, color: C.text, overflow: "hidden" }}>
                    {(groupBy === "team" || groupBy === "player_team" || groupBy === "opposition") ? (
                      <TeamLogo teamName={item.row.label} size={16} showFallbackText={false} />
                    ) : (
                      item.row.rank ?? item.id
                    )}
                  </div>
                  <div style={{ fontSize: 10, flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.row.label}
                  </div>
                  <div style={{ fontSize: 9, color: C.green }}>{value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.low }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{labelAxisName} vs {labelFor(yKey || "value")}</div>
            <div style={{ fontSize: 9, color: C.muted }}>{plotRows.length} rows plotted · {CHART_LABELS[chartType]}</div>
          </div>
          <div style={{ fontSize: 9, color: C.muted }}>Graph mode</div>
        </div>

        {selectedRows.length > MAX_PLOT && !allowLarge && (
          <div style={{ padding: "8px 14px", fontSize: 10, background: "rgba(240,180,41,0.08)", borderBottom: `1px solid ${C.border}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Showing top {MAX_PLOT} of {selectedRows.length} selected rows for readability.</span>
            <button
              type="button"
              onClick={() => setAllowLarge(true)}
              style={{ background: "transparent", border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 9, fontWeight: 700 }}
            >
              Plot all
            </button>
          </div>
        )}

        <div style={{ flex: 1, position: "relative", padding: "14px", minHeight: 0 }}>
          <div style={{ position: "absolute", inset: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
            <div style={{ width: "100%", height: "100%", padding: 12 }}>
              <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
