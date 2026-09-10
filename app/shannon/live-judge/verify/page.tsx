import type { Metadata } from 'next';

import LiveJudgeVerifier from '../../../live-judge-verifier';

export const metadata: Metadata = {
  title: 'Verify a Live Market Dungeon Run',
  description: 'Check a live Judge choice receipt, replay combat and independently read the pending market and final settlement from Somnia Shannon testnet.',
};

export default function LiveJudgeVerifyPage() {
  return <LiveJudgeVerifier />;
}
