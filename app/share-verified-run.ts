import { eventContractIntervalLabel } from './event-contract-interval.ts';
import {
  SHANNON_TESTNET_PROFILE,
  SOMNIA_MAINNET_PROFILE,
  type JudgeNetworkProfile,
} from './judge-network.ts';
import { canonicalJudgeActionLog, type JudgeCombatAction } from './judge-combat.ts';
import type { DirectOnchainSettlementProof } from './onchain-settlement-proof.ts';
import type { ReplayCombatProof, ReplayLockAttestation, ReplayProof } from './replay-proof.ts';

export const MARKET_DUNGEON_URL = 'https://market-dungeon.vercel.app';
export const SOMNIA_EXPLORER_URL = 'https://explorer.somnia.network';
export const VERIFIED_RUN_PROOF_SCHEMA_V2 = 'market-dungeon/verified-judge-run/v2';
export const VERIFIED_RUN_PROOF_SCHEMA_V3 = 'market-dungeon/verified-judge-run/v3';

export type VerifiedRunResult = 'BLESSED' | 'CURSED';

export type PortableVerifiedRunSettlementProof = DirectOnchainSettlementProof & {
  voided: false;
  winningOutcome: 0 | 1;
};

export function isPortableVerifiedRunSettlement(
  proof: DirectOnchainSettlementProof | null | undefined,
  profile?: JudgeNetworkProfile,
): proof is PortableVerifiedRunSettlementProof {
  return proof?.finalized === true
    && proof.voided === false
    && (proof.winningOutcome === 0 || proof.winningOutcome === 1)
    && (!profile || proof.chainId === profile.chainId);
}

export type VerifiedRunProofInput = {
  result: VerifiedRunResult;
  intervalSec: unknown;
  replayProof: ReplayProof;
  combatProof: ReplayCombatProof;
  combatActions: JudgeCombatAction[];
  onchainSettlement: PortableVerifiedRunSettlementProof;
  lockAttestation: ReplayLockAttestation;
};

export function verifiedRunProofFilename(marketId: string) {
  const suffix = /^0x[0-9a-f]{64}$/i.test(marketId) ? marketId.slice(-8).toLowerCase() : 'unknown';
  return `market-dungeon-proof-${suffix}.json`;
}

export function verifiedRunProofArtifact(
  input: VerifiedRunProofInput,
  generatedAt = new Date().toISOString(),
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
) {
  const { replayProof, combatProof, combatActions, onchainSettlement } = input;
  if ((input.result !== 'BLESSED' && input.result !== 'CURSED')
    || !isPortableVerifiedRunSettlement(onchainSettlement, profile)) {
    throw new Error('Portable Judge proofs require a non-void BLESSED or CURSED settlement.');
  }
  const winningDirection = onchainSettlement.winningOutcome === 0 ? 'UP' : 'DOWN';
  const expectedResult = replayProof.lockedDirection === winningDirection ? 'BLESSED' : 'CURSED';
  if (replayProof.committedOutcome !== onchainSettlement.winningOutcome || input.result !== expectedResult) {
    throw new Error('Portable Judge proof result must match the committed onchain outcome.');
  }
  const shannon = profile.id === SHANNON_TESTNET_PROFILE.id;
  if (shannon && (replayProof.profileId !== profile.id || replayProof.chainId !== profile.chainId
    || input.lockAttestation.profileId !== profile.id || input.lockAttestation.chainId !== profile.chainId)) {
    throw new Error('Shannon Judge proofs require a chain-bound commitment and lock receipt.');
  }
  if (!shannon && (replayProof.profileId !== undefined || replayProof.chainId !== undefined)) {
    throw new Error('Mainnet v2 Judge proofs cannot contain a Shannon network binding.');
  }
  const blockUrl = `${profile.explorer}/block/${encodeURIComponent(onchainSettlement.blockNumber)}`;
  const moduleUrl = `${profile.explorer}/address/${encodeURIComponent(onchainSettlement.moduleAddress)}`;
  const settlementUrl = `${profile.explorer}/address/${encodeURIComponent(onchainSettlement.settlementAddress)}`;

  const common = {
    schema: shannon ? VERIFIED_RUN_PROOF_SCHEMA_V3 : VERIFIED_RUN_PROOF_SCHEMA_V2,
    generatedAt,
    app: shannon ? `${MARKET_DUNGEON_URL}${profile.judgePath}` : MARKET_DUNGEON_URL,
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
      canonicalTranscript: canonicalJudgeActionLog(replayProof.gameSeed, combatActions, combatProof.ruleset),
    },
    onchainProof: onchainSettlement,
    independentRpcVerification: {
      rpc: profile.rpc,
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
      'ABI-decode both results and compare market, pool, collateral, token IDs, nonce, payout, and finalized non-void state with onchainProof.',
    ],
  } as const;
  return shannon
    ? {
        ...common,
        networkProfile: {
          profileId: profile.id,
          chainId: profile.chainId,
          network: profile.name,
          collateral: profile.collateral,
          binaryModule: profile.contracts.binaryModule,
          binarySettlement: profile.contracts.binarySettlement,
        },
      }
    : common;
}

export function verifiedRunProofJson(
  input: VerifiedRunProofInput,
  generatedAt?: string,
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
) {
  return `${JSON.stringify(verifiedRunProofArtifact(input, generatedAt, profile), null, 2)}\n`;
}

export function verifiedRunShareText(
  input: VerifiedRunProofInput,
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
) {
  const { replayProof, combatProof, onchainSettlement } = input;
  const actualOutcome = replayProof.committedOutcome === 0 ? 'UP' : 'DOWN';
  const result = input.result === 'BLESSED'
    ? 'VICTORY — prediction correct'
    : 'BOSS LAST STAND — prediction incorrect';
  const blockUrl = `${profile.explorer}/block/${encodeURIComponent(onchainSettlement.blockNumber)}`;
  const moduleUrl = `${profile.explorer}/address/${encodeURIComponent(onchainSettlement.moduleAddress)}`;
  const settlementUrl = `${profile.explorer}/address/${encodeURIComponent(onchainSettlement.settlementAddress)}`;

  return [
    `⚔️ Market Dungeon — verified Judge run · ${profile.name}`,
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
