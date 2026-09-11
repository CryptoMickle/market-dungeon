import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewRival, createPreviewRivalHandler, MAX_TICKET_CHARS, previewRivalOrigin,
  type PreviewRivalDependencies, type PreviewRivalEnvironment } from '../lib/somnia-agents/preview-rival.ts';
import { canonicalSnapshot, prepareSomniaRequest, type MarketSnapshot, type SomniaRequestVerification,
  type SomniaProtocolClient } from '../lib/somnia-agents/protocol.ts';
import { RivalError } from '../lib/somnia-agents/local-rival.ts';
import type { RivalMode, RivalTransaction } from '../lib/somnia-agents/types.ts';

const MARKET = `0x${'12'.repeat(32)}`;
const OTHER_MARKET = `0x${'34'.repeat(32)}`;
const TX = `0x${'56'.repeat(32)}`;
const OTHER_TX = `0x${'78'.repeat(32)}`;
const ATTEMPT = 'preview_kevin_attempt_1';
const ORIGIN = 'https://market-dungeon-preview-example.vercel.app';
const ENV: PreviewRivalEnvironment = { VERCEL: '1', VERCEL_ENV: 'preview', MARKET_DUNGEON_PREVIEW_AGENTS: '1',
  VERCEL_URL: new URL(ORIGIN).host, JUDGE_REPLAY_SEAL_KEY: 'ab'.repeat(32) };
const TRANSACTION: RivalTransaction = {
  chainId: 50312, to: `0x${'90'.repeat(20)}`, data: '0xaabb', value: '0x01',
  depositStt: '0.21', agentId: '42', payload: '0xccdd',
};
const command = (mode: RivalMode = 'simulation', attemptId = ATTEMPT, marketId = MARKET) => ({ action: 'prepare', attemptId, marketId, mode });

function fixture(environment: PreviewRivalEnvironment = ENV) {
  let clock = 5_000;
  let reads = 0; let preparations = 0; let verifications = 0;
  let readOverride: PreviewRivalDependencies['readMarket'] | undefined;
  let prepareOverride: PreviewRivalDependencies['prepareTransaction'] | undefined;
  let verifyOverride: PreviewRivalDependencies['verifyTransaction'] | undefined;
  const snapshot = (marketId = MARKET, now = clock): MarketSnapshot => ({
    marketId, marketChainId: 5031, intervalSec: 300, question: 'Will BTC settle at or above the target?',
    strikeUsd: '80000', tradingStart: 4_900, expiry: 5_200, snapshotAt: now, cutoff: 5_190,
  });
  const dependencies: PreviewRivalDependencies = {
    environment, canonicalSnapshot, now: () => clock,
    readMarket: async (marketId, now) => { reads++; return readOverride ? readOverride(marketId, now) : snapshot(marketId, now); },
    prepareTransaction: async (input) => { preparations++; return prepareOverride ? prepareOverride(input) : TRANSACTION; },
    verifyTransaction: async (input, hash): Promise<SomniaRequestVerification> => {
      verifications++;
      return verifyOverride ? verifyOverride(input, hash) : { status: 'pending', txHash: hash, reason: 'Still evaluating.' };
    },
  };
  const service = createPreviewRival(dependencies);
  return {
    service, dependencies, snapshot,
    advance: (seconds: number) => { clock += seconds; }, setTime: (time: number) => { clock = time; },
    readWith: (fn: NonNullable<typeof readOverride>) => { readOverride = fn; },
    prepareWith: (fn: NonNullable<typeof prepareOverride>) => { prepareOverride = fn; },
    verifyWith: (fn: NonNullable<typeof verifyOverride>) => { verifyOverride = fn; },
    counts: () => ({ reads, preparations, verifications }),
    prepare: (mode: RivalMode = 'simulation', ticket?: string) => service.execute({ ...command(mode), ...(ticket ? { ticket } : {}) }, { origin: ORIGIN }),
    status: (ticket: string, txHash?: string) => service.execute({ action: 'status', attemptId: ATTEMPT, ticket, ...(txHash ? { txHash } : {}) }, { origin: ORIGIN }),
  };
}

