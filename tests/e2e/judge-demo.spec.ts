import { expect, test, type Locator, type Page } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import {
  BLOCK_HASH,
  BLOCK_TAG,
  market,
  onchainSettlement,
  revealPayload,
  SEAL,
  startPayload,
  VALID_ACTIONS,
} from './judge-demo-fixture';

async function installDeterministicUpstreams(page: Page) {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/judge-replay/start', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: startPayload });
  });
  await page.route('**/api/judge-replay/reveal', async (route) => {
    const body = route.request().postDataJSON() as { seal: string; actions: JudgeCombatAction[] };
    expect(body.seal).toBe(SEAL);
    expect(body.actions).toEqual(VALID_ACTIONS);
    await route.fulfill({ json: revealPayload(body.actions) });
  });
  await page.route(SOMNIA_MAINNET_RPC, async (route) => {
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

test('homepage makes the short Judge Demo the primary first-screen action', async ({ page }) => {
  const expirySeconds = Math.floor(Date.now() / 1_000) + 300;
  const activeMarket = {
    ...market,
    expiry: String(expirySeconds),
    expiryIso: new Date(expirySeconds * 1_000).toISOString(),
    status: 'Active',
    finalized: false,
    winningOutcome: undefined,
  };
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market: activeMarket, odds: null } });
  });

  await page.goto('/');
  const judgeEntry = page.getByRole('region', { name: 'Judge-first entry' });
  await expect(judgeEntry).toBeVisible();
  const judgeButton = page.getByRole('button', { name: /START 2-MIN JUDGE DEMO/ });
  await expect(judgeButton).toBeVisible();
  await expect(judgeButton).toHaveClass(/judge-entry-primary/);
  await expect(page.getByRole('link', { name: /PLAY THE FULL FOUR-TIER EXPEDITION/ })).toHaveAttribute('href', '#full-expedition');

  const fullRunButton = page.getByRole('button', { name: /BEGIN FULL EXPEDITION/ });
  await expect(fullRunButton).toBeEnabled();
  await expect(fullRunButton).toHaveClass(/full-run-action/);
  expect(await judgeButton.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('homepage and /judge prerender their primary Judge actions before client hydration', async ({ request }) => {
  const homepageResponse = await request.get('/');
  expect(homepageResponse.ok()).toBe(true);
  const homepageHtml = await homepageResponse.text();
  expect(homepageHtml).toContain('JUDGES · START HERE');
  expect(homepageHtml).toContain('START 2-MIN JUDGE DEMO · VERIFIED RUN');
  expect(homepageHtml).not.toContain('PREPARING MARKET DUNGEON');

  const judgeResponse = await request.get('/judge');
  expect(judgeResponse.ok()).toBe(true);
  const judgeHtml = await judgeResponse.text();
  expect(judgeHtml).toContain('LOCK OMEN &amp; SEAL REPLAY');
  expect(judgeHtml).not.toContain('PREPARING MARKET DUNGEON');
});

test('mobile Full Expedition can select and lock BTC DOWN', async ({ page }) => {
  const expirySeconds = Math.floor(Date.now() / 1_000) + 300;
  const activeMarket = {
    ...market,
    expiry: String(expirySeconds),
    expiryIso: new Date(expirySeconds * 1_000).toISOString(),
    status: 'Active',
    finalized: false,
    winningOutcome: undefined,
  };
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market: activeMarket, odds: null } });
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  const fullRunChoices = page.locator('.setup-intro .prediction-buttons');
  const up = fullRunChoices.getByRole('button', { name: /GOLD AWAKENS/ });
  const down = fullRunChoices.getByRole('button', { name: /SHADOWS RISE/ });
  await expect(down).toBeVisible();
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await expect(down).toHaveAttribute('aria-pressed', 'false');

  await down.click();
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  const begin = page.getByRole('button', { name: /BEGIN FULL EXPEDITION.*SHADOWS RISE/ });
  await expect(begin).toBeEnabled();
  await begin.click();
  await expect(page.getByLabel('Expedition status')).toContainText('T1 · R1');
});

