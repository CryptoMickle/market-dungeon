import { randomInt } from 'node:crypto';

import { graphql } from '../../dreamdex.ts';
import { newReplayClaims, replayCommitment, sealReplay, type ReplayDirection } from '../crypto.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const REPLAY_TTL_SECONDS = 30 * 60;
const MIN_REVEAL_SECONDS = 15;

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
  let direction: ReplayDirection;
  try {
    direction = await directionFrom(request);
  } catch {
    return Response.json({ error: 'Invalid Judge Replay request.' }, { status: 400, headers: NO_STORE });
  }

  try {
    const data = await graphql(`query SealedReplayCandidates {
      Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_eq: "900"},
        finalized: {_eq: true}, voided: {_eq: false}, winningOutcome: {_in: [0, 1]}
      }, order_by: {expiry: desc}, limit: 64) {
        marketId winningOutcome
      }
    }`);
    const candidates = ((data.Market as Array<{ marketId?: unknown; winningOutcome?: unknown }>) ?? [])
      .map((market) => ({ marketId: String(market.marketId ?? '').toLowerCase(), winningOutcome: Number(market.winningOutcome) }))
      .filter((market) => /^0x[0-9a-f]{64}$/.test(market.marketId) && (market.winningOutcome === 0 || market.winningOutcome === 1));

    const outcomePools = [0, 1]
      .map((outcome) => candidates.filter((market) => market.winningOutcome === outcome));
    if (outcomePools.some((pool) => pool.length === 0)) throw new Error('Balanced replay pool unavailable');
    const outcomePool = outcomePools[randomInt(2)];
    const selected = outcomePool[randomInt(outcomePool.length)];
    const now = Math.floor(Date.now() / 1000);
    const claims = newReplayClaims({
      marketId: selected.marketId,
      winningOutcome: selected.winningOutcome as 0 | 1,
      direction,
      issuedAt: now,
      revealAfter: now + MIN_REVEAL_SECONDS,
      expiresAt: now + REPLAY_TTL_SECONDS,
    });

    return Response.json({
      replay: {
        seal: sealReplay(claims),
        commitment: replayCommitment(claims),
        gameSeed: claims.gameSeed,
        lockedDirection: claims.direction,
        revealAfter: claims.revealAfter,
        expiresAt: claims.expiresAt,
        publicMarket: { asset: 'BTC', intervalSec: 900, network: 'Somnia mainnet', chainId: 5031 },
      },
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: 'Sealed Judge Replay is unavailable. Please try again.' }, { status: 503, headers: NO_STORE });
  }
}
