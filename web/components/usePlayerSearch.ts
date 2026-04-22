"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import api, { type PlayerSearchResult } from "@/lib/api";

type UsePlayerSearchOptions = {
  debounceMs?: number;
  excludePlayerId?: string;
  minQueryLength?: number;
  onSelect: (player: PlayerSearchResult) => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function usePlayerSearch({
  debounceMs = 300,
  excludePlayerId,
  minQueryLength = 2,
  onSelect,
}: UsePlayerSearchOptions) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
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
        const players = await api.searchPlayers(trimmedQuery, {
          signal: controller.signal,
        });
        const filteredResults = excludePlayerId
          ? players.filter((player) => player.player_id !== excludePlayerId)
          : players;
        setResults(filteredResults);
        setIsOpen(true);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Search failed:", error);
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
  }, [debounceMs, excludePlayerId, minQueryLength, query]);

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

  const selectPlayer = useCallback(
    (player: PlayerSearchResult) => {
      setIsOpen(false);
      setQuery("");
      setResults([]);
      setActiveIdx(-1);
      onSelect(player);
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
            selectPlayer(results[activeIdx]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [activeIdx, isOpen, results, selectPlayer]
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
    selectPlayer,
    setActiveIdx,
    setIsOpen,
    setQuery,
    wrapperRef,
  };
}
