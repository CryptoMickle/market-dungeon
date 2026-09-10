import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { BOSS_SCORE_GAIN } from '../../app/boss-battle-score';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { LIVE_JUDGE, type LiveJudgeProof } from '../../app/live-judge-proof';
import { SOMNIA_MAINNET_PROFILE } from '../../app/judge-network';
import { liveJudgeFixture } from './live-judge-fixture';
import { expectSubstantialMobileCombat } from './mobile-combat-layout';

const PATH = '/shannon/live-judge';
const STORAGE = 'market-dungeon-live-judge-v1';
type Fixture = ReturnType<typeof liveJudgeFixture>;
type LiveAudioWindow = typeof window & { readLiveAudio: () => { starts: number; stops: number; resumes: number } };

async function installAudioProbe(page: Page) {
  await page.addInitScript(scoreGain => {
    const buses = new WeakSet<AudioParam>();
    let starts = 0;
    let stops = 0;
    let resumes = 0;
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (value, time) {
      if (value === scoreGain) { buses.add(this); starts++; }
      if (value === 0 && buses.has(this)) stops++;
      return ramp.call(this, value, time);
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () { resumes++; return resume.call(this); };
    (window as LiveAudioWindow).readLiveAudio = () => ({ starts, stops, resumes });
  }, BOSS_SCORE_GAIN);
}

async function installLive(page: Page, fixture: Fixture, options: {
  market?: (route: Route, attempt: number) => Promise<void>;
  odds?: (route: Route, attempt: number) => Promise<void>;
  start?: (route: Route, attempt: number) => Promise<void>;
  reveal?: (route: Route, attempt: number) => Promise<void>;
  rpc?: (route: Route, attempt: number) => Promise<void>;
} = {}) {
  const calls = { markets: 0, odds: [] as string[], starts: [] as unknown[], reveals: [] as unknown[], rpc: 0, forbidden: [] as string[] };
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/live-judge/market?*', async route => {
    calls.markets++;
    expect(new URL(route.request().url()).searchParams.get('asset')).toBe('BTC');
    if (options.market) await options.market(route, calls.markets);
    else await route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } });
  });
  await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
  await page.route('**/api/live-judge/odds?*', async route => {
    expect(route.request().method()).toBe('GET');
    calls.odds.push(new URL(route.request().url()).searchParams.get('marketId')!);
    if (options.odds) await options.odds(route, calls.odds.length);
    else await route.fulfill({ json: liveOdds(fixture) });
  });
  await page.route('**/api/live-judge/start', async route => {
    calls.starts.push(route.request().postDataJSON());
    if (options.start) await options.start(route, calls.starts.length);
    else await route.fulfill({ json: { live: fixture.session } });
  });
  await page.route('**/api/live-judge/reveal', async route => {
    const body = route.request().postDataJSON();
    calls.reveals.push(body);
    expect(body).toEqual({ seal: fixture.session.seal, actions: fixture.actions });
    if (options.reveal) await options.reveal(route, calls.reveals.length);
    else await route.fulfill({ json: fixture.settled });
  });
  await page.route(LIVE_JUDGE.rpc, async route => {
    calls.rpc++;
    if (options.rpc) { await options.rpc(route, calls.rpc); return; }
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
  });
  for (const pattern of ['**/api/judge-replay/**', '**/api/shannon/judge-replay/**', '**/api/market**', SOMNIA_MAINNET_PROFILE.rpc]) {
    await page.route(pattern, async route => { calls.forbidden.push(route.request().url()); await route.abort('failed'); });
  }
  return calls;
}

function liveOdds(fixture: Fixture, market = fixture.market, quotes: { bestBid?: string; bestAsk?: string; lastPrice?: string } = { bestBid: '590000', bestAsk: '610000' }) {
  return {
    marketId: market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId),
    intervalSec: 60, asset: 'BTC', expiry: market.expiry, state: 'open',
    odds: deriveDreamDexClobOdds({ marketId: market.marketId, quoteDecimals: 6,
      observedAtIso: new Date(fixture.now * 1_000).toISOString(), ...quotes }),
  };
}

