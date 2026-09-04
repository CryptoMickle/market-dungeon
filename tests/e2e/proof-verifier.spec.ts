import { expect, test } from '@playwright/test';

import type { ReplayCombatProof, ReplayProof } from '../../app/replay-proof';
import { verifiedRunProofJson, type VerifiedRunProofInput } from '../../app/share-verified-run';
import {
  VALID_ACTIONS,
  LOCK_ATTESTATION,
  LOCK_PUBLIC_KEY,
  onchainSettlement,
  revealPayload,
} from './judge-demo-fixture';

function exportedProof() {
  const reveal = revealPayload(VALID_ACTIONS);
  const input: VerifiedRunProofInput = {
    result: 'BLESSED',
    intervalSec: 300,
    replayProof: reveal.replayProof as ReplayProof,
    combatProof: reveal.combatProof as ReplayCombatProof,
    combatActions: VALID_ACTIONS,
    onchainSettlement: reveal.onchainSettlement,
    lockAttestation: LOCK_ATTESTATION,
  };
  return verifiedRunProofJson(input, '2026-09-04T08:00:00.000Z');
}

test('standalone verifier accepts an exported proof and rejects a tampered copy', async ({ page }) => {
  let rpcCalls = 0;
  let publicKeyCalls = 0;
  let replayOrIndexerCalls = 0;

  await page.route('**/api/judge-replay/**', async (route) => {
    replayOrIndexerCalls += 1;
    await route.abort();
  });
  await page.route('**/api/judge-replay/public-key', async (route) => {
    publicKeyCalls += 1;
    await route.fulfill({ json: LOCK_PUBLIC_KEY });
  });
  await page.route('https://prd.smk.somnia.host/**', async (route) => {
    replayOrIndexerCalls += 1;
    await route.abort();
  });
  await page.route('https://api.infra.mainnet.somnia.network/**', async (route) => {
    rpcCalls += 1;
    const request = route.request().postDataJSON() as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (request.method === 'eth_chainId') result = '0x13a7';
    else if (request.method === 'eth_getBlockByHash') {
      result = { number: onchainSettlement.blockTag, hash: onchainSettlement.blockHash };
    } else if (request.method === 'eth_call') {
      const call = request.params[0] as { to?: string };
      result = call.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
        ? onchainSettlement.calls.moduleMarket.result
        : onchainSettlement.calls.settlementRecord.result;
    } else {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }),
    });
  });

  await page.goto('/verify');
  await expect(page.getByRole('heading', { name: 'Verify a completed run.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'VERIFY PROOF' })).toBeDisabled();
  await expect(page.getByLabel('Verification privacy and safety')).toContainText('proof contents and verification results are never sent to analytics');
  await expect(page.getByLabel('Verification privacy and safety')).toContainText('proof file is not uploaded');

  const proof = exportedProof();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'market-dungeon-proof.json',
    mimeType: 'application/json',
    buffer: Buffer.from(proof),
  });
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();

  const result = page.getByRole('region', { name: 'Proof verification result' });
  await expect(result.locator('strong').first()).toHaveText('PASS');
  await expect(result.getByText('Live Somnia re-fetch')).toBeVisible();
  await expect(result.locator('details')).not.toHaveAttribute('open', '');
  expect(rpcCalls).toBe(4);
  expect(publicKeyCalls).toBe(1);
  expect(replayOrIndexerCalls).toBe(0);

  const tampered = JSON.parse(proof) as {
    combat: { actions: Array<{ room: number; action: string }> };
  };
  tampered.combat.actions[0]!.action = 'storm';
  await page.getByLabel('OR PASTE PROOF JSON').fill(JSON.stringify(tampered));
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();

  await expect(result.locator('strong').first()).toHaveText('FAIL');
  await expect(result.getByText('Combat transcript')).toBeVisible();
  expect(rpcCalls).toBe(4);
  expect(publicKeyCalls).toBe(1);
  expect(replayOrIndexerCalls).toBe(0);

  const signatureTamper = JSON.parse(proof) as {
    lockAttestation: { signature: string };
  };
  signatureTamper.lockAttestation.signature = `${signatureTamper.lockAttestation.signature[0] === 'A' ? 'B' : 'A'}${signatureTamper.lockAttestation.signature.slice(1)}`;
  await page.getByLabel('OR PASTE PROOF JSON').fill(JSON.stringify(signatureTamper));
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();

  await expect(result.locator('strong').first()).toHaveText('FAIL');
  await expect(result.getByText('Server lock receipt')).toBeVisible();
  expect(rpcCalls).toBe(4);
  expect(publicKeyCalls).toBe(2);
  expect(replayOrIndexerCalls).toBe(0);
});

test('standalone verifier reports NOT PROVABLE when the public attestation key is unavailable', async ({ page }) => {
  let rpcCalls = 0;
  await page.route('**/api/judge-replay/public-key', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } });
  });
  await page.route('https://api.infra.mainnet.somnia.network/**', async (route) => {
    rpcCalls += 1;
    const request = route.request().postDataJSON() as { id: number; method: string; params: unknown[] };
    let result: unknown;
    if (request.method === 'eth_chainId') result = '0x13a7';
    else if (request.method === 'eth_getBlockByHash') result = { number: onchainSettlement.blockTag, hash: onchainSettlement.blockHash };
    else {
      const call = request.params[0] as { to?: string };
      result = call.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
        ? onchainSettlement.calls.moduleMarket.result
        : onchainSettlement.calls.settlementRecord.result;
    }
    await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result } });
  });

  await page.goto('/verify');
  await page.getByLabel('OR PASTE PROOF JSON').fill(exportedProof());
  await page.getByRole('button', { name: 'VERIFY PROOF' }).click();

  const result = page.getByRole('region', { name: 'Proof verification result' });
  await expect(result.locator('strong').first()).toHaveText('NOT PROVABLE');
  await expect(result.getByText('Server lock receipt')).toBeVisible();
  expect(rpcCalls).toBe(4);
});
