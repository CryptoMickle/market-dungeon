import { expect, test } from '@playwright/test';

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

test('Shannon Judge flow remains profile-bound through replay, sharing, reset, challenge, and verifier', async ({ page }) => {
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
  await expect(page.locator('.safety-line')).toContainText('SHANNON TESTNET');
  await expect(page.locator('.safety-line')).toContainText('HISTORICAL DREAMDEX REPLAY');
  await expect(page.getByText('SEALED BTC 5-MIN REPLAY · 15M FALLBACK · SHANNON TESTNET')).toHaveCount(1);

  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();

  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  await page.locator('.proof-revealed summary').click();
  await expect(page.getByText('CHAIN 50312 · EIP-1898 HASH-PINNED · BOTH RAW ETH_CALL RESULTS MATCH')).toBeVisible();
  await expect(page.getByRole('link', { name: /continue on dreamdex/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'OPEN INDEPENDENT VERIFIER ↗' })).toHaveAttribute('href', '/shannon/verify');

  const explorerLinks = page.locator('.proof-revealed a');
  await expect(explorerLinks).toHaveCount(5);
  for (const link of await explorerLinks.all()) {
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/shannon-explorer\.somnia\.network\/(?:block|address)\//);
  }
  await page.getByRole('button', { name: 'SHARE ON X ↗' }).click();
  await page.getByText('Attach the card manually in X', { exact: true }).click();
  const xShare = page.getByRole('link', { name: 'OPEN X WITH TEXT ↗' });
  const xShareUrl = new URL(await xShare.getAttribute('href') ?? '');
  expect(xShareUrl.searchParams.get('url')).toBe('https://market-dungeon.vercel.app/shannon/judge?challenge=1');
  await page.getByRole('button', { name: 'Close sharing options' }).click();

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

  await page.getByRole('button', { name: '↻ BEGIN NEW EXPEDITION' }).click();
  await expect(page).toHaveURL(/\/shannon\/judge$/);
  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await page.goto('/shannon/judge?challenge=1');
  await expect(page).toHaveURL(/\/shannon\/judge\?challenge=1$/);
  await expect(page.getByRole('status', { name: 'Challenge invitation' })).toContainText('CHALLENGE RECEIVED');

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
