import { readFile } from 'node:fs/promises';

import { expect, test, type Locator, type Page } from '@playwright/test';
import { playJudgeGuard, playJudgeBoss } from './judge-play';
import { expectSubstantialMobileCombat } from './mobile-combat-layout';

import type { JudgeCombatAction } from '../../app/judge-combat';
import { attack as resolveAttack, emptyGame } from '../../app/gameplay/delveworn-engine';
import { getMaxHpForRelic } from '../../app/gameplay/relics';
import { FULL_RUN_MARKET_PROOF_VERSION } from '../../app/gameplay/event-boss-engine';
import {
  FULL_RUN_STORAGE_KEY,
  serializeFullRunSession,
  type FullRunSession,
} from '../../app/gameplay/full-run-storage';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import {
  BLOCK_HASH,
  BLOCK_TAG,
  LOCK_PUBLIC_KEY,
  market,
  onchainSettlement,
  revealPayload,
  SEAL,
  startPayload,
  startPayloadForGameSeed,
  VALID_ACTIONS,
} from './judge-demo-fixture';

async function installDeterministicUpstreams(
  page: Page,
  options: {
    rpcUnavailable?: boolean;
    rpcFailuresBeforeSuccess?: number;
    tamperRevealField?: 'attestation' | 'algorithm' | 'ruleset' | 'finalHp' | 'void';
    onStartCall?: () => void;
    onRpcCall?: () => void;
  } = {},
) {
  // Vercel serves this production-only infrastructure script; next start does not.
  // Keep the local production smoke deterministic without suppressing app errors.
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  let rpcFailuresRemaining = options.rpcFailuresBeforeSuccess ?? 0;
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/judge-replay/start', async (route) => {
    options.onStartCall?.();
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: startPayload });
  });
  await page.route('**/api/judge-replay/public-key', async (route) => {
    await route.fulfill({ json: LOCK_PUBLIC_KEY });
  });
  await page.route('**/api/judge-replay/reveal', async (route) => {
    const body = route.request().postDataJSON() as { seal: string; actions: JudgeCombatAction[] };
    expect(body.seal).toBe(SEAL);
    expect(body.actions).toEqual(VALID_ACTIONS);
    const payload = revealPayload(body.actions);
    if (options.tamperRevealField === 'attestation') {
      payload.lockAttestation = {
        ...payload.lockAttestation,
        signature: `${payload.lockAttestation.signature[0] === 'A' ? 'B' : 'A'}${payload.lockAttestation.signature.slice(1)}`,
      };
    } else if (options.tamperRevealField === 'algorithm') {
      payload.replayProof.algorithm = 'SHA-512';
    } else if (options.tamperRevealField === 'ruleset') {
      payload.combatProof.ruleset = 'market-dungeon/judge-combat/v1';
    } else if (options.tamperRevealField === 'finalHp') {
      payload.combatProof.finalHp += 1;
    } else if (options.tamperRevealField === 'void') {
      const unexpectedVoid = payload.market as unknown as { voided: boolean; winningOutcome: number | null };
      unexpectedVoid.voided = true;
      unexpectedVoid.winningOutcome = null;
    }
    await route.fulfill({ json: payload });
  });
  await page.route(SOMNIA_MAINNET_RPC, async (route) => {
    options.onRpcCall?.();
    if (options.rpcUnavailable || rpcFailuresRemaining > 0) {
      rpcFailuresRemaining -= 1;
      await route.abort('failed');
      return;
    }
    const body = route.request().postDataJSON() as { method: string; params: Array<{ to?: string }> };
    let result: unknown;
    if (body.method === 'eth_chainId') result = '0x13a7';
    else if (body.method === 'eth_getBlockByHash') result = { number: BLOCK_TAG, hash: BLOCK_HASH };
    else if (body.method === 'eth_call') {
      result = body.params[0]?.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
        ? onchainSettlement.calls.moduleMarket.result
        : onchainSettlement.calls.settlementRecord.result;
    } else throw new Error(`Unexpected browser RPC method: ${body.method}`);
    await route.fulfill({
      json: { jsonrpc: '2.0', id: 1, result },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function expectOptimizedImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /\/_next\/image\?url=%2F/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => (
    element.complete && element.naturalWidth > 0
  ))).toBe(true);
}

async function expectJudgeBossReward(page: Page) {
  await expect(page.locator('.result-hero > .muted')).toHaveText('You chose BTC UP. The market settled BTC UP. Your prediction was correct. The final boss stays down and its reward is secured.');
  // The controlled replay starts with 62, earns 18 from the guard and 42 from the boss.
  await expect(page.locator('.final-stats > div').filter({ hasText: 'FINAL GOLD' }).locator('strong')).toHaveText('122');
  await expect(page.getByLabel('Post text — copy manually if needed')).toHaveValue(/2 of 2 replay encounters cleared · 122 gold/);
  await expect(page.locator('.dungeon-log')).toContainText('FINAL BOSS DEFEATED · +42 GOLD');
  await expect(page.locator('.dungeon-log')).toContainText('The final boss stays down and its reward is secured.');
  await expect(page.locator('body')).not.toContainText('prediction gold');
}

async function expectCenteredBossArtwork(scene: Locator) {
  const artwork = scene.locator('[data-boss-artwork]');
  const image = artwork.getByRole('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  // Measure the rendered image after its entrance settles. It must fill the
  // scene without drifting toward a corner as the old transformed image did.
  await expect.poll(async () => {
    const frame = (await artwork.locator('..').boundingBox())!;
    const art = (await image.boundingBox())!;
    return Math.max(
      Math.abs(art.x - frame.x),
      Math.abs(art.y - frame.y),
      Math.abs(art.width - frame.width),
      Math.abs(art.height - frame.height),
    );
  }).toBeLessThanOrEqual(1);
}

async function expectBossReplayRunning(scene: Locator) {
  await expect.poll(() => scene.locator('[data-boss-artwork]').evaluate(element =>
    element.getAnimations().some(animation => animation.playState === 'running'
      && typeof animation.currentTime === 'number' && animation.currentTime < 1_500),
  )).toBe(true);
}

async function expectDesktopCombat(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const modes = page.getByRole('navigation', { name: 'Choose game mode', exact: true });
  for (const link of await modes.getByRole('link').all()) await expect(link).toBeInViewport({ ratio: 1 });
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  for (const link of await variants.getByRole('link').all()) await expect(link).toBeInViewport({ ratio: 1 });
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(combat).toBeVisible();
  await expectCombatBrand(combat);
  await expect(combat.locator('header > small')).toHaveCSS('text-align', 'right');
  const heart = combat.getByLabel(/Your health/).getByText('❤️', { exact: true });
  await expect(heart).toBeVisible();
  const heartBox = (await heart.boundingBox())!;
  const hpNumberBox = (await combat.getByLabel(/Your health/).locator('b').boundingBox())!;
  expect(heartBox.x + heartBox.width).toBeLessThanOrEqual(hpNumberBox.x);
  expect(heartBox.y + heartBox.height / 2).toBeCloseTo(hpNumberBox.y + hpNumberBox.height / 2, 0);
  await expect(combat.getByRole('button', { name: /GEAR/ })).not.toBeVisible();
  const dashboardBox = (await combat.getByLabel(/Your health/).boundingBox())!;
  const logoBox = (await combat.locator('header img').boundingBox())!;
  const summaryBox = (await combat.locator('header > small').boundingBox())!;
  const combatBox = (await combat.boundingBox())!;
  expect(logoBox.x + logoBox.width / 2).toBeCloseTo(combatBox.x + combatBox.width / 2, 0);
  expect(dashboardBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
  expect(dashboardBox.y).toBeGreaterThanOrEqual(summaryBox.y + summaryBox.height);
  const modeBox = (await combat.locator('header > span').boundingBox())!;
  const omenBox = (await combat.getByRole('button', { name: /Omen details/ }).boundingBox())!;
  expect(modeBox.x + modeBox.width).toBeLessThanOrEqual(logoBox.x);
  expect(omenBox.x).toBeCloseTo(modeBox.x, 0);
  expect(omenBox.y).toBeGreaterThanOrEqual(modeBox.y + modeBox.height);
  expect(logoBox.width).toBe(width >= 1200 && height >= 800 ? 252 : 168);
  expect(summaryBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
  await expect(combat.locator('header .desktop-keyboard-hint')).toHaveCount(0);
  const hint = combat.locator('.desktop-keyboard-hint');
  await expect(hint).toHaveCount(1);
  await expect(hint).toBeInViewport({ ratio: 1 });
  const hintBox = (await hint.boundingBox())!;
  const potionBox = (await combat.getByRole('button', { name: /POTION/ }).boundingBox())!;
  expect(hintBox.y).toBeGreaterThanOrEqual(potionBox.y + potionBox.height + 5);
  expect(hintBox.x).toBeCloseTo(potionBox.x, 0);
  expect(hintBox.width).toBeCloseTo(potionBox.width, 0);
  const potionCount = (await combat.getByRole('button', { name: /POTION/ }).innerText()).match(/\d+\/5/)![0];
  await expect(combat.locator('header > small')).toContainText(`🧪 Potions ${potionCount}`);
  if (width >= 1440 && height >= 800) {
    const stage = (await combat.boundingBox())!;
    expect(stage.width).toBeGreaterThanOrEqual(Math.min(width - 64, 1760));
    expect(stage.width).toBeLessThanOrEqual(1760);
    expect(dashboardBox.width).toBeLessThanOrEqual(480);
    expect(stage.height).toBeLessThanOrEqual(height);
    expect(await combat.getByRole('heading').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
  }
  // Check the entire page: old controls must stay hidden after CSS minification.
  await expect(page.getByRole('button', { name: /ATTACK/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /STORM/ })).toHaveCount(1);
  const artFrame = combat.getByRole('img').locator('..');
  const elements = [combat.getByLabel(/Your health/), combat.getByLabel(/Enemy health/), artFrame, combat.getByRole('region', { name: 'Combat actions' }), combat.getByRole('status')];
  for (const element of elements) {
    await expect(element).toBeInViewport({ ratio: 1 });
    const box = (await element.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  }
  const art = (await artFrame.boundingBox())!;
  expect(art.width / art.height).toBeCloseTo(1.5, 1);
  const flavor = (await combat.locator('blockquote').boundingBox())!;
  const log = (await combat.getByRole('button', { name: 'Open dungeon log' }).boundingBox())!;
  const firstFightGuide = combat.getByRole('complementary', { name: 'First fight guide' });
  // The first-room guide intentionally sits between the monster line and log.
  // Check adjacent gaps so its readable content is not mistaken for whitespace.
  const guide = await firstFightGuide.count() ? await firstFightGuide.boundingBox() : null;
  if (guide) {
    await expect(firstFightGuide).toBeInViewport({ ratio: 1 });
    expect(guide.y).toBeGreaterThanOrEqual(flavor.y + flavor.height);
    expect(guide.y - (flavor.y + flavor.height)).toBeLessThanOrEqual(24);
    expect(log.y).toBeGreaterThanOrEqual(guide.y + guide.height);
  }
  const beforeLog = guide ?? flavor;
  expect(log.y - (beforeLog.y + beforeLog.height)).toBeLessThanOrEqual(24);
  const enemy = (await combat.getByLabel(/Enemy health/).boundingBox())!;
  expect(art.x + art.width).toBeLessThanOrEqual(enemy.x);
  await expect(combat.getByRole('img')).toHaveCSS('object-fit', 'contain');
  await expect(artFrame).toHaveCSS('overflow', 'hidden');
  const croppedImage = (await combat.getByRole('img').boundingBox())!;
  expect(croppedImage.width / art.width).toBeGreaterThan(1.15);
  expect(croppedImage.width / art.width).toBeLessThanOrEqual(1.21);
  const buttons = combat.getByRole('region', { name: 'Combat actions' }).getByRole('button');
  await expect(buttons.nth(0)).toContainText('STORM');
  await expect(buttons.nth(1)).toContainText('ATTACK');
  await expect(buttons.nth(1)).toContainText('% CRIT');
  await expect(buttons.nth(2)).toContainText('POTION');
  const bounds = await Promise.all((await buttons.all()).map(button => button.boundingBox()));
  expect(bounds[0]!.x).toBeLessThan(bounds[1]!.x);
  expect(bounds[0]!.y).toBeCloseTo(bounds[1]!.y, 0);
  expect(bounds[2]!.y).toBeGreaterThanOrEqual(bounds[0]!.y + bounds[0]!.height);
  expect(bounds[2]!.x).toBeCloseTo(bounds[0]!.x, 0);
  expect(bounds[2]!.width).toBeCloseTo(bounds[1]!.x + bounds[1]!.width - bounds[0]!.x, 0);
  expect(bounds[2]!.height).toBeGreaterThanOrEqual(44);
  expect(bounds[2]!.height).toBeLessThan(bounds[0]!.height);
  const feedback = combat.getByRole('status').locator('span');
  for (const [label, button] of [[feedback.first(), buttons.nth(0)], [feedback.last(), buttons.nth(1)]]) {
    const a = (await label.boundingBox())!, b = (await button.boundingBox())!;
    expect(a.x).toBeCloseTo(b.x, 0);
    expect(a.width).toBeCloseTo(b.width, 0);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

async function expectBetweenRoomArrowEdges(page: Page) {
  const field = page.locator('[data-keyboard-vertical="edges"]');
  await expect(field).toBeVisible();
  const controls = field.locator('button:visible:enabled, a[href]:visible, summary:visible');
  // The preceding mouse action can leave a control mid-hover transition.
  // Test keyboard edges with the pointer clear, then measure the current layout
  // after each focus reset rather than reusing coordinates from before a scroll.
  await page.mouse.move(0, 0);
  await expect.poll(() => controls.evaluateAll(elements => elements.every(element =>
    element.getAnimations().every(animation => animation.playState !== 'running'),
  ))).toBe(true);
  const savedBefore = await page.evaluate(() => JSON.stringify(localStorage));
  // Entering the action field uses the requested edge, not subsequent movement.
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowDown']) {
    await page.locator('main').evaluate(el => { el.tabIndex = -1; el.focus(); });
    const targets = await controls.all();
    const positions = await Promise.all(targets.map(async item => ({ item, box: (await item.boundingBox())! })));
    positions.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    expect(positions.length).toBeGreaterThan(1);
    await page.keyboard.press(key);
    await expect(positions[key === 'ArrowUp' ? 0 : positions.length - 1].item).toBeFocused();
  }
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(savedBefore);
}

test('desktop Judge keeps complete combat in view and preserves keyboard order and proof flow', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/judge');
  const expectReplayNavigation = async () => {
    const modes = page.getByRole('navigation', { name: 'Choose game mode', exact: true });
    const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
    await expect(modes.getByRole('link')).toHaveText(['FULL EXPEDITION', 'JUDGE DEMO']);
    await expect(modes.getByRole('link', { name: 'JUDGE DEMO', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(modes.getByRole('link', { name: 'JUDGE DEMO', exact: true })).toHaveAttribute('href', '/judge');
    await expect(modes.getByRole('link', { name: 'FULL EXPEDITION', exact: true })).toHaveAttribute('href', '/');
    await expect(modes.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
    await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/judge');
    await expect(variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('href', '/shannon/live-judge');
    await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
    for (const navigation of [modes, variants]) {
      for (const link of await navigation.getByRole('link').all()) await expect(link).toBeInViewport({ ratio: 1 });
    }
  };
  await expectReplayNavigation();
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await expect(page.getByRole('list', { name: /^Room progress:/ })).toHaveCount(0);
  const footer = page.locator('footer');
  const expectCombatFooter = async () => {
    await expectReplayNavigation();
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'VERIFY A PROOF' })).toHaveAttribute('href', '/verify');
    await expect(footer.getByRole('link', { name: 'PRIVACY · CREDITS · AI DISCLOSURE' })).toHaveAttribute('href', '/credits');
    const bounds = (await page.getByRole('region', { name: 'Combat view' }).boundingBox())!;
    expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  };
  await expectCombatFooter();
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(footer).toBeHidden();
  for (const [w, h] of [[1280,720], [1440,900], [1920,1080], [2136,1200], [2560,1440], [820,720]]) await expectDesktopCombat(page, w, h);
  await expectDesktopCombat(page,2136,1200);
  await page.screenshot({ path: info.outputPath('large-desktop-judge.png') });
  await expectDesktopCombat(page, 1280, 720);
  await page.screenshot({ path: info.outputPath('desktop-judge-guard.png') });
  const combat = page.getByRole('region', { name: 'Combat view' });
  const actions = combat.getByRole('region', { name: 'Combat actions' });
  await actions.getByRole('button', { name: /STORM/ }).focus();
  await page.keyboard.press('Tab');
  await expect(actions.getByRole('button', { name: /ATTACK/ })).toBeFocused();
  await expect(actions.getByRole('button', { name: /ATTACK/ })).toHaveCSS('outline-style', 'solid');
  await expect(actions.getByRole('button', { name: /ATTACK/ })).toContainText('15% CRIT');
  await page.keyboard.press('Tab');
  await expect(actions.getByRole('button', { name: /POTION/ })).toBeFocused();
  await playJudgeGuard(page);
  await expectBetweenRoomArrowEdges(page);
  await page.screenshot({ path: info.outputPath('desktop-judge-between.png'), fullPage: true });
  expect((await page.locator('.game-column').boundingBox())!.width).toBeGreaterThan(1200);
  await expect(page.locator('.desktop-stage-header')).toBeVisible();
  await expect(page.locator('.desktop-stage-header header > small')).toHaveCSS('text-align', 'right');
  for (const [width,height] of [[820,720],[1280,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button', { name: '👑 ENTER FINAL BOSS' })).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize({width:1280,height:720});
  const stepBoxes = await Promise.all((await page.locator('.judge-replay-steps > span').all()).map(el => el.boundingBox()));
  for (let index=1; index<stepBoxes.length; index++) expect(stepBoxes[index-1]!.x + stepBoxes[index-1]!.width).toBeLessThanOrEqual(stepBoxes[index]!.x);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expectDesktopCombat(page, 1280, 720);
  await expectCombatFooter();
  await page.screenshot({ path: info.outputPath('desktop-judge-boss.png'), fullPage: true });
  await playJudgeBoss(page);
  const revealAction = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(page.locator('.desktop-stage-header')).toContainText('Gold 80');
  await expect(revealAction).toBeEnabled();
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    await page.locator('.desktop-journey').focus();
    await page.keyboard.press(key);
    await expect(revealAction).toBeFocused();
    await expect(revealAction).toBeInViewport({ ratio: 1 });
  }
  await page.getByRole('button', { name: '🧰 VISIT TRAVELLING MERCHANT' }).click();
  const merchantGold = page.locator('.merchant-stats > div').filter({ hasText: 'GOLD' }).locator('strong');
  const merchantPotions = page.locator('.merchant-stats > div').filter({ hasText: 'POTIONS' }).locator('strong');
  const goldBeforeRest = await merchantGold.innerText();
  const potionsBeforeRest = await merchantPotions.innerText();
  for (const [width, height] of [[820,720], [1280,720], [1920,866]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: 'TAKE A FREE REST · RESTORE HP' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '🔮 RETURN TO BOSS FATE' })).toBeInViewport({ ratio: 1 });
    expect((await page.locator('.merchant-view').boundingBox())!.height).toBeLessThan(260);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'TAKE A FREE REST · RESTORE HP' }).click();
  await expect(page.getByRole('button', { name: 'FULLY RESTED · 100/100 HP' })).toBeDisabled();
  await expect(page.locator('.merchant-stats > div').filter({ hasText: 'HEALTH' })).toContainText('100/100');
  await expect(merchantGold).toHaveText(goldBeforeRest);
  await expect(merchantPotions).toHaveText(potionsBeforeRest);
  await page.screenshot({ path: info.outputPath('desktop-judge-kevin-compact.png') });
  await page.getByRole('button', { name: '🔮 RETURN TO BOSS FATE' }).click();
  await expect(page.locator('.action-dock-oracle')).toHaveCSS('order', '-1');
  for (const [width, height] of [[820,720], [1280,720], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Boss defeated. Reveal your locked BTC result.', { exact: true })).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: info.outputPath('desktop-judge-reveal.png') });
  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  await expectReplayNavigation();
  await expectJudgeBossReward(page);
  const resultShare = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(resultShare.getByRole('button', { name: '1 · SAVE IMAGE' })).toBeEnabled();
  const shareBounds = (await resultShare.boundingBox())!;
  const resultBounds = (await page.locator('.result-hero').boundingBox())!;
  expect(resultBounds.x + resultBounds.width).toBeLessThanOrEqual(shareBounds.x);
  const finalScene = page.locator('.result-hero [data-boss-scene]');
  await expect.poll(() => finalScene.evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'))).toBe(true);
  await finalScene.screenshot({ path: info.outputPath('desktop-judge-victory-scene-finished.png') });
  await page.screenshot({ path: info.outputPath('desktop-judge-result.png'), fullPage: true });
  await info.attach('desktop-judge-result-geometry', {
    contentType: 'application/json',
    body: JSON.stringify(await page.evaluate(() => {
      const selectors = ['.desktop-journey', '.result-hero-grid', '.result-hero', '.result-hero > *', '.run-share-panel', '.judge-result-evidence', '.judge-result-evidence > *', '.dungeon-log', 'footer'];
      return { height: document.documentElement.scrollHeight, elements: selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map(element => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { selector, tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 100), x: bounds.x, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height, margin: style.margin, padding: style.padding, gap: style.gap };
      }).filter(element => element.width && element.height)) };
    }), null, 2),
  });
  // The three-part outcome and save-location guidance add one short text row.
  // Include the 52px Judge variant row while keeping the result page bounded.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1952);
});

test('Judge restores monster humor and shows the full critical finishing damage', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.route('**/api/judge-replay/start', route => route.fulfill({ json: startPayloadForGameSeed('a'.repeat(42) + '2') }));
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  const combat = page.getByRole('region', { name: 'Combat view' });
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(combat.getByRole('button', { name: 'Open dungeon log' })).toContainText('Architecture becomes unexpectedly aggressive.');
  await combat.getByRole('button', { name: 'Open dungeon log' }).click();
  await expect(page.getByRole('dialog', { name: 'Dungeon log' })).toContainText('Negotiations remain unproductive.');
  await expect(page.getByRole('dialog', { name: 'Dungeon log' })).toContainText('Meatwall');
  await page.getByRole('button', { name: 'Close details' }).click();
  for (const [width, height] of [[390,664], [320,568]]) await expectCompactCombat(page, width, height);
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(combat.getByLabel('Enemy health 4 of 40', { exact: true })).toBeVisible();
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByRole('status', { name: 'Critical finishing blow' })).toHaveText('🔥 CRITICAL! · 34 HP');
  await expect(page.getByRole('button', { name: '👑 ENTER FINAL BOSS' })).toBeVisible();
});

test('desktop Full Expedition preserves critical feedback, HP smoothing and detail access', async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(0); return array; }, configurable: true }));
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const footer = page.locator('footer');
  const expectFooter = async () => {
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('FULL GAME · DELVEWORN RULES · ACTIVE 5M DREAMDEX SETTLEMENT');
    await expect(footer.getByRole('link', { name: 'CONTINUE ON DREAMDEX ↗', exact: true })).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
    await expect(footer.getByRole('link', { name: 'LIVE JUDGE DEMO', exact: true })).toHaveAttribute('href', '/shannon/live-judge');
    await expect(footer.getByRole('link', { name: 'PRIVACY · CREDITS', exact: true })).toHaveAttribute('href', '/credits');
  };
  await expectFooter();
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  for (const [width,height] of [[1280,720],[820,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    // Setup includes the shared navigation, market context and choice guide.
    // Short screens retain readable content before the reachable lock action.
    if (width < 1200 || height < 800) await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /GOLD AWAKENS/ })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).click();
  await expectFooter();
  for (const [w,h] of [[1280,720], [1440,900], [1920,1080], [2136,1200], [2560,1440], [820,720]]) await expectDesktopCombat(page,w,h);
  await expectDesktopCombat(page,2136,1200);
  await page.screenshot({ path: info.outputPath('large-desktop-full.png') });
  await expectDesktopCombat(page,1280,720);
  const combat = page.getByRole('region', { name: 'Combat view' });
  await combat.getByRole('button', { name: /ATTACK/ }).press('Enter');
  await expect(combat.getByRole('status')).toContainText('CRITICAL! 16 HP');
  for (const label of [/Your health/, /Enemy health/]) await expect(combat.getByLabel(label).locator('em')).toHaveCSS('transition-duration', '0.35s');
  await expectDesktopCombat(page,1280,720);
  await page.screenshot({ path: info.outputPath('desktop-full-critical.png') });
  await expect(combat.getByRole('button', { name: /GEAR/ })).not.toBeVisible();
  await expect(combat.getByRole('button', { name: /Relic details/ })).toHaveCount(0);
  await combat.getByRole('button', { name: /Omen details/ }).click();
  await expect(page.getByRole('dialog', { name: 'Omen' })).toContainText('$60,000.00');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await combat.getByLabel(/Your health/).locator('em').evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.00001);
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByRole('status', { name: 'Critical finishing blow' })).toBeVisible();
  await expectFooter();
  await page.screenshot({ path: info.outputPath('desktop-full-between.png'), fullPage: true });
  for (const [width,height] of [[1280,720],[820,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button', { name: 'ENTER ROOM 2', exact: true })).toBeInViewport({ ratio: 1 });
  }
  await page.getByRole('button', { name: 'ENTER ROOM 2', exact: true }).click();
  await expectDesktopCombat(page,1280,720);
  await expect(combat.getByRole('status')).toHaveText('TOOK —DEALT —');
  await expectFooter();
  const footerBox = (await footer.boundingBox())!;
  const combatBox = (await combat.boundingBox())!;
  expect(footerBox.y).toBeGreaterThanOrEqual(combatBox.y + combatBox.height);
  await page.screenshot({ path: info.outputPath('desktop-full-room2-footer.png'), fullPage: true });
});

