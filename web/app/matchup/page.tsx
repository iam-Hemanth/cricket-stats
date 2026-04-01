"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBarWithCallback from "@/components/SearchBarWithCallback";
import MatchupCard from "@/components/MatchupCard";

function MatchupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const batterParam = searchParams.get("batter");
  const bowlerParam = searchParams.get("bowler");
  const batterNameParam = searchParams.get("batter_name");
  const bowlerNameParam = searchParams.get("bowler_name");

  const [selectedBatter, setSelectedBatter] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const batterId = selectedBatter?.id ?? batterParam;
  const bowlerId = selectedBowler?.id ?? bowlerParam;
  const batterName = selectedBatter?.name ?? batterNameParam ?? batterId;
  const bowlerName = selectedBowler?.name ?? bowlerNameParam ?? bowlerId;

  // Update URL when selections change
  const updateURL = (
    newBatter: { id: string; name: string } | null,
    newBowler: { id: string; name: string } | null
  ) => {
    const params = new URLSearchParams();
    if (newBatter) {
      params.set("batter", newBatter.id);
      params.set("batter_name", newBatter.name);
    }
    if (newBowler) {
      params.set("bowler", newBowler.id);
      params.set("bowler_name", newBowler.name);
    }
    const query = params.toString();
    router.replace(query ? `/matchup?${query}` : "/matchup", { scroll: false });
  };

  const handleBatterSelect = (id: string, name: string) => {
    const batter = { id, name };
    const bowler =
      selectedBowler ??
      (bowlerId && bowlerName ? { id: bowlerId, name: bowlerName } : null);
    setSelectedBatter(batter);
    updateURL(batter, bowler);
  };

  const handleBowlerSelect = (id: string, name: string) => {
    const bowler = { id, name };
    const batter =
      selectedBatter ??
      (batterId && batterName ? { id: batterId, name: batterName } : null);
    setSelectedBowler(bowler);
    updateURL(batter, bowler);
  };

  return (
    <div className="min-h-screen px-4 py-12">
      {/* Hero */}
      <div className="mx-auto max-w-4xl text-center mb-12">
        <h1 className="text-4xl font-bold text-[--text-primary] mb-4">
          Batter vs Bowler Matchup
        </h1>
        <p className="text-[--text-secondary]">
          Compare any batter against any bowler with detailed head-to-head statistics
        </p>
      </div>

      {/* Search Boxes */}
      <div className="mx-auto max-w-4xl mb-12">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block mb-2 text-sm font-medium text-[--text-primary]">
              Select Batter
            </label>
            <SearchBarWithCallback
              onSelect={handleBatterSelect}
              placeholder="Search for a batter..."
            />
            {batterName && (
              <p className="mt-2 text-sm text-[--accent-green]">
                Selected: {batterName}
              </p>
            )}
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-[--text-primary]">
              Select Bowler
            </label>
            <SearchBarWithCallback
              onSelect={handleBowlerSelect}
              placeholder="Search for a bowler..."
            />
            {bowlerName && (
              <p className="mt-2 text-sm text-[--accent-green]">
                Selected: {bowlerName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Matchup Display */}
      {batterId && bowlerId && batterName && bowlerName && (
        <div className="mx-auto max-w-4xl">
          <MatchupCard
            batterId={batterId}
            bowlerId={bowlerId}
            batterName={batterName}
            bowlerName={bowlerName}
          />
        </div>
      )}

      {/* Empty State */}
      {(!batterId || !bowlerId) && (
        <div className="mx-auto max-w-2xl text-center text-[--text-muted]">
          <p>Select both a batter and a bowler to see their matchup statistics</p>
        </div>
      )}
    </div>
  );
}

export default function MatchupPage() {
  return (
    <Suspense fallback={<div className="text-[--text-muted] text-center p-12">Loading...</div>}>
      <MatchupPageInner />
    </Suspense>
  );
}
