import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import { JUDGE_COMBAT_DOMAIN, canonicalJudgeActionLog, replayJudgeCombat, type JudgeCombatAction, type JudgeCombatReplay } from './judge-combat.ts';
import { SHANNON_TESTNET_PROFILE } from './judge-network.ts';
import {
  BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI, directSettlementProofMatchesMarket,
  directSettlementProofRpcOutcome, type DirectOnchainSettlementProof, type DirectSettlementCall,
  type SettlementProofRpc, type SettlementProofRpcOutcome,
} from './onchain-settlement-proof.ts';

export const LIVE_JUDGE = {
  profileId: 'shannon-live-1m', chainId: 50312, intervalSec: 60, minRemainingSeconds: 20,
  claimLifetimeSeconds: 1_800, operatorId: 4,
  venueId: '0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f',
  oracleAdapter: '0x78bc8e82afbe80d1a348a8b81949ea5c4e54cb0e',
  collateral: SHANNON_TESTNET_PROFILE.collateral.toLowerCase(),
  moduleAddress: SHANNON_TESTNET_PROFILE.contracts.binaryModule.toLowerCase(),
  settlementAddress: SHANNON_TESTNET_PROFILE.contracts.binarySettlement.toLowerCase(),
  rpc: SHANNON_TESTNET_PROFILE.rpc, indexer: SHANNON_TESTNET_PROFILE.indexer,
  publicKeyPath: '/api/live-judge/public-key',
} as const;
export const LIVE_LOCK_SCHEMA = 'market-dungeon/live-judge-lock/v1';
export const LIVE_ATTESTATION_SCHEMA = 'market-dungeon/live-judge-attestation/v1';
export const LIVE_KEY_SCHEMA = 'market-dungeon/live-judge-key/v1';
export const LIVE_PROOF_SCHEMA = 'market-dungeon/live-judge-proof/v1';
export const LIVE_MARKET_STATUS_ABI = parseAbi(['function status() view returns (uint8)']);
export const LIVE_ORACLE_QUESTION_ABI = parseAbi(['function questions(uint256) view returns (string symbol,uint256 strike,uint64 expiry,bool exists)']);

export type LiveJudgeMarket = {
  marketId: string; asset: 'BTC' | 'ETH'; intervalSec: 60; question: string; strikeUsd: string; strikeExactUsd: string;
  tradingStart: number; expiry: number; chainId: 50312; operatorId: 4; venueId: string;
  oracleAdapter: string; collateral: string; marketAddress: string; poolAddress: string;
  oracleQuestionId: string; creator: string; yesTokenId: string; noTokenId: string;
};
export type LiveJudgeSnapshot = {
  chainId: 50312; blockNumber: string; blockHash: string; blockTimestamp: number;
  moduleMarket: DirectSettlementCall; marketStatus: DirectSettlementCall; settlementRecord: DirectSettlementCall; oracleQuestion: DirectSettlementCall;
};
export type LiveJudgeLock = {
  schema: typeof LIVE_LOCK_SCHEMA; profileId: typeof LIVE_JUDGE.profileId; chainId: 50312;
  lockId: string; market: LiveJudgeMarket; direction: 'UP' | 'DOWN'; gameSeed: string;
  issuedAt: number; expiresAt: number; snapshot: LiveJudgeSnapshot;
};
export type LiveJudgeLockAttestation = {
  schema: typeof LIVE_ATTESTATION_SCHEMA; algorithm: 'Ed25519'; environment: string; keyId: string; signature: string;
};
export type LiveJudgePublicKey = {
  schema: typeof LIVE_KEY_SCHEMA; profileId: typeof LIVE_JUDGE.profileId; chainId: 50312;
  algorithm: 'Ed25519'; environment: string; keyId: string; publicKey: string;
};
export type LiveJudgeSession = {
  seal: string; gameSeed: string; lock: LiveJudgeLock; lockAttestation: LiveJudgeLockAttestation;
};
export type LiveJudgeStart = LiveJudgeSession;
export type LiveJudgeCombatProof = JudgeCombatReplay & { ruleset: typeof JUDGE_COMBAT_DOMAIN; transcriptDigest: string };
export type LiveJudgeProof = {
  schema: typeof LIVE_PROOF_SCHEMA; lock: LiveJudgeLock; lockAttestation: LiveJudgeLockAttestation;
  actions: JudgeCombatAction[]; combatProof: LiveJudgeCombatProof;
  result: 'BLESSED' | 'CURSED' | 'VOID'; onchainSettlement: DirectOnchainSettlementProof;
};
export type LiveJudgeSettledResponse = {
  state: 'settled'; result: LiveJudgeProof['result']; market: LiveJudgeMarket;
  lockAttestation: LiveJudgeLockAttestation; combatProof: LiveJudgeCombatProof;
  onchainSettlement: DirectOnchainSettlementProof; proof: LiveJudgeProof;
};

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const RANDOM = /^[A-Za-z0-9_-]{43}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hexEqual = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export function liveJudgeOracleStrike(raw: bigint): string {
  const scale = 10n ** 18n;
  const fraction = (raw % scale).toString().padStart(18, '0').replace(/0+$/, '');
  return `${raw / scale}${fraction ? `.${fraction}` : ''}`;
}

