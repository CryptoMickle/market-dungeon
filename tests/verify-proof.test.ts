import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';

import {
  replayLockAttestation,
  replayLockAttestationPublicKey,
  type ReplayClaims,
} from '../app/api/judge-replay/crypto.ts';
import { canonicalJudgeActionLog, replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';
import {
  BINARY_SETTLEMENT_ABI,
  DREAMDEX_SETTLEMENT_CONTRACTS,
  MODULE_MARKETS_ABI,
  type DirectOnchainSettlementProof,
  type SettlementProofRpc,
} from '../app/onchain-settlement-proof.ts';
import {
  canonicalReplayProof,
  REPLAY_MARKET_QUESTION,
  type ReplayCommitmentPayload,
  type ReplayCombatProof,
  type ReplayProof,
} from '../app/replay-proof.ts';
import { verifiedRunProofJson, type VerifiedRunProofInput } from '../app/share-verified-run.ts';
import {
  VERIFIED_PROOF_MAX_BYTES,
  parseVerifiedProofArtifact,
  verifyProofArtifact,
} from '../app/verify-proof.ts';
const MARKET_ID = `0x${'12'.repeat(32)}`;
const MARKET_ADDRESS = `0x${'34'.repeat(20)}`;
const POOL_ADDRESS = `0x${'56'.repeat(20)}`;
const COLLATERAL = `0x${'bc'.repeat(20)}`;
const BLOCK_HASH = `0x${'de'.repeat(32)}`;
const CREATOR = `0x${'89'.repeat(20)}`;
const VENUE_ID = `0x${'45'.repeat(32)}`;
const CREATED_BY_TX = `0x${'67'.repeat(32)}`;
const GAME_SEED = 'g'.repeat(43);
const NONCE = 1n;
const YES_ID = (BigInt(POOL_ADDRESS) << 72n) | (NONCE << 8n);
const MARKET_KEY = YES_ID >> 8n;
const VALID_ACTIONS: JudgeCombatAction[] = [
  { room: 8, action: 'attack' },
  { room: 9, action: 'attack' },
  { room: 9, action: 'attack' },
];
process.env.JUDGE_REPLAY_SEAL_KEY = '55'.repeat(32);
process.env.VERCEL_ENV = 'preview';

const commitmentPayload: ReplayCommitmentPayload = {
  marketId: MARKET_ID,
  marketType: 'BINARY',
  asset: 'BTC',
  intervalSec: 300,
  question: REPLAY_MARKET_QUESTION,
  tradingStart: 100,
  marketExpiry: 400,
  marketStatus: 'Finalized',
  tradeCount: 2,
  lastTradeAt: 399,
  operatorId: 7,
  venueId: VENUE_ID,
  marketContext: '0x',
  oracleQuestionId: '1',
  creator: CREATOR,
  createdByTx: CREATED_BY_TX,
  committedOutcome: 0,
  lockedDirection: 'UP',
  gameSeed: GAME_SEED,
  issuedAt: 500,
  revealAfter: 501,
  expiresAt: 5_000,
  salt: 's'.repeat(43),
};

const canonicalCommitment = canonicalReplayProof(commitmentPayload);
const commitment = `0x${createHash('sha256').update(canonicalCommitment, 'utf8').digest('hex')}`;
const { committedOutcome, lockedDirection, ...attestedClaims } = commitmentPayload;
const replayClaims: ReplayClaims = {
  version: 2,
  purpose: 'judge-replay',
  environment: 'preview',
  winningOutcome: committedOutcome,
  direction: lockedDirection,
  ...attestedClaims,
};
const moduleResult = encodeFunctionResult({
  abi: MODULE_MARKETS_ABI,
  functionName: 'markets',
  result: [
    1n,
    2,
    0,
    COLLATERAL as `0x${string}`,
    7,
    VENUE_ID as `0x${string}`,
    `0x${'78'.repeat(20)}` as `0x${string}`,
    CREATOR as `0x${string}`,
    MARKET_ADDRESS as `0x${string}`,
    POOL_ADDRESS as `0x${string}`,
    YES_ID,
    YES_ID + 1n,
    100n,
    400n,
  ],
});
const settlementResult = encodeFunctionResult({
  abi: BINARY_SETTLEMENT_ABI,
  functionName: 'getSettlement',
  result: [
    COLLATERAL,
    0n,
    true,
    false,
    0n,
    `0x${'ab'.repeat(20)}`,
    POOL_ADDRESS,
    NONCE,
    [10_000_000n, 0n],
  ] as never,
});
const onchainSettlement: DirectOnchainSettlementProof = {
  verified: true,
  source: 'SOMNIA_RPC_ETH_CALL',
  chainId: 5031,
  blockNumber: '16',
  blockHash: BLOCK_HASH,
  blockTag: '0x10',
  marketId: MARKET_ID,
  marketAddress: MARKET_ADDRESS,
  poolAddress: POOL_ADDRESS,
  moduleAddress: DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule,
  settlementAddress: DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement,
  collateralToken: COLLATERAL,
  oracleQuestionId: '1',
  originOperatorId: '7',
  originVenueId: VENUE_ID,
  creator: CREATOR,
  tradingStart: '100',
  expiry: '400',
  yesId: YES_ID.toString(),
  noId: (YES_ID + 1n).toString(),
  marketKey: MARKET_KEY.toString(),
  nonce: NONCE.toString(),
  backing: '0',
  finalized: true,
  voided: false,
  winningOutcome: 0,
  payoutNumerators: ['10000000', '0'],
  payoutDenominator: '10000000',
  settlementFeeBpsTimes1k: '0',
  calls: {
    moduleMarket: {
      to: DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule,
      blockTag: '0x10',
      blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
      data: `0x7564912b${MARKET_ID.slice(2)}`,
      result: moduleResult,
    },
    settlementRecord: {
      to: DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement,
      blockTag: '0x10',
      blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
      data: `0x4c582380${MARKET_KEY.toString(16).padStart(64, '0')}`,
      result: settlementResult,
    },
  },
};

function proofInput(): VerifiedRunProofInput {
  const combat = replayJudgeCombat(GAME_SEED, VALID_ACTIONS);
  const canonicalTranscript = canonicalJudgeActionLog(GAME_SEED, VALID_ACTIONS);
  return {
    result: 'BLESSED',
    intervalSec: 300,
    replayProof: {
      ...commitmentPayload,
      verified: true,
      algorithm: 'SHA-256',
      canonical: canonicalCommitment,
      commitment,
    } as ReplayProof,
    combatProof: {
      verified: true,
      ruleset: 'market-dungeon/judge-combat/v1',
      transcriptDigest: `0x${createHash('sha256').update(canonicalTranscript, 'utf8').digest('hex')}`,
      steps: combat.steps,
      guardDefeated: combat.guardDefeated,
      bossDefeated: combat.bossDefeated,
      playerSurvived: combat.playerSurvived,
      finalHp: combat.finalHp,
    } as ReplayCombatProof,
    combatActions: VALID_ACTIONS as JudgeCombatAction[],
    onchainSettlement,
    lockAttestation: replayLockAttestation(replayClaims),
  };
}

function proofJson() {
  return verifiedRunProofJson(proofInput(), '2026-09-04T08:00:00.000Z');
}

function matchingRpc(): SettlementProofRpc {
  return async (method, params) => {
    if (method === 'eth_chainId') return '0x13a7';
    if (method === 'eth_getBlockByHash') {
      assert.deepEqual(params, [onchainSettlement.blockHash, false]);
      return { number: onchainSettlement.blockTag, hash: onchainSettlement.blockHash };
    }
    if (method === 'eth_call') {
      const call = params[0] as { to?: string };
      return call.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
        ? onchainSettlement.calls.moduleMarket.result
        : onchainSettlement.calls.settlementRecord.result;
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  };
}

async function matchingPublicKey() {
  return replayLockAttestationPublicKey();
}

test('strict parser accepts a canonical exported Judge proof', () => {
  const parsed = parseVerifiedProofArtifact(proofJson());
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.artifact.schema, 'market-dungeon/verified-judge-run/v2');
    assert.equal(parsed.artifact.summary.result, 'BLESSED');
  }
});

