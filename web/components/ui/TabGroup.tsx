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
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-1.5 text-sm",
  };

  return (
    <div className="flex items-center gap-2">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`
              rounded-full font-medium transition-all duration-200
              ${sizeClasses[size]}
              ${
                isActive
                  ? "bg-[--bg-card] text-[--text-primary] shadow-sm"
                  : "border border-[--text-muted] bg-transparent text-[--text-secondary] hover:border-[--text-secondary] hover:text-[--text-primary]"
              }
            `}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
