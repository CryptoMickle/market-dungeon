import assert from 'node:assert/strict';
import test from 'node:test';

import { replayJudgeCombat } from '../app/judge-combat.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';

test('live smoke derives the exact terminal combat trace for two- and three-hit seeds', () => {
  const ordinarySeed = 'A'.repeat(43);
  const criticalHitSeed = '9YW6Dlyt27J2hlXV3KDjCSXwYLPVAL30PvVNrueYl_0';

  const ordinaryActions = validLiveJudgeActions(ordinarySeed);
  const criticalHitActions = validLiveJudgeActions(criticalHitSeed);

  assert.equal(ordinaryActions.length, 3);
  assert.equal(criticalHitActions.length, 2);
  assert.equal(replayJudgeCombat(ordinarySeed, ordinaryActions).verified, true);
  assert.equal(replayJudgeCombat(criticalHitSeed, criticalHitActions).verified, true);
});
