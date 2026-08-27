import { fetchFullMarket, hydrateMarket } from '../../dreamdex.ts';
import { JUDGE_COMBAT, replayJudgeCombat, type JudgeCombatAction } from '../../../judge-combat.ts';
import { canonicalReplay, combatTranscriptDigest, openReplay, replayCommitment, replayTimeStatus } from '../crypto.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const MAX_REVEAL_BYTES = 8_192;

async function replayRequestFrom(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Invalid request');
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REVEAL_BYTES) throw new Error('Invalid request');
  const raw = await request.text();
  if (raw.length > MAX_REVEAL_BYTES) throw new Error('Invalid request');
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
  let claims;
  let actions: JudgeCombatAction[];
  try {
    const replayRequest = await replayRequestFrom(request);
    claims = openReplay(replayRequest.seal);
    actions = replayRequest.actions;
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

  const combat = replayJudgeCombat(claims.gameSeed, actions);
  if (!combat.verified) {
    return Response.json(
      { error: 'Combat transcript did not verify. Defeat both the guard and boss before revealing fate.' },
      { status: 422, headers: NO_STORE },
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
      combatProof: {
        verified: true,
        ruleset: 'market-dungeon/judge-combat/v1',
        transcriptDigest: combatTranscriptDigest(claims.gameSeed, actions),
        steps: combat.steps,
        guardDefeated: true,
        bossDefeated: true,
        playerSurvived: true,
        finalHp: combat.finalHp,
      },
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: 'Committed Somnia settlement could not be verified.' }, { status: 409, headers: NO_STORE });
  }
}
