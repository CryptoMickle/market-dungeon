import { canonicalJudgeActionLog, replayJudgeCombat, type JudgeCombatAction } from './judge-combat.ts';
import { eventContractIntervalLabel } from './event-contract-interval.ts';
import {
  SOMNIA_MAINNET_RPC,
  directSettlementProofMatchesMarket,
  directSettlementProofRpcOutcome,
  type DirectOnchainSettlementProof,
  type SettlementProofRpc,
} from './onchain-settlement-proof.ts';
import {
  canonicalReplayProof,
  isReplayLockAttestation,
  isReplayLockPublicKey,
  REPLAY_MARKET_QUESTION,
  REPLAY_LOCK_PUBLIC_KEY_ENDPOINT,
  replayLockAttestationMatchesProof,
  verifyReplayLockAttestation,
  type ReplayCombatProof,
  type ReplayLockAttestation,
  type ReplayLockPublicKey,
  type ReplayProof,
} from './replay-proof.ts';
import {
  isPortableVerifiedRunSettlement,
  type PortableVerifiedRunSettlementProof,
} from './share-verified-run.ts';

export const VERIFIED_PROOF_SCHEMA = 'market-dungeon/verified-judge-run/v2';
export const VERIFIED_PROOF_MAX_BYTES = 128 * 1024;
export const VERIFIED_PROOF_APP = 'https://market-dungeon.vercel.app';
export const VERIFIED_PROOF_EXPLORER = 'https://explorer.somnia.network';
export const VERIFIED_PROOF_PUBLIC_KEY_ENDPOINT = REPLAY_LOCK_PUBLIC_KEY_ENDPOINT;

export type ProofVerificationStatus = 'PASS' | 'FAIL' | 'NOT PROVABLE';

export type ProofVerificationCheck = {
  id: 'artifact' | 'commitment' | 'attestation' | 'combat' | 'settlement' | 'rpc';
  label: string;
  status: ProofVerificationStatus;
  detail: string;
};

export type VerifiedProofSummary = {
  market: string;
  result: 'BLESSED' | 'CURSED';
  lockedDirection: 'UP' | 'DOWN';
  winningOutcome: 'UP' | 'DOWN';
  marketId: string;
  blockNumber: string;
  blockHash: string;
};

export type ProofVerificationResult = {
  status: ProofVerificationStatus;
  checks: ProofVerificationCheck[];
  summary?: VerifiedProofSummary;
};

type PortableProofArtifact = {
  schema: typeof VERIFIED_PROOF_SCHEMA;
  generatedAt: string;
  app: typeof VERIFIED_PROOF_APP;
  summary: {
    market: string;
    result: 'BLESSED' | 'CURSED';
    lockedDirection: 'UP' | 'DOWN';
    winningOutcome: 'UP' | 'DOWN';
    marketId: string;
  };
  replayProof: ReplayProof;
  lockAttestation: ReplayLockAttestation;
  combat: {
    proof: ReplayCombatProof;
    actions: JudgeCombatAction[];
    canonicalTranscript: string;
  };
  onchainProof: PortableVerifiedRunSettlementProof;
  independentRpcVerification: Record<string, unknown>;
  explorer: Record<string, unknown>;
  verificationSteps: string[];
};

type ProofParseResult =
  | { ok: true; artifact: PortableProofArtifact }
  | { ok: false; error: string };

export type ReplayLockPublicKeyProvider = () => Promise<unknown>;

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/i;
const ABI_WORDS = /^0x(?:[0-9a-f]{64})+$/i;
const UNSIGNED_DECIMAL = /^\d+$/;
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

const TOP_LEVEL_KEYS = [
  'app',
  'combat',
  'explorer',
  'generatedAt',
  'independentRpcVerification',
  'lockAttestation',
  'onchainProof',
  'replayProof',
  'schema',
  'summary',
  'verificationSteps',
];

