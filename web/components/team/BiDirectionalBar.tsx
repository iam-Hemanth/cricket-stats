import React from "react";

interface BiDirectionalBarProps {
  label: string;
  leftValue: number | string;
  leftMax?: number;
  leftColor?: string;
  rightValue: number | string;
  rightMax?: number;
  rightColor?: string;
  leftLabel?: string;
  rightLabel?: string;
}

export const BiDirectionalBar: React.FC<BiDirectionalBarProps> = ({
  label,
  leftValue,
  leftMax = 50,
  leftColor = "#4be277",
  rightValue,
  rightMax = 200,
  rightColor = "#7bbdee",
  leftLabel = "AVG",
  rightLabel = "SR",
}) => {
  const lVal = typeof leftValue === "number" ? leftValue : 0;
  const rVal = typeof rightValue === "number" ? rightValue : 0;

  const leftPct = Math.min(100, (lVal / leftMax) * 100);
  const rightPct = Math.min(100, (rVal / rightMax) * 100);

  return (
    <div className="flex flex-col w-full py-[4px] group">
      <div className="flex items-center justify-between mb-[2px]">
        <div className="text-[8px] font-[900] text-[#e0e2eb] flex items-baseline gap-[2px]">
          {leftValue} <span className="text-[6px] text-[#72808a] font-normal">{leftLabel}</span>
        </div>
        <div className="text-[7px] font-[900] text-[#72808a] uppercase tracking-wider">{label}</div>
        <div className="text-[8px] font-[900] text-[#e0e2eb] flex items-baseline gap-[2px]">
          <span className="text-[6px] text-[#72808a] font-normal">{rightLabel}</span> {rightValue}
        </div>
      </div>
      <div className="flex items-center gap-[4px] w-full">
        {/* Left Bar (extends right to left) */}
        <div className="flex-1 h-[4px] bg-[#272a31] rounded-full overflow-hidden relative">
          <div 
            className="absolute right-0 h-full transition-all duration-1000 ease-out"
            style={{ width: `${leftPct}%`, backgroundColor: leftColor }}
          />
        </div>
        {/* Right Bar (extends left to right) */}
        <div className="flex-1 h-[4px] bg-[#272a31] rounded-full overflow-hidden relative">
          <div 
            className="absolute left-0 h-full transition-all duration-1000 ease-out"
            style={{ width: `${rightPct}%`, backgroundColor: rightColor }}
          />
        </div>
      </div>
    </div>
  );
};
