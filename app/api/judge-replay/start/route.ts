import { randomInt } from 'node:crypto';

import { graphql, isRetryableUpstreamError } from '../../dreamdex.ts';
import { checkRateLimit, rateLimitHeaders, type RateLimitResult } from '../../request-control.ts';
import { selectBalancedReplayPool } from '../../../event-contract-interval.ts';
import {
  MAX_REPLAY_MARKET_AGE_SECONDS,
  REPLAY_MARKET_QUESTION,
  replayMarketProvenanceFromMarket,
} from '../../../replay-proof.ts';
import { newReplayClaims, replayCommitment, sealReplay, type ReplayDirection } from '../crypto.ts';
import { replayCandidates, type CandidateData, type ReplayCandidateData } from './state.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const REPLAY_TTL_SECONDS = 30 * 60;
const MIN_REVEAL_SECONDS = 15;
const START_RATE_LIMIT = { namespace: 'judge-replay-start', limit: 6, windowMs: 60_000 };

function responseHeaders(rate: RateLimitResult, extra: Record<string, string> = {}) {
  return { ...NO_STORE, ...rateLimitHeaders(rate), ...extra };
}

function eligibleCandidates(candidates: ReplayCandidateData[], now: number) {
  return candidates.filter((candidate) => {
    const provenance = replayMarketProvenanceFromMarket(candidate as Record<string, unknown>);
    return provenance !== null
      && provenance.marketExpiry <= now
      && now - provenance.marketExpiry <= MAX_REPLAY_MARKET_AGE_SECONDS;
  });
}

async function directionFrom(request: Request): Promise<ReplayDirection> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Invalid request');
  }
  const raw = await request.text();
  if (raw.length > 128) throw new Error('Invalid request');
  const body = JSON.parse(raw) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'direction') throw new Error('Invalid request');
  const direction = (body as { direction?: unknown }).direction;
  if (direction !== 'UP' && direction !== 'DOWN') throw new Error('Invalid request');
  return direction;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, START_RATE_LIMIT);
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too many replay starts. Please wait before locking another omen.', retryState: 'rate_limited', retryAfter: rate.retryAfter },
      { status: 429, headers: responseHeaders(rate, { 'retry-after': String(rate.retryAfter) }) },
    );
  }

  let direction: ReplayDirection;
  try {
    direction = await directionFrom(request);
  } catch {
    return Response.json({ error: 'Invalid Judge Replay request.' }, { status: 400, headers: responseHeaders(rate) });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const minExpiry = now - MAX_REPLAY_MARKET_AGE_SECONDS;
    const { data, cacheState } = await replayCandidates(() => graphql(`query SealedReplayCandidates($minExpiry: numeric!, $now: numeric!) {
      fiveMinute: Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_eq: "300"},
        question: {_eq: "${REPLAY_MARKET_QUESTION}"}, clobStatus: {_eq: "Finalized"},
        finalized: {_eq: true}, voided: {_eq: false}, winningOutcome: {_in: [0, 1]}, tradeCount: {_gt: 0},
        expiry: {_gte: $minExpiry, _lte: $now}, lastTradeAt: {_is_null: false},
        operatorId: {_is_null: false}, venueId: {_is_null: false}, oracleQuestionId: {_is_null: false},
        creator: {_is_null: false}, createdByTx: {_is_null: false}
      }, order_by: {expiry: desc}, limit: 64) {
        marketId winningOutcome marketType asset intervalSec question tradingStart expiry status: clobStatus
        tradeCount lastTradeAt operatorId venueId context oracleQuestionId creator createdByTx
      }
      fifteenMinute: Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_eq: "900"},
        question: {_eq: "${REPLAY_MARKET_QUESTION}"}, clobStatus: {_eq: "Finalized"},
        finalized: {_eq: true}, voided: {_eq: false}, winningOutcome: {_in: [0, 1]}, tradeCount: {_gt: 0},
        expiry: {_gte: $minExpiry, _lte: $now}, lastTradeAt: {_is_null: false},
        operatorId: {_is_null: false}, venueId: {_is_null: false}, oracleQuestionId: {_is_null: false},
        creator: {_is_null: false}, createdByTx: {_is_null: false}
      }, order_by: {expiry: desc}, limit: 64) {
        marketId winningOutcome marketType asset intervalSec question tradingStart expiry status: clobStatus
        tradeCount lastTradeAt operatorId venueId context oracleQuestionId creator createdByTx
      }
    }`, { minExpiry: String(minExpiry), now: String(now) }) as Promise<CandidateData>);
    const replayPool = selectBalancedReplayPool(
      eligibleCandidates(data.fiveMinute ?? [], now),
      eligibleCandidates(data.fifteenMinute ?? [], now),
    );
    if (!replayPool) throw new Error('Balanced replay pool unavailable');
    const outcomePool = replayPool.outcomePools[randomInt(2)];
    const selected = outcomePool[randomInt(outcomePool.length)];
    const provenance = replayMarketProvenanceFromMarket(selected as unknown as Record<string, unknown>);
    if (!provenance) throw new Error('Replay market provenance unavailable');
    const claims = newReplayClaims({
      marketId: selected.marketId,
      winningOutcome: selected.winningOutcome as 0 | 1,
      direction,
      issuedAt: now,
      revealAfter: now + MIN_REVEAL_SECONDS,
      expiresAt: now + REPLAY_TTL_SECONDS,
      ...provenance,
    });

    return Response.json({
      replay: {
        seal: sealReplay(claims),
        commitment: replayCommitment(claims),
        gameSeed: claims.gameSeed,
        lockedDirection: claims.direction,
        revealAfter: claims.revealAfter,
        expiresAt: claims.expiresAt,
        publicMarket: { asset: 'BTC', intervalSec: replayPool.intervalSec, network: 'Somnia mainnet', chainId: 5031 },
      },
    }, { headers: responseHeaders(rate, { 'x-replay-candidate-cache': cacheState }) });
  } catch (error) {
    const retryAfter = isRetryableUpstreamError(error) ? error.retryAfter : 3;
    return Response.json(
      { error: 'Sealed Judge Replay is unavailable. Please try again.', retryState: 'upstream_retry', retryAfter },
      { status: 503, headers: responseHeaders(rate, { 'retry-after': String(retryAfter) }) },
    );
  }
}
