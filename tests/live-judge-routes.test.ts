import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';
import { createLiveJudgeHandlers } from '../app/api/live-judge/handlers.ts';
import { attestLiveJudgeLock, liveJudgePublicKey, openLiveJudgeLock, sealLiveJudgeLock } from '../app/api/live-judge/crypto.ts';
import { readLiveJudgeMarket } from '../app/api/live-judge/read.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import {
  LIVE_JUDGE, LIVE_ORACLE_QUESTION_ABI, isLiveJudgeLock, verifyLiveJudgeLockAttestation, verifyLiveJudgeProof,
  type LiveJudgeStart, type LiveJudgeProof,
} from '../app/live-judge-proof.ts';
import { MODULE_MARKETS_ABI } from '../app/onchain-settlement-proof.ts';
import { liveJudgeFixture } from './e2e/live-judge-fixture.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';

const NOW = 1_800_000_000;
const originalFetch = globalThis.fetch;
test.beforeEach(() => { resetRequestControlForTests(); process.env.JUDGE_REPLAY_SEAL_KEY = '44'.repeat(32); process.env.VERCEL_ENV = 'development'; });
test.afterEach(() => { globalThis.fetch = originalFetch; });
function post(body: unknown) {
  return new Request('http://local.test/api/live-judge/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function harness(options: { outcome?: 0 | 1 | 'VOID' } = {}) {
  const fixture = liveJudgeFixture({ now: NOW, ...options });
  let now = NOW; let settlementReads = 0; let marketReads = 0; let pending = false;
  const handlers = createLiveJudgeHandlers({ now: () => now,
    market: async input => { marketReads++; assert.equal(input.marketId ?? fixture.market.marketId, fixture.market.marketId); return { market: fixture.market, snapshot: fixture.session.lock.snapshot }; },
    settlement: async lock => { settlementReads++; assert.equal(lock.market.marketId, fixture.market.marketId); return pending ? null : fixture.proof.onchainSettlement; },
  });
  return { fixture, handlers, setTime: (time: number) => { now = time; }, setPending: (value: boolean) => { pending = value; }, counts: () => ({ settlementReads, marketReads }) };
}
async function start(h: ReturnType<typeof harness>, direction: 'UP' | 'DOWN' = 'UP') {
  const response = await h.handlers.start(post({ marketId: h.fixture.market.marketId, direction }));
  assert.equal(response.status, 200);
  return (await response.json() as { live: LiveJudgeStart }).live;
}

test('live start binds the explicit active market and direction without committing a known outcome', async () => {
  const h = harness(); const session = await start(h, 'DOWN');
  assert.equal(session.lock.direction, 'DOWN'); assert.deepEqual(session.lock.market, h.fixture.market);
  assert.equal(session.lock.issuedAt, NOW); assert.equal(session.gameSeed, session.lock.gameSeed);
  assert.equal(isLiveJudgeLock(session.lock), true);
  assert.equal(await verifyLiveJudgeLockAttestation(session.lock, session.lockAttestation, liveJudgePublicKey()), true);
  assert.deepEqual(openLiveJudgeLock(session.seal), session.lock);
  assert.equal('winningOutcome' in session.lock, false); assert.equal('commitment' in session.lock, false);
  assert.equal(h.counts().settlementReads, 0);
  assert.equal(session.lock.market.strikeExactUsd, '60000');
});

test('start rechecks remaining time after a slow market read and never silently picks another market', async () => {
  const fixture = liveJudgeFixture({ now: NOW }); let now = NOW;
  const handlers = createLiveJudgeHandlers({ now: () => now, market: async () => { now = fixture.market.expiry - 19; return { market: fixture.market, snapshot: fixture.session.lock.snapshot }; } });
  const late = await handlers.start(post({ marketId: fixture.market.marketId, direction: 'UP' }));
  assert.equal(late.status, 409); assert.equal((await late.json()).retryState, 'market_closed');
  now = NOW;
  const different = createLiveJudgeHandlers({ now: () => now, market: async () => ({ market: fixture.market, snapshot: fixture.session.lock.snapshot }) });
  assert.equal((await different.start(post({ marketId: `0x${'ff'.repeat(32)}`, direction: 'UP' }))).status, 409);
  const future = structuredClone(fixture.session.lock); future.issuedAt = future.market.tradingStart - 1;
  assert.equal(isLiveJudgeLock(future), false);
});

test('invalid input, missing setup and start rate protection do not permit upstream work', async () => {
  const h = harness();
  assert.equal((await h.handlers.start(post({ marketId: h.fixture.market.marketId, direction: 'UP', winningOutcome: 0 }))).status, 400);
  delete process.env.JUDGE_REPLAY_SEAL_KEY;
  const missing = await h.handlers.start(post({ marketId: h.fixture.market.marketId, direction: 'UP' }));
  assert.equal(missing.status, 503); assert.equal((await missing.json()).retryState, 'config_unavailable');
  assert.equal(missing.headers.get('retry-after'), null); assert.equal(h.counts().marketReads, 0);
  process.env.JUDGE_REPLAY_SEAL_KEY = '44'.repeat(32); resetRequestControlForTests();
  for (let i = 0; i < 6; i++) await start(h);
  const limited = await h.handlers.start(post({ marketId: h.fixture.market.marketId, direction: 'UP' }));
  assert.equal(limited.status, 429); assert.equal(h.counts().marketReads, 6);
});

test('seals reject tampering, historical tokens, another environment and modified profile or timing', async () => {
  const h = harness(); const session = await start(h);
  const pieces = session.seal.split('.'); pieces[2] = `${pieces[2][0] === 'A' ? 'B' : 'A'}${pieces[2].slice(1)}`;
  assert.throws(() => openLiveJudgeLock(pieces.join('.')));
  assert.throws(() => openLiveJudgeLock(session.seal.replace('live1.', 'v3.')));
  process.env.VERCEL_ENV = 'preview'; assert.throws(() => openLiveJudgeLock(session.seal)); process.env.VERCEL_ENV = 'development';
  for (const mutation of [
    (lock: Record<string, unknown>) => { lock.profileId = 'shannon-testnet'; },
    (lock: Record<string, unknown>) => { lock.chainId = 5031; },
    (lock: Record<string, unknown>) => { lock.issuedAt = session.lock.market.expiry; },
  ]) { const invalid = structuredClone(session.lock); mutation(invalid); assert.throws(() => sealLiveJudgeLock(invalid)); }
  const changed = structuredClone(session.lock); changed.direction = 'UP';
  // The original lock is UP here, so change a different signed field instead.
  changed.lockId = `0x${'00'.repeat(32)}`;
  assert.equal(await verifyLiveJudgeLockAttestation(changed, session.lockAttestation, liveJudgePublicKey()), false);
});

test('Production live receipts verify with their own key and stay isolated from Preview', async () => {
  process.env.VERCEL_ENV = 'production';
  const h = harness();
  const session = await start(h);
  const productionKey = liveJudgePublicKey();
  assert.equal(productionKey.environment, 'production');
  assert.equal(session.lockAttestation.environment, 'production');
  assert.equal(await verifyLiveJudgeLockAttestation(session.lock, session.lockAttestation, productionKey), true);
  assert.deepEqual(openLiveJudgeLock(session.seal), session.lock);

  process.env.VERCEL_ENV = 'preview';
  const previewKey = liveJudgePublicKey();
  assert.notEqual(previewKey.keyId, productionKey.keyId);
  assert.equal(await verifyLiveJudgeLockAttestation(session.lock, session.lockAttestation, previewKey), false);
  assert.throws(() => openLiveJudgeLock(session.seal));

  process.env.VERCEL_ENV = 'production';
  h.setTime(h.fixture.market.expiry + 1);
  const result = await h.handlers.reveal(post({ seal: session.seal, actions: validLiveJudgeActions(session.gameSeed) }));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal((await verifyLiveJudgeProof(body.proof, { trustedKey: productionKey, rpc: h.fixture.rpc })).status, 'PASS');
  const wrongDeployment = await verifyLiveJudgeProof(body.proof, { trustedKey: previewKey, rpc: h.fixture.rpc });
  assert.equal(wrongDeployment.status, 'FAIL');
  assert.match(wrongDeployment.reason, /same deployment/);
});

test('reveal requires reproducible victory and waits for actual finalization without changing the market', async () => {
  const h = harness(); const session = await start(h); const actions = validLiveJudgeActions(session.gameSeed);
  assert.equal((await h.handlers.reveal(post({ seal: session.seal, actions: [{ room: 8, action: 'attack' }] }))).status, 422);
  const beforeExpiry = await h.handlers.reveal(post({ seal: session.seal, actions }));
  assert.equal(beforeExpiry.status, 425); assert.equal((await beforeExpiry.json()).state, 'pending'); assert.equal(h.counts().settlementReads, 0);
  h.setTime(h.fixture.market.expiry + 1); h.setPending(true);
  assert.equal((await h.handlers.reveal(post({ seal: session.seal, actions }))).status, 425);
  h.setPending(false); h.setTime(h.fixture.market.expiry + 7);
  const completed = await h.handlers.reveal(post({ seal: session.seal, actions }));
  assert.equal(completed.status, 200); const body = await completed.json(); assert.equal(body.result, 'BLESSED');
  assert.deepEqual(body.proof.lock, session.lock); assert.deepEqual(body.lockAttestation, session.lockAttestation);
  assert.equal((await verifyLiveJudgeProof(body.proof, { trustedKey: liveJudgePublicKey(), rpc: h.fixture.rpc })).status, 'PASS');
  assert.equal((await h.handlers.reveal(post({ seal: session.seal, actions }))).status, 200); assert.equal(h.counts().settlementReads, 2);
});

test('live outcomes keep CURSED and VOID distinct and expired sessions cannot reveal', async () => {
  for (const outcome of [0, 1, 'VOID'] as const) {
    resetRequestControlForTests(); const h = harness({ outcome }); const session = await start(h); const actions = validLiveJudgeActions(session.gameSeed);
    h.setTime(h.fixture.market.expiry + 1);
    const response = await h.handlers.reveal(post({ seal: session.seal, actions })); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.result, outcome === 0 ? 'BLESSED' : outcome === 1 ? 'CURSED' : 'VOID');
    assert.equal((await verifyLiveJudgeProof(body.proof, { trustedKey: liveJudgePublicKey(), rpc: h.fixture.rpc })).status, 'PASS');
    h.setTime(session.lock.expiresAt); assert.equal((await h.handlers.reveal(post({ seal: session.seal, actions }))).status, 410);
  }
});

