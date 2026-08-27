import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JUDGE_COMBAT,
  canonicalJudgeActionLog,
  replayJudgeCombat,
  type JudgeCombatAction,
} from '../app/judge-combat.ts';

const GAME_SEED = 'A'.repeat(43);

function verifiedActions() {
  const actions: JudgeCombatAction[] = [
    { room: 8, action: 'potion' },
    { room: 8, action: 'storm' },
  ];
  let replay = replayJudgeCombat(GAME_SEED, actions);
  while (!replay.guardDefeated) {
    actions.push({ room: 8, action: 'attack' });
    replay = replayJudgeCombat(GAME_SEED, actions);
  }
  actions.push({ room: 9, action: 'potion' });
  replay = replayJudgeCombat(GAME_SEED, actions);
  while (!replay.bossDefeated) {
    actions.push({ room: 9, action: 'attack' });
    replay = replayJudgeCombat(GAME_SEED, actions);
  }
  assert.equal(replay.verified, true);
  return actions;
}

test('server replay validates Attack, Storm, and Potion through both Judge fights', () => {
  const actions = verifiedActions();
  const replay = replayJudgeCombat(GAME_SEED, actions);
  assert.equal(replay.verified, true);
  assert.equal(replay.guardDefeated, true);
  assert.equal(replay.bossDefeated, true);
  assert.equal(replay.playerSurvived, true);
  assert.ok(replay.finalHp > 0);
  assert.ok(actions.some((entry) => entry.action === 'attack'));
  assert.ok(actions.some((entry) => entry.action === 'storm'));
  assert.ok(actions.some((entry) => entry.action === 'potion'));
});

test('incomplete, out-of-order, and post-terminal transcripts fail closed', () => {
  const incomplete = replayJudgeCombat(GAME_SEED, [{ room: 8, action: 'attack' }]);
  assert.equal(incomplete.verified, false);
  assert.equal(incomplete.guardDefeated, true);
  assert.equal(incomplete.bossDefeated, false);

  const outOfOrder = replayJudgeCombat(GAME_SEED, [{ room: 9, action: 'attack' }]);
  assert.equal(outOfOrder.verified, false);
  assert.equal(outOfOrder.reason, 'Boss entered before guard defeat');

  const afterTerminal = replayJudgeCombat(GAME_SEED, [
    ...verifiedActions(),
    { room: 9, action: 'attack' },
  ]);
  assert.equal(afterTerminal.verified, false);
  assert.equal(afterTerminal.reason, 'Action after terminal state');
});

test('potion inventory, action schema, seed, and step limits are enforced', () => {
  const noPotions = replayJudgeCombat(GAME_SEED, [
    { room: 8, action: 'potion' },
    { room: 8, action: 'potion' },
    { room: 8, action: 'potion' },
  ]);
  assert.equal(noPotions.verified, false);
  assert.equal(noPotions.reason, 'Invalid combat potion');

  const extraField = replayJudgeCombat(GAME_SEED, [
    { room: 8, action: 'attack', debug: true } as unknown as JudgeCombatAction,
  ]);
  assert.equal(extraField.reason, 'Invalid action entry');

  assert.equal(replayJudgeCombat('invalid seed', [{ room: 8, action: 'attack' }]).reason, 'Invalid game seed');
  assert.equal(replayJudgeCombat(GAME_SEED, Array.from(
    { length: JUDGE_COMBAT.maxSteps + 1 },
    () => ({ room: 8, action: 'storm' }) as JudgeCombatAction,
  )).reason, 'Invalid action count');
});

test('canonical transcript binds seed, order, room, and action', () => {
  const first = canonicalJudgeActionLog(GAME_SEED, [
    { room: 8, action: 'attack' },
    { room: 9, action: 'storm' },
  ]);
  assert.match(first, /market-dungeon\/judge-combat\/v1/);
  assert.notEqual(first, canonicalJudgeActionLog(GAME_SEED, [
    { room: 8, action: 'storm' },
    { room: 9, action: 'attack' },
  ]));
  assert.notEqual(first, canonicalJudgeActionLog('B'.repeat(43), [
    { room: 8, action: 'attack' },
    { room: 9, action: 'storm' },
  ]));
});
