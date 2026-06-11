import React from 'react';

interface InlineStatBarProps {
  label: string;
  value: string | number;
  percentage: number;
  color?: string;
  subValue?: string;
}

export const InlineStatBar: React.FC<InlineStatBarProps> = ({
  label,
  value,
  percentage,
  color = '#4be277',
  subValue
}) => {
  return (
    <div className="flex items-center gap-[6px] py-[5px] border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-[10px] font-[500] text-[#e0e2eb] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      <div className="w-[80px] h-[4px] bg-[#31353c] rounded-[2px] overflow-hidden shrink-0">
        <div
          className="h-[4px] rounded-[2px] transition-all duration-1000"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-[700] text-right min-w-[32px] shrink-0" style={{ color }}>{value}</span>
      {subValue && <span className="text-[8px] text-[#72808a] min-w-[40px] text-right shrink-0">{subValue}</span>}
    </div>
  );
};
