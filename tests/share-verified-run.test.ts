import assert from 'node:assert/strict';
import test from 'node:test';

import type { VerifiedRunProofInput } from '../app/share-verified-run.ts';
import {
  verifiedRunProofArtifact,
  verifiedRunProofFilename,
  verifiedRunProofJson,
  verifiedRunShareText,
} from '../app/share-verified-run.ts';
import { REPLAY_MARKET_QUESTION } from '../app/replay-proof.ts';

const MARKET_ID = `0x${'ab'.repeat(32)}`;
const COMMITMENT = `0x${'cd'.repeat(32)}`;
const BLOCK_HASH = `0x${'12'.repeat(32)}`;
const MODULE = `0x${'34'.repeat(20)}`;
const SETTLEMENT = `0x${'ef'.repeat(20)}`;
const TRANSCRIPT_DIGEST = `0x${'56'.repeat(32)}`;

function proofInput(overrides: Partial<VerifiedRunProofInput> = {}): VerifiedRunProofInput {
  return {
    result: 'CURSED',
    intervalSec: 300,
    replayProof: {
      verified: true,
      algorithm: 'SHA-256',
      commitment: COMMITMENT,
      canonical: `market-dungeon/judge-replay/v2\nmarketId=${MARKET_ID}`,
      marketId: MARKET_ID,
      marketType: 'BINARY',
      asset: 'BTC',
      intervalSec: 300,
      question: REPLAY_MARKET_QUESTION,
      tradingStart: 300,
      marketExpiry: 600,
      marketStatus: 'Finalized',
      tradeCount: 2,
      lastTradeAt: 599,
      operatorId: 5,
      venueId: `0x${'45'.repeat(32)}`,
      marketContext: '0x',
      oracleQuestionId: '51115',
      creator: `0x${'67'.repeat(20)}`,
      createdByTx: `0x${'89'.repeat(32)}`,
      salt: 's'.repeat(43),
      gameSeed: 'g'.repeat(43),
      lockedDirection: 'DOWN',
      committedOutcome: 0,
      issuedAt: 1,
      revealAfter: 2,
      expiresAt: 3,
    },
    combatProof: {
      verified: true,
      ruleset: 'market-dungeon/judge-combat/v1',
      transcriptDigest: TRANSCRIPT_DIGEST,
      steps: 3,
      guardDefeated: true,
      bossDefeated: true,
      playerSurvived: true,
      finalHp: 60,
    },
    combatActions: [
      { room: 8, action: 'attack' },
      { room: 9, action: 'attack' },
      { room: 9, action: 'attack' },
    ],
    onchainSettlement: {
      verified: true,
      source: 'SOMNIA_RPC_ETH_CALL',
      chainId: 5031,
      blockNumber: '401957733',
      blockHash: BLOCK_HASH,
      blockTag: '0x17f59665',
      marketId: MARKET_ID,
      marketAddress: `0x${'78'.repeat(20)}`,
      poolAddress: `0x${'9a'.repeat(20)}`,
      moduleAddress: MODULE,
      settlementAddress: SETTLEMENT,
      collateralToken: `0x${'bc'.repeat(20)}`,
      oracleQuestionId: '1',
      originOperatorId: '5',
      originVenueId: `0x${'45'.repeat(32)}`,
      creator: `0x${'67'.repeat(20)}`,
      tradingStart: '300',
      expiry: '600',
      yesId: '256',
      noId: '257',
      marketKey: '1',
      nonce: '1',
      backing: '1000',
      finalized: true,
      voided: false,
      winningOutcome: 0,
      payoutNumerators: ['10000000', '0'],
      payoutDenominator: '10000000',
      settlementFeeBpsTimes1k: '0',
      calls: {
        moduleMarket: {
          to: MODULE,
          blockTag: '0x17f59665',
          blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
          data: `0x${'11'.repeat(36)}`,
          result: `0x${'22'.repeat(64)}`,
        },
        settlementRecord: {
          to: SETTLEMENT,
          blockTag: '0x17f59665',
          blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
          data: `0x${'33'.repeat(36)}`,
          result: `0x${'44'.repeat(64)}`,
        },
      },
    },
    ...overrides,
  };
}

