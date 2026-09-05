import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isChallengeEntry,
  MARKET_DUNGEON_CHALLENGE_URL,
  MARKET_DUNGEON_PLAY_URL,
  runShareCardArtworkPath,
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

test('Judge Replay caption communicates replay progress without claiming a full expedition', () => {
  const caption = runShareCaption(input());

  assert.match(caption, /I beat Market Dungeon's final-tier Judge Replay/);
  assert.match(caption, /2 of 2 replay encounters cleared · 154 gold/);
  assert.match(caption, /BTC UP → BTC UP/);
  assert.match(caption, /Onchain-verified on Somnia/);
  assert.match(caption, /Can you beat my run\?/);
  assert.match(caption, /#Somnia #DreamDEX/);
  assert.doesNotMatch(caption, /conquered Market Dungeon|Reached room 40\/40/i);
  assert.ok(Array.from(caption).length <= 240);
  assert.equal(runShareClipboardText(input()), `${caption}\n${MARKET_DUNGEON_CHALLENGE_URL}`);
});

test('X intent contains the social caption and play URL without embedding proof JSON', () => {
  const url = new URL(runShareXUrl(input()));

  assert.equal(`${url.origin}${url.pathname}`, 'https://twitter.com/intent/tweet');
  assert.equal(url.searchParams.get('text'), runShareCaption(input()));
  assert.equal(url.searchParams.get('url'), MARKET_DUNGEON_CHALLENGE_URL);
  assert.doesNotMatch(url.toString(), /verified-judge-run|replayProof|independentRpcVerification/);
});

test('challenge entry is explicit and carries no run or player identifier', () => {
  const challenge = new URL(MARKET_DUNGEON_CHALLENGE_URL);

  assert.equal(`${challenge.origin}${challenge.pathname}`, `${MARKET_DUNGEON_PLAY_URL}/judge`);
  assert.equal(challenge.search, '?challenge=1');
  assert.equal(isChallengeEntry(challenge.search), true);
  assert.equal(isChallengeEntry('?challenge=0'), false);
  assert.equal(isChallengeEntry('?challenge=1&marketId=untrusted'), true);
  assert.doesNotMatch(MARKET_DUNGEON_CHALLENGE_URL, /marketId|wallet|commitment|proof|user/i);
});

test('Judge Replay card renders replay progress without claiming all 40 rooms', () => {
  const svg = runShareCardSvg(input());

  assert.match(svg, /width="1200" height="675"/);
  assert.match(svg, /JUDGE REPLAY CLEARED/);
  assert.match(svg, /REPLAY PROGRESS/);
  assert.match(svg, /2 OF 2/);
  assert.match(svg, /REPLAY ENCOUNTERS/);
  assert.match(svg, /TWO-ENCOUNTER CHECKPOINT/);
  assert.doesNotMatch(svg, /DUNGEON CONQUERED|ROOM 40\/40/);
  assert.match(svg, />154<\/text>/);
  assert.match(svg, /BTC UP  →  BTC UP/);
  assert.match(svg, /ONCHAIN VERIFIED · SOMNIA/);
  assert.match(svg, /FINAL-TIER JUDGE REPLAY/);
  assert.match(svg, /RUN 0XABABAB…ABABAB/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=/);
  assert.match(runShareCardDataUrl(input()), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(runShareCardFilename(input()), 'market-dungeon-run-abababab.png');
  assert.equal(runShareCardArtworkPath(input()), '/monsters/boss-4-chairman-below.webp');
});

test('share card artwork follows the bounded dungeon tier', () => {
  assert.equal(runShareCardArtworkPath(input({ tier: 1 })), '/monsters/boss-1-dungeon-lord.webp');
  assert.equal(runShareCardArtworkPath(input({ tier: 2 })), '/monsters/boss-2-senior-dungeon-lord.webp');
  assert.equal(runShareCardArtworkPath(input({ tier: 3 })), '/monsters/boss-3-executive-overlord.webp');
  assert.equal(runShareCardArtworkPath(input({ tier: 99 })), '/monsters/boss-4-chairman-below.webp');
});

test('every Judge Replay outcome stays replay-specific and clamps progress to two encounters', () => {
  for (const result of ['BLESSED', 'CURSED', 'VOID', 'DEFEATED'] as const) {
    const judge = input({ result, enemiesDefeated: 99 });
    const caption = runShareCaption(judge);
    const svg = runShareCardSvg(judge);

    assert.match(caption, /final-tier Judge Replay/);
    assert.match(caption, /2 of 2 replay encounters cleared/);
    assert.doesNotMatch(caption, /conquered Market Dungeon|Reached room/i);
    assert.ok(Array.from(caption).length <= 240);
    assert.match(svg, /FINAL-TIER JUDGE REPLAY/);
    assert.match(svg, /2 OF 2/);
    assert.doesNotMatch(svg, /DUNGEON CONQUERED|ROOM 40\/40/);
  }
});

test('full expedition keeps its actual room and tier progress', () => {
  const fullRun = input({
    mode: 'FULL_RUN',
    tier: 2,
    reachedRoom: 17,
    enemiesDefeated: 16,
  });
  const caption = runShareCaption(fullRun);
  const svg = runShareCardSvg(fullRun);

  assert.match(caption, /I conquered Market Dungeon/);
  assert.match(caption, /Reached room 17\/40 · 16 enemies defeated/);
  assert.match(svg, /DUNGEON CONQUERED/);
  assert.match(svg, /ROOM 17\/40/);
  assert.match(svg, /TIER 2 OF 4/);
  assert.doesNotMatch(svg, /REPLAY PROGRESS|TWO-ENCOUNTER CHECKPOINT/);
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
  assert.match(svg, /ROOM 40\/40/);
  assert.match(svg, /TIER 4 OF 4/);
  assert.match(svg, /ACROSS THIS EXPEDITION/);
  assert.doesNotMatch(svg, /REPLAY PROGRESS|TWO-ENCOUNTER CHECKPOINT/);
  assert.doesNotMatch(svg, /<script|alert\(1\)/);
  assert.equal(runShareCardFilename(unsafe), 'market-dungeon-run.png');
});