const REPLAY_KEYS = [
  'algorithm', 'asset', 'canonical', 'commitment', 'committedOutcome', 'createdByTx',
  'creator', 'expiresAt', 'gameSeed', 'intervalSec', 'issuedAt', 'lastTradeAt',
  'lockedDirection', 'marketContext', 'marketExpiry', 'marketId', 'marketStatus',
  'marketType', 'operatorId', 'oracleQuestionId', 'question', 'revealAfter', 'salt',
  'tradeCount', 'tradingStart', 'venueId', 'verified',
];

const ONCHAIN_KEYS = [
  'backing', 'blockHash', 'blockNumber', 'blockTag', 'calls', 'chainId', 'collateralToken',
  'creator', 'expiry', 'finalized', 'marketAddress', 'marketId', 'marketKey',
  'moduleAddress', 'noId', 'nonce', 'originOperatorId', 'originVenueId', 'payoutDenominator',
  'payoutNumerators', 'poolAddress', 'settlementAddress', 'settlementFeeBpsTimes1k',
  'source', 'tradingStart', 'verified', 'voided', 'winningOutcome', 'yesId',
  'oracleQuestionId',
];

const VERIFICATION_STEPS = [
  'Fetch the read-only Judge lock-attestation public key from the fixed Market Dungeon endpoint.',
  'Verify the Ed25519 signature over commitment, direction, issuedAt, revealAfter, and expiresAt.',
  'SHA-256(replayProof.canonical) must equal replayProof.commitment.',
  'SHA-256(combat.canonicalTranscript) must equal combat.proof.transcriptDigest.',
  'Run the four independentRpcVerification requests against the listed RPC.',
  'Require the returned chain, block hash, module result, and settlement result to match exactly.',
  'Require both eth_call requests to use the recorded EIP-1898 blockHash with requireCanonical=true.',
  'ABI-decode both results and compare market, pool, collateral, token IDs, nonce, payout, and finalized non-void state with onchainProof.',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isJudgeCombatAction(value: unknown): value is JudgeCombatAction {
  if (!isRecord(value) || !hasExactKeys(value, ['action', 'room'])) return false;
  return (value.room === 8 || value.room === 9)
    && (value.action === 'attack' || value.action === 'storm' || value.action === 'potion');
}

function parseReplayProof(value: unknown): ReplayProof | null {
  if (!isRecord(value) || !hasExactKeys(value, REPLAY_KEYS)) return null;
  if (value.verified !== true || value.algorithm !== 'SHA-256'
    || value.marketType !== 'BINARY' || value.asset !== 'BTC'
    || (value.intervalSec !== 300 && value.intervalSec !== 900)
    || value.question !== REPLAY_MARKET_QUESTION || value.marketStatus !== 'Finalized'
    || !isBoundedString(value.canonical, 8_192) || !BYTES32.test(String(value.commitment))
    || !BYTES32.test(String(value.marketId)) || !BYTES32.test(String(value.venueId))
    || !HEX_BYTES.test(String(value.marketContext)) || !ADDRESS.test(String(value.creator))
    || !BYTES32.test(String(value.createdByTx)) || !UNSIGNED_DECIMAL.test(String(value.oracleQuestionId))
    || !BASE64URL_32_BYTES.test(String(value.gameSeed)) || !BASE64URL_32_BYTES.test(String(value.salt))
    || (value.lockedDirection !== 'UP' && value.lockedDirection !== 'DOWN')
    || (value.committedOutcome !== 0 && value.committedOutcome !== 1)
    || !isSafePositiveInteger(value.tradingStart) || !isSafePositiveInteger(value.marketExpiry)
    || !isSafePositiveInteger(value.tradeCount) || !isSafePositiveInteger(value.lastTradeAt)
    || typeof value.operatorId !== 'number' || !Number.isSafeInteger(value.operatorId) || value.operatorId < 0
    || !isSafePositiveInteger(value.issuedAt) || !isSafePositiveInteger(value.revealAfter)
    || !isSafePositiveInteger(value.expiresAt)) return null;

  if (value.marketExpiry - value.tradingStart !== value.intervalSec
    || value.lastTradeAt < value.tradingStart || value.lastTradeAt > value.marketExpiry
    || value.issuedAt > value.revealAfter || value.revealAfter > value.expiresAt) return null;
  return value as unknown as ReplayProof;
}

function parseCombat(value: unknown): PortableProofArtifact['combat'] | null {
  if (!isRecord(value) || !hasExactKeys(value, ['actions', 'canonicalTranscript', 'proof'])
    || !Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 64
    || !value.actions.every(isJudgeCombatAction) || !isBoundedString(value.canonicalTranscript, 8_192)
    || !isRecord(value.proof)
    || !hasExactKeys(value.proof, [
      'bossDefeated', 'finalHp', 'guardDefeated', 'playerSurvived', 'ruleset', 'steps',
      'transcriptDigest', 'verified',
    ])) return null;

  const proof = value.proof;
  if (proof.verified !== true || proof.ruleset !== 'market-dungeon/judge-combat/v1'
    || !BYTES32.test(String(proof.transcriptDigest))
    || typeof proof.steps !== 'number' || !Number.isSafeInteger(proof.steps) || proof.steps !== value.actions.length
    || proof.guardDefeated !== true || proof.bossDefeated !== true || proof.playerSurvived !== true
    || typeof proof.finalHp !== 'number' || !Number.isSafeInteger(proof.finalHp)
    || proof.finalHp < 1 || proof.finalHp > 100) return null;
  return value as unknown as PortableProofArtifact['combat'];
}

function isDirectCall(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ['blockReference', 'blockTag', 'data', 'result', 'to'])
    || !ADDRESS.test(String(value.to)) || !/^0x[0-9a-f]+$/i.test(String(value.blockTag))
    || !HEX_BYTES.test(String(value.data)) || !ABI_WORDS.test(String(value.result))
    || !isRecord(value.blockReference)
    || !hasExactKeys(value.blockReference, ['blockHash', 'requireCanonical'])) return false;
  return BYTES32.test(String(value.blockReference.blockHash))
    && value.blockReference.requireCanonical === true;
}

