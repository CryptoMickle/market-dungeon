import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { parseRivalCommand, RivalError, type LocalRivalDependencies } from './local-rival.ts';
import type { MarketSnapshot } from './protocol.ts';
import type { RivalDirection, RivalResponse, RivalRound, RivalTransaction } from './types.ts';

const DOMAIN = 'market-dungeon/somnia-agents-preview/v1';
export const MAX_TICKET_CHARS = 16_384;
const MAX_BODY_BYTES = 24_576;
const RETENTION_SECONDS = 7 * 86_400;
const HASH = /^0x[\da-f]{64}$/i;

export type PreviewRivalEnvironment = {
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  MARKET_DUNGEON_PREVIEW_AGENTS?: string;
  MARKET_DUNGEON_PRODUCTION_AGENTS?: string;
  JUDGE_REPLAY_SEAL_KEY?: string;
};
export type PreviewRivalDependencies = Omit<LocalRivalDependencies, 'directory' | 'choose'> & {
  environment: PreviewRivalEnvironment;
};
export type PreviewRivalResponse = RivalResponse & { ticket: string };
type Ticket = {
  version: 1;
  origin: string;
  expiresAt: number;
  snapshot: MarketSnapshot;
  round: RivalRound;
  transaction?: RivalTransaction;
  simulation?: { direction: RivalDirection; readyAt: number };
  pollAfter: number;
};

export function previewRivalOrigin(environment: PreviewRivalEnvironment): string | null {
  // Production requests use the published canonical alias, never a browser Host
  // header, forwarded host, arbitrary environment URL or Preview deployment host.
  if (environment.VERCEL === '1' && environment.VERCEL_ENV === 'production'
    && environment.MARKET_DUNGEON_PRODUCTION_AGENTS === '1') return 'https://market-dungeon.vercel.app';
  const host = environment.VERCEL_URL;
  if (environment.VERCEL !== '1' || environment.VERCEL_ENV !== 'preview' || environment.MARKET_DUNGEON_PREVIEW_AGENTS !== '1'
    || !host || !/^[a-z0-9](?:[a-z0-9-]{0,251}[a-z0-9])?\.vercel\.app$/.test(host)) return null;
  return `https://${host}`;
}

/**
 * Hosted storage is an authenticated, encrypted browser-carried ticket. No filesystem
 * or process-local archive is assumed. Encryption keeps the pending simulator choice
 * private; deployment-bound HKDF keys separate this protocol from Judge replay seals.
 *
 * This is NOT a distributed one-attempt/first-transaction ledger: a caller retaining an
 * older valid ticket can replay it or prepare another attempt. Refreshed tickets bind
 * the reported transaction, and identical attempt+market simulator preparations cannot
 * reroll their direction across cold starts. Neither mode affects expedition outcomes.
 */