export function isLiveJudgeMarket(value: unknown): value is LiveJudgeMarket {
  if (!record(value) || !exactKeys(value, ['marketId', 'asset', 'intervalSec', 'question', 'strikeUsd', 'strikeExactUsd', 'tradingStart', 'expiry', 'chainId', 'operatorId', 'venueId', 'oracleAdapter', 'collateral', 'marketAddress', 'poolAddress', 'oracleQuestionId', 'creator', 'yesTokenId', 'noTokenId'])) return false;
  const m = value as LiveJudgeMarket;
  return HASH.test(m.marketId) && (m.asset === 'BTC' || m.asset === 'ETH') && m.intervalSec === 60
    && m.chainId === LIVE_JUDGE.chainId && m.operatorId === LIVE_JUDGE.operatorId
    && m.venueId === LIVE_JUDGE.venueId && m.oracleAdapter === LIVE_JUDGE.oracleAdapter && m.collateral === LIVE_JUDGE.collateral
    && [m.marketAddress, m.poolAddress, m.creator].every(address => ADDRESS.test(address) && address !== `0x${'0'.repeat(40)}`)
    && [m.oracleQuestionId, m.yesTokenId, m.noTokenId].every(id => DECIMAL.test(id) && id.length <= 78)
    && Number.isSafeInteger(m.tradingStart) && m.tradingStart > 0 && Number.isSafeInteger(m.expiry) && m.expiry - m.tradingStart === 60
    && typeof m.strikeUsd === 'string' && /^\d{1,12}\.\d{2}$/.test(m.strikeUsd) && Number(m.strikeUsd) > 0
    && typeof m.strikeExactUsd === 'string' && /^\d{1,12}(?:\.\d{1,18})?$/.test(m.strikeExactUsd) && Number(m.strikeExactUsd) > 0
    && m.question === `Pricefeed test: will ${m.asset}/USDC's price be at or above ${m.strikeUsd} at unix time ${m.expiry}?`;
}

function moduleMatchesMarket(result: `0x${string}`, market: LiveJudgeMarket) {
  const row = decodeFunctionResult({ abi: MODULE_MARKETS_ABI, functionName: 'markets', data: result });
  return row[0].toString() === market.oracleQuestionId && row[1] === 2
    && hexEqual(row[3], market.collateral) && Number(row[4]) === LIVE_JUDGE.operatorId
    && hexEqual(row[5], LIVE_JUDGE.venueId) && hexEqual(row[6], LIVE_JUDGE.oracleAdapter)
    && hexEqual(row[7], market.creator) && hexEqual(row[8], market.marketAddress) && hexEqual(row[9], market.poolAddress)
    && row[10].toString() === market.yesTokenId && row[11].toString() === market.noTokenId
    && row[10] > 0n && row[11] === row[10] + 1n
    && `0x${(row[10] >> 72n).toString(16).padStart(40, '0')}` === market.poolAddress
    && Number(row[12]) === market.tradingStart && Number(row[13]) === market.expiry;
}