test('homepage leads with the restored full expedition and keeps the Judge walkthrough one action away', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: {
    market: { ...market, status: 'Trading', finalized: false, tradingStart: now, expiry: now + 300 },
    odds: { marketId: market.marketId, upProbability: 0.43, downProbability: 0.57, bestBid: 0.419, bestAsk: 0.449, spread: 0.03, source: 'ORDER_BOOK', observedAtIso: new Date().toISOString(), provider: 'dreamDEX CLOB', sdk: '@somnia-chain/markets-sdk' },
  } }));
  await page.goto('/');
  await expect(page.getByLabel('Live dreamDEX order book odds', { exact: true })).toContainText('43%');
  const hero = page.getByRole('img', { name: 'Delveworn Tier 2 monsters: zombie, goblin and orc', exact: true });
  for (const [width,height] of [[390,844],[820,720],[1280,720],[1920,1080],[2560,1440]]) {
    await page.setViewportSize({width,height});
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute('src', /delveworn-tier2-party-hero/);
    const header = page.locator('header').filter({ has: page.getByRole('heading', { name: 'MARKET DUNGEON', exact: true }) });
    for (const element of [header.locator('p'), header.locator('h1'), header.locator(':scope > strong')]) {
      await expect(element).toHaveCSS('text-align', 'center');
    }
    const logo = (await header.locator('img').boundingBox())!;
    expect(logo.width).toBe(width > 800 ? 300 : 240);
    const headerBox = (await header.boundingBox())!;
    expect(logo.x + logo.width / 2).toBeCloseTo(headerBox.x + headerBox.width / 2, 0);
    if (width > 800) {
      const art = (await hero.locator('..').boundingBox())!;
      const copy = (await page.getByRole('heading', {name:'Defeat the boss. Predict correctly. Survive both.'}).boundingBox())!;
      expect(art.x + art.width).toBeLessThanOrEqual(copy.x);
      expect((await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).boundingBox())!.width).toBeLessThanOrEqual(480);
      const hint = (await page.locator('.desktop-keyboard-hint').boundingBox())!;
      const button = (await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).boundingBox())!;
      expect(hint.x + hint.width).toBeCloseTo(button.x + button.width, 0);
      if (width >= 1440) expect(copy.width).toBeLessThanOrEqual(640);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    if (width > 800) expect((await page.locator('main > div').boundingBox())!.width).toBeLessThanOrEqual(1180);
    if ([390, 820, 1280, 1920].includes(width)) {
      await expectOptimizedImageLoaded(hero);
      await page.screenshot({ path: info.outputPath(`homepage-market-${width}.png`), fullPage: true });
    }
  }
  await expect(page.getByRole('heading', { name: 'Defeat the boss. Predict correctly. Survive both.' })).toBeVisible();
  const fullRunButton = page.getByRole('button', { name: 'ENTER THE DUNGEON' });
  await expect(fullRunButton).toBeVisible();
  await expect(fullRunButton).toBeEnabled();
  await expect(page.getByRole('link', { name: /JUDGES: PLAY THE LIVE 1-MINUTE DEMO/ })).toHaveAttribute('href', '/shannon/live-judge');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('full health spans the entire dashboard with breathing room before the first omen', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  for (const width of [320, 390, 1280, 1920]) {
    await page.setViewportSize({ width, height: width < 800 ? 568 : 1080 });
    const status = page.getByRole('region', { name: 'Player status', exact: true });
    await expect(status).toContainText('100/100');
    await expect(status.getByRole('button', { name: /Omen details/ })).toHaveCount(0);
    const track = (await status.locator('i').boundingBox())!;
    const fill = (await status.locator('em').boundingBox())!;
    const gear = (await (width < 800 ? status.getByLabel('T1 · ROOM 1/40', { exact: true }) : status.getByLabel('Potions 3 of 5')).boundingBox())!;
    const panel = (await (width < 800 ? status : status.getByLabel(/Your health/)).boundingBox())!;
    expect(fill.width).toBeCloseTo(track.width, 0);
    expect(track.x + track.width).toBeCloseTo(gear.x + gear.width, 0);
    expect(panel.y + panel.height - track.y - track.height).toBeGreaterThanOrEqual(6);
    if (width > 800) await expectOptimizedImageLoaded(page.getByRole('img', { name: 'Closed dungeon gate' }));
    await page.screenshot({ path: info.outputPath(`full-hp-before-omen-${width}.png`) });
  }
  const stage = page.getByLabel('Expedition stage');
  await expect(stage.getByRole('img', { name: 'Closed dungeon gate' })).toBeVisible();
  await expect(stage.locator('img[src*="monsters"]')).toHaveCount(0);
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game, FULL_RUN_STORAGE_KEY);
  await page.getByRole('button', { name: /LOCK BTC UP/ }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  await expect(stage.getByRole('img', { name: 'Closed dungeon gate' })).toHaveCount(0);
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game, FULL_RUN_STORAGE_KEY);
  expect(after.monsterType).toBe(before.monsterType);
  expect(after.monsterHp).toBe(before.monsterHp);
});

