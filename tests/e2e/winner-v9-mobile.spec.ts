import { readFile } from 'node:fs/promises';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import type { ReplayCombatProof, ReplayProof } from '../../app/replay-proof';
import { verifiedRunProofJson, type VerifiedRunProofInput } from '../../app/share-verified-run';
import {
  BLOCK_HASH,
  BLOCK_TAG,
  LOCK_ATTESTATION,
  LOCK_PUBLIC_KEY,
  market,
  onchainSettlement,
  revealPayload,
  SEAL,
  startPayload,
  VALID_ACTIONS,
} from './judge-demo-fixture';

type RouteState = {
  publicKeyAvailable: boolean;
};

function exportedProof() {
  const reveal = revealPayload(VALID_ACTIONS);
  const input: VerifiedRunProofInput = {
    result: 'BLESSED',
    intervalSec: 300,
    replayProof: reveal.replayProof as ReplayProof,
    combatProof: reveal.combatProof as ReplayCombatProof,
    combatActions: VALID_ACTIONS,
    onchainSettlement: reveal.onchainSettlement,
    lockAttestation: LOCK_ATTESTATION,
  };
  return verifiedRunProofJson(input, '2026-09-04T08:00:00.000Z');
}

async function installDeterministicRoutes(
  context: BrowserContext,
  state: RouteState = { publicKeyAvailable: true },
) {
  await context.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await context.route('**/api/judge-replay/start', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: startPayload });
  });
  await context.route('**/api/judge-replay/public-key', async (route) => {
    if (!state.publicKeyAvailable) {
      await route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } });
      return;
    }
    await route.fulfill({ json: LOCK_PUBLIC_KEY });
  });
  await context.route('**/api/judge-replay/reveal', async (route) => {
    const body = route.request().postDataJSON() as { seal: string; actions: JudgeCombatAction[] };
    expect(body.seal).toBe(SEAL);
    expect(body.actions).toEqual(VALID_ACTIONS);
    await route.fulfill({ json: revealPayload(body.actions) });
  });
  await context.route(SOMNIA_MAINNET_RPC, async (route) => {
    const body = route.request().postDataJSON() as { method: string; params: Array<{ to?: string }> };
    let result: unknown;
    if (body.method === 'eth_chainId') result = '0x13a7';
    else if (body.method === 'eth_getBlockByHash') result = { number: BLOCK_TAG, hash: BLOCK_HASH };
    else if (body.method === 'eth_call') {
      result = body.params[0]?.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
        ? onchainSettlement.calls.moduleMarket.result
        : onchainSettlement.calls.settlementRecord.result;
    } else {
      throw new Error(`Unexpected browser RPC method: ${body.method}`);
    }
    await route.fulfill({
      json: { jsonrpc: '2.0', id: 1, result },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function completeJudgeDemo(page: Page) {
  await page.goto('/judge?automation=1');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 390, content: 390 });
}

test('completed mobile Judge result is truthful, ordered, and portable into the verifier', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await completeJudgeDemo(page);

  await expect.poll(async () => {
    const box = await page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED').boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= 844);
  }).toBe(true);

  const portableProof = page.getByRole('region', { name: 'Portable run verification' });
  const dreamDex = page.locator('.dreamdex-continue');
  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  const rawProof = page.locator('.proof-revealed');

  await expect(portableProof).toBeVisible();
  await expect(dreamDex).toBeVisible();
  await expect(share).toContainText('FINAL-TIER JUDGE REPLAY · 2/2 REPLAY ENCOUNTERS');
  await expect(share).not.toContainText(/ROOM 40\/40|DUNGEON CONQUERED/);
  await expect(page.getByAltText('Market Dungeon Judge Replay share card: 2 of 2 replay encounters')).toBeVisible();
  await expect(rawProof).not.toHaveAttribute('open', '');

  expect(await page.evaluate(() => {
    const selectors = [
      '.portable-proof-panel',
      '.dreamdex-continue',
      '.run-share-panel',
      '.proof-revealed',
    ];
    const nodes = selectors.map((selector) => document.querySelector(selector));
    return nodes.every(Boolean) && nodes.slice(0, -1).every((node, index) => (
      Boolean(node!.compareDocumentPosition(nodes[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING)
    ));
  })).toBe(true);

  const verifierLink = page.getByRole('link', { name: '2 · OPEN INDEPENDENT VERIFIER ↗' });
  await expect(verifierLink).toHaveAttribute('target', '_blank');
  await expect(verifierLink).toHaveAttribute('rel', /noopener/);
  await expect(verifierLink).toHaveAttribute('rel', /noreferrer/);
  await expectNoHorizontalOverflow(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '1 · DOWNLOAD PROOF JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('market-dungeon-proof-12121212.json');
  const proofPath = await download.path();
  expect(proofPath).not.toBeNull();
  const downloadedProof = JSON.parse(await readFile(proofPath!, 'utf8')) as {
    schema?: string;
    lockAttestation?: { algorithm?: string };
  };
  expect(downloadedProof).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v2',
    lockAttestation: { algorithm: 'Ed25519' },
  });

  const [verifierPage] = await Promise.all([
    context.waitForEvent('page'),
    verifierLink.click(),
  ]);
  await verifierPage.waitForLoadState('domcontentloaded');
  await verifierPage.setViewportSize({ width: 390, height: 844 });
  const fileInput = verifierPage.locator('input[type="file"]');
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(proofPath!),
  });
  const verifyButton = verifierPage.getByRole('button', { name: 'VERIFY PROOF' });
  await expect(verifyButton).toBeEnabled();
  await verifyButton.click();
  const result = verifierPage.getByRole('region', { name: 'Proof verification result' });
  await expect(result.locator('strong').first()).toHaveText('PASS');
  await expectNoHorizontalOverflow(verifierPage);
});

test('mobile verifier keeps empty input disabled and recovers from a temporary key failure without reloading the proof', async ({ context, page }) => {
  const state = { publicKeyAvailable: false };
  await installDeterministicRoutes(context, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/verify');

  const verify = page.getByRole('button', { name: 'VERIFY PROOF' });
  await expect(verify).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const proof = exportedProof();
  const input = page.getByLabel('OR PASTE PROOF JSON');
  await input.fill(proof);
  await verify.click();
  const result = page.getByRole('region', { name: 'Proof verification result' });
  await expect(result.locator('strong').first()).toHaveText('NOT PROVABLE');
  await expect(result.locator('article').filter({ hasText: 'Server lock receipt' })).toContainText('NOT PROVABLE');
  await expect(result.locator('article').filter({ hasText: 'Live Somnia re-fetch' })).toContainText('PASS');
  await expect(result.locator('details')).not.toHaveAttribute('open', '');
  await expectNoHorizontalOverflow(page);

  state.publicKeyAvailable = true;
  await verify.click();
  await expect(result.locator('strong').first()).toHaveText('PASS');
  await expect(result.getByText('Server lock receipt', { exact: true })).toBeVisible();
  await expect(result.getByText('Live Somnia re-fetch', { exact: true })).toBeVisible();
  await expect(input).toHaveValue(proof);
  await expectNoHorizontalOverflow(page);
});
