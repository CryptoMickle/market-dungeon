import type { Page } from '@playwright/test';
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
