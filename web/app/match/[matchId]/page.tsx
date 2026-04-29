import MatchCard from "@/components/MatchCard";

export default async function MatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;

  return (
    <main className="min-h-screen p-4 sm:p-8 md:p-12 pb-24">
      <MatchCard matchId={matchId} />
    </main>
  );
}
