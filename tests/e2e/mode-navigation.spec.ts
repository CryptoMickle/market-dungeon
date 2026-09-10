import { expect, test, type Page } from '@playwright/test';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { market, SHANNON_LOCK_PUBLIC_KEY } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

const MODES = [
  { name: 'FULL EXPEDITION', href: '/' },
  { name: 'JUDGE DEMO', href: '/shannon/live-judge' },
] as const;
const JUDGE_VARIANTS = [
  { name: 'LIVE · 1 MIN', href: '/shannon/live-judge' },
  { name: 'HISTORICAL REPLAY', href: '/shannon/judge' },
] as const;

type NavigationGeometry = { width: number; height: number; borderRadius: string; fontSize: string; fontWeight: string }[];

async function expectModeNavigation(page: Page, current: 'expedition' | 'live' | 'replay', previous?: NavigationGeometry) {
  const selectedMain = current === 'expedition' ? 0 : 1;
  const navigation = page.getByRole('navigation', { name: 'Choose game mode', exact: true });
  await expect(navigation).toHaveCount(1);
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await expect(navigation.getByRole('link')).toHaveText(MODES.map(mode => mode.name));
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: MODES[selectedMain].name, exact: true })).toHaveAttribute('aria-current', 'page');

  const sound = page.getByRole('button', { name: /^(Turn all game sounds (on|off)|Resume game sounds)$/ });
  await expect(sound).toHaveCount(1);
  await expect(sound).toBeInViewport({ ratio: 1 });
  const soundBox = (await sound.boundingBox())!;
  const geometry: NavigationGeometry = [];

  for (const [index, mode] of MODES.entries()) {
    const link = navigation.getByRole('link', { name: mode.name, exact: true });
    await expect(link).toHaveAttribute('href', index === 1 && current === 'replay' ? '/shannon/judge' : mode.href);
    await expect(link).toBeInViewport({ ratio: 1 });
    if (index !== selectedMain) await expect(link).not.toHaveAttribute('aria-current', 'page');
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const overlapsSound = box.x < soundBox.x + soundBox.width && box.x + box.width > soundBox.x
      && box.y < soundBox.y + soundBox.height && box.y + box.height > soundBox.y;
    expect(overlapsSound, `${mode.name} must remain clear of the sound control`).toBe(false);

    const appearance = await link.evaluate(element => {
      const style = getComputedStyle(element);
      return { borderRadius: style.borderRadius, fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    const measured = { width: box.width, height: box.height, ...appearance };
    geometry.push(measured);
    if (previous) {
      // The page frames differ by two pixels of mobile inset. The shared
      // buttons keep the same touch height, typography and equal columns.
      expect(Math.abs(measured.width - previous[index].width)).toBeLessThanOrEqual(2);
      expect(measured.height).toBe(previous[index].height);
      expect(appearance).toEqual({ borderRadius: previous[index].borderRadius, fontSize: previous[index].fontSize, fontWeight: previous[index].fontWeight });
    }
  }
  expect(Math.max(...geometry.map(box => box.width)) - Math.min(...geometry.map(box => box.width))).toBeLessThanOrEqual(1);

  const variants = page.getByRole('navigation', { name: 'Choose Judge demo', exact: true });
  if (current === 'expedition') {
    await expect(variants).toHaveCount(0);
  } else {
    await expect(variants).toHaveCount(1);
    await expect(variants).toBeInViewport({ ratio: 1 });
    await expect(variants.getByRole('link')).toHaveText(JUDGE_VARIANTS.map(variant => variant.name));
    await expect(variants.locator('[aria-current="page"]')).toHaveCount(1);
    const selectedVariant = current === 'live' ? 0 : 1;
    const primaryBox = (await navigation.boundingBox())!;
    const variantBox = (await variants.boundingBox())!;
    expect(variantBox.y).toBeGreaterThanOrEqual(primaryBox.y + primaryBox.height);
    for (const [index, variant] of JUDGE_VARIANTS.entries()) {
      const link = variants.getByRole('link', { name: variant.name, exact: true });
      await expect(link).toHaveAttribute('href', variant.href);
      await expect(link).toBeInViewport({ ratio: 1 });
      if (index === selectedVariant) await expect(link).toHaveAttribute('aria-current', 'page');
      else await expect(link).not.toHaveAttribute('aria-current', 'page');
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const overlapsSound = box.x < soundBox.x + soundBox.width && box.x + box.width > soundBox.x
        && box.y < soundBox.y + soundBox.height && box.y + box.height > soundBox.y;
      expect(overlapsSound, `${variant.name} must remain clear of the sound control`).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  return geometry;
}

for (const viewport of [{ width: 390, height: 664 }, { width: 1280, height: 720 }]) {
  test(`mode navigation groups both Judge variants under Judge Demo at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const fixture = liveJudgeFixture();
    await page.setViewportSize(viewport);
    await page.clock.install({ time: fixture.now * 1_000 });
    await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route('**/api/market?interval=300', route => route.fulfill({ json: {
      market: { ...market, finalized: false, status: 'Trading', tradingStart: String(fixture.now - 10), expiry: String(fixture.now + 290) },
      odds: null,
    } }));
    await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: fixture.market, serverTime: fixture.now } }));
    await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: fixture.publicKey }));
    await page.route('**/api/live-judge/odds?*', route => route.fulfill({ json: {
      marketId: fixture.market.marketId, chainId: Number(LIVE_JUDGE.chainId), venueId: String(LIVE_JUDGE.venueId),
      intervalSec: 60, asset: 'BTC', expiry: fixture.market.expiry, state: 'open', odds: null,
    } }));
    await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));

    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Expedition market', exact: true })).toContainText('LIVE BTC 5M · OPENING REFERENCE');
    const original = await expectModeNavigation(page, 'expedition');

    await page.getByRole('navigation', { name: 'Choose game mode', exact: true }).getByRole('link', { name: MODES[1].name, exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/live-judge$/);
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true })).toBeEnabled();
    await expectModeNavigation(page, 'live', original);

    await page.getByRole('navigation', { name: 'Choose Judge demo', exact: true }).getByRole('link', { name: 'HISTORICAL REPLAY', exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/judge$/);
    await expect(page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true })).toBeEnabled();
    await expectModeNavigation(page, 'replay', original);

    await page.getByRole('navigation', { name: 'Choose Judge demo', exact: true }).getByRole('link', { name: 'LIVE · 1 MIN', exact: true }).click();
    await expect(page).toHaveURL(/\/shannon\/live-judge$/);
    await expect(page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON', exact: true })).toBeEnabled();
    await expectModeNavigation(page, 'live', original);

    await page.getByRole('navigation', { name: 'Choose game mode', exact: true }).getByRole('link', { name: MODES[0].name, exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectModeNavigation(page, 'expedition', original);
    await expect(page.getByRole('button', { name: 'ENTER THE DUNGEON', exact: true })).toBeVisible();
  });
}
