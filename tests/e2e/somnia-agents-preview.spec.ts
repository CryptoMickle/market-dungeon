import type { Page } from '@playwright/test';
import { expect, test } from './agents-test';
import { encodeFunctionData, toHex, zeroAddress } from 'viem';
import { buildKevinPayload, SOMNIA_AGENTS_ABI, SOMNIA_AGENTS_TESTNET, type MarketSnapshot } from '../../lib/somnia-agents/protocol';
import type { RivalRound, RivalTransaction } from '../../lib/somnia-agents/types';

// These are browser transport fixtures, not signed tickets or network proofs.
// Real ticket authentication and onchain verification are tested separately.
const NOW = 1_789_090_000;
const RIVAL_KEY = 'market-dungeon/local-kevin-rival/v1';
const RUN_KEY = 'market-dungeon/local-agents/full-run/v1';
const WALLET_CALLS = 'market-dungeon/qa-preview-wallet-calls';
const WALLET_CONTROL = '__marketDungeonControlledWallet';
const TICKET_A = 'krp1.controlled_fixture_nonce.controlled_fixture_ciphertext.controlled_fixture_tag';
const TICKET_B = 'krp1.rotated_fixture_nonce.rotated_fixture_ciphertext.rotated_fixture_tag';
const TX_HASH = `0x${'36'.repeat(32)}`;
const marketId = `0x${'7a'.repeat(32)}`;
const market = {
  marketId, intervalSec: 300, question: 'CONTROLLED BROWSER FIXTURE: BTC closes at or above its opening price',
  strikeUsd: '78000.00', tradingStart: NOW - 10, expiry: NOW + 290, status: 'Trading', finalized: false,
};
const snapshot: MarketSnapshot = {
  marketId, marketChainId: 5031, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd,
  tradingStart: market.tradingStart, expiry: market.expiry, snapshotAt: NOW, cutoff: market.expiry - 10,
};
const payload = buildKevinPayload(snapshot);
const transaction: RivalTransaction = {
  chainId: 50312, to: SOMNIA_AGENTS_TESTNET.platform,
  data: encodeFunctionData({ abi: SOMNIA_AGENTS_ABI, functionName: 'createRequest', args: [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x00000000', payload] }),
  value: toHex(300_000_000_000_000_000n), depositStt: '0.3', agentId: SOMNIA_AGENTS_TESTNET.llmAgentId, payload,
};

const status = (page: Page) => page.getByRole('button', { name: /^Somnia Agent Kevin:/ });
const combat = (page: Page) => page.getByRole('region', { name: 'Combat view', exact: true });
const walletLoading = (page: Page) => page.getByTestId('kevin-wallet-loading');

async function savedRound(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').rounds?.[0] ?? null, RIVAL_KEY);
}

async function openDetails(page: Page) {
  await status(page).click();
  const dialog = page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function installTransport(page: Page, wallet: boolean, deferPrepare = false) {
  const requests: Array<Record<string, unknown>> = [];
  let round: RivalRound | null = null;
  let answerAvailable = false;
  let releasePrepare: () => void = () => {};
  const prepareReady = new Promise<void>(resolve => { releasePrepare = resolve; });
  if (!deferPrepare) releasePrepare();
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market, odds: null } }));
  await page.route('**/api/somnia-agents/rival', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body.action === 'prepare') {
      await prepareReady;
      round = {
        attemptId: String(body.attemptId), marketId, expiry: market.expiry, cutoff: market.expiry - 10,
        mode: wallet ? 'somnia' : 'simulation', status: 'pending',
      };
      return route.fulfill({ json: { round, ticket: TICKET_A, ...(wallet ? { transaction } : {}) } });
    }
    if (body.action !== 'status' || !round || body.attemptId !== round.attemptId
      || ![TICKET_A, TICKET_B].includes(String(body.ticket)) || (wallet && body.txHash !== TX_HASH)) {
      return route.fulfill({ status: 400, json: { error: 'Controlled fixture: original ticket and request identity are required.' } });
    }
    return route.fulfill({ json: answerAvailable
      ? { round: { ...round, status: 'locked', direction: 'UP', finalizedAt: NOW + 5, reason: 'Controlled browser fixture; not an onchain verification.' }, ticket: TICKET_B }
      : { round, ticket: TICKET_A } });
  });
  return { requests, releasePrepare, answer: () => { answerAvailable = true; } };
}

