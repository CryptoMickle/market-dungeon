import { createHash } from 'node:crypto';
import { encodeFunctionResult } from 'viem';

import {
  replayLockAttestation,
  replayLockAttestationPublicKey,
  type ReplayClaims,
} from '../../app/api/judge-replay/crypto';
import { canonicalJudgeActionLog, replayJudgeCombat, type JudgeCombatAction } from '../../app/judge-combat';
import {
  BINARY_SETTLEMENT_ABI,
  DREAMDEX_SETTLEMENT_CONTRACTS,
  MODULE_MARKETS_ABI,
} from '../../app/onchain-settlement-proof';
import {
  canonicalReplayProof,
  REPLAY_MARKET_QUESTION,
  type ReplayCommitmentPayload,
} from '../../app/replay-proof';
import type { PortableVerifiedRunSettlementProof } from '../../app/share-verified-run';

export const MARKET_ID = `0x${'12'.repeat(32)}`;
export const MARKET_ADDRESS = `0x${'34'.repeat(20)}`;
export const POOL_ADDRESS = `0x${'56'.repeat(20)}`;
export const COLLATERAL = `0x${'bc'.repeat(20)}`;
export const BLOCK_HASH = `0x${'de'.repeat(32)}`;
export const BLOCK_TAG = '0x10';
export const CREATOR = `0x${'89'.repeat(20)}`;
export const VENUE_ID = `0x${'45'.repeat(32)}`;
export const CREATED_BY_TX = `0x${'67'.repeat(32)}`;
export const GAME_SEED = 'g'.repeat(43);
export const SEAL = `v2.${'i'.repeat(16)}.${'c'.repeat(64)}.${'t'.repeat(22)}`;
export const VALID_ACTIONS: JudgeCombatAction[] = [
  { room: 8, action: 'attack' },
  { room: 9, action: 'attack' },
  { room: 9, action: 'attack' },
];

const NONCE = 1n;
const YES_ID = (BigInt(POOL_ADDRESS) << 72n) | (NONCE << 8n);
const NO_ID = YES_ID + 1n;
const MARKET_KEY = YES_ID >> 8n;

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

const canonical = canonicalReplayProof(commitmentPayload);
export const COMMITMENT = `0x${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
const { committedOutcome, lockedDirection, ...attestedClaims } = commitmentPayload;
const replayClaims: ReplayClaims = {
  version: 2,
  purpose: 'judge-replay',
  environment: 'development',
  winningOutcome: committedOutcome,
  direction: lockedDirection,
  ...attestedClaims,
};
process.env.JUDGE_REPLAY_SEAL_KEY = '44'.repeat(32);
process.env.VERCEL_ENV = 'development';
export const LOCK_ATTESTATION = replayLockAttestation(replayClaims);
export const LOCK_PUBLIC_KEY = replayLockAttestationPublicKey();

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
    NO_ID,
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

export const onchainSettlement: PortableVerifiedRunSettlementProof = {
  verified: true,
  source: 'SOMNIA_RPC_ETH_CALL',
  chainId: 5031,
  blockNumber: '16',
  blockHash: BLOCK_HASH,
  blockTag: BLOCK_TAG,
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
  noId: NO_ID.toString(),
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
      blockTag: BLOCK_TAG,
      blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
      data: `0x7564912b${MARKET_ID.slice(2)}`,
      result: moduleResult,
    },
    settlementRecord: {
      to: DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement,
      blockTag: BLOCK_TAG,
      blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
      data: `0x4c582380${MARKET_KEY.toString(16).padStart(64, '0')}`,
      result: settlementResult,
    },
  },
};

export const market = {
  marketId: MARKET_ID,
  marketAddress: MARKET_ADDRESS,
  poolAddress: POOL_ADDRESS,
  collateral: COLLATERAL,
  yesTokenId: YES_ID.toString(),
  noTokenId: NO_ID.toString(),
  marketType: 'BINARY',
  asset: 'BTC',
  intervalSec: 300,
  tradeCount: 2,
  lastTradeAt: 399,
  operatorId: 7,
  venueId: VENUE_ID,
  context: '0x',
  oracleQuestionId: '1',
  creator: CREATOR,
  createdByTx: CREATED_BY_TX,
  question: REPLAY_MARKET_QUESTION,
  strikeUsd: '60000.00',
  tradingStart: '100',
  expiry: '400',
  expiryIso: '1970-01-01T00:06:40.000Z',
  status: 'Finalized',
  finalized: true,
  voided: false,
  winningOutcome: 0,
  payoutNumerators: ['10000000', '0'],
  payoutDenominator: '10000000',
  demoReplay: true,
};

export const startPayload = {
  replay: {
    seal: SEAL,
    commitment: COMMITMENT,
    gameSeed: GAME_SEED,
    lockedDirection: 'UP',
    issuedAt: commitmentPayload.issuedAt,
    revealAfter: commitmentPayload.revealAfter,
    expiresAt: commitmentPayload.expiresAt,
    lockAttestation: LOCK_ATTESTATION,
    publicMarket: { asset: 'BTC', intervalSec: 300, network: 'Somnia mainnet', chainId: 5031 },
  },
};

export function revealPayload(actions: JudgeCombatAction[]) {
  const combat = replayJudgeCombat(GAME_SEED, actions);
  const transcript = canonicalJudgeActionLog(GAME_SEED, actions);
  return {
    market: structuredClone(market),
    onchainSettlement: structuredClone(onchainSettlement),
    lockAttestation: structuredClone(LOCK_ATTESTATION),
    replayProof: {
      verified: true,
      algorithm: 'SHA-256',
      commitment: COMMITMENT,
      canonical,
      ...commitmentPayload,
    },
    combatProof: {
      verified: combat.verified,
      ruleset: 'market-dungeon/judge-combat/v1',
      transcriptDigest: `0x${createHash('sha256').update(transcript, 'utf8').digest('hex')}`,
      steps: combat.steps,
      guardDefeated: combat.guardDefeated,
      bossDefeated: combat.bossDefeated,
      playerSurvived: combat.playerSurvived,
      finalHp: combat.finalHp,
    },
  };
}
