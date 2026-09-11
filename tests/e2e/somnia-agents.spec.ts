import { expect, test, type Page } from '@playwright/test';
import { encodeFunctionData, toHex, zeroAddress } from 'viem';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { createMarketDungeonRun, FULL_RUN_MARKET_PROOF_VERSION, transitionMarketDungeon, type MarketDungeonAction, type MarketDungeonRun } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, parseFullRunSession, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
import { buildKevinPayload, SOMNIA_AGENTS_ABI, SOMNIA_AGENTS_TESTNET, type MarketSnapshot } from '../../lib/somnia-agents/protocol';
import type { RivalRound, RivalTransaction } from '../../lib/somnia-agents/types';

const LOCAL_RUN_KEY = 'market-dungeon/local-agents/full-run/v1';
const RIVAL_KEY = 'market-dungeon/local-kevin-rival/v1';
const now = 1_789_090_000;
const marketId = `0x${'7a'.repeat(32)}`;
const market = {
  marketId, intervalSec: 300, question: 'CONTROLLED TEST FIXTURE: BTC closes at or above its opening price',
  strikeUsd: '78000.00', tradingStart: now - 10, expiry: now + 290, status: 'Trading', finalized: false,
};
const snapshot: MarketSnapshot = {
  marketId, marketChainId: 5031, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd,
  tradingStart: market.tradingStart, expiry: market.expiry, snapshotAt: now, cutoff: market.expiry - 10,
};
const payload = buildKevinPayload(snapshot);
const transaction: RivalTransaction = {
  chainId: 50312, to: SOMNIA_AGENTS_TESTNET.platform,
  data: encodeFunctionData({ abi: SOMNIA_AGENTS_ABI, functionName: 'createRequest', args: [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x00000000', payload] }),
  value: toHex(300_000_000_000_000_000n), depositStt: '0.3', agentId: SOMNIA_AGENTS_TESTNET.llmAgentId, payload,
};

async function savedRun(page: Page): Promise<FullRunSession | null> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), LOCAL_RUN_KEY);
}

function rivalStatus(page: Page) { return page.getByRole('button', { name: /^Somnia Agent Kevin:/ }); }

async function expectRivalOnlyInStatus(page: Page, direction = 'UP') {
  await expect(rivalStatus(page)).toHaveCount(1);
  await expect(rivalStatus(page)).toBeVisible();
  await expect(rivalStatus(page)).toContainText(`BTC ${direction}`);
  await expect(page.getByTestId('kevin-rival-panel').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('YOUR RIVAL SCORECARD', { exact: true })).not.toBeVisible();
}

async function installFixtures(page: Page, scenario: 'pending' | 'failed' | 'wallet' = 'pending') {
  const requests: Array<Record<string, unknown>> = [];
  let round: RivalRound | null = null;
  let answerAvailable = false;
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: {
    market,
    odds: deriveDreamDexClobOdds({ marketId, quoteDecimals: 3, bestBid: '490', bestAsk: '510', observedAtIso: new Date(now * 1000).toISOString() }),
  } }));
  await page.route('**/api/somnia-agents/rival', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body.action === 'prepare') {
      if (scenario === 'failed') return route.fulfill({ status: 503, json: { error: 'Controlled test fixture: Kevin’s agent service is unavailable.' } });
      round = {
        attemptId: String(body.attemptId), marketId, expiry: market.expiry, cutoff: market.expiry - 10,
        mode: body.mode === 'somnia' ? 'somnia' : 'simulation', status: 'pending',
      };
      return route.fulfill({ json: { round, ...(scenario === 'wallet' ? { transaction } : {}) } });
    }
    if (!round || body.attemptId !== round.attemptId) return route.fulfill({ status: 404, json: { error: 'Controlled test fixture: unknown attempt.' } });
    return route.fulfill({ json: { round: answerAvailable
      ? { ...round, status: 'locked', direction: 'UP', finalizedAt: now + 5, reason: 'Controlled test fixture: timely simulated answer.' }
      : round } });
  });
  return { requests, answer: () => { answerAvailable = true; } };
}

async function enterAndLock(page: Page, mode: 'simulation' | 'somnia' = 'simulation') {
  await page.goto('/somnia-agents');
  if (mode === 'somnia') {
    const panel = await openRivalDetails(page);
    await panel.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
    await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  }
  await expect(rivalStatus(page)).toHaveAttribute('aria-label', 'Somnia Agent Kevin: Not locked yet');
  await expect(rivalStatus(page)).toHaveAccessibleDescription(mode === 'somnia' ? 'SOMNIA TESTNET' : 'SIMULATED');
  await expect(page.getByTestId('kevin-rival-panel').filter({ visible: true })).toHaveCount(0);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
}

async function openRivalDetails(page: Page) {
  await page.getByRole('button', { name: /^Somnia Agent Kevin:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true });
  await expect(dialog).toBeVisible();
  return dialog.getByTestId('kevin-rival-panel');
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('agents-'), 'Run the local Agents edition with playwright.agents.config.ts; normal builds deliberately hide it.');
  await page.clock.install({ time: new Date(now * 1000) });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

