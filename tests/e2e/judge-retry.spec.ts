import { expect, test, type Page, type Route } from '@playwright/test';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import type { JudgeCombatAction } from '../../app/judge-combat';
import {
  BLOCK_HASH, BLOCK_TAG, LOCK_PUBLIC_KEY, SEAL, VALID_ACTIONS,
  judgeReplayFixtureForDirection, market, onchainSettlement,
} from './judge-demo-fixture';
import { playJudgeBoss, playJudgeGuard, expectJudgeProgress, openJudgeProof } from './judge-play';

const lockName = /^LOCK BTC (?:UP|DOWN) & ENTER DUNGEON$/;
const revealName = 'REVEAL BOSS FATE';
const statusName = 'Replay connection status';

async function installReplay(page: Page, options: {
  direction?: 'UP' | 'DOWN';
  start?: (route: Route, attempt: number) => Promise<void>;
  key?: (route: Route, attempt: number) => Promise<void>;
  reveal?: (route: Route, attempt: number) => Promise<void>;
} = {}) {
  const fixture = judgeReplayFixtureForDirection(options.direction ?? 'UP');
  const calls = { starts: [] as unknown[], keys: 0, reveals: [] as { seal: string; actions: JudgeCombatAction[] }[] };
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/market**', route => route.fulfill({ json: { market, odds: null } }));
  await page.route('**/api/judge-replay/start', async route => {
    calls.starts.push(route.request().postDataJSON());
    if (options.start) await options.start(route, calls.starts.length);
    else await route.fulfill({ json: fixture.start });
  });
  await page.route('**/api/judge-replay/public-key', async route => {
    calls.keys++;
    if (options.key) await options.key(route, calls.keys);
    else await route.fulfill({ json: LOCK_PUBLIC_KEY });
  });
  await page.route('**/api/judge-replay/reveal', async route => {
    const request = route.request().postDataJSON();
    calls.reveals.push(request);
    expect(request).toEqual({ seal: SEAL, actions: VALID_ACTIONS });
    if (options.reveal) await options.reveal(route, calls.reveals.length);
    else await route.fulfill({ json: fixture.reveal(request.actions) });
  });
  await page.route(SOMNIA_MAINNET_RPC, async route => {
    const body = route.request().postDataJSON();
    let result: unknown;
    if (body.method === 'eth_chainId') result = '0x13a7';
    else if (body.method === 'eth_getBlockByHash') result = { number: BLOCK_TAG, hash: BLOCK_HASH };
    else if (body.method === 'eth_call') result = body.params[0].to.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
      ? onchainSettlement.calls.moduleMarket.result : onchainSettlement.calls.settlementRecord.result;
    else throw new Error(`Unexpected browser RPC method: ${body.method}`);
    await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result }, headers: { 'access-control-allow-origin': '*' } });
  });
  return { calls, fixture };
}

async function expectUnlocked(page: Page) {
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
  await expectJudgeProgress(page);
  await expect(page.getByRole('group', { name: 'Choose your BTC omen', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(1);
}

async function reachReveal(page: Page) {
  await page.goto('/judge');
  await page.getByRole('button', { name: lockName, exact: true }).click();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: 'ENTER FINAL BOSS' }).click();
  await playJudgeBoss(page);
  await expect(page.getByRole('button', { name: revealName, exact: true })).toBeEnabled();
}

for (const status of [503, 429]) {
  test(`Judge start ${status} explains the failure and reopens after elapsed wall time without automatic locking`, async ({ page }, info) => {
    await page.setViewportSize({ width: status === 503 ? 390 : 1280, height: status === 503 ? 844 : 720 });
    const now = Date.now();
    await page.clock.install({ time: now });
    const fixture = judgeReplayFixtureForDirection('UP');
    const { calls } = await installReplay(page, {
      start: (route, attempt) => route.fulfill(attempt === 1
        ? { status, json: { retryState: status === 429 ? 'rate_limited' : 'upstream_retry', retryAfter: 3 } }
        : { json: fixture.start }),
    });
    await page.goto('/judge');
    const firstLock = page.getByRole('button', { name: lockName, exact: true });
    const guide = page.getByRole('region', { name: 'How your Bitcoin choice works', exact: true });
    await expect(guide).toBeVisible();
    const guideBox = (await guide.boundingBox())!;
    expect(guideBox.y + guideBox.height).toBeLessThanOrEqual((await firstLock.boundingBox())!.y);
    await firstLock.scrollIntoViewIfNeeded();
    await expect(firstLock).toBeInViewport({ ratio: 1 });
    await firstLock.click();
    await expectUnlocked(page);
    const statusBox = page.getByRole('status', { name: statusName });
    await expect(statusBox).toContainText(status === 429 ? 'Please give the dungeon a moment.' : 'The replay service is temporarily unavailable.');
    await expect(statusBox).toContainText(/omen.*not locked/i);
    await expect(page.getByRole('button', { name: /RETRY LOCK IN \dS/ })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`judge-start-${status}.png`), fullPage: true });
    // One timer callback after a long time jump must clear the full backoff.
    // Counting interval callbacks would incorrectly leave two seconds remaining.
    await page.clock.setSystemTime(now + 60_000);
    await page.clock.runFor(1_000);
    const lock = page.getByRole('button', { name: lockName, exact: true });
    await expect(lock).toBeEnabled();
    await expect(page.getByRole('button', { name: /RETRY LOCK IN/ })).toHaveCount(0);
    expect(calls.starts).toEqual([{ direction: 'UP' }]);
    expect(calls.keys).toBe(0);
    await lock.click();
    await expect(page.getByRole('region', { name: 'Combat view' })).toContainText('GUARD 1/2');
    expect(calls.starts).toEqual([{ direction: 'UP' }, { direction: 'UP' }]);
  });
}