function parseOnchainProof(value: unknown): DirectOnchainSettlementProof | null {
  if (!isRecord(value) || !hasExactKeys(value, ONCHAIN_KEYS)
    || value.verified !== true || value.source !== 'SOMNIA_RPC_ETH_CALL' || value.chainId !== 5031
    || !BYTES32.test(String(value.marketId)) || !BYTES32.test(String(value.blockHash))
    || !/^0x[0-9a-f]+$/i.test(String(value.blockTag)) || !UNSIGNED_DECIMAL.test(String(value.blockNumber))
    || ![value.marketAddress, value.poolAddress, value.moduleAddress, value.settlementAddress,
      value.collateralToken, value.creator].every((entry) => ADDRESS.test(String(entry)))
    || !BYTES32.test(String(value.originVenueId))
    || ![value.oracleQuestionId, value.originOperatorId, value.tradingStart, value.expiry,
      value.yesId, value.noId, value.marketKey, value.nonce, value.backing,
      value.payoutDenominator, value.settlementFeeBpsTimes1k]
      .every((entry) => UNSIGNED_DECIMAL.test(String(entry)))
    || value.finalized !== true || typeof value.voided !== 'boolean'
    || (value.winningOutcome !== 0 && value.winningOutcome !== 1 && value.winningOutcome !== null)
    || !Array.isArray(value.payoutNumerators) || value.payoutNumerators.length !== 2
    || !value.payoutNumerators.every((entry) => UNSIGNED_DECIMAL.test(String(entry)))
    || !isRecord(value.calls) || !hasExactKeys(value.calls, ['moduleMarket', 'settlementRecord'])
    || !isDirectCall(value.calls.moduleMarket) || !isDirectCall(value.calls.settlementRecord)) return null;
  return value as unknown as DirectOnchainSettlementProof;
}

export function isStrictReplayProof(value: unknown): value is ReplayProof {
  return parseReplayProof(value) !== null;
}