test('playground keeps its simulated choice locked until reset and explains all outcomes', async ({ page }) => {
  await page.goto('/somnia-agents/playground');
  await expect(page.getByText('SIMULATION ONLY · NO REAL MARKET · NO SOMNIA AGENT', { exact: true })).toBeVisible();
  const choice = page.getByRole('group', { name: 'Choose your simulated Bitcoin direction' });
  await choice.getByRole('button', { name: 'BTC DOWN SHADOWS RISE', exact: true }).click();
  await page.getByRole('button', { name: 'LOCK SIMULATED BTC DOWN', exact: true }).click();
  await expect(choice.getByRole('button', { name: /BTC UP/ })).toBeDisabled();
  await expect(choice.getByRole('button', { name: /BTC DOWN/ })).toBeDisabled();
  const panel = page.getByTestId('kevin-rival-panel');
  await expect(panel).toContainText('Kevin is making his call');
  await page.clock.runFor(1_300);
  await expect(panel).toContainText(/Kevin chose BTC (UP|DOWN)/);
  const kevinDirection = (await panel.innerText()).includes('Kevin chose BTC UP') ? 'UP' : 'DOWN';
  const outcomes = page.getByRole('group', { name: 'Choose a simulated market outcome' });
  await outcomes.getByRole('button', { name: 'BTC DOWN', exact: true }).click();
  await expect(panel).toContainText(kevinDirection === 'UP' ? 'You beat Kevin.' : 'A tie. Same call, same fate.');
  await expect(panel).toContainText('SIMULATED RIVAL RESULT');
  await outcomes.getByRole('button', { name: 'BTC UP', exact: true }).click();
  await expect(panel).toContainText(kevinDirection === 'UP' ? 'Kevin wins this round.' : 'A tie. Same call, same fate.');
  await outcomes.getByRole('button', { name: 'VOID', exact: true }).click();
  await expect(panel).toContainText('No contest. This market was void.');
  await page.getByRole('button', { name: 'NEW SIMULATED ROUND', exact: true }).click();
  await expect(choice.getByRole('button', { name: /BTC UP/ })).toBeEnabled();
  await expect(panel).not.toContainText('MARKET VOID');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

for (const scenario of ['late', 'unavailable'] as const) test(`playground ${scenario} response sits out without inventing a winner`, async ({ page }) => {
  await page.goto('/somnia-agents/playground');
  await page.getByLabel('Kevin’s response scenario').selectOption(scenario);
  await page.getByRole('button', { name: 'LOCK SIMULATED BTC UP', exact: true }).click();
  await page.clock.runFor(1_300);
  const panel = page.getByTestId('kevin-rival-panel');
  await expect(panel).toContainText('Kevin sits this round out');
  await page.getByRole('group', { name: 'Choose a simulated market outcome' }).getByRole('button', { name: 'BTC UP', exact: true }).click();
  await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  await expect(panel).not.toContainText('You beat Kevin.');
  await panel.getByText('Request details', { exact: true }).click();
  await expect(panel).toContainText(scenario === 'late' ? 'answer arrived after the cutoff' : 'did not return an answer');
});

test('Full Expedition omits player direction, shows a timely answer, and rechecks the same request after reload', async ({ page }) => {
  const fixture = await installFixtures(page);
  await enterAndLock(page);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'prepare').length).toBe(1);
  const prepared = fixture.requests.find(request => request.action === 'prepare')!;
  expect(Object.keys(prepared).sort()).toEqual(['action', 'attemptId', 'marketId', 'mode']);
  expect(prepared).toMatchObject({ action: 'prepare', marketId, mode: 'simulation' });
  const saved = (await savedRun(page))!;
  expect(saved.run.currentAttempt?.direction).toBe('DOWN');
  expect(prepared.attemptId).toBe(saved.run.currentAttempt?.attemptId);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/choosing|making|waiting/i);
  fixture.answer();
  await page.clock.runFor(3_100);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText('BTC UP');
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/simulated|simulator/i);
  const panel = await openRivalDetails(page);
  await expect(panel).toContainText('YOUR LOCKED OMEN');
  await expect(panel).toContainText('BTC DOWN');
  await expect(panel).toContainText('Kevin chose BTC UP');
  await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').rounds?.[0]?.status, RIVAL_KEY)).toBe('locked');
  const statusReadsBeforeReload = fixture.requests.filter(request => request.action === 'status').length;
  await page.reload();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  await page.clock.runFor(3_100);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'status').length).toBeGreaterThan(statusReadsBeforeReload);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText('BTC UP');
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/simulated|simulator/i);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  expect(fixture.requests.every(request => request.attemptId === prepared.attemptId)).toBe(true);
  expect((await savedRun(page))!.run.currentAttempt).toEqual(saved.run.currentAttempt);
  expect(await page.evaluate(() => localStorage.getItem('market-dungeon/full-run-session/v2'))).toBeNull();
});

test('an unavailable agent leaves normal attacks playable', async ({ page }) => {
  await installFixtures(page, 'failed');
  await enterAndLock(page);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/sits|sitting/i);
  const controls = page.getByRole('region', { name: 'Combat actions', exact: true });
  const before = (await savedRun(page))!.run.game;
  await expect(controls.getByRole('button', { name: /ATTACK/ })).toBeEnabled();
  await controls.getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(async () => (await savedRun(page))!.run.game.lastPlayerDamage).toBeGreaterThan(0);
  expect((await savedRun(page))!.run.game.monsterHp).toBeLessThan(before.monsterHp);
});

test('a successful HTTP response that stays pending stops recovery after the bounded window and combat remains playable', async ({ page }) => {
  const fixture = await installFixtures(page);
  await enterAndLock(page);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/choosing|making|waiting/i);
  // The fixture keeps returning HTTP 200 / pending even beyond expiry + 120s.
  // Skip most timer repetitions, then allow the next normal status read to run.
  await page.clock.fastForward((market.expiry - now + 121) * 1000);
  await page.clock.runFor(3_100);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText(/sits|sitting/i);
  const panel = await openRivalDetails(page);
  await panel.getByText('Request details', { exact: true }).click();
  await expect(panel).toContainText('could not be verified within the recovery window');
  await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  const readCount = fixture.requests.length;
  await page.clock.runFor(12_100);
  expect(fixture.requests).toHaveLength(readCount);
  await page.getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(async () => (await savedRun(page))!.run.game.lastPlayerDamage).toBeGreaterThan(0);
});

