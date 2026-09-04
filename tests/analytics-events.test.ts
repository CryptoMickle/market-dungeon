import assert from 'node:assert/strict';
import test from 'node:test';

import {
  challengeCreatedEvent,
  challengeOpenedEvent,
  challengeVerifiedEvent,
  dreamDexCtaClickedEvent,
  hasAnalyticsAutomationMarker,
  judgeDemoEntryEvent,
  judgeDemoLockedEvent,
  judgeDemoRevealAttemptedEvent,
  judgeDemoVerificationFailedEvent,
  judgeDemoVerificationNotProvableEvent,
  judgeDemoVerifiedEvent,
  judgeDurationBucket,
  shareActionEvent,
  shareEngagedEvent,
  shouldEmitAnalyticsEvent,
} from '../app/analytics-events.ts';

test('v2 Judge funnel separates entry, accepted seal, reveal, and verified completion', () => {
  assert.deepEqual(judgeDemoEntryEvent('direct'), {
    path: '/funnel/v2/judge/entry/direct',
  });
  assert.deepEqual(judgeDemoEntryEvent('challenge'), {
    path: '/funnel/v2/judge/entry/challenge',
  });
  assert.deepEqual(judgeDemoLockedEvent(300), {
    path: '/funnel/v2/judge/locked/5m',
  });
  assert.deepEqual(judgeDemoRevealAttemptedEvent(900), {
    path: '/funnel/v2/judge/reveal-attempted/15m',
  });
  assert.deepEqual(judgeDemoVerifiedEvent('DOWN', 'blessed', 300, 89_000), {
    path: '/funnel/v2/judge/verified/5m/60-119s/blessed/down',
  });
});

test('duration buckets have exact conservative two-minute boundaries', () => {
  assert.equal(judgeDurationBucket(0), 'under-60s');
  assert.equal(judgeDurationBucket(59_999), 'under-60s');
  assert.equal(judgeDurationBucket(60_000), '60-119s');
  assert.equal(judgeDurationBucket(119_999), '60-119s');
  assert.equal(judgeDurationBucket(120_000), '120-179s');
  assert.equal(judgeDurationBucket(179_999), '120-179s');
  assert.equal(judgeDurationBucket(180_000), '180s-plus');
  assert.equal(judgeDurationBucket(-1), 'unknown');
  assert.equal(judgeDurationBucket(Number.NaN), 'unknown');
  assert.equal(judgeDurationBucket('90000'), 'unknown');
});

test('verification outcomes use a closed PASS, FAIL, and NOT PROVABLE taxonomy', () => {
  assert.deepEqual(judgeDemoVerificationFailedEvent('server-rejected'), {
    path: '/funnel/v2/judge/verification/fail/server-rejected',
  });
  assert.deepEqual(judgeDemoVerificationFailedEvent('browser-mismatch'), {
    path: '/funnel/v2/judge/verification/fail/browser-mismatch',
  });
  assert.deepEqual(judgeDemoVerificationNotProvableEvent('seal-expired'), {
    path: '/funnel/v2/judge/verification/not-provable/seal-expired',
  });
});

test('dreamDEX v2 analytics distinguishes judge and full runs without identifiers', () => {
  const event = dreamDexCtaClickedEvent('judge_demo', 'UP', 'cursed', 300);

  assert.deepEqual(event, {
    path: '/funnel/v2/dreamdex/continue/5m/judge-demo/cursed/up',
  });
  assert.equal(event.path.includes('market'), false);
  assert.equal(event.path.includes('commitment'), false);
  assert.equal(event.path.includes('wallet'), false);
});

test('share and challenge v2 analytics measures actions without claiming a post', () => {
  const engaged = shareEngagedEvent('judge_demo');
  const xIntent = shareActionEvent('judge_demo', 'x-intent-opened');
  const downloaded = shareActionEvent('full_run', 'card-downloaded');
  const created = challengeCreatedEvent();
  const opened = challengeOpenedEvent();
  const verified = challengeVerifiedEvent();

  assert.deepEqual(engaged, { path: '/funnel/v2/share/engaged/judge-demo' });
  assert.deepEqual(xIntent, { path: '/funnel/v2/share/action/judge-demo/x-intent-opened' });
  assert.deepEqual(downloaded, { path: '/funnel/v2/share/action/full-run/card-downloaded' });
  assert.deepEqual(created, {
    path: '/funnel/v2/challenge/created',
  });
  assert.deepEqual(opened, {
    path: '/funnel/v2/challenge/opened',
  });
  assert.deepEqual(verified, {
    path: '/funnel/v2/challenge/verified',
  });
  for (const event of [engaged, xIntent, downloaded, created, opened, verified]) {
    assert.equal(/market|wallet|commitment|proof|user|challenge=/.test(event.path), false);
  }
});

test('manual funnel analytics excludes WebDriver and the fixed automation marker', () => {
  assert.equal(hasAnalyticsAutomationMarker('?automation=1'), true);
  assert.equal(hasAnalyticsAutomationMarker('?automation=0'), false);
  assert.equal(hasAnalyticsAutomationMarker('?automation=anything-else'), false);
  assert.equal(hasAnalyticsAutomationMarker('?challenge=1&automation=1'), true);
  assert.equal(shouldEmitAnalyticsEvent(false, false), true);
  assert.equal(shouldEmitAnalyticsEvent(true, false), false);
  assert.equal(shouldEmitAnalyticsEvent(false, true), false);
  assert.equal(shouldEmitAnalyticsEvent(true, true), false);
});