export function isStrictReplayCombatProof(
  value: unknown,
  actions: JudgeCombatAction[],
  canonicalTranscript: string,
): value is ReplayCombatProof {
  return parseCombat({ proof: value, actions, canonicalTranscript }) !== null;
}

export function isStrictOnchainSettlementProof(value: unknown): value is DirectOnchainSettlementProof {
  return parseOnchainProof(value) !== null;
}

function expectedIndependentRpc(proof: DirectOnchainSettlementProof) {
  return {
    rpc: SOMNIA_MAINNET_RPC,
    chainIdRequest: { method: 'eth_chainId', params: [] },
    blockRequest: { method: 'eth_getBlockByHash', params: [proof.blockHash, false] },
    moduleMarketRequest: {
      method: 'eth_call',
      params: [{ to: proof.calls.moduleMarket.to, data: proof.calls.moduleMarket.data }, proof.calls.moduleMarket.blockReference],
      expectedResult: proof.calls.moduleMarket.result,
    },
    settlementRecordRequest: {
      method: 'eth_call',
      params: [{ to: proof.calls.settlementRecord.to, data: proof.calls.settlementRecord.data }, proof.calls.settlementRecord.blockReference],
      expectedResult: proof.calls.settlementRecord.result,
    },
    expectedBlock: { number: proof.blockTag, hash: proof.blockHash },
  };
}

function expectedExplorer(proof: DirectOnchainSettlementProof) {
  return {
    block: `${VERIFIED_PROOF_EXPLORER}/block/${encodeURIComponent(proof.blockNumber)}`,
    binaryModule: `${VERIFIED_PROOF_EXPLORER}/address/${encodeURIComponent(proof.moduleAddress)}`,
    binarySettlement: `${VERIFIED_PROOF_EXPLORER}/address/${encodeURIComponent(proof.settlementAddress)}`,
  };
}

function expectedResult(replayProof: ReplayProof, onchainProof: PortableVerifiedRunSettlementProof) {
  return replayProof.lockedDirection === (onchainProof.winningOutcome === 0 ? 'UP' : 'DOWN')
    ? 'BLESSED' as const
    : 'CURSED' as const;
}

export function parseVerifiedProofArtifact(text: string): ProofParseResult {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength === 0) return { ok: false, error: 'Paste or choose a proof JSON file first.' };
  if (byteLength > VERIFIED_PROOF_MAX_BYTES) {
    return { ok: false, error: `Proof exceeds the ${VERIFIED_PROOF_MAX_BYTES / 1024} KiB safety limit.` };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)
    || value.schema !== VERIFIED_PROOF_SCHEMA || value.app !== VERIFIED_PROOF_APP
    || !isBoundedString(value.generatedAt, 40) || Number.isNaN(Date.parse(String(value.generatedAt)))) {
    return { ok: false, error: 'This is not a strict Market Dungeon verified-run v2 artifact.' };
  }

  const replayProof = parseReplayProof(value.replayProof);
  const combat = parseCombat(value.combat);
  const parsedOnchainProof = parseOnchainProof(value.onchainProof);
  if (!replayProof || !combat || !parsedOnchainProof) {
    return { ok: false, error: 'The proof structure is incomplete or contains invalid fields.' };
  }
  if (!isPortableVerifiedRunSettlement(parsedOnchainProof)) {
    return { ok: false, error: 'Portable Judge proofs require a finalized non-void settlement with a binary outcome.' };
  }
  const onchainProof = parsedOnchainProof;

  if (!isReplayLockAttestation(value.lockAttestation)
    || !replayLockAttestationMatchesProof(value.lockAttestation, replayProof)) {
    return { ok: false, error: 'The server-authenticated lock receipt is missing or does not bind this replay.' };
  }

  if (!isRecord(value.summary)
    || !hasExactKeys(value.summary, ['lockedDirection', 'market', 'marketId', 'result', 'winningOutcome'])
    || value.summary.market !== `BTC ${eventContractIntervalLabel(replayProof.intervalSec)}`
    || value.summary.marketId !== replayProof.marketId
    || value.summary.lockedDirection !== replayProof.lockedDirection
    || value.summary.winningOutcome !== (replayProof.committedOutcome === 0 ? 'UP' : 'DOWN')
    || value.summary.result !== expectedResult(replayProof, onchainProof)) {
    return { ok: false, error: 'The human-readable summary does not match the cryptographic proof.' };
  }

  if (!sameJson(value.independentRpcVerification, expectedIndependentRpc(onchainProof))
    || !sameJson(value.explorer, expectedExplorer(onchainProof))
    || !sameJson(value.verificationSteps, VERIFICATION_STEPS)) {
    return { ok: false, error: 'The verification instructions or fixed public endpoints were changed.' };
  }

  return {
    ok: true,
    artifact: value as unknown as PortableProofArtifact,
  };
}

