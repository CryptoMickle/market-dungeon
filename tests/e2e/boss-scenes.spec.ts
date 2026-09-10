import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createMarketDungeonRun,
  FULL_RUN_MARKET_PROOF_VERSION,
  transitionMarketDungeon,
  type MarketDungeonAction,
  type MarketDungeonRun,
} from '../../app/gameplay/event-boss-engine';
import {
  FULL_RUN_STORAGE_KEY,
  serializeFullRunSession,
  type FullRunSession,
} from '../../app/gameplay/full-run-storage';
import { getDelvewornPersona } from '../../app/gameplay/delveworn-personas';

function apply(run: MarketDungeonRun, action: MarketDungeonAction) {
  const transition = transitionMarketDungeon(run, action, () => 0);
  expect(transition.accepted, transition.reason).toBe(true);
  return transition.run;
}

/** Isolated visual fixture: exercise real transitions with an overpowered test loadout. */
function bossSession(tier: number, outcome: 'pending' | 'BLESSED' | 'CURSED' = 'pending'): FullRunSession {
  let run = createMarketDungeonRun(() => 0);
  run.game.weaponLevel = 1_000;
  run.game.armorLevel = 1_000;
  let market: FullRunSession['market'] = null;
  for (let currentTier = 1; currentTier <= tier; currentTier++) {
    const marketId = `0x${String(currentTier).padStart(64, '0')}`;
    const attemptId = `scene_attempt_${currentTier}`;
    market = { marketId, intervalSec: 300, question: 'BTC closes at or above its opening reference', strikeUsd: '78500.00', tradingStart: 1_000, expiry: 1_300, lockedAt: 1_001 };
    run = apply(run, { type: 'lock-boss', lock: { attemptId, marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null } });
    for (let step = 0; step < 25 && run.phase !== 'settlement-pending'; step++) {
      run = apply(run, { type: 'gameplay', action: { type: run.game.monsterHp > 0 ? 'attack' : 'enter-next-room' } });
    }
    expect(run.phase).toBe('settlement-pending');
    if (currentTier === tier && outcome === 'pending') break;
    run = apply(run, { type: 'settle-boss', settlement: { attemptId, marketId, direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: currentTier === tier ? outcome as 'BLESSED' | 'CURSED' : 'BLESSED' } });
    market = null;
    if (currentTier < tier) run = apply(run, { type: 'gameplay', action: { type: 'claim-relic', equip: false } });
  }
  return { schema: 'market-dungeon/full-run-session/v2', run, market };
}

async function openSession(page: Page, session: FullRunSession) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY,
    value: serializeFullRunSession(session),
  });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/market?interval=300', route => route.fulfill({ status: 503, json: { error: 'Controlled visual fixture: market unavailable' } }));
  await page.goto('/');
}

async function expectSettledArtwork(page: Page, scene: Locator, viewportWidth: number) {
  await expect(scene).toBeVisible();
  const image = scene.getByRole('img');
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect.poll(() => scene.evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'))).toBe(true);
  const geometry = await image.evaluate(element => {
    const art = element.closest('[data-boss-artwork]')!;
    const frame = art.parentElement!.getBoundingClientRect();
    const image = element.getBoundingClientRect();
    return {
      frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      image: { x: image.x, y: image.y, width: image.width, height: image.height },
      fit: getComputedStyle(element).objectFit,
      opacity: Number(getComputedStyle(art).opacity),
    };
  });
  // The old animation replaced translateX(-50%) and left a small off-centre rectangle.
  expect(Math.abs(geometry.image.x - geometry.frame.x)).toBeLessThan(1);
  expect(Math.abs(geometry.image.y - geometry.frame.y)).toBeLessThan(1);
  expect(Math.abs(geometry.image.width - geometry.frame.width)).toBeLessThan(1);
  expect(Math.abs(geometry.image.height - geometry.frame.height)).toBeLessThan(1);
  expect(geometry.image.width).toBeGreaterThan(250);
  expect(geometry.fit).toBe('cover');
  expect(geometry.opacity).toBeGreaterThanOrEqual(0.7);
  const identity = scene.getByText('DUNGEON MANAGEMENT', { exact: true }).locator('..').locator('strong');
  const identityBounds = (await identity.boundingBox())!;
  const verdict = scene.getByRole('heading').locator('..');
  const sigilBounds = (await verdict.locator('svg').boundingBox())!;
  const headingBounds = (await scene.getByRole('heading').boundingBox())!;
  expect(identityBounds.y + identityBounds.height).toBeLessThanOrEqual(Math.min(sigilBounds.y, headingBounds.y) + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
}

for (const tier of [1, 2, 3, 4]) {
  const persona = getDelvewornPersona(3, tier * 10);
  test(`pending tier ${tier} keeps ${persona.name} centred and fills the scene on desktop and mobile`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const session = bossSession(tier);
    await openSession(page, session);
    const scene = page.getByRole('region', { name: `${persona.name} defeated, awaiting omen settlement` });
    await expect(scene.getByRole('img')).toHaveAttribute('src', new RegExp(persona.image.split('/').at(-1)!));
    await expect(page.getByRole('region', { name: 'Player status' })).toContainText(`T${tier} · ROOM ${tier * 10}/40`);
    if (tier === 1) {
      await page.waitForTimeout(200);
      await scene.screenshot({ path: info.outputPath('pending-desktop-during-animation.png') });
    }
    const viewports = [{ width: 1280, height: 720 }, { width: 390, height: 844 }];
    if (tier === 1) viewports.push({ width: 820, height: 720 }, { width: 320, height: 568 });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectSettledArtwork(page, scene, viewport.width);
      await expect(scene.getByRole('heading', { name: 'BOSS DOWN', exact: true })).toBeVisible();
      await expect(scene.getByLabel(`Boss health 0 of ${session.run.game.monsterMaxHp}`, { exact: true })).toBeVisible();
      await scene.screenshot({ path: info.outputPath(`tier-${tier}-${viewport.width}.png`) });
    }
    expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(serializeFullRunSession(session));
  });
}

