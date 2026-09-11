import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { MarketSnapshot, SomniaRequestVerification } from './protocol.ts';
import type { RivalDirection, RivalMode, RivalResponse, RivalRound, RivalTransaction } from './types.ts';

const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,128}$/;
const HASH = /^0x[\da-f]{64}$/i;
const MAX_BODY_BYTES = 2_048;
const MAX_ROUNDS = 512;
const STORE_VERSION = 1;

type RivalCommand = { action: 'prepare'; attemptId: string; marketId: string; mode: RivalMode }
  | { action: 'status'; attemptId: string; txHash?: string };
type StoredRound = {
  version: 1;
  snapshot: MarketSnapshot;
  round: RivalRound;
  transaction?: RivalTransaction;
  simulation?: { direction: RivalDirection; readyAt: number };
};

export class RivalError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'RivalError'; this.status = status; }
}

export type LocalRivalDependencies = {
  directory: string;
  now?: () => number;
  choose?: () => RivalDirection;
  readMarket: (marketId: string, now: number) => Promise<MarketSnapshot>;
  canonicalSnapshot: (snapshot: MarketSnapshot) => string;
  prepareTransaction: (snapshot: MarketSnapshot) => Promise<RivalTransaction>;
  verifyTransaction: (snapshot: MarketSnapshot, txHash: string) => Promise<SomniaRequestVerification>;
};

/** Only these fields may cross the player/agent boundary. */
export function parseRivalCommand(value: unknown): RivalCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RivalError('Expected a rival request.');
  const fields = value as Record<string, unknown>;
  const keys = fields.action === 'prepare' ? ['action', 'attemptId', 'marketId', 'mode']
    : fields.action === 'status' ? ['action', 'attemptId', 'txHash'] : [];
  if (!keys.length || Object.keys(fields).some((key) => !keys.includes(key))) {
    throw new RivalError('Unsupported rival request fields. Player choices must never be sent to Kevin.');
  }
  if (typeof fields.attemptId !== 'string' || !ATTEMPT_ID.test(fields.attemptId)) throw new RivalError('Invalid attempt identifier.');
  if (fields.action === 'prepare') {
    if (typeof fields.marketId !== 'string' || !HASH.test(fields.marketId)) throw new RivalError('Invalid market identifier.');
    if (fields.mode !== 'simulation' && fields.mode !== 'somnia') throw new RivalError('Choose a supported rival mode.');
    return { action: 'prepare', attemptId: fields.attemptId, marketId: fields.marketId.toLowerCase(), mode: fields.mode };
  }
  if (fields.txHash !== undefined && (typeof fields.txHash !== 'string' || !HASH.test(fields.txHash))) throw new RivalError('Invalid transaction hash.');
  return { action: 'status', attemptId: fields.attemptId, ...(fields.txHash ? { txHash: String(fields.txHash).toLowerCase() } : {}) };
}

function publicRound(stored: StoredRound): RivalResponse {
  // Never expose the simulator's future choice or private storage structure.
  return {
    round: { ...stored.round },
    ...(stored.round.status === 'awaiting-wallet' && stored.transaction ? { transaction: { ...stored.transaction } } : {}),
  };
}

function validateStored(value: unknown, attemptId: string, canonical: LocalRivalDependencies['canonicalSnapshot']): StoredRound {
  if (!value || typeof value !== 'object') throw new Error('Invalid storage');
  const stored = value as StoredRound;
  const round = stored.round;
  if (stored.version !== STORE_VERSION || !round || round.attemptId !== attemptId
    || !HASH.test(round.marketId) || !['simulation', 'somnia'].includes(round.mode)
    || !['preparing', 'awaiting-wallet', 'pending', 'locked', 'unavailable'].includes(round.status)
    || !Number.isSafeInteger(round.expiry) || !Number.isSafeInteger(round.cutoff)
    || round.marketId !== stored.snapshot?.marketId || round.expiry !== stored.snapshot.expiry
    || round.cutoff !== stored.snapshot.cutoff || (round.txHash !== undefined && !HASH.test(round.txHash))
    || (round.direction !== undefined && round.direction !== 'UP' && round.direction !== 'DOWN')
    || (round.reason !== undefined && (typeof round.reason !== 'string' || round.reason.length > 512))
    || (round.requestId !== undefined && !/^\d{1,78}$/.test(round.requestId))) throw new Error('Invalid storage');
  canonical(stored.snapshot);
  if (round.status === 'locked' && (!round.direction || !Number.isSafeInteger(round.finalizedAt)
    || round.finalizedAt! < stored.snapshot.snapshotAt || round.finalizedAt! > round.cutoff)) throw new Error('Invalid decision');
  if (round.status !== 'locked' && (round.direction !== undefined || round.finalizedAt !== undefined)) throw new Error('Unexpected decision');
  if (round.mode === 'simulation') {
    if (!stored.simulation || !['UP', 'DOWN'].includes(stored.simulation.direction)
      || !Number.isSafeInteger(stored.simulation.readyAt) || stored.simulation.readyAt < stored.snapshot.snapshotAt
      || stored.transaction || round.txHash || round.requestId) throw new Error('Invalid simulator record');
  } else {
    if (stored.simulation) throw new Error('Unexpected simulator record');
    if (stored.transaction) {
      const tx = stored.transaction;
      if (tx.chainId !== 50312 || !/^0x[\da-f]{40}$/i.test(tx.to)
        || !/^0x(?:[\da-f]{2})+$/i.test(tx.data) || !/^0x[\da-f]+$/i.test(tx.value)
        || !/^\d+(?:\.\d+)?$/.test(tx.depositStt) || !/^\d+$/.test(tx.agentId)
        || !/^0x(?:[\da-f]{2})+$/i.test(tx.payload)) throw new Error('Invalid prepared transaction');
    }
    if (round.status === 'awaiting-wallet' && !stored.transaction) throw new Error('Missing transaction');
    if (round.status === 'locked' && (!round.txHash || !round.requestId)) throw new Error('Missing chain evidence');
  }
  return stored;
}