async function expectLiveModeNavigation(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Choose game mode', exact: true });
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveText(['FULL EXPEDITION', 'JUDGE DEMO']);
  await expect(navigation.getByRole('link', { name: 'FULL EXPEDITION', exact: true })).toHaveAttribute('href', '/');
  await expect(navigation.getByRole('link', { name: 'JUDGE DEMO', exact: true })).toHaveAttribute('href', PATH);
  await expect(navigation.getByRole('link', { name: 'JUDGE DEMO', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(variants).toBeVisible();
  await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
  await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/shannon/judge');
  const live = variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true });
  await expect(live).toHaveAttribute('href', PATH);
  await expect(live).toHaveAttribute('aria-current', 'page');
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
}

async function openLive(page: Page, fixture: Fixture, freezeClock = false) {
  await page.clock.install({ time: fixture.now * 1_000 });
  if (freezeClock) await page.clock.pauseAt((fixture.now + 1) * 1_000);
  await page.goto(PATH);
  await expect(page.getByRole('button', { name: /LOCK BTC UP & ENTER DUNGEON/ })).toBeEnabled();
}

async function lockLive(page: Page, direction = 'UP') {
  if (direction === 'DOWN') await page.getByRole('button', { name: /BTC DOWN/ }).click();
  await page.getByRole('button', { name: `LOCK BTC ${direction} & ENTER DUNGEON` }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
}

async function playGuard(page: Page, fixture: Fixture) {
  for (const action of fixture.actions.filter(action => action.room === 8)) {
    await page.getByRole('button', { name: action.action === 'potion' ? /POTION.*HEAL \+25 HP/ : /ATTACK/ }).click();
  }
}

async function playBoss(page: Page, fixture: Fixture) {
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  for (const action of fixture.actions.filter(action => action.room === 9)) {
    await page.getByRole('button', { name: action.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
  }
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
}

async function advance(page: Page, fixture: Fixture, seconds: number) {
  await page.clock.setSystemTime((fixture.now + seconds) * 1_000);
  await page.clock.runFor(1_000);
}

async function finishSceneAnimations(page: Page, outcome: string) {
  await expect.poll(() => page.locator(`[data-boss-scene="${outcome}"]`).evaluate(element =>
    element.getAnimations({ subtree: true }).every(animation =>
      animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === 'finished'),
  )).toBe(true);
}

async function expectLiveShare(page: Page, enemies: number, result: 'BLESSED' | 'CURSED' | 'VOID' | 'DEFEATED') {
  await expect(page.getByLabel('Final run statistics', { exact: true })).toContainText(`${enemies}/2`);
  const conditions = page.getByLabel('Two victory conditions', { exact: true });
  await expect(conditions).toContainText(result === 'DEFEATED' ? 'Fell before combat was cleared' : 'Boss defeated in combat');
  await expect(conditions).toContainText(result === 'BLESSED' ? 'BTC prediction correct'
    : result === 'CURSED' ? 'BTC prediction incorrect'
      : result === 'VOID' ? 'Market voided · no prediction penalty' : 'No market outcome applied');
  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(share).toHaveCount(1);
  await expect(share.getByRole('img', { name: `Market Dungeon Live Judge share card: ${enemies} of 2 encounters · Shannon testnet` })).toBeVisible();
  await expect(share).toContainText(`LIVE JUDGE · ${enemies}/2 ENCOUNTERS · 1-MINUTE TESTNET`);
  await expect(share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true })).toBeEnabled();
  await expect(share.getByRole('button', { name: '↗ INVITE A PLAYER', exact: true })).toBeEnabled();
  const xDraft = share.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true });
  const href = new URL((await xDraft.getAttribute('href'))!);
  expect(href.origin).toBe('https://twitter.com');
  expect(href.pathname).toBe('/intent/tweet');
  expect(href.searchParams.get('url')).toBe(`${new URL(page.url()).origin}${PATH}?challenge=1`);
  const caption = href.searchParams.get('text')!;
  expect(caption).toContain('Live Judge');
  expect(caption).toContain('1-minute · Shannon testnet');
  expect(caption).toContain('Local preview');
  expect(caption).not.toMatch(/historical|replay|room 40|full expedition|market-dungeon\.vercel\.app/i);
  if (result === 'DEFEATED') {
    expect(caption).toMatch(/(?:ended|defeated) in combat/i);
    expect(caption).toContain('No settlement applied');
    expect(caption).not.toMatch(/onchain.verified|chain (?:result|settlement) verified/i);
    expect(caption).not.toContain('BTC UP →');
  } else if (result === 'CURSED') {
    expect(caption).toMatch(/last stand|last strike|prediction.*wrong|prediction.*lost/i);
    expect(caption).toContain('BTC UP → BTC DOWN');
  } else if (result === 'VOID') {
    expect(caption).toMatch(/market was voided|market void/i);
    expect(caption).toContain('BTC UP → VOID');
  } else {
    expect(caption).toContain('BTC UP → BTC UP');
  }
  if (result !== 'DEFEATED') expect(caption).toContain('Chain settlement verified · server-signed choice');
  return share;
}

async function expectLiveResultActions(page: Page) {
  const proof = page.getByRole('region', { name: 'Live Judge proof and independent verification' });
  await expect(proof).toBeVisible();
  const summary = proof.getByRole('list', { name: 'Plain-language live proof summary' });
  await expect(summary.getByRole('listitem')).toHaveCount(4);
  await expect(summary).toContainText('server-attested, not an onchain timestamp');
  await expect(summary).toContainText('No replacement market');
  await expect(summary).toContainText('pending snapshot and final contract state from Shannon');
  await expect(proof.getByRole('button', { name: '1 · SAVE PROOF', exact: true })).toBeEnabled();
  await expect(proof.getByRole('button', { name: 'COPY PROOF JSON', exact: true })).toBeEnabled();
  const verifier = proof.getByRole('link', { name: '2 · OPEN INDEPENDENT VERIFIER', exact: true });
  await expect(verifier).toHaveAttribute('href', `${PATH}/verify`);
  await expect(verifier).toHaveAttribute('target', '_blank');
  const continuation = page.getByLabel('Continue on dreamDEX', { exact: true });
  await expect(continuation).toContainText(/separate/i);
  await expect(continuation).toContainText(/mainnet/i);
  const dreamDex = continuation.getByRole('link', { name: /continue on dreamdex/i });
  await expect(dreamDex).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
  await expect(dreamDex).toHaveAttribute('target', '_blank');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('live Judge shows the current Shannon order book before lock and inside the locked omen', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  await expect(odds).toHaveAttribute('data-odds-state', 'open');
  await expect(odds).toContainText('SHANNON TESTNET · 1 MIN');
  await expect(odds).toContainText('READ ONLY');
  await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
  await expect(odds).toContainText('BEST BID 59.0% · BEST ASK 61.0% · SPREAD 2.0%');
  expect(calls.odds).toEqual([fixture.market.marketId]);
  await lockLive(page);
  await page.getByRole('button', { name: /^Omen details:/ }).click();
  const omen = page.getByRole('dialog', { name: 'Omen', exact: true });
  await expect(omen).toContainText(fixture.market.marketId);
  await expect(omen.getByLabel('Live dreamDEX order book odds', { exact: true }).locator('strong')).toHaveText(['60%', '40%']);
  await page.clock.runFor(5_500);
  await expect.poll(() => calls.odds.length).toBeGreaterThan(1);
  expect(calls.odds.every(id => id === fixture.market.marketId)).toBe(true);
  expect(calls.starts).toEqual([{ marketId: fixture.market.marketId, direction: 'UP' }]);
  expect(calls.forbidden).toEqual([]);
});

test('an empty live order book never invents even odds or prevents locking an omen', async ({ page }) => {
  const fixture = liveJudgeFixture();
  await installLive(page, fixture, { odds: route => route.fulfill({ json: liveOdds(fixture, fixture.market, {}) }) });
  await openLive(page, fixture);
  const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  await expect(odds).toHaveAttribute('data-odds-state', 'open');
  await expect(odds.locator('strong')).toHaveText(['—', '—']);
  await expect(odds).toContainText('WAITING FOR ODDS · CHECKING AGAIN');
  await expect(odds).not.toContainText('50%');
  await expect(odds).toContainText('You can still lock an omen and play.');
  await lockLive(page);
});

