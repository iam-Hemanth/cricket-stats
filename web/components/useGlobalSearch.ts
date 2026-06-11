"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api, { type PlayerSearchResult, type TeamSearchResult } from "@/lib/api";

export type GlobalSearchResult =
  | { type: "player"; id: string; name: string }
  | { type: "team"; id: string; name: string };

type UseGlobalSearchOptions = {
  debounceMs?: number;
  minQueryLength?: number;
  onSelect: (result: GlobalSearchResult) => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useGlobalSearch({
  debounceMs = 300,
  minQueryLength = 2,
  onSelect,
}: UseGlobalSearchOptions) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < minQueryLength) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(async () => {
      setLoading(true);
      try {
        // Fetch both players and teams in parallel
        const [players, teams] = await Promise.all([
          api.searchPlayers(trimmedQuery, { signal: controller.signal }),
          api.searchTeams(trimmedQuery) // api.searchTeams doesn't support signal yet but it's fine
        ]);

        if (controller.signal.aborted) return;

        const combined: GlobalSearchResult[] = [
          ...teams.map(t => ({ type: "team" as const, id: t.team, name: t.team })),
          ...players.map(p => ({ type: "player" as const, id: p.player_id, name: p.name }))
        ];

        setResults(combined);
        setIsOpen(true);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Global search failed:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timerId);
    };
  }, [debounceMs, minQueryLength, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectResult = useCallback(
    (result: GlobalSearchResult) => {
      setIsOpen(false);
      setQuery("");
      setResults([]);
      setActiveIdx(-1);
      setTimeout(() => {
        onSelect(result);
      }, 50);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIdx((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (activeIdx >= 0 && activeIdx < results.length) {
            selectResult(results[activeIdx]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [activeIdx, isOpen, results, selectResult]
  );

  useEffect(() => {
    setActiveIdx(-1);
  }, [results]);

  return {
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
  };
}
