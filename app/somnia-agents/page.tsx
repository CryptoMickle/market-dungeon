import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FullExpedition from '../full-expedition';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Somnia Agents · Market Dungeon Local',
  robots: { index: false, follow: false },
};

export default function SomniaAgentsPage() {
  if (process.env.MARKET_DUNGEON_LOCAL_AGENTS !== '1' || process.env.VERCEL) notFound();
  return <FullExpedition localAgents autoEnter />;
}
