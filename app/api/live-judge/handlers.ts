import { randomBytes } from 'node:crypto';
import { assertReplaySealingConfigured, combatTranscriptDigest, ReplayConfigurationError } from '../judge-replay/crypto.ts';
import { checkRateLimit, rateLimitHeaders } from '../request-control.ts';
import { JUDGE_COMBAT, JUDGE_COMBAT_DOMAIN, replayJudgeCombat, type JudgeCombatAction } from '../../judge-combat.ts';
import {
  LIVE_JUDGE, LIVE_LOCK_SCHEMA, LIVE_PROOF_SCHEMA, isLiveJudgeLock, liveJudgeResult, liveJudgeSettlementMatchesLock,
  type LiveJudgeCombatProof, type LiveJudgeLock, type LiveJudgeProof, type LiveJudgeSettledResponse,
} from '../../live-judge-proof.ts';
import { attestLiveJudgeLock, liveJudgePublicKey, openLiveJudgeLock, sealLiveJudgeLock } from './crypto.ts';
import { readLiveJudgeMarket, readLiveJudgeSettlement } from './read.ts';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
type Dependencies = {
  market: typeof readLiveJudgeMarket; settlement: typeof readLiveJudgeSettlement; now: () => number;
};
type StoredReveal = { digest: string; expiresAt: number; retryAt: number; pending: Promise<ResponseBody>; result?: ResponseBody };
type ResponseBody = { status: number; body: Record<string, unknown>; retryAfter?: number };