export function liveJudgeSnapshotMatchesMarket(snapshot: LiveJudgeSnapshot, market: LiveJudgeMarket) {
  try {
    if (!record(snapshot) || !exactKeys(snapshot, ['chainId', 'blockNumber', 'blockHash', 'blockTimestamp', 'moduleMarket', 'marketStatus', 'settlementRecord', 'oracleQuestion'])
      || snapshot.chainId !== LIVE_JUDGE.chainId || !DECIMAL.test(snapshot.blockNumber) || !HASH.test(snapshot.blockHash)
      || !Number.isSafeInteger(snapshot.blockTimestamp) || snapshot.blockTimestamp < market.tradingStart || snapshot.blockTimestamp >= market.expiry) return false;
    const tag = `0x${BigInt(snapshot.blockNumber).toString(16)}`;
    const calls = [snapshot.moduleMarket, snapshot.marketStatus, snapshot.settlementRecord, snapshot.oracleQuestion];
    if (calls.some(call => !record(call) || !exactKeys(call, ['to', 'blockTag', 'blockReference', 'data', 'result'])
      || call.blockTag !== tag || !record(call.blockReference) || !exactKeys(call.blockReference, ['blockHash', 'requireCanonical'])
      || call.blockReference.blockHash !== snapshot.blockHash || call.blockReference.requireCanonical !== true
      || typeof call.result !== 'string' || !/^0x(?:[0-9a-f]{64})+$/.test(call.result))) return false;
    if (snapshot.moduleMarket.to !== LIVE_JUDGE.moduleAddress || snapshot.marketStatus.to !== market.marketAddress
      || snapshot.settlementRecord.to !== LIVE_JUDGE.settlementAddress || snapshot.oracleQuestion.to !== LIVE_JUDGE.oracleAdapter
      || snapshot.moduleMarket.data !== encodeFunctionData({ abi: MODULE_MARKETS_ABI, functionName: 'markets', args: [market.marketId as `0x${string}`] })
      || snapshot.marketStatus.data !== encodeFunctionData({ abi: LIVE_MARKET_STATUS_ABI, functionName: 'status' })
      || snapshot.settlementRecord.data !== encodeFunctionData({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', args: [BigInt(market.yesTokenId) >> 8n] })
      || snapshot.oracleQuestion.data !== encodeFunctionData({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', args: [BigInt(market.oracleQuestionId)] })) return false;
    const pending = decodeFunctionResult({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', data: snapshot.settlementRecord.result as `0x${string}` });
    const oracle = decodeFunctionResult({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', data: snapshot.oracleQuestion.result as `0x${string}` });
    return moduleMatchesMarket(snapshot.moduleMarket.result as `0x${string}`, market)
      && decodeFunctionResult({ abi: LIVE_MARKET_STATUS_ABI, functionName: 'status', data: snapshot.marketStatus.result as `0x${string}` }) === 1
      && pending.finalized === false && pending.voided === false && pending.payoutNumerators.length === 0
      && oracle[0] === `${market.asset}/USDC` && oracle[2] === BigInt(market.expiry) && oracle[3] === true
      // The indexer and question display cents. The exact 18-decimal threshold remains in the RPC evidence.
      && oracle[1] / (10n ** 16n) === BigInt(market.strikeUsd.replace('.', ''))
      && liveJudgeOracleStrike(oracle[1]) === market.strikeExactUsd;
  } catch { return false; }
}

export function isLiveJudgeLock(value: unknown): value is LiveJudgeLock {
  if (!record(value) || !exactKeys(value, ['schema', 'profileId', 'chainId', 'lockId', 'market', 'direction', 'gameSeed', 'issuedAt', 'expiresAt', 'snapshot'])) return false;
  const lock = value as LiveJudgeLock;
  return lock.schema === LIVE_LOCK_SCHEMA && lock.profileId === LIVE_JUDGE.profileId && lock.chainId === LIVE_JUDGE.chainId
    && HASH.test(lock.lockId) && isLiveJudgeMarket(lock.market) && (lock.direction === 'UP' || lock.direction === 'DOWN')
    && RANDOM.test(lock.gameSeed) && Number.isSafeInteger(lock.issuedAt) && Number.isSafeInteger(lock.expiresAt)
    && lock.issuedAt >= lock.market.tradingStart && lock.market.expiry - lock.issuedAt >= LIVE_JUDGE.minRemainingSeconds
    && lock.expiresAt === lock.market.expiry + LIVE_JUDGE.claimLifetimeSeconds
    && liveJudgeSnapshotMatchesMarket(lock.snapshot, lock.market)
    && lock.snapshot.blockTimestamp <= lock.issuedAt + 2 && lock.issuedAt - lock.snapshot.blockTimestamp <= 10;
}

export function isLiveJudgeLockAttestation(value: unknown): value is LiveJudgeLockAttestation {
  if (!record(value) || !exactKeys(value, ['schema', 'algorithm', 'environment', 'keyId', 'signature'])) return false;
  return value.schema === LIVE_ATTESTATION_SCHEMA && value.algorithm === 'Ed25519'
    && typeof value.environment === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value.environment)
    && typeof value.keyId === 'string' && /^ed25519:[0-9a-f]{64}$/.test(value.keyId)
    && typeof value.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value.signature);
}
export function isLiveJudgePublicKey(value: unknown): value is LiveJudgePublicKey {
  if (!record(value) || !exactKeys(value, ['schema', 'profileId', 'chainId', 'algorithm', 'environment', 'keyId', 'publicKey'])) return false;
  return value.schema === LIVE_KEY_SCHEMA && value.profileId === LIVE_JUDGE.profileId && value.chainId === LIVE_JUDGE.chainId
    && value.algorithm === 'Ed25519' && typeof value.environment === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value.environment)
    && typeof value.keyId === 'string' && /^ed25519:[0-9a-f]{64}$/.test(value.keyId)
    && typeof value.publicKey === 'string' && RANDOM.test(value.publicKey);
}

// Sorted object keys make receipts independent of JSON property insertion order.
export function canonicalLiveJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalLiveJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalLiveJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function canonicalLiveJudgeAttestation(lock: LiveJudgeLock, attestation: Omit<LiveJudgeLockAttestation, 'signature'>) {
  return canonicalLiveJson({ domain: LIVE_ATTESTATION_SCHEMA, lock, attestation: {
    schema: attestation.schema, algorithm: attestation.algorithm, environment: attestation.environment, keyId: attestation.keyId,
  } });
}
function decodeBase64Url(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}
export async function verifyLiveJudgeLockAttestation(lock: LiveJudgeLock, attestation: LiveJudgeLockAttestation, trustedKey: LiveJudgePublicKey) {
  if (!isLiveJudgeLock(lock) || !isLiveJudgeLockAttestation(attestation) || !isLiveJudgePublicKey(trustedKey)
    || attestation.keyId !== trustedKey.keyId || attestation.environment !== trustedKey.environment) return false;
  try {
    const key = await crypto.subtle.importKey('raw', decodeBase64Url(trustedKey.publicKey), 'Ed25519', false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, decodeBase64Url(attestation.signature), new TextEncoder().encode(canonicalLiveJudgeAttestation(lock, attestation)));
  } catch { return false; }
}

export function liveJudgeResult(direction: 'UP' | 'DOWN', proof: DirectOnchainSettlementProof): LiveJudgeProof['result'] {
  return proof.voided ? 'VOID' : proof.winningOutcome === (direction === 'UP' ? 0 : 1) ? 'BLESSED' : 'CURSED';
}
export function liveJudgeSettlementMatchesLock(settlement: DirectOnchainSettlementProof, lock: LiveJudgeLock) {
  try {
    const market = { ...lock.market, finalized: true, voided: settlement.voided, winningOutcome: settlement.winningOutcome };
    return directSettlementProofMatchesMarket(settlement, market, SHANNON_TESTNET_PROFILE)
      && moduleMatchesMarket(settlement.calls.moduleMarket.result as `0x${string}`, lock.market)
      && BigInt(settlement.blockNumber) >= BigInt(lock.snapshot.blockNumber);
  } catch { return false; }
}

export async function liveJudgeRpc(method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(LIVE_JUDGE.rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (!response.ok || body.error || !Object.hasOwn(body, 'result')) throw new Error('Shannon RPC is unavailable');
  return body.result;
}
export async function verifyLiveJudgeLockSnapshot(lock: LiveJudgeLock, rpc: SettlementProofRpc = liveJudgeRpc): Promise<SettlementProofRpcOutcome> {
  if (!isLiveJudgeLock(lock)) return { status: 'FAIL', reason: 'The live lock structure or pending snapshot is invalid.' };
  try {
    const chainId = await rpc('eth_chainId', []);
    if (chainId !== '0xc488') return { status: 'FAIL', reason: 'The RPC is not Shannon testnet.' };
    const snapshot = lock.snapshot;
    const block = await rpc('eth_getBlockByHash', [snapshot.blockHash, false]) as { hash?: string; number?: string; timestamp?: string } | null;
    if (!block || block.hash !== snapshot.blockHash || BigInt(block.number ?? '-1') !== BigInt(snapshot.blockNumber)
      || Number(BigInt(block.timestamp ?? '-1')) !== snapshot.blockTimestamp) return { status: 'FAIL', reason: 'The live lock snapshot block does not match Shannon.' };
    const calls = [snapshot.moduleMarket, snapshot.marketStatus, snapshot.settlementRecord, snapshot.oracleQuestion];
    const results = await Promise.all(calls.map(call => rpc('eth_call', [{ to: call.to, data: call.data }, call.blockReference])));
    if (results.some((result, i) => result !== calls[i].result)) return { status: 'FAIL', reason: 'Shannon did not confirm the recorded pending market state.' };
    return { status: 'PASS', reason: 'Shannon confirms this market was trading and unresolved in the recorded pre-expiry block. Choice time remains server-attested.' };
  } catch { return { status: 'NOT PROVABLE', reason: 'The live lock snapshot could not be read from Shannon.' }; }
}

export async function verifyLiveJudgeProof(value: unknown, options: { trustedKey?: LiveJudgePublicKey; rpc?: SettlementProofRpc } = {}): Promise<SettlementProofRpcOutcome> {
  try {
    if (!record(value) || !exactKeys(value, ['schema', 'lock', 'lockAttestation', 'actions', 'combatProof', 'result', 'onchainSettlement']) || value.schema !== LIVE_PROOF_SCHEMA) return { status: 'FAIL', reason: 'This is not a supported live Judge proof.' };
    const proof = value as LiveJudgeProof;
    if (!isLiveJudgeLock(proof.lock) || !isLiveJudgeLockAttestation(proof.lockAttestation) || !Array.isArray(proof.actions)
      || !record(proof.combatProof) || !exactKeys(proof.combatProof, ['verified', 'reason', 'steps', 'guardDefeated', 'bossDefeated', 'playerSurvived', 'finalHp', 'remainingPotions', 'ruleset', 'transcriptDigest'])
      || typeof proof.combatProof.transcriptDigest !== 'string' || !HASH.test(proof.combatProof.transcriptDigest)
      || proof.actions.length > 64 || !liveJudgeSettlementMatchesLock(proof.onchainSettlement, proof.lock)
      || proof.result !== liveJudgeResult(proof.lock.direction, proof.onchainSettlement)) return { status: 'FAIL', reason: 'The live proof market, outcome or lock binding is invalid.' };
    const combat = replayJudgeCombat(proof.lock.gameSeed, proof.actions);
    if (!combat.verified || proof.combatProof.ruleset !== JUDGE_COMBAT_DOMAIN
      || Object.entries(combat).some(([key, value]) => proof.combatProof[key as keyof JudgeCombatReplay] !== value)) return { status: 'FAIL', reason: 'The combat transcript does not reproduce the claimed victory.' };
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJudgeActionLog(proof.lock.gameSeed, proof.actions))));
    if (`0x${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}` !== proof.combatProof.transcriptDigest) return { status: 'FAIL', reason: 'The combat transcript digest does not match the recorded actions.' };
    const key = options.trustedKey ?? await fetch(LIVE_JUDGE.publicKeyPath, { cache: 'no-store', signal: AbortSignal.timeout(8_000) }).then(response => {
      if (!response.ok) throw new Error('Live lock key unavailable');
      return response.json() as Promise<LiveJudgePublicKey>;
    });
    if (!key || !await verifyLiveJudgeLockAttestation(proof.lock, proof.lockAttestation, key)) return { status: 'FAIL', reason: 'The server lock signature is invalid or does not match this deployment’s verification key. Use the verifier on the same deployment that issued the proof.' };
    const snapshot = await verifyLiveJudgeLockSnapshot(proof.lock, options.rpc);
    if (snapshot.status !== 'PASS') return snapshot;
    const settlement = await directSettlementProofRpcOutcome(proof.onchainSettlement,
      { ...proof.lock.market, finalized: true, voided: proof.onchainSettlement.voided, winningOutcome: proof.onchainSettlement.winningOutcome }, options.rpc ?? liveJudgeRpc, SHANNON_TESTNET_PROFILE);
    if (settlement.status !== 'PASS') return settlement;
    const block = await (options.rpc ?? liveJudgeRpc)('eth_getBlockByHash', [proof.onchainSettlement.blockHash, false]) as { timestamp?: string } | null;
    if (!block || Number(BigInt(block.timestamp ?? '-1')) < proof.lock.market.expiry) return { status: 'FAIL', reason: 'The recorded settlement block precedes market expiry.' };
    return { status: 'PASS', reason: 'Server-attested choice, reproducible combat, pre-expiry pending market and final Shannon settlement all match. No trade or onchain choice is claimed.' };
  } catch { return { status: 'NOT PROVABLE', reason: 'The live proof could not be independently verified.' }; }
}
