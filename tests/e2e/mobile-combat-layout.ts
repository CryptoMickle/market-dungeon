import { expect, type Locator, type Page } from '@playwright/test';

/** A phone may scroll; its monster must not become the leftover strip of a
 * fixed-height page. Measure the contained bitmap, not the full-width img box. */
export async function expectSubstantialMobileCombat(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const combat = page.getByRole('region', { name: 'Combat view', exact: true });
  const image = combat.getByRole('img');
  const caption = combat.locator('blockquote');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveCSS('object-fit', 'contain');
  const artwork = await image.evaluate((img: HTMLImageElement) => {
    const box = img.getBoundingClientRect();
    const frame = img.parentElement!.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    return {
      paintedWidth: img.naturalWidth * scale,
      paintedHeight: img.naturalHeight * scale,
      frameWidth: frame.width,
      frameHeight: frame.height,
    };
  });
  const width = page.viewportSize()!.width;
  expect(artwork.paintedWidth, 'The actual monster illustration must use the phone width').toBeGreaterThanOrEqual(width * .9);
  expect(artwork.paintedHeight, 'The painted illustration must remain substantial with Safari chrome open').toBeGreaterThanOrEqual(width * .5);
  expect(artwork.paintedWidth).toBeLessThanOrEqual(artwork.frameWidth + 1);
  expect(artwork.paintedHeight).toBeLessThanOrEqual(artwork.frameHeight + 1);
  await expect(caption).not.toBeEmpty();
  expect(await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);
  expect(await caption.evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'The flavor caption must not be clipped').toBe(true);

  for (const element of [combat.getByLabel(/Your health/), combat.getByLabel(/Enemy health/), image, caption]) {
    // Leave room for the phone's top controls instead of aligning fractional
    // line-box coordinates exactly to the viewport edge.
    await element.evaluate(element => window.scrollTo({
      top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - 84),
      behavior: 'instant',
    }));
    await expect(element).toBeInViewport({ ratio: 1 });
    const box = (await element.boundingBox())!;
    const dock = (await combat.getByRole('region', { name: 'Combat controls', exact: true }).boundingBox())!;
    expect(box.y + box.height, 'Status, full-size art and caption can be read above the action dock').toBeLessThanOrEqual(dock.y);
  }
  const actions = combat.getByRole('region', { name: 'Combat actions', exact: true });
  for (const control of await actions.getByRole('button').all()) await expectReachableTouchControl(control);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  // Leave callers at the navigation/clock, rather than carrying a test-created
  // scroll offset into a subsequent interaction or viewport change.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  return combat;
}

async function expectReachableTouchControl(control: Locator) {
  // Center deliberately: an edge-aligned scroll can round a fractional CSS
  // pixel outside the viewport even though there is ample room to scroll.
  await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return hit !== null && element.contains(hit);
  }), 'The reachable action must not sit behind a sticky header or overlay').toBe(true);
}
