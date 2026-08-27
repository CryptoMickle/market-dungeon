import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';

import { canonicalReplayProof } from '../app/replay-proof.ts';
import {
  canonicalReplay,
  newReplayClaims,
  openReplay,
  replayCommitment,
  replayTimeStatus,
  sealReplay,
  type ReplayClaims,
} from '../app/api/judge-replay/crypto.ts';

const KEY_A = '11'.repeat(32);
const KEY_B = '22'.repeat(32);
const MARKET_ID = `0x${'ab'.repeat(32)}`;

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
    marketId: replay.marketId,
    committedOutcome: replay.winningOutcome,
    lockedDirection: replay.direction,
    gameSeed: replay.gameSeed,
    issuedAt: replay.issuedAt,
    revealAfter: replay.revealAfter,
    expiresAt: replay.expiresAt,
    salt: replay.salt,
  });
  assert.equal(canonicalReplay(replay), browserCanonical);

  const browserDigest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(browserCanonical));
  const browserHex = `0x${Buffer.from(browserDigest).toString('hex')}`;
  const nodeHex = `0x${createHash('sha256').update(browserCanonical, 'utf8').digest('hex')}`;
  assert.equal(replayCommitment(replay), browserHex);
  assert.equal(browserHex, nodeHex);
});

test('reveal time boundaries are explicit', () => {
  const replay = claims();
  assert.equal(replayTimeStatus(replay, replay.revealAfter - 1), 'sealed');
  assert.equal(replayTimeStatus(replay, replay.revealAfter), 'revealable');
  assert.equal(replayTimeStatus(replay, replay.expiresAt - 1), 'revealable');
  assert.equal(replayTimeStatus(replay, replay.expiresAt), 'expired');
});