test('an empty live CLOB refreshes after two seconds and slows down once quotes arrive', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    odds: (route, attempt) => route.fulfill({ json: liveOdds(fixture, fixture.market,
      attempt === 1 ? {} : { bestBid: '590000', bestAsk: '610000' }) }),
  });
  await openLive(page, fixture, true);
  const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  const lock = page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' });
  await expect(odds).toHaveAttribute('data-odds-state', 'open');
  await expect(odds).toContainText('WAITING FOR ODDS · CHECKING AGAIN');
  await expect(odds).toContainText('Checking again every 2 seconds.');
  await expect(odds.locator('strong')).toHaveText(['—', '—']);
  await expect(lock).toBeEnabled();

  await page.clock.runFor(1_999);
  expect(calls.odds).toHaveLength(1);
  await page.clock.runFor(1);
  await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
  expect(calls.odds).toEqual([fixture.market.marketId, fixture.market.marketId]);
  await expect(odds).not.toContainText('WAITING FOR ODDS');
  await expect(lock).toBeEnabled();

  await page.clock.runFor(4_999);
  expect(calls.odds).toHaveLength(2);
  await page.clock.runFor(1);
  await expect.poll(() => calls.odds.length).toBe(3);
  expect(calls.odds.every(id => id === fixture.market.marketId)).toBe(true);
  expect(calls.markets).toBe(1);
  expect(calls.starts).toHaveLength(0);
  await expect(lock).toBeEnabled();
});

test('a slow first CLOB request stays loading while the player can lock and enter combat', async ({ page }) => {
  const fixture = liveJudgeFixture();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const calls = await installLive(page, fixture, {
    odds: async route => {
      await pending;
      await route.fulfill({ json: liveOdds(fixture, fixture.market, {}) });
    },
  });
  try {
    await openLive(page, fixture, true);
    const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
    await expect.poll(() => calls.odds.length).toBe(1);
    await expect(odds).toHaveAttribute('data-odds-state', 'loading');
    await expect(odds).toHaveAttribute('aria-busy', 'true');
    await expect(odds).toContainText('LOADING LIVE ODDS…');
    await expect(odds.locator('strong')).toHaveText(['…', '…']);
    await expect(odds).not.toContainText('WAITING FOR ODDS');
    await page.clock.runFor(3_000);
    await expect(odds).toHaveAttribute('data-odds-state', 'loading');
    expect(calls.odds).toHaveLength(1);

    await lockLive(page);
    expect(calls.starts).toEqual([{ marketId: fixture.market.marketId, direction: 'UP' }]);
    await page.getByRole('button', { name: /^Omen details:/ }).click();
    const lockedOdds = page.getByRole('dialog', { name: 'Omen', exact: true })
      .getByLabel('Live dreamDEX order book odds', { exact: true });
    await expect(lockedOdds).toHaveAttribute('data-odds-state', 'loading');
    await expect(lockedOdds).not.toContainText('WAITING FOR ODDS');
    release();
    await expect(lockedOdds).toHaveAttribute('data-odds-state', 'open');
    await expect(lockedOdds).toHaveAttribute('aria-busy', 'false');
    await expect(lockedOdds).toContainText('WAITING FOR ODDS · CHECKING AGAIN');
    await expect(lockedOdds.locator('strong')).toHaveText(['—', '—']);
    expect(calls.odds).toEqual([fixture.market.marketId]);
  } finally { release(); }
});

test('an empty live CLOB honors a rate-limit retry window before requesting quotes again', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    odds: (route, attempt) => route.fulfill(attempt === 2
      ? { status: 429, headers: { 'retry-after': '7' }, json: { error: 'Please wait before refreshing market odds.' } }
      : { json: liveOdds(fixture, fixture.market, attempt === 1 ? {} : { bestBid: '590000', bestAsk: '610000' }) }),
  });
  await openLive(page, fixture, true);
  const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  await expect(odds).toContainText('WAITING FOR ODDS · CHECKING AGAIN');
  await page.clock.runFor(2_000);
  await expect(odds).toHaveAttribute('data-odds-state', 'unavailable');
  await expect(odds.locator('strong')).toHaveText(['—', '—']);
  await page.clock.runFor(6_999);
  expect(calls.odds).toHaveLength(2);
  await page.clock.runFor(1);
  await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
  expect(calls.odds).toEqual(Array(3).fill(fixture.market.marketId));
  await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' })).toBeEnabled();
});

for (const mismatch of ['market', 'quote market', 'chain', 'venue', 'interval', 'asset', 'expiry'] as const) {
  test(`live Judge suppresses CLOB quotes with a different ${mismatch}`, async ({ page }) => {
    const fixture = liveJudgeFixture();
    const data = liveOdds(fixture);
    if (mismatch === 'market') data.marketId = `0x${'ab'.repeat(32)}`;
    if (mismatch === 'quote market') data.odds.marketId = `0x${'ab'.repeat(32)}`;
    if (mismatch === 'chain') data.chainId = 5031;
    if (mismatch === 'venue') data.venueId = `0x${'ab'.repeat(32)}`;
    if (mismatch === 'interval') data.intervalSec = 300;
    if (mismatch === 'asset') data.asset = 'ETH';
    if (mismatch === 'expiry') data.expiry += 60;
    await installLive(page, fixture, { odds: route => route.fulfill({ json: data }) });
    await openLive(page, fixture);
    const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
    await expect(odds).toHaveAttribute('data-odds-state', 'unavailable');
    await expect(odds.locator('strong')).toHaveText(['—', '—']);
    await expect(odds).not.toContainText('60%');
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' })).toBeEnabled();
  });
}

test('a failed CLOB refresh clears old quotes and recovers without replacing the candidate', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    odds: (route, attempt) => route.fulfill(attempt === 2
      ? { status: 503, json: { error: 'Order book temporarily unavailable.', retryAfter: 5 } }
      : { json: liveOdds(fixture, fixture.market, attempt === 1 ? { bestBid: '590000', bestAsk: '610000' } : { bestBid: '690000', bestAsk: '710000' }) }),
  });
  await openLive(page, fixture, true);
  const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
  await page.clock.runFor(5_000);
  await expect(odds).toHaveAttribute('data-odds-state', 'unavailable');
  await expect(odds.locator('strong')).toHaveText(['—', '—']);
  await page.clock.runFor(4_999);
  expect(calls.odds).toHaveLength(2);
  await page.clock.runFor(1);
  await expect(odds.locator('strong')).toHaveText(['70%', '30%']);
  expect(calls.odds).toEqual(Array(3).fill(fixture.market.marketId));
  expect(calls.starts).toHaveLength(0);
});

