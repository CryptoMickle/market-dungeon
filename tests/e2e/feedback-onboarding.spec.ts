import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { attack as resolveAttack, emptyGame } from '../../app/gameplay/delveworn-engine';
import { FULL_RUN_MARKET_PROOF_VERSION } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { liveJudgeFixture } from './live-judge-fixture';
import { market, SHANNON_LOCK_PUBLIC_KEY, shannonStartPayload } from './judge-demo-fixture';
import { expectSubstantialMobileCombat } from './mobile-combat-layout';

// Controlled browser fixtures exercise the explanation and its actual combat
// consequences. These are regression tests, not additional human user feedback.
async function quietLocalAnalytics(page: Page) {
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
}

async function expectChoiceGuideBeforeLock(page: Page, lock: Locator) {
  const guide = page.getByRole('region', { name: 'How your Bitcoin choice works', exact: true });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('BTC means Bitcoin.');
  await expect(guide).toContainText('It does not change Attack or Storm damage.');
  await expect(guide).toContainText('The boss’s final strike ends this demo.');
  await expect(guide).toContainText('In Full Expedition, a wrong prediction lets you rematch that boss instead.');
  const explanation = (await guide.boundingBox())!;
  const action = (await lock.boundingBox())!;
  expect(explanation.y + explanation.height).toBeLessThanOrEqual(action.y);
}

