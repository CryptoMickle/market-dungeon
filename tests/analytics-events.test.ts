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

  assert.deepEqual(judgeDemoCompletedEvent('DOWN', 'blessed'), {
    path: '/funnel/judge-demo/completed/blessed/down',
  });
});

test('dreamDEX CTA analytics distinguishes judge and full runs without identifiers', () => {
  const event = dreamDexCtaClickedEvent('judge_demo', 'UP', 'cursed');

  assert.deepEqual(event, {
    path: '/funnel/dreamdex/continue/judge-demo/cursed/up',
  });
  assert.equal(event.path.includes('market'), false);
  assert.equal(event.path.includes('commitment'), false);
  assert.equal(event.path.includes('wallet'), false);
});
