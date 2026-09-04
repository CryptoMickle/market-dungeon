import type { Metadata } from 'next';

import ProofVerifierClient from './proof-verifier-client';

export const metadata: Metadata = {
  title: 'Verify a Market Dungeon Run',
  description: 'Independently replay combat and re-fetch a Market Dungeon settlement from Somnia mainnet.',
};

export default function VerifyProofPage() {
  return <ProofVerifierClient />;
}
