import { expect, test, type Locator, type Page } from '@playwright/test';
import { emptyGame } from '../../app/gameplay/delveworn-engine';
import { FULL_RUN_MARKET_PROOF_VERSION, transitionMarketDungeon } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { replayJudgeCombat } from '../../app/judge-combat';
import { SHANNON_LOCK_PUBLIC_KEY, shannonStartPayload, VALID_ACTIONS } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

// Short CSS viewports model the space remaining with iPhone browser bars open.
// These are deterministic browser layout checks, not a physical Safari claim.
const phones = [{ width: 375, height: 640 }, { width: 390, height: 700 }];

function expeditionSession(game: Partial<FullRunSession['run']['game']> = {}): FullRunSession {
  const now = Math.floor(Date.now() / 1_000);
  const marketId = `0x${'12'.repeat(32)}`;
  return {
    schema: 'market-dungeon/full-run-session/v2',
    market: { marketId, intervalSec: 300, question: 'BTC closes above its opening price', strikeUsd: '60000.00', tradingStart: now - 10, expiry: now + 290, lockedAt: now - 9 },
    run: {
      schema: 'market-dungeon/full-run/v3', phase: 'exploring', attemptNumber: 1, rematchRequired: false,
      currentAttempt: { attemptId: 'iphone_layout_1', marketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
      game: { ...emptyGame(), hasStarted: true, active: true, hp: 70, potions: 2, monsterHp: 49, monsterMaxHp: 49, roomsCleared: 6, ...game },
      pendingBossReward: null, usedMarketIds: [], usedCommitments: [], resolvedAttemptIds: [], settlements: [],
    },
  };
}

function bossRecoverySession(rematch: boolean): FullRunSession {
  const session = expeditionSession({ roomsCleared: 9, monsterType: 3, monsterHp: 0, monsterMaxHp: 122, hp: 40, potions: 4, combatPotionsUsed: 3 });
  session.run.phase = 'settlement-pending';
  session.run.pendingBossReward = { room: 10, monsterType: 3, lootRoll: 99, amountRoll: 0, relicOfferRarity: 1, relicOfferId: 1 };
  if (rematch) {
    const transition = transitionMarketDungeon(session.run, {
      type: 'settle-boss', settlement: { ...session.run.currentAttempt!, marketId: session.market!.marketId, outcome: 'CURSED' },
    }, () => 0);
    expect(transition.accepted, transition.reason).toBe(true);
    session.run = transition.run;
    session.market = null;
  }
  return session;
}

async function restoreExpedition(page: Page, session: FullRunSession) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
  await page.goto('/');
}

async function expectTouchTarget(control: Locator) {
  // Deliberately do not call scrollIntoView: Playwright's automatic click scroll
  // would otherwise hide the original problem reported on the phone.
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const coveredPoints = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    return [[.2, .2], [.5, .5], [.8, .8]].flatMap(([x, y]) => {
      const hit = document.elementFromPoint(box.x + box.width * x, box.y + box.height * y);
      return hit !== null && element.contains(hit) ? [] : [{ x, y, blocker: hit?.outerHTML.slice(0, 250) ?? 'outside viewport' }];
    });
  });
  expect(coveredPoints, `${await control.innerText()} must not be covered by another panel`).toEqual([]);
}

async function showRecoveryControl(page: Page, control: Locator) {
  await page.evaluate(() => document.fonts.ready);
  // Model the reported scroll to the healing button. Assertions below must
  // pass without a further automatic scroll to the distant player header.
  await control.evaluate(button => button.scrollIntoView({ block: 'end', behavior: 'instant' }));
  await page.evaluate(() => window.scrollBy({ top: 16, behavior: 'instant' }));
}

