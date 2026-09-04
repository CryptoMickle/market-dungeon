import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  REPLAY_MARKET_QUESTION,
  canonicalReplayProof,
  secondsUntilReplayReveal,
  verifyReplayLockAttestation,
  type ReplayLockAttestation,
  type ReplayMarketProvenance,
} from '../app/replay-proof.ts';
import {
  canonicalReplay,
  newReplayClaims,
  openReplay,
  replayCommitment,
  replayLockAttestation,
  replayLockAttestationPublicKey,
  replayTimeStatus,
  sealReplay,
  type ReplayClaims,
} from '../app/api/judge-replay/crypto.ts';

const KEY_A = '11'.repeat(32);
const KEY_B = '22'.repeat(32);
const MARKET_ID = `0x${'ab'.repeat(32)}`;
const VENUE_ID = `0x${'bc'.repeat(32)}`;
const CREATOR = `0x${'cd'.repeat(20)}`;
const CREATED_BY_TX = `0x${'de'.repeat(32)}`;

function provenance(issuedAt: number): ReplayMarketProvenance {
  const marketExpiry = issuedAt - 10;
  return {
    marketType: 'BINARY' as const,
    asset: 'BTC' as const,
    intervalSec: 300 as const,
    question: REPLAY_MARKET_QUESTION,
    tradingStart: marketExpiry - 300,
    marketExpiry,
    marketStatus: 'Finalized' as const,
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

function configure(key = KEY_A, environment = 'preview') {
  process.env.JUDGE_REPLAY_SEAL_KEY = key;
  process.env.VERCEL_ENV = environment;
}

function claims() {
  return newReplayClaims({
    marketId: MARKET_ID,
    winningOutcome: 1,
    direction: 'DOWN',
    issuedAt: 1_000,
    revealAfter: 1_015,
    expiresAt: 2_800,
    ...provenance(1_000),
  });
}

test.beforeEach(() => configure());

test('AES-256-GCM seal round-trips and binds the environment and key', () => {
  const original = claims();
  const seal = sealReplay(original);
  assert.deepEqual(openReplay(seal), original);

  configure(KEY_A, 'production');
  assert.throws(() => openReplay(seal), /authenticate|replay seal/i);

  configure(KEY_B, 'preview');
  assert.throws(() => openReplay(seal), /authenticate|replay seal/i);
});

test('tampered and non-canonical seals fail closed', () => {
  const seal = sealReplay(claims());
  const parts = seal.split('.');
  for (const index of [1, 2, 3]) {
    const tampered = [...parts];
    tampered[index] = `${tampered[index][0] === 'A' ? 'B' : 'A'}${tampered[index].slice(1)}`;
    assert.throws(() => openReplay(tampered.join('.')));
  }
  assert.throws(() => openReplay(`${seal}A`));
  assert.throws(() => openReplay(seal.slice(0, -1)));
});

test('invalid claims and invalid key encodings are rejected', () => {
  const invalid = { ...claims(), marketId: '0x1234' } as ReplayClaims;
  assert.throws(() => openReplay(sealReplay(invalid)), /Invalid replay seal/);

  const invalidTimes = { ...claims(), revealAfter: 2_801 } as ReplayClaims;
  assert.throws(() => openReplay(sealReplay(invalidTimes)), /Invalid replay seal/);

  const invalidProvenance = { ...claims(), tradeCount: 0 } as ReplayClaims;
  assert.throws(() => openReplay(sealReplay(invalidProvenance)), /Invalid replay seal/);

  configure('not-a-64-character-hex-key');
  assert.throws(() => sealReplay(claims()), /not configured/);
});

test('each replay has independent salt, seed, IV, seal, and commitment', () => {
  const first = claims();
  const second = claims();
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.gameSeed, second.gameSeed);
  assert.notEqual(replayCommitment(first), replayCommitment(second));
  assert.notEqual(sealReplay(first), sealReplay(first));
});

test('server and browser commitment inputs are identical', async () => {
  const replay = claims();
  const browserCanonical = canonicalReplayProof({
    ...replay,
    marketId: replay.marketId,
    committedOutcome: replay.winningOutcome,
    lockedDirection: replay.direction,
  });
  assert.equal(canonicalReplay(replay), browserCanonical);

  const browserDigest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(browserCanonical));
  const browserHex = `0x${Buffer.from(browserDigest).toString('hex')}`;
  const nodeHex = `0x${createHash('sha256').update(browserCanonical, 'utf8').digest('hex')}`;
  assert.equal(replayCommitment(replay), browserHex);
  assert.equal(browserHex, nodeHex);
});