test('Judge missing service configuration stays unlocked with an actionable explanation and no misleading cooldown', async ({ page }) => {
  const { calls } = await installReplay(page, {
    start: route => route.fulfill({ status: 503, json: { retryState: 'config_unavailable', error: 'Replay service is not configured' } }),
  });
  await page.goto('/judge');
  await page.getByRole('button', { name: lockName, exact: true }).click();
  await expectUnlocked(page);
  await expect(page.getByRole('status', { name: statusName })).toContainText('The replay service needs attention.');
  await expect(page.getByRole('status', { name: statusName })).toContainText(/not configured/i);
  await expect(page.getByRole('button', { name: lockName, exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /RETRY LOCK IN/ })).toHaveCount(0);
  expect(calls.starts).toHaveLength(1);
  expect(calls.keys).toBe(0);
});

test('Judge empty eligible replay pool has its own explanation and bounded retry', async ({ page }) => {
  await installReplay(page, {
    start: route => route.fulfill({ status: 503, json: { retryState: 'no_candidates', retryAfter: 30 } }),
  });
  await page.goto('/judge');
  await page.getByRole('button', { name: lockName, exact: true }).click();
  await expectUnlocked(page);
  await expect(page.getByRole('status', { name: statusName })).toContainText('No eligible replay is available yet.');
  await expect(page.getByRole('button', { name: /RETRY LOCK IN (30|29)S/ })).toBeDisabled();
});

for (const reply of [
  { name: 'HTML error with HTTP-date Retry-After', html: true, header: 'date', body: undefined, seconds: 4 },
  { name: 'invalid retry hints', html: false, header: 'not-a-date', body: 'Infinity', seconds: 3 },
  { name: 'excessive retry hints', html: false, header: '999999999', body: 999999999, seconds: 300 },
]) {
  test(`Judge handles ${reply.name} without an unusable lock button`, async ({ page }) => {
    const now = Math.ceil(Date.now() / 1_000) * 1_000;
    await page.clock.install({ time: now });
    const { calls } = await installReplay(page, {
      start: route => route.fulfill({
        status: 503,
        headers: { 'retry-after': reply.header === 'date' ? new Date(now + 4_000).toUTCString() : reply.header },
        ...(reply.html ? { contentType: 'text/html', body: '<html>Upstream unavailable</html>' }
          : { json: { retryState: 'upstream_retry', retryAfter: reply.body } }),
      }),
    });
    await page.goto('/judge');
    await page.getByRole('button', { name: lockName, exact: true }).click();
    await expectUnlocked(page);
    await expect(page.getByRole('status', { name: statusName })).toContainText('The replay service is temporarily unavailable.');
    const retry = page.getByRole('button', { name: /RETRY LOCK IN \d+S/ });
    await expect(retry).toBeDisabled();
    const remaining = Number((await retry.innerText()).match(/\d+/)?.[0]);
    expect(remaining).toBeGreaterThanOrEqual(reply.seconds - 1);
    expect(remaining).toBeLessThanOrEqual(reply.seconds);
    await page.clock.setSystemTime(now + (reply.seconds + 10) * 1_000);
    await page.clock.runFor(1_000);
    await expect(page.getByRole('button', { name: lockName, exact: true })).toBeEnabled();
    expect(calls.starts).toHaveLength(1);
  });
}