export function createPreviewRival(dependencies: PreviewRivalDependencies) {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
  const origin = previewRivalOrigin(dependencies.environment);

  function context(requestOrigin: string) {
    if (!origin) throw new RivalError('Not found.', 404);
    if (requestOrigin !== origin) throw new RivalError('Kevin requests must come from this game deployment.', 403);
    const encoded = dependencies.environment.JUDGE_REPLAY_SEAL_KEY;
    if (!encoded || !/^[\da-f]{64}$/i.test(encoded)) throw new RivalError('Kevin is temporarily unavailable.', 503);
    const aad = Buffer.from(`${DOMAIN}\nenvironment=${dependencies.environment.VERCEL_ENV}\norigin=${origin}`);
    const derive = (purpose: string) => Buffer.from(hkdfSync('sha256', Buffer.from(encoded, 'hex'),
      Buffer.from(DOMAIN), Buffer.from(`${purpose}\n${aad.toString()}`), 32));
    return { aad, sealKey: derive('seal'), simulationKey: derive('simulation') };
  }

  function validate(saved: Ticket, attemptId: string) {
    const round = saved?.round;
    if (saved?.version !== 1 || saved.origin !== origin || !round || round.attemptId !== attemptId
      || !HASH.test(round.marketId) || !['simulation', 'somnia'].includes(round.mode)
      || !['preparing', 'awaiting-wallet', 'pending', 'locked', 'unavailable'].includes(round.status)
      || round.marketId !== saved.snapshot?.marketId || round.expiry !== saved.snapshot.expiry
      || round.cutoff !== saved.snapshot.cutoff || round.cutoff !== round.expiry - 10
      || saved.expiresAt !== round.expiry + RETENTION_SECONDS || !Number.isSafeInteger(saved.pollAfter)
      || saved.pollAfter < saved.snapshot.snapshotAt || saved.pollAfter > saved.expiresAt
      || saved.snapshot.snapshotAt > now() || now() > saved.expiresAt
      || (round.txHash !== undefined && !HASH.test(round.txHash))
      || (round.direction !== undefined && !['UP', 'DOWN'].includes(round.direction))
      || (round.reason !== undefined && (typeof round.reason !== 'string' || round.reason.length > 512))
      || (round.requestId !== undefined && !/^\d{1,78}$/.test(round.requestId))) throw new Error('Invalid ticket');
    dependencies.canonicalSnapshot(saved.snapshot);
    if (round.status === 'locked') {
      if (!round.direction || !Number.isSafeInteger(round.finalizedAt) || round.finalizedAt! < saved.snapshot.snapshotAt
        || round.finalizedAt! > round.cutoff) throw new Error('Invalid decision');
    } else if (round.direction !== undefined || round.finalizedAt !== undefined) throw new Error('Unexpected decision');
    if (round.mode === 'simulation') {
      if (!saved.simulation || !['UP', 'DOWN'].includes(saved.simulation.direction)
        || !Number.isSafeInteger(saved.simulation.readyAt) || saved.simulation.readyAt < saved.snapshot.snapshotAt
        || saved.transaction || round.txHash || round.requestId) throw new Error('Invalid simulator state');
    } else {
      if (saved.simulation) throw new Error('Unexpected simulator state');
      const tx = saved.transaction;
      if (tx && (tx.chainId !== 50312 || !/^0x[\da-f]{40}$/i.test(tx.to)
        || !/^0x(?:[\da-f]{2})+$/i.test(tx.data) || !/^0x[\da-f]+$/i.test(tx.value)
        || !/^\d+(?:\.\d+)?$/.test(tx.depositStt) || !/^\d+$/.test(tx.agentId)
        || !/^0x(?:[\da-f]{2})+$/i.test(tx.payload))) throw new Error('Invalid transaction');
      if (round.status === 'awaiting-wallet' && !tx) throw new Error('Missing transaction');
      if (round.status === 'locked' && (!round.txHash || !round.requestId)) throw new Error('Missing verification');
    }
  }

  function decrypt(ticket: string, attemptId: string, keys: ReturnType<typeof context>): Ticket {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(ticket) || ticket.length > MAX_TICKET_CHARS) throw new Error('Invalid encoding');
      const bytes = Buffer.from(ticket, 'base64url');
      if (bytes.length < 30 || bytes.toString('base64url') !== ticket) throw new Error('Invalid encoding');
      const decipher = createDecipheriv('aes-256-gcm', keys.sealKey, bytes.subarray(0, 12));
      decipher.setAAD(keys.aad);
      decipher.setAuthTag(bytes.subarray(12, 28));
      const saved = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as Ticket;
      validate(saved, attemptId);
      return saved;
    } catch { throw new RivalError('This Kevin ticket is invalid or expired. Continue your expedition without a rival.', 409); }
  }

  function respond(saved: Ticket, keys: ReturnType<typeof context>): PreviewRivalResponse {
    validate(saved, saved.round.attemptId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keys.sealKey, iv);
    cipher.setAAD(keys.aad);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(saved), 'utf8'), cipher.final()]);
    const ticket = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    if (ticket.length > MAX_TICKET_CHARS) throw new RivalError('The Kevin request exceeds its storage limit.', 503);
    return {
      round: { ...saved.round }, ticket,
      ...(saved.round.status === 'awaiting-wallet' && saved.transaction ? { transaction: { ...saved.transaction } } : {}),
    };
  }

  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Preview RPC deadline exceeded')), 25_000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  return {
    origin,
    async execute(value: unknown, requestContext: { origin: string }): Promise<PreviewRivalResponse> {
      const keys = context(requestContext.origin);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RivalError('Expected a rival request.');
      const { ticket, ...fields } = value as Record<string, unknown>;
      if (ticket !== undefined && (typeof ticket !== 'string' || !ticket || ticket.length > MAX_TICKET_CHARS)) {
        throw new RivalError('Invalid Kevin ticket.');
      }
      const command = parseRivalCommand(fields);
      let saved = typeof ticket === 'string' ? decrypt(ticket, command.attemptId, keys) : undefined;
      if (command.action === 'prepare') {
        if (saved) {
          if (saved.round.marketId !== command.marketId || saved.round.mode !== command.mode) {
            throw new RivalError('This ticket already has a fixed Kevin market and mode.', 409);
          }
          return respond(saved, keys);
        }
        const requestedAt = now();
        const snapshot = await bounded(() => dependencies.readMarket(command.marketId, requestedAt));
        // Parsing the canonical allowlist prevents an accidental upstream addition from
        // passing player information or arbitrary context into the agent protocol.
        const canonical = JSON.parse(dependencies.canonicalSnapshot(snapshot)) as MarketSnapshot;
        if (canonical.marketId !== command.marketId) throw new RivalError('The returned market does not match this attempt.', 409);
        if (canonical.snapshotAt !== requestedAt || canonical.cutoff !== canonical.expiry - 10 || now() >= canonical.cutoff) {
          throw new RivalError('Kevin’s prediction window has closed. Continue your expedition without a rival.', 409);
        }
        saved = {
          version: 1, origin: origin!, expiresAt: canonical.expiry + RETENTION_SECONDS, snapshot: canonical, pollAfter: now(),
          round: { attemptId: command.attemptId, marketId: command.marketId, expiry: canonical.expiry, cutoff: canonical.cutoff,
            mode: command.mode, status: command.mode === 'simulation' ? 'pending' : 'preparing' },
        };
        if (command.mode === 'simulation') {
          const digest = createHmac('sha256', keys.simulationKey).update(`${command.attemptId}\n${command.marketId}`).digest();
          saved.simulation = { direction: digest[0] & 1 ? 'UP' : 'DOWN', readyAt: now() + 2 };
          saved.round.reason = 'Kevin is choosing in the simulator. This is not a Somnia agent response.';
        } else {
          try {
            saved.transaction = await bounded(() => dependencies.prepareTransaction(canonical));
            saved.round.status = now() < canonical.cutoff ? 'awaiting-wallet' : 'unavailable';
            saved.round.reason = saved.round.status === 'awaiting-wallet'
              ? 'The testnet request is prepared. Only you can submit it from your wallet.'
              : 'Kevin’s cutoff passed while preparing the request. Your expedition can continue.';
          } catch {
            saved.round.status = 'unavailable';
            saved.round.reason = 'The Somnia testnet request could not be prepared. Your expedition can continue.';
          }
        }
        return respond(saved, keys);
      }

      if (!saved) throw new RivalError('A Kevin ticket is required to check this attempt.', 404);
      const round = saved.round;
      if (command.txHash && round.mode !== 'somnia') throw new RivalError('A simulation cannot contain a chain transaction.', 409);
      if (command.txHash && round.txHash && round.txHash !== command.txHash) throw new RivalError('This ticket is already bound to a different transaction.', 409);
      if (round.status === 'locked' || round.status === 'unavailable') return respond(saved, keys);
      if (round.mode === 'simulation') {
        if (now() >= saved.simulation!.readyAt) {
          if (saved.simulation!.readyAt > round.cutoff) {
            round.status = 'unavailable'; round.reason = 'Kevin’s simulated decision missed the cutoff. Your expedition can continue.';
          } else {
            round.status = 'locked'; round.direction = saved.simulation!.direction; round.finalizedAt = saved.simulation!.readyAt;
            round.reason = 'Simulated choice locked before the cutoff. No Somnia request or on-chain proof exists.';
          }
        }
      } else {
        if (command.txHash && !round.txHash) {
          round.txHash = command.txHash; round.status = 'pending';
          round.reason = 'Checking the transaction bound to this Kevin ticket.';
          delete saved.transaction;
        }
        if (round.txHash && now() >= saved.pollAfter) {
          // Signed cooldown avoids repeated RPC work in normal polling. Replaying an
          // older ticket can bypass it. The HTTP limiter adds best-effort abuse
          // resistance; neither mechanism is a distributed first-attempt ledger.
          saved.pollAfter = Math.min(now() + 3, saved.expiresAt);
          try {
            const snapshot = saved.snapshot;
            const verification = await bounded(() => dependencies.verifyTransaction(snapshot, round.txHash!));
            if (verification.txHash.toLowerCase() !== round.txHash) throw new Error('Mismatched transaction');
            if (verification.status === 'locked' && (verification.finalizedAt > round.cutoff
              || verification.finalizedAt < saved.snapshot.snapshotAt)) {
              round.status = 'unavailable'; round.reason = 'Kevin’s verified decision missed the permitted window.';
            } else Object.assign(round, verification);
          } catch {
            round.status = 'pending'; round.reason = 'Somnia verification is temporarily unavailable. Kevin will retry; keep playing.';
          }
        } else if (!round.txHash && now() >= round.cutoff) {
          // A wallet may have submitted on time while the browser failed to report it.
          round.reason = 'The signing window has closed. An already submitted transaction can still be checked.';
        }
      }
      return respond(saved, keys);
    },
  };
}

