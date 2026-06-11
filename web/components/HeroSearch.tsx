"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalSearch, type GlobalSearchResult } from "@/components/useGlobalSearch";
import { TeamLogo } from "@/components/TeamLogo";

export default function HeroSearch() {
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(false);

  const onSelect = useCallback(
    (result: GlobalSearchResult) => {
      if (result.type === "player") {
        router.push(`/players/${result.id}`);
      } else {
        router.push(`/team/${result.id}`);
      }
    },
    [router]
  );

  const {
    activeIdx,
    handleKeyDown,
    inputRef,
    isOpen,
    loading,
    query,
    results,
    selectResult,
    setActiveIdx,
    setIsOpen,
    setQuery,
    wrapperRef,
  } = useGlobalSearch({ onSelect });

  return (
    <div ref={wrapperRef} className={`relative mx-auto w-full max-w-xl ${isOpen ? "z-30" : ""}`}>
      <div className={`relative transition-all duration-300 ${isFocused ? 'glow-pulse-ring rounded-full' : ''}`}>
        {/* Search icon */}
        <svg
          className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted transition-colors duration-200"
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
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          onBlur={() => setIsFocused(false)}
          placeholder="Search players or teams — Kohli, Bumrah, India..."
          className="w-full rounded-full border border-glass-border bg-bg-card py-4 pl-14 pr-12 text-base text-text-primary placeholder-text-muted outline-none transition-all duration-300 focus:border-accent-green/40 focus:bg-bg-card-hover"
        />
        {loading && (
          <div className="absolute right-5 top-1/2 -translate-y-1/2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-text-muted/30 border-t-accent-green" />
          </div>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <div className="animate-slide-down absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-glass-border bg-bg-surface/95 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {results.length === 0 ? (
            <div className="px-5 py-4 text-sm text-text-muted">
              No results found
            </div>
          ) : (
            <ul className="py-1">
              {results.map((result, idx) => {
                const isTeam = result.type === "team";
                return (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectResult(result);
                      }}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-all duration-150 ${idx === activeIdx
                          ? "bg-accent-green/5 text-text-primary"
                          : "text-text-primary hover:bg-bg-card/50"
                        }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white overflow-hidden ${idx === activeIdx
                          ? "bg-accent-green"
                          : isTeam ? "bg-gradient-to-br from-accent-blue/60 to-accent-purple/60" : "bg-gradient-to-br from-accent-green/60 to-accent-blue/60"
                        }`}>
                        {isTeam ? (
                          <TeamLogo teamName={result.name} size={24} showFallbackText={true} />
                        ) : (
                          result.name.charAt(0)
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium">{result.name}</span>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted">
                          {result.type}
                        </span>
                      </div>
                      {idx === activeIdx && (
                        <svg className="ml-auto h-4 w-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
