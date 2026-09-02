import assert from 'node:assert/strict';
import test from 'node:test';

import { DREAMDEX_BTC_5M_URL, dreamDexBtcEventContractUrl } from '../app/dreamdex-link.ts';

test('Continue on dreamDEX prefers five minutes and follows the selected interval', () => {
  const destination = new URL(DREAMDEX_BTC_5M_URL);

  assert.equal(destination.protocol, 'https:');
  assert.equal(destination.hostname, 'app.dreamdex.io');
  assert.equal(destination.pathname, '/event-contracts/WBTC:USDso/5m');
  assert.equal(new URL(dreamDexBtcEventContractUrl(300)).pathname, '/event-contracts/WBTC:USDso/5m');
  assert.equal(new URL(dreamDexBtcEventContractUrl(900)).pathname, '/event-contracts/WBTC:USDso/15m');
});
