import { writeFile } from 'node:fs/promises';
import { expect, test, type Response } from '@playwright/test';
import { formatClobPercent, type DreamDexClobOdds } from '../../app/clob-odds';
import { FULL_RUN_STORAGE_KEY, type FullRunSession } from '../../app/gameplay/full-run-storage';

test('live Full Expedition displays and refreshes its actual five-minute CLOB odds before locking', async ({ page, baseURL }, info) => {
  test.skip(process.env.LIVE_FULL_ODDS !== '1', 'Explicit candidate acceptance only');
  expect(process.env.LIVE_SMOKE_BASE_URL).toBeTruthy();
  await page.route('**/_vercel/insights/**', route => route.abort());
  const evidence: unknown[] = [{ baseURL, at: new Date().toISOString(), classification: 'Actual live market/UI; no mocked market, saved progress or clock' }];
  const panel = page.getByLabel('Live dreamDEX order book odds', { exact: true });
  const check = async (response: Response) => {
    expect(response.status()).toBe(200);
    const body = await response.json() as { market: { marketId: string; intervalSec: number | string; expiry: number | string }; odds: DreamDexClobOdds | null };
    evidence.push({ at: new Date().toISOString(), status: response.status(), body });
    expect(Number(body.market.intervalSec)).toBe(300);
    expect(Number(body.market.expiry)).toBeGreaterThan(Date.now() / 1000);
    await expect(panel).toBeVisible();
    if (body.odds?.marketId.toLowerCase() === body.market.marketId.toLowerCase() && body.odds.upProbability != null && body.odds.downProbability != null) {
      await expect(panel).toContainText(formatClobPercent(body.odds.upProbability));
      await expect(panel).toContainText(formatClobPercent(body.odds.downProbability));
      await expect(panel).toContainText(body.odds.observedAtIso.slice(11, 19));
    } else {
      await expect(panel).toContainText('LIVE ODDS UNAVAILABLE');
    }
    return body;
  };
  try {
    const initialResponse = page.waitForResponse('**/api/market?interval=300');
    await page.goto('/?automation=1');
    await check(await initialResponse);
    const refreshed = await check(await page.waitForResponse('**/api/market?interval=300', { timeout: 30_000 }));
    await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('img', { name: 'Closed dungeon gate' })).toBeVisible();
    await expect.poll(async () => page.getByRole('img', { name: 'Closed dungeon gate' }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: info.outputPath('actual-live-clob.png'), fullPage: true });
    await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
    await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
    const locked = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as FullRunSession, FULL_RUN_STORAGE_KEY);
    expect(locked.market?.marketId).toBe(refreshed.market.marketId.toLowerCase());
    expect(locked.market!.lockedAt).toBeLessThan(locked.market!.expiry);
    expect(locked.run.currentAttempt?.direction).toBe('DOWN');
    await expect(panel).toHaveCount(0);
    evidence.push({ at: new Date().toISOString(), locked });
    const desktopHealth = page.getByRole('region', { name: 'Player status', exact: true }).getByLabel(/Your health/);
    await expect(desktopHealth.getByText('❤️', { exact: true })).toBeVisible();
    const desktopHeart = (await desktopHealth.getByText('❤️', { exact: true }).boundingBox())!;
    const desktopHpNumber = (await desktopHealth.locator('b').boundingBox())!;
    expect(desktopHeart.x + desktopHeart.width).toBeLessThanOrEqual(desktopHpNumber.x);
    expect(desktopHeart.y + desktopHeart.height / 2).toBeCloseTo(desktopHpNumber.y + desktopHpNumber.height / 2, 0);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'CONTINUE ON DREAMDEX ↗', exact: true })).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
    await expect(footer.getByRole('link', { name: 'JUDGE PROOF WALKTHROUGH', exact: true })).toHaveAttribute('href', '/shannon/judge');
    await expect(footer.getByRole('link', { name: 'PRIVACY · CREDITS', exact: true })).toHaveAttribute('href', '/credits');
    const footerBox = (await footer.boundingBox())!;
    const combatBox = (await page.getByRole('region', { name: 'Combat view' }).boundingBox())!;
    expect(footerBox.y).toBeGreaterThanOrEqual(combatBox.y + combatBox.height);
    const desktopProgress = page.getByRole('list', { name: 'Room progress: tier 1, room 1 of 10', exact: true });
    await expect(desktopProgress).toBeVisible();
    await expect(desktopProgress.getByRole('listitem')).toHaveCount(10);
    await expect(desktopProgress.locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 1');
    await page.screenshot({ path: info.outputPath('actual-live-desktop-footer.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(footer).toBeHidden();
    const status = page.getByRole('region', { name: 'Player status', exact: true });
    const game = locked.run.game;
    await expect(status.getByLabel(`Gold ${game.gold}`, { exact: true })).toBeVisible();
    await expect(status.getByLabel(`Potions ${game.potions} of 5`, { exact: true })).toBeVisible();
    await expect(status.getByRole('button', { name: `GEAR details: Weapon ${game.weaponLevel}, Armor ${game.armorLevel}`, exact: true })).toBeVisible();
    const health = status.getByLabel(/Your health/);
    await expect(health).toContainText('❤️');
    const heartBox = (await health.getByText('❤️', { exact: true }).boundingBox())!;
    const hpNumberBox = (await health.locator('b').boundingBox())!;
    expect(heartBox.x + heartBox.width).toBeLessThanOrEqual(hpNumberBox.x);
    expect(heartBox.y + heartBox.height / 2).toBeCloseTo(hpNumberBox.y + hpNumberBox.height / 2, 0);
    const healthBox = (await health.boundingBox())!;
    const omenBox = (await status.getByRole('button', { name: /Omen details/ }).boundingBox())!;
    const logoBox = (await page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true }).boundingBox())!;
    expect(omenBox.y + omenBox.height).toBeLessThanOrEqual(healthBox.y);
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(healthBox.y);
    const progress = page.getByRole('list', { name: 'Room progress: tier 1, room 1 of 10', exact: true });
    await expect(progress.getByRole('listitem')).toHaveCount(10);
    await expect(progress.locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 1');
    await expect(page.getByRole('button', { name: /ATTACK/ })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /POTION/ })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: info.outputPath('actual-live-mobile-dashboard.png') });
    // Clear the actual first room without changing randomness, progress or the market.
    for (let step = 0; step < 20; step += 1) {
      const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as FullRunSession, FULL_RUN_STORAGE_KEY);
      if (state.run.game.monsterHp === 0 || state.run.phase === 'dead') break;
      const potion = page.getByRole('button', { name: /POTION/ });
      if (state.run.game.hp <= 60 && await potion.isEnabled()) await potion.click();
      else await page.getByRole('button', { name: /ATTACK/ }).click();
    }
    const cleared = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as FullRunSession, FULL_RUN_STORAGE_KEY);
    evidence.push({ at: new Date().toISOString(), actualFirstRoomReward: cleared });
    expect(cleared.run.phase).toBe('exploring');
    expect(cleared.run.game.roomsCleared).toBe(1);
    expect(cleared.run.game.monsterHp).toBe(0);
    const rewardName = ['', 'Potion', `${cleared.run.game.lastLootAmount} bonus gold`, 'Weapon +1', 'Armor +1'][cleared.run.game.lastLootType];
    expect(rewardName).toBeTruthy();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const lootArt = page.getByRole('img', { name: `Loot: ${rewardName}`, exact: true });
      await expect(lootArt).toBeVisible();
      await expect.poll(() => lootArt.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(page.getByRole('heading', { name: `Loot secured: ${rewardName}`, exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`actual-live-loot-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'ENTER ROOM 2', exact: true }).click();
    await expect(page.getByRole('img', { name: /^Loot:/ })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Room progress: tier 1, room 2 of 10', exact: true }).locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 2');
  } finally {
    await writeFile(info.outputPath('actual-live-clob.json'), JSON.stringify(evidence, null, 2));
  }
});
