import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { canonicalSnapshot, type MarketSnapshot, type SomniaRequestVerification } from '../lib/somnia-agents/protocol.ts';
import { createLocalRival, createLocalRivalHandler, parseRivalCommand, RivalError } from '../lib/somnia-agents/local-rival.ts';
import type { RivalMode, RivalTransaction } from '../lib/somnia-agents/types.ts';

const MARKET = `0x${'12'.repeat(32)}`;
const OTHER_MARKET = `0x${'34'.repeat(32)}`;
const TX = `0x${'56'.repeat(32)}`;
const OTHER_TX = `0x${'78'.repeat(32)}`;
const ATTEMPT = 'local_kevin_attempt_1';
const TRANSACTION: RivalTransaction = {
  chainId: 50312, to: `0x${'90'.repeat(20)}`, data: '0xaabb', value: '0x01',
  depositStt: '0.21', agentId: '42', payload: '0xccdd',
};

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kevin-rival-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = 5_000;
  let choices = 0;
  let reads = 0;
  let preparations = 0;
  let verifications = 0;
  let readOverride: ((marketId: string, now: number) => Promise<MarketSnapshot>) | null = null;
  let prepareOverride: ((snapshot: MarketSnapshot) => Promise<RivalTransaction>) | null = null;
  let verifyOverride: ((snapshot: MarketSnapshot, hash: string) => Promise<SomniaRequestVerification>) | null = null;
  const snapshot = (marketId = MARKET, now = clock): MarketSnapshot => ({
    marketId, marketChainId: 5031, intervalSec: 300, question: 'Will BTC settle at or above the target?',
    strikeUsd: '80000', tradingStart: 4_900, expiry: 5_200, snapshotAt: now, cutoff: 5_190,
  });
  const dependencies = {
    directory, canonicalSnapshot, now: () => clock,
    choose: () => { choices += 1; return 'DOWN' as const; },
    readMarket: async (marketId: string, now: number) => { reads += 1; return readOverride ? readOverride(marketId, now) : snapshot(marketId, now); },
    prepareTransaction: async (input: MarketSnapshot) => { preparations += 1; return prepareOverride ? prepareOverride(input) : TRANSACTION; },
    verifyTransaction: async (input: MarketSnapshot, hash: string): Promise<SomniaRequestVerification> => {
      verifications += 1;
      return verifyOverride ? verifyOverride(input, hash) : { status: 'pending', txHash: hash, reason: 'Still evaluating.' };
    },
  };
  const service = createLocalRival(dependencies);
  return {
    directory, service, snapshot, dependencies,
    advance: (seconds: number) => { clock += seconds; },
    setTime: (time: number) => { clock = time; },
    readWith: (value: NonNullable<typeof readOverride>) => { readOverride = value; },
    prepareWith: (value: NonNullable<typeof prepareOverride>) => { prepareOverride = value; },
    verifyWith: (value: NonNullable<typeof verifyOverride>) => { verifyOverride = value; },
    counts: () => ({ choices, reads, preparations, verifications }),
    prepare: (mode: RivalMode = 'simulation', attemptId = ATTEMPT, marketId = MARKET) => service.execute({ action: 'prepare', attemptId, marketId, mode }),
    status: (txHash?: string) => service.execute({ action: 'status', attemptId: ATTEMPT, ...(txHash ? { txHash } : {}) }),
  };
}

test('local rival never accepts player choices, hidden context, arbitrary prompts or unknown actions', () => {
  const valid = { action: 'prepare', attemptId: ATTEMPT, marketId: MARKET, mode: 'simulation' };
  for (const field of ['direction', 'playerDirection', 'player', 'prompt', 'snapshot', 'winningOutcome', '__proto__']) {
    const request = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    Object.defineProperty(request, field, { value: 'UP', enumerable: true });
    assert.throws(() => parseRivalCommand(request), /Unsupported rival request fields/);
  }
  for (const request of [null, [], {}, { ...valid, action: 'reroll' }, { ...valid, mode: 'mainnet' }, { ...valid, attemptId: '../../x' }]) {
    assert.throws(() => parseRivalCommand(request), RivalError);
  }
});

