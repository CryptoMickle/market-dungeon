import assert from 'node:assert/strict';
import test from 'node:test';

import {
  liveBtcContextFromMarket,
  liveBtcContextPrice,
  liveBtcContextTime,
} from '../app/live-btc-context.ts';

test('Judge live context formats the current dreamDEX opening line and observation time', () => {
  const context = liveBtcContextFromMarket({
    strikeUsd: '80187.64',
    tradingStart: '1787872500',
    intervalSec: '300',
    lastPrice: '0.42',
  });

  assert.deepEqual(context, {
    priceUsd: '80187.64',
    observedAtIso: '2026-08-27T23:15:00.000Z',
    intervalSec: 300,
  });
  assert.equal(liveBtcContextPrice(context!), '$80,187.64');
  assert.equal(liveBtcContextTime(context!), '23:15 UTC');
});

test('Judge live context fails closed for missing or malformed reference data', () => {
  assert.equal(liveBtcContextFromMarket(null), null);
  assert.equal(liveBtcContextFromMarket({ strikeUsd: 'not-a-price', tradingStart: '1787872500' }), null);
  assert.equal(liveBtcContextFromMarket({ strikeUsd: '80187.64', tradingStart: 'not-a-time' }), null);
  assert.equal(liveBtcContextFromMarket({ strikeUsd: '0', tradingStart: '1787872500' }), null);
});