async function chooseOmen(page: Page, wallet: boolean) {
  await page.goto('/somnia-agents');
  if (wallet) {
    const dialog = await openDetails(page);
    await dialog.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close details', exact: true }).click();
  }
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
}

async function lock(page: Page, wallet: boolean) {
  await chooseOmen(page, wallet);
  if (wallet) await page.getByRole('button', { name: 'CONNECT METAMASK FIRST', exact: true }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
  await expect(combat(page)).toBeVisible();
}

async function installWallet(page: Page, options: { deferConnection?: boolean; deferTransaction?: boolean } = {}) {
  await page.addInitScript(({ key, hash, controlKey, options }) => {
    // This injected provider exercises the connection/lock boundary without a real
    // wallet, account or RPC. It does not claim to test MetaMask mobile app handoff.
    const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    const controlledWindow = window as unknown as Record<string, unknown>;
    controlledWindow[controlKey] = {
      has: (method: string) => pending.has(method),
      settle: (method: string, reject: boolean) => {
        const request = pending.get(method);
        if (!request) throw new Error(`No pending controlled wallet request: ${method}`);
        pending.delete(method);
        if (reject) request.reject(Object.assign(new Error('User rejected the controlled wallet request.'), { code: 4001 }));
        else request.resolve();
      },
    };
    const waitForUser = (method: string) => new Promise<void>((resolve, reject) => {
      if (pending.has(method)) throw new Error(`Duplicate pending controlled wallet request: ${method}`);
      pending.set(method, { resolve, reject });
    });
    controlledWindow.ethereum = {
      request: async (input: { method: string; params?: unknown[] }) => {
        const calls = JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{ method: string }>;
        calls.push(input);
        sessionStorage.setItem(key, JSON.stringify(calls));
        const account = `0x${'19'.repeat(20)}`;
        if (input.method === 'eth_requestAccounts') {
          if (options.deferConnection) await waitForUser(input.method);
          sessionStorage.setItem(`${key}/connected`, 'yes');
          return [account];
        }
        if (input.method === 'eth_accounts') return sessionStorage.getItem(`${key}/connected`) === 'yes' ? [account] : [];
        if (input.method === 'eth_chainId') return '0xc488';
        if (input.method === 'eth_sendTransaction') {
          if (options.deferTransaction) await waitForUser(input.method);
          return hash;
        }
        throw new Error(`Unexpected synthetic wallet method: ${input.method}`);
      },
    };
  }, { key: WALLET_CALLS, hash: TX_HASH, controlKey: WALLET_CONTROL, options });
}

async function settleWallet(page: Page, method: 'eth_requestAccounts' | 'eth_sendTransaction', reject = false) {
  await expect.poll(() => page.evaluate(({ key, method }) =>
    (window as unknown as Record<string, { has: (method: string) => boolean }>)[key].has(method),
  { key: WALLET_CONTROL, method })).toBe(true);
  await page.evaluate(({ key, method, reject }) =>
    (window as unknown as Record<string, { settle: (method: string, reject: boolean) => void }>)[key].settle(method, reject),
  { key: WALLET_CONTROL, method, reject });
}

async function expectWalletLoading(page: Page, phase: 'connect' | 'prepare' | 'transaction') {
  const loading = walletLoading(page);
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('data-phase', phase);
  await expect(loading.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await expect(loading.getByRole('button', { name: 'BACK TO GAME', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return loading;
}

async function dismissWalletLoading(page: Page) {
  await walletLoading(page).getByRole('button', { name: 'BACK TO GAME', exact: true }).click();
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
}

async function walletCalls(page: Page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{ method: string; params?: Array<Record<string, unknown>> }>, WALLET_CALLS);
}

async function expectOmenUnlocked(page: Page) {
  await expect(combat(page)).toHaveCount(0);
  await expect(status(page)).toHaveAccessibleName('Somnia Agent Kevin: Not locked yet');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), RUN_KEY);
  expect(saved?.run.phase).toBe('boss-lock-required');
  expect(saved?.run.currentAttempt).toBeNull();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW * 1000 });
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

test('Agents-enabled Home stays neutral until selection and clearly separates simulation from a paid testnet request', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 503, json: { error: 'Home must not request game or agent data.' } });
  });
  await page.goto('/');
  const choices = page.getByRole('group', { name: 'Choose your dungeon', exact: true });
  await expect(choices.getByRole('radio')).toHaveCount(3);
  await expect(choices.locator('input:checked')).toHaveCount(0);
  const detail = page.getByRole('region', { name: 'Selected dungeon', exact: true });
  await expect(detail).not.toContainText('Kevin');
  await expect(page.getByRole('button', { name: 'CHOOSE A MODE', exact: true })).toBeDisabled();
  await choices.getByRole('radio', { name: 'Somnia Agent Kevin', exact: true }).check();
  await expect(detail).toContainText('Kevin');
  await expect(detail).toContainText(/simulat/i);
  await expect(detail).toContainText(/testnet/i);
  await expect(detail).toContainText(/wallet/i);
  await page.clock.runFor(3100);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('opaque rival ticket survives status rotation and reload without preparing another simulation', async ({ page }) => {
  const fixture = await installTransport(page, false);
  await lock(page, false);
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_A);
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  const prepared = fixture.requests.find(request => request.action === 'prepare')!;
  expect(Object.keys(prepared).sort()).toEqual(['action', 'attemptId', 'marketId', 'mode']);
  expect(prepared.mode).toBe('simulation');
  fixture.answer();
  await page.clock.runFor(3100);
  await expect(status(page)).toContainText('BTC UP');
  await expect(status(page)).toHaveAccessibleDescription('SIMULATED');
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_B);
  const dialog = await openDetails(page);
  await expect(dialog).toContainText(/LOCAL SIMULATION|SIMULATED KEVIN/);
  await expect(dialog).toContainText('No AI or onchain agent is running in this mode.');
  await expect(dialog).not.toContainText(TICKET_B);
  await dialog.getByRole('button', { name: 'Close details', exact: true }).click();

  const readsBefore = fixture.requests.filter(request => request.action === 'status').length;
  await page.reload();
  await expect(combat(page)).toBeVisible();
  await page.clock.runFor(3100);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'status').length).toBeGreaterThan(readsBefore);
  await expect(status(page)).toContainText('BTC UP');
  const reads = fixture.requests.filter(request => request.action === 'status');
  expect(reads[0].ticket).toBe(TICKET_A);
  expect(reads.at(-1)?.ticket).toBe(TICKET_B);
  expect(reads.every(request => request.attemptId === prepared.attemptId && !('direction' in request))).toBe(true);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_B);
});