async function expectDemoNavigation(page: Page, current: 'live' | 'replay', setup = true) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
  const home = page.getByRole('link', { name: 'Market Dungeon — back to home', exact: true })
    .or(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true })).filter({ visible: true });
  await expect(home).toBeInViewport({ ratio: 1 });
  if (setup) await expect(home).toHaveAttribute('href', '/');
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  if (!setup) { await expect(variants).toHaveCount(0); return; }
  await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
  await expect(variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('href', '/shannon/live-judge');
  await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/shannon/judge');
  await expect(variants.getByRole('link', { name: current === 'live' ? 'LIVE · 1 MIN' : 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
  for (const link of await variants.getByRole('link').all()) await expect(link).toBeInViewport({ ratio: 1 });
}

async function expectPermanentCombatHelp(page: Page) {
  const combat = await expectSubstantialMobileCombat(page);
  const actions = combat.getByRole('region', { name: 'Combat actions', exact: true });
  const attack = actions.getByRole('button', { name: /ATTACK/ });
  const storm = actions.getByRole('button', { name: /STORM/ });
  const potion = actions.getByRole('button', { name: /POTION/ });
  await expect(attack).toContainText('Steady damage');
  await expect(attack).toContainText(/\d+–\d+ DMG · \d+% CRIT/);
  await expect(storm).toContainText('Risky · can deal 0');
  await expect(storm).toContainText(/0–\d+ DMG/);
  await expect(potion).toContainText('Heals up to 25 HP · enemy strikes back');
  await expect(potion).toContainText(/\d+\/5/);
  await expect(potion).toContainText(/\d+\/\d+ used this fight/);
  await expect(combat.getByRole('button', { name: /^Omen details:/ })).toBeInViewport({ ratio: 1 });
  // The shared helper verifies that the full-size illustration can scroll
  // above the dock. On entry, its actions and current health stay on screen.
  await expect(actions).toBeInViewport({ ratio: 1 });
  await expect(combat.getByLabel('Combat health summary', { exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return combat;
}

async function expectSafariSizedArtwork(page: Page, info: TestInfo, mode: string) {
  const original = page.viewportSize()!;
  // These are usable page viewports, including phones with Safari chrome open,
  // rather than only a device's taller physical screen dimensions.
  for (const [width, height] of [[390, 664], [393, 724], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await expectSubstantialMobileCombat(page);
    if (width === 393) {
      await page.screenshot({ path: info.outputPath(`${mode}-iphone-393-initial.png`) });
      await page.screenshot({ path: info.outputPath(`${mode}-iphone-393-full.png`), fullPage: true });
    }
  }
  await page.setViewportSize(original);
  await expectSubstantialMobileCombat(page);
}

async function expectReadableCombatLog(page: Page) {
  const opener = page.getByRole('button', { name: 'Open dungeon log', exact: true });
  await expect(opener).toContainText('READ DUNGEON LOG');
  await expect(opener).toContainText('READ MORE');
  await opener.click();
  const log = page.getByRole('dialog', { name: 'Dungeon log', exact: true });
  await expect(log).toBeVisible();
  await expect(log).toContainText('DAMAGE');
  expect(await log.locator('p').count()).toBeGreaterThanOrEqual(2);
  expect(await log.locator('p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  await expect(log.getByRole('button', { name: 'Close details' })).toBeFocused();
  await log.getByRole('button', { name: 'Close details' }).click();
}

test('Full Expedition keeps substantial phone artwork, clock meaning and reachable action explanations', async ({ page }, info) => {
  const now = Math.floor(Date.now() / 1_000);
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v2',
    market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: now - 10, expiry: now + 290, lockedAt: now - 9 },
    run: {
      schema: 'market-dungeon/full-run/v3', phase: 'exploring', attemptNumber: 1, rematchRequired: false,
      currentAttempt: { attemptId: 'feedback_help_1', marketId: market.marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
      game: { ...emptyGame(), hasStarted: true, active: true, hp: 76, potions: 2, monsterHp: 30, monsterMaxHp: 30 },
      pendingBossReward: null, usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
    },
  };
  await quietLocalAnalytics(page);
  await page.clock.install({ time: now * 1_000 });
  await page.setViewportSize({ width: 375, height: 600 });
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: (array: Uint32Array) => { array.fill(0); return array; } });
  }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/expedition');
  const combat = await expectPermanentCombatHelp(page);
  await expectSafariSizedArtwork(page, info, 'full-expedition');
  await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Choose Judge demo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true })).toBeInViewport({ ratio: 1 });
  const omen = combat.getByRole('button', { name: /^Omen details:/ });
  await expect(omen).toContainText(/MARKET CLOSES IN.*\d{2}:\d{2}/);
  const clockText = (await omen.innerText()).match(/(\d{2}):(\d{2})/)!;
  const displayedSeconds = Number(clockText[1]) * 60 + Number(clockText[2]);
  const remainingSeconds = await page.evaluate(expiry => expiry - Math.floor(Date.now() / 1_000), now + 290);
  expect(Math.abs(displayedSeconds - remainingSeconds)).toBeLessThanOrEqual(1);
  await expect(combat.getByText('You can keep fighting after 00:00.', { exact: true })).toBeInViewport({ ratio: 1 });
  const expected = resolveAttack(session.run.game, () => 0);
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(combat.getByLabel(/Your health/)).toHaveAttribute('aria-label', `Your health ${expected.hp} of 100`);
  await expect(combat.getByLabel(/Enemy health/)).toHaveAttribute('aria-label', `Enemy health ${expected.monsterHp} of 30`);
  await expectPermanentCombatHelp(page);
  await expectReadableCombatLog(page);
  await page.clock.setSystemTime((now + 301) * 1_000);
  await page.clock.runFor(1_000);
  await expect(omen).toContainText('MARKET CLOSED');
  await combat.getByText('Market closed. Keep fighting to reach the boss result.', { exact: true }).scrollIntoViewIfNeeded();
  await expect(combat.getByText('Market closed. Keep fighting to reach the boss result.', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(combat.getByRole('button', { name: /ATTACK/ })).toBeEnabled();
  await expect(combat.getByLabel(/Enemy health/)).toHaveAttribute('aria-label', `Enemy health ${expected.monsterHp} of 30`);
  await expectPermanentCombatHelp(page);
  await combat.locator('blockquote').scrollIntoViewIfNeeded();
  await expect(combat.locator('blockquote')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('full-expedition-feedback-help-375.png'), fullPage: true });
});

test('Live Judge explains choice before lock and permits the same combat after the market closes at 390×664', async ({ page }, info) => {
  const fixture = liveJudgeFixture();
  const calls = { starts: 0, publicKeys: 0, rpc: 0, odds: 0, reveals: 0 };
  await quietLocalAnalytics(page);
  await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
  await page.route('**/api/live-judge/public-key', async route => { calls.publicKeys++; await route.fulfill({ json: fixture.publicKey }); });
  await page.route('**/api/live-judge/start', async route => {
    calls.starts++;
    expect(route.request().postDataJSON()).toEqual({ marketId: fixture.market.marketId, direction: 'UP' });
    await route.fulfill({ json: { live: fixture.session } });
  });
  await page.route('**/api/live-judge/odds?*', async route => {
    calls.odds++;
    await route.fulfill({ json: {
      marketId: fixture.market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId), intervalSec: 60,
      asset: 'BTC', expiry: fixture.market.expiry, state: 'open',
      odds: deriveDreamDexClobOdds({ marketId: fixture.market.marketId, quoteDecimals: 6, observedAtIso: new Date(fixture.now * 1_000).toISOString(), bestBid: '590000', bestAsk: '610000' }),
    } });
  });
  await page.route(LIVE_JUDGE.rpc, async route => {
    calls.rpc++;
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
  });
  await page.route('**/api/live-judge/reveal', async route => { calls.reveals++; await route.abort('failed'); });
  await page.clock.install({ time: fixture.now * 1_000 });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/shannon/live-judge');
  const lock = page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true });
  await expect(lock).toBeEnabled();
  await expectChoiceGuideBeforeLock(page, lock);
  await expectDemoNavigation(page, 'live');
  await expect(page.getByLabel('Live dreamDEX order book odds', { exact: true }).locator('strong')).toHaveText(['60%', '40%']);
  await lock.click();
  const combat = await expectPermanentCombatHelp(page);
  await expectSafariSizedArtwork(page, info, 'live-judge');
  const clock = page.getByLabel('Live market countdown', { exact: true });
  await expect(clock).toContainText('MARKET CLOSES IN');
  await expect(clock).toContainText('You can keep fighting after 00:00.');
  await expect(clock).toBeInViewport({ ratio: 1 });
  expect(calls.starts).toBe(1);
  expect(calls.publicKeys).toBeGreaterThan(0);
  expect(calls.odds).toBeGreaterThan(0);
  await page.clock.setSystemTime((fixture.market.expiry + 1) * 1_000);
  await page.clock.runFor(1_000);
  await expect(clock).toContainText('MARKET CLOSED');
  await expect(clock).toContainText('Keep fighting. The boss result comes after combat.');
  await expect(combat.getByLabel('Your health 76 of 100')).toBeVisible();
  await expect(combat.getByLabel('Enemy health 40 of 40')).toBeVisible();
  await expect(combat.getByRole('button', { name: /ATTACK/ })).toBeEnabled();
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  // Preserve the first exchange already covered by the existing live combat
  // regression: market expiry does not change damage or the guard's survival.
  await expect(combat.getByLabel('Your health 66 of 100')).toBeVisible();
  await expect(combat.getByLabel('Enemy health 24 of 40')).toBeVisible();
  await expect(combat.getByRole('status', { name: 'Last combat exchange' })).toHaveText('TOOK 10 HPDEALT 16 HP');
  await expectPermanentCombatHelp(page);
  await expectReadableCombatLog(page);
  await expectDemoNavigation(page, 'live', false);
  expect(calls.reveals).toBe(0);
  expect(calls.rpc).toBe(0);
  await page.screenshot({ path: info.outputPath('live-judge-feedback-help-390.png'), fullPage: true });
});

