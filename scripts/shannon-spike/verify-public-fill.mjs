import { readFileSync } from 'node:fs';

import { createPublicClient, http } from 'viem';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

import { fetchAndVerifyFilledBuyIocProof } from './proof-kernel.mjs';

const RPC_URL = 'https://api.infra.testnet.somnia.network';
const EXPLORER_URL = 'https://shannon-explorer.somnia.network';
const evidence = JSON.parse(readFileSync(new URL(
  './evidence/wb02-2026-09-04.json',
  import.meta.url,
), 'utf8'));
const fixture = evidence.publicIocFillFixture;
const intent = {
  account: fixture.transaction.from,
  marketId: fixture.binding.marketId,
  market: fixture.binding.market,
  pool: fixture.binding.pool,
  collateral: fixture.binding.collateral,
  yesId: fixture.binding.yesId,
  noId: fixture.binding.noId,
  nonce: fixture.binding.nonce,
  side: fixture.decodedIntent.side,
  yesPrice: fixture.decodedIntent.yesPrice,
  quantity: fixture.decodedIntent.quantity,
  expireTimestampNs: fixture.decodedIntent.expireTimestampNs,
  userData: fixture.decodedIntent.userData,
};
const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(RPC_URL, { retryCount: 0, timeout: 10_000 }),
});

const proof = await fetchAndVerifyFilledBuyIocProof({
  publicClient,
  transactionHash: fixture.transaction.hash,
  intent,
});

console.log(JSON.stringify({
  schema: 'market-dungeon-public-shannon-fill-verification/v1',
  safety: 'READ_ONLY; THIRD-PARTY FIXTURE; NOT A MARKET DUNGEON GATE 1 WRITE',
  verified: true,
  transactionHash: fixture.transaction.hash,
  transactionIndex: fixture.transaction.transactionIndex,
  blockNumber: proof.binding.blockNumber,
  blockHash: proof.binding.blockHash,
  marketId: intent.marketId,
  market: intent.market,
  pool: intent.pool,
  side: intent.side,
  orderId: proof.orderId,
  fillCount: proof.fills.length,
  totalFilled: proof.totalFilled,
  explorer: `${EXPLORER_URL}/tx/${fixture.transaction.hash}`,
}, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
