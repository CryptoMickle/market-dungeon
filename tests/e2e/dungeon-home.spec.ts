import { expect, test, type Locator, type Page } from '@playwright/test';
import { createMarketDungeonRun, FULL_RUN_MARKET_PROOF_VERSION, transitionMarketDungeon, type MarketDungeonAction } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, parseFullRunSession, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import type { RivalRound } from '../../lib/somnia-agents/types';
import { BLOCK_HASH, BLOCK_TAG, SHANNON_LOCK_PUBLIC_KEY, SHANNON_SEAL, shannonOnchainSettlement, shannonRevealPayload, shannonStartPayload, VALID_ACTIONS } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

const NOW = 1_789_090_000;
const AGENT_RUN_KEY = 'market-dungeon/local-agents/full-run/v1';
const RIVAL_KEY = 'market-dungeon/local-kevin-rival/v1';
const LIVE_RUN_KEY = 'market-dungeon-live-judge-v1';
const marketId = `0x${'7a'.repeat(32)}`;
const market = {
  marketId, intervalSec: 300, question: 'CONTROLLED TEST FIXTURE: BTC closes at or above its opening price',
  strikeUsd: '78000.00', tradingStart: NOW - 10, expiry: NOW + 290, status: 'Trading', finalized: false,
};

const chooser = (page: Page) => page.getByRole('group', { name: 'Choose your dungeon', exact: true });
const enter = (page: Page) => page.getByRole('button', { name: /^(CHOOSE A MODE|ENTER DUNGEON|CONTINUE RUN|VIEW LAST RUN)$/ });
const combat = (page: Page) => page.getByRole('region', { name: 'Combat view', exact: true });
const attack = (page: Page) => combat(page).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ });

