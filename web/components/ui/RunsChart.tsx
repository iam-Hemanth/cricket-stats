"use client";

import { useRef, useState } from "react";

interface DataPoint {
  year: number;
  value: number;
}

interface RunsChartProps {
  data: DataPoint[];
  color?: string;
  label?: string;
}

export default function RunsChart({ data, color = "#22c55e", label = "Runs" }: RunsChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: DataPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => a.year - b.year);
  const maxVal = Math.max(...sorted.map((d) => d.value), 1);
  const minVal = 0;

  const W = 1000;
  const H = 240;
  const PADX = 40;
  const PADY = 24;
  const chartW = W - PADX * 2;
  const chartH = H - PADY * 2;

  const xOf = (i: number) => PADX + (sorted.length > 1 ? (i / (sorted.length - 1)) * chartW : chartW / 2);
  const yOf = (v: number) => PADY + chartH - ((v - minVal) / (maxVal - minVal || 1)) * chartH;

  // Build the smooth area path
  const points = sorted.map((d, i) => ({ x: xOf(i), y: yOf(d.value) }));
  
  let pathD = "";
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const cpX1 = p0.x + (p1.x - p0.x) * 0.4;
      const cpX2 = p0.x + (p1.x - p0.x) * 0.6;
      pathD += ` C ${cpX1} ${p0.y}, ${cpX2} ${p1.y}, ${p1.x} ${p1.y}`;
    }
  }
  
  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1].x} ${H - PADY} L ${points[0].x} ${H - PADY} Z` : "";

  const gradId = `chart-grad-${color.replace("#", "")}`;

  return (
    <div className="relative w-full chart-container select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: "240px" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines and Y-axis labels */}
        {[0, 0.5, 1].map((pct) => {
          const val = minVal + (maxVal - minVal) * pct;
          const labelText = val >= 1000 ? (val / 1000).toFixed(1) + "k" : Math.round(val).toString();
          const y = PADY + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line
                x1={PADX}
                y1={y}
                x2={W - PADX}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={PADX - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255,255,255,0.35)"
              >
                {labelText}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill={color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1.5"
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => {
              const svgEl = svgRef.current;
              if (!svgEl) return;
              const rect = svgEl.getBoundingClientRect();
              const svgX = (p.x / W) * rect.width;
              const svgY = (p.y / H) * rect.height;
              setTooltip({ x: svgX, y: svgY, point: sorted[i] });
            }}
          />
        ))}

        {/* Year labels */}
        {sorted.map((d, i) => (
          <text
            key={d.year}
            x={xOf(i)}
            y={H - 2}
            textAnchor="middle"
            fontSize="10"
            fill="rgba(255,255,255,0.35)"
          >
            {String(d.year).slice(2)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[--glass-border] bg-[--bg-card] px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(tooltip.x + 8, 999),
            top: Math.max(tooltip.y - 48, 0),
            transform: "translateX(0)",
          }}
        >
          <div className="font-bold text-[--text-primary] mb-1">
            {String(tooltip.point.year).slice(2)}
          </div>
          <div className="flex items-center gap-1.5 text-[--text-secondary]">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
            {tooltip.point.value.toLocaleString()} {label.toLowerCase()}
          </div>
        </div>
      )}
    </div>
  );
}