test('Historical Judge introduces Bitcoin consequences before lock and retains combat help and navigation', async ({ page }, info) => {
  let starts = 0;
  await quietLocalAnalytics(page);
  await page.route('**/api/shannon/judge-replay/start', async route => {
    starts++;
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: shannonStartPayload });
  });
  await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/shannon/judge');
  const lock = page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true });
  await expectChoiceGuideBeforeLock(page, lock);
  await expectDemoNavigation(page, 'replay');
  await expect(page.locator('.judge-lock-context')).toContainText('NO LIVE PRICE FEED');
  expect(starts).toBe(0);
  await lock.click();
  const combat = await expectPermanentCombatHelp(page);
  await expectSafariSizedArtwork(page, info, 'historical-judge');
  await expect(combat.getByRole('complementary', { name: 'First fight guide', exact: true })).toContainText('Your omen does not change attack damage.');
  await expect(combat.getByRole('button', { name: /^Omen details:/ })).toContainText('SEALED REPLAY');
  await expect(combat.getByText('You can keep fighting after 00:00.', { exact: true })).toHaveCount(0);
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expectPermanentCombatHelp(page);
  await expectReadableCombatLog(page);
  await expectDemoNavigation(page, 'replay', false);
  expect(starts).toBe(1);
  await page.screenshot({ path: info.outputPath('historical-judge-feedback-help-390.png'), fullPage: true });
});
