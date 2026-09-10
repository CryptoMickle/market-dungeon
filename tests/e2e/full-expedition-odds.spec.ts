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

test('homepage shows the current market without starting a run and carries it into omen selection', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/market?interval=300', route => {
    requests++;
    return route.fulfill({ json: { market: first, odds: quote() } });
  });
  await page.goto('/');
  await expect(oddsPanel(page)).toContainText('43%');
  await expect(page.getByRole('region', { name: 'Expedition market' })).toContainText('Choose and lock your omen on the next screen.');
  expect(await saved(page)).toBeNull();
  await expect(page.getByRole('button', { name: /LOCK BTC/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
  await expect(oddsPanel(page)).toContainText('43%');
  expect((await saved(page)).market).toBeNull();
  expect((await saved(page)).run.currentAttempt).toBeNull();
  await page.clock.runFor(1_000);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  expect((await saved(page)).market?.marketId).toBe(first.marketId);
});

test('homepage market outage keeps both entry choices available and recovers the quote', async ({ page }) => {
  let available = false;
  await page.route('**/api/market?interval=300', route => route.fulfill(available
    ? { json: { market: first, odds: quote() } }
    : { status: 503, json: { error: 'Controlled homepage outage' } }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Live market temporarily unavailable');
  await expect(page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: /JUDGES: PLAY THE LIVE 1-MINUTE DEMO/ })).toHaveAttribute('href', '/shannon/live-judge');
  expect(await saved(page)).toBeNull();
  available = true;
  await page.clock.runFor(15_100);
  await expect(oddsPanel(page)).toContainText('43%');
  expect(await saved(page)).toBeNull();
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
  await page.goto('/');
  if (!rematch) await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
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

test('Full Expedition refresh clears mismatched, missing and failed odds and recovers without preventing a valid lock', async ({ page }) => {
  let body: unknown = { market: first, odds: quote() };
  let status = 200;
  let requests = 0;
  await page.route('**/api/market?interval=300', route => { requests++; return route.fulfill({ status, json: body }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
  const panel = oddsPanel(page);
  await expect(panel).toContainText('43%');
  const refresh = async () => {
    const before = requests;
    await page.clock.runFor(15_100);
    await expect.poll(() => requests).toBe(before + 1);
  };
  body = { market: first, odds: quote(market('2').marketId, '900', '920') };
  await refresh();
  await expect(panel).toContainText('LIVE ODDS UNAVAILABLE');
  await expect(panel).not.toContainText('91%');
  await expect(panel).not.toContainText('43%');
  body = { market: first };
  await refresh();
  await expect(panel).toContainText('LIVE ODDS UNAVAILABLE');
  body = { market: first, odds: deriveDreamDexClobOdds({ marketId: first.marketId, quoteDecimals: 2, lastPrice: '61' }) };
  await refresh();
  await expect(panel).toContainText('61%');
  await expect(panel).toContainText('USING LAST TRADED PRICE');
  status = 503; body = { error: 'Controlled test outage' };
  await refresh();
  await expect(panel).toContainText('LIVE ODDS UNAVAILABLE');
  await expect(panel).not.toContainText('61%');
  await expect(page.getByRole('button', { name: /LOCK BTC UP/ })).toBeEnabled();
  status = 200; body = { market: first, odds: quote(first.marketId, '600', '620') };
  await refresh();
  await expect(panel).toContainText('BEST BID 60.0%');
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const lockedRequests = requests;
  await page.clock.runFor(30_100);
  expect(requests).toBe(lockedRequests);
  expect((await saved(page)).market?.marketId).toBe(first.marketId);
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
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
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
  let requests = 0;
  await page.route('**/api/market?interval=300', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ json: { market: first, odds: quote() } });
    await gate;
    await route.fulfill({ json: { market: market('2'), odds: quote(market('2').marketId, '600', '620') } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
  await expect(oddsPanel(page)).toContainText('43%');
  await page.clock.runFor(15_100);
  await expect.poll(() => requests).toBe(2);
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const session = await saved(page);
  const response = page.waitForResponse('**/api/market?interval=300');
  release();
  await response;
  await page.clock.runFor(30_100);
  expect(await saved(page)).toEqual(session);
  expect(requests).toBe(2);
  await expect(oddsPanel(page)).toHaveCount(0);
});
