import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';

import { replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';
import { DREAMDEX_MAINNET_CONTRACTS } from '../app/api/dreamdex.ts';
import { newReplayClaims, replayLockAttestation, sealReplay } from '../app/api/judge-replay/crypto.ts';
import { GET as lockPublicKey } from '../app/api/judge-replay/public-key/route.ts';
import { POST as revealReplay } from '../app/api/judge-replay/reveal/route.ts';
import { resetReplayRevealStateForTests } from '../app/api/judge-replay/reveal/state.ts';
import { POST as startReplay } from '../app/api/judge-replay/start/route.ts';
import { resetReplayStartStateForTests } from '../app/api/judge-replay/start/state.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI } from '../app/onchain-settlement-proof.ts';
import {
  isReplayLockAttestation,
  isReplayLockPublicKey,
  REPLAY_MARKET_QUESTION,
  verifyReplayLockAttestation,
  type ReplayMarketProvenance,
} from '../app/replay-proof.ts';

const KEY = '33'.repeat(32);
const MARKET_ID = `0x${'cd'.repeat(32)}`;
const MARKET_ADDRESS = `0x${'34'.repeat(20)}` as `0x${string}`;
const POOL_ADDRESS = `0x${'12'.repeat(20)}` as `0x${string}`;
const COLLATERAL = `0x${'56'.repeat(20)}` as `0x${string}`;
const VENUE_ID = `0x${'45'.repeat(32)}`;
const CREATOR = `0x${'67'.repeat(20)}`;
const CREATED_BY_TX = `0x${'89'.repeat(32)}`;
const NO_STORE = 'private, no-store, max-age=0';
const originalFetch = globalThis.fetch;

function provenance(issuedAt: number, intervalSec: 300 | 900 = 300): ReplayMarketProvenance {
  const marketExpiry = issuedAt - 30;
  return {
    marketType: 'BINARY',
    asset: 'BTC',
    intervalSec,
    question: REPLAY_MARKET_QUESTION,
    tradingStart: marketExpiry - intervalSec,
    marketExpiry,
    marketStatus: 'Finalized',
    tradeCount: 2,
    lastTradeAt: marketExpiry - 1,
    operatorId: 5,
    venueId: VENUE_ID,
    marketContext: '0x',
    oracleQuestionId: '51115',
    creator: CREATOR,
    createdByTx: CREATED_BY_TX,
  };
}

function candidate(marketId: string, winningOutcome: 0 | 1, intervalSec: 300 | 900, now = Math.floor(Date.now() / 1000)) {
  const proof = provenance(now, intervalSec);
  return {
    marketId,
    winningOutcome,
    marketType: proof.marketType,
    asset: proof.asset,
    intervalSec: proof.intervalSec,
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

function rawMarketForClaims(claims: ReturnType<typeof newReplayClaims>, overrides: Record<string, unknown> = {}) {
  return {
    marketId: claims.marketId,
    marketType: claims.marketType,
    asset: claims.asset,
    intervalSec: claims.intervalSec,
    question: claims.question,
    tradingStart: String(claims.tradingStart),
    expiry: String(claims.marketExpiry),
    status: claims.marketStatus,
    tradeCount: String(claims.tradeCount),
    lastTradeAt: String(claims.lastTradeAt),
    operatorId: String(claims.operatorId),
    venueId: claims.venueId,
    context: claims.marketContext,
    oracleQuestionId: claims.oracleQuestionId,
    creator: claims.creator,
    createdByTx: claims.createdByTx,
    winningOutcome: claims.winningOutcome,
    voided: false,
    finalized: true,
    ...overrides,
  };
}

function configure() {
  process.env.JUDGE_REPLAY_SEAL_KEY = KEY;
  process.env.VERCEL_ENV = 'preview';
  resetRequestControlForTests();
  resetReplayStartStateForTests();
  resetReplayRevealStateForTests();
}

function post(url: string, body: unknown, ip = '203.0.113.10') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
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
  let requestBody: { query?: string; variables?: Record<string, string> } = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as typeof requestBody;
    return Response.json({
      data: {
        fiveMinute: [
          candidate(MARKET_ID, 0, 300),
          candidate(`0x${'ef'.repeat(32)}`, 1, 300),
        ],
        fifteenMinute: [],
      },
    });
  };

  const response = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP' }));
  const payload = await response.json() as { replay: Record<string, unknown> };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(Object.keys(payload.replay).sort(), [
    'commitment', 'expiresAt', 'gameSeed', 'issuedAt', 'lockAttestation', 'lockedDirection',
    'publicMarket', 'revealAfter', 'seal',
  ]);
  assert.deepEqual(payload.replay.publicMarket, { asset: 'BTC', intervalSec: 300, network: 'Somnia mainnet', chainId: 5031 });
  assert.doesNotMatch(JSON.stringify(payload.replay), /marketId|marketAddress|poolAddress|strikeUsd|winningOutcome|expiryIso|resolvedAt/i);
  const publicKeyResponse = await lockPublicKey();
  const publicKey = await publicKeyResponse.json();
  assert.equal(publicKeyResponse.status, 200);
  assert.equal(publicKeyResponse.headers.get('cache-control'), NO_STORE);
  assert.equal(isReplayLockAttestation(payload.replay.lockAttestation), true);
  assert.equal(isReplayLockPublicKey(publicKey), true);
  if (isReplayLockAttestation(payload.replay.lockAttestation) && isReplayLockPublicKey(publicKey)) {
    assert.equal(await verifyReplayLockAttestation(payload.replay.lockAttestation, publicKey), true);
  }
  assert.equal(requestBody.query?.match(/tradeCount: \{_gt: 0\}/g)?.length, 2);
  assert.equal(requestBody.query?.match(/expiry: \{_gte: \$minExpiry, _lte: \$now\}/g)?.length, 2);
  assert.equal(requestBody.query?.match(/clobStatus: \{_eq: "Finalized"\}/g)?.length, 2);
  assert.ok(Number(requestBody.variables?.now) - Number(requestBody.variables?.minExpiry) === 7 * 24 * 60 * 60);
});

