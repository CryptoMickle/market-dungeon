import assert from 'node:assert/strict';
import test from 'node:test';
import { replayCountdownSeconds, replayRetrySeconds } from '../app/judge-retry.ts';

const NOW = Date.parse('2026-09-09T19:00:00.500Z');

test('retry delays honor the longest valid body or header hint and round up', () => {
  assert.equal(replayRetrySeconds(4, null, NOW), 4);
  assert.equal(replayRetrySeconds(' 4.2 ', null, NOW), 5);
  assert.equal(replayRetrySeconds(undefined, '9', NOW), 9);
  assert.equal(replayRetrySeconds(12, '7', NOW), 12);
  assert.equal(replayRetrySeconds(2.1, '7.1', NOW), 8);
});

test('HTTP-date Retry-After is measured against current wall-clock time', () => {
  const retryAt = 'Wed, 09 Sep 2026 19:00:08 GMT';
  assert.equal(replayRetrySeconds(undefined, retryAt, NOW), 8);
  assert.equal(replayRetrySeconds(2, retryAt, NOW), 8);
  assert.equal(replayRetrySeconds(12, retryAt, NOW), 12);
  assert.equal(replayRetrySeconds(undefined, retryAt, NOW + 6_000), 2);
  assert.equal(replayRetrySeconds(undefined, retryAt, NOW + 8_000), 3);
});

test('malformed bodies cannot invoke coercion or strand the retry button', () => {
  const hostileObject = { valueOf() { assert.fail('Body objects must not be coerced to numbers.'); } };
  const invalid: unknown[] = [
    undefined, null, true, false, [], [12], {}, { retryAfter: 12 }, hostileObject, Symbol('retry'),
    NaN, Infinity, -Infinity, -10, 0, '', ' ', 'NaN', 'Infinity', '-Infinity', '-8', '0', 'retry soon', '1e9999',
  ];
  for (const body of invalid) {
    assert.equal(replayRetrySeconds(body, null, NOW), 3);
    assert.equal(replayRetrySeconds(body, '7', NOW), 7);
  }
});

test('malformed, nonpositive and expired headers fall back to a safe delay', () => {
  const invalidHeaders = [
    null, '', ' ', 'NaN', 'Infinity', '-Infinity', '0', '-2', 'soon', 'Wed,', '1e9999',
    'Wed, 09 Sep 2026 18:59:59 GMT',
  ];
  for (const header of invalidHeaders) {
    assert.equal(replayRetrySeconds(undefined, header, NOW), 3);
    assert.equal(replayRetrySeconds(6, header, NOW), 6);
  }
});

test('accepted delays are finite integers bounded between one second and five minutes', () => {
  assert.equal(replayRetrySeconds(Number.MIN_VALUE, null, NOW), 1);
  assert.equal(replayRetrySeconds(0.01, null, NOW), 1);
  assert.equal(replayRetrySeconds(299.1, null, NOW), 300);
  assert.equal(replayRetrySeconds(Number.MAX_VALUE, '2', NOW), 300);
  assert.equal(replayRetrySeconds(2, '999999999', NOW), 300);
  assert.equal(replayRetrySeconds(undefined, 'Thu, 09 Sep 2027 19:00:00 GMT', NOW), 300);
});

test('countdowns catch up after a hidden tab skips ticks and never retain an expired lock', () => {
  const deadline = NOW + replayRetrySeconds(12, null, NOW) * 1_000;
  assert.equal(replayCountdownSeconds(deadline, NOW), 12);
  assert.equal(replayCountdownSeconds(deadline, NOW + 1), 12);
  assert.equal(replayCountdownSeconds(deadline, NOW + 5_500), 7);
  assert.equal(replayCountdownSeconds(deadline, NOW + 11_999), 1);
  assert.equal(replayCountdownSeconds(deadline, NOW + 12_000), 0);
  // No intermediate timer callbacks run while the OS has suspended this tab.
  assert.equal(replayCountdownSeconds(deadline, NOW + 3_600_000), 0);
  assert.equal(replayCountdownSeconds(0, NOW), 0);
  assert.equal(replayCountdownSeconds(NOW, NOW), 0);
});
