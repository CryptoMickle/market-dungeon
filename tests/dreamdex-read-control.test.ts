import assert from 'node:assert/strict';
import test from 'node:test';

import { graphql, isRetryableUpstreamError } from '../app/api/dreamdex.ts';

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