test('/judge prerenders its primary Judge action before client hydration', async ({ request }) => {
  const judgeResponse = await request.get('/judge');
  expect(judgeResponse.ok()).toBe(true);
  const judgeHtml = await judgeResponse.text();
  expect(judgeHtml).toContain('LOCK OMEN &amp; SEAL REPLAY');
  expect(judgeHtml).not.toContain('PREPARING MARKET DUNGEON');
});

test('mobile Full Expedition starts cleanly and restores exact combat state after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market?interval=300', async (route) => {
    await route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await expect(page.getByRole('region', { name: 'Tier progress' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('T1 · ROOM 1/40');
  await expect(page.getByText('$60,000.00')).toBeVisible();
  await expect(page.getByText(/Grave Belle|Gary|Thud/)).toHaveCount(0);
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).click();
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(combat.getByRole('heading')).toHaveText(/Grave Belle|Gary|Thud/);
  const attackButton = page.getByRole('button', { name: /ATTACK/ });
  await expect(attackButton).toHaveCSS('color', 'rgb(9, 9, 11)');
  await expect(attackButton.locator('small')).toHaveCSS('color', 'rgb(67, 20, 7)');
  const enemyHp = combat.getByLabel(/Enemy health/).locator('b');
  await attackButton.click();
  const hpAfterAttack = await enemyHp.innerText();
  expect(hpAfterAttack).not.toBe('60/60');
  await page.reload();
  await expect(page.getByText(hpAfterAttack, { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 390, content: 390 });
});

async function expectCombatBrand(combat: Locator) {
  const logo = combat.locator('header img');
  await expect(logo).toHaveAttribute('src', /market-dungeon-logo-v1/);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(combat.locator('header')).toContainText('MARKET DUNGEON');
  await expect(combat.getByText(/💥 RETALIATION/)).toBeVisible();
}

async function expectCompactCombat(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const combat = await expectSubstantialMobileCombat(page);
  await expect(combat).toBeVisible();
  await expectCombatBrand(combat);
  const player = await combat.getByLabel(/Your health/).boundingBox();
  const enemy = await combat.getByLabel(/Enemy health/).boundingBox();
  const art = await combat.getByRole('img').boundingBox();
  const actions = await combat.getByRole('region', { name: 'Combat actions' }).boundingBox();
  const exchange = await combat.getByRole('status', { name: 'Last combat exchange' }).boundingBox();
  expect(player!.y).toBeGreaterThanOrEqual(0);
  expect(enemy!.y).toBeGreaterThan(player!.y + player!.height);
  expect(art!.y).toBeGreaterThanOrEqual(enemy!.y + enemy!.height - 1);
  expect(actions!.y).toBeGreaterThanOrEqual(art!.y + art!.height);
  expect(exchange!.y).toBeGreaterThanOrEqual(art!.y + art!.height);
  expect(exchange!.y + exchange!.height).toBeLessThanOrEqual(actions!.y);
  await expect(combat.getByRole('img')).toHaveCSS('object-fit', 'contain');
  const buttons = await combat.getByRole('region', { name: 'Combat actions' }).getByRole('button').all();
  const bounds = await Promise.all(buttons.map((button) => button.boundingBox()));
  expect(bounds[0]!.y).toBeCloseTo(bounds[1]!.y, 0);
  expect(bounds[0]!.x).toBeLessThan(bounds[1]!.x);
  expect(bounds[2]!.y).toBeGreaterThanOrEqual(bounds[0]!.y + bounds[0]!.height);
  expect(bounds[2]!.x).toBeCloseTo(bounds[0]!.x, 0);
  expect(bounds[2]!.width).toBeCloseTo(bounds[1]!.x + bounds[1]!.width - bounds[0]!.x, 0);
  for (const box of bounds) expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(buttons[0]).toContainText('STORM');
  await expect(buttons[1]).toContainText('ATTACK');
  await expect(buttons[1]).toContainText('% CRIT');
  await expect(buttons[2]).toContainText('POTION');
  const feedback = combat.getByRole('status', { name: 'Last combat exchange' }).locator('span');
  const took = await feedback.first().boundingBox();
  const dealt = await feedback.last().boundingBox();
  expect(took!.x).toBeCloseTo(bounds[0]!.x, 0);
  expect(took!.width).toBeCloseTo(bounds[0]!.width, 0);
  expect(dealt!.x).toBeCloseTo(bounds[1]!.x, 0);
  expect(dealt!.width).toBeCloseTo(bounds[1]!.width, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

test('mobile combat keeps substantial art and both HP bars with reachable controls in short viewports', async ({ page }, testInfo) => {
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market?interval=300', (route) => route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).click();
  for (const [width, height] of [[390, 664], [393, 724], [390, 844], [375, 600], [320, 568], [430, 664]]) await expectCompactCombat(page, width, height);
  await expectCompactCombat(page, 390, 664);
  await page.screenshot({ path: testInfo.outputPath('full-expedition-mobile.png'), fullPage: true });
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(page.locator('footer')).toBeHidden();
  await expect(combat.getByRole('button', { name: /POTION/ })).toBeDisabled();
  await combat.getByRole('button', { name: /GEAR/ }).click();
  await expect(page.getByRole('dialog', { name: 'Gear' })).toContainText('Active relic');
  await page.getByRole('button', { name: 'Close details' }).click();
  await combat.getByRole('button', { name: /Omen details/ }).click();
  await expect(page.getByRole('dialog', { name: 'Omen' })).toContainText('$60,000.00');
  await page.keyboard.press('Escape');
  const playerBefore = Number((await combat.getByLabel(/Your health/).locator('b').innerText()).split('/')[0]);
  const enemyBefore = Number((await combat.getByLabel(/Enemy health/).locator('b').innerText()).split('/')[0]);
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  const playerAfter = Number((await combat.getByLabel(/Your health/).locator('b').innerText()).split('/')[0]);
  const enemyAfter = Number((await combat.getByLabel(/Enemy health/).locator('b').innerText()).split('/')[0]);
  await expect(combat.getByRole('status')).toHaveText(new RegExp(`^TOOK ${playerBefore - playerAfter} HP(DEALT|🔥 CRITICAL!) ${enemyBefore - enemyAfter} HP$`));
  await page.screenshot({ path: testInfo.outputPath('full-expedition-damage.png'), fullPage: true });
  await expect(combat.getByRole('button', { name: /POTION/ })).toBeEnabled();
  await expectCompactCombat(page, 390, 664);
  await combat.getByRole('button', { name: 'Open dungeon log' }).click();
  await expect(page.getByRole('dialog', { name: 'Dungeon log' })).toContainText('DAMAGE');
  await page.getByRole('button', { name: 'Close details' }).click();
  await combat.getByRole('button', { name: /POTION/ }).click();
  await expect(combat.getByRole('button', { name: /POTION/ })).toContainText('2/5');
  await expect(combat.getByRole('status')).toContainText('DEALT 0 HP');
  for (let turn = 0; turn < 12 && await combat.isVisible(); turn += 1) {
    await combat.getByRole('button', { name: /ATTACK/ }).click();
  }
  await page.getByRole('button', { name: 'ENTER ROOM 2', exact: true }).click();
  await expectCompactCombat(page, 390, 664);
  await expect(combat.getByRole('status')).toHaveText('TOOK —DEALT —');
});

for (const [relicId, criticalChance] of [[0,15], [3,20], [11,30], [15,25]]) {
  test(`Attack shows actual ${criticalChance}% critical chance for equipped relic ${relicId}`, async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const maxHp = getMaxHpForRelic(100, relicId);
    const session: FullRunSession = {
      schema: 'market-dungeon/full-run-session/v2',
      market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: now - 10, expiry: now + 290, lockedAt: now - 9 },
      run: {
        schema: 'market-dungeon/full-run/v3', phase: 'exploring', attemptNumber: 1, rematchRequired: false,
        currentAttempt: { attemptId: 'critical_rate_1', marketId: market.marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
        game: { ...emptyGame(), hasStarted: true, active: true, monsterHp: 30, monsterMaxHp: 30, hp: maxHp, maxHp, equippedRelic: relicId, ownedRelics: relicId ? [relicId] : [], relicCounts: Array.from({ length: 16 }, (_, index) => relicId && index === relicId ? 1 : 0) },
        pendingBossReward: null, usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
      },
    };
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
    await page.goto('/');
    const attack = page.getByRole('region', { name: 'Combat actions' }).getByRole('button', { name: /ATTACK/ });
    await expect(attack).toContainText(`${criticalChance}% CRIT`);
    await expectCompactCombat(page, 320, 568);
    await expectDesktopCombat(page, 1280, 720);
    if (relicId !== 0) {
      await page.getByRole('button', { name: /Relic details/ }).focus();
      await page.keyboard.press('Enter');
      const details = page.getByRole('dialog', { name: 'Relic details', exact: true });
      await expect(details).toBeVisible();
      await expect(details).toContainText('between fights');
      const bounds = (await details.boundingBox())!;
      expect(bounds.x + bounds.width / 2).toBeCloseTo(640, 0);
      if (relicId === 3) await expect(details).toContainText('-20% Storm damage.');
      await expect(details.getByRole('button', { name: 'Close details' })).toBeFocused();
      await page.keyboard.press('Escape');
    } else await expect(page.getByRole('button', { name: /Relic details/ })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /GEAR/ }).click();
    const gear = page.getByRole('dialog', { name: 'Gear', exact: true });
    if (relicId === 0) await expect(gear).not.toContainText('After this fight');
    else await expect(gear).toContainText('CHANGE / UNEQUIP RELIC');
    if (relicId === 3) {
      // Owning a relic is sufficient even if none is currently equipped.
      session.run.game.equippedRelic = 0;
      const value = serializeFullRunSession(session);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value });
      await page.reload();
      await page.getByRole('button', { name: /GEAR/ }).click();
      await expect(gear).toContainText('Active relic: No Relic');
      await expect(gear).toContainText('CHANGE / UNEQUIP RELIC');
    }
  });
}

function uiParitySession(game: Partial<FullRunSession['run']['game']> = {}): FullRunSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    schema: 'market-dungeon/full-run-session/v2',
    market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: now - 10, expiry: now + 290, lockedAt: now - 9 },
    run: {
      schema: 'market-dungeon/full-run/v3', phase: 'exploring', attemptNumber: 1, rematchRequired: false,
      currentAttempt: { attemptId: 'ui_parity_1', marketId: market.marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
      game: { ...emptyGame(), hasStarted: true, active: true, monsterHp: 30, monsterMaxHp: 30, ...game },
      pendingBossReward: null, usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
    },
  };
}