test('independent live verifier rejects malformed proof, digest tampering, substituted outcome and wrong oracle', async () => {
  const fixture = liveJudgeFixture({ now: NOW });
  for (const mutate of [
    (proof: LiveJudgeProof) => { proof.combatProof.transcriptDigest = `0x${'00'.repeat(32)}`; },
    (proof: LiveJudgeProof) => { proof.combatProof = null as never; },
    (proof: LiveJudgeProof) => { proof.result = 'CURSED'; },
    (proof: LiveJudgeProof) => { proof.lock.market.oracleAdapter = `0x${'00'.repeat(20)}`; },
    (proof: LiveJudgeProof) => { proof.lock.market.strikeExactUsd = '60000.0001'; },
    (proof: LiveJudgeProof) => { proof.actions[0].action = 'teleport' as never; },
  ]) { const proof = structuredClone(fixture.proof); mutate(proof); assert.equal((await verifyLiveJudgeProof(proof, { trustedKey: fixture.publicKey, rpc: fixture.rpc })).status, 'FAIL'); }
  assert.equal((await verifyLiveJudgeProof(fixture.proof, { trustedKey: fixture.publicKey, rpc: async () => { throw new Error('offline'); } })).status, 'NOT PROVABLE');
});

function installDiscovery(fixture: ReturnType<typeof liveJudgeFixture>, options: { row?: Record<string, unknown>; chainId?: string; moduleResult?: string; oracleResult?: string } = {}) {
  const m = fixture.market;
  const row = { ...m, marketType: 'BINARY', intervalSec: '60', strike: '6000000', tradingStart: String(m.tradingStart), expiry: String(m.expiry),
    clobStatus: 'Trading', finalized: false, voided: false, winningOutcome: null, ...options.row };
  globalThis.fetch = (async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url) === LIVE_JUDGE.indexer) return Response.json({ data: body.query.includes('LiveJudgeCandidates') ? { Market: [row] } : { Market_by_pk: row } });
    assert.equal(String(url), LIVE_JUDGE.rpc);
    let result: unknown;
    if (body.method === 'eth_chainId') result = options.chainId ?? '0xc488';
    else if (body.method === 'eth_getBlockByNumber') result = { number: '0x10', hash: fixture.session.lock.snapshot.blockHash, timestamp: `0x${(fixture.now - 1).toString(16)}` };
    else if (body.method === 'eth_call' && body.params[0].to === LIVE_JUDGE.moduleAddress && options.moduleResult) result = options.moduleResult;
    else if (body.method === 'eth_call' && body.params[0].to === LIVE_JUDGE.oracleAdapter && options.oracleResult) result = options.oracleResult;
    else result = await fixture.rpc(body.method, body.params);
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  }) as typeof fetch;
}

