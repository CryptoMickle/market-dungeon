import { expect, type Page } from '@playwright/test';
import { VALID_ACTIONS } from './judge-demo-fixture';

// Fixed fixture transcript, executed through the UI rather than injecting state.
export async function playJudgeGuard(page: Page) {
  for (const entry of VALID_ACTIONS.filter((entry) => entry.room === 8)) {
    await page.getByRole('button', { name: entry.action === 'potion' ? /HEAL \+25 HP/ : /ATTACK/ }).click();
  }
}

export async function playJudgeBoss(page: Page, skip = 0) {
  for (const entry of VALID_ACTIONS.filter((entry) => entry.room === 9).slice(skip)) {
    await page.getByRole('button', { name: entry.action === 'potion' ? /POTION/ : /ATTACK/ }).click();
  }
}

export async function expectJudgeProgress(page: Page, current = 1) {
  const progress = page.getByRole('list', { name: 'Judge demo progress', exact: true });
  await expect(progress.getByRole('listitem')).toHaveText(['1 · LOCK OMEN', '2 · GUARD', '3 · BOSS', '4 · FATE']);
  await expect(progress.locator('[aria-current="step"]')).toHaveText(`${current} · ${['LOCK OMEN', 'GUARD', 'BOSS', 'FATE'][current - 1]}`);
}

export async function openJudgeProof(page: Page) {
  const proof = page.locator('details').filter({ has: page.getByText('VIEW VERIFIED RUN PROOF', { exact: true }) });
  if (await proof.getAttribute('open') === null) await proof.locator(':scope > summary').click();
  return proof;
}
