import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext } from '@playwright/test';

import type { JudgeCombatAction } from '../../app/judge-combat';
import { SHANNON_TESTNET_PROFILE } from '../../app/judge-network';
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

async function reveal(
  request: APIRequestContext,
  seal: string,
  actions: JudgeCombatAction[],
) {
  return request.post('/api/shannon/judge-replay/reveal', { data: { seal, actions } });
}

test('live Shannon target remains network-bound through proof export and verifier round-trip', async ({ page, request }) => {
  await page.route('**/_vercel/insights/**', async (route) => route.abort());

  const started = await request.post('/api/shannon/judge-replay/start', { data: { direction: 'UP' } });
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
      publicMarket: {
        profileId: typeof SHANNON_TESTNET_PROFILE.id;
        chainId: typeof SHANNON_TESTNET_PROFILE.chainId;
      };
      lockAttestation: ReplayLockAttestation;
    };
  };
  expect(startedBody.replay.publicMarket.profileId).toBe(SHANNON_TESTNET_PROFILE.id);
  expect(startedBody.replay.publicMarket.chainId).toBe(SHANNON_TESTNET_PROFILE.chainId);
  expect(isReplayLockAttestation(startedBody.replay.lockAttestation)).toBe(true);
  expect(replayLockAttestationMatchesProof(startedBody.replay.lockAttestation, {
    commitment: startedBody.replay.commitment,
    lockedDirection: startedBody.replay.lockedDirection,
    issuedAt: startedBody.replay.issuedAt,
    revealAfter: startedBody.replay.revealAfter,
    expiresAt: startedBody.replay.expiresAt,
    profileId: startedBody.replay.publicMarket.profileId,
    chainId: startedBody.replay.publicMarket.chainId,
  })).toBe(true);

  const publicKeyResponse = await request.get('/api/shannon/judge-replay/public-key');
  expect(publicKeyResponse.status()).toBe(200);
  expect(publicKeyResponse.headers()['cache-control']).toContain('no-store');
  const publicKey = await publicKeyResponse.json();
  expect(isReplayLockPublicKey(publicKey)).toBe(true);
  expect(publicKey.profileId).toBe(SHANNON_TESTNET_PROFILE.id);
  expect(publicKey.chainId).toBe(SHANNON_TESTNET_PROFILE.chainId);
  expect(await verifyReplayLockAttestation(startedBody.replay.lockAttestation, publicKey)).toBe(true);

  const validActions = validLiveJudgeActions(startedBody.replay.gameSeed);
  const sealed = await reveal(request, startedBody.replay.seal, validActions);
  expect(sealed.status()).toBe(425);
  const sealedBody = await sealed.json() as { retryAfter: number };
  const waitSeconds = Math.max(
    1,
    sealedBody.retryAfter ?? startedBody.replay.revealAfter - Math.floor(Date.now() / 1_000),
  );
  await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 1) * 1_000));

  const invalid = await reveal(request, startedBody.replay.seal, [{ room: 8, action: 'attack' }]);
  expect(invalid.status()).toBe(422);
  const valid = await reveal(request, startedBody.replay.seal, validActions);
  expect(valid.status()).toBe(200);
  const validBody = await valid.json() as {
    lockAttestation: ReplayLockAttestation;
    replayProof: ReplayProof;
    combatProof: { verified: boolean };
    onchainSettlement: { verified: boolean; chainId: number };
  };
  expect(validBody.replayProof.verified).toBe(true);
  expect(validBody.replayProof.profileId).toBe(SHANNON_TESTNET_PROFILE.id);
  expect(validBody.replayProof.chainId).toBe(SHANNON_TESTNET_PROFILE.chainId);
  expect(validBody.onchainSettlement).toMatchObject({
    verified: true,
    chainId: SHANNON_TESTNET_PROFILE.chainId,
  });
  expect(validBody.combatProof.verified).toBe(true);
  expect(sameReplayLockAttestation(validBody.lockAttestation, startedBody.replay.lockAttestation)).toBe(true);
  expect(replayLockAttestationMatchesProof(validBody.lockAttestation, validBody.replayProof)).toBe(true);
  expect(await verifyReplayLockAttestation(validBody.lockAttestation, publicKey)).toBe(true);

  await page.goto('/shannon/judge?automation=1');
  await expect(page.locator('.safety-line')).toContainText('SHANNON TESTNET');
  await expect(page.locator('.judge-lock-context')).toContainText('OPENING PRICE SEALED');
  await expect(page.getByText('REFERENCE UNAVAILABLE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS' }).click();
  await page.getByRole('button', { name: /ATTACK/ }).click();
  const secondAttack = page.getByRole('button', { name: /ATTACK/ });
  if (await secondAttack.isVisible()) await secondAttack.click();

  const revealButton = page.getByRole('button', { name: '🔮 REVEAL BOSS FATE' });
  await expect(revealButton).toBeEnabled({ timeout: 30_000 });
  await revealButton.click();
  await expect(page.getByText(/JUDGE DEMO COMPLETE · ONCHAIN (?:RESULT|LOSS) VERIFIED/)).toBeVisible({ timeout: 30_000 });
  const revealedProof = page.locator('.proof-revealed');
  await revealedProof.locator('summary').click();
  await expect(page.getByText('CHAIN 50312 · EIP-1898 HASH-PINNED · BOTH RAW ETH_CALL RESULTS MATCH')).toBeVisible();
  await expect(page.getByRole('link', { name: /continue on dreamdex/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /OPEN INDEPENDENT VERIFIER/ })).toHaveAttribute('href', '/shannon/verify');
  const xShare = page.getByRole('link', { name: '2 · OPEN X DRAFT ↗', exact: true });
  await expect(xShare).toHaveAttribute('href', /https:\/\/twitter\.com\/intent\/tweet\?/);
  await expect(xShare).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('button', { name: '1 · SAVE IMAGE', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Share your Market Dungeon result' }).getByRole('img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const [proofDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '1 · DOWNLOAD PROOF JSON' }).click(),
  ]);
  const proofPath = await proofDownload.path();
  expect(proofPath).not.toBeNull();
  const proofBytes = await readFile(proofPath!);
  const proofText = proofBytes.toString('utf8');
  const exportedProof = JSON.parse(proofText) as {
    schema: string;
    networkProfile: { profileId: string; chainId: number };
    summary: { result: string; market: string; lockedDirection: string; winningOutcome: string };
  };
  expect(exportedProof).toMatchObject({
    schema: 'market-dungeon/verified-judge-run/v3',
    networkProfile: {
      profileId: SHANNON_TESTNET_PROFILE.id,
      chainId: SHANNON_TESTNET_PROFILE.chainId,
    },
  });

  await page.goto('/shannon/verify?automation=1');
  await expect(page.getByLabel('Verification privacy and safety')).toContainText(SHANNON_TESTNET_PROFILE.name);
  await page.locator('input[type="file"]').setInputFiles({
    name: proofDownload.suggestedFilename(),
    mimeType: 'application/json',
    buffer: proofBytes,
  });
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();
  const verifierResult = page.getByRole('region', { name: 'Proof verification result' });
  await expect(verifierResult.locator('strong').first()).toHaveText('PASS', { timeout: 30_000 });
  await expect(verifierResult.getByText(exportedProof.summary.result, { exact: true })).toBeVisible();
  await expect(verifierResult.getByText(exportedProof.summary.market, { exact: true })).toBeVisible();
  await expect(verifierResult.locator('article').filter({ hasText: 'Server lock receipt' })).toContainText('PASS');
  await expect(verifierResult.locator('article').filter({ hasText: 'Live Somnia re-fetch' })).toContainText('PASS');
});