test('preview requires Vercel preview, an explicit opt-in and a trusted deployment hostname', async () => {
  for (const environment of [
    { ...ENV, VERCEL: undefined }, { ...ENV, VERCEL_ENV: 'production' }, { ...ENV, VERCEL_ENV: 'development' },
    { ...ENV, MARKET_DUNGEON_PREVIEW_AGENTS: undefined }, { ...ENV, VERCEL_URL: 'evil.example' },
    { ...ENV, VERCEL_URL: 'trusted.vercel.app.evil.example' }, { ...ENV, VERCEL_URL: 'localhost:3001' },
    { ...ENV, VERCEL_URL: 'https://trusted.vercel.app' },
  ]) {
    assert.equal(previewRivalOrigin(environment), null);
    await assert.rejects(fixture(environment).prepare(), (error) => error instanceof RivalError && error.status === 404);
  }
  const missingKey = fixture({ ...ENV, JUDGE_REPLAY_SEAL_KEY: undefined });
  await assert.rejects(missingKey.prepare(), (error) => error instanceof RivalError && error.status === 503);
  assert.equal(missingKey.counts().reads, 0);
  assert.equal(previewRivalOrigin(ENV), ORIGIN);
});

test('pending preview simulator choice stays encrypted, then locks without pretending to be an agent', async () => {
  const f = fixture();
  const prepared = await f.prepare();
  assert.equal(prepared.round.status, 'pending');
  assert.equal(prepared.round.direction, undefined);
  assert.equal(prepared.transaction, undefined);
  assert.match(prepared.round.reason!, /not a Somnia agent response/);
  assert.equal('simulation' in prepared, false);
  assert.throws(() => JSON.parse(Buffer.from(prepared.ticket, 'base64url').toString('utf8')));
  f.advance(1);
  assert.equal((await f.status(prepared.ticket)).round.status, 'pending');
  f.advance(1);
  const result = await f.status(prepared.ticket);
  assert.equal(result.round.status, 'locked');
  assert.ok(['UP', 'DOWN'].includes(result.round.direction!));
  assert.equal(result.round.finalizedAt, 5_002);
  assert.equal(result.round.txHash, undefined);
  assert.match(result.round.reason!, /No Somnia request or on-chain proof/);
  assert.deepEqual(f.counts(), { reads: 1, preparations: 0, verifications: 0 });
});

test('cold starts and repeated prepares with the same attempt and market cannot reroll simulated direction', async () => {
  const f = fixture();
  const first = await f.prepare();
  f.advance(3);
  const locked = await f.status(first.ticket);
  const restarted = createPreviewRival(f.dependencies);
  const restored = await restarted.execute({ action: 'status', attemptId: ATTEMPT, ticket: first.ticket }, { origin: ORIGIN });
  assert.deepEqual(restored.round, locked.round);
  const repeated = await restarted.execute(command(), { origin: ORIGIN });
  f.advance(3);
  const relocked = await restarted.execute({ action: 'status', attemptId: ATTEMPT, ticket: repeated.ticket }, { origin: ORIGIN });
  assert.equal(relocked.round.direction, locked.round.direction);
  assert.deepEqual((await f.prepare('simulation', first.ticket)).round, first.round);
});

test('tampered IV, tag, ciphertext, truncated or incorrectly encoded tickets fail closed', async () => {
  const f = fixture();
  const result = await f.prepare();
  const bytes = Buffer.from(result.ticket, 'base64url');
  for (const index of [0, 12, 27, 28, bytes.length - 1]) {
    const altered = Buffer.from(bytes); altered[index] ^= 1;
    await assert.rejects(f.status(altered.toString('base64url')), /invalid or expired/);
  }
  for (const ticket of [result.ticket.slice(1), `${result.ticket}=`, 'bad', 'x'.repeat(MAX_TICKET_CHARS + 1)]) {
    await assert.rejects(f.status(ticket), RivalError);
  }
  assert.equal(f.counts().reads, 1);
});

test('tickets bind attempt, market, mode, deployment origin and sealing key', async () => {
  const f = fixture();
  const { ticket } = await f.prepare();
  await assert.rejects(f.service.execute({ action: 'status', attemptId: 'other_attempt_1', ticket }, { origin: ORIGIN }), /invalid or expired/);
  await assert.rejects(f.service.execute({ ...command('simulation', ATTEMPT, OTHER_MARKET), ticket }, { origin: ORIGIN }), /fixed Kevin market and mode/);
  await assert.rejects(f.prepare('somnia', ticket), /fixed Kevin market and mode/);
  await assert.rejects(f.service.execute({ action: 'status', attemptId: ATTEMPT, ticket }, { origin: 'https://evil.example' }), /preview deployment/);
  await assert.rejects(fixture({ ...ENV, JUDGE_REPLAY_SEAL_KEY: 'cd'.repeat(32) }).status(ticket), /invalid or expired/);
  const otherOrigin = 'https://market-dungeon-other-preview.vercel.app';
  const other = createPreviewRival({ ...f.dependencies, environment: { ...ENV, VERCEL_URL: new URL(otherOrigin).host } });
  await assert.rejects(other.execute({ action: 'status', attemptId: ATTEMPT, ticket }, { origin: otherOrigin }), /invalid or expired/);
});

