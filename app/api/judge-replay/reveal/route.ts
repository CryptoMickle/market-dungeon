import { fetchFullMarket, hydrateMarket, isRetryableUpstreamError } from '../../dreamdex.ts';
import { checkRateLimit, rateLimitHeaders, type RateLimitResult } from '../../request-control.ts';
import { JUDGE_COMBAT, replayJudgeCombat, type JudgeCombatAction } from '../../../judge-combat.ts';
import { replayMarketProvenanceMatches } from '../../../replay-proof.ts';
import { canonicalReplay, combatTranscriptDigest, openReplay, replayCommitment, replayTimeStatus } from '../crypto.ts';
import { dedupeReveal, type RevealResult } from './state.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const MAX_REVEAL_BYTES = 8_192;
const REVEAL_RATE_LIMIT = { namespace: 'judge-replay-reveal', limit: 12, windowMs: 60_000 };

class RevealBodyTooLargeError extends Error {
  constructor() {
    super('Judge Replay request body exceeds 8 KiB');
    this.name = 'RevealBodyTooLargeError';
  }
}

function responseHeaders(rate: RateLimitResult, extra: Record<string, string> = {}) {
  return { ...NO_STORE, ...rateLimitHeaders(rate), ...extra };
}

function revealResponse(result: RevealResult, rate: RateLimitResult, dedupe: 'miss' | 'shared' | 'hit') {
  const extra: Record<string, string> = { 'x-replay-dedupe': dedupe };
  if (result.retryAfter) extra['retry-after'] = String(result.retryAfter);
  return Response.json(result.body, { status: result.status, headers: responseHeaders(rate, extra) });
}

async function readRevealBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REVEAL_BYTES) {
    throw new RevealBodyTooLargeError();
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REVEAL_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RevealBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function replayRequestFrom(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Invalid request');
  }
  const raw = await readRevealBody(request);
  const body = JSON.parse(raw) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== 'actions' || keys[1] !== 'seal') throw new Error('Invalid request');
  const { seal, actions } = body as { seal?: unknown; actions?: unknown };
  if (typeof seal !== 'string' || !seal || seal.length > 4_096) throw new Error('Invalid request');
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > JUDGE_COMBAT.maxSteps) throw new Error('Invalid request');

  for (const value of actions) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request');
    const actionKeys = Object.keys(value).sort();
    const entry = value as Partial<JudgeCombatAction>;
    if (actionKeys.length !== 2 || actionKeys[0] !== 'action' || actionKeys[1] !== 'room') throw new Error('Invalid request');
    if (entry.room !== JUDGE_COMBAT.guard.room && entry.room !== JUDGE_COMBAT.boss.room) throw new Error('Invalid request');
    if (entry.action !== 'attack' && entry.action !== 'storm' && entry.action !== 'potion') throw new Error('Invalid request');
  }
  return { seal, actions: actions as JudgeCombatAction[] };
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, REVEAL_RATE_LIMIT);
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too many replay reveals. Please wait before retrying.', retryState: 'rate_limited', retryAfter: rate.retryAfter },
      { status: 429, headers: responseHeaders(rate, { 'retry-after': String(rate.retryAfter) }) },
    );
  }

  let claims;
  let actions: JudgeCombatAction[];
  try {
    const replayRequest = await replayRequestFrom(request);
    claims = openReplay(replayRequest.seal);
    actions = replayRequest.actions;
  } catch (error) {
    if (error instanceof RevealBodyTooLargeError) {
      return Response.json(
        { error: 'Judge Replay request body exceeds the 8 KiB limit.' },
        { status: 413, headers: responseHeaders(rate) },
      );
    }
    return Response.json({ error: 'Invalid or expired replay seal. Start a new Judge Replay.' }, { status: 400, headers: responseHeaders(rate) });
  }

  const now = Math.floor(Date.now() / 1000);
  const timeStatus = replayTimeStatus(claims, now);
  if (timeStatus === 'expired') {
    return Response.json({ error: 'Replay seal expired. Start a new Judge Replay.' }, { status: 410, headers: responseHeaders(rate) });
  }
  if (timeStatus === 'sealed') {
    return Response.json(
      { error: 'Replay remains sealed during the minimum anti-peek hold.', retryAfter: claims.revealAfter - now },
      { status: 425, headers: responseHeaders(rate, { 'retry-after': String(claims.revealAfter - now) }) },
    );
  }

  const combat = replayJudgeCombat(claims.gameSeed, actions);
  if (!combat.verified) {
    return Response.json(
      { error: 'Combat transcript did not verify. Defeat both the guard and boss before revealing fate.' },
      { status: 422, headers: responseHeaders(rate) },
    );
  }

  const commitment = replayCommitment(claims);
  const digest = combatTranscriptDigest(claims.gameSeed, actions);
  const deduped = await dedupeReveal({
    commitment,
    digest,
    expiresAt: claims.expiresAt * 1_000,
    verify: async (): Promise<RevealResult> => {
      try {
        const rawMarket = await fetchFullMarket(claims.marketId);
        const currentOutcome = Number(rawMarket?.winningOutcome);
        if (!rawMarket || rawMarket.finalized !== true || rawMarket.voided === true
          || currentOutcome !== claims.winningOutcome
          || !replayMarketProvenanceMatches(claims, rawMarket)) {
          throw new Error('Committed settlement no longer verifies');
        }
        const hydrated = await hydrateMarket(rawMarket, true);

        return {
          status: 200,
          body: {
            ...hydrated,
            replayProof: {
              verified: true,
              algorithm: 'SHA-256',
              commitment,
              canonical: canonicalReplay(claims),
              marketId: claims.marketId,
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
              salt: claims.salt,
              gameSeed: claims.gameSeed,
              lockedDirection: claims.direction,
              committedOutcome: claims.winningOutcome,
              issuedAt: claims.issuedAt,
              revealAfter: claims.revealAfter,
              expiresAt: claims.expiresAt,
            },
            combatProof: {
              verified: true,
              ruleset: 'market-dungeon/judge-combat/v1',
              transcriptDigest: digest,
              steps: combat.steps,
              guardDefeated: true,
              bossDefeated: true,
              playerSurvived: true,
              finalHp: combat.finalHp,
            },
          },
        };
      } catch (error) {
        if (isRetryableUpstreamError(error)) {
          return {
            status: 503,
            retryAfter: error.retryAfter,
            body: {
              error: 'Somnia settlement services are temporarily unavailable. Retry this reveal.',
              retryState: 'upstream_retry',
              retryAfter: error.retryAfter,
            },
          };
        }
        return { status: 409, body: { error: 'Committed Somnia settlement could not be verified.' } };
      }
    },
  });
  if (deduped.state === 'conflict') {
    return Response.json(
      { error: 'This replay commitment was already revealed with a different combat transcript.' },
      { status: 409, headers: responseHeaders(rate, { 'x-replay-dedupe': 'conflict' }) },
    );
  }
  return revealResponse(deduped.result, rate, deduped.state);
}
