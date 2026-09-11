import { expect, test, type Page } from '@playwright/test';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { createMarketDungeonRun } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, type FullRunSession } from '../../app/gameplay/full-run-storage';

const now = 1_788_909_000;
const market = (id: string, expiry = now + 300) => ({
  marketId: `0x${id.repeat(64)}`, intervalSec: 300, question: 'BTC closes at or above its opening price',
  strikeUsd: '78529.69', tradingStart: expiry - 300, expiry, status: 'Trading', finalized: false,
});
const first = market('1');
const quote = (marketId = first.marketId, bid = '419', ask = '449') => deriveDreamDexClobOdds({
  marketId, quoteDecimals: 3, bestBid: bid, bestAsk: ask, observedAtIso: new Date(now * 1000).toISOString(),
});
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as FullRunSession, FULL_RUN_STORAGE_KEY);
const oddsPanel = (page: Page) => page.getByLabel('Live dreamDEX order book odds', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(now * 1000) });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

test('homepage waits until entry to load the market and leaves the omen unlocked', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill({ json: { market: first, odds: quote() } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'CHOOSE A MODE', exact: true })).toBeDisabled();
  await expect(oddsPanel(page)).toHaveCount(0);
  expect(requests).toBe(0);
  expect(await saved(page)).toBeNull();
  await expect(page.getByRole('button', { name: /LOCK BTC/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await expect(oddsPanel(page)).toContainText('43%');
  expect((await saved(page)).market).toBeNull();
  expect((await saved(page)).run.currentAttempt).toBeNull();
  await page.clock.runFor(1_000);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  expect((await saved(page)).market?.marketId).toBe(first.marketId);
});

test('market outages leave Home choices available and entry recovers its quote', async ({ page }) => {
  let available = false;
  let requests = 0;
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill(available
      ? { json: { market: first, odds: quote() } }
      : { status: 503, json: { error: 'Controlled market outage' } });
  });
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Judge Demo', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  await expect(page.getByRole('button', { name: 'ENTER DUNGEON', exact: true })).toBeEnabled();
  expect(await saved(page)).toBeNull();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await expect(page.getByText('Controlled market outage', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /LOCK BTC UP/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true })).toBeVisible();
  available = true;
  await page.clock.runFor(5_100);
  await expect(oddsPanel(page)).toContainText('43%');
  expect((await saved(page)).run.currentAttempt).toBeNull();
});