test('desktop arrows and Enter navigate combat and dialogs without repeated actions', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  const combat = page.getByRole('region', { name: 'Combat view' });
  const attack = combat.getByRole('button', { name: /ATTACK/ });
  const storm = combat.getByRole('button', { name: /STORM/ });
  const potion = combat.getByRole('button', { name: /POTION/ });
  await expect(combat.locator('.desktop-keyboard-hint')).toBeVisible();
  await combat.focus();
  await page.keyboard.press('ArrowRight');
  await expect(attack).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(storm).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(attack).toBeFocused();
  await page.keyboard.down('Enter');
  const afterOneHit = await combat.getByLabel(/Enemy health/).getAttribute('aria-label');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await expect(combat.getByLabel(/Enemy health/)).toHaveAttribute('aria-label', afterOneHit!);
  await page.keyboard.up('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(potion).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(attack).toBeFocused();
  for (const key of ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowUp']) {
    await page.keyboard.press(key);
    expect(await combat.getByRole('region', { name: 'Combat actions' }).evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await combat.getByRole('button', { name: /Omen details/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(attack).toBeFocused();
  await combat.getByRole('button', { name: /Omen details/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Omen', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close details' })).toBeFocused();
  const dialogBox = (await dialog.boundingBox())!;
  expect(dialogBox.x + dialogBox.width / 2).toBeCloseTo(640, 0);
  await page.screenshot({ path: info.outputPath('desktop-omen-details.png') });
  await page.keyboard.press('ArrowDown');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('ArrowUp');
  await expect(dialog.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await attack.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(storm).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: info.outputPath('desktop-keyboard-focus.png') });
  await page.evaluate(() => {
    const field = document.createElement('textarea');
    field.setAttribute('aria-label', 'Keyboard isolation fixture');
    document.querySelector('main')!.append(field);
    field.focus();
  });
  const field = page.getByRole('textbox', { name: 'Keyboard isolation fixture' });
  await page.keyboard.type('ab');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('a\nb');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(combat.locator('.desktop-keyboard-hint')).not.toBeVisible();
});

test('mobile and desktop room progress follows the current tier through room, boss and next-tier combat', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/');
  for (const room of [1, 5, 10, 11, 20, 40]) {
    const state = uiParitySession({ roomsCleared: room - 1, monsterType: room % 10 === 0 ? 3 : 0 });
    state.run.phase = room % 10 === 0 ? 'boss-combat' : 'exploring';
    state.run.settlements = Array.from({ length: Math.floor((room - 1) / 10) }, (_, index) => ({
      attemptId: `room_map_${index + 1}`, marketId: `0x${(index + 1).toString(16).padStart(64, '0')}`,
      direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'BLESSED',
    }));
    state.run.attemptNumber = state.run.settlements.length + 1;
    state.run.usedMarketIds = state.run.settlements.map(item => item.marketId);
    state.run.resolvedAttemptIds = state.run.settlements.map(item => item.attemptId);
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(state) });
    await page.reload();
    const current = (room - 1) % 10 + 1;
    const progress = page.getByRole('list', { name: `Room progress: tier ${Math.ceil(room / 10)}, room ${current} of 10`, exact: true });
    await expect(progress.getByRole('listitem')).toHaveCount(10);
    await expect(progress.locator('[aria-current="step"]')).toHaveAttribute('aria-label', current === 10 ? 'Boss 10' : `Room ${current}`);
    await expect(progress.locator('[data-complete="true"]')).toHaveCount(current - 1);
    await expect(progress.getByRole('button')).toHaveCount(0);
    await expectCompactCombat(page, 390, 664);
    const health = (await page.getByLabel(/Your health/).boundingBox())!;
    const row = (await progress.boundingBox())!;
    const enemy = (await page.getByRole('region', { name: 'Combat view' }).getByLabel(/Enemy health/).boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(health.y + health.height);
    expect(row.y + row.height).toBeLessThanOrEqual(enemy.y);
    if ([1, 10, 11].includes(room)) await page.screenshot({ path: info.outputPath(`room-progress-${room}.png`) });
    await expectDesktopCombat(page, 1280, 900);
    await expect(progress).toBeInViewport({ ratio: 1 });
    await expect(progress.locator('[aria-current="step"]')).toHaveAttribute('aria-label', current === 10 ? 'Boss 10' : `Room ${current}`);
    const desktopRow = (await progress.boundingBox())!;
    const desktopHp = (await page.getByLabel(/Your health/).boundingBox())!;
    const art = (await page.getByRole('region', { name: 'Combat view' }).getByRole('img').boundingBox())!;
    expect(desktopRow.y).toBeGreaterThanOrEqual(desktopHp.y + desktopHp.height);
    expect(desktopRow.y + desktopRow.height).toBeLessThanOrEqual(art.y);
    if ([1, 10, 11].includes(room)) await page.screenshot({ path: info.outputPath(`desktop-room-progress-${room}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 664 });
  }
});

test('shared player dashboard stays compact and separates omen and Gear from the encounter', async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  await page.goto('/');
  for (const width of [320, 390, 820, 1280, 1920]) {
    await page.setViewportSize({ width, height: width <= 390 ? 568 : width === 1920 ? 1080 : 720 });
    const active = uiParitySession({ hp: 81, potions: 2, gold: 83, weaponLevel: 2, armorLevel: 1 });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(active) });
    await page.reload();
    const status = page.getByRole('region', { name: 'Player status', exact: true });
    await expect(status).toHaveCount(1);
    if (width < 800) await expect(status.getByRole('button', { name: /GEAR/ })).toBeInViewport({ ratio: 1 });
    else await expect(status.getByRole('button', { name: /GEAR/ })).not.toBeVisible();
    await expect(status.getByLabel('Potions 2 of 5')).toBeVisible();
    const omen = status.getByRole('button', { name: /Omen details/ });
    await expect(omen).toBeInViewport({ ratio: 1 });
    const combatStatus = (await status.boundingBox())!;
    const track = (await status.locator('i').boundingBox())!;
    const fill = (await status.locator('i > em').boundingBox())!;
    const gear = (await (width < 800 ? status.getByLabel('T1 · ROOM 1/40', { exact: true }) : status.getByLabel('Potions 2 of 5')).boundingBox())!;
    expect(track.x + track.width).toBeCloseTo(gear.x + gear.width, 0);
    expect(track.y).toBeGreaterThanOrEqual(gear.y + gear.height);
    expect(fill.width / track.width).toBeCloseTo(.81, 2);
    if (width <= 390) {
      const clockHint = status.getByText('You can keep fighting after 00:00.', { exact: true });
      await expect(clockHint).toBeInViewport({ ratio: 1 });
      // The clock explanation adds one readable row to the existing dashboard.
      // Keep the original compact resource budget plus that row and its gap.
      expect(combatStatus.height).toBeLessThanOrEqual(110 + (await clockHint.boundingBox())!.height + 6);
      await expect(status.getByLabel('Gold 83', { exact: true })).toBeVisible();
      const loadout = status.getByRole('button', { name: 'GEAR details: Weapon 2, Armor 1', exact: true });
      await expect(loadout).toContainText('⚔️ 2 · 🛡️ 1');
      const loadoutBox = (await loadout.boundingBox())!;
      expect(loadoutBox.height).toBeGreaterThanOrEqual(44);
      expect(loadoutBox.width).toBeGreaterThanOrEqual(44);
      const logo = (await page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true }).boundingBox())!;
      const omenBox = (await omen.boundingBox())!;
      expect(logo.height).toBeGreaterThanOrEqual(44);
      expect(omenBox.height).toBeGreaterThanOrEqual(44);
      expect(logo.x + logo.width).toBeLessThanOrEqual(omenBox.x);
      expect(logo.y).toBeCloseTo(omenBox.y, 0);
      const resources = (await status.getByLabel(/Your health/).boundingBox())!;
      expect(logo.y + logo.height).toBeLessThanOrEqual(resources.y);
      await expect(status.getByLabel(/Your health/)).toContainText('❤️');
      const heart = (await status.getByText('❤️', { exact: true }).boundingBox())!;
      const hpNumber = (await status.getByLabel(/Your health/).locator('b').boundingBox())!;
      expect(heart.x + heart.width).toBeLessThanOrEqual(hpNumber.x);
      expect(heart.y + heart.height / 2).toBeCloseTo(hpNumber.y + hpNumber.height / 2, 0);
      await expectCompactCombat(page, width, 568);
    } else await expectDesktopCombat(page, width, width === 1920 ? 1080 : 720);
    const enemy = (await page.getByRole('region', { name: 'Combat view' }).getByLabel(/Enemy health/).boundingBox())!;
    expect(combatStatus.y + combatStatus.height).toBeLessThanOrEqual(enemy.y);
    await omen.click();
    await expect(page.getByRole('dialog', { name: 'Omen', exact: true })).toContainText('Opening reference: $60,000.00');
    await page.getByRole('button', { name: 'Close details' }).click();
    await page.screenshot({ path: info.outputPath(`player-dashboard-combat-${width}.png`) });
    const cleared = uiParitySession({ hp: 81, potions: 2, monsterHp: 0, roomsCleared: 9 });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(cleared) });
    await page.reload();
    await expect(status).toBeVisible();
    await expect(status.getByRole('button', { name: /Omen details/ })).toContainText('BTC UP');
    const clearedStatus = (await status.boundingBox())!;
    expect(clearedStatus.height).toBeCloseTo(combatStatus.height, 0);
    // Combat's mobile stage adds a small outer inset. The dashboard itself
    // retains the same height and arrangement when the room clears.
    expect(Math.abs(clearedStatus.y - combatStatus.y)).toBeLessThanOrEqual(12);
    if (width < 800) {
      await status.getByRole('button', { name: /GEAR/ }).click();
      await expect(page.getByRole('dialog', { name: 'Gear', exact: true })).toContainText('No Relic');
      await page.getByRole('button', { name: 'Close details' }).click();
    } else {
      await expect(status.getByRole('button', { name: /GEAR/ })).not.toBeVisible();
      await expectBetweenRoomArrowEdges(page);
    }
    await page.screenshot({ path: info.outputPath(`player-dashboard-camp-${width}.png`), fullPage: true });
  }
});

for (const width of [390, 1280]) test(`Full Expedition logo returns home without losing the run at ${width}px`, async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  for (const monsterHp of [30, 0]) {
    const value = serializeFullRunSession(uiParitySession({ hp: 63, potions: 2, monsterHp }));
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value });
    await page.reload();
    const home = page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true });
    await expect(home).toBeVisible();
    const before = await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY);
    if (monsterHp > 0) {
      await home.focus();
      await page.keyboard.press('Enter');
    } else await home.click();
    await expect(page.getByRole('heading', { name: 'Defeat the boss. Predict correctly. Survive both.' })).toBeVisible();
    await expect(home).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Expedition market' })).toContainText('YOUR LOCKED OMEN');
    await expect(page.getByLabel('Live dreamDEX order book odds', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(before);
    await page.getByRole('button', { name: 'CONTINUE EXPEDITION' }).click();
    await expect(home).toBeVisible();
    await expect(page.getByLabel('Your health 63 of 100', { exact: true })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(before);
    await page.reload();
    await expect(home).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(before);
  }
});

for (const width of [1280, 1782]) test(`between-room potion remains reachable with open relics at ${width}px`, async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width, height: 1166 });
  await page.goto('/');
  const session = uiParitySession({ hp: 33, maxHp: 98, baseMaxHp: 98, potions: 1, roomsCleared: 11, monsterHp: 0, ownedRelics: [1], equippedRelic: 1 });
  const previousMarketId = `0x${'78'.repeat(32)}`;
  session.run.attemptNumber = 2;
  session.run.usedMarketIds = [previousMarketId];
  session.run.resolvedAttemptIds = ['tier_one_1'];
  session.run.settlements = [{ attemptId: 'tier_one_1', marketId: previousMarketId, direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'BLESSED' }];
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.reload();
  const summary = page.locator('summary').filter({ hasText: 'CHANGE / UNEQUIP RELIC' });
  const potion = page.getByRole('button', { name: /USE OWN POTION SAFELY/ });
  const nextRoom = page.getByRole('button', { name: 'ENTER ROOM 12', exact: true });
  await summary.click();
  await page.getByRole('group', { name: 'Choose active relic' }).getByRole('button', { name: /Blood Price/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(summary).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(potion).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(nextRoom).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(potion).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(summary.locator('..')).not.toHaveAttribute('open');
  await page.keyboard.press('ArrowUp');
  await expect(potion).toBeFocused();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game.hp, FULL_RUN_STORAGE_KEY)).toBe(33);
  await page.keyboard.press('Enter');
  await expect(potion).toBeDisabled();
  const healed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game, FULL_RUN_STORAGE_KEY);
  expect(healed.hp).toBe(58);
  expect(healed.potions).toBe(0);
  expect(healed.roomsCleared).toBe(11);
  expect(healed.equippedRelic).toBe(1);
  await summary.focus();
  await page.keyboard.press('ArrowUp');
  await expect(nextRoom).toBeFocused();
});

test('relic loadout follows the market disclosure and supports arrow navigation', async ({ page }) => {
  await installDeterministicUpstreams(page);
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: { ...market, marketId: `0x${'56'.repeat(32)}`, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const session = uiParitySession({ monsterHp: 0, roomsCleared: 10, ownedRelics: [3], equippedRelic: 3 });
  session.run.phase = 'boss-lock-required';
  session.run.currentAttempt = null;
  session.run.usedMarketIds = [market.marketId.toLowerCase()];
  session.run.resolvedAttemptIds = ['ui_parity_1'];
  session.run.settlements = [{ attemptId: 'ui_parity_1', marketId: market.marketId, direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'BLESSED' }];
  session.market = null;
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.reload();
  const summary = page.locator('summary').filter({ hasText: 'CHANGE / UNEQUIP RELIC' });
  await expect(summary).toBeVisible();
  const disclosure = page.getByText('Active dreamDEX BTC 5m market · local direction lock · direct Somnia settlement proof · no wallet, order or transaction', { exact: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const a = await disclosure.boundingBox();
    const b = await summary.boundingBox();
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('img', { name: 'Closed dungeon gate' })).toBeVisible();
  const up = page.getByRole('button', { name: /GOLD AWAKENS/ });
  const down = page.getByRole('button', { name: /SHADOWS RISE/ });
  await up.focus();
  await page.keyboard.press('ArrowRight');
  await expect(down).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /LOCK BTC/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  const lock = page.getByRole('button', { name: /LOCK BTC/ });
  for (const width of [1280, 1758, 1920]) {
    await page.setViewportSize({ width, height: 1137 });
    await down.focus();
    await page.keyboard.press('ArrowDown');
    await expect(lock).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(summary).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const relicChoices = page.getByRole('group', { name: 'Choose active relic' });
    expect(await relicChoices.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const relicCard = relicChoices.getByRole('button', { name: /Echo Lens/ });
    if (!await relicCard.evaluate(el => el === document.activeElement)) await page.keyboard.press('ArrowRight');
    await expect(relicCard).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).not.toHaveAttribute('open');
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await page.keyboard.press('ArrowUp');
    await expect(lock).toBeFocused();
  }
  await summary.click();
  await expect(summary.locator('..')).not.toHaveAttribute('open');
  await summary.click();
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('ArrowUp');
  await expect(lock).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run, FULL_RUN_STORAGE_KEY);
  expect(saved.game.roomsCleared).toBe(10);
  expect(saved.currentAttempt.marketId).toBe(`0x${'56'.repeat(32)}`);
});

test('Delveworn health thresholds, boss palette and equipment icons remain presentation-only', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  for (const [hp, tone, color] of [
    [100, 'healthy', 'oklch(0.765 0.177 163.223)'],
    [56, 'healthy', 'oklch(0.765 0.177 163.223)'],
    [55, 'warning', 'oklch(0.828 0.189 84.429)'],
    [26, 'warning', 'oklch(0.828 0.189 84.429)'],
    [25, 'danger', 'oklch(0.637 0.237 25.331)'],
    [1, 'danger', 'oklch(0.637 0.237 25.331)'],
  ] as const) {
    const value = serializeFullRunSession(uiParitySession({ hp }));
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value });
    await page.reload();
    const player = page.getByRole('region', { name: 'Combat view' }).getByLabel(`Your health ${hp} of 100`, { exact: true });
    await expect(player).toHaveAttribute('data-health', tone);
    await expect(player.locator('em')).toHaveCSS('background-color', color);
  }
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(combat.getByLabel(/Enemy health/).locator('em')).toHaveCSS('background-color', 'oklch(0.637 0.237 25.331)');
  await expect(combat.locator('header .gold-icon')).toBeVisible();
  await expect(combat.locator('header')).toContainText('⚔️ Weapon 0 · 🛡️ Armor 0 · ◆ Relic: No Relic');
  await expect(combat.getByRole('button', { name: /GEAR/ })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await combat.getByRole('button', { name: /GEAR/ }).click();
  const gear = page.getByRole('dialog', { name: 'Gear', exact: true });
  await expect(gear.locator('.gold-icon')).toBeVisible();
  await expect(gear).toContainText('⚔️ Weapon 0 · 🛡️ Armor 0');
  await expect(gear).toContainText('◆ Active relic: No Relic');
  await expect(gear).not.toContainText('spawn');
  await page.screenshot({ path: info.outputPath('gear-icons-mobile.png') });
  await page.getByRole('button', { name: 'Close details' }).click();
  const boss = uiParitySession({ hp: 50, monsterType: 3, monsterHp: 122, monsterMaxHp: 122, roomsCleared: 9 });
  boss.run.phase = 'boss-combat';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(boss) });
  await page.reload();
  await expect(combat.getByLabel(/Enemy health/).locator('em')).toHaveCSS('background-color', 'oklch(0.627 0.265 303.9)');
  await expectCompactCombat(page, 320, 568);
  await page.screenshot({ path: info.outputPath('boss-hp-mobile.png') });
});

for (const reward of [
  { name: 'Potion', roll: 0, potions: 3, file: '/assets/loot/potion-v1.webp', type: 1 },
  { name: '13 bonus gold', roll: 50, potions: 3, file: '/assets/delveworn-gold-coin.webp', type: 2 },
  { name: 'Weapon +1', roll: 85, potions: 3, file: '/assets/loot/weapon-v1.webp', type: 3 },
  { name: 'Armor +1', roll: 99, potions: 3, file: '/assets/loot/armor-v1.webp', type: 4 },
  { name: '10 bonus gold', roll: 0, potions: 5, file: '/assets/delveworn-gold-coin.webp', type: 2 },
]) test(`secured loot shows the actual ${reward.name} reward on mobile and desktop`, async ({ page }, info) => {
  // Produce the reward through the real engine, including a full-potion conversion.
  const session = uiParitySession({ monsterHp: 1, hp: 67, potions: reward.potions });
  const rolls = [0, 99, reward.roll, 8];
  session.run.game = resolveAttack(session.run.game, () => rolls.shift() ?? 0);
  expect(session.run.game.lastLootType).toBe(reward.type);
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: width > 800 ? 720 : 844 });
    await expect(page.getByRole('heading', { name: `Loot secured: ${reward.name}`, exact: true })).toBeVisible();
    const art = page.getByRole('img', { name: `Loot: ${reward.name}`, exact: true });
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('src', new RegExp(encodeURIComponent(reward.file)));
    await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(page.getByRole('img', { name: 'Grave Belle', exact: true })).toHaveCount(0);
    const imageBox = (await art.boundingBox())!;
    const headingBox = (await page.getByRole('heading', { name: `Loot secured: ${reward.name}`, exact: true }).boundingBox())!;
    const next = page.getByRole('button', { name: 'ENTER ROOM 2', exact: true });
    if (width > 800) {
      expect(imageBox.x + imageBox.width).toBeLessThan(headingBox.x);
      await expect(next).toBeInViewport({ ratio: 1 });
    } else {
      expect(imageBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
      expect(imageBox.y + imageBox.height).toBeLessThan((await next.boundingBox())!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: info.outputPath(`loot-${reward.type}-${width}.png`), fullPage: true });
  }
  await page.reload();
  await expect(page.getByRole('img', { name: `Loot: ${reward.name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ENTER ROOM 2', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Loot:/ })).toHaveCount(0);
});

for (const roomsCleared of [5, 9]) {
  test(`Full Expedition room ${roomsCleared} shows Kevin and the same gold artwork on mobile and desktop`, async ({ page }, info) => {
    const session = uiParitySession({ roomsCleared, monsterHp: 0, hp: 50, gold: 105, lastLootType: 1, lastLootAmount: 1, log: ['🪙 Base reward: 5 gold. The dungeon reluctantly honors payroll.'] });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
    await page.goto('/');
    const kevin = page.getByRole('img', { name: 'Quartermaster Kevin', exact: true });
    for (const [width, height] of [[1280,720], [1920,866], [390,844]]) {
      await page.setViewportSize({ width, height });
      await expect(kevin).toBeVisible();
      await expect.poll(() => kevin.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await expect(kevin).toHaveCSS('object-fit', 'contain');
      await expect(page.getByRole('img', { name: 'Loot: Potion', exact: true })).toBeVisible();
      await expect(page.locator('p').filter({ hasText: 'Base reward:' }).locator('.gold-icon')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('🪙');
      await expect(page.getByRole('button', { name: /REST \+30|BANDAGE \+25/ })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width > 800) {
        await expect(page.getByRole('button', { name: `ENTER ROOM ${roomsCleared + 1}`, exact: true })).toBeInViewport({ ratio: 1 });
        const art = (await kevin.boundingBox())!, shop = (await page.getByText('Quartermaster Kevin', { exact: true }).boundingBox())!;
        expect(art.x + art.width).toBeLessThan(shop.x);
      }
      await page.screenshot({ path: info.outputPath(`kevin-${width}.png`), fullPage: true });
    }
  });
}

for (const path of ['/', '/judge']) {
  test(`desktop potion status remains visible and updates during combat at ${path}`, async ({ page }) => {
    await installDeterministicUpstreams(page);
    const now = Math.floor(Date.now() / 1000);
    await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(path);
    if (path === '/') {
      await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
      await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
    } else await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
    const combat = page.getByRole('region', { name: 'Combat view' });
    const header = combat.locator('header > small');
    const potion = combat.getByRole('button', { name: /POTION/ });
    const count = Number((await potion.innerText()).match(/(\d+)\/5/)![1]);
    await expect(header).toBeVisible();
    await expect(header).toContainText(`🧪 Potions ${count}/5`);
    await combat.getByRole('button', { name: /ATTACK/ }).click();
    await potion.click();
    await expect(header).toContainText(`🧪 Potions ${count - 1}/5`);
    await expectDesktopCombat(page, 820, 720);
  });
}

test('mobile critical feedback survives a finishing blow and respects reduced motion', async ({ page }, testInfo) => {
  // Test-only RNG: real engine attacks become critical; no production rule changes.
  await page.addInitScript(() => Object.defineProperty(crypto, 'getRandomValues', {
    value: (array: Uint32Array) => { array.fill(0); return array; },
    configurable: true,
  }));
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market?interval=300', (route) => route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).click();
  const combat = page.getByRole('region', { name: 'Combat view' });
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(combat.getByRole('status')).toContainText('CRITICAL! 16 HP');
  const damage = combat.getByRole('status').locator('span').last();
  await expect(damage).toHaveCSS('color', 'rgb(253, 230, 138)');
  await expect(damage.locator('b')).toHaveCSS('animation-duration', '0.45s');
  await expectCompactCombat(page, 320, 568);
  await page.screenshot({ path: testInfo.outputPath('critical-hit-mobile.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(damage.locator('b')).toHaveCSS('animation-name', 'none');
  await combat.getByRole('button', { name: /POTION/ }).click();
  await expect(combat.getByRole('status')).toContainText('DEALT 0 HP');
  await expect(combat.getByRole('status')).not.toContainText('CRITICAL');
  await combat.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByRole('status', { name: 'Critical finishing blow' })).toHaveText('🔥 CRITICAL! · 16 HP');
  await page.getByRole('button', { name: 'ENTER ROOM 2', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Critical finishing blow' })).toHaveCount(0);
  await expect(combat.getByRole('status')).toHaveText('TOOK —DEALT —');
  await combat.getByRole('button', { name: /STORM/ }).click();
  await expect(combat.getByRole('status')).not.toContainText('CRITICAL');
});

test('mobile Judge shares substantial combat art and preserves receipt access and the reveal transcript', async ({ page }, testInfo) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await expectCompactCombat(page, 390, 664);
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(combat).toContainText('JUDGE · COMBAT REPLAY');
  await combat.getByRole('button', { name: /Omen details/ }).click();
  await expect(page.getByRole('dialog', { name: 'Omen' })).toContainText('✓ VERIFIED IN THIS BROWSER');
  await page.getByRole('button', { name: 'Close details' }).click();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expectCompactCombat(page, 375, 600);
  await page.screenshot({ path: testInfo.outputPath('judge-boss-mobile.png'), fullPage: true });
  await expectCompactCombat(page, 320, 568);
  await expect(combat.getByRole('status')).toHaveText('TOOK —DEALT —');
  const playerBefore = Number((await combat.getByLabel(/Your health/).locator('b').innerText()).split('/')[0]);
  const enemyBefore = Number((await combat.getByLabel(/Enemy health/).locator('b').innerText()).split('/')[0]);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const playerAfter = Number((await combat.getByLabel(/Your health/).locator('b').innerText()).split('/')[0]);
  const enemyAfter = Number((await combat.getByLabel(/Enemy health/).locator('b').innerText()).split('/')[0]);
  await expect(combat.getByRole('status')).toHaveText(`TOOK ${playerBefore - playerAfter} HPDEALT ${enemyBefore - enemyAfter} HP`);
  await expectCompactCombat(page, 390, 664);
  await page.screenshot({ path: testInfo.outputPath('judge-boss-damage.png'), fullPage: true });
  await playJudgeBoss(page, 1);
  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  await expectJudgeBossReward(page);
});

test('completed full expedition restores with an honest responsive run card', async ({ page }, info) => {
  const marketIds = [1, 2, 3, 4].map((value) => `0x${value.toString(16).padStart(64, '0')}`);
  const settlements = marketIds.map((marketId, index) => ({
    attemptId: `attempt_${index + 1}`,
    marketId,
    direction: index % 2 === 0 ? 'UP' as const : 'DOWN' as const,
    proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
    commitment: null,
    outcome: 'BLESSED' as const,
  }));
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v2',
    market: null,
    run: {
      schema: 'market-dungeon/full-run/v3',
      game: {
        ...emptyGame(),
        hasStarted: true,
        active: true,
        roomsCleared: 40,
        monsterHp: 0,
        monsterMaxHp: 230,
        gold: 123,
      },
      phase: 'complete',
      attemptNumber: 4,
      rematchRequired: false,
      currentAttempt: null,
      pendingBossReward: null,
      usedMarketIds: marketIds,
      usedCommitments: [],
      resolvedAttemptIds: settlements.map((settlement) => settlement.attemptId),
      settlements,
    },
  };
  const serialized = serializeFullRunSession(session);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY,
    value: serialized,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Every boss stayed down.' })).toBeVisible();
  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(share).toContainText('ROOM 40/40 · 40 ENEMIES DEFEATED');
  await expect(share).toContainText('The card itself is not portable proof.');
  await expect(share.getByRole('img')).toHaveAttribute('alt', 'Market Dungeon share card: room 40 of 40');
  await expect(page.getByRole('region', { name: 'Continue on dreamDEX' }).getByRole('link')).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
  await expect(page.getByRole('link', { name: 'VERIFY A PROOF', exact: true })).toHaveCount(0);
  for (const [width, height] of [[1280,720], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    await expect(share.getByRole('img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const card = (await share.getByRole('img').boundingBox())!;
    const summary = (await page.getByRole('heading', { name: 'Every boss stayed down.' }).boundingBox())!;
    expect(summary.x + summary.width).toBeLessThan(card.x);
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: info.outputPath('full-expedition-desktop-result.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 390, content: 390 });
});

test('first boss relic offers an honest claim-without-equipping choice', async ({ page }, info) => {
  const marketId = `0x${'1'.padStart(64, '0')}`;
  const attemptId = 'attempt_first_boss';
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v2',
    market: null,
    run: {
      schema: 'market-dungeon/full-run/v3',
      game: {
        ...emptyGame(),
        hasStarted: true,
        active: true,
        monsterType: 3,
        monsterHp: 0,
        monsterMaxHp: 122,
        roomsCleared: 10,
        gold: 42,
        relicOfferAvailable: true,
        relicOfferRarity: 1,
        relicOfferId: 1,
        log: ['The Dungeon Lord has been defeated.'],
      },
      phase: 'boss-reward',
      attemptNumber: 1,
      rematchRequired: false,
      currentAttempt: null,
      pendingBossReward: null,
      usedMarketIds: [marketId],
      usedCommitments: [],
      resolvedAttemptIds: [attemptId],
      settlements: [{
        attemptId,
        marketId,
        direction: 'UP',
        proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
        commitment: null,
        outcome: 'BLESSED',
      }],
    },
  };
  const serialized = serializeFullRunSession(session);
  await page.goto('/');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serialized });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Blood Price' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CLAIM & EQUIP' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CLAIM WITHOUT EQUIPPING' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'KEEP CURRENT RELIC' })).toHaveCount(0);
  const relicReward = page.getByRole('region', { name: 'Relic reward' });
  const defeatedBoss = page.getByLabel('The Dungeon Lord defeated and stays down');
  await expect(defeatedBoss).toBeVisible();
  await expect(defeatedBoss).toHaveAttribute('data-boss-scene', 'blessed');
  await expect(defeatedBoss.getByRole('heading', { name: 'THE OMEN HOLDS', exact: true })).toBeVisible();
  await expect(defeatedBoss.getByLabel('Boss health 0 of 122', { exact: true })).toContainText('0 / 122');
  await expect(relicReward.getByRole('img', { name: 'Blood Price' })).toBeVisible();
  const bossArt = defeatedBoss.getByRole('img', { name: 'The Dungeon Lord', exact: true });
  await expect(bossArt).toBeVisible();
  await expect(bossArt).toHaveAttribute('src', /boss-1-dungeon-lord/);
  await expect(page.getByRole('img', { name: 'The Dungeon Lord', exact: true })).toHaveCount(1);
  await expect.poll(() => defeatedBoss.locator('[data-boss-artwork]').evaluate(element => getComputedStyle(element).animationName)).toContain('sealed');
  for (const [width,height] of [[1280,720],[2136,1200]]) {
    await page.setViewportSize({width,height});
    await expectCenteredBossArtwork(defeatedBoss);
    await expect(page.getByRole('button', { name: 'CLAIM & EQUIP' })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const rewardBox = (await relicReward.boundingBox())!;
    const relicArt = (await relicReward.getByRole('img', { name: 'Blood Price' }).boundingBox())!;
    expect(relicArt.x).toBeGreaterThanOrEqual(rewardBox.x);
    expect(relicArt.x + relicArt.width).toBeLessThanOrEqual(rewardBox.x + rewardBox.width);
  }
  const beforeReplay = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run, FULL_RUN_STORAGE_KEY);
  await defeatedBoss.getByRole('button', { name: 'REPLAY VICTORY', exact: true }).click();
  await expectBossReplayRunning(defeatedBoss);
  await expectCenteredBossArtwork(defeatedBoss);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run, FULL_RUN_STORAGE_KEY)).toEqual(beforeReplay);
  await page.screenshot({path:info.outputPath('desktop-relic-reward.png'),fullPage:true});
  const withCurrentRelic = serializeFullRunSession({ ...session, run: { ...session.run, game: { ...session.run.game, equippedRelic: 3, ownedRelics: [3] } } });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: withCurrentRelic });
  await page.reload();
  await page.setViewportSize({width:1280,height:720});
  await expect(page.getByText('CURRENT RELIC · Echo Lens')).toBeVisible();
  await expect(page.getByLabel('Expedition stage').getByText('-20% Storm damage.', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', { name: 'KEEP CURRENT RELIC' })).toBeInViewport({ratio:1});
  await page.screenshot({path:info.outputPath('desktop-relic-comparison.png'),fullPage:true});
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serialized });
  await page.reload();
  await page.getByRole('button', { name: 'CLAIM WITHOUT EQUIPPING' }).click();
  const loadout = page.locator('summary').filter({ hasText: 'CHANGE / UNEQUIP RELIC' });
  await expect(loadout).toContainText('Active: No Relic');
  await loadout.click();
  const relics = page.getByRole('group', { name: 'Choose active relic' });
  await relics.getByRole('button', { name: /Blood Price/ }).click();
  await expect(loadout).toContainText('Active: Blood Price');
  await expect(relics.getByRole('button', { name: /Blood Price/ })).toHaveAttribute('aria-pressed', 'true');
  await relics.getByRole('button', { name: /UNEQUIP ACTIVE RELIC/ }).click();
  await expect(loadout).toContainText('Active: No Relic');
  await page.reload();
  await expect(loadout).toContainText('Active: No Relic');
});

for (const available of [true, false]) {
  test(`Judge reference distinguishes loading from ${available ? 'available' : 'unavailable'} context`, async ({ page }) => {
    await installDeterministicUpstreams(page);
    let finishLoading!: () => void;
    const loading = new Promise<void>(resolve => { finishLoading = resolve; });
    await page.route('**/api/market**', async route => {
      await loading;
      await route.fulfill({ json: available ? { market, odds: null } : { error: 'Reference unavailable' }, status: available ? 200 : 503 });
    });
    try {
      await page.goto('/judge');
      await expect(page.getByRole('region', { name: 'Start the two-minute Judge Demo' }).getByText('LOADING REFERENCE…', { exact: true })).toBeVisible();
      await expect(page.getByText('REFERENCE UNAVAILABLE', { exact: true })).toHaveCount(0);
      await expect(page.getByText('YOUR SELECTED OMEN · NOT LOCKED YET', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' })).toBeEnabled();
    } finally {
      finishLoading();
    }
    await expect(page.getByText('LOADING REFERENCE…', { exact: true })).toHaveCount(0);
    if (available) await expect(page.locator('.judge-lock-context strong')).toContainText('$');
    else await expect(page.getByRole('region', { name: 'Start the two-minute Judge Demo' }).getByText('REFERENCE UNAVAILABLE', { exact: true })).toBeVisible();
  });
}

test('Judge combat death does not claim a verified onchain loss or export a proof', async ({ page }) => {
  await installDeterministicUpstreams(page);
  const start = startPayloadForGameSeed('a'.repeat(42) + '5');
  await page.route('**/api/judge-replay/start', route => route.fulfill({ json: start }));
  let revealCalls = 0;
  await page.route('**/api/judge-replay/reveal', route => {
    revealCalls++;
    return route.fulfill({ status: 500, json: { error: 'No reveal allowed after combat death' } });
  });
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /STORM/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /STORM/ }).click();
  await expect(page.getByRole('heading', { name: 'You fell in combat.' })).toBeVisible();
  await expect(page.getByText('JUDGE RUN ENDED · COMBAT DEFEAT', { exact: true })).toBeVisible();
  const resultSummary = page.getByRole('region', { name: 'Choice, market result and boss fate' });
  await expect(resultSummary).toBeVisible();
  await expect(resultSummary).toHaveAttribute('data-outcome', 'DEFEATED');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'MARKET RESULT' }).locator('strong')).toHaveText('NOT REVEALED');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'BOSS FATE' }).locator('strong')).toHaveText('NOT DEFEATED');
  await expect(resultSummary).not.toContainText('Recorded result verified');
  await expect(page.locator('.result-hero .judge-verification')).toHaveCount(0);
  await expect(page.getByText('The sealed market was not revealed. No onchain outcome was verified for this run.', { exact: true })).toBeVisible();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN LOSS VERIFIED', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Portable run verification' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /REVEAL BOSS FATE/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Share your Market Dungeon result' })).toHaveCount(1);
  await expect(page.locator('.final-stats > div').filter({ hasText: 'REPLAY ENCOUNTERS' }).locator('strong')).toHaveText('1/2');
  await expect(page.getByLabel('Post text — copy manually if needed')).toHaveValue(/1 of 2 replay encounters/);
  expect(revealCalls).toBe(0);
});

test('direct /judge entry keeps the mobile choice guide before its reachable lock action', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/judge');
  await expect(page).toHaveURL(/\/judge$/);
  await expect(page.getByLabel('Judge Proof Chamber')).toContainText('2-MINUTE PROOF CHAMBER');
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Judge Demo progress' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('Choice first.');
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('No replacement.');
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('Independent result.');

  const lockButton = page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' });
  await expect(page.getByRole('button', { name: /GOLD AWAKENS/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /SHADOWS RISE/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(lockButton).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Readable pre-lock explanations extend setup vertically. Keep them before
  // the lock action rather than shrinking text to force this screen to fit.
  const guide = page.getByRole('region', { name: 'How your Bitcoin choice works' });
  const guideBox = (await guide.boundingBox())!;
  expect(guideBox.y + guideBox.height).toBeLessThanOrEqual((await lockButton.boundingBox())!.y);
  await lockButton.scrollIntoViewIfNeeded();
  await expect(lockButton).toBeInViewport({ ratio: 1 });
  await lockButton.click();
  await expect(page.getByLabel('Judge Demo progress').locator('span').filter({ hasText: 'DEFEAT GUARD' })).toHaveClass(/active/);
});

test('locked Judge view exposes receipt details on demand without revealing the market', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();

  await page.getByRole('button', { name: /Omen details/ }).click();
  const receipt = page.getByRole('region', { name: 'Server-authenticated lock receipt' }).filter({ visible: true });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('SERVER-AUTHENTICATED LOCK RECEIPT');
  await expect(receipt).toContainText('✓ VERIFIED IN THIS BROWSER');
  await expect(receipt).toContainText('Ed25519');
  await expect(receipt).toContainText('KEY ID · SHA-256 FINGERPRINT');
  await expect(receipt).toContainText(`ed25519:${LOCK_PUBLIC_KEY.keyId.slice(8, 16)}…${LOCK_PUBLIC_KEY.keyId.slice(-8)}`);
  await expect(receipt).toContainText('BTC UP');
  await expect(receipt).toContainText('LOCK 1970-01-01 00:08:20Z');
  await expect(receipt).toContainText('REVEAL FROM 1970-01-01 00:08:21Z');
  await expect(receipt).toContainText('EXPIRES 1970-01-01 01:23:20Z');
  await expect(receipt).toContainText('Not an external timestamp or endorsement');
  await expect(receipt).not.toContainText(market.marketId);
  await expect(receipt).not.toContainText(market.strikeUsd);
  const bounds = await receipt.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);

  await page.getByRole('button', { name: 'Close details' }).click();
  await playJudgeGuard(page);
  await expect(receipt).toBeVisible();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /Omen details/ }).click();
  await expect(receipt).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await playJudgeBoss(page);
  await expect(receipt).toBeVisible();

  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(receipt).toHaveCount(0);
});

