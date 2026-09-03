import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';

const VALID_ACTIONS: JudgeCombatAction[] = [
  { room: 8, action: 'attack' },
  { room: 9, action: 'attack' },
  { room: 9, action: 'attack' },
];

async function expectLiveLink(link: Locator, pattern: RegExp) {
  const href = await link.getAttribute('href');
  expect(href).toMatch(pattern);
  await expect(link).toHaveAttribute('target', '_blank');
}

async function reveal(
  request: APIRequestContext,
  seal: string,
  actions: JudgeCombatAction[],
) {
  return request.post('/api/judge-replay/reveal', { data: { seal, actions } });
}

test('production start, anti-peek, combat validation, reveal, proof rendering, and links', async ({ page, request }) => {
  const started = await request.post('/api/judge-replay/start', { data: { direction: 'UP' } });
  expect(started.status()).toBe(200);
  const startedBody = await started.json() as { replay: { seal: string; revealAfter: number } };

  const sealed = await reveal(request, startedBody.replay.seal, VALID_ACTIONS);
  expect(sealed.status()).toBe(425);
  const sealedBody = await sealed.json() as { retryAfter: number };
  const waitSeconds = Math.max(1, sealedBody.retryAfter ?? startedBody.replay.revealAfter - Math.floor(Date.now() / 1_000));
  await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 1) * 1_000));

  const invalid = await reveal(request, startedBody.replay.seal, [{ room: 8, action: 'attack' }]);
  expect(invalid.status()).toBe(422);
  const valid = await reveal(request, startedBody.replay.seal, VALID_ACTIONS);
  expect(valid.status()).toBe(200);
  const validBody = await valid.json() as {
    replayProof: { verified: boolean };
    combatProof: { verified: boolean };
    onchainSettlement: { verified: boolean };
  };
  expect(validBody.replayProof.verified).toBe(true);
  expect(validBody.combatProof.verified).toBe(true);
  expect(validBody.onchainSettlement.verified).toBe(true);

  await page.goto('/');
  await page.getByRole('button', { name: /2-MIN JUDGE DEMO/ }).click();
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).click();
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  const guardStep = page.getByLabel('Judge Demo progress').locator('span').filter({ hasText: 'DEFEAT GUARD' });
  await expect(guardStep).toHaveClass(/active/, { timeout: 20_000 });
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const secondAttack = page.getByRole('button', { name: /ATTACK/ });
  if (await secondAttack.isVisible()) await secondAttack.click();

  const revealButton = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(revealButton).toBeEnabled({ timeout: 30_000 });
  await revealButton.click();
  await expect(page.getByText('✓ COMBAT + COMMITMENT + INDEPENDENT RPC VERIFIED')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();

  await expectLiveLink(page.getByRole('link', { name: /RPC VERIFICATION SNAPSHOT/ }), /^https:\/\/explorer\.somnia\.network\/block\/\d+$/);
  const addressLinks = page.locator('.proof-revealed a[href*="/address/"]');
  await expect(addressLinks).toHaveCount(4);
  for (const link of await addressLinks.all()) {
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/explorer\.somnia\.network\/address\/0x[0-9a-fA-F]{40}$/);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expectLiveLink(page.getByRole('link', { name: /continue on dreamdex/i }), /^https:\/\/app\.dreamdex\.io\/event-contracts\/WBTC:USDso\/(?:5m|15m)$/);
});
