import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyLiveJudgeLockAttestation, verifyLiveJudgeLockSnapshot, verifyLiveJudgeProof } from '../app/live-judge-proof.ts';
import { liveJudgeFixture } from './e2e/live-judge-fixture.ts';

for (const outcome of [0, 1, 'VOID'] as const) test(`browser fixture for live outcome ${outcome} contains a coherent signature, pending block and independently verifiable settlement`, async () => {
  const fixture = liveJudgeFixture({ outcome });
  assert.equal(await verifyLiveJudgeLockAttestation(fixture.session.lock, fixture.session.lockAttestation, fixture.publicKey), true);
  assert.equal((await verifyLiveJudgeLockSnapshot(fixture.session.lock, fixture.rpc)).status, 'PASS');
  assert.equal((await verifyLiveJudgeProof(fixture.proof, { trustedKey: fixture.publicKey, rpc: fixture.rpc })).status, 'PASS');
});
