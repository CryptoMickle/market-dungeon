import assert from 'node:assert/strict';
import test from 'node:test';

import { createFullRunReplayRevealHandler } from '../app/api/full-run/replay/reveal/handler.ts';
import { POST as startFullRunReplay } from '../app/api/full-run/replay/start/route.ts';
import {
  newReplayClaims,
  openReplay,
  type ReplayClaims,
} from '../app/api/judge-replay/crypto.ts';
import { POST as startJudgeReplay } from '../app/api/judge-replay/start/route.ts';
import { resetReplayStartStateForTests } from '../app/api/judge-replay/start/state.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import { SOMNIA_MAINNET_PROFILE } from '../app/judge-network.ts';
import { REPLAY_MARKET_QUESTION, type ReplayMarketProvenance } from '../app/replay-proof.ts';

const originalFetch = globalThis.fetch;
const KEY = '44'.repeat(32);

function id(number: number): string {
  return `0x${number.toString(16).padStart(64, '0')}`;
}

function provenance(issuedAt: number): ReplayMarketProvenance {
  const marketExpiry = issuedAt - 30;
  return {
    marketType: 'BINARY',
    asset: 'BTC',
    intervalSec: 300,
    question: REPLAY_MARKET_QUESTION,
    tradingStart: marketExpiry - 300,
    marketExpiry,
    marketStatus: 'Finalized',
    tradeCount: 2,
    lastTradeAt: marketExpiry - 1,
    operatorId: 5,
    venueId: id(90),
    marketContext: '0x',
    oracleQuestionId: '42',
    creator: `0x${'12'.repeat(20)}`,
    createdByTx: id(91),
  };
}

function claims(direction: 'UP' | 'DOWN', winningOutcome: 0 | 1, now = 2_000): ReplayClaims {
  return newReplayClaims({
    marketId: id(20),
    winningOutcome,
    direction,
    issuedAt: now,
    revealAfter: now + 15,
    expiresAt: now + 1_800,
    ...provenance(now),
  }, SOMNIA_MAINNET_PROFILE);
}

function candidate(marketId: string, winningOutcome: 0 | 1, now: number) {
  const proof = provenance(now);
  return {
    marketId,
    winningOutcome,
    marketType: proof.marketType,
    asset: proof.asset,
    intervalSec: String(proof.intervalSec),
    question: proof.question,
    tradingStart: String(proof.tradingStart),
    expiry: String(proof.marketExpiry),
    status: proof.marketStatus,
    tradeCount: String(proof.tradeCount),
    lastTradeAt: String(proof.lastTradeAt),
    operatorId: String(proof.operatorId),
    venueId: proof.venueId,
    context: proof.marketContext,
    oracleQuestionId: proof.oracleQuestionId,
    creator: proof.creator,
    createdByTx: proof.createdByTx,
  };
}

function post(url: string, body: unknown, ip: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.JUDGE_REPLAY_SEAL_KEY = KEY;
  process.env.VERCEL_ENV = 'preview';
  resetRequestControlForTests();
  resetReplayStartStateForTests();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('full-run start excludes previously revealed markets without leaking the new market', async () => {
  const now = Math.floor(Date.now() / 1_000);
  globalThis.fetch = async () => Response.json({ data: { fiveMinute: [
    candidate(id(1), 0, now),
    candidate(id(2), 1, now),
    candidate(id(3), 0, now),
    candidate(id(4), 1, now),
  ] } });

  const response = await startFullRunReplay(post('http://local.test/api/full-run/replay/start', {
    direction: 'UP',
    excludeMarketIds: [id(1), id(2)],
  }, '203.0.113.31'));
  assert.equal(response.status, 200);
  const body = await response.json() as { replay: { seal: string } };
  assert.doesNotMatch(JSON.stringify(body.replay), /marketId|winningOutcome/);
  const selected = openReplay(body.replay.seal, SOMNIA_MAINNET_PROFILE);
  assert.ok(selected.marketId === id(3) || selected.marketId === id(4));

  const judgeRejectsExtension = await startJudgeReplay(post('http://local.test/api/judge-replay/start', {
    direction: 'UP',
    excludeMarketIds: [id(1)],
  }, '203.0.113.32'));
  assert.equal(judgeRejectsExtension.status, 400, 'Judge v1 request schema remains unchanged');
  assert.deepEqual(await judgeRejectsExtension.json(), { error: 'Invalid Judge Replay request.' });

  const fullRunRejectsMalformed = await startFullRunReplay(post('http://local.test/api/full-run/replay/start', {
    direction: 'UP',
    unexpected: true,
  }, '203.0.113.33'));
  assert.equal(fullRunRejectsMalformed.status, 400);
  assert.deepEqual(await fullRunRejectsMalformed.json(), { error: 'Invalid full-run replay request.' });
});

test('full-run reveal exposes only verified settlement scope and maps BLESSED/CURSED', async () => {
  for (const [direction, winningOutcome, expected] of [
    ['UP', 0, 'BLESSED'],
    ['DOWN', 0, 'CURSED'],
  ] as const) {
    const sealedClaims = claims(direction, winningOutcome);
    const handler = createFullRunReplayRevealHandler({
      profile: SOMNIA_MAINNET_PROFILE,
      open: () => sealedClaims,
      now: () => sealedClaims.revealAfter,
      hydrate: async () => ({
        market: { marketId: sealedClaims.marketId, winningOutcome, voided: false },
        network: { name: 'Somnia mainnet', chainId: 5031 },
        onchainSettlement: { winningOutcome, voided: false, verified: true },
        safety: { mode: 'DRY_RUN', writesEnabled: false },
      } as never),
    });
    const response = await handler(post('http://local.test/api/full-run/replay/reveal', { seal: 'opaque' }, `203.0.113.${40 + winningOutcome}`));
    const body = await response.json() as { settlement: Record<string, unknown>; replayProof: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.settlement.outcome, expected);
    assert.equal(body.settlement.marketId, sealedClaims.marketId);
    assert.equal(body.settlement.proofVersion, 'market-dungeon/full-run-market/v1');
    assert.equal(body.replayProof.scope, 'historical-event-contract-settlement');
    assert.equal(Object.hasOwn(body, 'combatProof'), false);
  }
});

test('full-run reveal enforces hold, expiry, and strict one-field request', async () => {
  const sealedClaims = claims('UP', 0);
  const handler = createFullRunReplayRevealHandler({
    profile: SOMNIA_MAINNET_PROFILE,
    open: () => sealedClaims,
    now: () => sealedClaims.issuedAt,
    hydrate: async () => { throw new Error('must not hydrate while sealed'); },
  });
  const sealed = await handler(post('http://local.test/api/full-run/replay/reveal', { seal: 'opaque' }, '203.0.113.51'));
  assert.equal(sealed.status, 425);

  const malformed = await handler(post('http://local.test/api/full-run/replay/reveal', { seal: 'opaque', actions: [] }, '203.0.113.52'));
  assert.equal(malformed.status, 400);

  const expiredHandler = createFullRunReplayRevealHandler({
    profile: SOMNIA_MAINNET_PROFILE,
    open: () => sealedClaims,
    now: () => sealedClaims.expiresAt,
  });
  const expired = await expiredHandler(post('http://local.test/api/full-run/replay/reveal', { seal: 'opaque' }, '203.0.113.53'));
  assert.equal(expired.status, 410);
});