async function expectRecoverySupplies(page: Page, control: Locator, hp: number, potions: number) {
  const supplies = page.getByRole('region', { name: 'Recovery supplies', exact: true });
  await expect(supplies).toContainText(`${hp}/100`);
  await expect(supplies).toContainText(`${potions}/5`);
  await expect(supplies).toBeInViewport({ ratio: 1 });
  await expectTouchTarget(control);
  const statusBox = (await supplies.boundingBox())!;
  const controlBox = (await control.boundingBox())!;
  expect(statusBox.y + statusBox.height, 'Current health must sit above the healing decision').toBeLessThanOrEqual(controlBox.y);
  expect(controlBox.y - statusBox.y - statusBox.height, 'Health and healing controls must stay together').toBeLessThan(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return supplies;
}

async function expectCombatControls(page: Page) {
  const combat = page.getByRole('region', { name: 'Combat view', exact: true });
  const controls = combat.getByRole('region', { name: 'Combat controls', exact: true });
  const actions = controls.getByRole('region', { name: 'Combat actions', exact: true });
  const health = controls.getByLabel('Combat health summary', { exact: true });
  await expect(health).toBeInViewport({ ratio: 1 });
  await expect(actions.getByRole('button')).toHaveCount(3);
  for (const button of await actions.getByRole('button').all()) await expectTouchTarget(button);
  const playerHp = await combat.getByRole('region', { name: 'Player status', exact: true }).getByLabel(/^Your health/).locator('b').innerText();
  const enemyHp = await combat.locator('[data-boss]').locator('b').innerText();
  await expect(health).toContainText(playerHp);
  await expect(health).toContainText(enemyHp);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return { combat, controls, actions, health };
}

async function expectUnobscuredMonster(page: Page) {
  const { combat, controls } = await expectCombatControls(page);
  const art = combat.getByRole('img');
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const painted = await art.evaluate((img: HTMLImageElement) => {
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    return { width: img.naturalWidth * scale, height: img.naturalHeight * scale };
  });
  expect(painted.width).toBeGreaterThanOrEqual(page.viewportSize()!.width * .9);
  expect(painted.height).toBeGreaterThanOrEqual(page.viewportSize()!.width * .5);
  await art.evaluate(image => image.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(art).toBeInViewport({ ratio: 1 });
  const imageBox = (await art.boundingBox())!;
  expect(imageBox.y + imageBox.height, 'The complete monster can be viewed above the action dock').toBeLessThanOrEqual((await controls.boundingBox())!.y);
  await expectCombatControls(page);
}

async function openHistorical(page: Page) {
  await page.route('**/api/shannon/judge-replay/start', route => route.fulfill({ json: shannonStartPayload }));
  await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));
  await page.goto('/shannon/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true }).click();
}

async function openLive(page: Page) {
  const fixture = liveJudgeFixture();
  await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
  await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
  await page.route('**/api/live-judge/start', route => route.fulfill({ json: { live: fixture.session } }));
  await page.route('**/api/live-judge/reveal', route => route.fulfill({ status: 425, headers: { 'retry-after': '30' }, json: { error: 'Controlled fixture: settlement pending' } }));
  await page.route('**/api/live-judge/odds?*', route => route.fulfill({ json: {
    marketId: fixture.market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId), intervalSec: 60, asset: 'BTC', expiry: fixture.market.expiry, state: 'open', odds: null,
  } }));
  await page.route(LIVE_JUDGE.rpc, async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
  });
  await page.goto('/shannon/live-judge');
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true }).click();
  return fixture;
}

