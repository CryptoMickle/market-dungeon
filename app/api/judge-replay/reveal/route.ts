import { fetchFullMarket, hydrateMarket } from '../../dreamdex.ts';
import { canonicalReplay, openReplay, replayCommitment, replayTimeStatus } from '../crypto.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };

async function sealFrom(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Invalid request');
  }
  const raw = await request.text();
  if (raw.length > 4600) throw new Error('Invalid request');
  const body = JSON.parse(raw) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'seal') throw new Error('Invalid request');
  const seal = (body as { seal?: unknown }).seal;
  if (typeof seal !== 'string' || !seal) throw new Error('Invalid request');
  return seal;
}

export async function POST(request: Request) {
  let claims;
  try {
    claims = openReplay(await sealFrom(request));
  } catch {
    return Response.json({ error: 'Invalid or expired replay seal. Start a new Judge Replay.' }, { status: 400, headers: NO_STORE });
  }

  const now = Math.floor(Date.now() / 1000);
  const timeStatus = replayTimeStatus(claims, now);
  if (timeStatus === 'expired') {
    return Response.json({ error: 'Replay seal expired. Start a new Judge Replay.' }, { status: 410, headers: NO_STORE });
  }
  if (timeStatus === 'sealed') {
    return Response.json(
      { error: 'Replay remains sealed during the minimum anti-peek hold.', retryAfter: claims.revealAfter - now },
      { status: 425, headers: { ...NO_STORE, 'retry-after': String(claims.revealAfter - now) } },
    );
  }

  try {
    const rawMarket = await fetchFullMarket(claims.marketId);
    const currentOutcome = Number(rawMarket?.winningOutcome);
    if (!rawMarket || rawMarket.finalized !== true || rawMarket.voided === true || currentOutcome !== claims.winningOutcome) {
      throw new Error('Committed settlement no longer verifies');
    }
    const hydrated = await hydrateMarket(rawMarket, true);
    const commitment = replayCommitment(claims);

    return Response.json({
      ...hydrated,
      replayProof: {
        verified: true,
        algorithm: 'SHA-256',
        commitment,
        canonical: canonicalReplay(claims),
        marketId: claims.marketId,
        salt: claims.salt,
        gameSeed: claims.gameSeed,
        lockedDirection: claims.direction,
        committedOutcome: claims.winningOutcome,
        issuedAt: claims.issuedAt,
        revealAfter: claims.revealAfter,
        expiresAt: claims.expiresAt,
      },
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: 'Committed Somnia settlement could not be verified.' }, { status: 409, headers: NO_STORE });
  }
}
