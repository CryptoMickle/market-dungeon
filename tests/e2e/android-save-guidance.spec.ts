import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { liveJudgeFixture } from './live-judge-fixture';

async function restoreCompletedLiveRun(page: Page, platform: 'android' | 'ios') {
  const fixture = liveJudgeFixture();
  await page.addInitScript(({ saved, platform }) => {
    sessionStorage.setItem('market-dungeon-live-judge-v1', saved);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: platform === 'android'
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: platform === 'android' ? 'Linux armv8l' : 'iPhone' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    Reflect.set(window, '__saveGuideShares', []);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      Reflect.get(window, '__saveGuideShares').push({ keys: Object.keys(data), filename: file?.name, type: file?.type });
    } });
  }, {
    platform,
    saved: JSON.stringify({ live: fixture.session, actions: fixture.actions, bossEntered: true, rested: false, result: fixture.proof }),
  });
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
  await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
  await page.route('**/api/live-judge/odds?*', route => route.fulfill({ status: 503, json: { error: 'Quotes unavailable in this save-flow test.' } }));
  await page.route(LIVE_JUDGE.rpc, async route => {
    const request = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result: await fixture.rpc(request.method, request.params) } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/shannon/live-judge');
  const share = page.getByRole('region', { name: 'Share your Market Dungeon result' });
  await expect(share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true })).toBeEnabled();
  return share;
}

test('Android saves a real PNG directly and explains its filename and Downloads location', async ({ page, context }) => {
  const share = await restoreCompletedLiveRun(page, 'android');
  await expect(share.locator('.run-save-hint')).toContainText('On Android, Save Image downloads a PNG.');
  await expect(share.locator('.run-save-hint')).toContainText('browser menu → Downloads, or Files → Downloads');
  const pagesBefore = context.pages().length;
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('market-dungeon-live-run-12121212.png');
  const bytes = await readFile((await download.path())!);
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(20_000);
  await expect(share.getByRole('status')).toContainText(`Download requested: ${download.suggestedFilename()}`);
  await expect(share.getByRole('status')).toContainText('On Android, open your browser menu → Downloads, or Files → Downloads.');
  await expect(share.getByRole('status')).not.toContainText(/saved successfully|image saved/i);
  expect(await page.evaluate(() => Reflect.get(window, '__saveGuideShares'))).toEqual([]);
  expect(context.pages()).toHaveLength(pagesBefore);
  await share.getByText('Where is my image?', { exact: true }).click();
  await expect(share.getByText(/Look for the filename shown after saving/)).toBeVisible();
  await expect(share.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true })).toBeVisible();
  await expect(share.getByRole('button', { name: '↗ INVITE A PLAYER', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('iPhone guidance retains the file-only image menu and makes no saved-image claim', async ({ page, context }) => {
  const share = await restoreCompletedLiveRun(page, 'ios');
  await expect(share.locator('.run-save-hint')).toContainText('On iPhone or iPad, choose Save Image if offered');
  await expect(share.locator('.run-save-hint')).not.toContainText('On Android');
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  const pagesBefore = context.pages().length;
  await share.getByRole('button', { name: '1 · SAVE IMAGE', exact: true }).click();
  await expect(share.getByRole('status')).toHaveText('Image menu closed. Check that the card was saved, then open X and attach it.');
  const shares = await page.evaluate(() => Reflect.get(window, '__saveGuideShares'));
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ keys: ['files'], type: 'image/png' });
  expect(downloads).toEqual([]);
  expect(context.pages()).toHaveLength(pagesBefore);
  await share.getByText('Where is my image?', { exact: true }).click();
  await expect(share.getByText(/A downloaded PNG is in Files → Downloads/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