test('mobile victory shows the boss and relic together, and replay preserves the saved expedition', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = bossSession(1, 'BLESSED');
  await openSession(page, session);
  const scene = page.locator('[data-boss-scene="blessed"]');
  await expectSettledArtwork(page, scene, 390);
  await expect(scene.getByRole('heading', { name: 'THE OMEN HOLDS', exact: true })).toBeVisible();
  const relic = page.getByRole('region', { name: 'Relic reward' });
  await expect(relic.getByRole('img')).toBeVisible();
  const relicBounds = (await relic.boundingBox())!;
  const imageBounds = (await relic.getByRole('img').boundingBox())!;
  expect(imageBounds.x).toBeGreaterThanOrEqual(relicBounds.x);
  expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(relicBounds.x + relicBounds.width);
  const before = await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY);
  await scene.getByRole('button', { name: /REPLAY VICTORY/ }).click();
  await expectSettledArtwork(page, scene, 390);
  expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(before);
  await expect(relic.getByRole('button', { name: 'CLAIM & EQUIP' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('mobile-victory-and-relic.png'), fullPage: true });
  await relic.getByRole('button', { name: 'CLAIM & EQUIP' }).click();
  await expect(page.getByRole('heading', { name: 'Lock your omen before Room 11.', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player status' })).toContainText('T2 · ROOM 11/40');
  await expect(page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 2', exact: true })).toBeVisible();
});

for (const outcome of ['BLESSED', 'CURSED'] as const) {
  test(`reduced motion keeps ${outcome} readable with the correct final boss HP`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: outcome === 'CURSED' ? 1280 : 390, height: outcome === 'CURSED' ? 720 : 844 });
    const session = bossSession(1, outcome);
    await openSession(page, session);
    const scene = page.locator(`[data-boss-scene="${outcome.toLowerCase()}"]`);
    await expectSettledArtwork(page, scene, outcome === 'CURSED' ? 1280 : 390);
    await expect(scene.getByRole('heading', { name: outcome === 'BLESSED' ? 'THE OMEN HOLDS' : 'RISEN AGAIN', exact: true })).toBeVisible();
    const maxHp = session.run.game.monsterMaxHp;
    const health = scene.getByLabel(`Boss health ${outcome === 'CURSED' ? maxHp : 0} of ${maxHp}`, { exact: true });
    await expect(health).toBeVisible();
    const fill = await health.locator('i > b').evaluate(element => element.getBoundingClientRect().width / element.parentElement!.clientWidth);
    expect(fill).toBeCloseTo(outcome === 'CURSED' ? 1 : 0, 2);
    expect(await scene.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    const before = await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY);
    await scene.getByRole('button', { name: /REPLAY/ }).click();
    expect(await scene.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(before);
    await scene.screenshot({ path: info.outputPath(`${outcome.toLowerCase()}-reduced-motion-final.png`) });
  });
}

test('spent Grave Pact revive is explicit in desktop relic and mobile gear details', async ({ page }) => {
  const session = bossSession(1, 'CURSED');
  session.run.game.equippedRelic = 8;
  session.run.game.ownedRelics = [8];
  session.run.game.relicCounts[8] = 1;
  session.run.game.relicReviveUsed = true;
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSession(page, session);
  await page.getByRole('button', { name: 'Relic details: Grave Pact' }).click();
  await expect(page.getByRole('dialog', { name: 'Relic details', exact: true })).toContainText('REVIVE SPENT');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /GEAR details:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Gear', exact: true })).toContainText('REVIVE SPENT');
  expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(serializeFullRunSession(session));
});
