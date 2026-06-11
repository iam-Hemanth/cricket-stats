export const dynamic = 'force-dynamic';

import TeamDashboard from "@/components/TeamDashboard";
import { Metadata } from 'next';

type Props = {
  params: Promise<{ team_name: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team_name } = await params;
  const name = decodeURIComponent(team_name);
  return {
    title: `${name} - Team Dashboard | CricStats`,
    description: `Comprehensive performance analytics and statistics for ${name}.`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { team_name } = await params;
  const decodedTeamName = decodeURIComponent(team_name);

  return (
    <main className="min-h-screen pt-12 md:pt-20">
      <TeamDashboard teamName={decodedTeamName} />
    </main>
  );
}
