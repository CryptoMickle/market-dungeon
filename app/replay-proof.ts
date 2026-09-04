export type ReplayDirection = 'UP' | 'DOWN';

export const REPLAY_MARKET_QUESTION = 'BTC closes at or above its opening price';
export const MAX_REPLAY_MARKET_AGE_SECONDS = 7 * 24 * 60 * 60;

export type ReplayMarketProvenance = {
  marketType: 'BINARY';
  asset: 'BTC';
  intervalSec: 300 | 900;
  question: typeof REPLAY_MARKET_QUESTION;
  tradingStart: number;
  marketExpiry: number;
  marketStatus: 'Finalized';
  tradeCount: number;
  lastTradeAt: number;
  operatorId: number;
  venueId: string;
  marketContext: string;
  oracleQuestionId: string;
  creator: string;
  createdByTx: string;
};

export type ReplayCommitmentPayload = {
  marketId: string;
  committedOutcome: 0 | 1;
  lockedDirection: ReplayDirection;
  gameSeed: string;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
  salt: string;
} & ReplayMarketProvenance;

export type ReplayProof = ReplayCommitmentPayload & {
  verified: boolean;
  algorithm: 'SHA-256';
  commitment: string;
  canonical: string;
};

export type ReplayCombatProof = {
  verified: boolean;
  ruleset: 'market-dungeon/judge-combat/v1';
  transcriptDigest: string;
  steps: number;
  guardDefeated: boolean;
  bossDefeated: boolean;
  playerSurvived: boolean;
  finalHp: number;
};

export const REPLAY_COMMITMENT_DOMAIN = 'market-dungeon/judge-replay/v2';
export const REPLAY_LOCK_ATTESTATION_DOMAIN = 'market-dungeon/judge-lock-attestation/v1';
export const REPLAY_LOCK_ATTESTATION_SCHEMA = 'market-dungeon/judge-lock-attestation/v1';
export const REPLAY_LOCK_PUBLIC_KEY_SCHEMA = 'market-dungeon/judge-lock-attestation-key/v1';
export const REPLAY_LOCK_PUBLIC_KEY_ENDPOINT = '/api/judge-replay/public-key';

export type ReplayLockAttestation = {
  schema: typeof REPLAY_LOCK_ATTESTATION_SCHEMA;
  algorithm: 'Ed25519';
  keyId: string;
  environment: string;
  commitment: string;
  lockedDirection: ReplayDirection;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
  signature: string;
};

export type ReplayLockPublicKey = {
  schema: typeof REPLAY_LOCK_PUBLIC_KEY_SCHEMA;
  algorithm: 'Ed25519';
  keyId: string;
  environment: string;
  publicKey: string;
};

const MARKET_ID = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/;
const UNSIGNED_DECIMAL = /^\d+$/;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
const ED25519_KEY_ID = /^ed25519:[0-9a-f]{64}$/;
const ED25519_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const ED25519_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const ENVIRONMENT = /^[a-z][a-z0-9_-]{0,31}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isReplayLockAttestation(value: unknown): value is ReplayLockAttestation {
  if (!isRecord(value) || !hasExactKeys(value, [
    'algorithm', 'commitment', 'environment', 'expiresAt', 'issuedAt', 'keyId',
    'lockedDirection', 'revealAfter', 'schema', 'signature',
  ])) return false;
  return value.schema === REPLAY_LOCK_ATTESTATION_SCHEMA
    && value.algorithm === 'Ed25519'
    && typeof value.keyId === 'string' && ED25519_KEY_ID.test(value.keyId)
    && typeof value.environment === 'string' && ENVIRONMENT.test(value.environment)
    && typeof value.commitment === 'string' && BYTES32.test(value.commitment)
    && (value.lockedDirection === 'UP' || value.lockedDirection === 'DOWN')
    && isPositiveSafeInteger(value.issuedAt)
    && isPositiveSafeInteger(value.revealAfter)
    && isPositiveSafeInteger(value.expiresAt)
    && value.issuedAt < value.revealAfter
    && value.revealAfter < value.expiresAt
    && typeof value.signature === 'string' && ED25519_SIGNATURE.test(value.signature);
}

