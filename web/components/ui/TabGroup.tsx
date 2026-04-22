"use client";

interface TabGroupProps {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
  size?: "sm" | "md";
}

export default function TabGroup({
  tabs,
  activeTab,
  onChange,
  size = "md",
}: TabGroupProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-[--bg-surface] p-1">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`
              relative rounded-lg font-medium transition-all duration-250 ease-out
              ${sizeClasses[size]}
              ${
                isActive
                  ? "bg-[--bg-card] text-[--text-primary] shadow-md shadow-black/10"
                  : "text-[--text-muted] hover:text-[--text-secondary] hover:bg-[--bg-card]/50"
              }
            `}
          >
            {tab}
            {isActive && (
              <span className="absolute bottom-0 left-1/2 h-0.5 w-3/5 -translate-x-1/2 rounded-full bg-[--accent-green]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