test('a new one-minute candidate drops old CLOB quotes and ignores a late previous-market response', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const nextMarket = { ...fixture.market, marketId: `0x${'ab'.repeat(32)}`, strikeUsd: '60100.00', strikeExactUsd: '60100',
    tradingStart: fixture.market.tradingStart + 60, expiry: fixture.market.expiry + 60,
    question: `Pricefeed test: will BTC/USDC's price be at or above 60100.00 at unix time ${fixture.market.expiry + 60}?` };
  let releaseOld!: () => void;
  let releaseNext!: () => void;
  const oldPending = new Promise<void>(resolve => { releaseOld = resolve; });
  const nextPending = new Promise<void>(resolve => { releaseNext = resolve; });
  const calls = await installLive(page, fixture, {
    market: (route, attempt) => route.fulfill({ json: { market: attempt === 1 ? fixture.market : nextMarket, serverTime: fixture.now + (attempt - 1) * 10 } }),
    odds: async (route, attempt) => {
      const requested = new URL(route.request().url()).searchParams.get('marketId');
      if (requested === nextMarket.marketId) {
        await nextPending;
        await route.fulfill({ json: liveOdds(fixture, nextMarket, { bestBid: '690000', bestAsk: '710000' }) });
      } else {
        if (attempt > 1) await oldPending;
        await route.fulfill({ json: liveOdds(fixture) });
      }
    },
  });
  try {
    await openLive(page, fixture);
    const odds = page.getByLabel('Live dreamDEX order book odds', { exact: true });
    await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
    await page.clock.runFor(5_500);
    await expect.poll(() => calls.odds.length).toBe(2);
    await page.clock.runFor(5_000);
    await expect(page.getByLabel('Available live market')).toContainText('$60,100.00');
    await expect.poll(() => calls.odds.at(-1)).toBe(nextMarket.marketId);
    await expect(odds).toHaveAttribute('data-odds-state', 'loading');
    await expect(odds.locator('strong')).toHaveText(['…', '…']);
    releaseNext();
    await expect(odds.locator('strong')).toHaveText(['70%', '30%']);
    releaseOld();
    await page.clock.runFor(500);
    await expect(odds.locator('strong')).toHaveText(['70%', '30%']);
    expect(calls.odds).toEqual([fixture.market.marketId, fixture.market.marketId, nextMarket.marketId]);
    expect(calls.starts).toHaveLength(0);
  } finally { releaseOld(); releaseNext(); }
});

test('the locked CLOB stops quoting at expiry while unfinished combat remains playable', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  await lockLive(page);
  await page.getByRole('button', { name: /^Omen details:/ }).click();
  const omen = page.getByRole('dialog', { name: 'Omen', exact: true });
  const odds = omen.getByLabel('Live dreamDEX order book odds', { exact: true });
  await expect(odds.locator('strong')).toHaveText(['60%', '40%']);
  await advance(page, fixture, 65);
  await expect(odds).toHaveAttribute('data-odds-state', 'closed');
  await expect(odds.locator('strong')).toHaveText(['—', '—']);
  await expect(odds).toContainText('MARKET WINDOW CLOSED · QUOTES STOPPED');
  const countAtExpiry = calls.odds.length;
  await page.clock.runFor(15_000);
  expect(calls.odds).toHaveLength(countAtExpiry);
  expect(calls.reveals).toHaveLength(0);
  await omen.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(page.getByRole('button', { name: /ATTACK/ })).toBeEnabled();
});

for (const width of [1280, 390]) test(`live Judge keeps the same one-minute market through combat, pending settlement and verified win at ${width}px`, async ({ page }, info) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    reveal: (route, attempt) => route.fulfill(attempt === 1
      ? { status: 425, json: { state: 'pending', retryAfter: 5, error: 'Settlement pending.' } }
      : { json: fixture.settled }),
  });
  await installAudioProbe(page);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
  await openLive(page, fixture);
  await expectLiveModeNavigation(page);
  expect(await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).toEqual({ starts: 0, stops: 0, resumes: 0 });
  const up = page.getByRole('button', { name: /GOLD AWAKENS.*BTC UP/ });
  const down = page.getByRole('button', { name: /SHADOWS RISE.*BTC DOWN/ });
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await expect(down).toHaveAttribute('aria-pressed', 'false');
  const upSelected = await up.evaluate(button => getComputedStyle(button).backgroundImage);
  await down.click();
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  const downSelected = await down.evaluate(button => getComputedStyle(button).backgroundImage);
  expect(upSelected).toContain('gradient');
  expect(downSelected).toContain('gradient');
  expect(downSelected).not.toBe(upSelected);
  await up.click();
  const lock = page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' });
  await expect(lock).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('Available live market')).toContainText('$60,000.00');
  await expect(page.getByRole('link', { name: 'USE HISTORICAL REPLAY INSTEAD' })).toHaveAttribute('href', '/shannon/judge');
  await lockLive(page);
  await expectLiveModeNavigation(page);
  const expectReachableCombat = async () => {
    if (width === 390) await expectSubstantialMobileCombat(page);
    else for (const action of [/ATTACK/, /STORM/, /POTION/]) await expect(page.getByRole('region', { name: 'Combat actions' }).getByRole('button', { name: action })).toBeInViewport({ ratio: 1 });
  };
  await expectReachableCombat();
  expect(calls.starts).toEqual([{ marketId: fixture.market.marketId, direction: 'UP' }]);
  expect((await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).starts).toBe(0);
  await playGuard(page, fixture);
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  await expectReachableCombat();
  await expect.poll(() => page.evaluate(() => (window as LiveAudioWindow).readLiveAudio().starts)).toBe(1);
  for (const action of fixture.actions.filter(action => action.room === 9)) await page.getByRole('button', { name: action.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as LiveAudioWindow).readLiveAudio().stops)).toBeGreaterThan(0);
  expect(calls.reveals).toHaveLength(0);
  await expect(page.getByLabel('Player status')).toContainText('80');
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toHaveCount(0);
  const beforeRest = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
  await page.getByRole('button', { name: 'REST WITH KEVIN · FREE' }).click();
  await expect(page.getByLabel('Your health 100 of 100', { exact: true })).toBeVisible();
  const afterRest = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
  expect(afterRest.live).toEqual(beforeRest.live);
  expect(afterRest.actions).toEqual(beforeRest.actions);
  expect(afterRest.bossEntered).toEqual(beforeRest.bossEntered);
  expect(afterRest.rested).toBe(true);
  await advance(page, fixture, 65);
  await expect.poll(() => calls.reveals.length).toBe(1);
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toHaveCount(0);
  await finishSceneAnimations(page, 'pending');
  await page.screenshot({ path: info.outputPath(`live-pending-${width}.png`), fullPage: true });
  await advance(page, fixture, 75);
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  await expect(page.locator('[data-boss-scene="blessed"]')).toBeVisible();
  expect(calls.reveals).toEqual(Array(2).fill({ seal: fixture.session.seal, actions: fixture.actions }));
  expect(calls.forbidden).toEqual([]);
  await expect(page.getByLabel('Player status')).toContainText('122');
  expect((await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).starts).toBe(1);
  await expect(page.getByRole('button', { name: 'Turn all game sounds off', exact: true })).toBeVisible();
  const share = await expectLiveShare(page, 2, 'BLESSED');
  await expectLiveResultActions(page);
  if (width === 1280) {
    const downloaded = page.waitForEvent('download');
    await share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true }).click();
    const download = await downloaded;
    const file = info.outputPath(download.suggestedFilename());
    await download.saveAs(file);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(Array.from((await readFile(file)).subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value: string) => { Reflect.set(window, '__liveInvitation', value); },
      } });
    });
    await share.getByRole('button', { name: '↗ INVITE A PLAYER', exact: true }).click();
    const invitation = await page.evaluate(() => Reflect.get(window, '__liveInvitation') as string);
    expect(invitation).toContain('Local preview');
    expect(invitation).toContain(`${new URL(page.url()).origin}${PATH}?challenge=1`);
    expect(invitation).not.toContain(fixture.session.seal);
  }
  await finishSceneAnimations(page, 'blessed');
  await page.screenshot({ path: info.outputPath(`live-blessed-${width}.png`), fullPage: true });
});

