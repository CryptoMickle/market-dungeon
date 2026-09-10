import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { judgePolicyActions } from './judge-live-actions.ts';

import {
  JUDGE_COMBAT,
  canonicalJudgeActionLog,
  hashSeed,
  replayJudgeCombat,
  seededRoll,
  type JudgeCombatAction,
} from '../app/judge-combat.ts';

const GAME_SEED = 'A'.repeat(43);

test('v1 archives replay under their original rules and cannot be relabeled v2', () => {
  const actions: JudgeCombatAction[] = [{ room: 8, action: 'attack' }, { room: 9, action: 'attack' }, { room: 9, action: 'attack' }];
  assert.equal(replayJudgeCombat(GAME_SEED, actions, 'market-dungeon/judge-combat/v1').verified, true);
  assert.equal(replayJudgeCombat(GAME_SEED, actions).verified, false);
  assert.notEqual(canonicalJudgeActionLog(GAME_SEED, actions), canonicalJudgeActionLog(GAME_SEED, actions, 'market-dungeon/judge-combat/v1'));
});

test('v2 balance rewards healing while remaining a short combat walkthrough across 2000 seeds', () => {
  const results = [];
  for (const policy of ['careful', 'attack-only', 'storm-only'] as const) {
    let wins = 0, steps = 0, hp = 0, potions = 0;
    for (let index = 0; index < 2000; index += 1) {
      const seed = createHash('sha256').update(`balance-v2-${index}`).digest('base64url');
      const actions = judgePolicyActions(seed, policy);
      const replay = replayJudgeCombat(seed, actions);
      wins += Number(replay.verified); steps += actions.length; hp += replay.finalHp;
      potions += actions.filter((entry) => entry.action === 'potion').length;
      assert.ok(actions.length <= 16, 'bounded short combat, including losses');
    }
    results.push({ policy, wins, seeds: 2000, averageActions: steps / 2000, averageFinalHp: hp / 2000, averagePotions: potions / 2000 });
  }
  assert.equal(results[0].wins, 2000);
  assert.ok(results[0].averageActions >= 7 && results[0].averageActions <= 11);
  assert.ok(results[0].averagePotions >= 1);
  assert.ok(results[1].wins < 1950 && results[1].wins > 1500);
  assert.ok(results[2].wins < results[1].wins);
  console.log('Deterministic balance simulation (not human testing):', JSON.stringify(results));
});

function verifiedActions() {
  const actions: JudgeCombatAction[] = [
    { room: 8, action: 'potion' },
    { room: 8, action: 'storm' },
  ];
  let replay = replayJudgeCombat(GAME_SEED, actions);
  while (!replay.guardDefeated && replay.playerSurvived && actions.length < JUDGE_COMBAT.maxSteps) {
    actions.push({ room: 8, action: 'attack' });
    replay = replayJudgeCombat(GAME_SEED, actions);
  }
  actions.push({ room: 9, action: 'potion' });
  replay = replayJudgeCombat(GAME_SEED, actions);
  while (!replay.bossDefeated && replay.playerSurvived && actions.length < JUDGE_COMBAT.maxSteps) {
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

test('seeded rolls remain in the half-open range even for the maximum uint32 hash', () => {
  const maximumHashSeed = String.fromCharCode(2, 41, 247, 223, 7);
  assert.equal(hashSeed(maximumHashSeed), 0xffff_ffff);

  const roll = seededRoll(maximumHashSeed);
  assert.equal(roll, 0xffff_ffff / 0x1_0000_0000);
  assert.ok(roll >= 0 && roll < 1);
  assert.equal(Math.floor(roll * 18), 17);
});

test('incomplete, out-of-order, and post-terminal transcripts fail closed', () => {
  const incomplete = replayJudgeCombat(GAME_SEED, [{ room: 8, action: 'attack' }]);
  assert.equal(incomplete.verified, false);
  assert.equal(incomplete.guardDefeated, false);
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
  assert.match(first, /market-dungeon\/judge-combat\/v2/);
  assert.notEqual(first, canonicalJudgeActionLog(GAME_SEED, [
    { room: 8, action: 'storm' },
    { room: 9, action: 'attack' },
  ]));
  assert.notEqual(first, canonicalJudgeActionLog('B'.repeat(43), [
    { room: 8, action: 'attack' },
    { room: 9, action: 'storm' },
  ]));
});
