import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { canonicalReplayProof, type ReplayDirection } from '../../replay-proof.ts';

export type { ReplayDirection } from '../../replay-proof.ts';

export type ReplayClaims = {
  version: 1;
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
};

const DOMAIN = 'market-dungeon/judge-replay/v1';
const TOKEN_VERSION = 'v1';
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

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
  });
}

export function replayCommitment(claims: ReplayClaims) {
  return `0x${createHash('sha256').update(canonicalReplay(claims), 'utf8').digest('hex')}`;
}

export function newReplayClaims(input: {
  marketId: string;
  winningOutcome: 0 | 1;
  direction: ReplayDirection;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
}): ReplayClaims {
  return {
    version: 1,
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
  return claims.version === 1
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
    && claims.revealAfter! < claims.expiresAt!;
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