test('Ed25519 lock receipt is deterministic, public, and binds the accepted choice window', async () => {
  const replay = claims();
  const attestation = replayLockAttestation(replay);
  const publicKey = replayLockAttestationPublicKey();

  assert.deepEqual(replayLockAttestation(replay), attestation);
  assert.equal(attestation.commitment, replayCommitment(replay));
  assert.equal(attestation.lockedDirection, replay.direction);
  assert.equal(attestation.issuedAt, replay.issuedAt);
  assert.equal(attestation.revealAfter, replay.revealAfter);
  assert.equal(attestation.expiresAt, replay.expiresAt);
  assert.equal(await verifyReplayLockAttestation(attestation, publicKey), true);

  const mutations: Array<Partial<ReplayLockAttestation>> = [
    { commitment: `0x${'00'.repeat(32)}` },
    { lockedDirection: 'UP' },
    { issuedAt: attestation.issuedAt - 1 },
    { revealAfter: attestation.revealAfter + 1 },
    { expiresAt: attestation.expiresAt + 1 },
    { signature: `${attestation.signature[0] === 'A' ? 'B' : 'A'}${attestation.signature.slice(1)}` },
  ];
  for (const mutation of mutations) {
    assert.equal(await verifyReplayLockAttestation({ ...attestation, ...mutation }, publicKey), false);
  }

  configure(KEY_B, 'preview');
  assert.equal(await verifyReplayLockAttestation(attestation, replayLockAttestationPublicKey()), false);
  configure(KEY_A, 'production');
  assert.equal(await verifyReplayLockAttestation(attestation, replayLockAttestationPublicKey()), false);
});

test('commitment binds every market-provenance field', () => {
  const replay = claims();
  const commitment = replayCommitment(replay);
  const mutations: Array<Partial<ReplayClaims>> = [
    { marketType: 'SPOT' as never },
    { asset: 'ETH' as never },
    { intervalSec: 900 },
    { question: `${REPLAY_MARKET_QUESTION}?` as never },
    { tradingStart: replay.tradingStart - 1 },
    { marketExpiry: replay.marketExpiry - 1 },
    { marketStatus: 'Trading' as never },
    { tradeCount: replay.tradeCount + 1 },
    { lastTradeAt: replay.lastTradeAt - 1 },
    { operatorId: replay.operatorId + 1 },
    { venueId: `0x${'ef'.repeat(32)}` },
    { marketContext: '0x12' },
    { oracleQuestionId: '51116' },
    { creator: `0x${'ef'.repeat(20)}` },
    { createdByTx: `0x${'fa'.repeat(32)}` },
  ];
  for (const mutation of mutations) {
    assert.notEqual(replayCommitment({ ...replay, ...mutation }), commitment);
  }
});

test('reveal time boundaries are explicit', () => {
  const replay = claims();
  assert.equal(replayTimeStatus(replay, replay.revealAfter - 1), 'sealed');
  assert.equal(replayTimeStatus(replay, replay.revealAfter), 'revealable');
  assert.equal(replayTimeStatus(replay, replay.expiresAt - 1), 'revealable');
  assert.equal(replayTimeStatus(replay, replay.expiresAt), 'expired');
});

test('browser reveal countdown matches the server boundary and does not invent a hold', () => {
  assert.equal(secondsUntilReplayReveal(1_015, 1_000), 15);
  assert.equal(secondsUntilReplayReveal(1_015, 1_014.9), 1);
  assert.equal(secondsUntilReplayReveal(1_015, 1_015), 0);
  assert.equal(secondsUntilReplayReveal(1_015, 1_016), 0);
  assert.equal(secondsUntilReplayReveal(undefined, 1_000), 0);
});