function settledRivalFixture() {
  let run = createMarketDungeonRun(() => 0);
  run.game.weaponLevel = 1000;
  run.game.armorLevel = 1000;
  const rounds: RivalRound[] = [];
  function apply(action: MarketDungeonAction) {
    const transition = transitionMarketDungeon(run, action, () => 0);
    expect(transition.accepted, transition.reason).toBe(true);
    run = transition.run;
  }
  for (const tier of [1, 2]) {
    const fixtureMarketId = `0x${String(tier).padStart(64, '0')}`;
    const attemptId = `settled_rival_fixture_${tier}`;
    apply({ type: 'lock-boss', lock: { attemptId, marketId: fixtureMarketId, direction: 'UP', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null } });
    for (let step = 0; step < 25 && (run as MarketDungeonRun).phase !== 'settlement-pending'; step++) {
      apply({ type: 'gameplay', action: { type: run.game.monsterHp > 0 ? 'attack' : 'enter-next-room' } });
    }
    expect(run.phase).toBe('settlement-pending');
    apply({ type: 'settle-boss', settlement: { attemptId, marketId: fixtureMarketId, direction: 'UP', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: tier === 1 ? 'BLESSED' : 'CURSED' } });
    const expiry = now - (2 - tier) * 300;
    rounds.push({ attemptId, marketId: fixtureMarketId, expiry, cutoff: expiry - 10, mode: tier === 1 ? 'simulation' : 'somnia', status: 'locked', direction: 'DOWN', finalizedAt: expiry - 20,
      reason: 'Controlled UI fixture: pre-existing settled boss and timely rival result.',
      ...(tier === 2 ? { txHash: `0x${'53'.repeat(32)}`, requestId: '2026' } : {}),
    });
    if (tier === 1) apply({ type: 'gameplay', action: { type: 'claim-relic', equip: false } });
  }
  const session: FullRunSession = { schema: 'market-dungeon/full-run-session/v2', run, market: null };
  const serialized = serializeFullRunSession(session);
  expect(parseFullRunSession(serialized)).toEqual(session);
  return { session, serialized, rounds };
}

test('existing settled boss fixtures show the correct rival verdict and keep simulated and Somnia scores separate', async ({ page }) => {
  const fixture = settledRivalFixture();
  const requests: Array<Record<string, unknown>> = [];
  await page.addInitScript(({ runKey, rivalKey, run, rounds }) => {
    localStorage.setItem(runKey, run);
    localStorage.setItem(rivalKey, JSON.stringify({ mode: 'simulation', rounds }));
  }, { runKey: LOCAL_RUN_KEY, rivalKey: RIVAL_KEY, run: fixture.serialized, rounds: fixture.rounds });
  await page.route('**/api/market?interval=300', route => route.fulfill({ status: 503, json: { error: 'Controlled settled-boss UI fixture: no next market.' } }));
  await page.route('**/api/somnia-agents/rival', route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    const round = fixture.rounds.find(item => item.attemptId === request.attemptId);
    return route.fulfill(round && request.action === 'status'
      ? { json: { round } }
      : { status: 400, json: { error: 'Controlled settled-boss UI fixture only permits recovery of the saved request.' } });
  });
  await page.goto('/somnia-agents');
  await expect(page.getByRole('heading', { name: 'The boss is back. Lock a fresh omen.', exact: true })).toBeVisible();
  // Even an editable cached answer is rechecked; no fixture launches a request
  // or claims to exercise real network settlement verification.
  await expect(page.getByText('Kevin wins this round.', { exact: true })).not.toBeVisible();
  await page.clock.runFor(3_100);
  await expect(page.getByRole('button', { name: /^Somnia Agent Kevin:/ })).toContainText('BTC DOWN');
  await expect(page.getByTestId('kevin-rival-panel').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('Kevin wins this round.', { exact: true })).not.toBeVisible();
  const visiblePanel = await openRivalDetails(page);
  await expect(visiblePanel).toContainText('Kevin wins this round.');
  await expect(visiblePanel).toContainText('MARKET SETTLED BTC DOWN');
  await expect(visiblePanel).toContainText('SOMNIA AGENTS · TESTNET');
  const score = page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).locator('details').filter({ has: page.getByText('YOUR RIVAL SCORECARD', { exact: true }) });
  await score.getByText('YOUR RIVAL SCORECARD', { exact: true }).click();
  await expect(score.locator('p').filter({ hasText: 'LOCAL SIMULATION' })).toHaveText('LOCAL SIMULATIONYou 1 · Kevin 0 · Ties 0 · Void 0');
  await expect(score.locator('p').filter({ hasText: 'SOMNIA AGENT · TESTNET' })).toHaveText('SOMNIA AGENT · TESTNETYou 0 · Kevin 1 · Ties 0 · Void 0');
  expect(requests.every(request => request.action === 'status')).toBe(true);
  expect([...new Set(requests.map(request => request.attemptId))].sort()).toEqual(fixture.rounds.map(round => round.attemptId).sort());
  const completedReads = requests.length;
  await page.clock.runFor(6_100);
  expect(requests).toHaveLength(completedReads);
  expect((await savedRun(page))!.run.game.gold).toBe(fixture.session.run.game.gold);
  expect((await savedRun(page))!.run.game.hp).toBe(fixture.session.run.game.hp);
  expect((await savedRun(page))!.run.settlements).toEqual(fixture.session.run.settlements);
});

