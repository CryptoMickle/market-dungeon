import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  LIVE_JUDGE,
  LIVE_PROOF_SCHEMA,
  isLiveJudgePublicKey,
  verifyLiveJudgeLockAttestation,
  type LiveJudgeProof,
  type LiveJudgeStart,
} from '../../app/live-judge-proof';
import { validLiveJudgeActions } from '../judge-live-actions';
import { marketDungeonDeploymentOrigin, validateLiveTarget } from '../../scripts/validate-live-target';

const PATH = '/shannon/live-judge';

async function expectModeNavigation(page: Page, setup = false) {
  const modes = page.getByRole('navigation', { name: 'Choose game mode', exact: true });
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  await expect(modes).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true }).or(page.getByRole('link', { name: 'Market Dungeon — back to home', exact: true }))).toBeVisible();
  if (!setup) { await expect(variants).toHaveCount(0); return; }
  await expect(variants.getByRole('link')).toHaveText(['LIVE · 1 MIN', 'HISTORICAL REPLAY']);
  await expect(variants.getByRole('link', { name: 'LIVE · 1 MIN', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(variants.getByRole('link', { name: 'HISTORICAL REPLAY', exact: true })).toHaveAttribute('href', '/shannon/judge');
}

test('one real live release round verifies its signed lock, fights, exported proof and hosted invitation', async ({ page, request, baseURL }, info) => {
  test.setTimeout(180_000);
  // Explicit opt-in keeps this fresh-market run out of the historical canary.
  const explicitTarget = process.env.LIVE_SMOKE_BASE_URL;
  test.skip(process.env.LIVE_ONE_MINUTE !== '1', 'Set LIVE_ONE_MINUTE=1 for an explicit release check.');
  const origin = marketDungeonDeploymentOrigin(explicitTarget);
  await validateLiveTarget(explicitTarget, process.env.EXPECTED_COMMIT);
  const environment = origin.hostname === 'market-dungeon.vercel.app' ? 'production' : 'preview';
  expect(new URL(baseURL!).origin).toBe(origin.origin);

  const startedAt = new Date().toISOString();
  const responses: { at: string; path: string; status: number }[] = [];
  let browserRpcReads = 0;
  let acceptedLocks = 0;
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/live-judge/')) {
      responses.push({ at: new Date().toISOString(), path: url.pathname, status: response.status() });
      if (url.pathname.endsWith('/start') && response.status() === 200) acceptedLocks++;
    }
    if (url.origin === new URL(LIVE_JUDGE.rpc).origin) browserRpcReads++;
  });
  // All game APIs, keys and Shannon RPC reads remain real and unmodified.
  await page.route('**/_vercel/insights/**', route => route.abort());

  const keyResponse = await request.get('/api/live-judge/public-key');
  expect(keyResponse.status()).toBe(200);
  expect(keyResponse.headers()['cache-control']).toContain('no-store');
  const key = await keyResponse.json();
  expect(isLiveJudgePublicKey(key)).toBe(true);
  expect(key.environment).toBe(environment);
  expect(key.chainId).toBe(50312);

  await page.goto(`${PATH}?automation=1`);
  await expectModeNavigation(page, true);
  await expect(page.getByRole('button', { name: /GOLD AWAKENS.*BTC UP/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Live dreamDEX order book odds', { exact: true })).toBeVisible();
  const lockButton = page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true });
  await expect(lockButton).toBeEnabled({ timeout: 75_000 });
  const startResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/live-judge/start');
  await lockButton.click();
  const start = await startResponse;
  expect(start.status()).toBe(200);
  const { live } = await start.json() as { live: LiveJudgeStart };
  expect(live.lock.direction).toBe('UP');
  expect(live.lock.chainId).toBe(50312);
  expect(live.lock.market.intervalSec).toBe(60);
  expect(live.lock.market.expiry - live.lock.issuedAt).toBeGreaterThanOrEqual(LIVE_JUDGE.minRemainingSeconds);
  expect(live.lockAttestation.environment).toBe(environment);
  expect(await verifyLiveJudgeLockAttestation(live.lock, live.lockAttestation, key)).toBe(true);
  await expect(page.getByRole('region', { name: 'Combat view' })).toBeVisible({ timeout: 15_000 });
  await expectModeNavigation(page);

  // The public seed chooses valid button presses, not a mocked result or state.
  const actions = validLiveJudgeActions(live.gameSeed);
  for (const action of actions.filter(action => action.room === 8)) {
    await page.getByRole('button', { name: action.action === 'potion' ? /POTION.*HEAL \+25 HP/ : /ATTACK/ }).click();
  }
  await page.getByRole('button', { name: 'ENTER FINAL BOSS', exact: true }).click();
  for (const action of actions.filter(action => action.room === 9)) {
    await page.getByRole('button', { name: action.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
  }
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  await expect(page.getByText('COMBAT WON · MARKET FATE PENDING', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('live-preview-boss-down.png'), fullPage: true });

  // Pending settlement retries automatically. A transient verification error
  // exposes a same-market retry; permit at most two such visible retries.
  let manualRetries = 0;
  await expect.poll(async () => {
    if (await page.getByText(/^SOMNIA VERIFIED · (BLESSED|CURSED|VOID)$/).isVisible()) return true;
    const retry = page.getByRole('button', { name: 'RETRY THIS MARKET', exact: true });
    if (manualRetries < 2 && await retry.isVisible() && await retry.isEnabled()) {
      await retry.click();
      manualRetries++;
    }
    return false;
  }, { timeout: 90_000, intervals: [1_000, 2_000, 3_000] }).toBe(true);
  expect(acceptedLocks).toBe(1);
  await expect(page.getByLabel('Final run statistics', { exact: true })).toContainText('2/2');

  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(share).toBeVisible();
  await expect(share).not.toContainText(/only on this Mac|local test result/i);
  await expect(share).toContainText('This invitation opens a fresh live run');
  await expect(share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true })).toBeEnabled({ timeout: 15_000 });
  await expect(share.getByRole('img')).toHaveAttribute('src', /^blob:/);
  const draft = new URL((await share.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true }).getAttribute('href'))!);
  expect(draft.searchParams.get('url')).toBe(`${origin.origin}${PATH}?challenge=1`);
  expect(draft.searchParams.get('text')).toContain('Shannon testnet');
  expect(draft.searchParams.get('text')).not.toMatch(/only on this Mac|Local preview/i);
  await page.screenshot({ path: info.outputPath('live-preview-result.png'), fullPage: true });

  const proofToggle = page.getByText('VIEW VERIFIED RUN PROOF', { exact: true });
  await expect(proofToggle.locator('..')).not.toHaveAttribute('open', '');
  await proofToggle.click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '1 · SAVE PROOF', exact: true }).click();
  const download = await downloadEvent;
  const proofPath = await download.path();
  expect(proofPath).not.toBeNull();
  const bytes = await readFile(proofPath!);
  const proof = JSON.parse(bytes.toString('utf8')) as LiveJudgeProof;
  expect(proof.schema).toBe(LIVE_PROOF_SCHEMA);
  expect(proof.lock).toEqual(live.lock);
  expect(proof.actions).toEqual(actions);
  expect(proof.lockAttestation).toEqual(live.lockAttestation);
  expect(proof.onchainSettlement).toMatchObject({ verified: true, chainId: 50312 });
  expect(proof.combatProof.verified).toBe(true);
  await writeFile(info.outputPath('actual-live-preview-proof.json'), bytes);

  const rpcReadsBeforeVerifier = browserRpcReads;
  await page.goto(`${PATH}/verify?automation=1`);
  await page.getByLabel('Choose proof JSON', { exact: true }).setInputFiles({
    name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes,
  });
  await page.getByRole('button', { name: 'VERIFY LIVE PROOF', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Live proof verification result', exact: true })
    .getByRole('heading', { name: 'PASS', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Verified live run', exact: true })).toContainText(proof.result);
  expect(browserRpcReads).toBeGreaterThan(rpcReadsBeforeVerifier);
  await page.screenshot({ path: info.outputPath('live-preview-verifier.png'), fullPage: true });
  await writeFile(info.outputPath('actual-live-preview-observations.json'), JSON.stringify({
    baseURL: origin.origin, startedAt, completedAt: new Date().toISOString(),
    acceptedLocks, manualRetries, marketId: live.lock.market.marketId,
    lockedAt: live.lock.issuedAt, expiry: live.lock.market.expiry,
    result: proof.result, keyEnvironment: key.environment, browserRpcReads,
    independentVerifier: 'PASS', sameOriginInvitation: true, responses,
  }, null, 2));
});
