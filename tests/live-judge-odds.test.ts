import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveJudgeOddsHandler } from '../app/api/live-judge/odds.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import { LIVE_JUDGE } from '../app/live-judge-proof.ts';
import { SHANNON_TESTNET_PROFILE } from '../app/judge-network.ts';

const MARKET_ID = `0x${'ad'.repeat(32)}`;
const OTHER_ID = `0x${'bc'.repeat(32)}`;
const NOW = 1_800_000_030;
const originalFetch = globalThis.fetch;
function row(overrides: Record<string, unknown> = {}) {
  return { marketId: MARKET_ID, marketType: 'BINARY', asset: 'BTC', intervalSec: '60', operatorId: 4,
    venueId: LIVE_JUDGE.venueId, collateral: LIVE_JUDGE.collateral, tradingStart: String(NOW - 30), expiry: String(NOW + 30),
    clobStatus: 'Trading', finalized: false, voided: false, winningOutcome: null, quoteDecimals: 18, lastPrice: '500000000000000000', tradeCount: '0', ...overrides };
}
function request(id = MARKET_ID, suffix = '') { return new Request(`http://local.test/api/live-judge/odds?marketId=${id}${suffix}`); }
test.beforeEach(() => resetRequestControlForTests());
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('live odds use only the Shannon indexer and the requested market in the real SDK book query', async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), SHANNON_TESTNET_PROFILE.indexer);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.signal instanceof AbortSignal, true);
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.query.includes('LiveJudgeOddsMarket')) {
      assert.deepEqual(body.variables, { id: MARKET_ID });
      return Response.json({ data: { Market_by_pk: row({ quoteDecimals: 6 }) } });
    }
    assert.match(body.query, /BookTops/);
    for (const key of ['bidWhere', 'askWhere']) {
      assert.deepEqual(body.variables[key].market_id, { _in: [MARKET_ID] });
      assert.deepEqual(body.variables[key].status, { _eq: 'Open' });
      assert.deepEqual(body.variables[key].rested, { _eq: true });
      assert.deepEqual(body.variables[key].quantityRemaining, { _gt: '0' });
      assert.ok(BigInt(body.variables[key].expireTimestampNs._gt) > 0n);
    }
    return Response.json({ data: { bids: [{ market: MARKET_ID, price: '610000' }], asks: [{ market: MARKET_ID, price: '630000' }] } });
  };
  const response = await createLiveJudgeOddsHandler({ now: () => NOW })(request(MARKET_ID.toUpperCase().replace('0X', '0x')));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/);
  const body = await response.json();
  assert.equal(calls.length, 2); assert.equal(body.chainId, 50312); assert.equal(body.venueId, LIVE_JUDGE.venueId);
  assert.equal(body.marketId, MARKET_ID); assert.equal(body.intervalSec, 60); assert.equal(body.state, 'open');
  assert.equal(body.odds.marketId, MARKET_ID); assert.equal(body.odds.upProbability, 0.62);
  assert.equal(body.odds.downProbability, 0.38); assert.equal(body.odds.source, 'ORDER_BOOK');
});

test('empty or unrelated books never fabricate 50/50 odds or substitute another market', async () => {
  for (const books of [{}, { [OTHER_ID]: { bestBid: '700000000000000000', bestAsk: '800000000000000000', mid: null } }]) {
    const response = await createLiveJudgeOddsHandler({ now: () => NOW, row: async () => row(), book: async id => { assert.equal(id, MARKET_ID); return books; } })(request());
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.state, 'open'); assert.equal(body.odds.source, 'UNAVAILABLE');
    assert.equal(body.odds.upProbability, null); assert.equal(body.odds.downProbability, null);
  }
});

test('last-price fallback requires an actual trade in the exact market', async () => {
  const response = await createLiveJudgeOddsHandler({ now: () => NOW, row: async () => row({ tradeCount: '2', lastPrice: '420000000000000000' }), book: async () => ({}) })(request());
  const body = await response.json();
  assert.equal(body.odds.source, 'LAST_TRADE'); assert.equal(body.odds.upProbability, 0.42);
});

test('invalid IDs, duplicate parameters and network overrides do not reach the indexer', async () => {
  let reads = 0;
  const handler = createLiveJudgeOddsHandler({ row: async () => { reads++; return row(); } });
  for (const bad of [request('0x123'), request(MARKET_ID, '&chainId=5031'), request(MARKET_ID, `&marketId=${OTHER_ID}`), request(MARKET_ID, '&asset=ETH')]) {
    assert.equal((await handler(bad)).status, 400);
  }
  assert.equal(reads, 0);
});

test('wrong venue, collateral, operator, cadence, asset and metadata identity cannot read a book', async () => {
  let bookReads = 0;
  for (const invalid of [{ marketId: OTHER_ID }, { operatorId: 2 }, { venueId: OTHER_ID },
    { collateral: '0x00000022da000002656c64d9ea6011ea952d008a' }, { intervalSec: '300' }, { asset: 'SOL' },
    { expiry: String(NOW + 31) }, { quoteDecimals: null }, { quoteDecimals: 37 }, { finalized: undefined }]) {
    const handler = createLiveJudgeOddsHandler({ now: () => NOW, row: async () => row(invalid), book: async () => { bookReads++; return {}; } });
    assert.equal((await handler(request())).status, 404);
  }
  assert.equal(bookReads, 0);
});

test('closed and finalized markets clear odds without a book read', async () => {
  let bookReads = 0;
  for (const change of [{}, { finalized: true }, { voided: true }, { clobStatus: 'Expired' }, { winningOutcome: 0 }]) {
    const handler = createLiveJudgeOddsHandler({ now: () => Object.keys(change).length ? NOW : NOW + 30,
      row: async () => row(change), book: async () => { bookReads++; return {}; } });
    const response = await handler(request()); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.state, 'closed'); assert.equal(body.odds.upProbability, null);
  }
  assert.equal(bookReads, 0);
});

test('a slow book crossing expiry cannot return a stale live probability', async () => {
  let now = NOW;
  const handler = createLiveJudgeOddsHandler({ now: () => now, row: async () => row(), book: async () => {
    now += 30; return { [MARKET_ID]: { bestBid: '600000000000000000', bestAsk: '700000000000000000', mid: null } };
  } });
  const body = await (await handler(request())).json();
  assert.equal(body.state, 'closed'); assert.equal(body.odds.source, 'UNAVAILABLE'); assert.equal(body.odds.upProbability, null);
});

test('failed or aborted upstream reads return retryable unavailable odds without claiming an empty book', async () => {
  for (const failure of ['row', 'book']) {
    const handler = createLiveJudgeOddsHandler({ now: () => NOW,
      row: async () => { if (failure === 'row') throw new Error('indexer unavailable'); return row({ tradeCount: '2' }); },
      book: async () => { throw new DOMException('deadline exceeded', 'TimeoutError'); },
    });
    const response = await handler(request()); const body = await response.json();
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '5');
    assert.equal(body.state, 'unavailable'); assert.equal(body.odds.source, 'UNAVAILABLE');
    assert.equal(body.odds.upProbability, null); assert.equal(body.marketId, MARKET_ID);
  }
});

test('odds polling is rate-limited without additional upstream requests', async () => {
  let reads = 0;
  const handler = createLiveJudgeOddsHandler({ now: () => NOW, row: async () => { reads++; return row(); }, book: async () => ({}) });
  for (let attempt = 0; attempt < 60; attempt++) assert.equal((await handler(request())).status, 200);
  const response = await handler(request());
  assert.equal(response.status, 429); assert.equal(reads, 60); assert.ok(Number(response.headers.get('retry-after')) > 0);
});