test('declining MetaMask connection leaves the omen unlocked and allows simulated play', async ({ page }) => {
  await page.addInitScript(() => {
    // An injected rejection exercises the connection boundary without loading the SDK or contacting its relay.
    (window as unknown as { ethereum: { request: (input: { method: string }) => Promise<unknown> } }).ethereum = {
      request: async ({ method }) => {
        if (method !== 'eth_requestAccounts') throw new Error(`Unexpected wallet request: ${method}`);
        throw Object.assign(new Error('User declined connection'), { code: 4001 });
      },
    };
  });
  const fixture = await installFixtures(page, 'wallet');
  await page.goto('/somnia-agents');
  const panel = await openRivalDetails(page);
  await panel.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
  await panel.getByRole('button', { name: 'CONNECT METAMASK', exact: true }).click();
  await expect(panel).toContainText('SOMNIA AGENTS · TESTNET');
  await expect(panel).toContainText('Connection declined. Your omen is still unlocked.');
  await expect(panel).not.toContainText('RIVAL RESULT');
  expect((await savedRun(page))!.run.phase).toBe('boss-lock-required');
  expect((await savedRun(page))!.run.currentAttempt).toBeNull();
  expect(fixture.requests).toHaveLength(0);
  await expect(page.getByRole('region', { name: 'Combat actions', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'TRY LOCALLY Random test rival · no wallet', exact: true }).click();
  await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  const attack = page.getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ });
  await expect(attack).toBeEnabled();
  await attack.click();
  await expect.poll(async () => (await savedRun(page))!.run.game.lastPlayerDamage).toBeGreaterThan(0);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  expect(fixture.requests.find(request => request.action === 'prepare')?.mode).toBe('simulation');
});

test('the permanent rival status preserves visible combat controls and a large monster without horizontal scrolling', async ({ page }, info) => {
  const fixture = await installFixtures(page);
  await enterAndLock(page);
  fixture.answer();
  await page.clock.runFor(3_100);
  const combat = page.getByRole('region', { name: 'Combat view', exact: true });
  const actions = combat.getByRole('region', { name: 'Combat actions', exact: true });
  for (const name of [/ATTACK/, /STORM/, /POTION/]) {
    const control = actions.getByRole('button', { name });
    await expect(control).toBeInViewport({ ratio: 1 });
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await control.evaluate(element => {
      const box = element.getBoundingClientRect();
      const covering = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return covering !== null && element.contains(covering);
    })).toBe(true);
  }
  const art = combat.getByRole('img');
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const painted = await art.evaluate((image: HTMLImageElement) => {
    const box = image.getBoundingClientRect();
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    return { width: image.naturalWidth * scale, height: image.naturalHeight * scale };
  });
  const mobile = page.viewportSize()!.width <= 800;
  expect(painted.width).toBeGreaterThanOrEqual(mobile ? page.viewportSize()!.width * .85 : 400);
  expect(painted.height).toBeGreaterThanOrEqual(mobile ? page.viewportSize()!.width * .45 : 250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('kevin-combat-controls.png') });
});

/** UI fixtures use the real transition engine, never fabricated phase combinations. */
function roomFixture(room: number, cleared = false) {
  let run = createMarketDungeonRun(() => 0);
  // Leave room below the save validator's cap for random equipment loot.
  run.game.weaponLevel = 100;
  run.game.armorLevel = 100;
  const attemptId = `room_progress_fixture_${room}`;
  function apply(action: MarketDungeonAction) {
    const transition = transitionMarketDungeon(run, action, () => 0);
    expect(transition.accepted, transition.reason).toBe(true);
    run = transition.run;
  }
  apply({ type: 'lock-boss', lock: { attemptId, marketId, direction: 'DOWN', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null } });
  while (run.game.roomsCleared < room - 1) {
    apply({ type: 'gameplay', action: { type: 'attack' } });
    apply({ type: 'gameplay', action: { type: 'enter-next-room' } });
  }
  if (cleared) apply({ type: 'gameplay', action: { type: 'attack' } });
  run.game.hp = 68;
  run.game.potions = 2;
  run.game.gold = 120;
  run.game.lastCritical = false;
  const session: FullRunSession = { schema: 'market-dungeon/full-run-session/v2', run, market: {
    marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd,
    tradingStart: market.tradingStart, expiry: market.expiry, lockedAt: now - 5,
  } };
  const serialized = serializeFullRunSession(session);
  expect(parseFullRunSession(serialized)).toEqual(session);
  const round: RivalRound = {
    attemptId, marketId, expiry: market.expiry, cutoff: market.expiry - 10,
    mode: 'simulation', status: 'locked', direction: 'UP', finalizedAt: now - 1,
    reason: 'Controlled UI fixture: a timely simulated rival, not a network proof.',
  };
  return { session, serialized, round };
}

