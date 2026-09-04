import assert from 'node:assert/strict';
import test from 'node:test';

import {
  marketDungeonDeploymentOrigin,
  validateLiveTarget,
} from '../scripts/validate-live-target.ts';

const COMMIT = 'abcdef0123456789abcdef0123456789abcdef01';

test('live target accepts only clean Market Dungeon Vercel origins', () => {
  assert.equal(marketDungeonDeploymentOrigin('https://market-dungeon.vercel.app').origin, 'https://market-dungeon.vercel.app');
  assert.equal(
    marketDungeonDeploymentOrigin('https://market-dungeon-git-winner-v9-example.vercel.app').origin,
    'https://market-dungeon-git-winner-v9-example.vercel.app',
  );

  for (const value of [
    'http://market-dungeon.vercel.app',
    'https://unrelated.vercel.app',
    'https://market-dungeon.vercel.app:444',
    'https://market-dungeon.vercel.app/judge',
    'https://market-dungeon.vercel.app?candidate=v9',
    'https://user:pass@market-dungeon.vercel.app',
  ]) {
    assert.throws(() => marketDungeonDeploymentOrigin(value), /Market Dungeon Vercel deployment origin/);
  }
});

test('live target requires the deployment identity to match the exact workflow commit', async () => {
  const validFetch = async () => Response.json({
    schema: 'market-dungeon/build-identity/v1',
    app: 'market-dungeon',
    commit: COMMIT,
  });
  assert.deepEqual(
    await validateLiveTarget('https://market-dungeon.vercel.app', COMMIT.toUpperCase(), validFetch),
    { origin: 'https://market-dungeon.vercel.app', commit: COMMIT },
  );

  await assert.rejects(
    validateLiveTarget('https://market-dungeon.vercel.app', '1'.repeat(40), validFetch),
    /does not match the workflow commit/,
  );
  await assert.rejects(
    validateLiveTarget('https://market-dungeon.vercel.app', 'not-a-commit', validFetch),
    /full 40-character commit SHA/,
  );
});
