import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dreamDexCtaClickedEvent,
  judgeDemoCompletedEvent,
  judgeDemoStartedEvent,
} from '../app/analytics-events.ts';

test('Judge Demo analytics uses stable anonymous funnel paths', () => {
  assert.deepEqual(judgeDemoStartedEvent(), {
    path: '/funnel/judge-demo/started',
  });

  assert.deepEqual(judgeDemoCompletedEvent('DOWN', 'blessed', 300), {
    path: '/funnel/judge-demo/completed/5m/blessed/down',
  });
});

test('dreamDEX CTA analytics distinguishes judge and full runs without identifiers', () => {
  const event = dreamDexCtaClickedEvent('judge_demo', 'UP', 'cursed', 300);

  assert.deepEqual(event, {
    path: '/funnel/dreamdex/continue/5m/judge-demo/cursed/up',
  });
  assert.equal(event.path.includes('market'), false);
  assert.equal(event.path.includes('commitment'), false);
  assert.equal(event.path.includes('wallet'), false);
});
