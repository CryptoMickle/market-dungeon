import type { Metadata } from 'next';
import LiveJudge from '../../live-judge';

export const metadata: Metadata = {
  title: 'Market Dungeon — Live Judge Demo',
  description: 'Lock your omen, fight the guard and boss, and discover a fresh one-minute Event Contract result on Somnia testnet.',
};

export default function LiveJudgePage() {
  return <LiveJudge />;
}
