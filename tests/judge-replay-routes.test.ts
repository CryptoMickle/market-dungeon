import assert from 'node:assert/strict';
import test from 'node:test';

import { newReplayClaims, sealReplay } from '../app/api/judge-replay/crypto.ts';
import { POST as revealReplay } from '../app/api/judge-replay/reveal/route.ts';
import { POST as startReplay } from '../app/api/judge-replay/start/route.ts';

const KEY = '33'.repeat(32);
const MARKET_ID = `0x${'cd'.repeat(32)}`;
const NO_STORE = 'private, no-store, max-age=0';
const originalFetch = globalThis.fetch;

function configure() {
  process.env.JUDGE_REPLAY_SEAL_KEY = KEY;
  process.env.VERCEL_ENV = 'preview';
}

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.beforeEach(configure);
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('start route uses a balanced outcome pool and leaks no selected-market metadata', async () => {
  globalThis.fetch = async () => Response.json({
    data: { Market: [
      { marketId: MARKET_ID, winningOutcome: 0 },
      { marketId: `0x${'ef'.repeat(32)}`, winningOutcome: 1 },
    ] },
  });

  const response = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP' }));
  const payload = await response.json() as { replay: Record<string, unknown> };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(Object.keys(payload.replay).sort(), [
    'commitment', 'expiresAt', 'gameSeed', 'lockedDirection', 'publicMarket', 'revealAfter', 'seal',
  ]);
  assert.doesNotMatch(JSON.stringify(payload.replay), /marketId|marketAddress|poolAddress|strikeUsd|winningOutcome|expiryIso|resolvedAt/i);
});

test('start route rejects extra fields and fails closed for empty or one-sided replay pools', async () => {
  const invalid = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP', debug: true }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), NO_STORE);

  globalThis.fetch = async () => Response.json({ data: { Market: [] } });
  const unavailable = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP' }));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await unavailable.json(), { error: 'Sealed Judge Replay is unavailable. Please try again.' });

  globalThis.fetch = async () => Response.json({
    data: { Market: [{ marketId: MARKET_ID, winningOutcome: 0 }] },
  });
  const predictable = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'DOWN' }));
  assert.equal(predictable.status, 503);
  assert.equal(predictable.headers.get('cache-control'), NO_STORE);
});

test('reveal route enforces malformed, sealed, expired, and unverifiable boundaries', async () => {
  const invalid = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: 'invalid', extra: true }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), NO_STORE);

  const now = Math.floor(Date.now() / 1000);
  const sealed = sealReplay(newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now,
    revealAfter: now + 15,
    expiresAt: now + 1_800,
  }));
  const early = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: sealed }));
  assert.equal(early.status, 425);
  assert.equal(early.headers.get('cache-control'), NO_STORE);
  assert.ok(Number(early.headers.get('retry-after')) > 0);

  const expired = sealReplay(newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 2_000,
    revealAfter: now - 1_985,
    expiresAt: now - 1,
  }));
  const gone = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: expired }));
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get('cache-control'), NO_STORE);

  const revealable = sealReplay(newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
  }));
  globalThis.fetch = async () => Response.json({ data: { Market_by_pk: null } });
  const unverifiable = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: revealable }));
  assert.equal(unverifiable.status, 409);
  assert.equal(unverifiable.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await unverifiable.json(), { error: 'Committed Somnia settlement could not be verified.' });
});
