import assert from 'node:assert/strict';
import test from 'node:test';

import { replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';
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

function completedCombat(gameSeed: string) {
  const actions: JudgeCombatAction[] = [{ room: 8, action: 'attack' }];
  let replay = replayJudgeCombat(gameSeed, actions);
  while (!replay.bossDefeated) {
    actions.push({ room: 9, action: 'attack' });
    replay = replayJudgeCombat(gameSeed, actions);
  }
  assert.equal(replay.verified, true);
  return actions;
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
  const early = await revealReplay(post('http://local.test/api/judge-replay/reveal', {
    seal: sealed,
    actions: [{ room: 8, action: 'attack' }],
  }));
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
  const gone = await revealReplay(post('http://local.test/api/judge-replay/reveal', {
    seal: expired,
    actions: [{ room: 8, action: 'attack' }],
  }));
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get('cache-control'), NO_STORE);

  const revealableClaims = newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
  });
  const revealable = sealReplay(revealableClaims);
  globalThis.fetch = async () => Response.json({ data: { Market_by_pk: null } });
  const unverifiable = await revealReplay(post('http://local.test/api/judge-replay/reveal', {
    seal: revealable,
    actions: completedCombat(revealableClaims.gameSeed),
  }));
  assert.equal(unverifiable.status, 409);
  assert.equal(unverifiable.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await unverifiable.json(), { error: 'Committed Somnia settlement could not be verified.' });
});

test('reveal route rejects incomplete combat before reading settlement data', async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 1,
    direction: 'DOWN',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
  });
  globalThis.fetch = async () => { throw new Error('Settlement must not be fetched'); };

  const response = await revealReplay(post('http://local.test/api/judge-replay/reveal', {
    seal: sealReplay(claims),
    actions: [{ room: 8, action: 'attack' }],
  }));
  assert.equal(response.status, 422);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await response.json(), {
    error: 'Combat transcript did not verify. Defeat both the guard and boss before revealing fate.',
  });
});

test('reveal route verifies combat, commitment, and Somnia settlement together', async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
  });
  const actions = completedCombat(claims.gameSeed);
  const poolAddress = `0x${'12'.repeat(20)}`;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { jsonrpc?: string; method?: string; query?: string };
    if (body.jsonrpc) {
      if (body.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x13a7' });
      const word = (value: number) => value.toString(16).padStart(64, '0');
      return Response.json({ jsonrpc: '2.0', id: 1, result: `0x${word(1)}${word(2)}${word(3)}` });
    }
    return Response.json({ data: { Market_by_pk: {
      marketId: MARKET_ID,
      marketAddress: `0x${'34'.repeat(20)}`,
      poolAddress,
      collateral: `0x${'56'.repeat(20)}`,
      asset: 'BTC',
      question: 'BTC closes up',
      strike: '10000',
      tradingStart: String(now - 900),
      expiry: String(now - 300),
      clobStatus: 'Settled',
      intervalSec: 900,
      quoteDecimals: 2,
      yesTokenId: '1',
      noTokenId: '2',
      winningOutcome: 0,
      payoutNumerators: ['1', '0'],
      payoutDenominator: '1',
      voided: false,
      finalized: true,
      resolvedAtTimestamp: String(now - 200),
      lastPrice: '100',
    } } });
  };

  const response = await revealReplay(post('http://local.test/api/judge-replay/reveal', {
    seal: sealReplay(claims),
    actions,
  }));
  const payload = await response.json() as {
    market: { marketId: string };
    replayProof: { verified: boolean; commitment: string };
    combatProof: { verified: boolean; steps: number; guardDefeated: boolean; bossDefeated: boolean; transcriptDigest: string };
    network: { chainId: number };
  };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.equal(payload.market.marketId, MARKET_ID);
  assert.equal(payload.network.chainId, 5031);
  assert.equal(payload.replayProof.verified, true);
  assert.match(payload.replayProof.commitment, /^0x[0-9a-f]{64}$/);
  assert.deepEqual({
    verified: payload.combatProof.verified,
    steps: payload.combatProof.steps,
    guardDefeated: payload.combatProof.guardDefeated,
    bossDefeated: payload.combatProof.bossDefeated,
  }, { verified: true, steps: actions.length, guardDefeated: true, bossDefeated: true });
  assert.match(payload.combatProof.transcriptDigest, /^0x[0-9a-f]{64}$/);
});
