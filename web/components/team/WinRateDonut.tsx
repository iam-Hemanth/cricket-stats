import React from 'react';

interface WinRateDonutProps {
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
}

export const WinRateDonut: React.FC<WinRateDonutProps> = ({
  winRate = 0,
  wins = 0,
  losses = 0,
  draws = 0
}) => {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - winRate / 100);

  return (
    <div className="flex items-center gap-[12px]">
      <div className="relative w-[80px] h-[80px] shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#272a31"
            strokeWidth="10"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#4be277"
            strokeWidth="10"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: isNaN(offset) ? circumference : offset,
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[14px] font-[800] text-[#4be277] leading-none">{winRate}%</span>
          <span className="text-[8px] text-[#72808a] mt-[2px]">Win rate</span>
        </div>
      </div>
      <div className="flex-1">
        <div className="mb-[6px]">
          <div className="text-[20px] font-[800] tracking-[-.5px] leading-[1] text-[#4be277]">{wins}</div>
          <div className="text-[8px] text-[#72808a] uppercase tracking-[.05em] mt-[2px]">Wins</div>
        </div>
        <div className="mb-[6px]">
          <div className="text-[20px] font-[800] tracking-[-.5px] leading-[1] text-[#e0e2eb]">{losses}</div>
          <div className="text-[8px] text-[#72808a] uppercase tracking-[.05em] mt-[2px]">Losses</div>
        </div>
        <div className="mb-[6px]">
          <div className="text-[20px] font-[800] tracking-[-.5px] leading-[1] text-[#ffb95f]">{draws}</div>
          <div className="text-[8px] text-[#72808a] uppercase tracking-[.05em] mt-[2px]">Draw/NR</div>
        </div>
      </div>
    </div>
  );
};