test('direct /judge entry lands on actionable Judge Setup without scrolling', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/judge');
  await expect(page).toHaveURL(/\/judge$/);
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Judge Demo progress' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('Choice first.');
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('No replacement.');
  await expect(page.getByRole('region', { name: 'Plain-language proof summary' })).toContainText('Independent result.');

  const lockButton = page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' });
  await expect(page.getByRole('button', { name: /GOLD AWAKENS/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /SHADOWS RISE/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(lockButton).toBeVisible();
  expect(await lockButton.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await lockButton.click();
  await expect(page.getByLabel('Judge Demo progress').locator('span').filter({ hasText: 'DEFEAT GUARD' })).toHaveClass(/active/);
});

test('full-run setup fetches the next market at the exact five-minute rollover', async ({ page }) => {
  const rolloverSeconds = Math.floor(Date.now() / 1_000) + 3;
  const expiringMarket = {
    ...market,
    marketId: `0x${'aa'.repeat(32)}`,
    expiry: String(rolloverSeconds),
    expiryIso: new Date(rolloverSeconds * 1_000).toISOString(),
    status: 'Active',
    finalized: false,
    winningOutcome: undefined,
  };
  const freshMarket = {
    ...expiringMarket,
    marketId: `0x${'bb'.repeat(32)}`,
    expiry: String(rolloverSeconds + 300),
    expiryIso: new Date((rolloverSeconds + 300) * 1_000).toISOString(),
  };
  const marketRequestTimes: number[] = [];
  await page.route('**/api/market**', async (route) => {
    const requestTime = Date.now();
    marketRequestTimes.push(requestTime);
    await route.fulfill({
      json: { market: requestTime < rolloverSeconds * 1_000 ? expiringMarket : freshMarket, odds: null },
    });
  });

  await page.goto('/');
  await expectOptimizedImageLoaded(page.getByAltText('Miss Morgue, Kevin the Unqualified and Brutus assembled in the dungeon'));
  await expect(page.getByText('TIER 1 PREDICTION · MARKET #AAAA')).toBeVisible();
  await expect(page.getByText('TIER 1 PREDICTION · MARKET #BBBB')).toBeVisible({ timeout: 6_000 });
  expect(marketRequestTimes.some((time) => (
    time >= rolloverSeconds * 1_000 && time < rolloverSeconds * 1_000 + 1_000
  ))).toBe(true);
  await expect(page.getByRole('button', { name: /BEGIN FULL EXPEDITION/ })).toBeEnabled();
});

test('privacy, asset provenance, AI disclosure, and music credits are reachable from the game', async ({ page }) => {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'PRIVACY · CREDITS · AI DISCLOSURE' }).click();
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

  const documentResponse = await page.goto('/');
  expect(documentResponse?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(documentResponse?.headers()['x-content-type-options']).toBe('nosniff');
  await page.getByRole('button', { name: /2-MIN JUDGE DEMO/ }).click();
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).click();
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await expectOptimizedImageLoaded(page.locator('.monster-stage img'));

  const guardStep = page.getByLabel('Judge Demo progress').locator('span').filter({ hasText: 'DEFEAT GUARD' });
  await expect(guardStep).toHaveClass(/active/);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.getByRole('heading', { name: 'The final boss gate is open.' })).toBeVisible();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expectOptimizedImageLoaded(page.locator('.monster-stage img'));
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();

  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(reveal).toBeEnabled();
  await reveal.click();

  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  const plainProof = page.getByRole('region', { name: 'Plain-language proof summary' });
  await expect(plainProof).toContainText('was locked before market selection');
  await expect(plainProof).toContainText('could not be replaced');
  await expect(plainProof).toContainText('independently reproduced the onchain result');
  await expect(page.getByText('✓ COMBAT + COMMITMENT + INDEPENDENT RPC VERIFIED')).toBeVisible();
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();
  await expect(page.getByText('BROWSER RPC REFETCH + ABI + DIGESTS VERIFIED')).toBeVisible();
  await expect(page.getByAltText('Market Dungeon share card: room 40 of 40')).toBeVisible();
  await expect(page.getByText('ROOM 40/40 · 2 ENEMIES DEFEATED')).toBeVisible();
  const xShare = page.getByRole('link', { name: 'SHARE ON X ↗' });
  await expect(xShare).toHaveAttribute('href', /https:\/\/twitter\.com\/intent\/tweet\?/);
  const xShareUrl = new URL(await xShare.getAttribute('href') ?? '');
  expect(xShareUrl.searchParams.get('text')).toContain('Reached room 40/40 · 2 enemies defeated');
  expect(xShareUrl.searchParams.get('url')).toBe('https://market-dungeon.vercel.app');

  const proofLinks = page.locator('.proof-revealed a');
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
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { throw new DOMException('Native sharing unavailable', 'NotAllowedError'); },
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
  const [cardDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '↗ SHARE RESULT' }).click(),
  ]);
  expect(cardDownload.suggestedFilename()).toBe('market-dungeon-run-12121212.png');
  await expect(page.getByText('SHARING UNAVAILABLE · CARD DOWNLOADED + POST TEXT COPIED')).toBeVisible();
  const copiedPost = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(copiedPost).toContain('I conquered Market Dungeon');
  expect(copiedPost).toContain('Reached room 40/40 · 2 enemies defeated');
  expect(copiedPost).toContain('Onchain-verified on Somnia');
  expect(copiedPost).toContain('https://market-dungeon.vercel.app');
  expect(() => JSON.parse(copiedPost as string)).toThrow();

  await page.getByRole('button', { name: 'COPY PROOF JSON' }).click();
  await expect(page.getByText('PORTABLE PROOF JSON COPIED')).toBeVisible();
  const copiedProof = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(JSON.parse(copiedProof as string)).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v1',
    summary: { result: 'BLESSED', lockedDirection: 'UP', winningOutcome: 'UP' },
  });
  expect(runtimeErrors).toEqual([]);
});
