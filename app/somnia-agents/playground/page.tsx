import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import KevinRivalPreview from '../preview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Somnia Agent Kevin’s Playground · Market Dungeon Local',
  robots: { index: false, follow: false },
};

export default function SomniaAgentsPlaygroundPage() {
  if (process.env.MARKET_DUNGEON_LOCAL_AGENTS !== '1' || process.env.VERCEL) notFound();
  return <KevinRivalPreview />;
}