test('discovery verifies the actual pending contract state, chain, venue, oracle and 60-second dates', async () => {
  const fixture = liveJudgeFixture({ now: NOW }); installDiscovery(fixture);
  assert.deepEqual((await readLiveJudgeMarket({ asset: 'BTC', now: NOW }))?.market, fixture.market);
  for (const options of [
    { chainId: '0x13a7' },
    { row: { venueId: `0x${'00'.repeat(32)}` } },
    { row: { operatorId: 2 } },
    { row: { expiry: String(fixture.market.expiry + 1) } },
    { row: { marketId: `0x${'00'.repeat(32)}` } },
  ]) { installDiscovery(fixture, options); await assert.rejects(readLiveJudgeMarket({ marketId: fixture.market.marketId, now: NOW })); }
  const m = fixture.market;
  const wrongOracle = encodeFunctionResult({ abi: MODULE_MARKETS_ABI, functionName: 'markets', result: [1n, 2, 0, m.collateral, 4, m.venueId,
    `0x${'00'.repeat(20)}`, m.creator, m.marketAddress, m.poolAddress, BigInt(m.yesTokenId), BigInt(m.noTokenId), BigInt(m.tradingStart), BigInt(m.expiry)] as never });
  installDiscovery(fixture, { moduleResult: wrongOracle }); await assert.rejects(readLiveJudgeMarket({ asset: 'BTC', now: NOW }));
});