async function sha256Hex(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function fetchReplayLockPublicKey(): Promise<unknown> {
  const response = await fetch(VERIFIED_PROOF_PUBLIC_KEY_ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Judge lock-attestation key unavailable');
  return response.json();
}

function settlementMarket(artifact: PortableProofArtifact) {
  const replay = artifact.replayProof;
  const proof = artifact.onchainProof;
  return {
    marketId: replay.marketId,
    marketAddress: proof.marketAddress,
    poolAddress: proof.poolAddress,
    collateral: proof.collateralToken,
    oracleQuestionId: replay.oracleQuestionId,
    operatorId: replay.operatorId,
    venueId: replay.venueId,
    creator: replay.creator,
    tradingStart: replay.tradingStart,
    expiry: replay.marketExpiry,
    yesTokenId: proof.yesId,
    noTokenId: proof.noId,
    finalized: proof.finalized,
    voided: proof.voided,
    winningOutcome: proof.winningOutcome,
    payoutNumerators: proof.payoutNumerators,
    payoutDenominator: proof.payoutDenominator,
  };
}

function overallStatus(checks: ProofVerificationCheck[]): ProofVerificationStatus {
  if (checks.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.status === 'NOT PROVABLE')) return 'NOT PROVABLE';
  return 'PASS';
}

export async function verifyProofArtifact(
  text: string,
  rpc?: SettlementProofRpc,
  publicKeyProvider: ReplayLockPublicKeyProvider = fetchReplayLockPublicKey,
): Promise<ProofVerificationResult> {
  const parsed = parseVerifiedProofArtifact(text);
  if (!parsed.ok) {
    return {
      status: 'FAIL',
      checks: [{ id: 'artifact', label: 'Proof file', status: 'FAIL', detail: parsed.error }],
    };
  }

  const { artifact } = parsed;
  const replay = artifact.replayProof;
  const combatReplay = replayJudgeCombat(replay.gameSeed, artifact.combat.actions);
  const canonicalCommitment = canonicalReplayProof(replay);
  const canonicalCombat = canonicalJudgeActionLog(replay.gameSeed, artifact.combat.actions);
  const [commitmentDigest, combatDigest] = await Promise.all([
    sha256Hex(canonicalCommitment),
    sha256Hex(canonicalCombat),
  ]);

  const commitmentPasses = canonicalCommitment === replay.canonical
    && commitmentDigest.toLowerCase() === replay.commitment.toLowerCase()
    && replay.marketId.toLowerCase() === artifact.onchainProof.marketId.toLowerCase()
    && replay.committedOutcome === artifact.onchainProof.winningOutcome;
  const combatPasses = canonicalCombat === artifact.combat.canonicalTranscript
    && combatDigest.toLowerCase() === artifact.combat.proof.transcriptDigest.toLowerCase()
    && combatReplay.verified
    && combatReplay.steps === artifact.combat.proof.steps
    && combatReplay.guardDefeated === artifact.combat.proof.guardDefeated
    && combatReplay.bossDefeated === artifact.combat.proof.bossDefeated
    && combatReplay.playerSurvived === artifact.combat.proof.playerSurvived
    && combatReplay.finalHp === artifact.combat.proof.finalHp;
  const market = settlementMarket(artifact);
  let settlementPasses = false;
  try {
    settlementPasses = directSettlementProofMatchesMarket(artifact.onchainProof, market);
  } catch {
    settlementPasses = false;
  }

  const checks: ProofVerificationCheck[] = [
    {
      id: 'artifact',
      label: 'Proof file',
      status: 'PASS',
      detail: 'Strict verified-run v2 structure, fixed app, RPC instructions, and explorer links match.',
    },
    {
      id: 'commitment',
      label: 'Commitment consistency',
      status: commitmentPasses ? 'PASS' : 'FAIL',
      detail: commitmentPasses
        ? 'The direction, selected market, and outcome reproduce the salted commitment.'
        : 'The choice, market, outcome, canonical input, or commitment digest was changed.',
    },
    {
      id: 'combat',
      label: 'Combat transcript',
      status: combatPasses ? 'PASS' : 'FAIL',
      detail: combatPasses
        ? 'The deterministic replay defeats both enemies and reproduces the combat digest.'
        : 'The action log, combat result, or transcript digest does not reproduce.',
    },
    {
      id: 'settlement',
      label: 'Settlement binding',
      status: settlementPasses ? 'PASS' : 'FAIL',
      detail: settlementPasses
        ? 'The raw ABI results bind the committed market to canonical dreamDEX contracts and payout.'
        : 'The market, contracts, calldata, ABI results, or payout binding does not match.',
    },
  ];

  if (overallStatus(checks) === 'FAIL') return { status: 'FAIL', checks };

  let trustedKey: ReplayLockPublicKey | null = null;
  try {
    const candidate = await publicKeyProvider();
    if (isReplayLockPublicKey(candidate)) trustedKey = candidate;
  } catch {
    trustedKey = null;
  }
  let attestationStatus: ProofVerificationStatus = 'NOT PROVABLE';
  let attestationDetail = 'The fixed Market Dungeon public-key endpoint was unavailable or returned no usable key.';
  if (trustedKey) {
    const trustedIdentityMatches = trustedKey.keyId === artifact.lockAttestation.keyId
      && trustedKey.environment === artifact.lockAttestation.environment;
    if (!trustedIdentityMatches) {
      attestationDetail = 'Market Dungeon currently publishes a different lock key or environment. This receipt needs its historical public key before it can be verified.';
    } else {
      const signaturePasses = await verifyReplayLockAttestation(artifact.lockAttestation, trustedKey);
      attestationStatus = signaturePasses ? 'PASS' : 'FAIL';
      attestationDetail = signaturePasses
        ? 'A server-authenticated Ed25519 receipt binds this commitment, direction, and lock-window timestamps. It is not an external timestamp.'
        : 'The lock receipt signature is invalid under the matching Market Dungeon public key.';
    }
  }
  checks.splice(2, 0, {
    id: 'attestation',
    label: 'Server lock receipt',
    status: attestationStatus,
    detail: attestationDetail,
  });
  if (attestationStatus === 'FAIL') return { status: 'FAIL', checks };

  const rpcOutcome = await directSettlementProofRpcOutcome(artifact.onchainProof, market, rpc);
  checks.push({
    id: 'rpc',
    label: 'Live Somnia re-fetch',
    status: rpcOutcome.status,
    detail: rpcOutcome.reason,
  });

  return {
    status: overallStatus(checks),
    checks,
    summary: {
      market: artifact.summary.market,
      result: artifact.summary.result,
      lockedDirection: artifact.summary.lockedDirection,
      winningOutcome: artifact.onchainProof.winningOutcome === 0 ? 'UP' : 'DOWN',
      marketId: artifact.replayProof.marketId,
      blockNumber: artifact.onchainProof.blockNumber,
      blockHash: artifact.onchainProof.blockHash,
    },
  };
}
