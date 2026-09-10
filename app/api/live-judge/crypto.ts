import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { ReplayConfigurationError } from '../judge-replay/crypto.ts';
import {
  LIVE_ATTESTATION_SCHEMA, LIVE_JUDGE, LIVE_KEY_SCHEMA, canonicalLiveJudgeAttestation, isLiveJudgeLock,
  type LiveJudgeLock, type LiveJudgeLockAttestation, type LiveJudgePublicKey,
} from '../../live-judge-proof.ts';

const DOMAIN = 'market-dungeon/live-judge-seal/v1';
function environment() {
  const value = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(value)) throw new ReplayConfigurationError();
  return value;
}
function rootKey() {
  const value = process.env.JUDGE_REPLAY_SEAL_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new ReplayConfigurationError();
  return Buffer.from(value, 'hex');
}
function derivedKey(purpose: 'seal' | 'attestation') {
  return Buffer.from(hkdfSync('sha256', rootKey(), Buffer.from(DOMAIN),
    Buffer.from(`${purpose}\nenvironment=${environment()}\nprofileId=${LIVE_JUDGE.profileId}\nchainId=${LIVE_JUDGE.chainId}`), 32));
}
function signingKey() {
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), derivedKey('attestation')]), format: 'der', type: 'pkcs8' });
  const der = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicKey = Buffer.from(der).subarray(-32);
  return { privateKey, publicKey, keyId: `ed25519:${createHash('sha256').update(publicKey).digest('hex')}` };
}
export function liveJudgePublicKey(): LiveJudgePublicKey {
  const key = signingKey();
  return { schema: LIVE_KEY_SCHEMA, profileId: LIVE_JUDGE.profileId, chainId: LIVE_JUDGE.chainId,
    algorithm: 'Ed25519', environment: environment(), keyId: key.keyId, publicKey: key.publicKey.toString('base64url') };
}
export function attestLiveJudgeLock(lock: LiveJudgeLock): LiveJudgeLockAttestation {
  if (!isLiveJudgeLock(lock)) throw new Error('Invalid live Judge lock');
  const key = signingKey();
  const unsigned = { schema: LIVE_ATTESTATION_SCHEMA, algorithm: 'Ed25519', environment: environment(), keyId: key.keyId } as const;
  return { ...unsigned, signature: sign(null, Buffer.from(canonicalLiveJudgeAttestation(lock, unsigned)), key.privateKey).toString('base64url') };
}
export function sealLiveJudgeLock(lock: LiveJudgeLock) {
  if (!isLiveJudgeLock(lock)) throw new Error('Invalid live Judge lock');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivedKey('seal'), iv);
  cipher.setAAD(Buffer.from(`${DOMAIN}\nenvironment=${environment()}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(lock), 'utf8'), cipher.final()]);
  return ['live1', iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}
export function openLiveJudgeLock(seal: string): LiveJudgeLock {
  if (typeof seal !== 'string' || seal.length > 16_384) throw new Error('Invalid live Judge seal');
  const parts = seal.split('.');
  if (parts.length !== 4 || parts[0] !== 'live1') throw new Error('Invalid live Judge seal');
  const decoded = parts.slice(1).map(value => {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid live Judge seal');
    const result = Buffer.from(value, 'base64url');
    if (result.toString('base64url') !== value) throw new Error('Invalid live Judge seal');
    return result;
  });
  const [iv, ciphertext, tag] = decoded;
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 32) throw new Error('Invalid live Judge seal');
  const decipher = createDecipheriv('aes-256-gcm', derivedKey('seal'), iv);
  decipher.setAAD(Buffer.from(`${DOMAIN}\nenvironment=${environment()}`));
  decipher.setAuthTag(tag);
  const lock = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as unknown;
  if (!isLiveJudgeLock(lock)) throw new Error('Invalid live Judge seal');
  return lock;
}
