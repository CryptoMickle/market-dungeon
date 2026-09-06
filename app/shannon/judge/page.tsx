import type { Metadata } from 'next';

import MarketDungeon from '../../market-dungeon';

export const metadata: Metadata = {
  title: 'Market Dungeon — Shannon Judge Replay',
  description: 'A read-only Market Dungeon Judge replay verified against Somnia Shannon Testnet.',
};

export default function ShannonJudgeEntryPage() {
  return <MarketDungeon directJudgeEntry judgeProfileId="shannon-testnet" />;
}