export function isReplayLockPublicKey(value: unknown): value is ReplayLockPublicKey {
  if (!isRecord(value) || !hasExactKeys(value, [
    'algorithm', 'environment', 'keyId', 'publicKey', 'schema',
  ])) return false;
  return value.schema === REPLAY_LOCK_PUBLIC_KEY_SCHEMA
    && value.algorithm === 'Ed25519'
    && typeof value.keyId === 'string' && ED25519_KEY_ID.test(value.keyId)
    && typeof value.environment === 'string' && ENVIRONMENT.test(value.environment)
    && typeof value.publicKey === 'string' && ED25519_PUBLIC_KEY.test(value.publicKey);
}

export function canonicalReplayLockAttestation(
  attestation: Omit<ReplayLockAttestation, 'signature'>,
) {
  return [
    REPLAY_LOCK_ATTESTATION_DOMAIN,
    `environment=${attestation.environment}`,
    `keyId=${attestation.keyId}`,
    `commitment=${attestation.commitment.toLowerCase()}`,
    `direction=${attestation.lockedDirection}`,
    `issuedAt=${attestation.issuedAt}`,
    `revealAfter=${attestation.revealAfter}`,
    `expiresAt=${attestation.expiresAt}`,
  ].join('\n');
}

export function replayLockAttestationMatchesProof(
  attestation: ReplayLockAttestation,
  proof: Pick<ReplayCommitmentPayload, 'lockedDirection' | 'issuedAt' | 'revealAfter' | 'expiresAt'> & { commitment: string },
) {
  return attestation.commitment.toLowerCase() === proof.commitment.toLowerCase()
    && attestation.lockedDirection === proof.lockedDirection
    && attestation.issuedAt === proof.issuedAt
    && attestation.revealAfter === proof.revealAfter
    && attestation.expiresAt === proof.expiresAt;
}

export function sameReplayLockAttestation(
  left: ReplayLockAttestation | undefined,
  right: ReplayLockAttestation | undefined,
) {
  if (!left || !right) return false;
  return left.schema === right.schema
    && left.algorithm === right.algorithm
    && left.keyId === right.keyId
    && left.environment === right.environment
    && left.commitment.toLowerCase() === right.commitment.toLowerCase()
    && left.lockedDirection === right.lockedDirection
    && left.issuedAt === right.issuedAt
    && left.revealAfter === right.revealAfter
    && left.expiresAt === right.expiresAt
    && left.signature === right.signature;
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const decoded = globalThis.atob(`${base64}${padding}`);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function verifyReplayLockAttestation(
  attestation: ReplayLockAttestation,
  trustedKey: ReplayLockPublicKey,
) {
  if (!isReplayLockAttestation(attestation) || !isReplayLockPublicKey(trustedKey)
    || attestation.keyId !== trustedKey.keyId
    || attestation.environment !== trustedKey.environment) return false;
  try {
    const publicKey = decodeBase64Url(trustedKey.publicKey);
    const signature = decodeBase64Url(attestation.signature);
    if (publicKey.byteLength !== 32 || signature.byteLength !== 64) return false;
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const canonical = canonicalReplayLockAttestation(attestation);
    return globalThis.crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      new TextEncoder().encode(canonical),
    );
  } catch {
    return false;
  }
}