test('discovery preserves the exact sub-cent oracle threshold and rejects another asset or expiry', async () => {
  const fixture = liveJudgeFixture({ now: NOW }); const raw = 60_000n * 10n ** 18n + 75n * 10n ** 14n;
  const oracleResult = encodeFunctionResult({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', result: ['BTC/USDC', raw, BigInt(fixture.market.expiry), true] });
  installDiscovery(fixture, { oracleResult });
  const found = await readLiveJudgeMarket({ asset: 'BTC', now: NOW }); assert.equal(found?.market.strikeUsd, '60000.00'); assert.equal(found?.market.strikeExactUsd, '60000.0075');
  const lock = { ...fixture.session.lock, ...found };
  assert.equal(isLiveJudgeLock(lock), true); assert.equal(await verifyLiveJudgeLockAttestation(lock, attestLiveJudgeLock(lock), liveJudgePublicKey()), true);
  for (const [symbol, expiry] of [['ETH/USDC', fixture.market.expiry], ['BTC/USDC', fixture.market.expiry + 1]] as const) {
    installDiscovery(fixture, { oracleResult: encodeFunctionResult({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', result: [symbol, raw, BigInt(expiry), true] }) });
    await assert.rejects(readLiveJudgeMarket({ asset: 'BTC', now: NOW }));
  }
});
