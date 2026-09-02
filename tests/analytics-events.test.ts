import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dreamDexCtaClickedEvent,
  judgeDemoCompletedEvent,
  judgeDemoStartedEvent,
} from '../app/analytics-events.ts';

test('Judge Demo analytics uses stable anonymous event contracts', () => {
  assert.deepEqual(judgeDemoStartedEvent(), {
    name: 'judge_demo_started',
    properties: {
      experience: 'sealed_replay_v1',
      network: 'somnia_mainnet',
      chain_id: 5031,
    },
  });

  assert.deepEqual(judgeDemoCompletedEvent('DOWN', 'blessed'), {
    name: 'judge_demo_completed',
    properties: {
      experience: 'sealed_replay_v1',
      network: 'somnia_mainnet',
      chain_id: 5031,
      direction: 'DOWN',
      result: 'blessed',
      verified: true,
    },
  });
});

test('dreamDEX CTA analytics distinguishes judge and full runs without identifiers', () => {
  const event = dreamDexCtaClickedEvent('judge_demo', 'UP', 'cursed');

  assert.deepEqual(event, {
    name: 'dreamdex_cta_clicked',
    properties: {
      network: 'somnia_mainnet',
      chain_id: 5031,
      mode: 'judge_demo',
      direction: 'UP',
      result: 'cursed',
    },
  });
  assert.equal('marketId' in event.properties, false);
  assert.equal('commitment' in event.properties, false);
  assert.equal('wallet' in event.properties, false);
});