for (const rematch of [false, true]) test(`Full Expedition CLOB odds bind to the chosen five-minute ${rematch ? 'rematch' : 'entry'} market on desktop and mobile`, async ({ page }, info) => {
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: first, odds: quote() } }));
  if (rematch) {
    const run = createMarketDungeonRun(() => 0);
    const oldId = `0x${'a'.repeat(64)}`;
    run.rematchRequired = true;
    run.game = { ...run.game, roomsCleared: 9, monsterType: 3, monsterHp: 122, monsterMaxHp: 122, hp: 37 };
    run.usedMarketIds = [oldId];
    run.resolvedAttemptIds = ['previous_attempt'];
    run.settlements = [{ attemptId: 'previous_attempt', marketId: oldId, direction: 'UP', outcome: 'CURSED', proofVersion: 'market-dungeon/full-run-market/v1', commitment: null }];
    run.attemptNumber = 1;
    const session: FullRunSession = { schema: 'market-dungeon/full-run-session/v2', run, market: null };
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: JSON.stringify(session) });
  }
  await page.goto('/expedition');
  const panel = oddsPanel(page);
  await expect(panel).toContainText('43%');
  await expect(panel).toContainText('57%');
  await expect(panel).toContainText('BEST BID 41.9% · BEST ASK 44.9% · SPREAD 3.0%');
  const lock = page.getByRole('button', { name: /LOCK BTC UP/ });
  for (const [width, height] of [[1920, 1080], [1280, 720], [820, 720], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await panel.boundingBox())!.y).toBeLessThan((await lock.boundingBox())!.y);
    // Setup keeps the market and choice explanation readable on short screens,
    // matching the existing Full Expedition layout acceptance check.
    if (width < 1200 || height < 800) await lock.scrollIntoViewIfNeeded();
    await expect(lock).toBeInViewport({ ratio: 1 });
    if (width === 1280 || width === 390) await page.screenshot({ path: info.outputPath(`clob-${rematch ? 'rematch' : 'entry'}-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: /LOCK BTC DOWN/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const session = await saved(page);
  expect(session.market?.marketId).toBe(first.marketId);
  expect(session.run.currentAttempt?.direction).toBe('DOWN');
  await expect(panel).toHaveCount(0);
  if (rematch) { expect(session.run.game.monsterHp).toBe(122); expect(session.run.game.hp).toBe(37); }
});

for (const metadata of ['explicit success', 'legacy payload'] as const) test(`Full Expedition retries a successfully empty same-market order book after two seconds (${metadata})`, async ({ page }) => {
  let requests = 0;
  const empty = deriveDreamDexClobOdds({ marketId: first.marketId, quoteDecimals: 3 });
  const odds = metadata === 'explicit success' ? { ...empty, bookStatus: 'ok' } : empty;
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill({ json: { market: first, odds: requests === 1 ? odds : quote() } });
  });
  await page.goto('/expedition');
  const panel = oddsPanel(page);
  await expect(panel).toContainText('WAITING FOR ODDS · CHECKING AGAIN');
  await expect(panel).toHaveAttribute('data-odds-state', 'open');
  await expect(panel).toHaveAttribute('data-odds-available', 'false');
  await expect(page.getByRole('button', { name: /LOCK BTC UP/ })).toBeEnabled();
  await page.clock.runFor(1_000);
  expect(requests).toBe(1);
  await page.clock.runFor(1_200);
  await expect.poll(() => requests).toBe(2);
  await expect(panel).toContainText('43%');
  await expect(panel).toContainText('57%');
  await expect(panel).toHaveAttribute('data-odds-available', 'true');
  await page.clock.runFor(14_000);
  expect(requests).toBe(2);
  await page.clock.runFor(1_100);
  await expect.poll(() => requests).toBe(3);
});

for (const failure of ['http error', 'missing odds', 'mismatched market', 'failed order book'] as const) test(`Full Expedition clears ${failure} and retries after five seconds without preventing a valid lock`, async ({ page }) => {
  let body: unknown = { market: first, odds: quote() };
  let status = 200;
  let requests = 0;
  await page.route('**/api/market?interval=300', route => { requests++; return route.fulfill({ status, json: body }); });
  await page.goto('/expedition');
  const panel = oddsPanel(page);
  await expect(panel).toContainText('43%');
  if (failure === 'http error') { status = 503; body = { error: 'Controlled test outage' }; }
  if (failure === 'missing odds') body = { market: first };
  if (failure === 'mismatched market') body = { market: first, odds: quote(market('2').marketId, '900', '920') };
  if (failure === 'failed order book') body = { market: first, odds: { ...deriveDreamDexClobOdds({ marketId: first.marketId, quoteDecimals: 3 }), bookStatus: 'unavailable' } };
  await page.clock.runFor(15_100);
  await expect.poll(() => requests).toBe(2);
  await expect(panel).toContainText('ORDER BOOK TEMPORARILY UNAVAILABLE');
  await expect(panel).toHaveAttribute('data-odds-state', 'unavailable');
  await expect(panel).toHaveAttribute('data-odds-available', 'false');
  await expect(panel).not.toContainText('43%');
  await expect(panel).not.toContainText('91%');
  await expect(page.getByRole('button', { name: /LOCK BTC UP/ })).toBeEnabled();
  status = 200; body = { market: first, odds: quote(first.marketId, '600', '620') };
  await page.clock.runFor(3_000);
  expect(requests).toBe(2);
  await page.clock.runFor(2_100);
  await expect.poll(() => requests).toBe(3);
  await expect(panel).toContainText('BEST BID 60.0%');
  await expect(panel).toHaveAttribute('data-odds-state', 'open');
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  await page.clock.runFor(30_100);
  expect(requests).toBe(3);
  expect((await saved(page)).market?.marketId).toBe(first.marketId);
});

test('Full Expedition retains a usable last traded price during an order-book outage and retries after five seconds', async ({ page }) => {
  let requests = 0;
  const fallback = { ...deriveDreamDexClobOdds({ marketId: first.marketId, quoteDecimals: 2, lastPrice: '61' }), bookStatus: 'unavailable' };
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill({ json: { market: first, odds: requests === 1 ? fallback : quote() } });
  });
  await page.goto('/expedition');
  const panel = oddsPanel(page);
  await expect(panel).toContainText('61%');
  await expect(panel).toContainText('39%');
  await expect(panel).toContainText('ORDER BOOK TEMPORARILY UNAVAILABLE · USING LAST TRADED PRICE');
  await expect(panel).toHaveAttribute('data-odds-state', 'open');
  await expect(panel).toHaveAttribute('data-odds-available', 'true');
  await page.clock.runFor(3_000);
  expect(requests).toBe(1);
  await page.clock.runFor(2_100);
  await expect.poll(() => requests).toBe(2);
  await expect(panel).toContainText('43%');
  await expect(panel).toContainText('BEST BID 41.9%');
  await expect(panel).not.toContainText('USING LAST TRADED PRICE');
});

test('Full Expedition can lock the current market while its order book is unavailable', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill({ json: { market: first, odds: { ...deriveDreamDexClobOdds({ marketId: first.marketId, quoteDecimals: 3 }), bookStatus: 'unavailable' } } });
  });
  await page.goto('/expedition');
  await expect(oddsPanel(page)).toContainText('ORDER BOOK TEMPORARILY UNAVAILABLE');
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: /LOCK BTC DOWN/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const locked = await saved(page);
  expect(locked.market?.marketId).toBe(first.marketId);
  expect(locked.run.currentAttempt?.direction).toBe('DOWN');
  await page.clock.runFor(30_100);
  expect(requests).toBe(1);
  expect(await saved(page)).toEqual(locked);
  await expect(oddsPanel(page)).toHaveCount(0);
});

test('Full Expedition expiry hides old odds until the next market and quote arrive together', async ({ page }) => {
  const expiring = market('1', now + 10);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  const next = market('2', now + 310);
  await page.route('**/api/market?interval=300', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ json: { market: expiring, odds: quote() } });
    await gate;
    await route.fulfill({ json: { market: next, odds: quote(next.marketId, '600', '620') } });
  });
  await page.goto('/expedition');
  await expect(oddsPanel(page)).toContainText('43%');
  await page.clock.runFor(10_500);
  await expect.poll(() => requests).toBe(2);
  await expect(oddsPanel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /LOCK BTC UP/ })).toBeDisabled();
  release();
  await expect(oddsPanel(page)).toContainText('61%');
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  expect((await saved(page)).market?.marketId).toBe(next.marketId);
});

test('Full Expedition ignores an in-flight odds refresh after the player locks', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let finishRefresh!: () => void;
  const refreshFinished = new Promise<void>(resolve => { finishRefresh = resolve; });
  let requests = 0;
  await page.route('**/api/market?interval=300', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ json: { market: first, odds: quote() } });
    await gate;
    try {
      await route.fulfill({ json: { market: market('2'), odds: quote(market('2').marketId, '600', '620') } });
    } finally { finishRefresh(); }
  });
  await page.goto('/expedition');
  await expect(oddsPanel(page)).toContainText('43%');
  await page.clock.runFor(15_100);
  await expect.poll(() => requests).toBe(2);
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const session = await saved(page);
  release();
  await refreshFinished;
  await page.clock.runFor(30_100);
  expect(await saved(page)).toEqual(session);
  expect(requests).toBe(2);
  await expect(oddsPanel(page)).toHaveCount(0);
});

test('Full Expedition ignores an expired market response that finishes after the replacement market arrives', async ({ page }) => {
  const expiring = market('1', now + 20);
  const next = market('2', now + 320);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let finishOldRefresh!: () => void;
  const oldRefreshFinished = new Promise<void>(resolve => { finishOldRefresh = resolve; });
  let requests = 0;
  await page.route('**/api/market?interval=300', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ json: { market: expiring, odds: quote() } });
    if (requests === 2) {
      await gate;
      try {
        await route.fulfill({ json: { market: expiring, odds: quote(first.marketId, '900', '920') } });
      } finally { finishOldRefresh(); }
      return;
    }
    await route.fulfill({ json: { market: next, odds: quote(next.marketId, '600', '620') } });
  });
  await page.goto('/expedition');
  await expect(oddsPanel(page)).toContainText('43%');
  await page.clock.runFor(15_100);
  await expect.poll(() => requests).toBe(2);
  await page.clock.runFor(5_500);
  await expect.poll(() => requests).toBe(3);
  await expect(oddsPanel(page)).toContainText('61%');
  release();
  await oldRefreshFinished;
  await page.clock.runFor(100);
  await expect(oddsPanel(page)).toContainText('61%');
  await expect(oddsPanel(page)).not.toContainText('91%');
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  expect((await saved(page)).market?.marketId).toBe(next.marketId);
});