test('Judge freezes the chosen direction through start and signature verification and sends only one lock request', async ({ page }) => {
  let finishStart!: () => void;
  let finishKey!: () => void;
  const startGate = new Promise<void>(resolve => { finishStart = resolve; });
  const keyGate = new Promise<void>(resolve => { finishKey = resolve; });
  const fixture = judgeReplayFixtureForDirection('DOWN');
  const { calls } = await installReplay(page, {
    direction: 'DOWN',
    start: async route => { await startGate; await route.fulfill({ json: fixture.start }); },
    key: async route => { await keyGate; await route.fulfill({ json: LOCK_PUBLIC_KEY }); },
  });
  try {
    await page.goto('/judge');
    const down = page.getByRole('button', { name: /SHADOWS RISE/ });
    const up = page.getByRole('button', { name: /GOLD AWAKENS/ });
    await down.click();
    const lock = page.getByRole('button', { name: lockName, exact: true });
    // Same-turn native activation probes the synchronous guard as well as the
    // disabled UI: React state alone does not guard a second handler invocation.
    await lock.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole('button', { name: 'LOCKING + SEALING REPLAY…' })).toBeDisabled();
    await expect(up).toBeDisabled();
    await expect(down).toBeDisabled();
    await expect(down).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => calls.starts.length).toBe(1);
    finishStart();
    await expect.poll(() => calls.keys).toBe(1);
    await expect(up).toBeDisabled();
    await expect(down).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
    finishKey();
    await expect(page.getByRole('region', { name: 'Combat view' })).toContainText('GUARD 1/2');
    expect(calls.starts).toEqual([{ direction: 'DOWN' }]);
  } finally {
    finishStart();
    finishKey();
  }
});

for (const stage of ['start', 'key'] as const) {
  test(`Judge ${stage} timeout returns to an unlocked retryable state`, async ({ page }) => {
    test.setTimeout(40_000);
    const { calls } = await installReplay(page, { [stage]: async () => { /* Keep the browser request pending until its real AbortSignal deadline. */ } });
    await page.goto('/judge');
    await page.getByRole('button', { name: lockName, exact: true }).click();
    await expect(page.getByRole('button', { name: 'LOCKING + SEALING REPLAY…' })).toBeDisabled();
    await expect(page.getByRole('status', { name: statusName })).toContainText('The replay connection was interrupted.', { timeout: 25_000 });
    await expectUnlocked(page);
    await expect(page.getByRole('button', { name: lockName, exact: true })).toBeEnabled();
    expect(calls.starts).toHaveLength(1);
    expect(calls.reveals).toHaveLength(0);
  });
}

for (const status of [503, 429, 425]) {
  test(`Judge reveal ${status} preserves the completed guard, healing, boss and sealed transcript for retry`, async ({ page }) => {
    const now = Date.now();
    await page.clock.install({ time: now });
    const fixture = judgeReplayFixtureForDirection('UP');
    const { calls } = await installReplay(page, {
      reveal: (route, attempt) => route.fulfill(attempt === 1
        ? { status, json: { retryState: status === 429 ? 'rate_limited' : 'upstream_retry', retryAfter: 3 } }
        : { json: fixture.reveal(VALID_ACTIONS) }),
    });
    await reachReveal(page);
    await page.getByRole('button', { name: revealName, exact: true }).click();
    await expect(page.getByRole('button', { name: status === 425 ? /REVEAL AVAILABLE IN \dS/ : /RETRY REVEAL IN \dS/ })).toBeDisabled();
    await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Combat view' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true })).toHaveCount(0);
    await page.clock.setSystemTime(now + 60_000);
    await page.clock.runFor(1_000);
    await expect(page.getByRole('button', { name: revealName, exact: true })).toBeEnabled();
    expect(calls.starts).toHaveLength(1);
    expect(calls.reveals).toHaveLength(1);
    await page.getByRole('button', { name: revealName, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true }).and(page.locator('[data-outcome="BLESSED"]'))).toBeVisible();
    expect(calls.reveals).toEqual([
      { seal: SEAL, actions: VALID_ACTIONS },
      { seal: SEAL, actions: VALID_ACTIONS },
    ]);
    await expect(page.getByLabel('Final run statistics', { exact: true }).locator('div').filter({ hasText: 'FINAL GOLD' }).locator('dd')).toHaveText('122');
  });
}

