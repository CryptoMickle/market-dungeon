import assert from 'node:assert/strict';
import test from 'node:test';

import { replayJudgeCombat } from '../app/judge-combat.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';

test('live smoke derives bounded terminal combat traces with healing', () => {
  const ordinarySeed = 'A'.repeat(43);
  const criticalHitSeed = '9YW6Dlyt27J2hlXV3KDjCSXwYLPVAL30PvVNrueYl_0';

  const ordinaryActions = validLiveJudgeActions(ordinarySeed);
  const criticalHitActions = validLiveJudgeActions(criticalHitSeed);

  assert.ok(ordinaryActions.length >= 5 && ordinaryActions.length <= 12);
  assert.ok(criticalHitActions.length >= 5 && criticalHitActions.length <= 12);
  assert.equal(replayJudgeCombat(ordinarySeed, ordinaryActions).verified, true);
  assert.equal(replayJudgeCombat(criticalHitSeed, criticalHitActions).verified, true);
});