async function goHome(page: Page) {
  const name = 'Market Dungeon — back to home';
  await page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).filter({ visible: true }).click();
  await expect(chooser(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(chooser(page).locator('input:checked')).toHaveCount(0);
  await expect(enter(page)).toHaveAccessibleName('CHOOSE A MODE');
  await expect(enter(page)).toBeDisabled();
}

async function expectNoModeChooserDuringPlay(page: Page) {
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
}

async function expectHeaderControlsUncovered(page: Page) {
  const name = 'Market Dungeon — back to home';
  const logo = page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).filter({ visible: true });
  const sound = page.getByRole('button', { name: /^(Turn all game sounds (off|on)|Resume game sounds)$/ }).filter({ visible: true });
  const omen = page.getByRole('button', { name: /^Omen details:/ }).filter({ visible: true });
  for (const [control, locator] of [['logo', logo], ['Sound', sound], ['Omen Details', omen]] as const) {
    await expect(locator).toBeVisible();
    await locator.scrollIntoViewIfNeeded();
    const uncovered = await locator.evaluate((element, checkDetails) => {
      const bounds = element.getBoundingClientRect();
      const x = checkDetails ? bounds.right - 20 : bounds.x + bounds.width / 2;
      const target = document.elementFromPoint(x, bounds.y + bounds.height / 2);
      return Boolean(target && element.contains(target));
    }, control === 'Omen Details');
    expect(uncovered, `${control} must not be covered by another floating control`).toBe(true);
  }
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function readCombat(page: Page) {
  const label = async (prefix: string) => page.locator(`[aria-label^="${prefix}"]`).filter({ visible: true }).getAttribute('aria-label');
  return { hp: await label('Your health'), potions: await label('Potions '), enemyHp: await label('Enemy health') };
}

/** Start from valid engine transitions so restoring a fixture exercises the actual save validator. */
function roomSevenFixture() {
  let run = createMarketDungeonRun(() => 0);
  run.game.weaponLevel = 100;
  run.game.armorLevel = 100;
  const attemptId = 'home_resume_fixture_7';
  const apply = (action: MarketDungeonAction) => {
    const next = transitionMarketDungeon(run, action, () => 0);
    expect(next.accepted, next.reason).toBe(true);
    run = next.run;
  };
  apply({ type: 'lock-boss', lock: { attemptId, marketId, direction: 'DOWN', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null } });
  while (run.game.roomsCleared < 6) {
    apply({ type: 'gameplay', action: { type: 'attack' } });
    apply({ type: 'gameplay', action: { type: 'enter-next-room' } });
  }
  run.game.hp = 68;
  run.game.potions = 2;
  run.game.gold = 120;
  run.game.lastCritical = false;
  const session: FullRunSession = { schema: 'market-dungeon/full-run-session/v2', run, market: {
    marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd,
    tradingStart: market.tradingStart, expiry: market.expiry, lockedAt: NOW - 5,
  } };
  const serialized = serializeFullRunSession(session);
  expect(parseFullRunSession(serialized)).toEqual(session);
  const round: RivalRound = {
    attemptId, marketId, expiry: market.expiry, cutoff: market.expiry - 10,
    mode: 'simulation', status: 'locked', direction: 'UP', finalizedAt: NOW - 1,
    reason: 'Controlled fixture: a timely simulated rival, not a network proof.',
  };
  return { serialized, session, round };
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('agents-'), 'This homepage regression uses the separately running local Agents edition.');
  await page.clock.install({ time: NOW * 1000 });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

test('Home keeps all choices and Enter steady and makes no market, agent or wallet requests', async ({ page }, info) => {
  const requests: string[] = [];
  await page.route('**/api/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 503, json: { error: 'The homepage must not request gameplay data.' } });
  });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, {
      homeWalletCalls: calls,
      ethereum: { request: async ({ method }: { method: string }) => { calls.push(method); throw new Error('No wallet action is expected on Home.'); } },
    });
  });
  await page.goto('/');
  await expect(chooser(page).getByRole('radio')).toHaveCount(3);
  await expect(chooser(page).locator('input:checked')).toHaveCount(0);
  await expect(enter(page)).toHaveAccessibleName('CHOOSE A MODE');
  await expect(enter(page)).toBeDisabled();
  const detail = page.getByRole('region', { name: 'Selected dungeon', exact: true });
  await expect(detail).not.toContainText('Kevin');
  const baseline = { choices: await box(chooser(page)), enter: await box(enter(page)) };
  const descriptions = new Set<string>();
  for (const mode of ['Full Expedition', 'Judge Demo', 'Somnia Agents', 'Full Expedition']) {
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    await expect(detail).toBeVisible();
    descriptions.add(await detail.innerText());
    for (const [name, locator] of [['choices', chooser(page)], ['enter', enter(page)]] as const) {
      const actual = await box(locator);
      for (const axis of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(actual[axis] - baseline[name][axis]), `${mode}: ${name}.${axis}`).toBeLessThanOrEqual(1);
    }
    if (mode === 'Judge Demo') {
      await page.getByRole('radio', { name: 'Historical replay', exact: true }).check();
      await expect(enter(page)).toHaveAccessibleName('ENTER DUNGEON');
      const historicalEnter = await box(enter(page));
      expect(Math.abs(historicalEnter.y - baseline.enter.y)).toBeLessThanOrEqual(1);
      await page.getByRole('radio', { name: 'Live · 1 min', exact: true }).check();
    }
    await page.clock.runFor(3100);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(requests).toHaveLength(0);
  }
  expect(descriptions.size).toBe(3);
  expect(baseline.enter.height).toBeGreaterThanOrEqual(44);
  await expect(enter(page)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => (window as typeof window & { homeWalletCalls: string[] }).homeWalletCalls)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await goHome(page);
  await expect(detail).not.toContainText('Kevin');
  expect(await box(enter(page))).toEqual(baseline.enter);
  expect(requests).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('home-mode-chooser.png'), fullPage: true });
});