test('status never auto-creates a ticket and rejects player context, transaction evidence for simulation and expired tickets', async () => {
  const f = fixture();
  await assert.rejects(f.service.execute({ action: 'status', attemptId: ATTEMPT }, { origin: ORIGIN }), /ticket is required/);
  for (const property of ['playerDirection', 'direction', 'snapshot', 'prompt', 'winningOutcome']) {
    await assert.rejects(f.service.execute({ ...command(), [property]: 'UP' }, { origin: ORIGIN }), /Unsupported rival request fields/);
  }
  const { ticket } = await f.prepare();
  await assert.rejects(f.status(ticket, TX), /simulation cannot contain a chain transaction/);
  f.setTime(5_200 + 7 * 86_400 + 1);
  await assert.rejects(f.status(ticket), /invalid or expired/);
  assert.equal(f.counts().reads, 1);
});

test('authoritative market mismatch, late reads and simulator decisions after cutoff are excluded', async () => {
  const f = fixture();
  f.readWith(async (_market, now) => f.snapshot(OTHER_MARKET, now));
  await assert.rejects(f.prepare(), /does not match/);
  f.readWith(async (_market, now) => { f.advance(191); return f.snapshot(MARKET, now); });
  await assert.rejects(f.prepare(), /window has closed/);
  const late = fixture(); late.setTime(5_189);
  const { ticket } = await late.prepare(); late.advance(20);
  assert.equal((await late.status(ticket)).round.status, 'unavailable');
  const timely = fixture(); const pending = await timely.prepare(); timely.setTime(6_000);
  assert.equal((await timely.status(pending.ticket)).round.status, 'locked');
});

test('real preparation uses only canonical market fields and supplies a testnet request for the user wallet', async () => {
  const f = fixture();
  f.readWith(async (_market, now) => ({ ...f.snapshot(MARKET, now), ignored: 'do not forward' }));
  f.prepareWith(async (snapshot) => {
    assert.equal('ignored' in snapshot, false);
    assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(f.snapshot()).sort());
    return TRANSACTION;
  });
  const result = await f.prepare('somnia');
  assert.equal(result.round.status, 'awaiting-wallet');
  assert.deepEqual(result.transaction, TRANSACTION);
  assert.equal(result.round.direction, undefined);
  assert.deepEqual(f.counts(), { reads: 1, preparations: 1, verifications: 0 });
});

test('real protocol payload fits the bounded ticket even at the maximum question length', async () => {
  const f = fixture();
  f.readWith(async (_market, now) => ({ ...f.snapshot(MARKET, now), question: 'q'.repeat(512) }));
  const client = {
    getChainId: async () => 50312,
    readContract: async ({ functionName }: { functionName: string }) => functionName === 'getRequestDeposit' ? 1n
      : functionName === 'defaultSubcommitteeSize' ? 3n : 2n,
  } as unknown as SomniaProtocolClient;
  f.prepareWith((snapshot) => prepareSomniaRequest(snapshot, client, 5_000));
  const result = await f.prepare('somnia');
  assert.equal(result.round.status, 'awaiting-wallet');
  assert.ok(result.ticket.length <= MAX_TICKET_CHARS);
  assert.ok(JSON.stringify({ action: 'status', attemptId: ATTEMPT, ticket: result.ticket, txHash: TX }).length < 24_576);
  assert.equal((await f.status(result.ticket)).round.status, 'awaiting-wallet');
});

test('failed or slow real preparation never changes to simulation', async () => {
  const f = fixture(); f.prepareWith(async () => { throw new Error('secret RPC error'); });
  const failed = await f.prepare('somnia');
  assert.equal(failed.round.status, 'unavailable');
  assert.equal(failed.round.mode, 'somnia');
  assert.equal(failed.round.direction, undefined);
  assert.equal(JSON.stringify(failed).includes('secret RPC error'), false);
  assert.deepEqual((await f.prepare('somnia', failed.ticket)).round, failed.round);
  const late = fixture(); late.prepareWith(async () => { late.setTime(5_191); return TRANSACTION; });
  const result = await late.prepare('somnia');
  assert.equal(result.round.status, 'unavailable');
  assert.equal(result.transaction, undefined);
});

