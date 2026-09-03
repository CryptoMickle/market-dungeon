import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_MARKET_POLL_INTERVAL_MS,
  activeMarketRefreshDelayMs,
  EXPIRED_MARKET_RETRY_MS,
  eventContractIntervalLabel,
  eventContractIntervalName,
  selectBalancedReplayPool,
  selectPreferredActiveMarket,
} from '../app/event-contract-interval.ts';

const UP = { marketId: `0x${'11'.repeat(32)}`, winningOutcome: 0 };
const DOWN = { marketId: `0x${'22'.repeat(32)}`, winningOutcome: 1 };

test('event interval labels default to the preferred five-minute market', () => {
  assert.equal(eventContractIntervalLabel(300), '5m');
  assert.equal(eventContractIntervalName('300'), '5-minute');
  assert.equal(eventContractIntervalLabel(900), '15m');
  assert.equal(eventContractIntervalName('900'), '15-minute');
  assert.equal(eventContractIntervalLabel(undefined), '5m');
});

test('active discovery prefers a live five-minute market over fifteen-minute candidates', () => {
  const selected = selectPreferredActiveMarket([
    { id: '15m', intervalSec: '900', expiry: '1360' },
    { id: '5m-old', intervalSec: '300', expiry: '1120' },
    { id: '5m-fresh', intervalSec: '300', expiry: '1280' },
  ], 1000);

  assert.equal(selected?.id, '5m-fresh');
});

test('active discovery falls back to the fifteen-minute market closest to six minutes remaining', () => {
  const selected = selectPreferredActiveMarket([
    { id: '15m-long', intervalSec: '900', expiry: '1700' },
    { id: '15m-six', intervalSec: '900', expiry: '1360' },
    { id: 'expired-5m', intervalSec: '300', expiry: '999' },
  ], 1000);

  assert.equal(selected?.id, '15m-six');
});

test('active market polling wakes at rollover instead of waiting for the fixed interval', () => {
  const nowMilliseconds = 1_000_000;

  assert.equal(activeMarketRefreshDelayMs('1002', nowMilliseconds), 2_000);
  assert.equal(activeMarketRefreshDelayMs('1100', nowMilliseconds), ACTIVE_MARKET_POLL_INTERVAL_MS);
  assert.equal(activeMarketRefreshDelayMs('999', nowMilliseconds), EXPIRED_MARKET_RETRY_MS);
  assert.equal(activeMarketRefreshDelayMs(undefined, nowMilliseconds), ACTIVE_MARKET_POLL_INTERVAL_MS);
});

test('Judge Replay uses a balanced five-minute pool and only then falls back', () => {
  const preferred = selectBalancedReplayPool([UP, DOWN], []);
  assert.equal(preferred?.intervalSec, 300);
  assert.equal(preferred?.outcomePools[0].length, 1);
  assert.equal(preferred?.outcomePools[1].length, 1);

  const fallback = selectBalancedReplayPool([UP], [UP, DOWN]);
  assert.equal(fallback?.intervalSec, 900);
  assert.equal(selectBalancedReplayPool([UP], [DOWN]), null);
});