test('simulation locks once without exposing its future choice or claiming an agent transaction', async (t) => {
  const f = await fixture(t);
  const prepared = await f.prepare();
  assert.equal(prepared.round.status, 'pending');
  assert.equal(prepared.round.direction, undefined);
  assert.equal(prepared.transaction, undefined);
  assert.equal(JSON.stringify(prepared).includes('DOWN'), false);
  assert.match(prepared.round.reason!, /not a Somnia agent response/);
  f.advance(1);
  assert.equal((await f.status()).round.status, 'pending');
  f.advance(1);
  const result = await f.status();
  assert.equal(result.round.status, 'locked');
  assert.equal(result.round.direction, 'DOWN');
  assert.equal(result.round.finalizedAt, 5_002);
  assert.equal(result.round.txHash, undefined);
  assert.match(result.round.reason!, /No Somnia request or on-chain proof/);
  assert.deepEqual(f.counts(), { choices: 1, reads: 1, preparations: 0, verifications: 0 });
});

test('repeated and simultaneous preparation cannot replace the snapshot, market, mode or random choice', async (t) => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([f.prepare(), f.prepare()]);
  assert.deepEqual(first, second);
  f.advance(5);
  assert.deepEqual(await f.prepare(), first);
  await assert.rejects(f.prepare('somnia'), /fixed Kevin market and mode/);
  await assert.rejects(f.prepare('simulation', ATTEMPT, OTHER_MARKET), /fixed Kevin market and mode/);
  assert.equal(f.counts().choices, 1);
  assert.equal(f.counts().reads, 1);
});

test('process restart restores the same pending decision and later locks it without rerolling', async (t) => {
  const f = await fixture(t);
  await f.prepare();
  f.advance(3);
  const restarted = createLocalRival({ ...f.dependencies, choose: () => { throw new Error('Must not reroll'); } });
  const restored = await restarted.execute({ action: 'status', attemptId: ATTEMPT });
  assert.equal(restored.round.direction, 'DOWN');
  assert.equal(restored.round.finalizedAt, 5_002);
  assert.equal(f.counts().choices, 1);
});

test('a damaged saved round is preserved rather than replaced with a fresh prediction', async (t) => {
  const f = await fixture(t);
  await f.prepare();
  const filename = (await readdir(f.directory)).find((name) => name.endsWith('.json'))!;
  await writeFile(path.join(f.directory, filename), '{broken');
  await assert.rejects(f.prepare(), /damaged/);
  await assert.rejects(f.status(), /damaged/);
  assert.equal(await readFile(path.join(f.directory, filename), 'utf8'), '{broken');
  assert.equal(f.counts().choices, 1);
});

test('wrong authoritative market, expired market and reading past the cutoff cannot prepare a rival', async (t) => {
  const f = await fixture(t);
  f.readWith(async (_market, now) => f.snapshot(OTHER_MARKET, now));
  await assert.rejects(f.prepare(), /does not match/);
  f.readWith(async (_market, now) => { f.advance(191); return f.snapshot(MARKET, now); });
  await assert.rejects(f.prepare(), /window has closed/);
  assert.equal(f.counts().choices, 0);
  assert.equal(f.counts().preparations, 0);
});

test('local decision finalized after cutoff is excluded, but a timely decision can be collected later', async (t) => {
  const f = await fixture(t);
  f.setTime(5_189);
  await f.prepare();
  f.advance(20);
  assert.equal((await f.status()).round.status, 'unavailable');
  const other = await fixture(t);
  await other.prepare();
  other.setTime(6_000);
  assert.equal((await other.status()).round.direction, 'DOWN');
});

test('real preparation only returns a testnet transaction and sends no transaction itself', async (t) => {
  const f = await fixture(t);
  f.prepareWith(async (snapshot) => {
    assert.deepEqual(Object.keys(snapshot).sort(), ['marketId', 'marketChainId', 'intervalSec', 'question', 'strikeUsd', 'tradingStart', 'expiry', 'snapshotAt', 'cutoff'].sort());
    assert.equal(snapshot.marketId, MARKET);
    return TRANSACTION;
  });
  const result = await f.prepare('somnia');
  assert.equal(result.round.status, 'awaiting-wallet');
  assert.deepEqual(result.transaction, TRANSACTION);
  assert.equal(result.round.direction, undefined);
  assert.deepEqual(f.counts(), { choices: 0, reads: 1, preparations: 1, verifications: 0 });
});

test('a failed agent preparation never blocks the expedition or silently becomes a simulated choice', async (t) => {
  const f = await fixture(t);
  f.prepareWith(async () => { throw new Error('private provider error'); });
  const result = await f.prepare('somnia');
  assert.equal(result.round.status, 'unavailable');
  assert.equal(result.round.mode, 'somnia');
  assert.equal(result.round.direction, undefined);
  assert.equal(JSON.stringify(result).includes('private provider error'), false);
  assert.equal(f.counts().choices, 0);
  assert.deepEqual(await f.prepare('somnia'), result);
});

