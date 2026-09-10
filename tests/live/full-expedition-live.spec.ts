import { appendFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { FULL_RUN_STORAGE_KEY, type FullRunSession } from '../../app/gameplay/full-run-storage';

// Explicit opt-in: this acceptance check waits for real five-minute markets.
// No seeded saves, RNG overrides, synthetic clocks or mocked market/RPC responses.
test('Full Expedition actual five-minute lock, settlement and wrong-omen rematch', async ({ browser, baseURL }, info) => {
  test.skip(process.env.LIVE_FULL_EXPEDITION !== '1', 'Opt in to the multi-minute live acceptance run');
  test.setTimeout(20 * 60_000);
  expect(process.env.LIVE_SMOKE_BASE_URL, 'Require an explicit candidate; never default to Production').toBeTruthy();
  const record = async (kind: string, data: unknown) => {
    const entry = { at: new Date().toISOString(), kind, data };
    console.log(JSON.stringify(entry));
    await appendFile(info.outputPath('actual-live.jsonl'), `${JSON.stringify(entry)}\n`);
  };
  const saved = async (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as FullRunSession, FULL_RUN_STORAGE_KEY);
  const contexts = await Promise.all(['UP', 'DOWN'].map(() => browser.newContext({ baseURL })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const pendingResponses: Promise<void>[] = [];
  for (const [index, page] of pages.entries()) {
    // Suppress automation analytics only; gameplay and proof traffic are untouched.
    await page.route('**/_vercel/insights/**', route => route.abort());
    page.on('response', response => {
      if (!response.url().includes('/api/market')) return;
      pendingResponses.push((async () => {
        await record('market-response', { index, url: response.url(), status: response.status(), body: await response.json().catch(() => null) });
      })());
    });
  }
  await record('candidate', { baseURL, independentRuns: 2, direction: ['UP', 'DOWN'] });
  try {
    await Promise.all(pages.map(async (page, index) => {
      await page.goto('/?automation=1');
      await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
      const before = await saved(page);
      expect(before.run.phase).toBe('boss-lock-required');
      expect(before.run.currentAttempt).toBeNull();
      expect(before.market).toBeNull();
      await record('before-entry', { index, session: before });
      if (index === 1) await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
      await page.getByRole('button', { name: `LOCK BTC ${index === 0 ? 'UP' : 'DOWN'} · ENTER TIER 1`, exact: true }).click({ timeout: 45_000 });
      await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
      const locked = await saved(page);
      expect(locked.market?.intervalSec).toBe(300);
      expect(locked.market!.expiry - locked.market!.tradingStart).toBe(300);
      expect(locked.market!.lockedAt).toBeGreaterThanOrEqual(locked.market!.tradingStart);
      expect(locked.market!.lockedAt).toBeLessThan(locked.market!.expiry);
      expect(locked.run.currentAttempt?.mode).toBe('live');
      expect(locked.run.currentAttempt?.direction).toBe(index === 0 ? 'UP' : 'DOWN');
      await record('locked-before-combat', { index, session: locked });
    }));
    expect((await saved(pages[0])).market!.marketId, 'Opposite omens must lock the same real active market').toBe((await saved(pages[1])).market!.marketId);

    const play = async (page: Page, index: number) => {
      let lastRoom = -1;
      for (let action = 0; action < 400; action++) {
        const state = await saved(page);
        const game = state.run.game;
        if (game.roomsCleared !== lastRoom) {
          lastRoom = game.roomsCleared;
          await record('room-progress', { index, action, phase: state.run.phase, game });
        }
        if (state.run.phase === 'dead' || state.run.phase === 'settlement-pending') {
          await record('combat-end', { index, session: state });
          return state;
        }
        if (game.monsterHp > 0) {
          const combat = page.getByRole('region', { name: 'Combat view' });
          const potion = combat.getByRole('button', { name: /POTION/ });
          // Heal before danger; ordinary attacks avoid Storm's guaranteed retaliation.
          if (game.hp <= 45 && await potion.isEnabled()) await potion.click();
          else await combat.getByRole('button', { name: /ATTACK/ }).click();
        } else {
          const rest = page.getByRole('button', { name: /^(REST \+30|BANDAGE \+25)/ });
          const ownPotion = page.getByRole('button', { name: /^USE OWN POTION SAFELY/ });
          const stock = page.getByRole('button', { name: /^POTION \d+G$/ });
          const armor = page.getByRole('button', { name: /^ARMOR \+1/ });
          if (game.hp <= game.maxHp - 25 && await rest.count() && await rest.isEnabled()) await rest.click();
          else if (game.hp <= game.maxHp - 25 && await ownPotion.isEnabled()) await ownPotion.click();
          else if (game.potions < 3 && await stock.count() && await stock.isEnabled()) await stock.click();
          else if (await armor.count() && await armor.isEnabled()) await armor.click();
          else await page.getByRole('button', { name: /^ENTER ROOM / }).click();
        }
        await expect.poll(async () => JSON.stringify(await saved(page))).not.toBe(JSON.stringify(state));
      }
      throw new Error(`Run ${index} exceeded the documented 400-action limit`);
    };
    const combatResults = await Promise.all(pages.map(play));
    // A real combat death is evidence, never silently replaced with a seeded win.
    expect(combatResults.map(state => state.run.phase), 'Both naturally played runs must reach settlement for paired outcome coverage').toEqual(['settlement-pending', 'settlement-pending']);
    await Promise.all(pages.map(async (page, index) => {
      const frozen = await saved(page);
      if (frozen.market!.expiry * 1000 > Date.now() + 1500) {
        await expect(page.getByRole('button', { name: /^REVEAL IN / })).toBeDisabled();
        await record('reveal-locked-until-expiry', { index, expiry: frozen.market!.expiry });
      }
      while (Date.now() < frozen.market!.expiry * 1000 + 1000) {
        await record('waiting-for-real-expiry', { index, seconds: Math.ceil((frozen.market!.expiry * 1000 - Date.now()) / 1000) });
        await page.waitForTimeout(Math.min(20_000, Math.max(1000, frozen.market!.expiry * 1000 + 1000 - Date.now())));
        expect(await saved(page)).toEqual(frozen);
      }
      for (let check = 1; check <= 24; check++) {
        await page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true }).click();
        await expect(page.getByRole('button', { name: 'VERIFYING ON SOMNIA…', exact: true })).toHaveCount(0, { timeout: 60_000 });
        const result = await saved(page);
        await record('actual-reveal', { index, check, session: result, statusText: await page.getByRole('status').allTextContents() });
        if (result.run.phase !== 'settlement-pending') {
          expect(result.run.settlements).toHaveLength(1);
          const outcome = result.run.settlements[0].outcome;
          expect(['BLESSED', 'CURSED', 'VOID']).toContain(outcome);
          if (outcome === 'CURSED') {
            const old = frozen.run.game;
            const restored = result.run.game;
            expect(restored).toEqual({ ...old, monsterHp: old.monsterMaxHp, combatPotionsUsed: 0, lastPlayerDamage: 0, lastMonsterDamage: 0, lastCritical: false });
            expect(result.run.phase).toBe('boss-lock-required');
            expect(result.run.rematchRequired).toBe(true);
            expect(result.market).toBeNull();
            await expect(page.getByRole('heading', { name: 'The boss is back. Lock a fresh omen.' })).toBeVisible();
            await expect(page.getByText('CAMP BEFORE THE BOSS')).toHaveCount(0);
            await page.reload();
            expect(await saved(page)).toEqual(result);
            await page.getByRole('button', { name: /LOCK BTC .* · REMATCH BOSS/ }).click({ timeout: 45_000 });
            await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible();
            const rematch = await saved(page);
            expect(rematch.market!.marketId).not.toBe(frozen.market!.marketId);
            expect(rematch.market!.lockedAt).toBeLessThan(rematch.market!.expiry);
            expect(rematch.run.game).toEqual(restored);
            await record('actual-fresh-market-same-boss-rematch', { index, session: rematch });
          } else {
            expect(result.run.phase).toBe('boss-reward');
            expect(result.run.game.roomsCleared).toBe(10);
            expect(result.run.game.relicOfferAvailable).toBe(true);
            await page.reload();
            expect(await saved(page)).toEqual(result);
          }
          await page.screenshot({ path: info.outputPath(`actual-result-${index}.png`), fullPage: true });
          return;
        }
        expect(result, 'Unfinalized or unavailable checks must preserve the complete saved session').toEqual(frozen);
        await page.waitForTimeout(20_000);
      }
      throw new Error(`Run ${index}: no verifiable settlement after 24 explicitly recorded checks`);
    }));
    const outcomes = await Promise.all(pages.map(async page => (await saved(page)).run.settlements[0].outcome));
    expect(outcomes.sort()).toEqual(['BLESSED', 'CURSED']);
    await record('acceptance-pass', { outcomes, nonemptyRelicRetention: 'covered separately by controlled engine tests; these were fresh first-tier runs' });
  } finally {
    await Promise.all(pendingResponses);
    for (const [index, page] of pages.entries()) {
      if (!page.isClosed()) await writeFile(info.outputPath(`actual-final-session-${index}.json`), JSON.stringify(await saved(page), null, 2));
    }
    await Promise.all(contexts.map(context => context.close()));
  }
});
