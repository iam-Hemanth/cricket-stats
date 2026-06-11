"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBarWithCallback from "@/components/SearchBarWithCallback";
import PlayerVsTeamCard from "@/components/PlayerVsTeamCard";
import TeamSearchBarWithCallback from "@/components/TeamSearchBarWithCallback";

function PlayerVsTeamPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const playerParam = searchParams.get("player");
  const teamParam = searchParams.get("team");
  const playerNameParam = searchParams.get("player_name");
  const teamNameParam = searchParams.get("team_name");

  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<{ name: string } | null>(null);

  const playerId = selectedPlayer?.id ?? playerParam;
  const teamName = selectedTeam?.name ?? teamParam;
  const playerName = selectedPlayer?.name ?? playerNameParam ?? playerId;
  const displayTeamName = selectedTeam?.name ?? teamNameParam ?? teamName;

  const updateURL = (
    newPlayer: { id: string; name: string } | null,
    newTeam: { name: string } | null
  ) => {
    const p = new URLSearchParams();
    if (newPlayer) { p.set("player", newPlayer.id); p.set("player_name", newPlayer.name); }
    if (newTeam) { p.set("team", newTeam.name); p.set("team_name", newTeam.name); }
    const query = p.toString();
    router.replace(query ? `/player-vs-team?${query}` : "/player-vs-team", { scroll: false });
  };

  const handlePlayerSelect = (id: string, name: string) => {
    const player = { id, name };
    const team = selectedTeam ?? (teamName ? { name: teamName } : null);
    setSelectedPlayer(player);
    updateURL(player, team);
  };

  const handleTeamSelect = (name: string) => {
    const team = { name };
    const player = selectedPlayer ?? (playerId && playerName ? { id: playerId, name: playerName } : null);
    setSelectedTeam(team);
    updateURL(player, team);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <style>{`
        .pvt-search-row{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:16px}
        .pvt-vs-pill{width:34px;height:34px;border-radius:50%;background:var(--bg-card-hover);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--text-muted);margin:0 auto}
        .pvt-label{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>
          Player vs Team
        </h1>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          Analyse how a batter performs against a specific opposition
        </p>
      </div>

      {/* Search row */}
      <div className="pvt-search-row">
        <div>
          <div className="pvt-label">Select Batter</div>
          <SearchBarWithCallback
            onSelect={handlePlayerSelect}
            placeholder="Search player..."
            variant="batter"
          />
          {playerName && (
            <p style={{ marginTop: 4, fontSize: 10, color: "var(--accent-green)" }}>
              {playerName}
            </p>
          )}
        </div>

        <div className="pvt-vs-pill">VS</div>

        <div>
          <div className="pvt-label">Select Team</div>
          <TeamSearchBarWithCallback onSelect={handleTeamSelect} placeholder="Search team..." />
          {displayTeamName && (
            <p style={{ marginTop: 4, fontSize: 10, color: "var(--accent-gold)" }}>
              {displayTeamName}
            </p>
          )}
        </div>
      </div>

      {/* Card */}
      {playerId && teamName && (
        <PlayerVsTeamCard
          playerId={playerId}
          playerName={playerName ?? playerId}
          team={teamName}
        />
      )}

      {/* Empty state */}
      {(!playerId || !teamName) && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>
          Select a player and a team to see their head-to-head stats
        </div>
      )}
    </div>
  );
}

export default function PlayerVsTeamPage() {
  return (
    <Suspense fallback={<div style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>Loading...</div>}>
      <PlayerVsTeamPageInner />
    </Suspense>
  );
}