test('challenge link opens a fresh Judge replay without exposing the prior run', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/judge?challenge=1');
  await expect(page).toHaveURL(/\/judge\?challenge=1$/);
  const invitation = page.getByRole('status', { name: 'Challenge invitation' });
  await expect(invitation).toContainText('BOSS + MARKET CHALLENGE');
  await expect(invitation).toContainText('fresh, separately verified replay');
  await expect(invitation).toContainText('your own hidden market');
  await expect(page.getByText(/0x[a-f0-9]{64}/i)).toHaveCount(0);

  const lockButton = page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' });
  await expect(lockButton).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const guide = page.getByRole('region', { name: 'How your Bitcoin choice works', exact: true });
  const guideBox = (await guide.boundingBox())!;
  expect(guideBox.y + guideBox.height).toBeLessThanOrEqual((await lockButton.boundingBox())!.y);
  await lockButton.scrollIntoViewIfNeeded();
  await expect(lockButton).toBeInViewport({ ratio: 1 });
  await expect(lockButton).toBeEnabled();
});

test('Judge Demo rejects a malformed or direction-swapped start response before locking', async ({ page }) => {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/judge-replay/start', async (route) => {
    await route.fulfill({
      json: {
        replay: {
          ...startPayload.replay,
          lockedDirection: 'DOWN',
        },
      },
    });
  });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();

  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Replay connection status' })).toContainText('The lock receipt could not be verified.');
  await expect(page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' })).toBeEnabled();
});

