import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKET_DUNGEON_PLAY_URL,
  runShareCardDataUrl,
  runShareCardFilename,
  runShareCardSvg,
  runShareCaption,
  runShareClipboardText,
  runShareXUrl,
  type RunShareCardInput,
} from '../app/share-run-card.ts';

const MARKET_ID = `0x${'ab'.repeat(32)}`;

function input(overrides: Partial<RunShareCardInput> = {}): RunShareCardInput {
  return {
    mode: 'JUDGE_REPLAY',
    result: 'BLESSED',
    tier: 4,
    totalTiers: 4,
    reachedRoom: 40,
    totalRooms: 40,
    enemiesDefeated: 2,
    gold: 154,
    lockedDirection: 'UP',
    actualOutcome: 'UP',
    verifiedOnchain: true,
    marketId: MARKET_ID,
    ...overrides,
  };
}

test('social caption communicates progress, result, market outcome, and verification concisely', () => {
  const caption = runShareCaption(input());

  assert.match(caption, /I conquered Market Dungeon/);
  assert.match(caption, /Reached room 40\/40 · 2 enemies defeated · 154 gold/);
  assert.match(caption, /BTC UP → BTC UP/);
  assert.match(caption, /Onchain-verified on Somnia/);
  assert.match(caption, /#Somnia #DreamDEX/);
  assert.ok(Array.from(caption).length <= 240);
  assert.equal(runShareClipboardText(input()), `${caption}\n${MARKET_DUNGEON_PLAY_URL}`);
});

test('X intent contains the social caption and play URL without embedding proof JSON', () => {
  const url = new URL(runShareXUrl(input()));

  assert.equal(`${url.origin}${url.pathname}`, 'https://twitter.com/intent/tweet');
  assert.equal(url.searchParams.get('text'), runShareCaption(input()));
  assert.equal(url.searchParams.get('url'), MARKET_DUNGEON_PLAY_URL);
  assert.doesNotMatch(url.toString(), /verified-judge-run|replayProof|independentRpcVerification/);
});

test('share card SVG renders a social-sized, self-contained progress card', () => {
  const svg = runShareCardSvg(input());

  assert.match(svg, /width="1200" height="675"/);
  assert.match(svg, /DUNGEON CONQUERED/);
  assert.match(svg, /ROOM 40\/40/);
  assert.match(svg, /TIER 4 OF 4/);
  assert.match(svg, />2<\/text>/);
  assert.match(svg, />154<\/text>/);
  assert.match(svg, /BTC UP  →  BTC UP/);
  assert.match(svg, /ONCHAIN VERIFIED · SOMNIA/);
  assert.match(svg, /FINAL-TIER JUDGE REPLAY/);
  assert.match(svg, /RUN 0XABABAB…ABABAB/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=/);
  assert.match(runShareCardDataUrl(input()), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(runShareCardFilename(input()), 'market-dungeon-run-abababab.png');
});

test('unverified combat loss is labeled honestly and clamps unsafe numeric inputs', () => {
  const unsafe = input({
    mode: 'FULL_RUN',
    result: 'DEFEATED',
    tier: 9,
    reachedRoom: 999,
    enemiesDefeated: -4,
    gold: Number.POSITIVE_INFINITY,
    actualOutcome: undefined,
    verifiedOnchain: false,
    marketId: '<script>alert(1)</script>',
  });
  const caption = runShareCaption(unsafe);
  const svg = runShareCardSvg(unsafe);

  assert.match(caption, /expedition ended in combat/);
  assert.match(caption, /Reached room 40\/40 · 0 enemies defeated · 0 gold/);
  assert.match(caption, /Locked BTC UP/);
  assert.doesNotMatch(caption, /Onchain-verified/);
  assert.match(svg, /EXPEDITION ENDED/);
  assert.match(svg, /POWERED BY SOMNIA \+ DREAMDEX/);
  assert.doesNotMatch(svg, /<script|alert\(1\)/);
  assert.equal(runShareCardFilename(unsafe), 'market-dungeon-run.png');
});
