import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FullExpedition from '../full-expedition';
import { somniaAgentsEnvironment } from '../../lib/somnia-agents/environment';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Somnia Agents · Market Dungeon',
  robots: { index: false, follow: false },
};

export default function SomniaAgentsPage() {
  if (somniaAgentsEnvironment(process.env) === 'disabled') notFound();
  return <FullExpedition localAgents autoEnter />;
}
