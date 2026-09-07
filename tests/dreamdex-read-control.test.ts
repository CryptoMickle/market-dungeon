import assert from 'node:assert/strict';
import test from 'node:test';

import { graphql, isRetryableUpstreamError } from '../app/api/dreamdex.ts';
import { SHANNON_TESTNET_PROFILE } from '../app/judge-network.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('idempotent indexer reads retry once and always carry an abort signal', async () => {
  let calls = 0;
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    signals.push(init?.signal);
    if (calls === 1) return new Response(null, { status: 503 });
    return Response.json({ data: { Market: [] } });
  };

  assert.deepEqual(await graphql('query RetryableRead { Market { marketId } }'), { Market: [] });
  assert.equal(calls, 2);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
});

test('query errors fail closed without retrying a non-transport failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ errors: [{ message: 'invalid query' }] });
  };

  await assert.rejects(
    graphql('query InvalidRead { Missing { id } }'),
    (error: unknown) => error instanceof Error && !isRetryableUpstreamError(error),
  );
  assert.equal(calls, 1);
});

test('a persistent transport timeout stops after the bounded second attempt', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new DOMException('read timed out', 'TimeoutError');
  };

  await assert.rejects(
    graphql('query TimedRead { Market { marketId } }'),
    (error: unknown) => isRetryableUpstreamError(error) && error.retryAfter === 2,
  );
  assert.equal(calls, 2);
});

test('candidate reads can finish beyond the default 5s without changing ordinary read budgets', async (t) => {
  let elapsed = 0;
  const timeouts: number[] = [];
  t.mock.method(performance, 'now', () => elapsed);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  globalThis.fetch = async () => {
    elapsed += 9_600;
    return Response.json({ data: { fiveMinute: [], fifteenMinute: [] } });
  };
  assert.deepEqual(await graphql('query Candidates { Market { marketId } }', {}, SHANNON_TESTNET_PROFILE,
    { timeoutMs: 12_000, totalBudgetMs: 15_000 }), { fiveMinute: [], fifteenMinute: [] });
  await graphql('query Ordinary { Market { marketId } }');
  assert.deepEqual(timeouts, [12_000, 5_000]);
});

test('candidate retry uses only the remaining shared budget and never starts a third attempt', async (t) => {
  let elapsed = 0;
  const timeouts: number[] = [];
  t.mock.method(performance, 'now', () => elapsed);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  globalThis.fetch = async () => {
    elapsed += timeouts.at(-1)!;
    throw new DOMException('read timed out', 'TimeoutError');
  };
  await assert.rejects(graphql('query Candidates { Market { marketId } }', {}, SHANNON_TESTNET_PROFILE,
    { timeoutMs: 12_000, totalBudgetMs: 15_000 }), isRetryableUpstreamError);
  assert.deepEqual(timeouts, [12_000, 3_000]);
  assert.equal(elapsed, 15_000);
});

test('an exhausted candidate budget prevents a second request', async (t) => {
  let elapsed = 0;
  let calls = 0;
  t.mock.method(performance, 'now', () => elapsed);
  globalThis.fetch = async () => {
    calls += 1;
    elapsed = 15_000;
    throw new DOMException('read timed out', 'TimeoutError');
  };
  await assert.rejects(graphql('query Candidates { Market { marketId } }', {}, SHANNON_TESTNET_PROFILE,
    { timeoutMs: 12_000, totalBudgetMs: 15_000 }), isRetryableUpstreamError);
  assert.equal(calls, 1);
});