test('full-run entry fetches and exposes a five-minute reference before room one', async ({ page }) => {
  let marketRequests = 0;
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market**', async (route) => {
    marketRequests += 1;
    await route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) }, odds: null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await expect(page.getByRole('heading', { name: 'Lock your omen before Room 1.' })).toBeVisible();
  const guide = page.getByRole('region', { name: 'How your Bitcoin choice works' });
  await expect(guide).toContainText('BTC means Bitcoin.');
  await expect(guide).toContainText('It does not change Attack or Storm damage.');
  await expect(guide).toContainText('The same boss returns at full HP.');
  await expect(page.getByText(/UP wins at or above/)).toBeVisible();
  await expect(page.getByText('LIVE BTC OPENING REFERENCE')).toBeVisible();
  await expect(page.getByText('$60,000.00')).toBeVisible();
  expect(marketRequests).toBe(1);
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1' }).click();
  await expect(page.getByRole('complementary', { name: 'First fight guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open dungeon log' })).toContainText('READ DUNGEON LOG');
});

test('full-run rematch locks a fresh live omen and preserves Delveworn boss identity', async ({ page }, testInfo) => {
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v2',
    market: null,
    run: {
      schema: 'market-dungeon/full-run/v3',
      game: {
        ...emptyGame(),
        hasStarted: true,
        active: true,
        hp: 100,
        maxHp: 100,
        baseMaxHp: 100,
        weaponLevel: 100,
        roomsCleared: 9,
        monsterType: 3,
        monsterHp: 122,
        monsterMaxHp: 122,
      },
      phase: 'boss-lock-required',
      attemptNumber: 0,
      rematchRequired: true,
      currentAttempt: null,
      pendingBossReward: null,
      usedMarketIds: [],
      usedCommitments: [],
      resolvedAttemptIds: [],
      settlements: [],
    },
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY,
    value: serializeFullRunSession(session),
  });
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market?interval=300', async (route) => {
    await route.fulfill({ json: { market: { ...market, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) } } });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The boss is back. Lock a fresh omen.' })).toBeVisible();
  await expect(page.getByLabel('Your health 100 of 100')).toBeVisible();
  await expect(page.getByText('CAMP BEFORE THE BOSS')).toHaveCount(0);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · REMATCH BOSS' }).click();
  await expect(page.getByRole('heading', { name: 'The Dungeon Lord' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Combat view' })).toContainText('T1 · ROOM 10/40');
  await expect(page.getByText('122/122').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Combat view' }).locator('blockquote')).toContainText('questionable administrative competence');
  await expectCompactCombat(page, 375, 600);
  await page.screenshot({ path: testInfo.outputPath('boss-introduction-and-dialogue.png') });
  await expectCompactCombat(page, 320, 568);
});

for (const direction of ['UP', 'DOWN'] as const) {
  test(`Full Expedition ${direction} settlement retries safely and preserves the correct reward or rematch`, async ({ page }) => {
    await installDeterministicUpstreams(page);
    let unavailable = true;
    let finalized = false;
    await page.route('**/api/market?marketId=*', route => route.fulfill(unavailable
      ? { status: 503, json: { error: 'Temporary test upstream outage' } }
      : { json: { market: finalized ? market : { ...market, finalized: false, status: 'Trading', voided: false, winningOutcome: null }, onchainSettlement } }));
    const lock = { attemptId: 'test_attempt_1', marketId: market.marketId, direction, mode: 'live' as const, proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null };
    // Controlled post-combat fixture, not a human session or live-network run.
    const session: FullRunSession = {
      schema: 'market-dungeon/full-run-session/v2',
      market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: 100, expiry: 400, lockedAt: 101 },
      run: {
        schema: 'market-dungeon/full-run/v3', phase: 'settlement-pending', attemptNumber: 1,
        rematchRequired: false, currentAttempt: lock,
        game: { ...emptyGame(), hasStarted: true, active: true, roomsCleared: 9, monsterType: 3, monsterHp: 0, monsterMaxHp: 122, hp: 43, gold: 25, potions: 1, weaponLevel: 2, armorLevel: 1 },
        pendingBossReward: { room: 10, monsterType: 3, lootRoll: 99, amountRoll: 0, relicOfferRarity: 1, relicOfferId: 1 },
        usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
      },
    };
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
    await page.goto('/');
    const defeatedBoss = page.getByLabel('The Dungeon Lord defeated, awaiting omen settlement');
    await expect(defeatedBoss).toBeVisible();
    await expect(defeatedBoss).toHaveAttribute('data-boss-scene', 'pending');
    await expect(defeatedBoss.getByRole('heading', { name: 'BOSS DOWN', exact: true })).toBeVisible();
    await expect(defeatedBoss).toContainText('Combat won. The omen decides what happens next.');
    await expect(defeatedBoss.getByLabel('Boss health 0 of 122', { exact: true })).toContainText('0 / 122');
    await expect(page.getByRole('img', { name: 'The Dungeon Lord', exact: true })).toHaveCount(1);
    await expect.poll(() => defeatedBoss.locator('[data-boss-artwork]').evaluate(element => getComputedStyle(element).animationName)).toContain('defeat');
    await expectCenteredBossArtwork(defeatedBoss);
    await page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true }).click();
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY);
    await expect.poll(async () => (await saved()).run.phase).toBe('settlement-pending');
    await expect(page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true })).toBeEnabled();
    expect((await saved()).run.game.hp).toBe(43);
    unavailable = false;
    await expect(page.getByRole('heading', { name: 'Market closed. Check the result.' })).toBeVisible();
    await page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for the market result.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'latest check returned no finalized result' })).toBeVisible();
    expect((await saved()).run).toEqual(session.run);
    finalized = true;
    await page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true }).click();
    await expect.poll(async () => (await saved()).run.phase).toBe(direction === 'UP' ? 'boss-reward' : 'boss-lock-required');
    const settled = (await saved()).run;
    expect(settled.game.hp).toBe(43);
    expect(settled.game.potions).toBe(1);
    expect(settled.game.weaponLevel).toBe(2);
    // The fixed loot roll 99 grants armor only after a correct omen.
    expect(settled.game.armorLevel).toBe(direction === 'UP' ? 2 : 1);
    expect(settled.settlements).toHaveLength(1);
    expect(settled.settlements[0].outcome).toBe(direction === 'UP' ? 'BLESSED' : 'CURSED');
    const outcome = page.getByRole('status', { name: 'Verified boss outcome' });
    await expect(outcome).toContainText(`YOU CHOSEBTC ${direction}`);
    await expect(outcome).toContainText('MARKET SETTLEDBTC UP');
    if (direction === 'UP') {
      await expect(outcome).toContainText('CONSEQUENCERELIC UNLOCKED');
      await expect(outcome).toContainText('The market agreed');
      expect(settled.game.roomsCleared).toBe(10);
      expect(settled.game.relicOfferAvailable).toBe(true);
      expect(settled.game.gold).toBeGreaterThan(25);
      const victory = page.getByLabel('The Dungeon Lord defeated and stays down');
      await expect(victory).toHaveAttribute('data-boss-scene', 'blessed');
      await expect(victory.getByLabel('Boss health 0 of 122', { exact: true })).toBeVisible();
      await victory.getByRole('button', { name: 'REPLAY VICTORY', exact: true }).click();
      await expectBossReplayRunning(victory);
      await expectCenteredBossArtwork(victory);
      expect((await saved()).run).toEqual(settled);
    } else {
      await expect(outcome).toContainText('CONSEQUENCEBOSS RETURNS');
      await expect(outcome).toContainText('rises again at 122/122 HP');
      await expect(outcome).toContainText('43/100 HP, 1/5 potions and 25 gold. Used resources remain spent.');
      const resurrection = page.getByLabel('The Dungeon Lord resurrects at full health');
      await expect(resurrection).toHaveAttribute('data-boss-scene', 'cursed');
      await expect(page.getByRole('img', { name: 'The Dungeon Lord resurrecting', exact: true })).toHaveCount(1);
      await expect(resurrection.getByLabel('Boss health 122 of 122', { exact: true })).toContainText('FULL HP · 122/122');
      const replay = resurrection.getByRole('button', { name: /REPLAY RESURRECTION/ });
      await expect(replay).toBeVisible();
      await replay.click();
      await expectBossReplayRunning(resurrection);
      await expectCenteredBossArtwork(resurrection);
      expect((await saved()).run).toEqual(settled);
      expect(settled.game.roomsCleared).toBe(9);
      expect(settled.game.monsterHp).toBe(122);
      expect(settled.game.gold).toBe(25);
      expect(settled.game.relicOfferAvailable).toBe(false);
      await expect(page.getByRole('heading', { name: 'The boss is back. Lock a fresh omen.' })).toBeVisible();
      await expect(page.getByText('CAMP BEFORE THE BOSS')).toHaveCount(0);
    }
  });
}

