"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PlayerSearchResult } from "@/lib/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SearchBar() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  // ── Debounced search ────────────────────────────────────
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/players/search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data: PlayerSearchResult[] = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // ── Click outside to close ──────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Navigate to player ─────────────────────────────────
  const selectPlayer = useCallback(
    (playerId: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(`/players/${playerId}`);
    },
    [router]
  );

  // ── Keyboard navigation ────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < results.length) {
          selectPlayer(results[activeIdx].player_id);
        }
        break;
      case "Escape":
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  }

  // Reset active index when results change
  useEffect(() => setActiveIdx(-1), [results]);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      {/* Input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
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
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search players..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-400 focus:bg-white focus:ring-1 focus:ring-gray-300"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              No players found
            </div>
          ) : (
            <ul>
              {results.map((player, idx) => (
                <li key={player.player_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectPlayer(player.player_id);
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${idx === activeIdx
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
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
