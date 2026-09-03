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
  await expect(page.getByRole('button', { name: /BEGIN TIER 1/ })).toBeEnabled();
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
  await expect(page.getByText('✓ COMBAT + COMMITMENT + INDEPENDENT RPC VERIFIED')).toBeVisible();
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();
  await expect(page.getByText('BROWSER RPC REFETCH + ABI + DIGESTS VERIFIED')).toBeVisible();

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
  expect(runtimeErrors).toEqual([]);
});
