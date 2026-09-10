import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchDreamDexClobOdds } from '../app/api/dreamdex-odds.ts';
import { SOMNIA_MAINNET_PROFILE } from '../app/judge-network.ts';

const MARKET_ID = `0x${'ab'.repeat(32)}`;
const OTHER_ID = `0x${'cd'.repeat(32)}`;
const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
const market = (overrides: Record<string, unknown> = {}) => ({
  marketId: MARKET_ID, quoteDecimals: 6, tradeCount: '0', lastPrice: null, ...overrides,
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  AbortSignal.timeout = originalTimeout;
});

test('mainnet odds read the exact market through the SDK and honor its quote decimals and casing', async () => {
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    reads++;
    assert.equal(String(input), SOMNIA_MAINNET_PROFILE.indexer);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    const body = JSON.parse(String(init.body));
    assert.match(body.query, /BookTops/);
    for (const key of ['bidWhere', 'askWhere']) {
      assert.deepEqual(body.variables[key].market_id, { _in: [MARKET_ID] });
      assert.deepEqual(body.variables[key].status, { _eq: 'Open' });
      assert.deepEqual(body.variables[key].rested, { _eq: true });
      assert.deepEqual(body.variables[key].quantityRemaining, { _gt: '0' });
      assert.ok(BigInt(body.variables[key].expireTimestampNs._gt) > 0n);
    }
    return Response.json({ data: {
      bids: [{ market: MARKET_ID.toUpperCase(), price: '610000' }],
      asks: [{ market: MARKET_ID.toUpperCase(), price: '630000' }],
    } });
  };

  const requestedId = MARKET_ID.toUpperCase().replace('0X', '0x');
  const odds = await fetchDreamDexClobOdds(market({ marketId: requestedId }));
  assert.equal(reads, 1);
  assert.equal(odds.marketId, requestedId);
  assert.equal(odds.upProbability, 0.62);
  assert.equal(odds.downProbability, 0.38);
  assert.equal(odds.source, 'ORDER_BOOK');
  assert.equal(odds.bookStatus, 'ok');
});

test('successful empty and unrelated books are distinguished from read failures without invented odds', async () => {
  for (const bids of [[], [{ market: OTHER_ID, price: '700000' }]]) {
    globalThis.fetch = async () => Response.json({ data: { bids, asks: [] } });
    const odds = await fetchDreamDexClobOdds(market());
    assert.equal(odds.bookStatus, 'ok');
    assert.equal(odds.source, 'UNAVAILABLE');
    assert.equal(odds.upProbability, null);
    assert.equal(odds.downProbability, null);
  }
});

test('failed HTTP, GraphQL and aborted SDK reads report unavailable instead of an empty book', async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const failures = [
    async () => Response.json({ privateProviderMessage: 'do not log' }, { status: 503 }),
    async () => Response.json({ errors: [{ message: 'do not log' }] }),
    async () => { throw new DOMException('do not log', 'TimeoutError'); },
  ];
  for (const failure of failures) {
    globalThis.fetch = failure;
    const odds = await fetchDreamDexClobOdds(market());
    assert.equal(odds.bookStatus, 'unavailable');
    assert.equal(odds.source, 'UNAVAILABLE');
    assert.equal(odds.upProbability, null);
    assert.equal(odds.downProbability, null);
  }
  assert.equal(warnings.length, failures.length);
  assert.doesNotMatch(JSON.stringify(warnings), /do not log|privateProviderMessage/);
});

test('a genuine last trade remains available after empty or failed reads, while a zero-trade price is ignored', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const fail of [false, true]) {
    globalThis.fetch = async () => fail
      ? Response.json({}, { status: 503 })
      : Response.json({ data: { bids: [], asks: [] } });
    const odds = await fetchDreamDexClobOdds(market({ tradeCount: '2', lastPrice: '420000' }));
    assert.equal(odds.source, 'LAST_TRADE');
    assert.equal(odds.upProbability, 0.42);
    assert.equal(odds.downProbability, 0.58);
    assert.equal(odds.bookStatus, fail ? 'unavailable' : 'ok');
    const untraded = await fetchDreamDexClobOdds(market({ lastPrice: '500000' }));
    assert.equal(untraded.source, 'UNAVAILABLE');
    assert.equal(untraded.upProbability, null);
  }
});

test('each SDK read receives a fresh three-second deadline that aborts the underlying request', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const deadlines: AbortController[] = [];
  const fetchSignals: AbortSignal[] = [];
  AbortSignal.timeout = (milliseconds: number) => {
    if (milliseconds !== 3_000) return originalTimeout(milliseconds);
    const controller = new AbortController();
    deadlines.push(controller);
    return controller.signal;
  };
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    const signal = init.signal;
    fetchSignals.push(signal);
    assert.equal(signal.aborted, false);
    if (fetchSignals.length === 1) {
      const pending = new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      deadlines[0].abort(new DOMException('deadline exceeded', 'TimeoutError'));
      return pending;
    }
    return Response.json({ data: { bids: [{ market: MARKET_ID, price: '610000' }], asks: [] } });
  };

  const failed = await fetchDreamDexClobOdds(market());
  assert.equal(failed.bookStatus, 'unavailable');
  assert.equal(fetchSignals[0].aborted, true);
  const recovered = await fetchDreamDexClobOdds(market());
  assert.equal(deadlines.length, 2);
  assert.equal(fetchSignals[1].aborted, false);
  assert.equal(recovered.bookStatus, 'ok');
  assert.equal(recovered.upProbability, 0.61);
});