test('standalone verifier reproduces commitment, combat, settlement, and live RPC data', async () => {
  const result = await verifyProofArtifact(proofJson(), matchingRpc(), matchingPublicKey);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.checks.map((check) => check.status), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
  assert.equal(result.summary?.lockedDirection, 'UP');
  assert.equal(result.summary?.winningOutcome, 'UP');
});

test('local tampering fails before any public RPC request is attempted', async () => {
  const artifact = JSON.parse(proofJson()) as {
    combat: { actions: Array<{ room: number; action: string }> };
    replayProof: { marketId: string };
  };
  artifact.combat.actions[0]!.action = 'storm';
  let rpcCalls = 0;
  const result = await verifyProofArtifact(JSON.stringify(artifact), async () => {
    rpcCalls += 1;
    throw new Error('RPC should not be reached');
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.checks.find((check) => check.id === 'combat')?.status, 'FAIL');
  assert.equal(rpcCalls, 0);
});

test('altered direction, market identity, and raw ABI result each fail locally', async () => {
  const directionTamper = JSON.parse(proofJson()) as {
    summary: { lockedDirection: string; result: string };
    replayProof: { lockedDirection: string };
  };
  directionTamper.replayProof.lockedDirection = 'DOWN';
  directionTamper.summary.lockedDirection = 'DOWN';
  directionTamper.summary.result = 'CURSED';

  const marketTamper = JSON.parse(proofJson()) as {
    summary: { marketId: string };
    replayProof: { marketId: string };
  };
  marketTamper.replayProof.marketId = `0x${'aa'.repeat(32)}`;
  marketTamper.summary.marketId = marketTamper.replayProof.marketId;

  const rawResultTamper = JSON.parse(proofJson()) as {
    independentRpcVerification: { moduleMarketRequest: { expectedResult: string } };
    onchainProof: { calls: { moduleMarket: { result: string } } };
  };
  const malformedAbi = `0x${'00'.repeat(64)}`;
  rawResultTamper.onchainProof.calls.moduleMarket.result = malformedAbi;
  rawResultTamper.independentRpcVerification.moduleMarketRequest.expectedResult = malformedAbi;

  for (const artifact of [directionTamper, marketTamper, rawResultTamper]) {
    let rpcCalls = 0;
    const result = await verifyProofArtifact(JSON.stringify(artifact), async () => {
      rpcCalls += 1;
      throw new Error('RPC should not be reached');
    });
    assert.equal(result.status, 'FAIL');
    assert.equal(rpcCalls, 0);
  }
});

test('a post-hoc rewritten winning choice fails its server lock receipt before Somnia RPC', async () => {
  const artifact = JSON.parse(proofJson()) as {
    summary: { lockedDirection: 'UP' | 'DOWN'; result: 'BLESSED' | 'CURSED' };
    replayProof: ReplayProof;
    lockAttestation: {
      commitment: string;
      lockedDirection: 'UP' | 'DOWN';
      signature: string;
    };
  };
  artifact.replayProof.lockedDirection = 'DOWN';
  artifact.replayProof.canonical = canonicalReplayProof(artifact.replayProof);
  artifact.replayProof.commitment = `0x${createHash('sha256').update(artifact.replayProof.canonical, 'utf8').digest('hex')}`;
  artifact.summary.lockedDirection = 'DOWN';
  artifact.summary.result = 'CURSED';
  artifact.lockAttestation.commitment = artifact.replayProof.commitment;
  artifact.lockAttestation.lockedDirection = 'DOWN';

  let rpcCalls = 0;
  const result = await verifyProofArtifact(JSON.stringify(artifact), async () => {
    rpcCalls += 1;
    return null;
  }, matchingPublicKey);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.checks.find((check) => check.id === 'attestation')?.status, 'FAIL');
  assert.equal(rpcCalls, 0);
});