test('pending wallet screens reopen without duplicate requests; separate lock sends once and reload retains its exact receipt', async ({ page }) => {
  const fixture = await installTransport(page, true, true);
  await installWallet(page, { deferConnection: true, deferTransaction: true });
  await chooseOmen(page, true);
  const connect = page.getByRole('button', { name: 'CONNECT METAMASK FIRST', exact: true });
  await expect(connect).toBeEnabled();
  expect(fixture.requests).toHaveLength(0);
  expect((await walletCalls(page)).filter(call => ['eth_requestAccounts', 'eth_sendTransaction'].includes(call.method))).toHaveLength(0);
  await connect.click();
  const connecting = await expectWalletLoading(page, 'connect');
  await expect(connecting).toContainText('Your omen is still unlocked.');
  await expect(connecting).toContainText('No STT is sent when you connect.');
  await dismissWalletLoading(page);
  await expectOmenUnlocked(page);
  await page.getByRole('button', { name: 'VIEW WALLET REQUEST', exact: true }).click();
  await expectWalletLoading(page, 'connect');
  expect(fixture.requests).toHaveLength(0);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_requestAccounts')).toHaveLength(1);
  await settleWallet(page, 'eth_requestAccounts');
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  const lockOmen = page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true });
  await expect(lockOmen).toBeEnabled();
  await expectOmenUnlocked(page);
  expect(fixture.requests).toHaveLength(0);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_requestAccounts')).toHaveLength(1);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(0);
  await page.clock.runFor(1100);
  expect(fixture.requests).toHaveLength(0);
  await lockOmen.click();
  await expectWalletLoading(page, 'prepare');
  await expect.poll(() => fixture.requests.filter(request => request.action === 'prepare').length).toBe(1);
  fixture.releasePrepare();
  const approval = await expectWalletLoading(page, 'transaction');
  await expect(approval).toContainText('0.3 testnet STT');
  await expect(approval).toContainText('+ gas');
  const unchangedGame = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game, RUN_KEY);
  await page.keyboard.press('a');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game, RUN_KEY)).toEqual(unchangedGame);
  await dismissWalletLoading(page);
  await expect(combat(page)).toBeVisible();
  const details = await openDetails(page);
  await details.getByRole('button', { name: 'VIEW WALLET REQUEST', exact: true }).click();
  await expect(details).not.toBeVisible();
  await expectWalletLoading(page, 'transaction');
  await expect.poll(async () => (await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction').length).toBe(1);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  await settleWallet(page, 'eth_sendTransaction');
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await expect(combat(page)).toBeVisible();
  await expect.poll(async () => (await savedRound(page))?.txHash).toBe(TX_HASH);
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_A);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'status').length).toBeGreaterThan(0);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1);
  const originalAttempt = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.currentAttempt, RUN_KEY);

  await page.reload();
  await expect(combat(page)).toBeVisible();
  await expect(walletLoading(page)).toHaveCount(0);
  fixture.answer();
  await page.clock.runFor(3100);
  await expect(status(page)).toContainText('BTC UP');
  await expect(status(page)).toHaveAccessibleDescription('SOMNIA TESTNET');
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_B);
  expect((await savedRound(page))?.txHash).toBe(TX_HASH);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  const reads = fixture.requests.filter(request => request.action === 'status');
  expect(reads.length).toBeGreaterThanOrEqual(2);
  expect(reads.every(request => request.txHash === TX_HASH && request.ticket === TICKET_A)).toBe(true);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.currentAttempt, RUN_KEY)).toEqual(originalAttempt);
  await combat(page).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game.lastPlayerDamage, RUN_KEY)).toBeGreaterThan(0);
});