test('start route rejects extra fields and fails closed for empty or one-sided replay pools', async () => {
  const invalid = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP', debug: true }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), NO_STORE);

  globalThis.fetch = async () => Response.json({ data: { fiveMinute: [], fifteenMinute: [] } });
  const unavailable = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP' }));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await unavailable.json(), {
    error: 'Sealed Judge Replay is unavailable. Please try again.',
    retryState: 'upstream_retry',
    retryAfter: 3,
  });

  globalThis.fetch = async () => Response.json({
    data: { fiveMinute: [candidate(MARKET_ID, 0, 300)], fifteenMinute: [] },
  });
  const predictable = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'DOWN' }));
  assert.equal(predictable.status, 503);
  assert.equal(predictable.headers.get('cache-control'), NO_STORE);
});

test('start route falls back to a balanced fifteen-minute replay pool', async () => {
  globalThis.fetch = async () => Response.json({
    data: {
      fiveMinute: [candidate(MARKET_ID, 0, 300)],
      fifteenMinute: [
        candidate(`0x${'ab'.repeat(32)}`, 0, 900),
        candidate(`0x${'bc'.repeat(32)}`, 1, 900),
      ],
    },
  });

  const response = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'DOWN' }));
  const payload = await response.json() as { replay: { publicMarket: Record<string, unknown> } };
  assert.equal(response.status, 200);
  assert.equal(payload.replay.publicMarket.intervalSec, 900);
});