for (const phone of phones) test.describe(`${phone.width}×${phone.height} iPhone browser space`, () => {
  test.use({ viewport: phone, hasTouch: true });
  test.beforeEach(async ({ page, browserName, baseURL }) => {
    // WebKit upgrades even loopback asset URLs under the production CSP. The
    // local next-start server only speaks HTTP; keep every other CSP directive
    // intact while testing its optimized UI. This never applies to a hosted
    // deployment, another origin, or the app's actual security headers.
    if (browserName === 'webkit' && baseURL === 'http://127.0.0.1:3101') {
      await page.route(`${baseURL}/**`, async route => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        const headers = response.headers();
        const directives = headers['content-security-policy'].split(';').map(value => value.trim());
        expect(directives).toContain('upgrade-insecure-requests');
        headers['content-security-policy'] = directives.filter(value => value !== 'upgrade-insecure-requests').join('; ');
        await route.fulfill({ response, headers });
      });
    }
    await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  });

  for (const mode of ['Full Expedition', 'Historical Replay', 'Live Judge'] as const) {
    test(`${mode} keeps combat actions and current health ready on entry, hits and scrolling`, async ({ page }, info) => {
      let actions = VALID_ACTIONS;
      if (mode === 'Full Expedition') await restoreExpedition(page, expeditionSession());
      else if (mode === 'Historical Replay') await openHistorical(page);
      else actions = (await openLive(page)).actions;

      const initial = await expectCombatControls(page);
      const healthBefore = await initial.health.innerText();
      const entryScroll = await page.evaluate(() => window.scrollY);
      await initial.actions.getByRole('button', { name: /ATTACK/ }).click();
      await expect(initial.health).not.toHaveText(healthBefore);
      await expectCombatControls(page);
      expect(await page.evaluate(() => window.scrollY), 'A hit must not jump the combat page').toBeCloseTo(entryScroll, 0);
      await expectUnobscuredMonster(page);
      await page.screenshot({ path: info.outputPath('combat-and-controls.png') });

      // A scroll back to navigation must keep the same buttons available.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expectCombatControls(page);
      if (mode !== 'Full Expedition') {
        for (const action of actions.filter(action => action.room === 8).slice(1)) {
          // The fixture also includes a safe potion after the guard falls.
          await page.getByRole('button', { name: action.action === 'potion' ? /POTION|HEAL \+25 HP/ : /ATTACK/ }).click();
        }
        const next = page.getByRole('button', { name: /ENTER FINAL BOSS/, exact: false });
        await next.evaluate(button => button.scrollIntoView({ block: 'end', behavior: 'instant' }));
        await page.evaluate(() => window.scrollBy({ top: 16, behavior: 'instant' }));
        const supplies = page.getByRole('region', { name: 'Recovery supplies', exact: true });
        await expect(supplies).toBeInViewport({ ratio: 1 });
        await expectTouchTarget(next);
        await expectTouchTarget(page.getByRole('button', { name: /HEAL \+25 HP/ }));
        await expect(supplies).toContainText(await page.getByRole('region', { name: 'Player status', exact: true }).getByLabel(/^Your health/).locator('b').innerText());
        await page.screenshot({ path: info.outputPath('judge-recovery-and-controls.png') });
        await next.click();
        const boss = await expectCombatControls(page);
        await expect(boss.combat.locator('[data-boss="true"]')).toBeVisible();
        await boss.actions.getByRole('button', { name: /ATTACK/ }).click();
        await expectCombatControls(page);
        await expectUnobscuredMonster(page);

        for (const action of actions.filter(action => action.room === 9).slice(1)) {
          await page.getByRole('button', { name: action.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
        }
        const finalCombat = replayJudgeCombat('g'.repeat(43), actions);
        expect(finalCombat.verified).toBe(true);
        if (mode === 'Historical Replay') {
          const merchant = page.getByRole('button', { name: /VISIT TRAVELLING MERCHANT/ });
          await showRecoveryControl(page, merchant);
          await expectRecoverySupplies(page, merchant, finalCombat.finalHp, finalCombat.remainingPotions);
          await page.screenshot({ path: info.outputPath('historical-boss-waiting-supplies.png') });
          await merchant.click();
          const rest = page.getByRole('button', { name: /TAKE A FREE REST/ });
          await showRecoveryControl(page, rest);
          await expectRecoverySupplies(page, rest, finalCombat.finalHp, finalCombat.remainingPotions);
          await rest.click();
          const rested = page.getByRole('button', { name: /FULLY RESTED/ });
          await expectRecoverySupplies(page, rested, 100, finalCombat.remainingPotions);
          await expect(rested).toBeDisabled();
          await page.getByRole('button', { name: /RETURN TO BOSS FATE/ }).click();
          await showRecoveryControl(page, merchant);
          await expectRecoverySupplies(page, merchant, 100, finalCombat.remainingPotions);
        } else {
          const rest = page.getByRole('button', { name: /REST WITH KEVIN/ });
          await showRecoveryControl(page, rest);
          await expectRecoverySupplies(page, rest, finalCombat.finalHp, finalCombat.remainingPotions);
          await rest.click();
          const rested = page.getByRole('button', { name: /KEVIN’S BANDAGE APPLIED/ });
          await expectRecoverySupplies(page, rested, 100, finalCombat.remainingPotions);
          await expect(rested).toBeDisabled();
          await page.screenshot({ path: info.outputPath('live-boss-waiting-supplies.png') });
        }
      }
    });
  }

  test('Kevin shows current supplies beside every purchase and safe heal, then enters the boss with ready controls', async ({ page }, info) => {
    await restoreExpedition(page, expeditionSession({ roomsCleared: 9, monsterHp: 0, hp: 40, potions: 2, gold: 300, weaponLevel: 0, armorLevel: 0, lastLootType: 1, lastLootAmount: 1 }));
    const supplies = page.getByLabel('Supplies at Kevin', { exact: true });
    const rest = page.getByRole('button', { name: /REST \+30/ });
    const potion = page.getByRole('button', { name: /^POTION \d+G$/ });
    const weapon = page.getByRole('button', { name: /WEAPON \+1/ });
    const armor = page.getByRole('button', { name: /ARMOR \+1/ });
    const ownPotion = page.getByRole('button', { name: /USE OWN POTION SAFELY/ });
    const next = page.getByRole('button', { name: 'ENTER ROOM 10', exact: true });

    const expectSupplies = async (values: string[]) => {
      await expect(supplies.locator('dd')).toHaveText(values);
      await expect(supplies).toBeInViewport({ ratio: 1 });
      for (const button of [rest, potion, weapon, armor, ownPotion, next]) await expectTouchTarget(button);
    };
    // Measure the final text layout before simulating the player's scroll.
    await page.evaluate(() => document.fonts.ready);
    await next.evaluate(button => button.scrollIntoView({ block: 'end', behavior: 'instant' }));
    await page.evaluate(() => window.scrollBy({ top: 16, behavior: 'instant' }));
    await expectSupplies(['40/100', '2/5', '300', '0', '0']);
    await rest.click();
    await expectSupplies(['70/100', '2/5', '275', '0', '0']);
    await potion.click();
    await expectSupplies(['70/100', '3/5', '255', '0', '0']);
    await weapon.click();
    await expectSupplies(['70/100', '3/5', '195', '1', '0']);
    await armor.click();
    await expectSupplies(['70/100', '3/5', '135', '1', '1']);
    await ownPotion.click();
    await expectSupplies(['95/100', '2/5', '135', '1', '1']);
    await page.screenshot({ path: info.outputPath('kevin-supplies-and-controls.png') });
    await next.click();
    const boss = await expectCombatControls(page);
    await expect(boss.combat.locator('[data-boss="true"]')).toBeVisible();
    await expectUnobscuredMonster(page);
  });

  for (const rematch of [false, true]) test(`Full Expedition ${rematch ? 'rematch' : 'boss waiting'} keeps current HP beside safe potion and updates the amount healed`, async ({ page }, info) => {
    const session = bossRecoverySession(rematch);
    await page.route('**/api/market?interval=300', route => route.fulfill({ status: 503, json: { error: 'Controlled fixture: no fresh market' } }));
    await restoreExpedition(page, session);
    const potion = page.getByRole('button', { name: /USE POTION/ });
    await showRecoveryControl(page, potion);
    await expectRecoverySupplies(page, potion, 40, 4);
    await expect(potion).toContainText('+25 HP');
    if (!rematch) await page.screenshot({ path: info.outputPath('boss-waiting-before-potion-40hp.png') });
    await potion.click();
    await expectRecoverySupplies(page, potion, 65, 3);
    if (!rematch) await page.screenshot({ path: info.outputPath('boss-waiting-after-potion-65hp.png') });
    await potion.click();
    await expectRecoverySupplies(page, potion, 90, 2);
    await expect(potion).toContainText('+10 HP');
    await page.screenshot({ path: info.outputPath(`${rematch ? 'rematch' : 'boss-waiting'}-health-and-potion.png`) });
    await potion.click();
    await expectRecoverySupplies(page, potion, 100, 1);
    await expect(potion).toBeDisabled();
    await expect(potion).toContainText('FULL HP');
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FULL_RUN_STORAGE_KEY) as FullRunSession;
    expect(saved.run.game.hp).toBe(100);
    expect(saved.run.game.potions).toBe(1);
    expect(saved.run.game.monsterHp).toBe(session.run.game.monsterHp);
    expect(saved.run.game.combatPotionsUsed).toBe(session.run.game.combatPotionsUsed);
    expect(saved.run.phase).toBe(session.run.phase);
    expect(saved.run.currentAttempt).toEqual(session.run.currentAttempt);
    expect(saved.run.pendingBossReward).toEqual(session.run.pendingBossReward);
    if (!rematch) await expect(page.getByRole('button', { name: /^REVEAL IN/ })).toBeDisabled();
    await page.reload();
    await showRecoveryControl(page, potion);
    await expectRecoverySupplies(page, potion, 100, 1);
    await expect(potion).toBeDisabled();
  });
});