test('Judge reveal timeout preserves the run and a second manual verification succeeds', async ({ page }) => {
  test.setTimeout(45_000);
  const fixture = judgeReplayFixtureForDirection('UP');
  const { calls } = await installReplay(page, {
    reveal: async (route, attempt) => {
      if (attempt > 1) await route.fulfill({ json: fixture.reveal(VALID_ACTIONS) });
    },
  });
  await reachReveal(page);
  await page.getByRole('button', { name: revealName, exact: true }).click();
  await expect(page.getByRole('button', { name: /VERIFYING COMBAT \+ SETTLEMENT/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: revealName, exact: true })).toBeEnabled({ timeout: 25_000 });
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await page.getByRole('button', { name: revealName, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true }).and(page.locator('[data-outcome="BLESSED"]'))).toBeVisible();
  expect(calls.starts).toHaveLength(1);
  expect(calls.reveals).toHaveLength(2);
});

test('Judge reveal configuration failure preserves the sealed run without pretending the Somnia RPC is busy', async ({ page }) => {
  const fixture = judgeReplayFixtureForDirection('UP');
  const { calls } = await installReplay(page, {
    reveal: (route, attempt) => route.fulfill(attempt === 1
      ? { status: 503, json: { retryState: 'config_unavailable', error: 'Replay service is not configured' } }
      : { json: fixture.reveal(VALID_ACTIONS) }),
  });
  await reachReveal(page);
  await page.getByRole('button', { name: revealName, exact: true }).click();
  const status = page.getByRole('status', { name: 'Replay verification status' });
  await expect(status).toContainText('The replay service needs attention.');
  await expect(page.getByRole('button', { name: /RETRY REVEAL IN/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: revealName, exact: true })).toBeEnabled();
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true })).toHaveCount(0);
  expect(calls.starts).toHaveLength(1);
  expect(calls.reveals).toHaveLength(1);
  await page.getByRole('button', { name: revealName, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true }).and(page.locator('[data-outcome="BLESSED"]'))).toBeVisible();
  expect(calls.reveals[1]).toEqual(calls.reveals[0]);
});

test('Judge verified wrong omen ends with the last strike, keeps only guard gold, and resets into a fresh Judge run', async ({ page }, info) => {
  const { calls } = await installReplay(page, { direction: 'DOWN' });
  await page.goto('/judge');
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: lockName, exact: true }).click();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: 'ENTER FINAL BOSS' }).click();
  await playJudgeBoss(page);
  await page.getByRole('button', { name: revealName, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One fatal last strike.' })).toBeVisible();
  await expect(page.locator('[data-boss-scene="last-strike"]')).toBeVisible();
  await expect(page.getByLabel('Historical Judge stage', { exact: true })).toContainText('You chose BTC DOWN. The market settled BTC UP. Your prediction was wrong. You won the combat, but the boss\'s last stand ends the run.');
  const resultSummary = page.getByRole('region', { name: 'Choice, market result and boss fate' });
  await expect(resultSummary).toBeVisible();
  await expect(resultSummary).toHaveAttribute('data-outcome', 'CURSED');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'YOUR CHOICE' }).locator('strong')).toHaveText('BTC DOWN');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'MARKET RESULT' }).locator('strong')).toHaveText('BTC UP');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'BOSS FATE' }).locator('strong')).toHaveText('FINAL STRIKE');
  await expect(resultSummary).toContainText('Recorded result verified');
  await expect(resultSummary).toContainText('Demo ended · no boss reward');
  const proof = await openJudgeProof(page);
  await expect(proof).toContainText('Both winning and losing runs can be verified.');
  await expect(page.getByLabel('Final run statistics', { exact: true }).locator('div').filter({ hasText: 'FINAL GOLD' }).locator('dd')).toHaveText('80');
  await expect(page.getByLabel('Final run statistics', { exact: true }).locator('div').filter({ hasText: 'ENCOUNTERS CLEARED' }).locator('dd')).toHaveText('2/2');
  await expect(page.getByRole('region', { name: 'Dungeon log', exact: true })).toContainText('No boss reward is awarded.');
  await expect(page.getByRole('region', { name: 'Portable run verification' })).toBeVisible();
  await expect(page.getByRole('button', { name: /REMATCH/ })).toHaveCount(0);
  await page.locator('[data-boss-scene="last-strike"]').evaluate(async scene => {
    await Promise.allSettled(scene.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished));
  });
  await page.screenshot({ path: info.outputPath('judge-verified-cursed.png'), fullPage: true });
  await page.getByRole('button', { name: 'START NEW REPLAY', exact: true }).click();
  await expect(page).toHaveURL(/\/judge$/);
  await expectUnlocked(page);
  await expect(page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Portable run verification' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: lockName, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: lockName, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view' })).toContainText('GUARD 1/2');
  await expect(page.getByLabel('Your health 76 of 100', { exact: true })).toBeVisible();
  expect(calls.starts).toEqual([{ direction: 'DOWN' }, { direction: 'DOWN' }]);
  expect(calls.reveals).toHaveLength(1);
});