test('start route shares its candidate read and rate-limits repeated client requests', async () => {
  let upstreamReads = 0;
  globalThis.fetch = async () => {
    upstreamReads += 1;
    return Response.json({
      data: {
        fiveMinute: [
          candidate(MARKET_ID, 0, 300),
          candidate(`0x${'ef'.repeat(32)}`, 1, 300),
        ],
        fifteenMinute: [],
      },
    });
  };

  const firstWave = await Promise.all(Array.from({ length: 6 }, (_, index) => startReplay(post(
    'http://local.test/api/judge-replay/start',
    { direction: index % 2 ? 'DOWN' : 'UP' },
  ))));
  assert.deepEqual(firstWave.map((response) => response.status), [200, 200, 200, 200, 200, 200]);
  assert.equal(upstreamReads, 1);
  assert.ok(firstWave.some((response) => response.headers.get('x-replay-candidate-cache') === 'miss'));
  assert.ok(firstWave.some((response) => ['shared', 'hit'].includes(response.headers.get('x-replay-candidate-cache') ?? '')));

  const blocked = await startReplay(post('http://local.test/api/judge-replay/start', { direction: 'UP' }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(upstreamReads, 1);
  assert.equal((await blocked.json() as { retryState: string }).retryState, 'rate_limited');
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
    ...provenance(now),
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
    ...provenance(now - 2_000),
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
    ...provenance(now - 30),
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

test('reveal route measures its 8 KiB limit in UTF-8 bytes, not JavaScript characters', async () => {
  const exactLimit = JSON.stringify({ seal: 'invalid', actions: [] }).padEnd(8_192, ' ');
  assert.equal(Buffer.byteLength(exactLimit, 'utf8'), 8_192);
  const acceptedAtLimit = await revealReplay(new Request('http://local.test/api/judge-replay/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.19' },
    body: exactLimit,
  }));
  assert.equal(acceptedAtLimit.status, 400);
  assert.deepEqual(await acceptedAtLimit.json(), {
    error: 'Invalid or expired replay seal. Start a new Judge Replay.',
  });

  const raw = JSON.stringify({
    seal: '🧙'.repeat(2_047),
    actions: [{ room: 8, action: 'attack' }],
  });
  assert.ok(raw.length < 8_192);
  assert.ok(Buffer.byteLength(raw, 'utf8') > 8_192);

  const response = await revealReplay(new Request('http://local.test/api/judge-replay/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.20' },
    body: raw,
  }));
  assert.equal(response.status, 413);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.deepEqual(await response.json(), { error: 'Judge Replay request body exceeds the 8 KiB limit.' });
});

test('reveal route rejects a declared oversize body before reading its stream', async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode('{}'));
      controller.close();
    },
  }, { highWaterMark: 0 });
  const request = new Request('http://local.test/api/judge-replay/reveal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '8193',
      'x-forwarded-for': '203.0.113.21',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  const response = await revealReplay(request);
  assert.equal(response.status, 413);
  assert.equal(pulls, 0);
});

test('reveal route cancels an unbounded stream as soon as it crosses 8 KiB', async () => {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(pulls === 1 ? 4_096 : 4_097));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const request = new Request('http://local.test/api/judge-replay/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.22' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  const response = await revealReplay(request);
  assert.equal(response.status, 413);
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);
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
    ...provenance(now - 30),
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

test('reveal route revalidates all sealed market provenance before RPC settlement reads', async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
    ...provenance(now - 30),
  });
  const actions = completedCombat(claims.gameSeed);
  const mismatches: Record<string, unknown>[] = [
    { asset: 'ETH' },
    { intervalSec: 900 },
    { expiry: String(claims.marketExpiry - 1) },
    { status: 'Trading' },
    { tradeCount: '0' },
    { lastTradeAt: String(claims.lastTradeAt - 1) },
    { question: `${claims.question}?` },
    { venueId: `0x${'fe'.repeat(32)}` },
  ];
  let reads = 0;
  let activeMismatch: Record<string, unknown> = {};
  globalThis.fetch = async () => {
    reads += 1;
    return Response.json({ data: { Market_by_pk: rawMarketForClaims(claims, activeMismatch) } });
  };

  for (const [index, mismatch] of mismatches.entries()) {
    activeMismatch = mismatch;
    resetReplayRevealStateForTests();
    const before = reads;
    const response = await revealReplay(post(
      'http://local.test/api/judge-replay/reveal',
      { seal: sealReplay(claims), actions },
      `203.0.113.${100 + index}`,
    ));
    assert.equal(response.status, 409);
    assert.equal(reads, before + 1, `mismatch ${JSON.stringify(mismatch)} reached an RPC read`);
  }
});