async function installSavedFixture(page: Page, fixture: ReturnType<typeof roomFixture>, agents: boolean, seedOnce = false) {
  const requests: Array<Record<string, unknown>> = [];
  await page.addInitScript(({ key, serialized, rivalKey, round, agents, seedOnce }) => {
    if (!seedOnce || localStorage.getItem(key) === null) localStorage.setItem(key, serialized);
    if (agents && (!seedOnce || localStorage.getItem(rivalKey) === null)) localStorage.setItem(rivalKey, JSON.stringify({ mode: 'simulation', rounds: [round] }));
  }, { key: agents ? LOCAL_RUN_KEY : FULL_RUN_STORAGE_KEY, serialized: fixture.serialized, rivalKey: RIVAL_KEY, round: fixture.round, agents, seedOnce });
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market, odds: null } }));
  await page.route('**/api/somnia-agents/rival', route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    return route.fulfill(request.action === 'status' && request.attemptId === fixture.round.attemptId
      ? { json: { round: fixture.round } }
      : { status: 400, json: { error: 'This controlled fixture can only recover its existing rival.' } });
  });
  return requests;
}

for (const agents of [false, true]) {
  test(`${agents ? 'Somnia Agents' : 'ordinary Full Expedition'} keeps all ten rooms visible through combat, loot and the next room`, async ({ page }, info) => {
    test.skip(info.project.name.includes('iphone'), 'This regression specifically covers the former missing desktop room strip.');
    const fixture = roomFixture(7);
    const requests = await installSavedFixture(page, fixture, agents);
    await page.goto(agents ? '/somnia-agents' : '/expedition');
    const strip = () => page.getByRole('list', { name: /^Room progress:/ }).filter({ visible: true });
    await expect(strip()).toHaveCount(1);
    await expect(strip()).toBeVisible();
    await expect(strip().getByRole('listitem')).toHaveCount(10);
    await expect(strip().locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 7');
    await expect(strip().locator('[data-complete="true"]')).toHaveCount(6);
    await expect(page.getByRole('region', { name: 'Tier progress', exact: true })).toHaveCount(0);
    if (agents) {
      await page.clock.runFor(3_100);
      await expectRivalOnlyInStatus(page);
    } else await expect(rivalStatus(page)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('room-progress-combat.png') });
    await page.getByRole('region', { name: 'Combat view', exact: true }).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
    await expect(page.getByText('ROOM 7 CLEARED', { exact: true })).toBeVisible();
    await expect(strip()).toHaveCount(1);
    await expect(strip()).toHaveAttribute('aria-label', /room 7 of 10, cleared/);
    await expect(strip().locator('[data-complete="true"]')).toHaveCount(7);
    await expect(strip().locator('[aria-current="step"]')).toHaveCount(0);
    if (agents) {
      await expectRivalOnlyInStatus(page);
      const panel = await openRivalDetails(page);
      await expect(panel).toContainText('Kevin chose BTC UP');
      await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
    }
    await page.screenshot({ path: info.outputPath('room-progress-loot.png') });
    await page.getByRole('button', { name: 'ENTER ROOM 8', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    await expect(strip().locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Room 8');
    await expect(strip().locator('[data-complete="true"]')).toHaveCount(7);
    if (agents) await expectRivalOnlyInStatus(page);
    else expect(requests).toHaveLength(0);
  });

  test(`${agents ? 'Somnia Agent Kevin' : 'Quartermaster Kevin'} camp keeps health beside purchases and preserves the status line`, async ({ page }, info) => {
    const fixture = roomFixture(9, true);
    const requests = await installSavedFixture(page, fixture, agents);
    await page.goto(agents ? '/somnia-agents' : '/expedition');
    await expect(page.getByText('CAMP BEFORE THE BOSS', { exact: true })).toBeVisible();
    const mobile = page.viewportSize()!.width <= 800;
    const supplies = page.getByRole('region', { name: mobile ? 'Supplies at Kevin' : 'Player status', exact: true });
    await expect(supplies).toContainText('68/100');
    await expect(supplies).toContainText('2/5');
    const merchant = page.getByText('CAMP BEFORE THE BOSS', { exact: true }).locator('../..');
    await expect(merchant).toContainText('120');
    await expect(merchant.getByText(agents ? 'Somnia Agent Kevin' : 'Quartermaster Kevin', { exact: true })).toBeVisible();
    if (agents) {
      await page.clock.runFor(3_100);
      await expectRivalOnlyInStatus(page);
    } else {
      await expect(rivalStatus(page)).toHaveCount(0);
      await expect(page.getByText('Somnia Agent Kevin', { exact: true })).toHaveCount(0);
    }
    const rest = merchant.getByRole('button', { name: /REST \+30/ });
    await rest.scrollIntoViewIfNeeded();
    await expect(rest).toBeInViewport({ ratio: 1 });
    if (mobile) await expect(supplies).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('kevin-camp-health-and-purchases.png') });
    await rest.click();
    await expect(supplies).toContainText('98/100');
    await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('98/100');
    await expect(rest).toBeDisabled();
    if (agents) await expectRivalOnlyInStatus(page);
    else expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'ENTER ROOM 10', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: /^Room progress:/ }).filter({ visible: true }).locator('[aria-current="step"]')).toHaveAttribute('aria-label', 'Boss 10');
  });
}