export function createLocalRival(dependencies: LocalRivalDependencies) {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
  const choose = dependencies.choose ?? (() => randomInt(2) ? 'UP' : 'DOWN');
  const directory = dependencies.directory;

  async function withRecord<T>(attemptId: string, operation: (file: string) => Promise<T>): Promise<T> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = createHash('sha256').update(attemptId).digest('hex');
    const file = path.join(directory, `${filename}.json`);
    const lock = path.join(directory, `${filename}.lock`);
    const started = Date.now();
    while (true) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - (await stat(lock)).mtimeMs > 120_000) { await rm(lock, { recursive: true, force: true }); continue; }
        } catch (lockError) { if ((lockError as NodeJS.ErrnoException).code === 'ENOENT') continue; throw lockError; }
        if (Date.now() - started > 15_000) throw new RivalError('Kevin is already checking this round. Try again shortly.', 503);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    try { return await operation(file); }
    finally { await rm(lock, { recursive: true, force: true }); }
  }

  async function read(file: string, attemptId: string): Promise<StoredRound | null> {
    let contents: string;
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > 32_768) throw new Error('Invalid storage file');
      contents = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new RivalError('This saved Kevin round cannot be read safely. Your expedition is unaffected.', 409);
    }
    try { return validateStored(JSON.parse(contents), attemptId, dependencies.canonicalSnapshot); }
    catch { throw new RivalError('This saved Kevin round is damaged. It will not be replaced or rerolled.', 409); }
  }

  async function write(file: string, stored: StoredRound) {
    validateStored(stored, stored.round.attemptId, dependencies.canonicalSnapshot);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(stored)); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  }

  async function makeRoom() {
    const files = (await readdir(directory)).filter((name) => /^[\da-f]{64}\.json$/.test(name));
    if (files.length < MAX_ROUNDS) return;
    let remaining = files.length;
    for (const name of files) {
      const file = path.join(directory, name);
      // A deleted expired round cannot be reused: new preparation rechecks the live market.
      try {
        const saved = JSON.parse(await readFile(file, 'utf8')) as StoredRound;
        if (Number.isSafeInteger(saved.round?.expiry) && saved.round.expiry < now() - 7 * 86_400) {
          await rm(file, { force: true }); remaining -= 1;
        }
      } catch { /* Leave damaged evidence intact; never replace it with a new choice. */ }
    }
    if (remaining >= MAX_ROUNDS) throw new RivalError('Kevin’s local round archive is full. Your expedition can continue.', 503);
  }

  async function prepare(command: Extract<RivalCommand, { action: 'prepare' }>): Promise<RivalResponse> {
    return withRecord(command.attemptId, async (file) => {
      const previous = await read(file, command.attemptId);
      if (previous) {
        if (previous.round.marketId !== command.marketId || previous.round.mode !== command.mode) {
          throw new RivalError('This attempt already has a fixed Kevin market and mode.', 409);
        }
        return publicRound(previous);
      }
      await makeRoom();
      const requestedAt = now();
      const snapshot = await dependencies.readMarket(command.marketId, requestedAt);
      dependencies.canonicalSnapshot(snapshot);
      if (snapshot.marketId !== command.marketId) throw new RivalError('The returned market does not match this attempt.', 409);
      if (snapshot.snapshotAt !== requestedAt || snapshot.cutoff !== snapshot.expiry - 10
        || snapshot.snapshotAt < snapshot.tradingStart || now() >= snapshot.cutoff) {
        throw new RivalError('Kevin’s prediction window has closed. Continue your expedition without a rival.', 409);
      }
      const saved: StoredRound = {
        version: STORE_VERSION, snapshot,
        round: { attemptId: command.attemptId, marketId: command.marketId, expiry: snapshot.expiry, cutoff: snapshot.cutoff,
          mode: command.mode, status: command.mode === 'simulation' ? 'pending' : 'preparing' },
      };
      if (command.mode === 'simulation') {
        saved.simulation = { direction: choose(), readyAt: now() + 2 };
        saved.round.reason = 'Kevin is choosing in the local simulator. This is not a Somnia agent response.';
        await write(file, saved);
      } else {
        // Persist before reading the fee quote, so restart/retry cannot replace the snapshot.
        await write(file, saved);
        try {
          saved.transaction = await dependencies.prepareTransaction(snapshot);
          saved.round.status = now() < snapshot.cutoff ? 'awaiting-wallet' : 'unavailable';
          saved.round.reason = saved.round.status === 'awaiting-wallet'
            ? 'The testnet request is prepared. Only you can submit it from your wallet.'
            : 'Kevin’s cutoff passed while preparing the request. Your expedition can continue.';
        } catch {
          saved.round.status = 'unavailable';
          saved.round.reason = 'The Somnia testnet request could not be prepared. Your expedition can continue.';
        }
        await write(file, saved);
      }
      return publicRound(saved);
    });
  }

  async function status(command: Extract<RivalCommand, { action: 'status' }>): Promise<RivalResponse> {
    return withRecord(command.attemptId, async (file) => {
      const saved = await read(file, command.attemptId);
      if (!saved) throw new RivalError('No Kevin round is saved for this attempt.', 404);
      const round = saved.round;
      if (command.txHash && round.mode !== 'somnia') throw new RivalError('A local simulation cannot contain a chain transaction.', 409);
      if (command.txHash && round.txHash && round.txHash !== command.txHash) throw new RivalError('This round is already bound to a different transaction.', 409);
      if (round.status === 'locked' || round.status === 'unavailable') return publicRound(saved);
      if (round.mode === 'simulation') {
        if (now() >= saved.simulation!.readyAt) {
          if (saved.simulation!.readyAt > round.cutoff) {
            round.status = 'unavailable'; round.reason = 'Kevin’s local decision missed the cutoff. Your expedition can continue.';
          } else {
            round.status = 'locked'; round.direction = saved.simulation!.direction; round.finalizedAt = saved.simulation!.readyAt;
            round.reason = 'Local simulated choice locked before the cutoff. No Somnia request or on-chain proof exists.';
          }
          await write(file, saved);
        }
      } else {
        if (command.txHash && !round.txHash) {
          round.txHash = command.txHash; round.status = 'pending';
          round.reason = 'Checking the one transaction bound to this Kevin round.';
          await write(file, saved);
        }
        if (round.txHash) {
          try {
            const verification = await dependencies.verifyTransaction(saved.snapshot, round.txHash);
            if (verification.txHash.toLowerCase() !== round.txHash) throw new Error('Mismatched transaction');
            if (verification.status === 'locked' && (verification.finalizedAt > round.cutoff
              || verification.finalizedAt < saved.snapshot.snapshotAt)) {
              round.status = 'unavailable'; round.reason = 'Kevin’s verified decision missed the permitted window.';
            } else {
              Object.assign(round, verification);
            }
          } catch {
            // Provider outages cannot decide whether an already submitted request was timely.
            round.status = 'pending'; round.reason = 'Somnia verification is temporarily unavailable. Kevin will retry; keep playing.';
          }
          await write(file, saved);
        } else if (round.status === 'preparing') {
          round.status = 'unavailable'; round.reason = 'Preparation was interrupted. This round will not be replaced; keep playing.';
          await write(file, saved);
        } else {
          // Keep the signed-transaction recovery path available after the cutoff. A wallet may
          // have submitted in time even if this browser did not report its hash until later.
          if (now() >= round.cutoff) round.reason = 'The signing window has closed. An already submitted transaction can still be checked.';
        }
      }
      return publicRound(saved);
    });
  }

  return { async execute(value: unknown): Promise<RivalResponse> {
    const command = parseRivalCommand(value);
    return command.action === 'prepare' ? prepare(command) : status(command);
  } };
}

export function createLocalRivalHandler(service: ReturnType<typeof createLocalRival>, enabled: () => boolean) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'cache-control': 'private, no-store, max-age=0' };
    try {
      if (!enabled()) return Response.json({ error: 'Not found.' }, { status: 404, headers });
      if (request.method !== 'POST') throw new RivalError('Use POST for local rival requests.', 405);
      const url = new URL(request.url);
      // Next can normalize request.url to localhost even when the browser opened
      // 127.0.0.1. Match the actual loopback Host, without trusting forwarded hosts.
      const host = request.headers.get('host') ?? url.host;
      const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host);
      const expectedOrigin = localHost ? new URL(`${url.protocol}//${host}`).origin : null;
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || !expectedOrigin || request.headers.get('origin') !== expectedOrigin
        || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
        throw new RivalError('Kevin’s local requests must come from this local game.', 403);
      }
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
      return Response.json(await service.execute(body), { headers });
    } catch (error) {
      const known = error instanceof RivalError;
      return Response.json({ error: known ? error.message : 'Kevin is temporarily unavailable. Your expedition can continue.' },
        { status: known ? error.status : 502, headers });
    }
  };
}