test('reveal route rate-limits a client before any settlement read can amplify', async () => {
  let upstreamReads = 0;
  globalThis.fetch = async () => {
    upstreamReads += 1;
    throw new Error('No upstream read expected');
  };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const invalid = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: 'invalid', actions: [] }));
    assert.equal(invalid.status, 400);
  }
  const blocked = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal: 'invalid', actions: [] }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(upstreamReads, 0);
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
    ...provenance(now - 30),
  });
  const actions = completedCombat(claims.gameSeed);
  const yesId = (BigInt(POOL_ADDRESS) << 72n) | (46n << 8n);
  const noId = yesId + 1n;
  let upstreamReads = 0;
  let hashPinnedSettlementCalls = 0;
  const proofBlockHash = `0x${'78'.repeat(32)}`;

  globalThis.fetch = async (_input, init) => {
    upstreamReads += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      jsonrpc?: string;
      method?: string;
      params?: Array<{ to?: string; data?: string } | string | boolean>;
      query?: string;
    };
    if (body.jsonrpc) {
      if (body.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x13a7' });
      if (body.method === 'eth_blockNumber') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x10' });
      if (body.method === 'eth_getBlockByNumber') return Response.json({
        jsonrpc: '2.0', id: 1, result: { number: '0x10', hash: proofBlockHash },
      });
      const call = body.params?.[0] as { to?: string; data?: string } | undefined;
      if (call?.to?.toLowerCase() === DREAMDEX_MAINNET_CONTRACTS.binaryModule.toLowerCase()) {
        assert.deepEqual(body.params?.[1], { blockHash: proofBlockHash, requireCanonical: true });
        hashPinnedSettlementCalls += 1;
        return Response.json({ jsonrpc: '2.0', id: 1, result: encodeFunctionResult({
          abi: MODULE_MARKETS_ABI,
          functionName: 'markets',
          result: [
            BigInt(claims.oracleQuestionId), 2, 0, COLLATERAL, claims.operatorId, claims.venueId as `0x${string}`,
            `0x${'ab'.repeat(20)}` as `0x${string}`, claims.creator as `0x${string}`,
            MARKET_ADDRESS, POOL_ADDRESS, yesId, noId, BigInt(claims.tradingStart), BigInt(claims.marketExpiry),
          ],
        }) });
      }
      if (call?.to?.toLowerCase() === DREAMDEX_MAINNET_CONTRACTS.binarySettlement.toLowerCase()) {
        assert.deepEqual(body.params?.[1], { blockHash: proofBlockHash, requireCanonical: true });
        hashPinnedSettlementCalls += 1;
        return Response.json({ jsonrpc: '2.0', id: 1, result: encodeFunctionResult({
          abi: BINARY_SETTLEMENT_ABI,
          functionName: 'getSettlement',
          // viem's type models the named tuple as an object, while its runtime
          // result encoder expects the single unnamed output as the tuple value.
          result: [
            COLLATERAL,
            1000n,
            true,
            false,
            0n,
            `0x${'ab'.repeat(20)}`,
            POOL_ADDRESS,
            46n,
            [10_000_000n, 0n],
          ] as never,
        }) });
      }
      const word = (value: number) => value.toString(16).padStart(64, '0');
      return Response.json({ jsonrpc: '2.0', id: 1, result: `0x${word(1)}${word(2)}${word(3)}` });
    }
    return Response.json({ data: { Market_by_pk: rawMarketForClaims(claims, {
      marketAddress: MARKET_ADDRESS,
      poolAddress: POOL_ADDRESS,
      collateral: COLLATERAL,
      strike: '10000',
      quoteDecimals: 2,
      yesTokenId: yesId.toString(),
      noTokenId: noId.toString(),
      payoutNumerators: ['10000000', '0'],
      payoutDenominator: '10000000',
      resolvedAtTimestamp: String(now - 200),
      lastPrice: '100',
    }) } });
  };

  const seal = sealReplay(claims);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => revealReplay(post(
    'http://local.test/api/judge-replay/reveal',
    { seal, actions },
    `203.0.113.${index + 20}`,
  ))));
  assert.deepEqual(responses.map((response) => response.status), Array(8).fill(200));
  assert.equal(hashPinnedSettlementCalls, 2);
  assert.equal(responses.filter((response) => response.headers.get('x-replay-dedupe') === 'miss').length, 1);
  assert.ok(responses.some((response) => response.headers.get('x-replay-dedupe') === 'shared'));
  const readsAfterFirstWave = upstreamReads;

  const response = await revealReplay(post('http://local.test/api/judge-replay/reveal', { seal, actions }));
  assert.equal(response.headers.get('x-replay-dedupe'), 'hit');
  assert.equal(upstreamReads, readsAfterFirstWave);

  const differentActions = [actions[0], { room: 8, action: 'potion' } as const, ...actions.slice(1)];
  assert.equal(replayJudgeCombat(claims.gameSeed, differentActions).verified, true);
  const conflict = await revealReplay(post(
    'http://local.test/api/judge-replay/reveal',
    { seal, actions: differentActions },
    '203.0.113.99',
  ));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get('x-replay-dedupe'), 'conflict');
  assert.equal(upstreamReads, readsAfterFirstWave);

  const payload = await response.json() as {
    market: { marketId: string };
    lockAttestation: unknown;
    replayProof: { verified: boolean; commitment: string };
    combatProof: { verified: boolean; steps: number; guardDefeated: boolean; bossDefeated: boolean; transcriptDigest: string };
    onchainSettlement: {
      verified: boolean; blockNumber: string; blockHash: string; winningOutcome: number | null;
      payoutNumerators: string[]; settlementAddress: string; poolAddress: string;
      oracleQuestionId: string; originOperatorId: string; originVenueId: string; creator: string;
    };
    network: { chainId: number };
  };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), NO_STORE);
  assert.equal(payload.market.marketId, MARKET_ID);
  assert.equal(payload.network.chainId, 5031);
  assert.equal(payload.replayProof.verified, true);
  assert.match(payload.replayProof.commitment, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(payload.lockAttestation, replayLockAttestation(claims));
  assert.deepEqual({
    verified: payload.combatProof.verified,
    steps: payload.combatProof.steps,
    guardDefeated: payload.combatProof.guardDefeated,
    bossDefeated: payload.combatProof.bossDefeated,
  }, { verified: true, steps: actions.length, guardDefeated: true, bossDefeated: true });
  assert.match(payload.combatProof.transcriptDigest, /^0x[0-9a-f]{64}$/);
  assert.deepEqual({
    verified: payload.onchainSettlement.verified,
    blockNumber: payload.onchainSettlement.blockNumber,
    winningOutcome: payload.onchainSettlement.winningOutcome,
    payoutNumerators: payload.onchainSettlement.payoutNumerators,
    settlementAddress: payload.onchainSettlement.settlementAddress,
    poolAddress: payload.onchainSettlement.poolAddress,
    oracleQuestionId: payload.onchainSettlement.oracleQuestionId,
    originOperatorId: payload.onchainSettlement.originOperatorId,
    originVenueId: payload.onchainSettlement.originVenueId,
    creator: payload.onchainSettlement.creator,
  }, {
    verified: true,
    blockNumber: '16',
    winningOutcome: 0,
    payoutNumerators: ['10000000', '0'],
    settlementAddress: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
    poolAddress: POOL_ADDRESS,
    oracleQuestionId: claims.oracleQuestionId,
    originOperatorId: String(claims.operatorId),
    originVenueId: claims.venueId,
    creator: claims.creator,
  });
  assert.match(payload.onchainSettlement.blockHash, /^0x[0-9a-f]{64}$/);
});
