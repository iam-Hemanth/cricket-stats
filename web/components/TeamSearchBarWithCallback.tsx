"use client";

import { useTeamSearch } from "@/components/useTeamSearch";
import { TeamLogo } from "@/components/TeamLogo";

interface Props {
  onSelect: (teamName: string) => void;
  placeholder?: string;
}

export default function TeamSearchBarWithCallback({ onSelect, placeholder = "Search team..." }: Props) {
  const {
    activeIdx,
    handleKeyDown,
    inputRef,
    isOpen,
    loading,
    query,
    results,
    selectTeam,
    setQuery,
    wrapperRef,
  } = useTeamSearch({ onSelect });

  return (
    <div ref={wrapperRef} className={`relative w-full ${isOpen ? "z-30" : ""}`}>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent-gold" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/5 bg-white/5 py-3 pl-8 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-white/10 focus:ring-1 focus:ring-white/10"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-muted/40 border-t-accent-gold" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-text-muted/20 bg-bg-surface shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">No teams found</div>
          ) : (
            <ul className="py-1 max-h-72 overflow-y-auto">
              {results.map((r, idx) => (
                <li key={r.team}>
                  <button
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectTeam(r.team);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                      idx === activeIdx ? "bg-bg-card text-text-primary" : "text-text-primary hover:bg-bg-card"
                    }`}
                  >
                    <TeamLogo teamName={r.team} size={24} showFallbackText={true} />
                    <span>{r.team}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
