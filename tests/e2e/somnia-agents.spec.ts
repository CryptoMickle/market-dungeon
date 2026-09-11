import { expect, test, type Page } from '@playwright/test';
import { encodeFunctionData, toHex, zeroAddress } from 'viem';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { createMarketDungeonRun, FULL_RUN_MARKET_PROOF_VERSION, transitionMarketDungeon, type MarketDungeonAction, type MarketDungeonRun } from '../../app/gameplay/event-boss-engine';
import { parseFullRunSession, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
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
  await page.goto('/');
  await expect(page.getByText('LOCAL AGENTS EDITION · KEVIN THE RIVAL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true }).click();
  if (mode === 'somnia') await page.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
}

async function openRivalDetails(page: Page) {
  await page.getByRole('button', { name: /^Omen details:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Omen', exact: true });
  await expect(dialog).toBeVisible();
  return dialog.getByTestId('kevin-rival-panel');
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('agents-'), 'Run the local Agents edition with playwright.agents.config.ts; normal builds deliberately hide it.');
  await page.clock.install({ time: new Date(now * 1000) });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

test('playground keeps its simulated choice locked until reset and explains all outcomes', async ({ page }) => {
  await page.goto('/somnia-agents');
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
  await page.goto('/somnia-agents');
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
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin is choosing · Keep fighting · Details');
  fixture.answer();
  await page.clock.runFor(3_100);
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin: BTC UP · SIMULATED · Details');
  const panel = await openRivalDetails(page);
  await expect(panel).toContainText('YOUR LOCKED OMEN');
  await expect(panel).toContainText('BTC DOWN');
  await expect(panel).toContainText('Kevin chose BTC UP');
  await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  await page.getByRole('dialog', { name: 'Omen', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').rounds?.[0]?.status, RIVAL_KEY)).toBe('locked');
  const statusReadsBeforeReload = fixture.requests.filter(request => request.action === 'status').length;
  await page.reload();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  await page.clock.runFor(3_100);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'status').length).toBeGreaterThan(statusReadsBeforeReload);
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin: BTC UP · SIMULATED · Details');
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  expect(fixture.requests.every(request => request.attemptId === prepared.attemptId)).toBe(true);
  expect((await savedRun(page))!.run.currentAttempt).toEqual(saved.run.currentAttempt);
  expect(await page.evaluate(() => localStorage.getItem('market-dungeon/full-run-session/v2'))).toBeNull();
});

test('an unavailable agent leaves normal attacks playable', async ({ page }) => {
  await installFixtures(page, 'failed');
  await enterAndLock(page);
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin sits this round out');
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
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin is choosing');
  // The fixture keeps returning HTTP 200 / pending even beyond expiry + 120s.
  // Skip most timer repetitions, then allow the next normal status read to run.
  await page.clock.fastForward((market.expiry - now + 121) * 1000);
  await page.clock.runFor(3_100);
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin sits this round out');
  const panel = await openRivalDetails(page);
  await panel.getByText('Request details', { exact: true }).click();
  await expect(panel).toContainText('could not be verified within the recovery window');
  await expect(panel).not.toContainText('SIMULATED RIVAL RESULT');
  await page.getByRole('dialog', { name: 'Omen', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
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
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The boss is back. Lock a fresh omen.', exact: true })).toBeVisible();
  // Even an editable cached answer is rechecked; no fixture launches a request
  // or claims to exercise real network settlement verification.
  await expect(page.getByText('Kevin wins this round.', { exact: true })).not.toBeVisible();
  await page.clock.runFor(3_100);
  const visiblePanel = page.getByTestId('kevin-rival-panel').filter({ visible: true });
  await expect(visiblePanel).toContainText('Kevin wins this round.');
  await expect(visiblePanel).toContainText('MARKET SETTLED BTC DOWN');
  await expect(visiblePanel).toContainText('SOMNIA AGENTS · TESTNET');
  const score = page.locator('details').filter({ has: page.getByText('YOUR RIVAL SCORECARD', { exact: true }) });
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

test('Somnia mode without a wallet reports the missing wallet and keeps combat running', async ({ page }) => {
  await page.addInitScript(() => { delete (window as unknown as { ethereum?: unknown }).ethereum; });
  const fixture = await installFixtures(page, 'wallet');
  await enterAndLock(page, 'somnia');
  await expect(page.getByRole('region', { name: 'Player status', exact: true })).toContainText('Kevin sits this round out');
  expect(fixture.requests.find(request => request.action === 'prepare')?.mode).toBe('somnia');
  const panel = await openRivalDetails(page);
  await expect(panel).toContainText('SOMNIA AGENTS · TESTNET');
  await panel.getByText('Request details', { exact: true }).click();
  await expect(panel).toContainText('A browser wallet is needed for a real Somnia request.');
  await expect(panel).not.toContainText('RIVAL RESULT');
  await page.getByRole('dialog', { name: 'Omen', exact: true }).getByRole('button', { name: 'Close details', exact: true }).click();
  const attack = page.getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ });
  await expect(attack).toBeEnabled();
  await attack.click();
  await expect.poll(async () => (await savedRun(page))!.run.game.lastPlayerDamage).toBeGreaterThan(0);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
});

test('the rival hint preserves visible combat controls and a large monster without horizontal scrolling', async ({ page }, info) => {
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
