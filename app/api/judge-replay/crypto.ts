import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';

import { canonicalJudgeActionLog, type JudgeCombatAction } from '../../judge-combat.ts';
import {
  MAX_REPLAY_MARKET_AGE_SECONDS,
  REPLAY_COMMITMENT_DOMAIN,
  REPLAY_LOCK_ATTESTATION_SCHEMA,
  REPLAY_LOCK_ATTESTATION_DOMAIN,
  REPLAY_LOCK_PUBLIC_KEY_SCHEMA,
  canonicalReplayProof,
  canonicalReplayLockAttestation,
  replayMarketProvenanceFromMarket,
  type ReplayDirection,
  type ReplayLockAttestation,
  type ReplayLockPublicKey,
  type ReplayMarketProvenance,
} from '../../replay-proof.ts';

export type { ReplayDirection } from '../../replay-proof.ts';

export type ReplayClaims = {
  version: 2;
  purpose: 'judge-replay';
  environment: string;
  marketId: string;
  winningOutcome: 0 | 1;
  direction: ReplayDirection;
  salt: string;
  gameSeed: string;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
} & ReplayMarketProvenance;

const DOMAIN = REPLAY_COMMITMENT_DOMAIN;
const TOKEN_VERSION = 'v2';
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
const ED25519_PKCS8_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ATTESTATION_KDF_SALT = Buffer.from('market-dungeon/judge-lock-attestation/hkdf-sha256/v1', 'utf8');

function replayEnvironment() {
  return process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
}

function replayKey() {
  const encoded = process.env.JUDGE_REPLAY_SEAL_KEY;
  if (!encoded || !/^[0-9a-fA-F]{64}$/.test(encoded)) {
    throw new Error('Judge Replay sealing is not configured');
  }
  return Buffer.from(encoded, 'hex');
}

function aad(environment: string) {
  return Buffer.from(`${DOMAIN}\nenvironment=${environment}`, 'utf8');
}

export function canonicalReplay(claims: ReplayClaims) {
  return canonicalReplayProof({
    marketId: claims.marketId,
    committedOutcome: claims.winningOutcome,
    lockedDirection: claims.direction,
    gameSeed: claims.gameSeed,
    issuedAt: claims.issuedAt,
    revealAfter: claims.revealAfter,
    expiresAt: claims.expiresAt,
    salt: claims.salt,
    marketType: claims.marketType,
    asset: claims.asset,
    intervalSec: claims.intervalSec,
    question: claims.question,
    tradingStart: claims.tradingStart,
    marketExpiry: claims.marketExpiry,
    marketStatus: claims.marketStatus,
    tradeCount: claims.tradeCount,
    lastTradeAt: claims.lastTradeAt,
    operatorId: claims.operatorId,
    venueId: claims.venueId,
    marketContext: claims.marketContext,
    oracleQuestionId: claims.oracleQuestionId,
    creator: claims.creator,
    createdByTx: claims.createdByTx,
  });
}

export function replayCommitment(claims: ReplayClaims) {
  return `0x${createHash('sha256').update(canonicalReplay(claims), 'utf8').digest('hex')}`;
}

function replayLockAttestationKey() {
  const environment = replayEnvironment();
  const seed = Buffer.from(hkdfSync(
    'sha256',
    replayKey(),
    ATTESTATION_KDF_SALT,
    Buffer.from(`${REPLAY_LOCK_ATTESTATION_DOMAIN}\nenvironment=${environment}`, 'utf8'),
    32,
  ));
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const encodedPublicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicKeyDer = Buffer.isBuffer(encodedPublicKey) ? encodedPublicKey : Buffer.from(encodedPublicKey);
  if (!publicKeyDer.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
    || publicKeyDer.length !== ED25519_SPKI_PREFIX.length + 32) {
    throw new Error('Unexpected Ed25519 public key encoding');
  }
  const publicKey = publicKeyDer.subarray(ED25519_SPKI_PREFIX.length);
  const keyId = `ed25519:${createHash('sha256').update(publicKey).digest('hex')}`;
  return { environment, keyId, privateKey, publicKey };
}

export function replayLockAttestation(claims: ReplayClaims): ReplayLockAttestation {
  const { environment, keyId, privateKey } = replayLockAttestationKey();
  const unsigned: Omit<ReplayLockAttestation, 'signature'> = {
    schema: REPLAY_LOCK_ATTESTATION_SCHEMA,
    algorithm: 'Ed25519',
    keyId,
    environment,
    commitment: replayCommitment(claims),
    lockedDirection: claims.direction,
    issuedAt: claims.issuedAt,
    revealAfter: claims.revealAfter,
    expiresAt: claims.expiresAt,
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalReplayLockAttestation(unsigned), 'utf8'), privateKey).toString('base64url'),
  };
}

