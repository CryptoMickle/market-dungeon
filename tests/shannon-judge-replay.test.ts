import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';

import {
  newReplayClaims,
  openReplay,
  replayCommitment,
  replayLockAttestation,
  replayLockAttestationPublicKey,
  sealReplay,
} from '../app/api/judge-replay/crypto.ts';
import { POST as startMainnetReplay } from '../app/api/judge-replay/start/route.ts';
import { resetReplayStartStateForTests } from '../app/api/judge-replay/start/state.ts';
import { GET as shannonPublicKey } from '../app/api/shannon/judge-replay/public-key/route.ts';
import { POST as revealShannonReplay } from '../app/api/shannon/judge-replay/reveal/route.ts';
import { resetShannonReplayRevealStateForTests } from '../app/api/shannon/judge-replay/reveal/state.ts';
import { POST as startShannonReplay } from '../app/api/shannon/judge-replay/start/route.ts';
import { resetShannonReplayStartStateForTests } from '../app/api/shannon/judge-replay/start/state.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import {
  allowsLiveDreamDexContinuation,
  SHANNON_TESTNET_PROFILE,
  SOMNIA_MAINNET_PROFILE,
} from '../app/judge-network.ts';
import { replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI } from '../app/onchain-settlement-proof.ts';
import {
  REPLAY_MARKET_QUESTION,
  canonicalReplayProof,
  isReplayLockAttestation,
  isReplayLockPublicKey,
  replayLockAttestationMatchesProof,
  verifyReplayLockAttestation,
  type ReplayMarketProvenance,
} from '../app/replay-proof.ts';

const KEY = '44'.repeat(32);
const MARKET_UP = `0x${'ab'.repeat(32)}`;
const MARKET_DOWN = `0x${'cd'.repeat(32)}`;
const CREATOR = `0x${'ef'.repeat(20)}`;
const CREATED_BY_TX = `0x${'12'.repeat(32)}`;
const MARKET_ADDRESS = `0x${'34'.repeat(20)}` as `0x${string}`;
const POOL_ADDRESS = `0x${'56'.repeat(20)}` as `0x${string}`;
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
    operatorId: SHANNON_TESTNET_PROFILE.originOperatorId,
    venueId: SHANNON_TESTNET_PROFILE.originVenueId,
    marketContext: '0x',
    oracleQuestionId: '51115',
    creator: CREATOR,
    createdByTx: CREATED_BY_TX,
  };
}

function shannonClaims() {
  return newReplayClaims({
    marketId: MARKET_UP,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: 1_000,
    revealAfter: 1_015,
    expiresAt: 2_800,
    ...provenance(1_000),
  }, SHANNON_TESTNET_PROFILE);
}

function candidate(marketId: string, winningOutcome: 0 | 1, intervalSec: 300 | 900) {
  const now = Math.floor(Date.now() / 1000);
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

function post(path: string, direction: 'UP' | 'DOWN', ip: string) {
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ direction }),
  });
}

test.beforeEach(() => {
  process.env.JUDGE_REPLAY_SEAL_KEY = KEY;
  process.env.VERCEL_ENV = 'preview';
  resetRequestControlForTests();
  resetReplayStartStateForTests();
  resetShannonReplayStartStateForTests();
  resetShannonReplayRevealStateForTests();
});

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('fixed profiles keep contracts and origin constant while separating chain endpoints and collateral', () => {
  assert.equal(SOMNIA_MAINNET_PROFILE.chainId, 5031);
  assert.equal(SHANNON_TESTNET_PROFILE.chainId, 50312);
  assert.notEqual(SOMNIA_MAINNET_PROFILE.rpc, SHANNON_TESTNET_PROFILE.rpc);
  assert.notEqual(SOMNIA_MAINNET_PROFILE.indexer, SHANNON_TESTNET_PROFILE.indexer);
  assert.notEqual(SOMNIA_MAINNET_PROFILE.collateral, SHANNON_TESTNET_PROFILE.collateral);
  assert.deepEqual(SOMNIA_MAINNET_PROFILE.contracts, SHANNON_TESTNET_PROFILE.contracts);
  assert.equal(SOMNIA_MAINNET_PROFILE.originOperatorId, SHANNON_TESTNET_PROFILE.originOperatorId);
  assert.equal(SOMNIA_MAINNET_PROFILE.originVenueId, SHANNON_TESTNET_PROFILE.originVenueId);
  assert.equal(allowsLiveDreamDexContinuation(SOMNIA_MAINNET_PROFILE), true);
  assert.equal(allowsLiveDreamDexContinuation(SHANNON_TESTNET_PROFILE), false);
});

