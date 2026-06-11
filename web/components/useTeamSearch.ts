"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type UseTeamSearchOptions = {
  debounceMs?: number;
  minQueryLength?: number;
  onSelect: (teamName: string) => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useTeamSearch({
  debounceMs = 300,
  minQueryLength = 2,
  onSelect,
}: UseTeamSearchOptions) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ team: string }[]>([]);
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
        const data = await api.searchTeams(trimmedQuery, {
          signal: controller.signal,
        });
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Team search failed:", error);
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

  const selectTeam = useCallback(
    (teamName: string) => {
      setIsOpen(false);
      setQuery("");
      setResults([]);
      setActiveIdx(-1);
      setTimeout(() => {
        onSelect(teamName);
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
            selectTeam(results[activeIdx].team);
          } else if (results.length > 0) {
            selectTeam(results[0].team);
          }
          break;
        case "Escape":
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [activeIdx, isOpen, results, selectTeam]
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
    selectTeam,
    setActiveIdx,
    setIsOpen,
    setQuery,
    wrapperRef,
  };
}