test('an unavailable public lock key is NOT PROVABLE while invalid signatures are FAIL', async () => {
  const unavailable = await verifyProofArtifact(
    proofJson(),
    matchingRpc(),
    async () => { throw new Error('Key endpoint unavailable'); },
  );
  assert.equal(unavailable.status, 'NOT PROVABLE');
  assert.equal(unavailable.checks.find((check) => check.id === 'attestation')?.status, 'NOT PROVABLE');

  const artifact = JSON.parse(proofJson()) as { lockAttestation: { signature: string } };
  artifact.lockAttestation.signature = `${artifact.lockAttestation.signature[0] === 'A' ? 'B' : 'A'}${artifact.lockAttestation.signature.slice(1)}`;
  let rpcCalls = 0;
  const invalid = await verifyProofArtifact(JSON.stringify(artifact), async () => {
    rpcCalls += 1;
    return null;
  }, matchingPublicKey);
  assert.equal(invalid.status, 'FAIL');
  assert.equal(invalid.checks.find((check) => check.id === 'attestation')?.status, 'FAIL');
  assert.equal(rpcCalls, 0);

  const currentKey = replayLockAttestationPublicKey();
  const rotatedKey = {
    ...currentKey,
    keyId: `${currentKey.keyId.slice(0, -1)}${currentKey.keyId.endsWith('0') ? '1' : '0'}`,
  };
  let rotationRpcCalls = 0;
  const rotated = await verifyProofArtifact(proofJson(), async (method, params) => {
    rotationRpcCalls += 1;
    return matchingRpc()(method, params);
  }, async () => rotatedKey);
  assert.equal(rotated.status, 'NOT PROVABLE');
  assert.equal(rotated.checks.find((check) => check.id === 'attestation')?.status, 'NOT PROVABLE');
  assert.equal(rotationRpcCalls, 4);
});

