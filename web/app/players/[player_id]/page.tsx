export const dynamic = 'force-dynamic';

import PlayerProfile from "@/components/PlayerProfile";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ player_id: string }>;
}) {
  const { player_id } = await params;

  return <PlayerProfile playerId={player_id} />;
}