test('a fresh Full or Agents run starts only after Enter and goes directly to omen choice', async ({ page }) => {
  let marketCalls = 0;
  const rivalCalls: unknown[] = [];
  await page.route('**/api/market?*', route => {
    marketCalls++;
    return route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/somnia-agents/rival', route => {
    rivalCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: 400, json: { error: 'No rival should run before an omen is locked.' } });
  });
  await page.goto('/');
  for (const [mode, path, key] of [['Full Expedition', '/expedition', FULL_RUN_STORAGE_KEY], ['Somnia Agents', '/somnia-agents', AGENT_RUN_KEY]]) {
    const callsBeforeSelection = marketCalls;
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    await expect(enter(page)).toHaveAccessibleName('ENTER DUNGEON');
    await page.clock.runFor(1100);
    expect(marketCalls).toBe(callsBeforeSelection);
    await enter(page).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true })).toHaveCount(0);
    await expectNoModeChooserDuringPlay(page);
    await expect.poll(() => marketCalls).toBeGreaterThan(callsBeforeSelection);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.run.phase, key)).toBe('boss-lock-required');
    expect(rivalCalls).toHaveLength(0);
    await goHome(page);
  }
});

test('Home distinguishes finished runs from active saves and never offers to continue an expired live round', async ({ page }, info) => {
  test.skip(info.project.name.includes('iphone'), 'Save-label logic is covered once; responsive geometry and active restoration are tested on both browsers.');
  const fixture = roomSevenFixture();
  fixture.session.run.game.hp = 1;
  fixture.session.run.game.weaponLevel = 0;
  fixture.session.run.game.armorLevel = 0;
  const death = transitionMarketDungeon(fixture.session.run, { type: 'gameplay', action: { type: 'attack' } }, maximum => maximum - 1);
  expect(death.accepted, death.reason).toBe(true);
  expect(death.run.phase).toBe('dead');
  const terminal = serializeFullRunSession({ ...fixture.session, run: death.run });
  const expired = liveJudgeFixture({ now: NOW - 3_600 });
  const expiredSave = { live: expired.session, actions: [], bossEntered: false, rested: false };
  const requests: string[] = [];
  await page.route('**/api/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 503, json: { error: 'Saved summaries must be read locally.' } });
  });
  await page.addInitScript(({ terminal, fullKey, agentKey, liveKey, expiredSave }) => {
    if (!localStorage.getItem(fullKey)) localStorage.setItem(fullKey, terminal);
    if (!localStorage.getItem(agentKey)) localStorage.setItem(agentKey, terminal);
    if (!sessionStorage.getItem(liveKey)) sessionStorage.setItem(liveKey, JSON.stringify(expiredSave));
  }, { terminal, fullKey: FULL_RUN_STORAGE_KEY, agentKey: AGENT_RUN_KEY, liveKey: LIVE_RUN_KEY, expiredSave });
  await page.goto('/');
  for (const mode of ['Full Expedition', 'Somnia Agents']) {
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    await expect(enter(page)).toHaveAccessibleName('VIEW LAST RUN');
  }
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Live · 1 min', exact: true }).check();
  await expect(enter(page)).toHaveAccessibleName('ENTER DUNGEON');
  const complete = liveJudgeFixture({ now: NOW });
  await page.evaluate(({ key, saved }) => sessionStorage.setItem(key, JSON.stringify(saved)), {
    key: LIVE_RUN_KEY, saved: { live: complete.session, actions: complete.actions, bossEntered: true, rested: false, result: complete.proof },
  });
  await page.reload();
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Live · 1 min', exact: true }).check();
  await expect(enter(page)).toHaveAccessibleName('VIEW LAST RUN');
  expect(requests).toHaveLength(0);
});

