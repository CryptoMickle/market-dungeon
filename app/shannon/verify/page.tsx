import type { Metadata } from 'next';

import ProofVerifierClient from '../../verify/proof-verifier-client';

export const metadata: Metadata = {
  title: 'Verify a Shannon Market Dungeon Run',
  description: 'Independently replay combat and re-fetch a Market Dungeon settlement from Somnia Shannon Testnet.',
};

export default function ShannonVerifyProofPage() {
  return <ProofVerifierClient profileId="shannon-testnet" />;
}