test('share text keeps working explorer links and removes the broken market search', () => {
  const text = verifiedRunShareText(proofInput());

  assert.match(text, /Locked choice: BTC DOWN/);
  assert.match(text, /Market: BTC 5m/);
  assert.match(text, /Actual outcome: BTC UP/);
  assert.match(text, /BOSS LAST STAND — prediction incorrect/);
  assert.match(text, new RegExp(MARKET_ID));
  assert.match(text, new RegExp(COMMITMENT));
  assert.match(text, new RegExp(TRANSCRIPT_DIGEST));
  assert.match(text, new RegExp(BLOCK_HASH));
  assert.match(text, /Direct Somnia RPC verification snapshot: block #401957733 · payout \[10000000, 0\]/);
  assert.match(text, /RPC verification snapshot block hash:/);
  assert.match(text, /RPC verification snapshot block: https:\/\/explorer\.somnia\.network\/block\/401957733/);
  assert.doesNotMatch(text, /Settlement block:/);
  assert.match(text, new RegExp(MODULE));
  assert.match(text, new RegExp(SETTLEMENT));
  assert.match(text, /https:\/\/explorer\.somnia\.network\/block\/401957733/);
  assert.doesNotMatch(text, /explorer\.somnia\.network\/search\?q=/);
  assert.match(text, /market-dungeon-proof-abababab\.json/);
  assert.match(text, /https:\/\/market-dungeon\.vercel\.app/);
});

test('portable JSON contains every input needed to reproduce commitment, combat, block, and calls', () => {
  const input = proofInput();
  const parsed = JSON.parse(verifiedRunProofJson(input, '2026-09-03T00:00:00.000Z')) as ReturnType<typeof verifiedRunProofArtifact>;

  assert.equal(parsed.schema, 'market-dungeon/verified-judge-run/v1');
  assert.equal(parsed.generatedAt, '2026-09-03T00:00:00.000Z');
  assert.equal(parsed.replayProof.canonical, input.replayProof.canonical);
  assert.equal(parsed.replayProof.salt, input.replayProof.salt);
  assert.deepEqual(parsed.combat.actions, input.combatActions);
  assert.match(parsed.combat.canonicalTranscript, /1:8:attack\n2:9:attack\n3:9:attack/);
  assert.equal(parsed.combat.proof.transcriptDigest, TRANSCRIPT_DIGEST);
  assert.equal(parsed.onchainProof.blockHash, BLOCK_HASH);
  assert.equal(parsed.onchainProof.calls.moduleMarket.result, input.onchainSettlement.calls.moduleMarket.result);
  assert.equal(parsed.onchainProof.calls.settlementRecord.result, input.onchainSettlement.calls.settlementRecord.result);
  assert.equal(parsed.independentRpcVerification.expectedBlock.hash, BLOCK_HASH);
  assert.equal(parsed.independentRpcVerification.blockRequest.method, 'eth_getBlockByHash');
  assert.deepEqual(parsed.independentRpcVerification.blockRequest.params, [BLOCK_HASH, false]);
  assert.deepEqual(parsed.independentRpcVerification.moduleMarketRequest.params, [
    { to: MODULE, data: input.onchainSettlement.calls.moduleMarket.data },
    { blockHash: BLOCK_HASH, requireCanonical: true },
  ]);
  assert.deepEqual(parsed.independentRpcVerification.settlementRecordRequest.params, [
    { to: SETTLEMENT, data: input.onchainSettlement.calls.settlementRecord.data },
    { blockHash: BLOCK_HASH, requireCanonical: true },
  ]);
  assert.match(parsed.explorer.block, /\/block\/401957733$/);
  assert.doesNotMatch(JSON.stringify(parsed.explorer), /\/search\?q=/);
});

test('proof filename is deterministic and does not trust malformed market IDs', () => {
  assert.equal(verifiedRunProofFilename(MARKET_ID), 'market-dungeon-proof-abababab.json');
  assert.equal(verifiedRunProofFilename('not-a-market'), 'market-dungeon-proof-unknown.json');
});

test('winning outcome zero maps to UP and one maps to DOWN', () => {
  const up = verifiedRunShareText(proofInput({
    result: 'BLESSED',
    replayProof: { ...proofInput().replayProof, lockedDirection: 'UP', committedOutcome: 0 },
  }));
  const down = verifiedRunShareText(proofInput({
    result: 'BLESSED',
    replayProof: { ...proofInput().replayProof, lockedDirection: 'DOWN', committedOutcome: 1 },
  }));
  assert.match(up, /Actual outcome: BTC UP/);
  assert.match(down, /Actual outcome: BTC DOWN/);
});