for (const agents of [false, true]) {
  test(`${agents ? 'Agents' : 'ordinary Full Expedition'} returns through Home with the exact combat and loot save`, async ({ page }) => {
    const fixture = roomSevenFixture();
    const key = agents ? AGENT_RUN_KEY : FULL_RUN_STORAGE_KEY;
    const mode = agents ? 'Somnia Agents' : 'Full Expedition';
    const path = agents ? '/somnia-agents' : '/expedition';
    const calls: Array<Record<string, unknown>> = [];
    let marketCalls = 0;
    await page.addInitScript(({ key, serialized, agents, round, rivalKey }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, serialized);
      if (agents && !localStorage.getItem(rivalKey)) localStorage.setItem(rivalKey, JSON.stringify({ mode: 'simulation', rounds: [round] }));
    }, { key, serialized: fixture.serialized, agents, round: fixture.round, rivalKey: RIVAL_KEY });
    await page.route('**/api/market?*', route => {
      marketCalls++;
      return route.fulfill({ json: { market, odds: null } });
    });
    await page.route('**/api/somnia-agents/rival', route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(body);
      return route.fulfill(body.action === 'status' && body.attemptId === fixture.round.attemptId
        ? { json: { round: fixture.round } }
        : { status: 400, json: { error: 'Only the existing rival may be recovered.' } });
    });
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
    await page.goto(`/?mode=${agents ? 'agents' : 'expedition'}`);
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    await expect(enter(page)).toHaveAccessibleName('CONTINUE RUN');
    expect(calls).toHaveLength(0);
    expect(marketCalls).toBe(0);
    await enter(page).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(combat(page)).toBeVisible();
    await expectNoModeChooserDuringPlay(page);
    await expect.poll(saved).toEqual(fixture.session);
    await expectHeaderControlsUncovered(page);
    const before = await readCombat(page);
    if (agents) {
      await page.clock.runFor(3100);
      await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText('BTC UP');
    }
    await goHome(page);
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    const callsAtHome = { rival: calls.length, market: marketCalls };
    await page.clock.runFor(6100);
    expect({ rival: calls.length, market: marketCalls }).toEqual(callsAtHome);
    await expect(enter(page)).toHaveAccessibleName('CONTINUE RUN');
    await enter(page).click();
    await expect(combat(page)).toBeVisible();
    expect(await readCombat(page)).toEqual(before);
    expect(await saved()).toEqual(fixture.session);
    await attack(page).click();
    await expect(page.getByText('ROOM 7 CLEARED', { exact: true })).toBeVisible();
    await expectNoModeChooserDuringPlay(page);
    await expect.poll(async () => (await saved()).run.game.roomsCleared).toBe(7);
    const cleared = await saved();
    await goHome(page);
    await chooser(page).getByRole('radio', { name: mode, exact: true }).check();
    await expect(enter(page)).toHaveAccessibleName('CONTINUE RUN');
    await enter(page).click();
    await expect(page.getByText('ROOM 7 CLEARED', { exact: true })).toBeVisible();
    expect(await saved()).toEqual(cleared);
    await page.getByRole('button', { name: 'ENTER ROOM 8', exact: true }).click();
    await expect(combat(page)).toBeVisible();
    await expect(page.getByRole('list', { name: /^Room progress:/ }).filter({ visible: true }).locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 8');
    if (agents) expect(calls.every(call => call.action === 'status' && call.attemptId === fixture.round.attemptId)).toBe(true);
    else expect(calls).toHaveLength(0);
    expect(await page.evaluate(otherKey => localStorage.getItem(otherKey), agents ? FULL_RUN_STORAGE_KEY : AGENT_RUN_KEY)).toBeNull();
  });
}