for (const outcome of [1, 'VOID'] as const) test(`live Judge applies verified ${outcome === 1 ? 'CURSED' : 'VOID'} once and resets into live mode`, async ({ page }) => {
  const fixture = liveJudgeFixture({ outcome });
  const calls = await installLive(page, fixture);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 65);
  await expect(page.getByRole('heading', { name: outcome === 1 ? 'One fatal last strike.' : 'Market voided. Boss defeated.' })).toBeVisible();
  await expect(page.locator(`[data-boss-scene="${outcome === 1 ? 'last-strike' : 'void'}"]`)).toBeVisible();
  await expect(page.getByLabel(`Your health ${outcome === 1 ? 0 : fixture.proof.combatProof.finalHp} of 100`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Player status')).toContainText(outcome === 1 ? '80' : '122');
  if (outcome === 'VOID') await expect(page.getByRole('region', { name: 'Live Judge stage' })).toContainText('no winning prediction');
  await expectLiveShare(page, 2, outcome === 1 ? 'CURSED' : 'VOID');
  await expectLiveResultActions(page);
  await advance(page, fixture, 90);
  expect(calls.reveals).toHaveLength(1);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'START NEW LIVE DEMO' }).click();
  await expect(page).toHaveURL(/\/shannon\/live-judge$/);
  await expect(page.getByRole('heading', { name: 'Fight the boss. Let the market decide.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), STORAGE)).toBeNull();
  expect(calls.forbidden).toEqual([]);
});

test('closing the live window during guard combat does not skip the remaining fights', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  await lockLive(page);
  await advance(page, fixture, 65);
  await expect(page.getByLabel('Live market countdown')).toContainText('MARKET CLOSED');
  await expect(page.getByLabel('Live market countdown')).toContainText('Keep fighting. The boss result comes after combat.');
  expect(calls.reveals).toHaveLength(0);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 75);
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  expect(calls.reveals).toHaveLength(1);
});

test('losing live boss combat stops its music and never reveals a market result after the window closes', async ({ page }) => {
  const fixture = liveJudgeFixture({ gameSeed: 'a'.repeat(42) + '5' });
  const calls = await installLive(page, fixture);
  await installAudioProbe(page);
  await openLive(page, fixture);
  await lockLive(page);
  for (let attack = 0; attack < 4; attack++) await page.getByRole('button', { name: /STORM/ }).click();
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as LiveAudioWindow).readLiveAudio().starts)).toBe(1);
  for (let attack = 0; attack < 4; attack++) await page.getByRole('button', { name: /STORM/ }).click();
  await expect(page.getByRole('heading', { name: 'The dungeon keeps its boss.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as LiveAudioWindow).readLiveAudio().stops)).toBeGreaterThan(0);
  await advance(page, fixture, 65);
  expect(calls.reveals).toHaveLength(0);
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toHaveCount(0);
  await expect(page.getByLabel('Your health 0 of 100', { exact: true })).toBeVisible();
  await expectLiveShare(page, 1, 'DEFEATED');
  await expect(page.getByRole('region', { name: 'Live Judge proof and independent verification' })).toHaveCount(0);
});

test('live combat keeps monster humor, honest damage and potion logs through reload and the boss finish', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLive(page, fixture);
  await lockLive(page);
  const preview = page.getByRole('button', { name: 'Open dungeon log', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Dungeon log', exact: true });
  const guardHumor = /Architecture becomes unexpectedly aggressive|struck by infrastructure|building regulations remain unenforced|geographically inconvenient/;
  const bossHumor = /board has reached a unanimous decision|appeal period has expired|Corporate policy has become extremely literal|stakeholder engagement/;
  await expect(preview).toContainText(/part of the room arrives|planning permission|violate several building regulations|developed shoulders/);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByLabel('Your health 66 of 100', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enemy health 24 of 40', { exact: true })).toBeVisible();
  await expect(preview).toContainText(guardHumor);
  const beforePreview = await preview.textContent();
  await preview.click();
  await expect(drawer).toContainText('16 DAMAGE');
  await expect(drawer).toContainText('10 DAMAGE');
  await expect(drawer).toContainText('Negotiations remain unproductive.');
  await expect(drawer).toContainText(guardHumor);
  const beforeReload = await drawer.locator('p').allTextContents();
  await drawer.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.reload();
  await expect(preview).toHaveText(beforePreview!);
  await preview.click();
  const restored = await drawer.locator('p').allTextContents();
  expect(restored.filter(entry => beforeReload.includes(entry))).toEqual(beforeReload);
  await drawer.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const log = page.getByRole('list', { name: 'Dungeon log', exact: true });
  await expect(log).toContainText(/becomes floorplan|architectural problem has been demolished|property values immediately improve|Planning permission is no longer required/);
  await expect(log).toContainText('18 gold');
  await expect(log).toContainText(/payroll/i);
  await page.getByRole('button', { name: /POTION.*HEAL \+25 HP/ }).click();
  await expect(page.getByLabel('Your health 83 of 100', { exact: true })).toBeVisible();
  await expect(log).toContainText('25 HP');
  await expect(log).toContainText(/no refund|legally vague|bottle|Kevin/i);
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  await expect(preview).toContainText(/cancelled three meetings|organization that should never have existed|read the reports|final escalation procedure/);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByLabel('Your health 72 of 100', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enemy health 53 of 72', { exact: true })).toBeVisible();
  await expect(preview).toContainText(bossHumor);
  await preview.click();
  await expect(drawer).toContainText('19 DAMAGE');
  await expect(drawer).toContainText('11 DAMAGE');
  await expect(drawer).toContainText(bossHumor);
  const bossEntries = await drawer.locator('p').allTextContents();
  const bossPreview = await preview.textContent();
  await drawer.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.reload();
  await expect(preview).toHaveText(bossPreview!);
  await expect(page.getByLabel('Your health 72 of 100', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enemy health 53 of 72', { exact: true })).toBeVisible();
  await preview.click();
  expect(await drawer.locator('p').allTextContents()).toEqual(bossEntries);
  await drawer.getByRole('button', { name: 'Close details', exact: true }).click();
  for (let attack = 0; attack < 3; attack++) await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /POTION/ }).click();
  await expect(page.getByLabel('Your health 43 of 100', { exact: true })).toBeVisible();
  await preview.click();
  await expect(drawer).toContainText('25 HP');
  await expect(drawer).toContainText('16 DAMAGE');
  await expect(drawer).toContainText(bossHumor);
  await drawer.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await expect(page.getByLabel('Your health 43 of 100', { exact: true })).toBeVisible();
  await expect(log).toContainText(/CRITICAL/i);
  await expect(log).toContainText('38');
  await expect(log).toContainText(/2 (?:remaining )?HP|removed 2/);
  await expect(log).toContainText(/unanimous adventurer vote|board is dissolved|immediate administration|nobody left to escalate/);
  await page.getByText(/^READ FULL DUNGEON LOG ·/).click();
  const history = page.getByRole('list', { name: 'Full dungeon log', exact: true });
  await expect(history).toContainText('16 DAMAGE to Meatwall');
  await expect(history).toContainText('No retaliation between fights.');
  await expect(history).toContainText('The Chairman Below falls before retaliating. No retaliation.');
  expect(calls.reveals).toHaveLength(0);
  await advance(page, fixture, 65);
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  await expect(log).toContainText('42 gold');
  await expect(log).toContainText(/payroll/i);
  expect(calls.reveals).toHaveLength(1);
});

test('live Judge waits for an eligible round and recovers from a round closing before lock', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    market: (route, attempt) => route.fulfill({ json: { market: attempt === 1 ? null : fixture.market, serverTime: fixture.now, retryAfter: 3 } }),
    start: (route, attempt) => route.fulfill(attempt === 1
      ? { status: 409, json: { error: 'The market closed before your omen was locked.', retryAfter: 3 } }
      : { json: { live: fixture.session } }),
  });
  await page.clock.install({ time: fixture.now * 1_000 });
  await page.goto(PATH);
  await expect(page.getByRole('button', { name: 'WAITING FOR A FRESH MARKET' })).toBeDisabled();
  expect(calls.starts).toHaveLength(0);
  await page.clock.runFor(3_500);
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'The market closed before your omen was locked.' })).toBeVisible();
  await page.clock.runFor(4_000);
  await lockLive(page);
  expect(calls.starts).toHaveLength(2);
  expect(calls.forbidden).toEqual([]);
});

