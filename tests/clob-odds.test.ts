import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveDreamDexClobOdds, formatClobPercent } from '../app/clob-odds.ts';

test('derives UP and DOWN odds from the midpoint of a two-sided CLOB', () => {
  const odds = deriveDreamDexClobOdds({
    marketId: '0xabc',
    quoteDecimals: 3,
    bestBid: '410',
    bestAsk: '430',
    observedAtIso: '2026-08-29T12:00:00.000Z',
  });

  assert.equal(odds.upProbability, 0.42);
  assert.equal(odds.downProbability, 0.58);
  assert.equal(odds.spread, 0.02);
  assert.equal(odds.source, 'ORDER_BOOK');
  assert.equal(odds.sdk, '@somnia-chain/markets-sdk');
});

test('uses a one-sided book quote before the last traded price', () => {
  const odds = deriveDreamDexClobOdds({
    marketId: '0xabc', quoteDecimals: 2, bestBid: '61', lastPrice: '55',
  });

  assert.equal(odds.upProbability, 0.61);
  assert.equal(odds.downProbability, 0.39);
  assert.equal(odds.source, 'ORDER_BOOK');
});

test('falls back to the last trade when the book is unavailable or crossed', () => {
  const empty = deriveDreamDexClobOdds({
    marketId: '0xabc', quoteDecimals: 2, lastPrice: '55',
  });
  const crossed = deriveDreamDexClobOdds({
    marketId: '0xabc', quoteDecimals: 2, bestBid: '70', bestAsk: '60', lastPrice: '55',
  });

  assert.equal(empty.upProbability, 0.55);
  assert.equal(crossed.upProbability, 0.55);
  assert.equal(crossed.source, 'LAST_TRADE');
});

test('rejects malformed probabilities and formats display percentages', () => {
  const odds = deriveDreamDexClobOdds({
    marketId: '0xabc', quoteDecimals: 2, bestBid: '101', bestAsk: 'oops', lastPrice: '-1',
  });

  assert.equal(odds.upProbability, null);
  assert.equal(odds.downProbability, null);
  assert.equal(odds.source, 'UNAVAILABLE');
  assert.equal(formatClobPercent(0.427, 1), '42.7%');
  assert.equal(formatClobPercent(null), '—');
});