for (const ending of ['settlement-pending', 'boss-reward', 'dead'] as const) {
  test(`agent status remains available in ${ending}, with its full rival details confined to the modal`, async ({ page }) => {
    const fixture = roomFixture(10, ending !== 'dead');
    if (ending === 'boss-reward') {
      const result = transitionMarketDungeon(fixture.session.run, { type: 'settle-boss', settlement: {
        attemptId: fixture.round.attemptId, marketId, direction: 'DOWN', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'BLESSED',
      } }, () => 0);
      expect(result.accepted, result.reason).toBe(true);
      fixture.session.run = result.run;
      fixture.session.market = null;
    } else if (ending === 'dead') {
      const wounded = fixture.session.run;
      wounded.game.hp = 1;
      wounded.game.armorLevel = 0;
      wounded.game.weaponLevel = 0;
      const result = transitionMarketDungeon(wounded, { type: 'gameplay', action: { type: 'attack' } }, maximum => maximum - 1);
      expect(result.accepted, result.reason).toBe(true);
      fixture.session.run = result.run;
    }
    expect(fixture.session.run.phase).toBe(ending);
    fixture.serialized = serializeFullRunSession(fixture.session);
    expect(parseFullRunSession(fixture.serialized)).toEqual(fixture.session);
    await installSavedFixture(page, fixture, true);
    await page.goto('/somnia-agents');
    await page.clock.runFor(3_100);
    await expectRivalOnlyInStatus(page);
    if (ending === 'settlement-pending') {
      await expect(page.getByRole('region', { name: 'Recovery supplies', exact: true })).toContainText('68/100');
      await expect(page.getByRole('button', { name: /^REVEAL IN/ })).toBeDisabled();
    }
    if (ending === 'boss-reward') await expect(page.getByRole('region', { name: 'Relic reward', exact: true })).toBeVisible();
    if (ending === 'dead') await expect(page.getByRole('button', { name: 'BEGIN NEW EXPEDITION', exact: true })).toBeVisible();
    const panel = await openRivalDetails(page);
    await expect(panel).toContainText(ending === 'boss-reward' ? 'You beat Kevin.' : 'Kevin chose BTC UP');
    if (ending === 'boss-reward') await expect(panel).toContainText('SIMULATED RIVAL RESULT');
    else await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  });
}


test('Home keeps ordinary and Agent expeditions separate and preserves Judge variants', async ({ page }) => {
  const fixture = await installFixtures(page);
  await page.route('**/api/live-judge/**', route => route.fulfill({ status: 503, json: { error: 'Navigation fixture only.' } }));
  await page.route('**/api/shannon/judge-replay/**', route => route.fulfill({ status: 503, json: { error: 'Navigation fixture only.' } }));
  const choices = () => page.getByRole('group', { name: 'Choose your dungeon', exact: true });
  async function home() {
    const name = 'Market Dungeon — back to home';
    await page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).filter({ visible: true }).click();
    await expect(choices()).toBeVisible();
    await expect(choices().locator('input:checked')).toHaveCount(0);
  }
  async function choose(mode: 'Full Expedition' | 'Judge Demo' | 'Somnia Agents') {
    await expect(choices().getByRole('radio')).toHaveCount(3);
    for (const radio of await choices().getByRole('radio').all()) {
      const box = (await radio.locator('..').boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await choices().getByRole('radio', { name: mode, exact: true }).check();
    await page.getByRole('button', { name: /^(ENTER DUNGEON|CONTINUE RUN)$/ }).click();
    await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.goto('/');
  await choose('Full Expedition');
  await expect(page).toHaveURL(/\/expedition$/);
  await expect(page.getByRole('navigation', { name: 'Choose Judge demo', exact: true })).toHaveCount(0);
  await expect(rivalStatus(page)).toHaveCount(0);
  await expect(page.getByTestId('kevin-rival-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  const ordinaryBefore = await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY);
  expect(ordinaryBefore).not.toBeNull();
  expect(fixture.requests).toHaveLength(0);
  await enterAndLock(page);
  const agentBefore = await page.evaluate(key => localStorage.getItem(key), LOCAL_RUN_KEY);
  expect(agentBefore).not.toBeNull();
  expect(agentBefore).not.toBe(ordinaryBefore);
  expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(ordinaryBefore);
  await home();
  await choose('Full Expedition');
  await expect(page).toHaveURL(/\/expedition$/);
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  await expect(rivalStatus(page)).toHaveCount(0);
  const ordinaryReads = fixture.requests.length;
  await page.clock.runFor(3_100);
  expect(fixture.requests).toHaveLength(ordinaryReads);
  expect(await page.evaluate(key => localStorage.getItem(key), FULL_RUN_STORAGE_KEY)).toBe(ordinaryBefore);
  expect(await page.evaluate(key => localStorage.getItem(key), LOCAL_RUN_KEY)).toBe(agentBefore);
  await home();
  await choose('Judge Demo');
  await expect(page).toHaveURL(/\/shannon\/live-judge$/);
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
  await expect(variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('aria-current', 'page');
  await variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true }).click();
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(rivalStatus(page)).toHaveCount(0);
  expect(fixture.requests).toHaveLength(ordinaryReads);
  await home();
  await choose('Somnia Agents');
  await expect(page).toHaveURL(/\/somnia-agents$/);
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  await expect(rivalStatus(page)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), LOCAL_RUN_KEY)).toBe(agentBefore);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
});

test('narrow desktop status keeps Kevin text inside its button before lock and during wallet approval', async ({ page }, info) => {
  test.skip(info.project.name.includes('iphone'), 'Checks the desktop header immediately above its 800px breakpoint.');
  await page.setViewportSize({ width: 820, height: 1000 });
  await installFixtures(page, 'wallet');
  await page.addInitScript(() => {
    // Connect successfully, then hold only the paid request open. No real wallet or transaction is contacted.
    (window as unknown as { ethereum: { request: (input: { method: string }) => Promise<unknown> } }).ethereum = {
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [`0x${'ab'.repeat(20)}`];
        if (method === 'eth_chainId') return '0xc488';
        if (method === 'eth_sendTransaction') return new Promise<never>(() => {});
        throw new Error(`Unexpected wallet request: ${method}`);
      },
    };
  });
  async function measure(label: string) {
    const status = rivalStatus(page);
    await expect(status).toBeVisible();
    const geometry = await status.evaluate(element => {
      const outer = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        outside: [...element.children].some(child => {
          const box = child.getBoundingClientRect();
          return box.left < outer.left || box.right > outer.right;
        }),
      };
    });
    await page.screenshot({ path: info.outputPath(`narrow-desktop-${label}.png`) });
    expect(geometry.scrollWidth, `${label}: Kevin status must fit within its own button`).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.outside, `${label}: no status text should overlap neighboring header content`).toBe(false);
    const buttonBox = (await status.boundingBox())!;
    const logoBox = (await page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true }).boundingBox())!;
    expect(buttonBox.x < logoBox.x + logoBox.width && buttonBox.x + buttonBox.width > logoBox.x
      && buttonBox.y < logoBox.y + logoBox.height && buttonBox.y + buttonBox.height > logoBox.y,
    `${label}: Kevin status must not cover the center logo`).toBe(false);
    const linkBox = buttonBox;
    const soundBox = (await page.getByRole('button', { name: /^(Turn all game sounds (on|off)|Resume game sounds)$/ }).boundingBox())!;
    expect(linkBox.x < soundBox.x + soundBox.width && linkBox.x + linkBox.width > soundBox.x
      && linkBox.y < soundBox.y + soundBox.height && linkBox.y + linkBox.height > soundBox.y,
    `${label}: the sound control must not cover Kevin’s status`).toBe(false);
  }
  await page.goto('/somnia-agents');
  const panel = await openRivalDetails(page);
  await panel.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
  await page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(rivalStatus(page)).toHaveAttribute('aria-label', 'Somnia Agent Kevin: Not locked yet');
  await measure('before-lock');
  await page.getByRole('button', { name: 'CONNECT METAMASK FIRST', exact: true }).click();
  await expect(page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true })).toBeEnabled();
  expect((await savedRun(page))!.run.currentAttempt).toBeNull();
  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  await expect(rivalStatus(page)).toHaveAttribute('aria-label', 'Somnia Agent Kevin: Wallet approval');
  await measure('wallet-approval');
});