for (const width of [1280, 390]) test(`pending settlement potion safely heals and persists without unlocking reveal at ${width}px`, async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width, height: 900 });
  const session = uiParitySession({ hp: 28, potions: 3, roomsCleared: 9, monsterType: 3, monsterHp: 0, monsterMaxHp: 122, combatPotionsUsed: 3, lastLootType: 3, lastLootAmount: 1, weaponLevel: 1 });
  session.run.phase = 'settlement-pending';
  session.run.pendingBossReward = { room: 10, monsterType: 3, lootRoll: 99, amountRoll: 0, relicOfferRarity: 1, relicOfferId: 1 };
  let settlementRequests = 0;
  await page.route('**/api/market?marketId=*', route => { settlementRequests += 1; return route.abort(); });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/');
  const potion = page.getByRole('button', { name: /USE POTION/ });
  await expect(page.getByRole('img', { name: /^Loot:/ })).toHaveCount(0);
  await expect(potion).toBeEnabled();
  await potion.click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY) as FullRunSession;
  expect(saved.run.game.hp).toBe(53);
  expect(saved.run.game.potions).toBe(2);
  expect(saved.run.game.combatPotionsUsed).toBe(3);
  expect(saved.run.currentAttempt).toEqual(session.run.currentAttempt);
  expect(saved.run.pendingBossReward).toEqual(session.run.pendingBossReward);
  expect(saved.market).toEqual(session.market);
  expect(saved.run.phase).toBe('settlement-pending');
  expect(saved.run.game.monsterHp).toBe(0);
  await expect(page.getByRole('button', { name: /^REVEAL IN/ })).toBeDisabled();
  await page.reload();
  await expect(potion).toContainText('2/5');
  await expect(page.getByText(/Potion restores 25 HP/)).toBeVisible();
  await page.screenshot({ path: info.outputPath(`waiting-potion-${width}.png`), fullPage: true });
  await potion.click();
  await potion.click();
  await expect(potion).toBeDisabled();
  await expect(potion).toContainText('0/5');
  const capped = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY) as FullRunSession;
  expect(capped.run.game.hp).toBe(100);
  expect(capped.run.game.potions).toBe(0);
  expect(capped.run.game.gold).toBe(session.run.game.gold);
  expect(capped.run.game.roomsCleared).toBe(9);
  expect(settlementRequests).toBe(0);
});