test('Shannon v3 commitment, seal AAD, and v2 attestation bind profile and chain', async () => {
  const claims = shannonClaims();
  assert.equal(claims.version, 3);
  assert.equal(claims.profileId, SHANNON_TESTNET_PROFILE.id);
  assert.equal(claims.chainId, SHANNON_TESTNET_PROFILE.chainId);
  assert.match(canonicalReplayProof({
    ...claims,
    committedOutcome: claims.winningOutcome,
    lockedDirection: claims.direction,
  }), /^market-dungeon\/judge-replay\/v3\nprofileId=shannon-testnet\nchainId=50312\n/);

  const seal = sealReplay(claims);
  assert.match(seal, /^v3\./);
  assert.deepEqual(openReplay(seal, SHANNON_TESTNET_PROFILE), claims);
  assert.throws(() => openReplay(seal, SOMNIA_MAINNET_PROFILE), /replay seal|authenticate/i);

  const attestation = replayLockAttestation(claims);
  const key = replayLockAttestationPublicKey(SHANNON_TESTNET_PROFILE);
  assert.equal(attestation.schema, 'market-dungeon/judge-lock-attestation/v2');
  assert.equal(key.schema, 'market-dungeon/judge-lock-attestation-key/v2');
  assert.equal(await verifyReplayLockAttestation(attestation, key), true);
  assert.equal(replayLockAttestationMatchesProof(attestation, {
    commitment: replayCommitment(claims),
    lockedDirection: claims.direction,
    issuedAt: claims.issuedAt,
    revealAfter: claims.revealAfter,
    expiresAt: claims.expiresAt,
    profileId: claims.profileId,
    chainId: claims.chainId,
  }), true);
  assert.equal(await verifyReplayLockAttestation(
    { ...attestation, chainId: SOMNIA_MAINNET_PROFILE.chainId } as unknown as typeof attestation,
    key,
  ), false);
  assert.equal(await verifyReplayLockAttestation(attestation, replayLockAttestationPublicKey()), false);
});

test('mainnet legacy commitment and seal remain v2 and reject Shannon verification', () => {
  const claims = newReplayClaims({
    marketId: MARKET_DOWN,
    winningOutcome: 1,
    direction: 'DOWN',
    issuedAt: 1_000,
    revealAfter: 1_015,
    expiresAt: 2_800,
    ...provenance(1_000),
  });
  const canonical = canonicalReplayProof({
    ...claims,
    committedOutcome: claims.winningOutcome,
    lockedDirection: claims.direction,
  });
  assert.equal(claims.version, 2);
  assert.equal('profileId' in claims, false);
  assert.match(canonical, /^market-dungeon\/judge-replay\/v2\nmarketId=/);
  const seal = sealReplay(claims);
  assert.match(seal, /^v2\./);
  assert.deepEqual(openReplay(seal), claims);
  assert.throws(() => openReplay(seal, SHANNON_TESTNET_PROFILE), /replay seal|authenticate/i);
});

test('Shannon public-key route is fixed to the v2 profile-bound key', async () => {
  const response = await shannonPublicKey();
  const key = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(isReplayLockPublicKey(key), true);
  assert.equal(key.profileId, SHANNON_TESTNET_PROFILE.id);
  assert.equal(key.chainId, SHANNON_TESTNET_PROFILE.chainId);
});

test('mainnet and Shannon start routes use isolated caches and fixed indexers', async () => {
  const urls: string[] = [];
  const queries: string[] = [];
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string };
    queries.push(body.query ?? '');
    return Response.json({
      data: {
        fiveMinute: [candidate(MARKET_UP, 0, 300), candidate(MARKET_DOWN, 1, 300)],
        fifteenMinute: [candidate(`0x${'34'.repeat(32)}`, 0, 900), candidate(`0x${'56'.repeat(32)}`, 1, 900)],
      },
    });
  };

  const mainnet = await startMainnetReplay(post('/api/judge-replay/start', 'UP', '203.0.113.30'));
  const shannon = await startShannonReplay(post('/api/shannon/judge-replay/start', 'DOWN', '203.0.113.31'));
  assert.equal(mainnet.status, 200);
  assert.equal(shannon.status, 200);
  assert.deepEqual(urls, [SOMNIA_MAINNET_PROFILE.indexer, SHANNON_TESTNET_PROFILE.indexer]);
  assert.match(queries[0]!, /operatorId: \{_is_null: false\}, venueId: \{_is_null: false\}/);
  assert.doesNotMatch(queries[0]!, /collateral: \{_eq:/);
  assert.match(queries[1]!, /operatorId: \{_eq: 2\}/);
  assert.match(queries[1]!, new RegExp(`collateral: \\{_eq: "${SHANNON_TESTNET_PROFILE.collateral}"\\}`));

  const mainnetPayload = await mainnet.json();
  const shannonPayload = await shannon.json();
  assert.match(mainnetPayload.replay.seal, /^v2\./);
  assert.match(shannonPayload.replay.seal, /^v3\./);
  assert.deepEqual(mainnetPayload.replay.publicMarket, {
    asset: 'BTC', intervalSec: 300, network: SOMNIA_MAINNET_PROFILE.name, chainId: SOMNIA_MAINNET_PROFILE.chainId,
  });
  assert.deepEqual(shannonPayload.replay.publicMarket, {
    asset: 'BTC', intervalSec: 300, network: SHANNON_TESTNET_PROFILE.name,
    chainId: SHANNON_TESTNET_PROFILE.chainId, profileId: SHANNON_TESTNET_PROFILE.id,
  });
  assert.equal(isReplayLockAttestation(shannonPayload.replay.lockAttestation), true);
});

