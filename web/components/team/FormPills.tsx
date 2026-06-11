import React from 'react';

interface FormPill {
  result: string;
  match_id: string;
  date: string | Date;
}

interface FormPillsProps {
  pills: FormPill[];
}

export const FormPills: React.FC<FormPillsProps> = ({ pills }) => {
  return (
    <div className="flex gap-[4px]">
      {pills.map((pill, idx) => {
        let bg = "#31353c";
        let color = "#72808a";
        let borderColor = "rgba(255,255,255,0.07)";

        switch (pill.result) {
          case 'W':
            bg = "#1a3a2a";
            color = "#4be277";
            borderColor = "rgba(75,226,119,0.2)";
            break;
          case 'L':
            bg = "#2e1a1a";
            color = "#ff6b6b";
            borderColor = "rgba(255,107,107,0.2)";
            break;
          case 'NR':
            bg = "#1a1a2e";
            color = "#7bbdee";
            borderColor = "rgba(123,189,238,0.2)";
            break;
        }

        return (
          <div
            key={`${pill.match_id}-${idx}`}
            className="w-[28px] h-[28px] rounded-[7px] flex items-center justify-center text-[9px] font-[800] transition-transform duration-300 hover:scale-[1.15] cursor-help group relative border"
            style={{ backgroundColor: bg, color: color, borderColor: borderColor }}
          >
            {pill.result}
            
            {/* TOOLTIP */}
            <div className="absolute bottom-full mb-[6px] left-1/2 -translate-x-1/2 px-[6px] py-[4px] bg-[#272a31] border border-[rgba(255,255,255,0.07)] rounded-[4px] text-[8px] font-[700] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
              {new Date(pill.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
