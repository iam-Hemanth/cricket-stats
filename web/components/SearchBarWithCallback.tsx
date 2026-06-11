"use client";

import { useCallback } from "react";
import { usePlayerSearch } from "@/components/usePlayerSearch";

interface SearchBarWithCallbackProps {
  onSelect: (id: string, name: string) => void;
  placeholder?: string;
  variant?: "batter" | "bowler" | "default";
}

export default function SearchBarWithCallback({
  onSelect,
  placeholder = "Search players...",
  variant = "default",
}: SearchBarWithCallbackProps) {
  const selectPlayer = useCallback(
    (player: { player_id: string; name: string }) => {
      onSelect(player.player_id, player.name);
    },
    [onSelect]
  );

  const {
    activeIdx,
    handleKeyDown,
    inputRef,
    isOpen,
    loading,
    query,
    results,
    selectPlayer: choosePlayer,
    setActiveIdx,
    setIsOpen,
    setQuery,
    wrapperRef,
  } = usePlayerSearch({ onSelect: selectPlayer });

  return (
    <div ref={wrapperRef} className={`relative w-full ${isOpen ? "z-30" : ""}`}>
      {/* Input */}
      <div className="relative">
        {variant === "default" ? (
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        ) : (
          <div
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${
              variant === "batter" ? "bg-accent-green" : "bg-accent-blue"
            }`}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-white/5 bg-white/5 py-3 ${
            variant === "default" ? "pl-10" : "pl-8"
          } pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-white/10 focus:ring-1 focus:ring-white/10`}
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-muted/40 border-t-accent-green" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-text-muted/20 bg-bg-surface shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">
              No players found
            </div>
          ) : (
            <ul className="py-1 max-h-80 overflow-y-auto">
              {results.map((player, idx) => (
                <li key={player.player_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      choosePlayer(player);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${idx === activeIdx
                        ? "bg-bg-card text-text-primary"
                        : "text-text-primary hover:bg-bg-card"
                      }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-green/20 text-xs font-medium text-accent-green">
                      {player.name.charAt(0)}
                    </span>
                    <span>{player.name}</span>
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
