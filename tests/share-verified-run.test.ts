import assert from 'node:assert/strict';
import test from 'node:test';

import { verifiedRunShareText } from '../app/share-verified-run.ts';

const MARKET_ID = `0x${'ab'.repeat(32)}`;
const COMMITMENT = `0x${'cd'.repeat(32)}`;
const SETTLEMENT = `0x${'ef'.repeat(20)}`;
const DIRECT_PROOF = {
  intervalSec: 300,
  onchainBlockNumber: '401957733',
  settlementAddress: SETTLEMENT,
  payoutNumerators: ['10000000', '0'] as [string, string],
};

test('share text includes the locked choice, actual outcome, proof, and app link', () => {
  const text = verifiedRunShareText({
    lockedDirection: 'DOWN',
    winningOutcome: 0,
    result: 'CURSED',
    marketId: MARKET_ID,
    commitment: COMMITMENT,
    combatSteps: 6,
    ...DIRECT_PROOF,
  });

  assert.match(text, /Locked choice: BTC DOWN/);
  assert.match(text, /Market: BTC 5m/);
  assert.match(text, /Actual outcome: BTC UP/);
  assert.match(text, /BOSS LAST STAND — prediction incorrect/);
  assert.match(text, new RegExp(MARKET_ID));
  assert.match(text, new RegExp(COMMITMENT));
  assert.match(text, /Combat verified: guard \+ boss · 6 actions/);
  assert.match(text, /Direct Somnia RPC settlement: block #401957733 · payout \[10000000, 0\]/);
  assert.match(text, new RegExp(SETTLEMENT));
  assert.match(text, /https:\/\/explorer\.somnia\.network\/search\?q=/);
  assert.match(text, /https:\/\/market-dungeon\.vercel\.app/);
});

test('winning outcome zero maps to UP and one maps to DOWN', () => {
  const up = verifiedRunShareText({
    lockedDirection: 'UP', winningOutcome: 0, result: 'BLESSED',
    marketId: MARKET_ID, commitment: COMMITMENT, combatSteps: 3,
    ...DIRECT_PROOF,
  });
  const down = verifiedRunShareText({
    lockedDirection: 'DOWN', winningOutcome: 1, result: 'BLESSED',
    marketId: MARKET_ID, commitment: COMMITMENT, combatSteps: 3,
    ...DIRECT_PROOF,
  });
  assert.match(up, /Actual outcome: BTC UP/);
  assert.match(down, /Actual outcome: BTC DOWN/);
});
