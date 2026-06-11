import React from 'react';

interface SeasonRecord {
  year: number;
  played: number;
  won: number;
}

interface SeasonBarsProps {
  records: SeasonRecord[];
}

export const SeasonBars: React.FC<SeasonBarsProps> = ({ records }) => {
  const maxWins = Math.max(...records.map(r => r.won), 1);
  const years = [...records].map(r => r.year).sort((a, b) => a - b);
  const tickCandidates = years.length > 0
    ? [
        years[0],
        years[Math.floor(years.length / 3)],
        years[Math.floor((years.length * 2) / 3)],
        years[years.length - 1],
      ]
    : [];
  const ticks = Array.from(new Set(tickCandidates)).filter((y) => y != null);

  return (
    <div>
      <div className="flex gap-[5px] items-end h-[72px] overflow-x-auto no-scrollbar pt-2">
        {[...records].reverse().map((record) => {
          const height = Math.max(Math.round((record.won / maxWins) * 56), 3);
          const winRate = record.played ? record.won / record.played : 0;
          let color = "#ff6b6b"; // red
          if (winRate >= 0.75) color = "#4be277"; // green
          else if (winRate >= 0.55) color = "#ffb95f"; // gold

          return (
            <div key={record.year} className="flex flex-col items-center gap-[2px] min-w-[24px] shrink-0">
              <div
                className="w-[14px] rounded-t-[3px] transition-all duration-300 hover:opacity-80 cursor-pointer"
                style={{ height: `${height}px`, backgroundColor: color }}
                title={`${record.year}: ${record.won}/${record.played} wins`}
              />
              <span className="text-[7px] text-[#72808a]">'{record.year.toString().slice(-2)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-[4px]">
        {ticks.map((year) => (
          <span key={year} className="text-[7px] text-[#72808a]">{year}</span>
        ))}
      </div>
    </div>
  );
};
