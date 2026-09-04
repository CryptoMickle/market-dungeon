import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const workflowsDirectory = new URL('../.github/workflows/', import.meta.url);

test('GitHub workflows use least privilege and immutable external action references', () => {
  let externalActions = 0;

  for (const filename of readdirSync(workflowsDirectory)) {
    if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) continue;
    const workflow = readFileSync(new URL(filename, workflowsDirectory), 'utf8');
    assert.match(workflow, /^permissions:\n  contents: read$/m, `${filename} must grant only read access by default`);

    for (const match of workflow.matchAll(/^\s*- uses:\s+([^\s#]+)/gm)) {
      const reference = match[1];
      if (reference.startsWith('./')) continue;
      externalActions += 1;
      assert.match(
        reference,
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/,
        `${filename} contains a mutable action reference: ${reference}`,
      );
    }
  }

  assert.ok(externalActions > 0, 'expected at least one external action reference');
});

test('manual live smoke binds a Market Dungeon deployment to the workflow commit', () => {
  const workflow = readFileSync(new URL('live-smoke.yml', workflowsDirectory), 'utf8');

  assert.match(workflow, /EXPECTED_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /node --experimental-strip-types scripts\/validate-live-target\.ts/);

  const validator = readFileSync(new URL('../scripts/validate-live-target.ts', import.meta.url), 'utf8');
  assert.match(validator, /new URL\('\/api\/build', origin\)/);
  assert.match(validator, /market-dungeon\/build-identity\/v1/);
  assert.match(validator, /host\.startsWith\('market-dungeon-'\)/);
  assert.match(validator, /identity\.commit !== expectedCommit\.toLowerCase\(\)/);
  assert.match(validator, /url\.port/);
});
