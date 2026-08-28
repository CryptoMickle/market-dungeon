import assert from 'node:assert/strict';
import test from 'node:test';

import { DREAMDEX_BTC_15M_URL } from '../app/dreamdex-link.ts';

test('Continue on dreamDEX opens the canonical live BTC 15-minute market', () => {
  const destination = new URL(DREAMDEX_BTC_15M_URL);

  assert.equal(destination.protocol, 'https:');
  assert.equal(destination.hostname, 'app.dreamdex.io');
  assert.equal(destination.pathname, '/event-contracts/WBTC:USDso/15m');
});