for (const width of [1280, 390]) test(`pre-rematch potion heals safely before locking and remains spent after reload at ${width}px`, async ({ page }, info) => {
  await installDeterministicUpstreams(page);
  const now = Math.floor(Date.now() / 1000);
  const freshMarket = { ...market, marketId: `0x${'34'.repeat(32)}`, finalized: false, status: 'Trading', tradingStart: String(now), expiry: String(now + 300) };
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: freshMarket } }));
  await page.setViewportSize({ width, height: 900 });
  const session = uiParitySession({ hp: 28, potions: 2, roomsCleared: 9, monsterType: 3, monsterHp: 122, monsterMaxHp: 122 });
  session.market = null;
  session.run.phase = 'boss-lock-required';
  session.run.rematchRequired = true;
  session.run.currentAttempt = null;
  session.run.usedMarketIds = [market.marketId.toLowerCase()];
  session.run.resolvedAttemptIds = ['ui_parity_1'];
  session.run.settlements = [{ attemptId: 'ui_parity_1', marketId: market.marketId, direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'CURSED' }];
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Closed dungeon gate' })).toHaveCount(0);
  const rematchScene = page.getByRole('region', { name: 'The Dungeon Lord resurrects at full health', exact: true });
  await expect(rematchScene.getByRole('img', { name: 'The Dungeon Lord resurrecting', exact: true })).toBeVisible();
  await expect(rematchScene.getByLabel('Boss health 122 of 122', { exact: true })).toBeVisible();
  const potion = page.getByRole('button', { name: /USE POTION/ });
  await potion.click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY) as FullRunSession;
  expect(saved.run.game.hp).toBe(53);
  expect(saved.run.game.potions).toBe(1);
  expect(saved.run.game.monsterHp).toBe(122);
  expect(saved.run.game.combatPotionsUsed).toBe(0);
  expect({ ...saved.run, game: session.run.game }).toEqual(session.run);
  expect(saved.market).toBeNull();
  await page.reload();
  await expect(potion).toContainText('1/5');
  await page.screenshot({ path: info.outputPath(`rematch-potion-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: /LOCK BTC UP · REMATCH BOSS/ }).click();
  const combat = page.getByRole('region', { name: 'Combat view' });
  await expect(combat).toBeVisible();
  await combat.getByRole('button', { name: /POTION/ }).click();
  const afterCombatPotion = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY) as FullRunSession;
  expect(afterCombatPotion.run.game.potions).toBe(0);
  expect(afterCombatPotion.run.game.lastMonsterDamage).toBeGreaterThan(0);
  expect(afterCombatPotion.run.game.combatPotionsUsed).toBe(1);
  expect(afterCombatPotion.run.currentAttempt?.marketId).toBe(freshMarket.marketId);
});

test('Full Expedition cannot reveal or request settlement before its locked market expires', async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v2',
    market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: now - 10, expiry: now + 290, lockedAt: now - 9 },
    run: {
      schema: 'market-dungeon/full-run/v3', phase: 'settlement-pending', attemptNumber: 1, rematchRequired: false,
      currentAttempt: { attemptId: 'test_wait_1', marketId: market.marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
      game: { ...emptyGame(), hasStarted: true, active: true, roomsCleared: 9, monsterType: 3, monsterHp: 0, monsterMaxHp: 122 },
      pendingBossReward: { room: 10, monsterType: 3, lootRoll: 99, amountRoll: 0, relicOfferRarity: 1, relicOfferId: 1 },
      usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
    },
  };
  let settlementRequests = 0;
  await page.route('**/api/market?marketId=*', route => { settlementRequests += 1; return route.abort(); });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hold the gate until settlement.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^REVEAL IN/ })).toBeDisabled();
  expect(settlementRequests).toBe(0);
});

test('privacy, asset provenance, AI disclosure, and music credits are reachable from the game', async ({ page }) => {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'PRIVACY · CREDITS' }).click();
  await expect(page).toHaveURL('/credits');
  await expect(page.getByRole('heading', { name: 'Privacy, credits & AI disclosure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Analytics and local data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artwork and asset provenance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI assistance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo-video music' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'VERCEL WEB ANALYTICS PRIVACY ↗' })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'PIXABAY LICENSE ↗' })).toHaveAttribute('target', '_blank');
});

test('Judge Demo completes in Chromium and renders independently verified proof links', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await installDeterministicUpstreams(page);

  const documentResponse = await page.goto('/judge');
  expect(documentResponse?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(documentResponse?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).click();
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await expectOptimizedImageLoaded(page.getByRole('region', { name: 'Combat view' }).getByRole('img'));

  await expect(page.getByRole('region', { name: 'Combat view' })).toContainText('STEP 2/5 · GUARD');
  await playJudgeGuard(page);
  await expect(page.getByRole('heading', { name: 'The final boss gate is open.' })).toBeVisible();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expectOptimizedImageLoaded(page.getByRole('region', { name: 'Combat view' }).getByRole('img'));
  await playJudgeBoss(page);

  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(reveal).toBeEnabled();
  await reveal.click();

  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  const plainProof = page.getByRole('region', { name: 'Plain-language proof summary' });
  await expect(plainProof).toContainText('was locked before market selection');
  await expect(plainProof).toContainText('could not be changed');
  await expect(plainProof).toContainText('independently reproduced the onchain result');
  await expect(page.getByText('✓ COMBAT + CHOICE LOCK + SOMNIA RESULT VERIFIED')).toBeVisible();
  const revealedProof = page.locator('.proof-revealed');
  await expect(revealedProof).not.toHaveAttribute('open', '');
  await revealedProof.locator('summary').click();
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();
  await expect(page.getByText('BROWSER RPC REFETCH + ABI + DIGESTS VERIFIED')).toBeVisible();
  await expect(page.getByAltText('Market Dungeon Judge Replay share card: 2 of 2 replay encounters')).toBeVisible();
  await expect(page.getByText('FINAL-TIER JUDGE REPLAY · 2/2 REPLAY ENCOUNTERS')).toBeVisible();
  const xShare = page.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true });
  await expect(xShare).toHaveAttribute('href', /https:\/\/twitter\.com\/intent\/tweet\?/);
  const xShareUrl = new URL(await xShare.getAttribute('href') ?? '');
  expect(xShareUrl.searchParams.get('text')).toContain('2 of 2 replay encounters cleared');
  expect(xShareUrl.searchParams.get('text')).toContain('Can you defeat both the boss and the market?');
  expect(xShareUrl.searchParams.get('url')).toBe('https://market-dungeon.vercel.app/judge?challenge=1');
  await expect(page.getByRole('link', { name: 'OPEN INDEPENDENT VERIFIER ↗' })).toHaveAttribute('href', '/verify');

  const proofLinks = revealedProof.locator('a');
  await expect(proofLinks).toHaveCount(5);
  for (const link of await proofLinks.all()) {
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https:\/\/explorer\.somnia\.network\/(?:block|address)\//);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  const dreamDexLink = page.getByRole('link', { name: /continue on dreamdex/i });
  await expect(dreamDexLink).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
  await expect(dreamDexLink).toHaveAttribute('target', '_blank');

  await page.evaluate(() => {
    Reflect.set(window, '__marketDungeonNativeShares', 0);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        Reflect.set(window, '__marketDungeonNativeShares', Reflect.get(window, '__marketDungeonNativeShares') + 1);
        throw new DOMException('Native sharing unavailable', 'NotAllowedError');
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => { Reflect.set(globalThis, '__marketDungeonClipboard', value); },
      },
    });
  });
  const [directDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '1 · SAVE IMAGE', exact: true }).click(),
  ]);
  expect(directDownload.suggestedFilename()).toBe('market-dungeon-run-12121212.png');
  expect(Array.from((await readFile((await directDownload.path())!)).subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(await page.evaluate(() => Reflect.get(window, '__marketDungeonNativeShares'))).toBe(0);
  await expect(page.locator('.run-share-status')).toContainText('Check your browser’s downloads');
  await page.getByText('More options', { exact: true }).click();
  const [cardDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'DOWNLOAD PNG TO FILES' }).click(),
  ]);
  expect(cardDownload.suggestedFilename()).toBe('market-dungeon-run-12121212.png');
  await expect(page.locator('.run-share-status')).toContainText('Check your browser’s downloads');
  await page.getByRole('button', { name: 'COPY POST TEXT' }).click();
  const copiedPost = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(copiedPost).toContain("I beat Market Dungeon's final-tier Judge Replay");
  expect(copiedPost).toContain('2 of 2 replay encounters cleared');
  expect(copiedPost).toContain('Onchain-verified on Somnia');
  expect(copiedPost).toContain('Can you defeat both the boss and the market?');
  expect(copiedPost).toContain('https://market-dungeon.vercel.app/judge?challenge=1');
  expect(() => JSON.parse(copiedPost as string)).toThrow();
  await page.getByRole('button', { name: 'COPY PROOF JSON' }).click();
  await expect(page.getByText('PORTABLE PROOF JSON COPIED')).toBeVisible();
  const copiedProof = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(JSON.parse(copiedProof as string)).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v2',
    summary: { result: 'BLESSED', lockedDirection: 'UP', winningOutcome: 'UP' },
  });
  expect(runtimeErrors).toEqual([]);
});

test('terminal proof shows both exact eth_call results without a sticky action dock overlap at 1280x720', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await playJudgeBoss(page);
  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();

  const proof = page.locator('.proof-revealed');
  await proof.locator('summary').click();
  const moduleResult = proof.getByRole('group', { name: 'MARKETS market ID eth_call raw result' });
  const settlementResult = proof.getByRole('group', { name: 'getSettlement market key eth_call raw result' });
  const exactResults = [
    [moduleResult, onchainSettlement.calls.moduleMarket.result],
    [settlementResult, onchainSettlement.calls.settlementRecord.result],
  ] as const;

  for (const [group, expectedResult] of exactResults) {
    await group.scrollIntoViewIfNeeded();
    await expect(group).toBeVisible();
    const code = group.locator('code');
    await expect(code).toHaveText(expectedResult);
    const rendering = await code.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        visibility: style.visibility,
        whiteSpace: style.whiteSpace,
      };
    });
    expect(rendering.clientHeight).toBeGreaterThan(0);
    expect(rendering.scrollHeight).toBeLessThanOrEqual(rendering.clientHeight + 1);
    expect(rendering.overflow).not.toBe('hidden');
    expect(rendering.textOverflow).not.toBe('ellipsis');
    expect(rendering.visibility).toBe('visible');
    expect(rendering.whiteSpace).toBe('pre-wrap');
  }

  const terminalDock = page.locator('.action-dock-terminal');
  await expect(terminalDock).toContainText('START NEW JUDGE DEMO');
  await expect(terminalDock).toHaveCSS('position', 'static');
  for (const [group] of exactResults) {
    await group.scrollIntoViewIfNeeded();
    const overlapsDock = await group.evaluate((proofRow, dock) => {
      const proofBox = proofRow.getBoundingClientRect();
      const dockBox = (dock as Element).getBoundingClientRect();
      return proofBox.left < dockBox.right
        && proofBox.right > dockBox.left
        && proofBox.top < dockBox.bottom
        && proofBox.bottom > dockBox.top;
    }, await terminalDock.elementHandle());
    expect(overlapsDock).toBe(false);
  }
});

test('temporary browser RPC unavailability preserves the completed sealed run for retry', async ({ page }) => {
  let startCalls = 0;
  await installDeterministicUpstreams(page, {
    rpcFailuresBeforeSuccess: 1,
    onStartCall: () => { startCalls += 1; },
  });
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await playJudgeBoss(page);

  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await reveal.click();

  await expect(page.getByText(/Somnia RPC could not reproduce the proof during this attempt/)).toBeVisible();
  await expect(page.locator('.desktop-stage-header')).toContainText('Gold 80');
  await expect(page.getByText(/JUDGE DEMO COMPLETE/)).toHaveCount(0);
  await expect(page.getByText(/REPLAY PROOF MISMATCH/)).toHaveCount(0);
  await expect(reveal).toBeEnabled();

  await reveal.click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  await expectJudgeBossReward(page);
  expect(startCalls).toBe(1);
});

for (const tamperRevealField of ['attestation', 'algorithm', 'ruleset', 'finalHp', 'void'] as const) {
  test(`Judge Demo rejects changed reveal ${tamperRevealField} locally before any Somnia RPC call`, async ({ page }) => {
    let rpcCalls = 0;
    await installDeterministicUpstreams(page, {
      rpcUnavailable: true,
      tamperRevealField,
      onRpcCall: () => { rpcCalls += 1; },
    });
    await page.goto('/judge');
    await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
    await playJudgeGuard(page);
    await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
    await playJudgeBoss(page);

    await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();

    await expect(page.getByText('REPLAY PROOF MISMATCH · LOCK A NEW OMEN')).toBeVisible();
    await expect(page.getByText(/Somnia RPC could not reproduce/)).toHaveCount(0);
    expect(rpcCalls).toBe(0);
  });
}
