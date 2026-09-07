import { expect, test, type Locator, type Page } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';
import { emptyGame } from '../../app/gameplay/delveworn-engine';
import { FULL_RUN_MARKET_PROOF_VERSION } from '../../app/gameplay/event-boss-engine';
import {
  FULL_RUN_STORAGE_KEY,
  serializeFullRunSession,
  type FullRunSession,
} from '../../app/gameplay/full-run-storage';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import {
  BLOCK_HASH,
  BLOCK_TAG,
  LOCK_PUBLIC_KEY,
  market,
  onchainSettlement,
  revealPayload,
  SEAL,
  startPayload,
  VALID_ACTIONS,
} from './judge-demo-fixture';

async function installDeterministicUpstreams(
  page: Page,
  options: {
    rpcUnavailable?: boolean;
    rpcFailuresBeforeSuccess?: number;
    tamperRevealField?: 'attestation' | 'algorithm' | 'ruleset' | 'finalHp' | 'void';
    onStartCall?: () => void;
    onRpcCall?: () => void;
  } = {},
) {
  let rpcFailuresRemaining = options.rpcFailuresBeforeSuccess ?? 0;
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/judge-replay/start', async (route) => {
    options.onStartCall?.();
    expect(route.request().postDataJSON()).toEqual({ direction: 'UP' });
    await route.fulfill({ json: startPayload });
  });
  await page.route('**/api/judge-replay/public-key', async (route) => {
    await route.fulfill({ json: LOCK_PUBLIC_KEY });
  });
  await page.route('**/api/judge-replay/reveal', async (route) => {
    const body = route.request().postDataJSON() as { seal: string; actions: JudgeCombatAction[] };
    expect(body.seal).toBe(SEAL);
    expect(body.actions).toEqual(VALID_ACTIONS);
    const payload = revealPayload(body.actions);
    if (options.tamperRevealField === 'attestation') {
      payload.lockAttestation = {
        ...payload.lockAttestation,
        signature: `${payload.lockAttestation.signature[0] === 'A' ? 'B' : 'A'}${payload.lockAttestation.signature.slice(1)}`,
      };
    } else if (options.tamperRevealField === 'algorithm') {
      payload.replayProof.algorithm = 'SHA-512';
    } else if (options.tamperRevealField === 'ruleset') {
      payload.combatProof.ruleset = 'market-dungeon/judge-combat/v2';
    } else if (options.tamperRevealField === 'finalHp') {
      payload.combatProof.finalHp += 1;
    } else if (options.tamperRevealField === 'void') {
      const unexpectedVoid = payload.market as unknown as { voided: boolean; winningOutcome: number | null };
      unexpectedVoid.voided = true;
      unexpectedVoid.winningOutcome = null;
    }
    await route.fulfill({ json: payload });
  });
  await page.route(SOMNIA_MAINNET_RPC, async (route) => {
    options.onRpcCall?.();
    if (options.rpcUnavailable || rpcFailuresRemaining > 0) {
      rpcFailuresRemaining -= 1;
      await route.abort('failed');
      return;
    }
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

test('homepage leads with the restored full expedition and keeps the Judge walkthrough one action away', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Forty rooms. Four bosses. One market curse at a time.' })).toBeVisible();
  const fullRunButton = page.getByRole('button', { name: 'ENTER THE DUNGEON' });
  await expect(fullRunButton).toBeVisible();
  await expect(fullRunButton).toBeEnabled();
  await expect(page.getByRole('link', { name: /JUDGES: OPEN THE 2-MINUTE PROOF WALKTHROUGH/ })).toHaveAttribute('href', '/judge');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('/judge prerenders its primary Judge action before client hydration', async ({ request }) => {
  const judgeResponse = await request.get('/judge');
  expect(judgeResponse.ok()).toBe(true);
  const judgeHtml = await judgeResponse.text();
  expect(judgeHtml).toContain('LOCK OMEN &amp; SEAL REPLAY');
  expect(judgeHtml).not.toContain('PREPARING MARKET DUNGEON');
});

test('mobile Full Expedition starts cleanly and restores exact combat state after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await expect(page.getByRole('region', { name: 'Tier progress' })).toBeVisible();
  await expect(page.getByText('T1 · 0/40')).toBeVisible();
  const enemyHp = page.locator('[class*="enemyBar"] b');
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const hpAfterAttack = await enemyHp.innerText();
  expect(hpAfterAttack).not.toBe('60/60');
  await page.reload();
  await expect(page.getByText(hpAfterAttack, { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 390, content: 390 });
});

test('completed full expedition restores with an honest mobile run card', async ({ page }) => {
  const marketIds = [1, 2, 3, 4].map((value) => `0x${value.toString(16).padStart(64, '0')}`);
  const commitments = [1, 2, 3, 4].map((value) => `0x${(value + 10).toString(16).padStart(64, '0')}`);
  const settlements = marketIds.map((marketId, index) => ({
    attemptId: `attempt_${index + 1}`,
    marketId,
    direction: index % 2 === 0 ? 'UP' as const : 'DOWN' as const,
    proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
    commitment: commitments[index],
    outcome: 'BLESSED' as const,
  }));
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v1',
    replay: null,
    run: {
      schema: 'market-dungeon/full-run/v2',
      game: {
        ...emptyGame(),
        hasStarted: true,
        active: true,
        roomsCleared: 40,
        monsterHp: 0,
        monsterMaxHp: 230,
        gold: 123,
      },
      phase: 'complete',
      attemptNumber: 4,
      rematchRequired: false,
      currentAttempt: null,
      pendingBossReward: null,
      usedMarketIds: marketIds,
      usedCommitments: commitments,
      resolvedAttemptIds: settlements.map((settlement) => settlement.attemptId),
      settlements,
    },
  };
  const serialized = serializeFullRunSession(session);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY,
    value: serialized,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Every boss stayed down.' })).toBeVisible();
  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(share).toContainText('ROOM 40/40 · 40 ENEMIES DEFEATED');
  await expect(share).toContainText('The card itself is not portable proof.');
  await expect(share.getByRole('img')).toHaveAttribute('alt', 'Market Dungeon share card: room 40 of 40');
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 390, content: 390 });
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

test('locked Judge view shows receipt evidence in a 1280x720 frame without revealing the market', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();

  const receipt = page.getByRole('region', { name: 'Server-authenticated lock receipt' });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('SERVER-AUTHENTICATED LOCK RECEIPT');
  await expect(receipt).toContainText('✓ VERIFIED IN THIS BROWSER');
  await expect(receipt).toContainText('Ed25519');
  await expect(receipt).toContainText('KEY ID · SHA-256 FINGERPRINT');
  await expect(receipt).toContainText(`ed25519:${LOCK_PUBLIC_KEY.keyId.slice(8, 16)}…${LOCK_PUBLIC_KEY.keyId.slice(-8)}`);
  await expect(receipt).toContainText('BTC UP');
  await expect(receipt).toContainText('LOCK 1970-01-01 00:08:20Z');
  await expect(receipt).toContainText('REVEAL FROM 1970-01-01 00:08:21Z');
  await expect(receipt).toContainText('EXPIRES 1970-01-01 01:23:20Z');
  await expect(receipt).toContainText('Not an external timestamp or endorsement');
  await expect(receipt).not.toContainText(market.marketId);
  await expect(receipt).not.toContainText(market.strikeUsd);
  const bounds = await receipt.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);

  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(receipt).toBeVisible();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await expect(receipt).toBeVisible();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(receipt).toBeVisible();

  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(receipt).toHaveCount(0);
});