test('refreshed tickets bind the real transaction through outages and cold starts; normal polling has a signed cooldown', async () => {
  const f = fixture(); const prepared = await f.prepare('somnia');
  f.verifyWith(async () => { throw new Error('RPC outage'); });
  const pending = await f.status(prepared.ticket, TX);
  assert.equal(pending.round.status, 'pending');
  assert.equal(pending.round.mode, 'somnia');
  assert.equal(pending.round.txHash, TX);
  assert.equal(pending.round.direction, undefined);
  assert.equal(pending.transaction, undefined);
  await assert.rejects(f.status(pending.ticket, OTHER_TX), /different transaction/);
  const restarted = createPreviewRival(f.dependencies);
  await assert.rejects(restarted.execute({ action: 'status', attemptId: ATTEMPT, ticket: pending.ticket, txHash: OTHER_TX }, { origin: ORIGIN }), /different transaction/);
  await f.status(pending.ticket);
  assert.equal(f.counts().verifications, 1);
  f.advance(3); await f.status(pending.ticket);
  assert.equal(f.counts().verifications, 2);
});

test('stateless prototype explicitly cannot globally bind old tickets to the first submitted transaction', async () => {
  const f = fixture(); const prepared = await f.prepare('somnia');
  const first = await f.status(prepared.ticket, TX);
  const replayed = await f.status(prepared.ticket, OTHER_TX);
  assert.equal(first.round.txHash, TX);
  assert.equal(replayed.round.txHash, OTHER_TX);
  // This is an intentionally documented preview limitation, not a claimed ledger guarantee.
  await assert.rejects(f.status(first.ticket, OTHER_TX), /different transaction/);
});

test('late browser polling accepts only a verified timely real decision and never fabricates a fallback', async () => {
  const f = fixture(); const prepared = await f.prepare('somnia');
  f.verifyWith(async (snapshot, txHash) => ({ status: 'locked', txHash, requestId: '73', direction: 'UP', finalizedAt: snapshot.cutoff - 1, reason: 'Verified timely consensus.' }));
  f.setTime(5_250);
  const locked = await f.status(prepared.ticket, TX);
  assert.equal(locked.round.status, 'locked');
  assert.equal(locked.round.direction, 'UP');
  assert.equal(locked.round.finalizedAt, 5_189);
  assert.deepEqual((await f.status(locked.ticket)).round, locked.round);
  assert.equal(f.counts().verifications, 1);
  for (const finalizedAt of [4_999, 5_191]) {
    const late = fixture(); const ticket = (await late.prepare('somnia')).ticket;
    late.verifyWith(async (_snapshot, txHash) => ({ status: 'locked', txHash, requestId: '73', direction: 'UP', finalizedAt, reason: 'Outside window.' }));
    const rejected = await late.status(ticket, TX);
    assert.equal(rejected.round.status, 'unavailable');
    assert.equal(rejected.round.direction, undefined);
    assert.equal(rejected.round.mode, 'somnia');
  }
});

function request(body: unknown, overrides: Record<string, string> = {}, url = `${ORIGIN}/api/somnia-agents/rival`) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...overrides }, body: JSON.stringify(body) });
}

test('HTTP verifies deployment origin without trusting Host or forwarded host, and never enables production', async () => {
  const f = fixture(); const handler = createPreviewRivalHandler(f.service);
  const production = createPreviewRivalHandler(fixture({ ...ENV, VERCEL_ENV: 'production' }).service);
  assert.equal((await production(request(command()))).status, 404);
  for (const req of [
    request(command(), { origin: 'https://evil.example' }),
    request(command(), { origin: ORIGIN.replace('https:', 'http:') }),
    request(command(), { host: 'evil.example', 'x-forwarded-host': new URL(ORIGIN).host }),
    request(command(), { 'sec-fetch-site': 'cross-site' }),
    request(command(), { origin: 'https://other.vercel.app' }, 'https://other.vercel.app/api/somnia-agents/rival'),
  ]) assert.equal((await handler(req)).status, 403);
  assert.equal((await handler(new Request(`${ORIGIN}/api/somnia-agents/rival`))).status, 405);
  const accepted = await handler(request(command()));
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get('cache-control')!, /no-store/);
  assert.ok((await accepted.json()).ticket);
});

test('HTTP bounds streamed and declared body size and rejects non-JSON before market reads', async () => {
  const f = fixture(); const handler = createPreviewRivalHandler(f.service);
  assert.equal((await handler(request({ blob: 'x'.repeat(25_000) }))).status, 413);
  assert.equal((await handler(request({}, { 'content-length': '25000' }))).status, 413);
  assert.equal((await handler(request({}, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request(`${ORIGIN}/api/somnia-agents/rival`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{broken',
  }))).status, 400);
  assert.equal(f.counts().reads, 0);
});