test('live Judge rejects a signed start for a different direction before combat', async ({ page }) => {
  const fixture = liveJudgeFixture({ direction: 'DOWN' });
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'did not match your choice' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
  expect(calls.reveals).toHaveLength(0);
});

test('live Judge freezes the shown target and direction while a single lock is pending', async ({ page }) => {
  const fixture = liveJudgeFixture();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const calls = await installLive(page, fixture, {
    start: async route => { await pending; await route.fulfill({ json: { live: fixture.session } }); },
  });
  try {
    await openLive(page, fixture);
    const lock = page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' });
    await lock.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(() => calls.starts.length).toBe(1);
    await expect(page.getByRole('button', { name: 'LOCKING YOUR OMEN…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /BTC DOWN/ })).toBeDisabled();
    const requestsAtLock = calls.markets;
    await page.clock.runFor(11_000);
    expect(calls.markets).toBe(requestsAtLock);
    await expect(page.getByLabel('Available live market')).toContainText('$60,000.00');
    release();
    await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
    expect(calls.starts).toEqual([{ marketId: fixture.market.marketId, direction: 'UP' }]);
  } finally { release(); }
});

test('an expired live session offers a fresh round without pretending the boss fate was verified', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture, {
    reveal: route => route.fulfill({ status: 410, json: { error: 'This live lock has expired. Start a new round.' } }),
  });
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 65);
  await expect(page.getByRole('button', { name: 'START A NEW LIVE ROUND' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'RETRY THIS MARKET' })).toHaveCount(0);
  await advance(page, fixture, 100);
  expect(calls.reveals).toHaveLength(1);
  await page.getByRole('button', { name: 'START A NEW LIVE ROUND' }).click();
  expect(await page.evaluate(key => sessionStorage.getItem(key), STORAGE)).toBeNull();
  await expect(page).toHaveURL(/\/shannon\/live-judge$/);
  await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' })).toBeEnabled();
});

test('live reveal RPC interruption pauses automatic attempts and preserves the original seal and transcript for manual retry', async ({ page }) => {
  const fixture = liveJudgeFixture();
  let unavailable = true;
  const calls = await installLive(page, fixture, {
    rpc: async route => {
      if (unavailable) { await route.abort('failed'); return; }
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
    },
  });
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 65);
  await expect(page.getByRole('status').filter({ hasText: 'Your locked market and completed combat are kept in this tab.' })).toBeVisible();
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await advance(page, fixture, 90);
  expect(calls.reveals).toHaveLength(1);
  unavailable = false;
  await page.getByRole('button', { name: 'RETRY THIS MARKET' }).click();
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  expect(calls.reveals).toEqual(Array(2).fill({ seal: fixture.session.seal, actions: fixture.actions }));
});

test('live Judge restores the exact locked boss fight after reload while audio stays silent until a player action', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await installAudioProbe(page);
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
  const playerHealth = await page.locator('[aria-label^="Your health"]').getAttribute('aria-label');
  const potions = await page.locator('[aria-label^="Potions "]').getAttribute('aria-label');
  const enemyHealth = await page.locator('[aria-label^="Enemy health"]').getAttribute('aria-label');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  await expect(page.locator('[aria-label^="Your health"]')).toHaveAttribute('aria-label', playerHealth!);
  await expect(page.locator('[aria-label^="Potions "]')).toHaveAttribute('aria-label', potions!);
  await expect(page.locator('[aria-label^="Enemy health"]')).toHaveAttribute('aria-label', enemyHealth!);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE)).toEqual(saved);
  expect(calls.starts).toHaveLength(1);
  expect(await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).toEqual({ starts: 0, stops: 0, resumes: 0 });
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(() => page.evaluate(() => (window as LiveAudioWindow).readLiveAudio().starts)).toBe(1);
});

