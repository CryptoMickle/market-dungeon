import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../app/api/build/route.ts';

const originalCommit = process.env.VERCEL_GIT_COMMIT_SHA;

test.after(() => {
  if (originalCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalCommit;
});

test('build identity exposes the exact lowercase Vercel commit without caching', async () => {
  process.env.VERCEL_GIT_COMMIT_SHA = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(await response.json(), {
    schema: 'market-dungeon/build-identity/v1',
    app: 'market-dungeon',
    commit: 'abcdef0123456789abcdef0123456789abcdef01',
  });
});

test('build identity fails closed when the deployment commit is unavailable', async () => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  const response = await GET();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    schema: 'market-dungeon/build-identity/v1',
    app: 'market-dungeon',
    error: 'Build commit unavailable.',
  });
});
