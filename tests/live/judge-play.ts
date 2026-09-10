import { expect, type Page } from '@playwright/test';

/** Observe the UI, using the same simple healing policy as the balance test. */
export async function completeLiveJudgeCombat(page: Page) {
  for (let step = 0; step < 24; step += 1) {
    // Boss defeat can arrive before the anti-peek hold ends. The caller waits
    // for the enabled reveal button; do not seek another attack during this phase.
    if (await page.locator('main.phase-oracle').isVisible()) return;
    if (await page.locator('main.phase-dead').isVisible()) throw new Error('Live Judge combat ended in player defeat');
    const gate = page.getByRole('button', { name: '👑 ENTER FINAL BOSS' });
    if (await gate.isVisible()) {
      const heal = page.getByRole('button', { name: /HEAL \+25 HP/ });
      if (await heal.isEnabled()) await heal.click();
      await gate.click();
      continue;
    }
    const label = await page.getByLabel(/^Your health /).getAttribute('aria-label');
    const hp = Number(label?.match(/Your health (\d+)/)?.[1]);
    const potion = page.getByRole('button', { name: /POTION/ });
    if (hp <= 35 && await potion.isEnabled()) await potion.click();
    else await page.getByRole('button', { name: /ATTACK/ }).click();
  }
  await expect(page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' })).toBeVisible();
}
