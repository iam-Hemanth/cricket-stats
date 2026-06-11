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
      {/* Search Section */}
      <div className="mx-auto max-w-4xl mb-8 flex flex-col md:flex-row items-center gap-4 px-20">
        {/* Batter Search */}
        <div className="flex-1 w-full">
          <label className="block mb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            Select Batter
          </label>
          <SearchBarWithCallback
            onSelect={handleBatterSelect}
            placeholder="Search for a batter..."
            variant="batter"
          />
          {batterName && (
            <p className="mt-2 text-sm text-accent-green">
              Selected: {batterName}
            </p>
          )}
        </div>

        {/* VS Circle */}
        <div className="hidden md:flex shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center text-[10px] font-bold text-text-muted mt-6">
          VS
        </div>

        {/* Bowler Search */}
        <div className="flex-1 w-full">
          <label className="block mb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            Select Bowler
          </label>
          <SearchBarWithCallback
            onSelect={handleBowlerSelect}
            placeholder="Search for a bowler..."
            variant="bowler"
          />
          {bowlerName && (
            <p className="mt-2 text-sm text-[#4dabf7]">
              Selected: {bowlerName}
            </p>
          )}
        </div>
      </div>

      {/* Matchup Display */}
      {batterId && bowlerId && batterName && bowlerName && (
        <div className="mx-auto max-w-5xl">
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
        <div className="mx-auto max-w-2xl text-center text-text-muted">
          <p>Select both a batter and a bowler to see their matchup statistics</p>
        </div>
      )}
    </div>
  );
}

export default function MatchupPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-center p-12">Loading...</div>}>
      <MatchupPageInner />
    </Suspense>
  );
}
