import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import KevinRivalPreview from '../preview';
import { somniaAgentsEnvironment } from '../../../lib/somnia-agents/environment';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Somnia Agent Kevin’s Playground · Market Dungeon',
  robots: { index: false, follow: false },
};

export default function SomniaAgentsPlaygroundPage() {
  if (somniaAgentsEnvironment(process.env) === 'disabled') notFound();
  return <KevinRivalPreview />;
}
