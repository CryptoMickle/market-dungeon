import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';
import {
  isReplayLockAttestation,
  isReplayLockPublicKey,
  replayLockAttestationMatchesProof,
  sameReplayLockAttestation,
  verifyReplayLockAttestation,
  type ReplayLockAttestation,
  type ReplayProof,
} from '../../app/replay-proof';
import { validLiveJudgeActions } from '../judge-live-actions';

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

test('live target start, anti-peek, combat validation, reveal, proof rendering, and links', async ({ page, request }) => {
  const started = await request.post('/api/judge-replay/start', { data: { direction: 'UP' } });
  expect(started.status()).toBe(200);
  const startedBody = await started.json() as {
    replay: {
      seal: string;
      commitment: string;
      gameSeed: string;
      lockedDirection: 'UP';
      issuedAt: number;
      revealAfter: number;
      expiresAt: number;
      lockAttestation: ReplayLockAttestation;
    };
  };
  expect(isReplayLockAttestation(startedBody.replay.lockAttestation)).toBe(true);
  expect(replayLockAttestationMatchesProof(startedBody.replay.lockAttestation, {
    commitment: startedBody.replay.commitment,
    lockedDirection: startedBody.replay.lockedDirection,
    issuedAt: startedBody.replay.issuedAt,
    revealAfter: startedBody.replay.revealAfter,
    expiresAt: startedBody.replay.expiresAt,
  })).toBe(true);
  const publicKeyResponse = await request.get('/api/judge-replay/public-key');
  expect(publicKeyResponse.status()).toBe(200);
  expect(publicKeyResponse.headers()['cache-control']).toContain('no-store');
  const publicKey = await publicKeyResponse.json();
  expect(isReplayLockPublicKey(publicKey)).toBe(true);
  expect(await verifyReplayLockAttestation(startedBody.replay.lockAttestation, publicKey)).toBe(true);
  const validActions = validLiveJudgeActions(startedBody.replay.gameSeed);

  const sealed = await reveal(request, startedBody.replay.seal, validActions);
  expect(sealed.status()).toBe(425);
  const sealedBody = await sealed.json() as { retryAfter: number };
  const waitSeconds = Math.max(1, sealedBody.retryAfter ?? startedBody.replay.revealAfter - Math.floor(Date.now() / 1_000));
  await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 1) * 1_000));

  const invalid = await reveal(request, startedBody.replay.seal, [{ room: 8, action: 'attack' }]);
  expect(invalid.status()).toBe(422);
  const valid = await reveal(request, startedBody.replay.seal, validActions);
  expect(valid.status()).toBe(200);
  const validBody = await valid.json() as {
    lockAttestation: ReplayLockAttestation;
    replayProof: ReplayProof;
    combatProof: { verified: boolean };
    onchainSettlement: { verified: boolean };
  };
  expect(validBody.replayProof.verified).toBe(true);
  expect(sameReplayLockAttestation(validBody.lockAttestation, startedBody.replay.lockAttestation)).toBe(true);
  expect(replayLockAttestationMatchesProof(validBody.lockAttestation, validBody.replayProof)).toBe(true);
  expect(await verifyReplayLockAttestation(validBody.lockAttestation, publicKey)).toBe(true);
  expect(validBody.combatProof.verified).toBe(true);
  expect(validBody.onchainSettlement.verified).toBe(true);

  await page.goto('/?automation=1');
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
  await expect(page.getByText('✓ COMBAT + CHOICE LOCK + SOMNIA RESULT VERIFIED')).toBeVisible({ timeout: 30_000 });
  const revealedProof = page.locator('.proof-revealed');
  await expect(revealedProof).not.toHaveAttribute('open', '');
  await revealedProof.locator('summary').click();
  await expect(page.getByText('✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE')).toBeVisible();
  await expect(page.getByText('FINAL-TIER JUDGE REPLAY · 2/2 REPLAY ENCOUNTERS')).toBeVisible();
  await expect(page.getByText(/ROOM 40\/40/)).toHaveCount(0);
  await expectLiveLink(page.getByRole('link', { name: /OPEN INDEPENDENT VERIFIER/ }), /^\/verify$/);

  await expectLiveLink(page.getByRole('link', { name: /RPC VERIFICATION SNAPSHOT/ }), /^https:\/\/explorer\.somnia\.network\/block\/\d+$/);
  const addressLinks = revealedProof.locator('a[href*="/address/"]');
  await expect(addressLinks).toHaveCount(4);
  for (const link of await addressLinks.all()) {
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/explorer\.somnia\.network\/address\/0x[0-9a-fA-F]{40}$/);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expectLiveLink(page.getByRole('link', { name: /continue on dreamdex/i }), /^https:\/\/app\.dreamdex\.io\/event-contracts\/WBTC:USDso\/(?:5m|15m)$/);
});
