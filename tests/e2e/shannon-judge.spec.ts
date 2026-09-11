import { expect, test } from '@playwright/test';
import { playJudgeGuard, playJudgeBoss, expectJudgeProgress, openJudgeProof } from './judge-play';

import { SHANNON_TESTNET_PROFILE, SOMNIA_MAINNET_PROFILE } from '../../app/judge-network';
import type { JudgeCombatAction } from '../../app/judge-combat';
import {
  BLOCK_HASH,
  BLOCK_TAG,
  SHANNON_LOCK_PUBLIC_KEY,
  SHANNON_SEAL,
  shannonOnchainSettlement,
  shannonRevealPayload,
  shannonStartPayload,
  VALID_ACTIONS,
} from './judge-demo-fixture';

test('Shannon Judge flow remains profile-bound through replay, sharing, reset, challenge, and verifier', async ({ page }, info) => {
  let startCalls = 0;
  let revealCalls = 0;
  let publicKeyCalls = 0;
  let shannonRpcCalls = 0;
  let forbiddenMainnetCalls = 0;

  await page.route('**/api/shannon/judge-replay/start', async (route) => {
    startCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: shannonStartPayload });
  });
  await page.route('**/api/shannon/judge-replay/public-key', async (route) => {
    publicKeyCalls += 1;
    await route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY });
  });
  await page.route('**/api/shannon/judge-replay/reveal', async (route) => {
    revealCalls += 1;
    const body = route.request().postDataJSON() as { seal: string; actions: JudgeCombatAction[] };
    expect(body.seal).toBe(SHANNON_SEAL);
    expect(body.actions).toEqual(VALID_ACTIONS);
    await route.fulfill({ json: shannonRevealPayload(body.actions) });
  });
  await page.route(SHANNON_TESTNET_PROFILE.rpc, async (route) => {
    shannonRpcCalls += 1;
    const body = route.request().postDataJSON() as { id: number; method: string; params: Array<{ to?: string }> };
    let result: unknown;
    if (body.method === 'eth_chainId') result = `0x${SHANNON_TESTNET_PROFILE.chainId.toString(16)}`;
    else if (body.method === 'eth_getBlockByHash') result = { number: BLOCK_TAG, hash: BLOCK_HASH };
    else if (body.method === 'eth_call') {
      result = body.params[0]?.to?.toLowerCase() === shannonOnchainSettlement.moduleAddress.toLowerCase()
        ? shannonOnchainSettlement.calls.moduleMarket.result
        : shannonOnchainSettlement.calls.settlementRecord.result;
    } else throw new Error(`Unexpected Shannon browser RPC method: ${body.method}`);
    await route.fulfill({
      json: { jsonrpc: '2.0', id: body.id, result },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route('**/api/judge-replay/**', async (route) => {
    forbiddenMainnetCalls += 1;
    await route.abort('failed');
  });
  await page.route('**/api/market**', async (route) => {
    forbiddenMainnetCalls += 1;
    await route.abort('failed');
  });
  await page.route(SOMNIA_MAINNET_PROFILE.rpc, async (route) => {
    forbiddenMainnetCalls += 1;
    await route.abort('failed');
  });

  await page.goto('/shannon/judge');
  await expect(page.getByText('HISTORICAL JUDGE DEMO', { exact: true })).toBeVisible();
  await expectJudgeProgress(page);
  const navigation = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  await expect(navigation.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
  await expect(navigation.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/shannon/judge');
  await expect(navigation.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('href', '/shannon/live-judge');
  await expect(page.getByLabel('Historical market context', { exact: true })).toContainText('NO LIVE PRICE FEED');
  await expect(page.getByLabel('Historical market context', { exact: true })).toContainText('opening price is not supplied');
  expect(forbiddenMainnetCalls).toBe(0);
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true }).click();
  const combat = page.getByRole('region', { name: 'Combat view', exact: true });
  await expect(combat).toContainText('GUARD 1/2');
  await expect(navigation).toHaveCount(0);
  await playJudgeGuard(page);
  await expectJudgeProgress(page, 3);
  await expect(page.getByRole('heading', { name: 'One boss to go.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recovery supplies', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  await expect(combat).toContainText('BOSS 2/2');
  await playJudgeBoss(page);
  await expectJudgeProgress(page, 4);
  const reveal = page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true });
  await expect(reveal).toBeEnabled();
  await expect(page.getByRole('button', { name: 'REST WITH KEVIN · FREE', exact: true })).toBeEnabled();
  expect(revealCalls).toBe(0);
  await expect(page.getByRole('region', { name: 'Portable run verification' })).toHaveCount(0);
  await reveal.click();
  const resultSummary = page.getByRole('region', { name: 'Choice, market result and boss fate', exact: true });
  await expect(resultSummary).toBeVisible();
  await expect(resultSummary).toHaveAttribute('data-outcome', 'BLESSED');
  await expect(resultSummary.locator(':scope > div')).toHaveCount(3);
  await expect(resultSummary.locator('strong')).toHaveText(['BTC UP', 'BTC UP', 'STAYS DOWN']);
  const stats = page.getByLabel('Final run statistics', { exact: true });
  await expect(stats.locator('dt')).toHaveText(['ENCOUNTERS CLEARED', 'FINAL GOLD', 'FINAL HEALTH', 'POTIONS LEFT']);
  await expect(stats.locator('div').filter({ hasText: 'FINAL GOLD' }).locator('dd')).toHaveText('122');
  await expect(page.getByRole('region', { name: 'Two victory conditions', exact: true }).or(page.getByLabel('Two victory conditions', { exact: true }))).toContainText('BTC prediction correct');
  await expect(page.getByLabel('Post text — copy manually if needed')).toHaveValue(/2 of 2 replay encounters cleared · 122 gold/);
  await expect(page.getByRole('region', { name: 'Dungeon log', exact: true })).toContainText('The final boss stays down and its reward is secured.');
  await expect(page.locator('body')).not.toContainText('prediction gold');
  const proof = await openJudgeProof(page);
  await expect(proof).toContainText('Both winning and losing runs can be verified.');
  await page.locator('.proof-revealed summary').click();
  await expect(page.getByText('CHAIN 50312 · EIP-1898 HASH-PINNED · BOTH RAW ETH_CALL RESULTS MATCH')).toBeVisible();
  const continueOnDreamDex = page.getByRole('link', { name: /continue on dreamdex/i });
  await expect(continueOnDreamDex).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
  await expect(continueOnDreamDex).toHaveAttribute('target', '_blank');
  await expect(continueOnDreamDex).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByLabel('Continue on dreamDEX', { exact: true })).toContainText('separate live mainnet market');
  for (const [width, height] of [[1280, 720], [375, 650], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await continueOnDreamDex.scrollIntoViewIfNeeded();
    await expect(continueOnDreamDex).toBeInViewport({ ratio: 1 });
    for (const cell of await resultSummary.locator(':scope > div').all()) {
      const bounds = (await cell.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width !== 320) await page.screenshot({ path: info.outputPath(`shannon-shared-result-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('link', { name: 'OPEN INDEPENDENT VERIFIER ↗' })).toHaveAttribute('href', '/shannon/verify');

  const explorerLinks = page.locator('.proof-revealed a');
  await expect(explorerLinks).toHaveCount(5);
  for (const link of await explorerLinks.all()) {
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/shannon-explorer\.somnia\.network\/(?:block|address)\//);
  }
  const xShare = page.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true });
  const xShareUrl = new URL(await xShare.getAttribute('href') ?? '');
  expect(xShareUrl.searchParams.get('url')).toBe('https://market-dungeon.vercel.app/shannon/judge?challenge=1');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { Reflect.set(globalThis, '__shannonProof', value); } },
    });
  });
  await page.getByRole('button', { name: 'COPY PROOF JSON' }).click();
  const proofJson = await page.evaluate(() => Reflect.get(globalThis, '__shannonProof')) as string;
  expect(JSON.parse(proofJson)).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v3',
    app: 'https://market-dungeon.vercel.app/shannon/judge',
    networkProfile: {
      profileId: SHANNON_TESTNET_PROFILE.id,
      chainId: SHANNON_TESTNET_PROFILE.chainId,
      collateral: SHANNON_TESTNET_PROFILE.collateral,
    },
    replayProof: { profileId: SHANNON_TESTNET_PROFILE.id, chainId: SHANNON_TESTNET_PROFILE.chainId },
    onchainProof: { chainId: SHANNON_TESTNET_PROFILE.chainId, collateralToken: SHANNON_TESTNET_PROFILE.collateral },
    independentRpcVerification: { rpc: SHANNON_TESTNET_PROFILE.rpc },
  });

  await page.getByRole('button', { name: 'START NEW REPLAY' }).click();
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await page.goto('/shannon/judge?challenge=1');
  await expect(page).toHaveURL(/\/shannon\/judge\?challenge=1$/);
  await expect(page.getByText('YOU’RE INVITED · MAKE YOUR OWN CALL', { exact: true })).toBeVisible();
  await expectJudgeProgress(page);
  await expect(page.getByRole('region', { name: 'Choice, market result and boss fate' })).toHaveCount(0);

  await page.goto('/shannon/verify');
  await expect(page.getByLabel('Verification privacy and safety')).toContainText(SHANNON_TESTNET_PROFILE.name);
  await page.getByLabel('OR PASTE PROOF JSON').fill(proofJson);
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();
  await expect(page.getByRole('region', { name: 'Proof verification result' }).locator('strong').first()).toHaveText('PASS');

  expect(startCalls).toBe(1);
  expect(revealCalls).toBe(1);
  expect(publicKeyCalls).toBe(2);
  expect(shannonRpcCalls).toBe(8);
  expect(forbiddenMainnetCalls).toBe(0);
});
