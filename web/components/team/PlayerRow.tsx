import React from 'react';
import Link from 'next/link';

interface PlayerPerformance {
  rank: number;
  name: string;
  id: string;
  stat1: string | number;
  label1: string;
  stat2: string | number;
  label2: string;
  color?: string;
}

export const PlayerRow: React.FC<PlayerPerformance> = ({
  rank,
  name,
  id,
  stat1,
  label1,
  stat2,
  label2
}) => {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  const colors = [
    { bg: '#1a3a2a', text: '#4be277' },
    { bg: '#1a2e3a', text: '#7bbdee' },
    { bg: '#2e2a10', text: '#ffb95f' },
    { bg: '#2e1a3a', text: '#d17bee' },
    { bg: '#2e1a1a', text: '#ff6b6b' },
  ];
  const colorIdx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % colors.length;
  const avatarTheme = colors[colorIdx];

  return (
    <Link 
      href={`/players/${id}`} 
      className="flex items-center gap-[8px] py-[6px] border-b border-[rgba(255,255,255,0.04)] last:border-0 group cursor-pointer"
    >
      <div className="text-[9px] text-[#72808a] w-[14px] text-center shrink-0">{rank}</div>
      <div 
        className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[8px] font-[800] shrink-0"
        style={{ backgroundColor: avatarTheme.bg, color: avatarTheme.text }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-[600] overflow-hidden text-ellipsis whitespace-nowrap group-hover:text-[#4be277] transition-colors">
          {name}
        </div>
        <div className="text-[8px] text-[#72808a]">Right-hand bat</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-[800]" style={{ color: rank === 1 ? '#4be277' : (rank === 2 ? '#7bbdee' : (rank === 3 ? '#ffb95f' : '#e0e2eb')) }}>{stat1}</div>
        <div className="text-[8px] text-[#72808a] mt-[1px]">{label1} · {label2} {stat2}</div>
      </div>
    </Link>
  );
};