test('live Judge exported proof verifies independently and tampering never yields PASS', async ({ page }, info) => {
  const fixture = liveJudgeFixture({ strikeRaw: 60_000_123456789012345678n });
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 65);
  const proof = page.getByRole('region', { name: 'Live Judge proof and independent verification' });
  const evidence = proof.locator('details').filter({ has: page.getByText('FULL LIVE PROOF EVIDENCE', { exact: true }) });
  await evidence.locator('summary').first().click();
  await expect(evidence.getByRole('region', { name: 'Locked live market identity' })).toContainText('$60,000.123456789012345678');
  await expect(evidence.getByRole('region', { name: 'Locked live market identity' })).toContainText(fixture.market.marketId);
  const chain = evidence.getByRole('region', { name: 'Shannon snapshot and settlement evidence' });
  await expect(chain).toContainText(fixture.session.lock.snapshot.blockHash);
  await expect(chain).toContainText(fixture.proof.onchainSettlement.blockHash);
  await expect(chain).toContainText(`[${fixture.proof.onchainSettlement.payoutNumerators.join(', ')}] / ${fixture.proof.onchainSettlement.payoutDenominator}`);
  const blocks = [fixture.session.lock.snapshot.blockNumber, fixture.proof.onchainSettlement.blockNumber];
  for (const block of blocks) await expect(chain.getByRole('link', { name: `BLOCK #${block} ↗`, exact: true }))
    .toHaveAttribute('href', `https://shannon-explorer.somnia.network/block/${block}`);
  for (const link of await chain.getByRole('link').all()) {
    expect(new URL((await link.getAttribute('href'))!).origin).toBe('https://shannon-explorer.somnia.network');
    await expect(link).toHaveAttribute('target', '_blank');
  }
  const rpcCalls = evidence.getByRole('region', { name: 'Exact live proof RPC calls' }).locator('details');
  await expect(rpcCalls).toHaveCount(6);
  const sourceCalls = [fixture.session.lock.snapshot.moduleMarket, fixture.session.lock.snapshot.marketStatus,
    fixture.session.lock.snapshot.settlementRecord, fixture.session.lock.snapshot.oracleQuestion,
    fixture.proof.onchainSettlement.calls.moduleMarket, fixture.proof.onchainSettlement.calls.settlementRecord];
  for (let index = 0; index < sourceCalls.length; index++) {
    await rpcCalls.nth(index).locator('summary').click();
    await expect(rpcCalls.nth(index)).toContainText(sourceCalls[index].data);
    await expect(rpcCalls.nth(index)).toContainText(sourceCalls[index].result);
    await expect(rpcCalls.nth(index)).toContainText(sourceCalls[index].blockReference.blockHash);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { Reflect.set(window, '__liveCopiedProof', value); },
    } });
  });
  const saved = await page.evaluate(key => sessionStorage.getItem(key), STORAGE);
  await page.getByRole('button', { name: 'COPY MARKET ID', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, '__liveCopiedProof') as string)).toBe(fixture.market.marketId);
  await page.getByRole('button', { name: 'COPY PROOF JSON', exact: true }).click();
  expect(JSON.parse(await page.evaluate(() => Reflect.get(window, '__liveCopiedProof') as string))).toEqual(fixture.proof);
  expect(await page.evaluate(key => sessionStorage.getItem(key), STORAGE)).toBe(saved);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '1 · SAVE PROOF' }).click();
  const download = await downloaded;
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8')) as LiveJudgeProof;
  expect(exported).toEqual(fixture.proof);
  const verifier = page.getByRole('link', { name: '2 · OPEN INDEPENDENT VERIFIER', exact: true });
  await expect(verifier).toHaveAttribute('href', `${PATH}/verify`);
  await expect(verifier).toHaveAttribute('target', '_blank');
  await page.goto((await verifier.getAttribute('href'))!);
  const textarea = page.locator('#live-proof-json');
  const result = page.getByRole('region', { name: 'Live proof verification result' });
  await textarea.fill(JSON.stringify(exported));
  await page.getByRole('button', { name: 'VERIFY LIVE PROOF', exact: true }).click();
  await expect(result).toContainText('PASS');
  for (const field of ['digest', 'direction', 'result'] as const) {
    await page.getByRole('button', { name: 'CLEAR', exact: true }).click();
    const tampered = structuredClone(exported);
    if (field === 'digest') tampered.combatProof.transcriptDigest = `0x${'00'.repeat(32)}`;
    else if (field === 'direction') tampered.lock.direction = 'DOWN';
    else tampered.result = 'CURSED';
    await textarea.fill(JSON.stringify(tampered));
    await page.getByRole('button', { name: 'VERIFY LIVE PROOF', exact: true }).click();
    await expect(result).toContainText('FAIL');
  }
  expect(calls.forbidden).toEqual([]);
});

test('live proof remains copyable and downloadable when browser clipboard permission is denied', async ({ page }, info) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await advance(page, fixture, 65);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new DOMException('Clipboard permission denied', 'NotAllowedError'); },
    } });
  });
  await page.getByRole('button', { name: 'COPY PROOF JSON', exact: true }).click();
  const manual = page.getByRole('textbox', { name: 'Proof JSON — copy manually', exact: true });
  await expect(manual).toBeVisible();
  await expect(manual).toHaveAttribute('readonly', '');
  expect(JSON.parse(await manual.inputValue())).toEqual(fixture.proof);
  await page.getByRole('button', { name: 'SELECT ALL JSON', exact: true }).click();
  expect(await manual.evaluate((textarea: HTMLTextAreaElement) => [textarea.selectionStart, textarea.selectionEnd])).toEqual([0, (await manual.inputValue()).length]);
  const evidence = page.getByRole('region', { name: 'Live Judge proof and independent verification' }).locator('details')
    .filter({ has: page.getByText('FULL LIVE PROOF EVIDENCE', { exact: true }) });
  await evidence.locator('summary').first().click();
  await page.getByRole('button', { name: 'COPY MARKET ID', exact: true }).click();
  const marketId = page.getByRole('textbox', { name: 'Market ID — copy manually', exact: true });
  await expect(marketId).toBeVisible();
  await expect(marketId).toHaveAttribute('readonly', '');
  await expect(marketId).toHaveValue(fixture.market.marketId);
  await marketId.focus();
  expect(await marketId.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, fixture.market.marketId.length]);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '1 · SAVE PROOF', exact: true }).click();
  const download = await downloaded;
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(fixture.proof);
  expect(calls.reveals).toHaveLength(1);
  expect(calls.forbidden).toEqual([]);
});

