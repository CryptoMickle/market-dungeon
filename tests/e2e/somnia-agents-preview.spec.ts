import { expect, test, type Page } from '@playwright/test';
import { encodeFunctionData, toHex, zeroAddress } from 'viem';
import { buildKevinPayload, SOMNIA_AGENTS_ABI, SOMNIA_AGENTS_TESTNET, type MarketSnapshot } from '../../lib/somnia-agents/protocol';
import type { RivalRound, RivalTransaction } from '../../lib/somnia-agents/types';

// These are browser transport fixtures, not signed tickets or network proofs.
// Real ticket authentication and onchain verification are tested separately.
const NOW = 1_789_090_000;
const RIVAL_KEY = 'market-dungeon/local-kevin-rival/v1';
const RUN_KEY = 'market-dungeon/local-agents/full-run/v1';
const WALLET_CALLS = 'market-dungeon/qa-preview-wallet-calls';
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

async function savedRound(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').rounds?.[0] ?? null, RIVAL_KEY);
}

async function openDetails(page: Page) {
  await status(page).click();
  const dialog = page.getByRole('dialog', { name: 'Somnia Agent Kevin', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function installTransport(page: Page, wallet: boolean) {
  const requests: Array<Record<string, unknown>> = [];
  let round: RivalRound | null = null;
  let answerAvailable = false;
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market, odds: null } }));
  await page.route('**/api/somnia-agents/rival', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body.action === 'prepare') {
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
  return { requests, answer: () => { answerAvailable = true; } };
}

async function lock(page: Page, wallet: boolean) {
  await page.goto('/somnia-agents');
  if (wallet) {
    const dialog = await openDetails(page);
    await dialog.getByRole('button', { name: 'SOMNIA AGENTS Testnet wallet + STT fee', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close details', exact: true }).click();
  }
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await page.getByRole('button', { name: 'LOCK BTC DOWN · ENTER TIER 1', exact: true }).click();
  await expect(combat(page)).toBeVisible();
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
  await choices.getByRole('radio', { name: 'Somnia Agents', exact: true }).check();
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

test('a submitted wallet request retains its exact hash and opaque ticket after reload without another wallet send', async ({ page }) => {
  const fixture = await installTransport(page, true);
  await page.addInitScript(({ key, hash }) => {
    // Entirely synthetic provider. No wallet extension, account or RPC is used.
    (window as unknown as { ethereum: { request: (input: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum = {
      request: async input => {
        const calls = JSON.parse(sessionStorage.getItem(key) ?? '[]') as unknown[];
        calls.push(input);
        sessionStorage.setItem(key, JSON.stringify(calls));
        if (input.method === 'eth_requestAccounts') return [`0x${'19'.repeat(20)}`];
        if (input.method === 'eth_chainId') return '0xc488';
        if (input.method === 'eth_sendTransaction') return hash;
        throw new Error(`Unexpected synthetic wallet method: ${input.method}`);
      },
    };
  }, { key: WALLET_CALLS, hash: TX_HASH });
  await lock(page, true);
  await expect.poll(async () => (await savedRound(page))?.txHash).toBe(TX_HASH);
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_A);
  await expect.poll(() => fixture.requests.filter(request => request.action === 'status').length).toBeGreaterThan(0);
  const walletCalls = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{ method: string; params?: Array<Record<string, unknown>> }>, WALLET_CALLS);
  expect((await walletCalls()).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1);
  const originalAttempt = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.currentAttempt, RUN_KEY);

  await page.reload();
  await expect(combat(page)).toBeVisible();
  fixture.answer();
  await page.clock.runFor(3100);
  await expect(status(page)).toContainText('BTC UP');
  await expect(status(page)).toHaveAccessibleDescription('SOMNIA TESTNET');
  await expect.poll(async () => (await savedRound(page))?.ticket).toBe(TICKET_B);
  expect((await savedRound(page))?.txHash).toBe(TX_HASH);
  expect((await walletCalls()).filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1);
  expect(fixture.requests.filter(request => request.action === 'prepare')).toHaveLength(1);
  const reads = fixture.requests.filter(request => request.action === 'status');
  expect(reads.length).toBeGreaterThanOrEqual(2);
  expect(reads.every(request => request.txHash === TX_HASH && request.ticket === TICKET_A)).toBe(true);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.currentAttempt, RUN_KEY)).toEqual(originalAttempt);
  await combat(page).getByRole('region', { name: 'Combat actions', exact: true }).getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.game.lastPlayerDamage, RUN_KEY)).toBeGreaterThan(0);
});