class BodyError extends Error {
  readonly status: number;
  constructor(status: number) { super('Invalid live Judge request'); this.status = status; }
}
async function readBody(request: Request, maximum: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !request.body) throw new BodyError(400);
  if (Number(request.headers.get('content-length')) > maximum) throw new BodyError(413);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new BodyError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BodyError(400);
  return body as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function createLiveJudgeHandlers(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { market: readLiveJudgeMarket, settlement: readLiveJudgeSettlement,
    now: () => Math.floor(Date.now() / 1000), ...overrides };
  const reveals = new Map<string, StoredReveal>();
  function rate(request: Request, name: string, limit: number) {
    return checkRateLimit(request, { namespace: `live-judge-${name}`, limit, windowMs: 60_000 });
  }
  function response(result: ResponseBody, headers: Record<string, string> = {}) {
    return Response.json(result.body, { status: result.status, headers: { ...NO_STORE, ...headers,
      ...(result.retryAfter ? { 'retry-after': String(result.retryAfter) } : {}) } });
  }
  function throttled(retryAfter: number, headers: Record<string, string>) {
    return response({ status: 429, body: { error: 'Please wait before trying again.', retryState: 'rate_limited', retryAfter }, retryAfter }, headers);
  }
  function failed(error: unknown, headers: Record<string, string> = {}) {
    if (error instanceof ReplayConfigurationError) return response({ status: 503,
      body: { error: 'Live Judge server setup is unavailable. Please return later.', retryState: 'config_unavailable' } }, headers);
    return response({ status: 503, body: { error: 'The live market could not be verified. Your selected or locked market has not changed.', retryState: 'upstream_retry', retryAfter: 5 }, retryAfter: 5 }, headers);
  }
  function pending(lock: LiveJudgeLock): ResponseBody {
    const retryAfter = Math.max(5, lock.market.expiry - dependencies.now());
    return { status: 425, body: { state: 'pending', error: 'The locked market is awaiting verified final settlement.', retryAfter }, retryAfter };
  }

  return {
    async market(request: Request) {
      const quota = rate(request, 'market', 30); const headers = rateLimitHeaders(quota);
      if (!quota.allowed) return throttled(quota.retryAfter, headers);
      const url = new URL(request.url);
      const asset = url.searchParams.get('asset') ?? 'BTC';
      if ((asset !== 'BTC' && asset !== 'ETH') || [...url.searchParams.keys()].some(key => key !== 'asset')) return response({ status: 400, body: { error: 'Choose BTC or ETH for the one-minute market.' } }, headers);
      try {
        assertReplaySealingConfigured();
        const found = await dependencies.market({ asset, now: dependencies.now() });
        const serverTime = dependencies.now();
        const market = found && found.market.expiry - serverTime >= LIVE_JUDGE.minRemainingSeconds ? found.market : null;
        return response({ status: 200, body: { market, serverTime, ...(market ? {} : { retryAfter: Math.max(3, 61 - serverTime % 60) }) } }, headers);
      } catch (error) { return failed(error, headers); }
    },
    async start(request: Request) {
      const quota = rate(request, 'start', 6); const headers = rateLimitHeaders(quota);
      if (!quota.allowed) return throttled(quota.retryAfter, headers);
      let marketId: string; let direction: 'UP' | 'DOWN';
      try {
        const body = await readBody(request, 512);
        if (!exactKeys(body, ['marketId', 'direction']) || typeof body.marketId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(body.marketId)
          || (body.direction !== 'UP' && body.direction !== 'DOWN')) throw new BodyError(400);
        marketId = body.marketId.toLowerCase(); direction = body.direction;
      } catch (error) { return response({ status: error instanceof BodyError ? error.status : 400, body: { error: 'Invalid live Judge choice.', retryState: 'invalid_request' } }, headers); }
      try {
        assertReplaySealingConfigured();
        const found = await dependencies.market({ marketId, now: dependencies.now() });
        // Read the time after all upstream reads: a slow response must never produce a late lock.
        const issuedAt = dependencies.now();
        if (!found || found.market.marketId !== marketId || found.market.expiry - issuedAt < LIVE_JUDGE.minRemainingSeconds) return response({ status: 409,
          body: { error: 'This market is too close to closing. Choose the next market before locking.', retryState: 'market_closed' } }, headers);
        const lock: LiveJudgeLock = { schema: LIVE_LOCK_SCHEMA, profileId: LIVE_JUDGE.profileId, chainId: LIVE_JUDGE.chainId,
          lockId: `0x${randomBytes(32).toString('hex')}`, market: found.market, direction, gameSeed: randomBytes(32).toString('base64url'),
          issuedAt, expiresAt: found.market.expiry + LIVE_JUDGE.claimLifetimeSeconds, snapshot: found.snapshot };
        if (!isLiveJudgeLock(lock)) throw new Error('The pending market snapshot is stale or inconsistent');
        const lockAttestation = attestLiveJudgeLock(lock);
        const seal = sealLiveJudgeLock(lock);
        return response({ status: 200, body: { live: { seal, gameSeed: lock.gameSeed, lock, lockAttestation } } }, headers);
      } catch (error) { return failed(error, headers); }
    },
    async reveal(request: Request) {
      const quota = rate(request, 'reveal', 12); const headers = rateLimitHeaders(quota);
      if (!quota.allowed) return throttled(quota.retryAfter, headers);
      let lock: LiveJudgeLock; let actions: JudgeCombatAction[];
      try {
        const body = await readBody(request, 24_576);
        if (!exactKeys(body, ['seal', 'actions']) || typeof body.seal !== 'string' || !Array.isArray(body.actions)
          || body.actions.length < 1 || body.actions.length > JUDGE_COMBAT.maxSteps) throw new BodyError(400);
        assertReplaySealingConfigured();
        lock = openLiveJudgeLock(body.seal); actions = body.actions as JudgeCombatAction[];
      } catch (error) {
        if (error instanceof ReplayConfigurationError) return failed(error, headers);
        return response({ status: error instanceof BodyError ? error.status : 400,
          body: { error: 'Invalid live Judge seal or combat request.', retryState: 'invalid_request' } }, headers);
      }
      if (dependencies.now() >= lock.expiresAt) return response({ status: 410, body: { error: 'This live Judge session expired. Start a new round.', retryState: 'expired' } }, headers);
      const combat = replayJudgeCombat(lock.gameSeed, actions);
      if (!combat.verified) return response({ status: 422, body: { error: 'Defeat the guard and boss with a valid combat transcript before revealing.', retryState: 'combat_invalid' } }, headers);
      if (dependencies.now() < lock.market.expiry) return response(pending(lock), headers);
      const digest = combatTranscriptDigest(lock.gameSeed, actions);
      for (const [id, entry] of reveals) if (entry.expiresAt <= dependencies.now()) reveals.delete(id);
      while (reveals.size >= 256) reveals.delete(reveals.keys().next().value!);
      const existing = reveals.get(lock.lockId);
      if (existing && existing.digest !== digest) return response({ status: 409, body: { error: 'The combat transcript for this locked round has already been submitted.', retryState: 'transcript_conflict' } }, headers);
      if (existing && (!existing.result || existing.result.status === 200 || existing.retryAt > dependencies.now())) return response(await existing.pending, headers);
      const promise = (async (): Promise<ResponseBody> => {
        try {
          const onchainSettlement = await dependencies.settlement(lock);
          if (!onchainSettlement) return pending(lock);
          if (!liveJudgeSettlementMatchesLock(onchainSettlement, lock)) throw new Error('Settlement does not match this live lock');
          const lockAttestation = attestLiveJudgeLock(lock);
          const combatProof: LiveJudgeCombatProof = { ...combat, ruleset: JUDGE_COMBAT_DOMAIN, transcriptDigest: digest };
          const result = liveJudgeResult(lock.direction, onchainSettlement);
          const proof: LiveJudgeProof = { schema: LIVE_PROOF_SCHEMA, lock, lockAttestation, actions, combatProof, result, onchainSettlement };
          const body: LiveJudgeSettledResponse = { state: 'settled', result, market: lock.market, lockAttestation, combatProof, onchainSettlement, proof };
          return { status: 200, body: body as unknown as Record<string, unknown> };
        } catch (error) {
          if (error instanceof ReplayConfigurationError) return { status: 503, body: { error: 'Live Judge server setup is unavailable. Your lock is unchanged.', retryState: 'config_unavailable' } };
          return { status: 503, body: { error: 'The locked market settlement could not be verified. Retry this same round.', retryState: 'upstream_retry', retryAfter: 5 }, retryAfter: 5 };
        }
      })();
      const entry: StoredReveal = { digest, expiresAt: lock.expiresAt, retryAt: 0, pending: promise };
      reveals.set(lock.lockId, entry);
      const result = await promise;
      entry.result = result; entry.retryAt = dependencies.now() + (result.retryAfter ?? 5);
      return response(result, headers);
    },
    async publicKey() {
      try { return response({ status: 200, body: liveJudgePublicKey() as unknown as Record<string, unknown> }); }
      catch (error) { return failed(error); }
    },
    reset() { reveals.clear(); },
  };
}

export const liveJudgeHandlers = createLiveJudgeHandlers();