test('the first supplied real transaction is durably bound even if verification fails', async (t) => {
  const f = await fixture(t);
  await f.prepare('somnia');
  f.verifyWith(async () => { throw new Error('RPC outage'); });
  const result = await f.status(TX);
  assert.equal(result.round.status, 'pending');
  assert.equal(result.round.txHash, TX);
  await assert.rejects(f.status(OTHER_TX), /different transaction/);
  const restarted = createLocalRival(f.dependencies);
  await assert.rejects(restarted.execute({ action: 'status', attemptId: ATTEMPT, txHash: OTHER_TX }), /different transaction/);
});

test('late browser polling accepts a chain-proven decision that finalized before cutoff', async (t) => {
  const f = await fixture(t);
  await f.prepare('somnia');
  f.verifyWith(async (snapshot, txHash) => ({ status: 'locked', txHash, requestId: '73', direction: 'UP', finalizedAt: snapshot.cutoff - 1, reason: 'Verified timely consensus.' }));
  f.setTime(5_250);
  const result = await f.status(TX);
  assert.equal(result.round.status, 'locked');
  assert.equal(result.round.finalizedAt, 5_189);
  assert.equal(result.round.direction, 'UP');
  await assert.rejects(f.status(OTHER_TX), /different transaction/);
  assert.deepEqual(await f.status(), result);
  assert.equal(f.counts().verifications, 1);
});

test('late or failed chain results never produce a valid Kevin direction', async (t) => {
  const f = await fixture(t);
  await f.prepare('somnia');
  f.verifyWith(async (snapshot, txHash) => ({ status: 'locked', txHash, requestId: '73', direction: 'UP', finalizedAt: snapshot.cutoff + 1, reason: 'Late response.' }));
  const result = await f.status(TX);
  assert.equal(result.round.status, 'unavailable');
  assert.equal(result.round.direction, undefined);
  const failed = await fixture(t);
  await failed.prepare('somnia');
  failed.verifyWith(async (_snapshot, txHash) => ({ status: 'unavailable', txHash, reason: 'The agent request failed.' }));
  assert.equal((await failed.status(TX)).round.direction, undefined);
});

test('simulations reject transaction evidence and absent attempts are not auto-created by polling', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.status(), /No Kevin round/);
  await f.prepare();
  await assert.rejects(f.status(TX), /simulation cannot contain a chain transaction/);
});

function request(body: unknown, overrides: Record<string, string> = {}, url = 'http://localhost:3001/api/somnia-agents/rival') {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001', ...overrides }, body: JSON.stringify(body) });
}

test('HTTP endpoint is disabled outside local opt-in, rejects cross-origin and remote-host mutation', async (t) => {
  const f = await fixture(t);
  const body = { action: 'prepare', attemptId: ATTEMPT, marketId: MARKET, mode: 'simulation' };
  const disabled = createLocalRivalHandler(f.service, () => false);
  assert.equal((await disabled(request(body))).status, 404);
  const handler = createLocalRivalHandler(f.service, () => true);
  assert.equal((await handler(request(body, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(request(body, { origin: 'https://example.com' }, 'https://example.com/api/somnia-agents/rival'))).status, 403);
  assert.equal((await handler(request(body, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal((await handler(request(body, { host: 'evil.example' }))).status, 403);
  const accepted = await handler(request(body));
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get('cache-control')!, /no-store/);
});

test('HTTP origin check accepts Next-normalized localhost URLs with the actual loopback Host', async (t) => {
  const f = await fixture(t);
  const handler = createLocalRivalHandler(f.service, () => true);
  const result = await handler(request({ action: 'prepare', attemptId: ATTEMPT, marketId: MARKET, mode: 'simulation' },
    { host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' }));
  assert.equal(result.status, 200);
});

test('HTTP endpoint rejects oversized streamed JSON, invalid JSON and non-JSON without touching storage', async (t) => {
  const f = await fixture(t);
  const handler = createLocalRivalHandler(f.service, () => true);
  assert.equal((await handler(request({ blob: 'x'.repeat(3_000) }))).status, 413);
  assert.equal((await handler(request({}, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request('http://localhost:3001/api/somnia-agents/rival', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' }, body: '{broken',
  }))).status, 400);
  assert.equal(f.counts().reads, 0);
});