type HeaderRectangle = { x: number; y: number; width: number; height: number; documentX: number; documentY: number };
type HeaderGeometry = { scrollX: number; scrollY: number; elements: Record<string, HeaderRectangle> };

async function headerGeometry(page: Page, agents: boolean, allowMissingOmen = false): Promise<HeaderGeometry> {
  const logo = page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true });
  const header = logo.locator('xpath=ancestor::header[1]');
  const elements = {
    sound: page.getByRole('button', { name: /^(Turn all game sounds (on|off)|Resume game sounds)$/ }),
    logo,
    mode: header.getByText(agents ? 'SOMNIA AGENTS' : 'FULL EXPEDITION', { exact: true }),
    ...(!allowMissingOmen || await page.getByRole('button', { name: /^Omen details:/ }).count()
      ? { omen: page.getByRole('button', { name: /^Omen details:/ }) } : {}),
    ...(agents ? { kevin: rivalStatus(page) } : {}),
    loadout: header.locator(':scope > small'),
    health: page.locator('[aria-label^="Your health "]').filter({ visible: true }),
    rooms: page.getByRole('list', { name: /^Room progress:/ }).filter({ visible: true }),
  };
  const measured: HeaderGeometry = { ...await page.evaluate(() => ({ scrollX: window.scrollX, scrollY: window.scrollY })), elements: {} };
  for (const [name, element] of Object.entries(elements)) {
    await expect(element).toHaveCount(1);
    await expect(element).toBeVisible();
    measured.elements[name] = await element.evaluate(target => {
      const box = target.getBoundingClientRect();
      const rounded = (value: number) => Math.round(value * 100) / 100;
      return {
        x: rounded(box.x), y: rounded(box.y), width: rounded(box.width), height: rounded(box.height),
        documentX: rounded(box.x + window.scrollX), documentY: rounded(box.y + window.scrollY),
      };
    });
  }
  return measured;
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 720 }, { width: 820, height: 900 }]) for (const agents of [false, true]) {
  test(`desktop header stays anchored between rooms in ${agents ? 'Agents' : 'Full Expedition'} at ${viewport.width}px`, async ({ page }, info) => {
    test.skip(info.project.name.includes('iphone'), 'Desktop header geometry regression.');
    await page.setViewportSize(viewport);
    await installSavedFixture(page, roomFixture(7), agents);
    await page.goto(agents ? '/somnia-agents' : '/expedition');
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    await page.clock.runFor(3_100);
    if (agents) await expectRivalOnlyInStatus(page);
    const combat = await headerGeometry(page, agents);
    await page.screenshot({ path: info.outputPath('header-room7-combat.png') });
    await page.getByRole('region', { name: 'Combat view', exact: true }).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
    await expect(page.getByText('ROOM 7 CLEARED', { exact: true })).toBeVisible();
    await page.clock.runFor(500);
    const loot = await headerGeometry(page, agents);
    await page.screenshot({ path: info.outputPath('header-room7-loot.png') });
    await page.getByRole('button', { name: 'ENTER ROOM 8', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    await page.clock.runFor(500);
    const nextCombat = await headerGeometry(page, agents);
    await page.screenshot({ path: info.outputPath('header-room8-combat.png') });
    const states = { combat, loot, nextCombat };
    await info.attach('header-geometry', { body: JSON.stringify(states, null, 2), contentType: 'application/json' });
    const deltas = Object.fromEntries(Object.entries({ loot, nextCombat }).map(([state, measured]) => [state,
      Object.fromEntries(Object.entries(combat.elements).map(([element, before]) => [element,
        Object.fromEntries((['x', 'y', 'width', 'height', 'documentX', 'documentY'] as const).map(axis => [axis, Math.round((measured.elements[element][axis] - before[axis]) * 100) / 100])),
      ])),
    ]));
    await info.attach('header-deltas', { body: JSON.stringify(deltas, null, 2), contentType: 'application/json' });
    const maxShift = Object.fromEntries(Object.entries(deltas).map(([state, elements]) => [state,
      Math.max(...Object.values(elements).flatMap(rectangle => Object.values(rectangle).map(value => Math.abs(value)))),
    ]));
    console.log(JSON.stringify({ viewport, agents, scroll: { combat: combat.scrollY, loot: loot.scrollY, nextCombat: nextCombat.scrollY }, maxShift }));
    // Document coordinates expose layout changes independently of focus scrolling.
    // Viewport coordinates also protect the visible header against automatic jumps.
    for (const [state, measured] of Object.entries({ loot, nextCombat })) for (const [name, before] of Object.entries(combat.elements)) {
      for (const axis of ['x', 'y', 'width', 'height', 'documentX', 'documentY'] as const) {
        expect.soft(Math.abs(measured.elements[name][axis] - before[axis]), `${state}: ${name}.${axis} must stay anchored`).toBeLessThanOrEqual(1);
      }
    }
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 900 }]) for (const agents of [false, true]) {
  test(`desktop ${agents ? 'Agent' : 'Full Expedition'} header stays anchored through boss reward and death at ${viewport.width}px`, async ({ page }, info) => {
    test.skip(info.project.name.includes('iphone'), 'Desktop ending header geometry regression.');
    await page.setViewportSize(viewport);
    const pending = roomFixture(10, true);
    const settled = transitionMarketDungeon(pending.session.run, { type: 'settle-boss', settlement: {
      attemptId: pending.round.attemptId, marketId, direction: 'DOWN', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null, outcome: 'BLESSED',
    } }, () => 0);
    expect(settled.accepted, settled.reason).toBe(true);
    const rewardSession: FullRunSession = { ...pending.session, run: settled.run, market: null };
    const dead = roomFixture(10);
    dead.session.run.game.hp = 1;
    dead.session.run.game.armorLevel = 0;
    dead.session.run.game.weaponLevel = 0;
    const ending = transitionMarketDungeon(dead.session.run, { type: 'gameplay', action: { type: 'attack' } }, maximum => maximum - 1);
    expect(ending.accepted, ending.reason).toBe(true);
    const deadSession: FullRunSession = { ...dead.session, run: ending.run };
    expect(pending.session.run.phase).toBe('settlement-pending');
    expect(rewardSession.run.phase).toBe('boss-reward');
    expect(deadSession.run.phase).toBe('dead');
    for (const session of [pending.session, rewardSession, deadSession]) {
      expect(parseFullRunSession(serializeFullRunSession(session))).toEqual(session);
    }
    await installSavedFixture(page, pending, agents, true);
    await page.goto(agents ? '/somnia-agents' : '/expedition');
    await page.clock.runFor(3_100);
    if (agents) await expectRivalOnlyInStatus(page);
    const states: Record<string, HeaderGeometry> = { pending: await headerGeometry(page, agents) };
    await page.screenshot({ path: info.outputPath('header-boss-pending.png') });
    for (const [label, session] of [['reward', rewardSession], ['dead', deadSession]] as const) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: agents ? LOCAL_RUN_KEY : FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session) });
      await page.reload();
      await page.clock.runFor(3_100);
      if (agents) await expectRivalOnlyInStatus(page);
      if (label === 'reward') await expect(page.getByRole('region', { name: 'Relic reward', exact: true })).toBeVisible();
      else await expect(page.getByRole('button', { name: 'BEGIN NEW EXPEDITION', exact: true })).toBeVisible();
      states[label] = await headerGeometry(page, agents, true);
      await page.screenshot({ path: info.outputPath(`header-boss-${label}.png`) });
    }
    await info.attach('ending-header-geometry', { body: JSON.stringify(states, null, 2), contentType: 'application/json' });
    const deltas = Object.fromEntries(Object.entries(states).filter(([state]) => state !== 'pending').map(([state, measured]) => [state,
      Object.fromEntries(Object.entries(states.pending.elements).filter(([name]) => measured.elements[name]).map(([name, before]) => [name,
        Object.fromEntries((['x', 'y', 'width', 'height', 'documentX', 'documentY'] as const).map(axis => [axis, Math.round((measured.elements[name][axis] - before[axis]) * 100) / 100])),
      ])),
    ]));
    await info.attach('ending-header-deltas', { body: JSON.stringify(deltas, null, 2), contentType: 'application/json' });
    const maxShift = Object.fromEntries(Object.entries(deltas).map(([state, elements]) => [state,
      Math.max(...Object.values(elements).flatMap(rectangle => Object.values(rectangle).map(value => Math.abs(value)))),
    ]));
    console.log(JSON.stringify({ viewport, agents, endingMaxShift: maxShift }));
    for (const [state, measured] of Object.entries(states).filter(([state]) => state !== 'pending')) {
      for (const [name, before] of Object.entries(states.pending.elements).filter(([name]) => measured.elements[name])) {
        for (const axis of ['x', 'y', 'width', 'height', 'documentX', 'documentY'] as const) {
          expect.soft(Math.abs(measured.elements[name][axis] - before[axis]), `${state}: ${name}.${axis} must stay anchored`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
}
