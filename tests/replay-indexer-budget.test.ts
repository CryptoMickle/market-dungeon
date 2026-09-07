import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchFullMarket, hydrateMarket, isRetryableUpstreamError } from '../app/api/dreamdex.ts';
import { SOMNIA_MAINNET_PROFILE } from '../app/judge-network.ts';

const originalFetch = globalThis.fetch;
const market = {
  marketId: `0x${'ab'.repeat(32)}`,
  poolAddress: `0x${'12'.repeat(20)}`,
  strike: '0',
  expiry: 1_900_000_000,
  finalized: false,
  status: 'Open',
};
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('replay metadata, reference and answer reads share one deadline without changing RPC budgets', async (t) => {
  let elapsed = 0;
  const timeouts: number[] = [];
  const operations: string[] = [];
  t.mock.method(performance, 'now', () => elapsed);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const operation = body.method ?? body.query.match(/query\s+(\w+)/)[1];
    operations.push(operation);
    if (operation === 'ReplaySettlement') {
      elapsed += 3_000;
      return Response.json({ data: { Market_by_pk: market } });
    }
    if (operation === 'OpeningRefs') {
      elapsed += 6_000;
      return Response.json({ data: { MarketReferenceLink: [{ referenceQuestionId: '123' }] } });
    }
    if (operation === 'OpeningAnswers') {
      elapsed += 5_000;
      return Response.json({ data: { OracleAnswer: [{ numericValue: '6500000' }] } });
    }
    if (operation === 'eth_chainId') return Response.json({ result: '0x13a7' });
    if (operation === 'eth_call') return Response.json({ result: `0x${'1'.padStart(64, '0').repeat(3)}` });
    throw new Error('Unexpected read');
  };
  const budget = { deadline: 15_000, timeoutMs: 12_000 };
  const raw = await fetchFullMarket(market.marketId, SOMNIA_MAINNET_PROFILE, budget);
  const hydrated = await hydrateMarket(raw!, true, SOMNIA_MAINNET_PROFILE, budget);
  assert.equal(hydrated.market.strikeUsd, '65000.00');
  assert.deepEqual(operations, ['ReplaySettlement', 'OpeningRefs', 'OpeningAnswers', 'eth_chainId', 'eth_call']);
  assert.deepEqual(timeouts, [12_000, 12_000, 6_000, 5_000, 5_000]);
});

test('an exhausted reveal indexer budget prevents answer and RPC reads rather than producing a partial result', async (t) => {
  let elapsed = 0;
  const operations: string[] = [];
  t.mock.method(performance, 'now', () => elapsed);
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const operation = body.method ?? body.query.match(/query\s+(\w+)/)[1];
    operations.push(operation);
    if (operation === 'ReplaySettlement') {
      elapsed = 12_000;
      return Response.json({ data: { Market_by_pk: market } });
    }
    if (operation === 'OpeningRefs') {
      elapsed = 15_000;
      return Response.json({ data: { MarketReferenceLink: [{ referenceQuestionId: '123' }] } });
    }
    throw new Error('Unexpected read after budget exhaustion');
  };
  const budget = { deadline: 15_000, timeoutMs: 12_000 };
  const raw = await fetchFullMarket(market.marketId, SOMNIA_MAINNET_PROFILE, budget);
  await assert.rejects(hydrateMarket(raw!, true, SOMNIA_MAINNET_PROFILE, budget), isRetryableUpstreamError);
  assert.deepEqual(operations, ['ReplaySettlement', 'OpeningRefs']);
});

test('an already exhausted metadata budget sends no request and default reads retain 5s', async (t) => {
  let calls = 0;
  const timeouts: number[] = [];
  t.mock.method(performance, 'now', () => 15_000);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  globalThis.fetch = async () => { calls += 1; return Response.json({ data: { Market_by_pk: market } }); };
  await assert.rejects(fetchFullMarket(market.marketId, SOMNIA_MAINNET_PROFILE,
    { deadline: 15_000, timeoutMs: 12_000 }), isRetryableUpstreamError);
  assert.equal(calls, 0);
  await fetchFullMarket(market.marketId);
  assert.equal(calls, 1);
  assert.deepEqual(timeouts, [5_000]);
});