test('Shannon reveal remains on its fixed profile through market hydration and hash-pinned RPC proof', async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = newReplayClaims({
    marketId: MARKET_UP,
    winningOutcome: 0,
    direction: 'UP',
    issuedAt: now - 30,
    revealAfter: now - 15,
    expiresAt: now + 1_800,
    ...provenance(now - 30),
  }, SHANNON_TESTNET_PROFILE);
  const actions: JudgeCombatAction[] = [{ room: 8, action: 'attack' }];
  let combat = replayJudgeCombat(claims.gameSeed, actions);
  while (!combat.bossDefeated) {
    actions.push({ room: 9, action: 'attack' });
    combat = replayJudgeCombat(claims.gameSeed, actions);
  }
  assert.equal(combat.verified, true);

  const nonce = 46n;
  const yesId = (BigInt(POOL_ADDRESS) << 72n) | (nonce << 8n);
  const noId = yesId + 1n;
  const blockHash = `0x${'78'.repeat(32)}`;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      jsonrpc?: string;
      method?: string;
      params?: Array<{ to?: string } | string | boolean>;
    };
    if (!body.jsonrpc) {
      return Response.json({ data: { Market_by_pk: {
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
        marketAddress: MARKET_ADDRESS,
        poolAddress: POOL_ADDRESS,
        collateral: SHANNON_TESTNET_PROFILE.collateral,
        strike: '10000',
        quoteDecimals: 2,
        yesTokenId: yesId.toString(),
        noTokenId: noId.toString(),
        payoutNumerators: ['10000000', '0'],
        payoutDenominator: '10000000',
        resolvedAtTimestamp: String(now - 10),
        lastPrice: '100',
      } } });
    }
    if (body.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: `0x${SHANNON_TESTNET_PROFILE.chainId.toString(16)}` });
    if (body.method === 'eth_blockNumber') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x10' });
    if (body.method === 'eth_getBlockByNumber') return Response.json({ jsonrpc: '2.0', id: 1, result: { number: '0x10', hash: blockHash } });
    const call = body.params?.[0] as { to?: string } | undefined;
    if (call?.to?.toLowerCase() === SHANNON_TESTNET_PROFILE.contracts.binaryModule.toLowerCase()) {
      return Response.json({ jsonrpc: '2.0', id: 1, result: encodeFunctionResult({
        abi: MODULE_MARKETS_ABI,
        functionName: 'markets',
        result: [
          BigInt(claims.oracleQuestionId), 2, 0, SHANNON_TESTNET_PROFILE.collateral,
          claims.operatorId, claims.venueId as `0x${string}`, `0x${'ab'.repeat(20)}` as `0x${string}`,
          claims.creator as `0x${string}`, MARKET_ADDRESS, POOL_ADDRESS, yesId, noId,
          BigInt(claims.tradingStart), BigInt(claims.marketExpiry),
        ],
      }) });
    }
    if (call?.to?.toLowerCase() === SHANNON_TESTNET_PROFILE.contracts.binarySettlement.toLowerCase()) {
      return Response.json({ jsonrpc: '2.0', id: 1, result: encodeFunctionResult({
        abi: BINARY_SETTLEMENT_ABI,
        functionName: 'getSettlement',
        result: [SHANNON_TESTNET_PROFILE.collateral, 1_000n, true, false, 0n, `0x${'ab'.repeat(20)}`, POOL_ADDRESS, nonce, [10_000_000n, 0n]] as never,
      }) });
    }
    const word = (value: number) => value.toString(16).padStart(64, '0');
    return Response.json({ jsonrpc: '2.0', id: 1, result: `0x${word(1)}${word(2)}${word(3)}` });
  };

  const response = await revealShannonReplay(new Request('http://local.test/api/shannon/judge-replay/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.55' },
    body: JSON.stringify({ seal: sealReplay(claims), actions }),
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.network.chainId, SHANNON_TESTNET_PROFILE.chainId);
  assert.equal(payload.network.profileId, SHANNON_TESTNET_PROFILE.id);
  assert.equal(payload.replayProof.profileId, SHANNON_TESTNET_PROFILE.id);
  assert.equal(payload.replayProof.chainId, SHANNON_TESTNET_PROFILE.chainId);
  assert.equal(payload.onchainSettlement.chainId, SHANNON_TESTNET_PROFILE.chainId);
  assert.equal(payload.onchainSettlement.collateralToken, SHANNON_TESTNET_PROFILE.collateral);
  assert.equal(urls.filter((url) => url === SHANNON_TESTNET_PROFILE.indexer).length, 1);
  assert.ok(urls.filter((url) => url === SHANNON_TESTNET_PROFILE.rpc).length >= 5);
  assert.equal(urls.includes(SOMNIA_MAINNET_PROFILE.indexer), false);
  assert.equal(urls.includes(SOMNIA_MAINNET_PROFILE.rpc), false);
});
