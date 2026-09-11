import { expect, test, type Locator, type Page } from '@playwright/test';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { market, SHANNON_LOCK_PUBLIC_KEY } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

const JUDGE_VARIANTS = [
  { name: 'LIVE · 1 MIN', href: '/shannon/live-judge' },
  { name: 'HISTORICAL REPLAY', href: '/shannon/judge' },
] as const;

type VariantGeometry = { width: number; height: number; borderRadius: string; fontSize: string; fontWeight: string }[];

function homeLogo(page: Page) {
  return page.getByRole('link', { name: 'Market Dungeon — back to home', exact: true })
    .or(page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true })).filter({ visible: true });
}

async function expectClearOfSound(page: Page, control: Locator) {
  const sound = page.getByRole('button', { name: /^(Turn all game sounds (on|off)|Resume game sounds)$/ });
  await expect(sound).toHaveCount(1);
  await expect(sound).toBeInViewport({ ratio: 1 });
  await expect(control).toBeInViewport({ ratio: 1 });
  const soundBox = (await sound.boundingBox())!;
  const box = (await control.boundingBox())!;
  const overlaps = box.x < soundBox.x + soundBox.width && box.x + box.width > soundBox.x
    && box.y < soundBox.y + soundBox.height && box.y + box.height > soundBox.y;
  expect(overlaps, 'Navigation must remain clear of the sound control').toBe(false);
  return box;
}

async function expectGameNavigation(page: Page, current: 'expedition' | 'live' | 'replay', previous?: VariantGeometry) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('navigation', { name: 'Choose game mode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Choose your dungeon', exact: true })).toHaveCount(0);
  await expectClearOfSound(page, homeLogo(page));
  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  if (current === 'expedition') {
    await expect(variants).toHaveCount(0);
    return [];
  }
  await expect(homeLogo(page)).toHaveAttribute('href', '/');
  await expect(variants.getByRole('link')).toHaveText(JUDGE_VARIANTS.map(variant => variant.name));
  await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
  const geometry: VariantGeometry = [];
  for (const [index, variant] of JUDGE_VARIANTS.entries()) {
    const link = variants.getByRole('link', { name: variant.name, exact: true });
    await expect(link).toHaveAttribute('href', variant.href);
    if (index === (current === 'live' ? 0 : 1)) await expect(link).toHaveAttribute('aria-current', 'page');
    else await expect(link).not.toHaveAttribute('aria-current', 'page');
    const box = await expectClearOfSound(page, link);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const appearance = await link.evaluate(element => {
      const style = getComputedStyle(element);
      return { borderRadius: style.borderRadius, fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    geometry.push({ width: box.width, height: box.height, ...appearance });
    if (previous) {
      expect(Math.abs(box.width - previous[index].width)).toBeLessThanOrEqual(2);
      expect(box.height).toBe(previous[index].height);
      expect(appearance).toEqual({ borderRadius: previous[index].borderRadius, fontSize: previous[index].fontSize, fontWeight: previous[index].fontWeight });
    }
  }
  expect(Math.abs(geometry[0].width - geometry[1].width)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return geometry;
}

async function expectNeutralHome(page: Page) {
  const choices = page.getByRole('group', { name: 'Choose your dungeon', exact: true });
  await expect(choices).toBeVisible();
  await expect(choices.locator('input:checked')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'CHOOSE A MODE', exact: true })).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Choose Judge format', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Selected dungeon', exact: true })).not.toContainText('Kevin');
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).search).toBe('');
  return choices;
}

for (const viewport of [{ width: 390, height: 664 }, { width: 1280, height: 720 }]) {
  test(`Home owns the mode choice and Judge setup owns its variants at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const fixture = liveJudgeFixture();
    await page.setViewportSize(viewport);
    await page.clock.install({ time: fixture.now * 1_000 });
    await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route('**/api/market?interval=300', route => route.fulfill({ json: {
      market: { ...market, finalized: false, status: 'Trading', tradingStart: String(fixture.now - 10), expiry: String(fixture.now + 290) }, odds: null,
    } }));
    await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
    await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
    await page.route('**/api/live-judge/odds?*', route => route.fulfill({ json: {
      marketId: fixture.market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId),
      intervalSec: 60, asset: 'BTC', expiry: fixture.market.expiry, state: 'open', odds: null,
    } }));
    await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));

    await page.goto('/');
    const choices = await expectNeutralHome(page);
    await choices.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
    await expect(page.getByRole('region', { name: 'Selected dungeon', exact: true })).toContainText('forty rooms');
    await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
    await expect(page).toHaveURL(/\/expedition$/);
    await expectGameNavigation(page, 'expedition');
    await homeLogo(page).click();
    await expectNeutralHome(page);

    await choices.getByRole('radio', { name: 'Judge Demo', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Live · 1 min', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/live-judge$/);
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true })).toBeEnabled();
    const original = await expectGameNavigation(page, 'live');

    await page.getByRole('navigation', { name: 'Choose Judge demo', exact: true }).getByRole('link', { name: 'HISTORICAL REPLAY', exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/judge$/);
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true })).toBeEnabled();
    await expectGameNavigation(page, 'replay', original);

    await page.getByRole('navigation', { name: 'Choose Judge demo', exact: true }).getByRole('link', { name: 'LIVE · 1 MIN', exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/live-judge$/);
    await expectGameNavigation(page, 'live', original);
    await homeLogo(page).click();
    await expectNeutralHome(page);
  });
}