test('challenge link opens a fresh Judge replay without exposing the prior run', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/judge?challenge=1');
  await expect(page).toHaveURL(/\/judge\?challenge=1$/);
  const invitation = page.getByRole('status', { name: 'Challenge invitation' });
  await expect(invitation).toContainText('CHALLENGE RECEIVED');
  await expect(invitation).toContainText('fresh, separately sealed Judge replay');
  await expect(invitation).toContainText('market and outcome are not reused');
  await expect(page.getByText(/0x[a-f0-9]{64}/i)).toHaveCount(0);

  const lockButton = page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' });
  await expect(lockButton).toBeVisible();
  expect(await lockButton.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('Judge Demo rejects a malformed or direction-swapped start response before locking', async ({ page }) => {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.route('**/api/judge-replay/start', async (route) => {
    await route.fulfill({
      json: {
        replay: {
          ...startPayload.replay,
          lockedDirection: 'DOWN',
        },
      },
    });
  });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();

  await expect(page.getByRole('heading', { name: 'Lock your omen before the replay is drawn.' })).toBeVisible();
  await expect(page.getByText('SEALED REPLAY UNAVAILABLE · YOUR OMEN WAS NOT LOCKED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' })).toBeEnabled();
});

test('full-run entry does not fetch or expose a market before a boss gate', async ({ page }) => {
  let marketRequests = 0;
  await page.route('**/api/market**', async (route) => {
    marketRequests += 1;
    await route.fulfill({ json: { market, odds: null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE DUNGEON' }).click();
  await expect(page.getByText('Room 1 opens. Survive forty rooms and four sealed boss fates.')).toBeVisible();
  expect(marketRequests).toBe(0);
});

test('full-run boss gate carries CURSED resources into a new market and releases one BLESSED relic', async ({ page }) => {
  const markets = [1, 2].map((value) => `0x${value.toString(16).padStart(64, '0')}`);
  const commitments = [1, 2].map((value) => `0x${(value + 20).toString(16).padStart(64, '0')}`);
  const seals = [
    `v2.${'A'.repeat(16)}.${'B'.repeat(43)}.${'C'.repeat(22)}`,
    `v2.${'D'.repeat(16)}.${'E'.repeat(43)}.${'F'.repeat(22)}`,
  ];
  const session: FullRunSession = {
    schema: 'market-dungeon/full-run-session/v1',
    replay: null,
    run: {
      schema: 'market-dungeon/full-run/v2',
      game: {
        ...emptyGame(),
        hasStarted: true,
        active: true,
        hp: 100,
        maxHp: 100,
        baseMaxHp: 100,
        weaponLevel: 100,
        roomsCleared: 9,
        monsterHp: 0,
        monsterMaxHp: 0,
      },
      phase: 'boss-lock-required',
      attemptNumber: 0,
      rematchRequired: false,
      currentAttempt: null,
      pendingBossReward: null,
      usedMarketIds: [],
      usedCommitments: [],
      resolvedAttemptIds: [],
      settlements: [],
    },
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY,
    value: serializeFullRunSession(session),
  });
  let startCount = 0;
  await page.route('**/api/full-run/replay/start', async (route) => {
    const body = route.request().postDataJSON() as { direction: 'UP' | 'DOWN'; excludeMarketIds: string[] };
    expect(body).toEqual({
      direction: startCount === 0 ? 'UP' : 'DOWN',
      excludeMarketIds: startCount === 0 ? [] : [markets[0]],
    });
    const index = startCount++;
    const now = Math.floor(Date.now() / 1_000);
    await route.fulfill({ json: { replay: {
      seal: seals[index],
      commitment: commitments[index],
      lockedDirection: body.direction,
      revealAfter: now - 1,
      expiresAt: now + 1_800,
    } } });
  });
  let revealCount = 0;
  await page.route('**/api/full-run/replay/reveal', async (route) => {
    const index = revealCount++;
    expect(route.request().postDataJSON()).toEqual({ seal: seals[index] });
    await route.fulfill({ json: { settlement: {
      proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
      commitment: commitments[index],
      marketId: markets[index],
      direction: index === 0 ? 'UP' : 'DOWN',
      outcome: index === 0 ? 'CURSED' : 'BLESSED',
    } } });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lock your omen before entering.' })).toBeVisible();
  await page.getByRole('button', { name: 'LOCK BTC UP · OPEN BOSS GATE' }).click();
  await expect(page.getByRole('heading', { name: 'Tier 1 Dungeon Lord' })).toBeVisible();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: 'REVEAL BOSS FATE' }).click();

  await expect(page.getByRole('heading', { name: 'The boss has returned at full HP.' })).toBeVisible();
  await expect(page.getByText('❤️ 100/100')).toBeVisible();
  await expect(page.getByText('CAMP BEFORE THE BOSS')).toHaveCount(0);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · OPEN BOSS GATE' }).click();
  await expect(page.getByText('122/122')).toBeVisible();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: 'REVEAL BOSS FATE' }).click();

  await expect(page.getByText(/BOSS RELIC/)).toBeVisible();
  await page.getByRole('button', { name: 'CLAIM & EQUIP' }).click();
  await expect(page.getByRole('heading', { name: /Loot secured|The path ahead is open/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ENTER ROOM 11' })).toBeVisible();
  expect(startCount).toBe(2);
  expect(revealCount).toBe(2);
});

test('privacy, asset provenance, AI disclosure, and music credits are reachable from the game', async ({ page }) => {
  await page.route('**/api/market**', async (route) => {
    await route.fulfill({ json: { market, odds: null } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'PRIVACY · CREDITS' }).click();
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

  const documentResponse = await page.goto('/judge');
  expect(documentResponse?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(documentResponse?.headers()['x-content-type-options']).toBe('nosniff');
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
  await expect(plainProof).toContainText('could not be changed');
  await expect(plainProof).toContainText('independently reproduced the onchain result');
  await expect(page.getByText('✓ COMBAT + CHOICE LOCK + SOMNIA RESULT VERIFIED')).toBeVisible();
  const revealedProof = page.locator('.proof-revealed');
  await expect(revealedProof).not.toHaveAttribute('open', '');
  await revealedProof.locator('summary').click();
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();
  await expect(page.getByText('BROWSER RPC REFETCH + ABI + DIGESTS VERIFIED')).toBeVisible();
  await expect(page.getByAltText('Market Dungeon Judge Replay share card: 2 of 2 replay encounters')).toBeVisible();
  await expect(page.getByText('FINAL-TIER JUDGE REPLAY · 2/2 REPLAY ENCOUNTERS')).toBeVisible();
  const xShare = page.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true });
  await expect(xShare).toHaveAttribute('href', /https:\/\/twitter\.com\/intent\/tweet\?/);
  const xShareUrl = new URL(await xShare.getAttribute('href') ?? '');
  expect(xShareUrl.searchParams.get('text')).toContain('2 of 2 replay encounters cleared');
  expect(xShareUrl.searchParams.get('text')).toContain('Can you beat my run?');
  expect(xShareUrl.searchParams.get('url')).toBe('https://market-dungeon.vercel.app/judge?challenge=1');
  await expect(page.getByRole('link', { name: 'OPEN INDEPENDENT VERIFIER ↗' })).toHaveAttribute('href', '/verify');

  const proofLinks = revealedProof.locator('a');
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
  await page.getByRole('button', { name: '1 · SAVE IMAGE', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not open the image menu');
  await page.getByText('More options', { exact: true }).click();
  const [cardDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'DOWNLOAD PNG TO FILES' }).click(),
  ]);
  expect(cardDownload.suggestedFilename()).toBe('market-dungeon-run-12121212.png');
  await expect(page.getByRole('status')).toContainText('does not save to Photos');
  await page.getByRole('button', { name: 'COPY POST TEXT' }).click();
  const copiedPost = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(copiedPost).toContain("I beat Market Dungeon's final-tier Judge Replay");
  expect(copiedPost).toContain('2 of 2 replay encounters cleared');
  expect(copiedPost).toContain('Onchain-verified on Somnia');
  expect(copiedPost).toContain('Can you beat my run?');
  expect(copiedPost).toContain('https://market-dungeon.vercel.app/judge?challenge=1');
  expect(() => JSON.parse(copiedPost as string)).toThrow();
  await page.getByRole('button', { name: 'COPY PROOF JSON' }).click();
  await expect(page.getByText('PORTABLE PROOF JSON COPIED')).toBeVisible();
  const copiedProof = await page.evaluate(() => Reflect.get(globalThis, '__marketDungeonClipboard'));
  expect(JSON.parse(copiedProof as string)).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v2',
    summary: { result: 'BLESSED', lockedDirection: 'UP', winningOutcome: 'UP' },
  });
  expect(runtimeErrors).toEqual([]);
});

test('terminal proof shows both exact eth_call results without a sticky action dock overlap at 1280x720', async ({ page }) => {
  await installDeterministicUpstreams(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();

  const proof = page.locator('.proof-revealed');
  await proof.locator('summary').click();
  const moduleResult = proof.getByRole('group', { name: 'MARKETS market ID eth_call raw result' });
  const settlementResult = proof.getByRole('group', { name: 'getSettlement market key eth_call raw result' });
  const exactResults = [
    [moduleResult, onchainSettlement.calls.moduleMarket.result],
    [settlementResult, onchainSettlement.calls.settlementRecord.result],
  ] as const;

  for (const [group, expectedResult] of exactResults) {
    await group.scrollIntoViewIfNeeded();
    await expect(group).toBeVisible();
    const code = group.locator('code');
    await expect(code).toHaveText(expectedResult);
    const rendering = await code.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        visibility: style.visibility,
        whiteSpace: style.whiteSpace,
      };
    });
    expect(rendering.clientHeight).toBeGreaterThan(0);
    expect(rendering.scrollHeight).toBeLessThanOrEqual(rendering.clientHeight + 1);
    expect(rendering.overflow).not.toBe('hidden');
    expect(rendering.textOverflow).not.toBe('ellipsis');
    expect(rendering.visibility).toBe('visible');
    expect(rendering.whiteSpace).toBe('pre-wrap');
  }

  const terminalDock = page.locator('.action-dock-terminal');
  await expect(terminalDock).toContainText('BEGIN NEW EXPEDITION');
  await expect(terminalDock).toHaveCSS('position', 'static');
  for (const [group] of exactResults) {
    await group.scrollIntoViewIfNeeded();
    const overlapsDock = await group.evaluate((proofRow, dock) => {
      const proofBox = proofRow.getBoundingClientRect();
      const dockBox = (dock as Element).getBoundingClientRect();
      return proofBox.left < dockBox.right
        && proofBox.right > dockBox.left
        && proofBox.top < dockBox.bottom
        && proofBox.bottom > dockBox.top;
    }, await terminalDock.elementHandle());
    expect(overlapsDock).toBe(false);
  }
});

test('temporary browser RPC unavailability preserves the completed sealed run for retry', async ({ page }) => {
  let startCalls = 0;
  await installDeterministicUpstreams(page, {
    rpcFailuresBeforeSuccess: 1,
    onStartCall: () => { startCalls += 1; },
  });
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();

  const reveal = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await reveal.click();

  await expect(page.getByText(/Somnia RPC could not reproduce the proof during this attempt/)).toBeVisible();
  await expect(page.getByText(/JUDGE DEMO COMPLETE/)).toHaveCount(0);
  await expect(page.getByText(/REPLAY PROOF MISMATCH/)).toHaveCount(0);
  await expect(reveal).toBeEnabled();

  await reveal.click();
  await expect(page.getByText('JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED · BLESSED')).toBeVisible();
  expect(startCalls).toBe(1);
});

for (const tamperRevealField of ['attestation', 'algorithm', 'ruleset', 'finalHp', 'void'] as const) {
  test(`Judge Demo rejects changed reveal ${tamperRevealField} locally before any Somnia RPC call`, async ({ page }) => {
    let rpcCalls = 0;
    await installDeterministicUpstreams(page, {
      rpcUnavailable: true,
      tamperRevealField,
      onRpcCall: () => { rpcCalls += 1; },
    });
    await page.goto('/judge');
    await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
    await page.getByRole('button', { name: /ATTACK/ }).click();
    await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
    await page.getByRole('button', { name: /ATTACK/ }).click();
    await page.getByRole('button', { name: /ATTACK/ }).click();

    await page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' }).click();

    await expect(page.getByText('REPLAY PROOF MISMATCH · LOCK A NEW OMEN')).toBeVisible();
    await expect(page.getByText(/Somnia RPC could not reproduce/)).toHaveCount(0);
    expect(rpcCalls).toBe(0);
  });
}