test('Live Judge continues the exact signed market and combat through Home without starting another round', async ({ page }) => {
  const fixture = liveJudgeFixture({ now: NOW });
  const starts: unknown[] = [];
  await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
  await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
  await page.route('**/api/live-judge/odds?*', route => route.fulfill({ json: {
    marketId: fixture.market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId),
    intervalSec: 60, asset: 'BTC', expiry: fixture.market.expiry, state: 'open', odds: null,
  } }));
  await page.route('**/api/live-judge/start', route => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ json: { live: fixture.session } });
  });
  await page.route(LIVE_JUDGE.rpc, async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body.method, body.params) } });
  });
  await page.goto('/');
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Live · 1 min', exact: true }).check();
  await enter(page).click();
  await expect(page).toHaveURL(/\/shannon\/live-judge$/);
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true }).click();
  await attack(page).click();
  const before = await readCombat(page);
  await expectHeaderControlsUncovered(page);
  const saved = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), LIVE_RUN_KEY);
  const original = await saved();
  expect(original.actions).toHaveLength(1);
  await expectNoModeChooserDuringPlay(page);
  await goHome(page);
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Live · 1 min', exact: true }).check();
  await expect(enter(page)).toHaveAccessibleName('CONTINUE RUN');
  await enter(page).click();
  await expect(combat(page)).toBeVisible();
  expect(await readCombat(page)).toEqual(before);
  expect(await saved()).toEqual(original);
  expect(starts).toHaveLength(1);
  await attack(page).click();
  await expect.poll(async () => (await saved()).actions.length).toBe(2);
  expect((await saved()).live).toEqual(original.live);
});

test('Historical Replay retains its sealed choice, damage and complete action transcript through Home', async ({ page }) => {
  await page.clock.setSystemTime(1_000_000);
  const starts: unknown[] = [];
  const reveals: unknown[] = [];
  await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));
  await page.route('**/api/shannon/judge-replay/start', route => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ json: shannonStartPayload });
  });
  await page.route('**/api/shannon/judge-replay/reveal', route => {
    const body = route.request().postDataJSON();
    reveals.push(body);
    return route.fulfill({ json: shannonRevealPayload(body.actions) });
  });
  await page.route('https://api.infra.testnet.somnia.network', route => {
    const body = route.request().postDataJSON();
    const result = body.method === 'eth_chainId' ? '0xc488'
      : body.method === 'eth_getBlockByHash' ? { number: BLOCK_TAG, hash: BLOCK_HASH }
      : body.params[0].to.toLowerCase() === shannonOnchainSettlement.moduleAddress.toLowerCase()
        ? shannonOnchainSettlement.calls.moduleMarket.result : shannonOnchainSettlement.calls.settlementRecord.result;
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { jsonrpc: '2.0', id: body.id, result } });
  });
  await page.goto('/?mode=judge&demo=replay');
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Historical replay', exact: true }).check();
  await enter(page).click();
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true }).click();
  await attack(page).click();
  const before = await readCombat(page);
  await expectHeaderControlsUncovered(page);
  await expectNoModeChooserDuringPlay(page);
  await goHome(page);
  await chooser(page).getByRole('radio', { name: 'Judge Demo', exact: true }).check();
  await page.getByRole('radio', { name: 'Historical replay', exact: true }).check();
  await enter(page).click();
  await expect(combat(page)).toBeVisible();
  expect(await readCombat(page)).toEqual(before);
  expect(starts).toEqual([{ direction: 'UP' }]);
  // Completing the original fixture proves that Home preserved both its seed and the first action.
  for (const entry of VALID_ACTIONS.filter(entry => entry.room === 8).slice(1)) {
    await page.getByRole('button', { name: entry.action === 'potion' ? /HEAL \+25 HP/ : /ATTACK/ }).click();
  }
  await page.getByRole('button', { name: /ENTER FINAL BOSS/ }).click();
  for (const entry of VALID_ACTIONS.filter(entry => entry.room === 9)) {
    await page.getByRole('button', { name: entry.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
  }
  await page.getByRole('button', { name: /REVEAL BOSS FATE/ }).click();
  await expect.poll(() => reveals).toEqual([{ seal: SHANNON_SEAL, actions: VALID_ACTIONS }]);
  expect(starts).toHaveLength(1);
});
