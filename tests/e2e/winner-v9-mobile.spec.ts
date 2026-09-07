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

test('Save card prepares a complete PNG before a gesture and does not open X', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await completeJudgeDemo(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      Reflect.set(window, '__sharedCard', {
        active: navigator.userActivation.isActive,
        keys: Object.keys(data), type: file?.type, size: file?.size,
        filename: file?.name,
        signature: file ? Array.from(new Uint8Array(await file.slice(0, 8).arrayBuffer())) : [],
      });
    } });
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  const pagesBefore = context.pages().length;
  await page.getByRole('button', { name: 'SAVE CARD', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save your run card' });
  await expect(dialog).toBeVisible();
  const image = dialog.getByAltText('Your complete run card, ready to save or share');
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight])).toEqual([1200, 675]);
  await page.getByRole('button', { name: '2 · SHARE / SAVE IMAGE' }).click();
  await expect(dialog.getByRole('status')).toContainText('no post is confirmed');
  const shared = await page.evaluate(() => Reflect.get(window, '__sharedCard'));
  expect(shared).toMatchObject({ active: true, keys: ['files'], type: 'image/png', filename: 'market-dungeon-run-12121212.png', signature: [137, 80, 78, 71, 13, 10, 26, 10] });
  expect(shared.size).toBeGreaterThan(20_000);
  expect(context.pages()).toHaveLength(pagesBefore);
  expect(downloads).toEqual([]);
  await expectNoHorizontalOverflow(page);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-share-dialog.png', fullPage: false });
  await page.getByRole('button', { name: 'Close sharing options' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'SAVE CARD', exact: true })).toBeFocused();
});

test('mobile Challenge, Share on X, and Save card perform three distinct actions', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await page.setViewportSize({ width: 390, height: 844 });
  // Intercept the new tab too: this tests navigation without contacting or posting to X.
  await context.route('https://twitter.com/intent/tweet**', (route) => route.fulfill({
    contentType: 'text/html', body: '<h1>Test X draft destination</h1>',
  }));
  await completeJudgeDemo(page);
  await page.evaluate(() => {
    Reflect.set(window, '__invitationShares', []);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      Reflect.get(window, '__invitationShares').push({ ...data, active: navigator.userActivation.isActive });
    } });
  });

  await page.getByRole('button', { name: '↗ CHALLENGE A PLAYER' }).click();
  await expect(page.locator('.run-share-status')).toContainText('Invitation handed to your share menu');
  const shares = await page.evaluate(() => Reflect.get(window, '__invitationShares'));
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({
    active: true, title: 'Can you beat my Market Dungeon run?',
    url: 'https://market-dungeon.vercel.app/judge?challenge=1',
  });
  expect(shares[0].text).toContain('2 of 2 replay encounters cleared');
  expect(shares[0].files).toBeUndefined();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(context.pages()).toHaveLength(1);

  const [xDraft] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'SHARE ON X ↗', exact: true }).click(),
  ]);
  await expect(xDraft.getByRole('heading', { name: 'Test X draft destination' })).toBeVisible();
  const url = new URL(xDraft.url());
  expect(url.origin + url.pathname).toBe('https://twitter.com/intent/tweet');
  expect(url.searchParams.get('text')).toContain('Can you beat my run?');
  expect(url.searchParams.get('url')).toBe('https://market-dungeon.vercel.app/judge?challenge=1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await xDraft.close();

  await page.getByRole('button', { name: 'SAVE CARD', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Save your run card' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__invitationShares'))).toHaveLength(1);
  expect(context.pages()).toHaveLength(1);
  await expectNoHorizontalOverflow(page);
});

test('Challenge invitation works without PNG or native sharing and has an honest manual fallback', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = (callback) => callback(null); });
  await completeJudgeDemo(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { Reflect.set(window, '__invitationClipboard', value); },
    } });
  });
  await page.getByRole('button', { name: '↗ CHALLENGE A PLAYER' }).click();
  await expect(page.locator('.run-share-status')).toContainText('Challenge invitation copied');
  expect(await page.evaluate(() => Reflect.get(window, '__invitationClipboard'))).toContain('https://market-dungeon.vercel.app/judge?challenge=1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Denied'); },
    } });
  });
  await page.getByRole('button', { name: '↗ CHALLENGE A PLAYER' }).click();
  await expect(page.getByLabel('Challenge invitation — copy manually')).toHaveValue(/Can you beat my run/);
  await expect(page.locator('.run-share-status')).toContainText('Copy is unavailable');
  expect(context.pages()).toHaveLength(1);
  await expectNoHorizontalOverflow(page);
});

test('cancelled native Challenge does not copy, download, open X, or open the card dialog', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await completeJudgeDemo(page);
  await page.evaluate(() => {
    Reflect.set(window, '__unexpectedCopies', 0);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { Reflect.set(window, '__unexpectedCopies', Reflect.get(window, '__unexpectedCopies') + 1); },
    } });
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: '↗ CHALLENGE A PLAYER' }).click();
  await expect(page.locator('.run-share-status')).toHaveText('Invitation sharing cancelled.');
  expect(await page.evaluate(() => Reflect.get(window, '__unexpectedCopies'))).toBe(0);
  expect(downloads).toEqual([]);
  expect(context.pages()).toHaveLength(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('cancelled native sharing does not download or open X and clipboard denial leaves selectable text', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await completeJudgeDemo(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'SAVE CARD', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: '2 · SHARE / SAVE IMAGE' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Sharing cancelled. Your card is still here.');
  await page.getByRole('button', { name: '1 · COPY CHALLENGE TEXT' }).click();
  await expect(dialog.getByRole('status')).toContainText('Select and copy');
  await expect(dialog.getByRole('textbox')).toHaveValue(/https:\/\/market-dungeon.vercel.app\/judge\?challenge=1/);
  expect(context.pages()).toHaveLength(1);
  expect(downloads).toEqual([]);
});

test('PNG preparation failure preserves text sharing without exporting an incomplete card', async ({ context, page }) => {
  await installDeterministicRoutes(context);
  await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = (callback) => callback(null); });
  await completeJudgeDemo(page);
  await page.getByRole('button', { name: 'SAVE CARD', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status')).toContainText('Image preparation failed');
  await expect(page.getByRole('button', { name: '2 · SHARE / SAVE IMAGE' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '1 · COPY CHALLENGE TEXT' })).toBeEnabled();
  await page.getByText('Attach the card manually in X', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'DOWNLOAD PNG TO FILES' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'OPEN X WITH TEXT ↗' })).toHaveAttribute('href', /intent\/tweet/);
});

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
      '.run-share-panel',
      '.portable-proof-panel',
      '.dreamdex-continue',
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