test('a rejected MetaMask connection keeps the omen unlocked and can retry without preparing or sending an agent request', async ({ page }) => {
  const fixture = await installTransport(page, true);
  await installWallet(page, { deferConnection: true });
  await chooseOmen(page, true);
  const connect = page.getByRole('button', { name: 'CONNECT METAMASK FIRST', exact: true });
  await connect.click();
  await expectWalletLoading(page, 'connect');
  await settleWallet(page, 'eth_requestAccounts', true);
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await expect(page.getByLabel('Expedition stage', { exact: true }).getByRole('alert')).toContainText(/rejected|declined|cancel|not connect/i);
  await expect(connect).toBeEnabled();
  await expectOmenUnlocked(page);
  expect(fixture.requests).toHaveLength(0);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(0);

  await connect.click();
  await expectWalletLoading(page, 'connect');
  await settleWallet(page, 'eth_requestAccounts');
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true })).toBeEnabled();
  await expectOmenUnlocked(page);
  expect(fixture.requests).toHaveLength(0);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_requestAccounts')).toHaveLength(2);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(0);
});

test('dismissed preparation stays dismissed during approval; a declined transaction releases combat and never retries on reload', async ({ page }) => {
  const fixture = await installTransport(page, true, true);
  await installWallet(page, { deferTransaction: true });
  await chooseOmen(page, true);
  await page.getByRole('button', { name: 'CONNECT METAMASK FIRST', exact: true }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
  await expectWalletLoading(page, 'prepare');
  await expect.poll(() => fixture.requests.filter(request => request.action === 'prepare').length).toBe(1);
  await dismissWalletLoading(page);
  fixture.releasePrepare();
  await expect.poll(async () => (await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction').length).toBe(1);
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(combat(page)).toBeVisible();
  const details = await openDetails(page);
  await details.getByRole('button', { name: 'VIEW WALLET REQUEST', exact: true }).click();
  await expect(details).not.toBeVisible();
  await expectWalletLoading(page, 'transaction');
  await settleWallet(page, 'eth_sendTransaction', true);
  await expect(walletLoading(page)).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await expect(status(page)).toHaveAccessibleName('Somnia Agent Kevin: Sitting out');
  expect((await savedRound(page))?.txHash).toBeUndefined();
  await combat(page).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game.lastPlayerDamage, RUN_KEY)).toBeGreaterThan(0);
  await page.reload();
  await expect(combat(page)).toBeVisible();
  await expect(status(page)).toHaveAccessibleName('Somnia Agent Kevin: Sitting out');
  await page.clock.runFor(3100);
  await expect(walletLoading(page)).toHaveCount(0);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_requestAccounts')).toHaveLength(1);
  expect((await walletCalls(page)).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1);
});
