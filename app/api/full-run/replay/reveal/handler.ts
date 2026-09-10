import { hydrateSealedReplay, isRetryableUpstreamError } from '../../../dreamdex.ts';
import { checkRateLimit, rateLimitHeaders } from '../../../request-control.ts';
import type { JudgeNetworkProfile } from '../../../../judge-network.ts';
import {
  canonicalReplay,
  openReplay,
  replayCommitment,
  replayLockAttestation,
  replayTimeStatus,
  type ReplayClaims,
} from '../../../judge-replay/crypto.ts';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const MAX_REVEAL_BYTES = 4_096;
const PROOF_VERSION = 'market-dungeon/full-run-market/v1';

type HydratedReplay = Awaited<ReturnType<typeof hydrateSealedReplay>>;

async function sealFrom(request: Request): Promise<string> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Invalid request');
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REVEAL_BYTES) throw new Error('Request too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REVEAL_BYTES) throw new Error('Request too large');
  const body = JSON.parse(raw) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'seal')) throw new Error('Invalid request');
  const seal = (body as { seal?: unknown }).seal;
  if (typeof seal !== 'string' || !seal || seal.length > 4_096) throw new Error('Invalid request');
  return seal;
}

export function createFullRunReplayRevealHandler(input: {
  profile: JudgeNetworkProfile;
  open?: (seal: string, profile: JudgeNetworkProfile) => ReplayClaims;
  hydrate?: (claims: ReplayClaims, profile: JudgeNetworkProfile) => Promise<HydratedReplay>;
  now?: () => number;
}) {
  const open = input.open ?? openReplay;
  const hydrate = input.hydrate ?? hydrateSealedReplay;
  const now = input.now ?? (() => Math.floor(Date.now() / 1_000));
  const rateConfig = { namespace: 'full-run-replay-reveal', limit: 12, windowMs: 60_000 };

  return async function POST(request: Request) {
    const rate = checkRateLimit(request, rateConfig);
    const headers = (extra: Record<string, string> = {}) => ({ ...NO_STORE, ...rateLimitHeaders(rate), ...extra });
    if (!rate.allowed) {
      return Response.json(
        { error: 'Too many settlement checks. Please wait before retrying.', retryAfter: rate.retryAfter },
        { status: 429, headers: headers({ 'retry-after': String(rate.retryAfter) }) },
      );
    }

    let claims: ReplayClaims;
    try {
      claims = open(await sealFrom(request), input.profile);
    } catch {
      return Response.json({ error: 'Invalid or expired market seal. Lock a new attempt.' }, { status: 400, headers: headers() });
    }

    const status = replayTimeStatus(claims, now());
    if (status === 'expired') {
      return Response.json({ error: 'Market seal expired. Lock a new attempt.' }, { status: 410, headers: headers() });
    }
    if (status === 'sealed') {
      const retryAfter = claims.revealAfter - now();
      return Response.json(
        { error: 'Market remains sealed during the anti-peek hold.', retryAfter },
        { status: 425, headers: headers({ 'retry-after': String(retryAfter) }) },
      );
    }

    try {
      const hydrated = await hydrate(claims, input.profile);
      const onchain = hydrated.onchainSettlement;
      const winningOutcome = onchain.winningOutcome;
      const outcome = onchain.voided
        ? 'VOID'
        : winningOutcome === (claims.direction === 'UP' ? 0 : 1)
          ? 'BLESSED'
          : 'CURSED';
      return Response.json({
        market: hydrated.market,
        network: hydrated.network,
        onchainSettlement: onchain,
        safety: hydrated.safety,
        lockAttestation: replayLockAttestation(claims),
        settlement: {
          proofVersion: PROOF_VERSION,
          commitment: replayCommitment(claims),
          marketId: claims.marketId,
          direction: claims.direction,
          winningOutcome,
          outcome,
        },
        replayProof: {
          verified: true,
          scope: 'historical-event-contract-settlement',
          canonical: canonicalReplay(claims),
          commitment: replayCommitment(claims),
          marketId: claims.marketId,
          lockedDirection: claims.direction,
          committedOutcome: claims.winningOutcome,
          issuedAt: claims.issuedAt,
          revealAfter: claims.revealAfter,
          expiresAt: claims.expiresAt,
        },
      }, { headers: headers() });
    } catch (error) {
      if (isRetryableUpstreamError(error)) {
        return Response.json(
          { error: 'Somnia settlement services are temporarily unavailable.', retryAfter: error.retryAfter },
          { status: 503, headers: headers({ 'retry-after': String(error.retryAfter) }) },
        );
      }
      return Response.json({ error: 'Committed settlement could not be verified.' }, { status: 409, headers: headers() });
    }
  };
}