export function replayMarketProvenanceFromMarket(market: Record<string, unknown>): ReplayMarketProvenance | null {
  const marketType = String(market.marketType ?? '');
  const asset = String(market.asset ?? '');
  const intervalSec = Number(market.intervalSec);
  const question = String(market.question ?? '');
  const tradingStart = Number(market.tradingStart);
  const marketExpiry = Number(market.marketExpiry ?? market.expiry);
  const marketStatus = String(market.marketStatus ?? market.status ?? market.clobStatus ?? '');
  const tradeCount = Number(market.tradeCount);
  const lastTradeAt = Number(market.lastTradeAt);
  const operatorId = Number(market.operatorId);
  const venueId = String(market.venueId ?? '').toLowerCase();
  const marketContext = String(market.marketContext ?? market.context ?? '').toLowerCase();
  const oracleQuestionId = String(market.oracleQuestionId ?? '');
  const creator = String(market.creator ?? '').toLowerCase();
  const createdByTx = String(market.createdByTx ?? '').toLowerCase();

  if (marketType !== 'BINARY' || asset !== 'BTC'
    || (intervalSec !== 300 && intervalSec !== 900)
    || question !== REPLAY_MARKET_QUESTION
    || !Number.isSafeInteger(tradingStart) || tradingStart <= 0
    || !Number.isSafeInteger(marketExpiry) || marketExpiry - tradingStart !== intervalSec
    || marketStatus !== 'Finalized'
    || !Number.isSafeInteger(tradeCount) || tradeCount <= 0
    || !Number.isSafeInteger(lastTradeAt) || lastTradeAt < tradingStart || lastTradeAt > marketExpiry
    || !Number.isSafeInteger(operatorId) || operatorId < 0
    || !MARKET_ID.test(venueId) || !HEX_BYTES.test(marketContext)
    || !UNSIGNED_DECIMAL.test(oracleQuestionId)
    || !ADDRESS.test(creator) || !MARKET_ID.test(createdByTx)) {
    return null;
  }

  return {
    marketType,
    asset,
    intervalSec,
    question,
    tradingStart,
    marketExpiry,
    marketStatus,
    tradeCount,
    lastTradeAt,
    operatorId,
    venueId,
    marketContext,
    oracleQuestionId,
    creator,
    createdByTx,
  };
}

export function replayMarketProvenanceMatches(
  proof: ReplayMarketProvenance,
  market: Record<string, unknown>,
) {
  const left = replayMarketProvenanceFromMarket(proof as unknown as Record<string, unknown>);
  const right = replayMarketProvenanceFromMarket(market);
  if (!left || !right) return false;
  return (Object.keys(left) as Array<keyof ReplayMarketProvenance>)
    .every((key) => left[key] === right[key]);
}

export function secondsUntilReplayReveal(revealAfter: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof revealAfter !== 'number' || !Number.isSafeInteger(revealAfter) || !Number.isFinite(nowSeconds)) return 0;
  return Math.max(0, revealAfter - Math.floor(nowSeconds));
}

export function canonicalReplayProof(proof: ReplayCommitmentPayload) {
  return [
    REPLAY_COMMITMENT_DOMAIN,
    `marketId=${proof.marketId.toLowerCase()}`,
    `marketType=${proof.marketType}`,
    `asset=${proof.asset}`,
    `intervalSec=${proof.intervalSec}`,
    `question=${proof.question}`,
    `tradingStart=${proof.tradingStart}`,
    `marketExpiry=${proof.marketExpiry}`,
    `marketStatus=${proof.marketStatus}`,
    `tradeCount=${proof.tradeCount}`,
    `lastTradeAt=${proof.lastTradeAt}`,
    `operatorId=${proof.operatorId}`,
    `venueId=${proof.venueId.toLowerCase()}`,
    `marketContext=${proof.marketContext.toLowerCase()}`,
    `oracleQuestionId=${proof.oracleQuestionId}`,
    `creator=${proof.creator.toLowerCase()}`,
    `createdByTx=${proof.createdByTx.toLowerCase()}`,
    `outcome=${proof.committedOutcome}`,
    `direction=${proof.lockedDirection}`,
    `gameSeed=${proof.gameSeed}`,
    `issuedAt=${proof.issuedAt}`,
    `revealAfter=${proof.revealAfter}`,
    `expiresAt=${proof.expiresAt}`,
    `salt=${proof.salt}`,
  ].join('\n');
}
