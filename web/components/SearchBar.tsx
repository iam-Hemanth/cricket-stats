"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGlobalSearch, type GlobalSearchResult } from "@/components/useGlobalSearch";
import { TeamLogo } from "@/components/TeamLogo";

export default function SearchBar() {
  const router = useRouter();

  // ── Navigate to result ─────────────────────────────────
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
    <div ref={wrapperRef} className={`relative w-full max-w-xs ${isOpen ? "z-30" : ""}`}>
      {/* Input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted"
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
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder="Search..."
          className="w-full rounded-lg border border-glass-border bg-bg-card py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-200 focus:border-accent-green/40 focus:bg-bg-card-hover focus:shadow-sm focus:shadow-accent-green-glow"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-muted/40 border-t-accent-green" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="animate-slide-down absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-glass-border bg-bg-surface/95 shadow-xl shadow-black/20 backdrop-blur-xl">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">
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
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-all duration-150 ${idx === activeIdx
                        ? "bg-accent-green/5 text-text-primary"
                        : "text-text-primary hover:bg-bg-card/50"
                        }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white overflow-hidden ${idx === activeIdx ? "bg-accent-green" : isTeam ? "bg-gradient-to-br from-accent-blue/60 to-accent-purple/60" : "bg-gradient-to-br from-accent-green/60 to-accent-blue/60"
                        }`}>
                        {isTeam ? (
                          <TeamLogo teamName={result.name} size={16} showFallbackText={true} />
                        ) : (
                          result.name.charAt(0)
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[180px]">{result.name}</span>
                        <span className="text-[8px] uppercase tracking-wider text-text-muted">
                          {result.type}
                        </span>
                      </div>
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
