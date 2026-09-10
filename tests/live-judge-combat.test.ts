import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JUDGE_COMBAT, replayJudgeCombat, type JudgeCombatAction, type JudgeCombatRuleset } from '../app/judge-combat.ts';
import { liveJudgeCombatState } from '../app/live-judge-combat.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';

const GAME_SEED = 'g'.repeat(43);

test('combat proof replay retains the pre-refactor results for 3,264 legacy and current trace prefixes', () => {
  // Captured from the original verifier before sharing its calculation with the
  // live UI. Covers empty, partial, terminal and invalid actions for both versions.
  const results = [];
  for (const ruleset of ['market-dungeon/judge-combat/v1', 'market-dungeon/judge-combat/v2'] as JudgeCombatRuleset[]) {
    for (let seed = 0; seed < 32; seed++) {
      const gameSeed = 'g'.repeat(40) + seed.toString().padStart(3, '0');
      for (const policy of ['attack', 'storm', 'mixed'] as const) {
        const actions: JudgeCombatAction[] = Array.from({ length: 16 }, (_, step) => ({
          room: step < 4 ? 8 : 9,
          action: policy === 'mixed' ? step % 3 === 2 ? 'potion' : 'attack' : policy,
        }));
        for (let length = 0; length <= actions.length; length++) results.push(replayJudgeCombat(gameSeed, actions.slice(0, length), ruleset));
      }
    }
  }
  assert.equal(results.length, 3264);
  assert.equal(createHash('sha256').update(JSON.stringify(results)).digest('hex'), 'e3cd0d30b42e8a1b0b88111cf0bb37c178f1ede6e32758decf38c77ee9a42d97');
});

test('live combat opens with a valid fixed loadout without making an empty combat proof valid', () => {
  assert.deepEqual(liveJudgeCombatState(GAME_SEED, []), {
    hp: 76, potions: 2, guardHp: 40, bossHp: 72, turn: 0, potionUses: 0,
    phase: 'guard', lastExchange: null, valid: true, reason: null,
  });
  assert.equal(replayJudgeCombat(GAME_SEED, []).verified, false);
  assert.equal(liveJudgeCombatState('invalid', []).valid, false);
});

test('partial live state tracks verified HP and potions, safe healing, a real boss entrance and finishing feedback', () => {
  const actions = validLiveJudgeActions(GAME_SEED);
  const frozen = JSON.stringify(actions);
  let sawSafeHeal = false;
  let sawCombatPotion = false;
  let sawGuardFinish = false;
  for (let length = 1; length <= actions.length; length++) {
    const prefix = actions.slice(0, length);
    const before = liveJudgeCombatState(GAME_SEED, prefix.slice(0, -1));
    const state = liveJudgeCombatState(GAME_SEED, prefix);
    const replay = replayJudgeCombat(GAME_SEED, prefix);
    assert.equal(state.valid, true);
    assert.equal(state.hp, replay.finalHp);
    assert.equal(state.potions, replay.remainingPotions);
    assert.equal(state.guardHp === 0, replay.guardDefeated);
    assert.equal(state.bossHp === 0, replay.bossDefeated);
    assert.equal(state.phase === 'complete', replay.verified);
    if (state.guardHp === 0 && before.guardHp > 0) {
      sawGuardFinish = true;
      assert.equal(state.phase, 'between');
      assert.equal(state.lastExchange?.taken, 0);
      assert.equal(state.lastExchange?.dealt, before.guardHp);
      const entered = liveJudgeCombatState(GAME_SEED, prefix, { bossEntered: true });
      assert.equal(entered.phase, 'boss');
      assert.equal(entered.hp, state.hp);
      assert.equal(entered.potions, state.potions);
      assert.equal(entered.turn, 0);
      assert.equal(entered.potionUses, 0);
      assert.equal(entered.lastExchange, null);
    }
    if (before.phase === 'between' && actions[length - 1].action === 'potion') {
      sawSafeHeal = true;
      assert.equal(state.lastExchange?.taken, 0);
      assert.equal(state.hp, Math.min(100, before.hp + 25));
      assert.equal(state.potions, before.potions - 1);
    } else if (actions[length - 1].action === 'potion') {
      sawCombatPotion = true;
      assert.ok(state.lastExchange!.taken > 0);
      assert.equal(state.hp, Math.max(0, before.hp + state.lastExchange!.healed! - state.lastExchange!.taken));
    }
  }
  const terminal = liveJudgeCombatState(GAME_SEED, actions);
  assert.equal(terminal.phase, 'complete');
  assert.equal(terminal.bossHp, 0);
  assert.equal(terminal.lastExchange?.taken, 0);
  assert.ok(terminal.lastExchange!.rolledDamage! >= terminal.lastExchange!.dealt);
  assert.ok(sawGuardFinish && sawSafeHeal && sawCombatPotion);
  assert.equal(JSON.stringify(actions), frozen);
});

test('live combat rejects illegal transitions and actions after boss defeat', () => {
  assert.equal(liveJudgeCombatState(GAME_SEED, [{ room: 9, action: 'attack' }]).reason, 'Boss entered before guard defeat');
  const actions = validLiveJudgeActions(GAME_SEED);
  const tooLate = liveJudgeCombatState(GAME_SEED, [...actions, { room: 9, action: 'attack' }]);
  assert.equal(tooLate.valid, false);
  assert.equal(tooLate.reason, 'Action after terminal state');
  assert.equal(tooLate.phase, 'complete');
  assert.equal(liveJudgeCombatState(GAME_SEED, Array.from({ length: JUDGE_COMBAT.maxSteps + 1 }, () => ({ room: 8, action: 'attack' }))).valid, false);
});

test('live combat death stays terminal and cannot be promoted to a boss entrance', () => {
  const seed = 'a'.repeat(42) + '5';
  const actions: JudgeCombatAction[] = Array.from({ length: 8 }, (_, step) => ({ room: step < 4 ? 8 : 9, action: 'storm' }));
  const state = liveJudgeCombatState(seed, actions, { bossEntered: true });
  assert.equal(state.valid, true);
  assert.equal(state.phase, 'dead');
  assert.equal(state.hp, 0);
  assert.equal(state.guardHp, 0);
  assert.ok(state.bossHp > 0);
  assert.equal(replayJudgeCombat(seed, actions).verified, false);
});
