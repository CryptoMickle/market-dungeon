import { expect, test } from '@playwright/test';
import { playJudgeGuard, playJudgeBoss } from './judge-play';

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
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await expect(page.getByText('HISTORICAL JUDGE REPLAY · SHANNON TESTNET', { exact: true })).toBeVisible();
  const expectReplayNavigation = async (setup = false) => {
    await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
    const home = page.getByRole('link', { name: 'Market Dungeon — back to home', exact: true })
      .or(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true })).filter({ visible: true });
    await expect(home).toBeVisible();
    const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
    if (!setup) { await expect(variants).toHaveCount(0); return; }
    await expect(home).toHaveAttribute('href', '/');
    await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
    await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/shannon/judge');
    await expect(variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('href', '/shannon/live-judge');
    await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
    for (const link of await variants.getByRole('link').all()) await expect(link).toBeInViewport({ ratio: 1 });
  };
  await expectReplayNavigation(true);
  await expect(page.locator('.judge-lock-context')).toContainText('NO LIVE PRICE FEED');
  await expect(page.locator('.judge-lock-context')).toContainText('the opening price is not supplied');
  await expect(page.getByText('REFERENCE UNAVAILABLE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('SEALED BTC 5-MIN REPLAY · 15M FALLBACK · SHANNON TESTNET')).toHaveCount(1);

  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  const expectShannonCombatFooter = async () => {
    const footer = page.locator('footer');
    for (const width of [820, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await expectReplayNavigation();
      await expect(footer).toBeVisible();
      await expect(footer).toContainText('SOMNIA SHANNON TESTNET');
      await expect(footer).toContainText('no wallet · no approval · no order submission');
      await expect(footer.getByRole('link', { name: 'VERIFY A PROOF' })).toHaveAttribute('href', '/shannon/verify');
      await expect(footer.getByRole('link', { name: 'PRIVACY · CREDITS · AI DISCLOSURE' })).toHaveAttribute('href', '/credits');
      const combatBox = (await page.getByRole('region', { name: 'Combat view' }).boundingBox())!;
      expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(combatBox.y + combatBox.height);
    }
    await page.setViewportSize({ width: 390, height: 664 });
    await expectReplayNavigation();
    await expect(footer).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
  };
  await expectShannonCombatFooter();
  await playJudgeGuard(page);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expectShannonCombatFooter();
  await page.screenshot({ path: info.outputPath('shannon-desktop-combat-footer.png'), fullPage: true });
  await playJudgeBoss(page);
  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(page.locator('.desktop-stage-header')).toContainText('Gold 80');
  await expect(reveal).toBeEnabled();
  for (const width of [820, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      await page.locator('.desktop-journey').focus();
      await page.keyboard.press(key);
      await expect(reveal).toBeFocused();
      await expect(reveal).toBeInViewport({ ratio: 1 });
    }
  }
  expect(revealCalls).toBe(0);
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown']) {
    await page.keyboard.press(key);
    expect(await page.locator('.oracle-dock').evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.locator('.desktop-journey').focus();
  await page.keyboard.press('ArrowDown');
  await expect(reveal).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  await expectReplayNavigation();
  await expect(page.locator('.result-hero > .muted')).toHaveText('You chose BTC UP. The market settled BTC UP. Your prediction was correct. The final boss stays down and its reward is secured.');
  const resultSummary = page.getByRole('region', { name: 'Choice, market result and boss fate' });
  await expect(resultSummary).toBeVisible();
  await expect(resultSummary).toHaveAttribute('data-outcome', 'BLESSED');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'YOUR CHOICE' }).locator('strong')).toHaveText('BTC UP');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'MARKET RESULT' }).locator('strong')).toHaveText('BTC UP');
  await expect(resultSummary.locator(':scope > div').filter({ hasText: 'BOSS FATE' }).locator('strong')).toHaveText('STAYS DOWN');
  await expect(resultSummary).toContainText('Recorded result verified');
  await expect(page.locator('.result-hero .judge-verification')).toContainText('Verified means this run matches the recorded market result. Both winning and losing runs can be verified.');
  await expect(page.locator('.final-stats > div').filter({ hasText: 'FINAL GOLD' }).locator('strong')).toHaveText('122');
  await expect(page.getByLabel('Post text — copy manually if needed')).toHaveValue(/2 of 2 replay encounters cleared · 122 gold/);
  await expect(page.locator('.dungeon-log')).toContainText('FINAL BOSS DEFEATED · +42 GOLD');
  await expect(page.locator('body')).not.toContainText('prediction gold');
  await page.locator('.proof-revealed summary').click();
  await expect(page.getByText('CHAIN 50312 · EIP-1898 HASH-PINNED · BOTH RAW ETH_CALL RESULTS MATCH')).toBeVisible();
  const continueOnDreamDex = page.getByRole('link', { name: /continue on dreamdex/i });
  await expect(continueOnDreamDex).toHaveAttribute('href', 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m');
  await expect(continueOnDreamDex).toHaveAttribute('target', '_blank');
  await expect(continueOnDreamDex).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.dreamdex-continue')).toContainText('your verified Shannon replay remains historical');
  for (const [width, height] of [[1280, 720], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await continueOnDreamDex.scrollIntoViewIfNeeded();
    await expect(continueOnDreamDex).toBeInViewport({ ratio: 1 });
    await expectReplayNavigation();
    for (const cell of await resultSummary.locator(':scope > div').all()) {
      const cellBox = (await cell.boundingBox())!;
      expect(cellBox.x).toBeGreaterThanOrEqual(0);
      expect(cellBox.x + cellBox.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width !== 320) await page.screenshot({ path: info.outputPath(`shannon-continue-dreamdex-${width}.png`), fullPage: true });
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

  await page.getByRole('button', { name: '↻ START NEW JUDGE DEMO' }).click();
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await page.goto('/shannon/judge?challenge=1');
  await expect(page).toHaveURL(/\/shannon\/judge\?challenge=1$/);
  await expect(page.getByRole('status', { name: 'Challenge invitation' })).toContainText('BOSS + MARKET CHALLENGE');

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
