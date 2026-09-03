import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';

import { GET as marketRoute } from '../app/api/market/route.ts';
import { DREAMDEX_MAINNET_CONTRACTS } from '../app/api/dreamdex.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI } from '../app/onchain-settlement-proof.ts';

const MARKET_ID = `0x${'12'.repeat(32)}`;
const MARKET_ADDRESS = `0x${'34'.repeat(20)}` as `0x${string}`;
const POOL_ADDRESS = `0x${'56'.repeat(20)}` as `0x${string}`;
const COLLATERAL = `0x${'78'.repeat(20)}` as `0x${string}`;
const BLOCK_HASH = `0x${'9a'.repeat(32)}`;
const NONCE = 7n;
const YES_ID = (BigInt(POOL_ADDRESS) << 72n) | (NONCE << 8n);
const NO_ID = YES_ID + 1n;
const originalFetch = globalThis.fetch;

function indexedMarket(overrides: Record<string, unknown> = {}) {
  return {
    marketId: MARKET_ID,
    marketAddress: MARKET_ADDRESS,
    poolAddress: POOL_ADDRESS,
    collateral: COLLATERAL,
    yesTokenId: YES_ID.toString(),
    noTokenId: NO_ID.toString(),
    intervalSec: '300',
    status: 'Finalized',
    finalized: false,
    voided: true,
    winningOutcome: null,
    payoutNumerators: ['5000000', '5000000'],
    payoutDenominator: '10000000',
    resolvedAtTimestamp: '1788436500',
    ...overrides,
  };
}

function moduleResult() {
  return encodeFunctionResult({
    abi: MODULE_MARKETS_ABI,
    functionName: 'markets',
    result: [
      51115n,
      2,
      0,
      COLLATERAL,
      5,
      `0x${'ab'.repeat(32)}` as `0x${string}`,
      `0x${'bc'.repeat(20)}` as `0x${string}`,
      `0x${'cd'.repeat(20)}` as `0x${string}`,
      MARKET_ADDRESS,
      POOL_ADDRESS,
      YES_ID,
      NO_ID,
      1788436200n,
      1788436500n,
    ],
  });
}

function voidSettlementResult() {
  return encodeFunctionResult({
    abi: BINARY_SETTLEMENT_ABI,
    functionName: 'getSettlement',
    result: [
      COLLATERAL,
      1_000n,
      true,
      true,
      0n,
      `0x${'de'.repeat(20)}`,
      POOL_ADDRESS,
      NONCE,
      [5_000_000n, 5_000_000n],
    ] as never,
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('voided live settlement requires and returns a canonical direct proof even when indexed finalized is false', async () => {
  let hashPinnedCalls = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      jsonrpc?: string;
      method?: string;
      params?: Array<{ to?: string; data?: string } | string | boolean>;
    };
    if (!body.jsonrpc) return Response.json({ data: { Market_by_pk: indexedMarket() } });
    if (body.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x13a7' });
    if (body.method === 'eth_blockNumber') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x10' });
    if (body.method === 'eth_getBlockByNumber') {
      return Response.json({ jsonrpc: '2.0', id: 1, result: { number: '0x10', hash: BLOCK_HASH } });
    }
    const call = body.params?.[0] as { to?: string } | undefined;
    if (call?.to?.toLowerCase() === DREAMDEX_MAINNET_CONTRACTS.binaryModule.toLowerCase()) {
      assert.deepEqual(body.params?.[1], { blockHash: BLOCK_HASH, requireCanonical: true });
      hashPinnedCalls += 1;
      return Response.json({ jsonrpc: '2.0', id: 1, result: moduleResult() });
    }
    if (call?.to?.toLowerCase() === DREAMDEX_MAINNET_CONTRACTS.binarySettlement.toLowerCase()) {
      assert.deepEqual(body.params?.[1], { blockHash: BLOCK_HASH, requireCanonical: true });
      hashPinnedCalls += 1;
      return Response.json({ jsonrpc: '2.0', id: 1, result: voidSettlementResult() });
    }
    throw new Error(`Unexpected RPC request: ${body.method}`);
  };

  const response = await marketRoute(new Request(`http://local.test/api/market?marketId=${MARKET_ID}`));
  const payload = await response.json() as {
    market: { finalized: boolean; voided: boolean };
    onchainSettlement?: { verified: boolean; finalized: boolean; voided: boolean; winningOutcome: number | null };
  };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(payload.market, { ...indexedMarket() });
  assert.deepEqual(payload.onchainSettlement && {
    verified: payload.onchainSettlement.verified,
    finalized: payload.onchainSettlement.finalized,
    voided: payload.onchainSettlement.voided,
    winningOutcome: payload.onchainSettlement.winningOutcome,
  }, { verified: true, finalized: true, voided: true, winningOutcome: null });
  assert.equal(hashPinnedCalls, 2);
});

test('terminal live settlement fails closed when the direct proof cannot be obtained', async () => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { jsonrpc?: string; method?: string };
    if (!body.jsonrpc) return Response.json({ data: { Market_by_pk: indexedMarket() } });
    if (body.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x13a7' });
    return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unavailable' } });
  };

  const response = await marketRoute(new Request(`http://local.test/api/market?marketId=${MARKET_ID}`));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 502);
  assert.equal('market' in payload, false);
});

test('non-terminal live settlement remains pending without direct settlement reads', async () => {
  let reads = 0;
  globalThis.fetch = async () => {
    reads += 1;
    return Response.json({ data: { Market_by_pk: indexedMarket({ status: 'Trading', finalized: false, voided: false }) } });
  };

  const response = await marketRoute(new Request(`http://local.test/api/market?marketId=${MARKET_ID}`));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal('onchainSettlement' in payload, false);
  assert.equal(reads, 1);
});
