import { eventContractIntervalLabel } from './event-contract-interval.ts';
import { canonicalJudgeActionLog, type JudgeCombatAction } from './judge-combat.ts';
import {
  SOMNIA_MAINNET_RPC,
  type DirectOnchainSettlementProof,
} from './onchain-settlement-proof.ts';
import type { ReplayCombatProof, ReplayLockAttestation, ReplayProof } from './replay-proof.ts';

export const MARKET_DUNGEON_URL = 'https://market-dungeon.vercel.app';
export const SOMNIA_EXPLORER_URL = 'https://explorer.somnia.network';

export type VerifiedRunResult = 'BLESSED' | 'CURSED' | 'VOID';

export type VerifiedRunProofInput = {
  result: VerifiedRunResult;
  intervalSec: unknown;
  replayProof: ReplayProof;
  combatProof: ReplayCombatProof;
  combatActions: JudgeCombatAction[];
  onchainSettlement: DirectOnchainSettlementProof;
  lockAttestation: ReplayLockAttestation;
};

export function verifiedRunProofFilename(marketId: string) {
  const suffix = /^0x[0-9a-f]{64}$/i.test(marketId) ? marketId.slice(-8).toLowerCase() : 'unknown';
  return `market-dungeon-proof-${suffix}.json`;
}

export function verifiedRunProofArtifact(input: VerifiedRunProofInput, generatedAt = new Date().toISOString()) {
  const { replayProof, combatProof, combatActions, onchainSettlement } = input;
  const blockUrl = `${SOMNIA_EXPLORER_URL}/block/${encodeURIComponent(onchainSettlement.blockNumber)}`;
  const moduleUrl = `${SOMNIA_EXPLORER_URL}/address/${encodeURIComponent(onchainSettlement.moduleAddress)}`;
  const settlementUrl = `${SOMNIA_EXPLORER_URL}/address/${encodeURIComponent(onchainSettlement.settlementAddress)}`;

  return {
    schema: 'market-dungeon/verified-judge-run/v2',
    generatedAt,
    app: MARKET_DUNGEON_URL,
    summary: {
      market: `BTC ${eventContractIntervalLabel(input.intervalSec)}`,
      result: input.result,
      lockedDirection: replayProof.lockedDirection,
      winningOutcome: replayProof.committedOutcome === 0 ? 'UP' : 'DOWN',
      marketId: replayProof.marketId,
    },
    replayProof,
    lockAttestation: input.lockAttestation,
    combat: {
      proof: combatProof,
      actions: combatActions,
      canonicalTranscript: canonicalJudgeActionLog(replayProof.gameSeed, combatActions),
    },
    onchainProof: onchainSettlement,
    independentRpcVerification: {
      rpc: SOMNIA_MAINNET_RPC,
      chainIdRequest: { method: 'eth_chainId', params: [] },
      blockRequest: { method: 'eth_getBlockByHash', params: [onchainSettlement.blockHash, false] },
      moduleMarketRequest: {
        method: 'eth_call',
        params: [{ to: onchainSettlement.calls.moduleMarket.to, data: onchainSettlement.calls.moduleMarket.data }, onchainSettlement.calls.moduleMarket.blockReference],
        expectedResult: onchainSettlement.calls.moduleMarket.result,
      },
      settlementRecordRequest: {
        method: 'eth_call',
        params: [{ to: onchainSettlement.calls.settlementRecord.to, data: onchainSettlement.calls.settlementRecord.data }, onchainSettlement.calls.settlementRecord.blockReference],
        expectedResult: onchainSettlement.calls.settlementRecord.result,
      },
      expectedBlock: { number: onchainSettlement.blockTag, hash: onchainSettlement.blockHash },
    },
    explorer: {
      block: blockUrl,
      binaryModule: moduleUrl,
      binarySettlement: settlementUrl,
    },
    verificationSteps: [
      'Fetch the read-only Judge lock-attestation public key from the fixed Market Dungeon endpoint.',
      'Verify the Ed25519 signature over commitment, direction, issuedAt, revealAfter, and expiresAt.',
      'SHA-256(replayProof.canonical) must equal replayProof.commitment.',
      'SHA-256(combat.canonicalTranscript) must equal combat.proof.transcriptDigest.',
      'Run the four independentRpcVerification requests against the listed RPC.',
      'Require the returned chain, block hash, module result, and settlement result to match exactly.',
      'Require both eth_call requests to use the recorded EIP-1898 blockHash with requireCanonical=true.',
      'ABI-decode both results and compare market, pool, collateral, token IDs, nonce, payout, and finalized/void state with onchainProof.',
    ],
  } as const;
}

export function verifiedRunProofJson(input: VerifiedRunProofInput, generatedAt?: string) {
  return `${JSON.stringify(verifiedRunProofArtifact(input, generatedAt), null, 2)}\n`;
}

export function verifiedRunShareText(input: VerifiedRunProofInput) {
  const { replayProof, combatProof, onchainSettlement } = input;
  const actualOutcome = replayProof.committedOutcome === 0 ? 'UP' : 'DOWN';
  const result = input.result === 'BLESSED'
    ? 'VICTORY — prediction correct'
    : input.result === 'CURSED'
      ? 'BOSS LAST STAND — prediction incorrect'
      : 'VOID — no prediction loss';
  const blockUrl = `${SOMNIA_EXPLORER_URL}/block/${encodeURIComponent(onchainSettlement.blockNumber)}`;
  const moduleUrl = `${SOMNIA_EXPLORER_URL}/address/${encodeURIComponent(onchainSettlement.moduleAddress)}`;
  const settlementUrl = `${SOMNIA_EXPLORER_URL}/address/${encodeURIComponent(onchainSettlement.settlementAddress)}`;

  return [
    '⚔️ Market Dungeon — verified Judge run',
    `Market: BTC ${eventContractIntervalLabel(input.intervalSec)}`,
    `Locked choice: BTC ${replayProof.lockedDirection}`,
    `Actual outcome: BTC ${actualOutcome}`,
    `Result: ${result}`,
    `Market ID: ${replayProof.marketId}`,
    `Combat verified: guard + boss · ${combatProof.steps} actions · digest ${combatProof.transcriptDigest}`,
    `Commitment verified: ${replayProof.commitment}`,
    `Server-authenticated lock receipt: ${input.lockAttestation.keyId}`,
    `Direct Somnia RPC verification snapshot: block #${onchainSettlement.blockNumber} · payout [${onchainSettlement.payoutNumerators.join(', ')}]`,
    `RPC verification snapshot block hash: ${onchainSettlement.blockHash}`,
    `RPC verification snapshot block: ${blockUrl}`,
    `BinaryModule: ${moduleUrl}`,
    `BinarySettlement: ${settlementUrl}`,
    `Portable proof: ${verifiedRunProofFilename(replayProof.marketId)} (share or download from Market Dungeon)`,
    `Play Market Dungeon: ${MARKET_DUNGEON_URL}`,
  ].join('\n');
}