export function replayLockAttestationPublicKey(): ReplayLockPublicKey {
  const { environment, keyId, publicKey } = replayLockAttestationKey();
  return {
    schema: REPLAY_LOCK_PUBLIC_KEY_SCHEMA,
    algorithm: 'Ed25519',
    keyId,
    environment,
    publicKey: publicKey.toString('base64url'),
  };
}

export function combatTranscriptDigest(gameSeed: string, actions: JudgeCombatAction[]) {
  return `0x${createHash('sha256').update(canonicalJudgeActionLog(gameSeed, actions), 'utf8').digest('hex')}`;
}

export function newReplayClaims(input: {
  marketId: string;
  winningOutcome: 0 | 1;
  direction: ReplayDirection;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
} & ReplayMarketProvenance): ReplayClaims {
  const provenance = replayMarketProvenanceFromMarket(input as unknown as Record<string, unknown>);
  if (!provenance
    || provenance.marketExpiry > input.issuedAt
    || input.issuedAt - provenance.marketExpiry > MAX_REPLAY_MARKET_AGE_SECONDS) {
    throw new Error('Replay market provenance is invalid or stale');
  }
  return {
    version: 2,
    purpose: 'judge-replay',
    environment: replayEnvironment(),
    marketId: input.marketId.toLowerCase(),
    winningOutcome: input.winningOutcome,
    direction: input.direction,
    salt: randomBytes(32).toString('base64url'),
    gameSeed: randomBytes(32).toString('base64url'),
    issuedAt: input.issuedAt,
    revealAfter: input.revealAfter,
    expiresAt: input.expiresAt,
    ...provenance,
  };
}

export function sealReplay(claims: ReplayClaims) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', replayKey(), iv);
  cipher.setAAD(aad(claims.environment));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

function validClaims(value: unknown): value is ReplayClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Partial<ReplayClaims>;
  const provenance = replayMarketProvenanceFromMarket(value as Record<string, unknown>);
  return claims.version === 2
    && claims.purpose === 'judge-replay'
    && claims.environment === replayEnvironment()
    && typeof claims.marketId === 'string' && MARKET_ID.test(claims.marketId)
    && (claims.winningOutcome === 0 || claims.winningOutcome === 1)
    && (claims.direction === 'UP' || claims.direction === 'DOWN')
    && typeof claims.salt === 'string' && BASE64URL_32_BYTES.test(claims.salt)
    && typeof claims.gameSeed === 'string' && BASE64URL_32_BYTES.test(claims.gameSeed)
    && Number.isSafeInteger(claims.issuedAt)
    && Number.isSafeInteger(claims.revealAfter)
    && Number.isSafeInteger(claims.expiresAt)
    && claims.issuedAt! <= claims.revealAfter!
    && claims.revealAfter! < claims.expiresAt!
    && provenance !== null
    && provenance.marketExpiry <= claims.issuedAt!
    && claims.issuedAt! - provenance.marketExpiry <= MAX_REPLAY_MARKET_AGE_SECONDS;
}

function decodeBase64url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid replay seal');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('Invalid replay seal');
  return decoded;
}

export function openReplay(seal: string) {
  if (seal.length > 4096) throw new Error('Invalid replay seal');
  const parts = seal.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) throw new Error('Invalid replay seal');
  const iv = decodeBase64url(parts[1]);
  const ciphertext = decodeBase64url(parts[2]);
  const tag = decodeBase64url(parts[3]);
  if (iv.length !== 12 || ciphertext.length < 32 || tag.length !== 16) throw new Error('Invalid replay seal');

  const environment = replayEnvironment();
  const decipher = createDecipheriv('aes-256-gcm', replayKey(), iv);
  decipher.setAAD(aad(environment));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const claims = JSON.parse(plaintext) as unknown;
  if (!validClaims(claims)) throw new Error('Invalid replay seal');
  return claims;
}

export function replayTimeStatus(claims: Pick<ReplayClaims, 'revealAfter' | 'expiresAt'>, now: number) {
  if (now >= claims.expiresAt) return 'expired' as const;
  if (now < claims.revealAfter) return 'sealed' as const;
  return 'revealable' as const;
}
