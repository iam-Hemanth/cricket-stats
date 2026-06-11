import { TeamLogo } from '../TeamLogo';

interface H2HBarProps {
  opposition: string;
  teamWins: number;
  oppWins: number;
  draws?: number;
}

export const H2HBar: React.FC<H2HBarProps> = ({ opposition, teamWins, oppWins, draws = 0 }) => {
  const total = teamWins + oppWins;
  const winPct = (teamWins / (total || 1)) * 100;

  return (
    <div className="flex items-center gap-[8px] py-[6px] border-b border-[rgba(255,255,255,0.04)] last:border-0 group">
      <TeamLogo teamName={opposition} size={18} />
      <span className="text-[11px] font-[700] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{opposition}</span>
      <div className="w-[90px] h-[5px] bg-[#31353c] rounded-[2.5px] overflow-hidden flex shrink-0">
        <div 
          className="h-full bg-[#4be277] transition-all duration-1000" 
          style={{ width: `${winPct}%` }} 
        />
        <div 
          className="h-full bg-[#ff6b6b] transition-all duration-1000" 
          style={{ width: `${100 - winPct}%` }} 
        />
      </div>
      <div className="flex items-center gap-[4px] min-w-[44px] justify-end shrink-0">
        <span className="text-[10px] font-[900] text-[#4be277]">{teamWins}</span>
        <span className="text-[8px] text-[#72808a]">—</span>
        <span className="text-[10px] font-[900] text-[#ff6b6b]">{oppWins}</span>
      </div>
    </div>
  );
};
