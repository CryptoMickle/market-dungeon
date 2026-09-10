import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isChallengeEntry,
  isLocalLiveJudgePreview,
  liveJudgeChallengeUrl,
  MARKET_DUNGEON_CHALLENGE_URL,
  MARKET_DUNGEON_PLAY_URL,
  MARKET_DUNGEON_SLOGAN,
  runShareCardArtworkPath,
  runShareCardDataUrl,
  runShareCardFilename,
  runShareCardSvg,
  runShareCaption,
  runShareChallengeUrl,
  runShareClipboardText,
  runShareXUrl,
  runShareSettlementVerified,
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
  assert.match(caption, /Can you defeat both the boss and the market\?/);
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
  assert.match(svg, /DEFEAT THE BOSS\. PREDICT THE MARKET\. SURVIVE BOTH\./);
  assert.match(svg, /RUN 0XABABAB…ABABAB/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=/);
  assert.match(runShareCardDataUrl(input()), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(runShareCardFilename(input()), 'market-dungeon-run-abababab.png');
  assert.equal(runShareCardArtworkPath(input()), '/monsters/boss-4-chairman-below.webp');
});

test('the product slogan describes the full game rather than the Judge-only verifier', () => {
  assert.equal(MARKET_DUNGEON_SLOGAN, 'DEFEAT THE BOSS. PREDICT THE MARKET. SURVIVE BOTH.');
  assert.doesNotMatch(MARKET_DUNGEON_SLOGAN, /verif/i);
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

test('live Judge cards and captions identify a one-minute local Shannon run for every result', () => {
  for (const result of ['BLESSED', 'CURSED', 'VOID', 'DEFEATED'] as const) {
    const live = input({
      mode: 'LIVE_JUDGE', result, enemiesDefeated: 99, gold: 999_999,
      actualOutcome: result === 'VOID' ? 'VOID' : result === 'CURSED' ? 'DOWN' : 'UP',
      verifiedOnchain: result !== 'DEFEATED',
    });
    const caption = runShareCaption(live);
    const svg = runShareCardSvg(live);
    assert.match(caption, /Live Judge/);
    assert.match(caption, /1-minute · Shannon testnet/);
    assert.match(caption, /2\/2 encounters · 999999 gold/);
    assert.match(caption, /Local preview · links work only on this Mac/);
    assert.ok(Array.from(caption).length <= 240, `${result}: ${Array.from(caption).length} characters`);
    assert.match(svg, /LIVE JUDGE · SHANNON TESTNET/);
    assert.match(svg, /COMBAT PROGRESS/);
    assert.match(svg, /2 OF 2/);
    assert.match(svg, /1 MINUTE/);
    assert.match(svg, /LOCAL PREVIEW · NOT PUBLISHED/);
    assert.doesNotMatch(`${caption}\n${svg}`, /replay|expedition|room 40|tier 4|market-dungeon\.vercel\.app/i);
    if (result === 'DEFEATED') {
      assert.match(svg, /FELL IN COMBAT/);
      assert.match(svg, /NO SETTLEMENT APPLIED/);
      assert.doesNotMatch(caption, /settlement verified/);
    } else {
      assert.match(svg, /CHAIN RESULT VERIFIED/);
      assert.match(caption, /Chain settlement verified · server-signed choice/);
    }
  }
});

test('live combat loss or inconsistent outcomes cannot claim a verified chain result', () => {
  for (const live of [
    input({ mode: 'LIVE_JUDGE', result: 'DEFEATED', verifiedOnchain: true, enemiesDefeated: 1 }),
    input({ mode: 'LIVE_JUDGE', result: 'BLESSED', actualOutcome: 'DOWN' }),
    input({ mode: 'LIVE_JUDGE', result: 'CURSED', actualOutcome: 'UP' }),
    input({ mode: 'LIVE_JUDGE', result: 'VOID', actualOutcome: 'UP' }),
  ]) {
    assert.equal(runShareSettlementVerified(live), false);
    assert.match(runShareCaption(live), /No settlement applied/);
    assert.match(runShareCardSvg(live), /NO SETTLEMENT APPLIED/);
    assert.doesNotMatch(runShareCardSvg(live), /CHAIN RESULT VERIFIED|BTC UP  →/);
  }
  const partial = input({ mode: 'LIVE_JUDGE', result: 'DEFEATED', enemiesDefeated: 1, actualOutcome: undefined, verifiedOnchain: false });
  assert.match(runShareCardSvg(partial), /width="500" height="10"/);
  assert.match(runShareCaption(partial), /1\/2 encounters/);
});

test('live invitation links stay on the configured origin without replay or proof data', () => {
  const live = input({ mode: 'LIVE_JUDGE' });
  const challenge = liveJudgeChallengeUrl('http://localhost:3000/somewhere?marketId=secret#proof');
  assert.equal(challenge, 'http://localhost:3000/shannon/live-judge?challenge=1');
  const supplied = `${challenge}&marketId=private&proof=private#private`;
  assert.equal(runShareChallengeUrl(live, supplied), challenge);
  assert.equal(runShareClipboardText(live, supplied), `${runShareCaption(live)}\n${challenge}`);
  const x = new URL(runShareXUrl(live, supplied));
  assert.equal(x.searchParams.get('url'), challenge);
  assert.equal(x.searchParams.get('text'), runShareCaption(live));
  assert.doesNotMatch(x.toString(), /private|marketId|proof=/);
  for (const unavailable of [undefined, MARKET_DUNGEON_CHALLENGE_URL, `${MARKET_DUNGEON_PLAY_URL}/shannon/judge`, 'javascript:alert(1)', '/shannon/live-judge', 'https://user:secret@example.com/shannon/live-judge', 'file:///shannon/live-judge']) {
    assert.equal(runShareChallengeUrl(live, unavailable), null);
    assert.equal(runShareClipboardText(live, unavailable), runShareCaption(live));
    assert.equal(new URL(runShareXUrl(live, unavailable)).searchParams.has('url'), false);
  }
  assert.throws(() => liveJudgeChallengeUrl('file:///tmp/proof.json'), /HTTP origin/);
  assert.throws(() => liveJudgeChallengeUrl('https://user:secret@example.com'), /HTTP origin/);
});

test('live export uses the live boss and filename without reinterpreting it as a full run', () => {
  const live = input({ mode: 'LIVE_JUDGE', tier: 1, asset: 'ETH', actualOutcome: 'UP' });
  assert.equal(runShareCardArtworkPath(live), '/monsters/boss-4-chairman-below.webp');
  assert.equal(runShareCardFilename(live), 'market-dungeon-live-run-abababab.png');
  assert.match(runShareCaption(live), /ETH UP → ETH UP/);
  assert.match(runShareCardSvg(live), /ETH UP  →  ETH UP/);
  assert.doesNotMatch(runShareCardSvg(live), /BTC/);
});

for (const origin of [MARKET_DUNGEON_PLAY_URL, 'https://market-dungeon-phone-crypto-mickle.vercel.app']) test(`live invitations work on ${origin} and retain truthful testnet cards`, () => {
  const live = input({ mode: 'LIVE_JUDGE' });
  const supplied = `${origin}/shannon/live-judge?marketId=private&challenge=1#proof`;
  const challenge = `${origin}/shannon/live-judge?challenge=1`;
  const caption = runShareCaption(live, supplied);
  const svg = runShareCardSvg(live, supplied);

  assert.equal(isLocalLiveJudgePreview(challenge), false);
  assert.equal(runShareChallengeUrl(live, supplied), challenge);
  assert.equal(runShareClipboardText(live, supplied), `${caption}\n${challenge}`);
  assert.match(caption, /Shannon testnet · try your own live run/);
  assert.match(svg, /LIVE JUDGE · SHANNON TESTNET/);
  assert.ok(Array.from(caption).length <= 240);
  assert.doesNotMatch(`${caption}\n${svg}`, /only on this Mac|LOCAL PREVIEW|NOT PUBLISHED|marketId=private|#proof/i);
  const draft = new URL(runShareXUrl(live, supplied));
  assert.equal(draft.searchParams.get('url'), challenge);
  assert.equal(draft.searchParams.get('text'), caption);
  assert.equal(decodeURIComponent(runShareCardDataUrl(live, supplied).split(',')[1]), svg);

  // Live context must not change the established Full/Replay card copy.
  for (const mode of ['FULL_RUN', 'JUDGE_REPLAY'] as const) {
    const run = input({ mode });
    assert.equal(runShareCaption(run, supplied), runShareCaption(run));
    assert.equal(runShareCardSvg(run, supplied), runShareCardSvg(run));
    assert.equal(runShareChallengeUrl(run), MARKET_DUNGEON_CHALLENGE_URL);
  }
});

test('live loopback links retain their local warning even with HTTPS', () => {
  const live = input({ mode: 'LIVE_JUDGE' });
  for (const origin of [
    'http://localhost:3000', 'https://localhost:3000', 'https://dungeon.localhost',
    'https://127.0.0.1', 'https://127.1.2.3', 'https://[::1]:3000',
  ]) {
    const challenge = liveJudgeChallengeUrl(origin);
    assert.equal(isLocalLiveJudgePreview(challenge), true, origin);
    assert.match(runShareCaption(live, challenge), /Local preview · links work only on this Mac/);
    assert.match(runShareCardSvg(live, challenge), /LOCAL PREVIEW · NOT PUBLISHED/);
  }
  for (const unavailable of [undefined, 'not-a-url', 'javascript:alert(1)', 'https://user:secret@example.com']) {
    assert.equal(isLocalLiveJudgePreview(unavailable), true);
  }
  assert.equal(isLocalLiveJudgePreview('https://localhost.example.com/shannon/live-judge'), false);
});