export function createPreviewRivalHandler(service: ReturnType<typeof createPreviewRival>, options: {
  limitRequest?: (request: Request) => { allowed: boolean; retryAfter: number };
} = {}) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'cache-control': 'private, no-store, max-age=0' };
    try {
      if (!service.origin) throw new RivalError('Not found.', 404);
      if (request.method !== 'POST') throw new RivalError('Use POST for Kevin requests.', 405);
      const url = new URL(request.url);
      if (url.origin !== service.origin || request.headers.get('origin') !== service.origin
        || (request.headers.has('host') && request.headers.get('host') !== url.host)
        || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
        throw new RivalError('Kevin requests must come from this game deployment.', 403);
      }
      const limit = options.limitRequest?.(request);
      if (limit && !limit.allowed) return Response.json({ error: 'Kevin needs a short break. Your expedition can continue.' }, {
        status: 429, headers: { ...headers, 'retry-after': String(limit.retryAfter) },
      });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new RivalError('Use a JSON rival request.', 415);
      }
      if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RivalError('Rival request is too large.', 413);
      const reader = request.body?.getReader();
      if (!reader) throw new RivalError('Missing rival request body.');
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RivalError('Rival request is too large.', 413); }
        chunks.push(value);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new RivalError('Invalid JSON rival request.'); }
      return Response.json(await service.execute(body, { origin: service.origin }), { headers });
    } catch (error) {
      const known = error instanceof RivalError;
      return Response.json({ error: known ? error.message : 'Kevin is temporarily unavailable. Your expedition can continue.' },
        { status: known ? error.status : 502, headers });
    }
  };
}