test('strict parser rejects changed summaries, endpoints, unknown fields, and oversized input', () => {
  const summaryTamper = JSON.parse(proofJson()) as Record<string, unknown> & {
    summary: Record<string, unknown>;
  };
  summaryTamper.summary.result = 'CURSED';
  assert.equal(parseVerifiedProofArtifact(JSON.stringify(summaryTamper)).ok, false);

  const endpointTamper = JSON.parse(proofJson()) as Record<string, unknown> & {
    independentRpcVerification: Record<string, unknown>;
  };
  endpointTamper.independentRpcVerification.rpc = 'https://example.invalid';
  assert.equal(parseVerifiedProofArtifact(JSON.stringify(endpointTamper)).ok, false);

  const extraField = JSON.parse(proofJson()) as Record<string, unknown>;
  extraField.untrusted = true;
  assert.equal(parseVerifiedProofArtifact(JSON.stringify(extraField)).ok, false);

  const downgrade = JSON.parse(proofJson()) as Record<string, unknown>;
  downgrade.schema = 'market-dungeon/verified-judge-run/v1';
  assert.equal(parseVerifiedProofArtifact(JSON.stringify(downgrade)).ok, false);

  assert.equal(parseVerifiedProofArtifact('x'.repeat(VERIFIED_PROOF_MAX_BYTES + 1)).ok, false);
});

test('a live RPC mismatch is FAIL while an unavailable RPC is NOT PROVABLE', async () => {
  const mismatchRpc: SettlementProofRpc = async (method, params) => {
    if (method === 'eth_getBlockByHash') {
      return { number: onchainSettlement.blockTag, hash: `0x${'ff'.repeat(32)}` };
    }
    return matchingRpc()(method, params);
  };
  const mismatch = await verifyProofArtifact(proofJson(), mismatchRpc, matchingPublicKey);
  assert.equal(mismatch.status, 'FAIL');
  assert.equal(mismatch.checks.at(-1)?.id, 'rpc');
  assert.equal(mismatch.checks.at(-1)?.status, 'FAIL');

  const unavailable = await verifyProofArtifact(proofJson(), async () => {
    throw new Error('Network unavailable');
  }, matchingPublicKey);
  assert.equal(unavailable.status, 'NOT PROVABLE');
  assert.equal(unavailable.checks.at(-1)?.status, 'NOT PROVABLE');
});

test('a nonexistent tampered block hash is a definitive FAIL before eth_call', async () => {
  const artifact = JSON.parse(proofJson()) as {
    onchainProof: {
      blockHash: string;
      calls: {
        moduleMarket: { blockReference: { blockHash: string } };
        settlementRecord: { blockReference: { blockHash: string } };
      };
    };
    independentRpcVerification: {
      blockRequest: { params: [string, boolean] };
      moduleMarketRequest: { params: [unknown, { blockHash: string; requireCanonical: boolean }] };
      settlementRecordRequest: { params: [unknown, { blockHash: string; requireCanonical: boolean }] };
      expectedBlock: { number: string; hash: string };
    };
  };
  const falseHash = `0x${'fa'.repeat(32)}`;
  artifact.onchainProof.blockHash = falseHash;
  artifact.onchainProof.calls.moduleMarket.blockReference.blockHash = falseHash;
  artifact.onchainProof.calls.settlementRecord.blockReference.blockHash = falseHash;
  artifact.independentRpcVerification.blockRequest.params[0] = falseHash;
  artifact.independentRpcVerification.moduleMarketRequest.params[1].blockHash = falseHash;
  artifact.independentRpcVerification.settlementRecordRequest.params[1].blockHash = falseHash;
  artifact.independentRpcVerification.expectedBlock.hash = falseHash;

  let ethCalls = 0;
  const result = await verifyProofArtifact(JSON.stringify(artifact), async (method) => {
    if (method === 'eth_chainId') return '0x13a7';
    if (method === 'eth_getBlockByHash') return null;
    ethCalls += 1;
    throw new Error('eth_call should not run for a missing block');
  }, matchingPublicKey);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.checks.at(-1)?.status, 'FAIL');
  assert.match(result.checks.at(-1)?.detail ?? '', /canonical block/i);
  assert.equal(ethCalls, 0);
});