test('a completed live proof and free rest survive reload after claim expiry without another reveal or automatic audio', async ({ page }) => {
  const fixture = liveJudgeFixture();
  const calls = await installLive(page, fixture);
  await installAudioProbe(page);
  await openLive(page, fixture);
  await lockLive(page);
  await playGuard(page, fixture);
  await playBoss(page, fixture);
  await page.getByRole('button', { name: 'REST WITH KEVIN · FREE' }).click();
  await advance(page, fixture, 65);
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
  expect(saved.result).toEqual(fixture.proof);
  expect(saved.rested).toBe(true);
  await advance(page, fixture, 2_000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your omen holds.' })).toBeVisible();
  await expect(page.getByLabel('Your health 100 of 100', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF' })).toBeEnabled();
  expect(calls.reveals).toHaveLength(1);
  expect(await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).toEqual({ starts: 0, stops: 0, resumes: 0 });
});

test('a live challenge opens a fresh setup, preserves the completed run until lock, and resumes the accepted new run', async ({ page }) => {
  const fixture = liveJudgeFixture({ direction: 'DOWN', gameSeed: 'b'.repeat(43) });
  const previous = liveJudgeFixture({ now: fixture.now - 300, gameSeed: 'a'.repeat(43) });
  const oldRun = JSON.stringify({ live: previous.session, actions: previous.actions, bossEntered: true, result: previous.proof, rested: true });
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
  }, { key: STORAGE, value: oldRun });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const calls = await installLive(page, fixture, {
    start: async route => { await pending; await route.fulfill({ json: { live: fixture.session } }); },
  });
  try {
    await page.clock.install({ time: fixture.now * 1_000 });
    await page.goto(`${PATH}?challenge=1`);
    await expect(page.getByRole('heading', { name: 'Fight the boss. Let the market decide.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' })).toBeEnabled();
    expect(await page.evaluate(key => sessionStorage.getItem(key), STORAGE)).toBe(oldRun);
    await expect(page.getByRole('region', { name: 'Share your Market Dungeon result' })).toHaveCount(0);
    await page.getByRole('button', { name: /SHADOWS RISE.*BTC DOWN/ }).click();
    await page.getByRole('button', { name: 'LOCK BTC DOWN & ENTER DUNGEON' }).click();
    await expect.poll(() => calls.starts.length).toBe(1);
    expect(await page.evaluate(key => sessionStorage.getItem(key), STORAGE)).toBe(oldRun);
    await expect(page).toHaveURL(/\/shannon\/live-judge\?challenge=1$/);
    release();
    await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
    await expect(page).toHaveURL(/\/shannon\/live-judge$/);
    await page.getByRole('button', { name: /ATTACK/ }).click();
    const accepted = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
    expect(accepted.live).toEqual(fixture.session);
    expect(accepted.result).toBeUndefined();
    expect(accepted.actions).toEqual([{ room: 8, action: 'attack' }]);
    const health = await page.locator('[aria-label^="Your health"]').getAttribute('aria-label');
    const enemyHealth = await page.locator('[aria-label^="Enemy health"]').getAttribute('aria-label');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
    await expect(page.locator('[aria-label^="Your health"]')).toHaveAttribute('aria-label', health!);
    await expect(page.locator('[aria-label^="Enemy health"]')).toHaveAttribute('aria-label', enemyHealth!);
    expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE)).toEqual(accepted);
    expect(calls.starts).toEqual([{ marketId: fixture.market.marketId, direction: 'DOWN' }]);
    expect(calls.reveals).toHaveLength(0);
    expect(calls.forbidden).toEqual([]);
  } finally { release(); }
});

test('a live combat defeat survives reload beyond claim expiry with its honest card and no verified settlement', async ({ page }) => {
  const fixture = liveJudgeFixture({ gameSeed: 'a'.repeat(42) + '5' });
  const calls = await installLive(page, fixture);
  await installAudioProbe(page);
  await openLive(page, fixture);
  await lockLive(page);
  for (let attack = 0; attack < 4; attack++) await page.getByRole('button', { name: /STORM/ }).click();
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  for (let attack = 0; attack < 4; attack++) await page.getByRole('button', { name: /STORM/ }).click();
  await expect(page.getByRole('heading', { name: 'The dungeon keeps its boss.' })).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE);
  expect(saved.result).toBeUndefined();
  expect(saved.actions).toHaveLength(8);
  await advance(page, fixture, 2_000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The dungeon keeps its boss.' })).toBeVisible();
  await expect(page.getByLabel('Your health 0 of 100', { exact: true })).toBeVisible();
  await expectLiveShare(page, 1, 'DEFEATED');
  await expect(page.getByLabel('Final run statistics', { exact: true })).toContainText('80');
  await expect(page.getByRole('button', { name: '1 · SAVE PROOF', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Live Judge proof and independent verification' })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE)).toEqual(saved);
  expect(calls.starts).toHaveLength(1);
  expect(calls.reveals).toHaveLength(0);
  expect(calls.rpc).toBe(0);
  expect(await page.evaluate(() => (window as LiveAudioWindow).readLiveAudio())).toEqual({ starts: 0, stops: 0, resumes: 0 });
});

test('clearing live proof verification discards a late pending RPC result', async ({ page }) => {
  const fixture = liveJudgeFixture();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const calls = await installLive(page, fixture, {
    rpc: async route => {
      await pending;
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
    },
  });
  try {
    await page.goto(`${PATH}/verify`);
    await page.locator('#live-proof-json').fill(JSON.stringify(fixture.proof));
    await page.getByRole('button', { name: 'VERIFY LIVE PROOF', exact: true }).click();
    await expect.poll(() => calls.rpc).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'CANCEL AND CLEAR', exact: true }).click();
    release();
    await expect(page.locator('#live-proof-json')).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Live proof verification result' })).toHaveCount(0);
    await page.waitForTimeout(250);
    await expect(page.getByRole('region', { name: 'Live proof verification result' })).toHaveCount(0);
  } finally { release(); }
});
