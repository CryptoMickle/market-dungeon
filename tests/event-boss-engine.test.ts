import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FULL_RUN_MARKET_PROOF_VERSION,
  createMarketDungeonRun,
  transitionMarketDungeon,
  type BossOutcome,
  type BossPredictionLock,
  type MarketDungeonRun,
  type VerifiedBossSettlement,
} from '../app/gameplay/event-boss-engine.ts';
import { emptyGame, type GameplayRandom } from '../app/gameplay/delveworn-engine.ts';

function sequence(...values: number[]): GameplayRandom {
  let cursor = 0;
  return (maxExclusive) => {
    assert.ok(cursor < values.length, `missing deterministic roll for max ${maxExclusive}`);
    const value = values[cursor++];
    assert.ok(value >= 0 && value < maxExclusive);
    return value;
  };
}

const noRolls = sequence;

function marketId(number: number): string {
  return `0x${number.toString(16).padStart(64, '0')}`;
}

function lock(number: number): BossPredictionLock {
  return {
    attemptId: `attempt_${number}`,
    marketId: marketId(number),
    direction: number % 2 === 0 ? 'DOWN' : 'UP',
    mode: 'live',
    proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
    commitment: null,
  };
}

function nearBoss(overrides: Partial<ReturnType<typeof emptyGame>> = {}): MarketDungeonRun {
  const run = createMarketDungeonRun(sequence(0));
  return {
    ...run,
    phase: 'boss-lock-required',
    rematchRequired: true,
    game: {
      ...emptyGame(),
      hasStarted: true,
      active: true,
      roomsCleared: 9,
      monsterType: 3,
      monsterHp: 122,
      monsterMaxHp: 122,
      ...overrides,
    },
  };
}

function applyLock(run: MarketDungeonRun, number: number): MarketDungeonRun {
  const result = transitionMarketDungeon(run, { type: 'lock-boss', lock: lock(number) }, noRolls());
  assert.equal(result.accepted, true, result.reason);
  assert.equal(result.run.phase, 'boss-combat');
  return result.run;
}

function defeatBoss(run: MarketDungeonRun): MarketDungeonRun {
  const wounded = { ...run, game: { ...run.game, monsterHp: 1 } };
  const result = transitionMarketDungeon(wounded, { type: 'gameplay', action: { type: 'attack' } }, sequence(0, 99, 99, 0, 0));
  assert.equal(result.accepted, true, result.reason);
  assert.equal(result.run.phase, 'settlement-pending');
  assert.ok(result.run.pendingBossReward);
  return result.run;
}

function settlement(run: MarketDungeonRun, outcome: BossOutcome): VerifiedBossSettlement {
  assert.ok(run.currentAttempt);
  const attemptNumber = Number(run.currentAttempt.attemptId.replace('attempt_', ''));
  return { ...run.currentAttempt, marketId: marketId(attemptNumber), outcome };
}

function settle(run: MarketDungeonRun, outcome: BossOutcome): MarketDungeonRun {
  const result = transitionMarketDungeon(run, {
    type: 'settle-boss',
    settlement: settlement(run, outcome),
  }, noRolls());
  assert.equal(result.accepted, true, result.reason);
  return result.run;
}

test('BLESSED grants exactly one ordinary boss reward and relic after a bound attempt', () => {
  const pending = defeatBoss(applyLock(nearBoss(), 1));
  assert.deepEqual([pending.game.roomsCleared, pending.game.gold, pending.game.relicOfferAvailable], [9, 0, false]);

  const blessed = settle(pending, 'BLESSED');
  assert.deepEqual({
    phase: blessed.phase,
    rooms: blessed.game.roomsCleared,
    gold: blessed.game.gold,
    armor: blessed.game.armorLevel,
    offer: blessed.game.relicOfferId,
    attempts: blessed.attemptNumber,
  }, { phase: 'boss-reward', rooms: 10, gold: 43, armor: 1, offer: 1, attempts: 1 });

  const duplicate = transitionMarketDungeon(blessed, {
    type: 'settle-boss',
    settlement: settlement(pending, 'BLESSED'),
  }, noRolls());
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.run.game.gold, 43);

  const claimed = transitionMarketDungeon(blessed, {
    type: 'gameplay',
    action: { type: 'claim-relic', equip: false },
  }, noRolls());
  assert.equal(claimed.run.phase, 'boss-lock-required');
  assert.deepEqual(claimed.run.game.ownedRelics, [1]);
});

test('CURSED restores the same boss at full HP and preserves all player resources and revive state', () => {
  const initial = nearBoss({
    hp: 37,
    potions: 2,
    gold: 11,
    weaponLevel: 2,
    armorLevel: 1,
    equippedRelic: 8,
    ownedRelics: [8],
    relicCounts: Array.from({ length: 16 }, (_, id) => id === 8 ? 1 : 0),
    relicReviveUsed: true,
  });
  const cursed = settle(defeatBoss(applyLock(initial, 1)), 'CURSED');
  assert.deepEqual({
    phase: cursed.phase,
    rematch: cursed.rematchRequired,
    rooms: cursed.game.roomsCleared,
    bossHp: cursed.game.monsterHp,
    hp: cursed.game.hp,
    potions: cursed.game.potions,
    gold: cursed.game.gold,
    weapon: cursed.game.weaponLevel,
    armor: cursed.game.armorLevel,
    relic: cursed.game.equippedRelic,
    reviveUsed: cursed.game.relicReviveUsed,
  }, {
    phase: 'boss-lock-required', rematch: true, rooms: 9, bossHp: 122,
    hp: 37, potions: 2, gold: 11, weapon: 2, armor: 1, relic: 8, reviveUsed: true,
  });

  const campRetry = transitionMarketDungeon(cursed, {
    type: 'gameplay',
    action: { type: 'buy', item: 'camp-rest' },
  }, noRolls());
  assert.equal(campRetry.accepted, false, 'camp does not reopen between rematches');
});

test('wrong then right and several wrong predictions never duplicate boss rewards', () => {
  let run = nearBoss();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    run = settle(defeatBoss(applyLock(run, attempt)), 'CURSED');
    assert.deepEqual([run.game.roomsCleared, run.game.gold, run.game.relicOfferAvailable], [9, 0, false]);
  }
  run = settle(defeatBoss(applyLock(run, 4)), 'BLESSED');
  assert.deepEqual([run.game.roomsCleared, run.game.gold, run.game.relicOfferId], [10, 43, 1]);
  assert.equal(run.attemptNumber, 4);
  assert.equal(run.settlements.length, 4);
  assert.equal(new Set(run.usedMarketIds).size, 4);
});

test('VOID progresses normally while PENDING and NOT_PROVABLE freeze without consequence', () => {
  const pending = defeatBoss(applyLock(nearBoss(), 1));
  const waiting = settle(pending, 'PENDING');
  assert.equal(waiting, pending);
  assert.deepEqual([waiting.game.roomsCleared, waiting.game.gold, waiting.phase], [9, 0, 'settlement-pending']);
  const unknown = settle(waiting, 'NOT_PROVABLE');
  assert.equal(unknown, waiting);
  assert.equal(unknown.resolvedAttemptIds.length, 0);

  const voided = settle(unknown, 'VOID');
  assert.deepEqual([voided.game.roomsCleared, voided.game.gold, voided.phase], [10, 43, 'boss-reward']);
  assert.equal(voided.settlements[0].outcome, 'VOID');
});

test('pending settlement permits safe potion recovery without changing the bound attempt or rewards', () => {
  const pending = defeatBoss(applyLock(nearBoss({ hp: 28, potions: 2, combatPotionsUsed: 3 }), 1));
  const healed = transitionMarketDungeon(pending, { type: 'gameplay', action: { type: 'use-potion' } }, noRolls());
  assert.equal(healed.accepted, true);
  assert.deepEqual({ ...healed.run, game: pending.game }, pending);
  assert.equal(healed.run.game.hp, 53);
  assert.equal(healed.run.game.potions, 1);
  assert.equal(healed.run.game.combatPotionsUsed, 3);
  assert.equal(healed.run.game.lastMonsterDamage, 0);
  for (const key of ['gold', 'roomsCleared', 'monsterHp', 'equippedRelic', 'relicOfferAvailable'] as const) {
    assert.equal(healed.run.game[key], pending.game[key]);
  }
  const cursed = settle(healed.run, 'CURSED');
  assert.equal(cursed.game.hp, 53);
  assert.equal(cursed.game.potions, 1);
  const blessed = settle(healed.run, 'BLESSED');
  assert.equal(blessed.game.hp, 53);
  assert.equal(blessed.game.potions, 1);
  assert.equal(blessed.game.roomsCleared, 10);
  for (const action of [{ type: 'attack' }, { type: 'storm' }, { type: 'enter-next-room' }, { type: 'equip-relic', relicId: 0 }, { type: 'buy', item: 'camp-rest' }] as const) {
    const rejected = transitionMarketDungeon(pending, { type: 'gameplay', action }, noRolls());
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.run, pending);
  }
});

test('settlement potions respect max HP and inventory without combat rolls', () => {
  const pending = defeatBoss(applyLock(nearBoss({ hp: 90, potions: 2 }), 1));
  const heal = (run: MarketDungeonRun) => transitionMarketDungeon(run, { type: 'gameplay', action: { type: 'use-potion' } }, noRolls()).run;
  const capped = heal(pending);
  assert.equal(capped.game.hp, 100);
  assert.equal(capped.game.potions, 1);
  const full = heal(capped);
  assert.equal(full.game.hp, 100);
  assert.equal(full.game.potions, 1);
  const empty = heal({ ...pending, game: { ...pending.game, potions: 0 } });
  assert.equal(empty.game.hp, 90);
  assert.equal(empty.game.potions, 0);
});

test('pre-rematch recovery preserves the boss and history; locking restores combat potion rules', () => {
  const cursed = settle(defeatBoss(applyLock(nearBoss({ hp: 28, potions: 3 }), 1)), 'CURSED');
  const recover = (run: MarketDungeonRun) => transitionMarketDungeon(run, { type: 'gameplay', action: { type: 'use-potion' } }, noRolls());
  const recovered = recover(cursed);
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.run.game.hp, 53);
  assert.equal(recovered.run.game.potions, 2);
  assert.equal(recovered.run.game.monsterHp, 122);
  assert.equal(recovered.run.game.combatPotionsUsed, 0);
  assert.deepEqual({ ...recovered.run, game: cursed.game }, cursed);
  for (const action of [{ type: 'attack' }, { type: 'storm' }, { type: 'equip-relic', relicId: 0 }, { type: 'buy', item: 'camp-rest' }] as const) {
    assert.equal(transitionMarketDungeon(recovered.run, { type: 'gameplay', action }, noRolls()).accepted, false);
  }
  const capped = recover({ ...cursed, game: { ...cursed.game, hp: 90 } }).run;
  assert.equal(capped.game.hp, 100);
  assert.equal(recover(capped).run.game.potions, 2);
  const empty = recover({ ...cursed, game: { ...cursed.game, potions: 0 } }).run;
  assert.equal(empty.game.hp, 28);
  assert.equal(empty.game.potions, 0);
  const locked = applyLock(recovered.run, 2);
  const combatPotion = transitionMarketDungeon(locked, { type: 'gameplay', action: { type: 'use-potion' } }, sequence(0));
  assert.equal(combatPotion.accepted, true);
  assert.ok(combatPotion.run.game.lastMonsterDamage > 0);
  assert.equal(combatPotion.run.game.combatPotionsUsed, 1);
  assert.equal(combatPotion.run.game.potions, 1);
  assert.equal(combatPotion.run.phase, 'boss-combat');
});

test('a delayed old answer, duplicate market, or rewritten binding is rejected', () => {
  const firstPending = defeatBoss(applyLock(nearBoss(), 1));
  const oldSettlement = settlement(firstPending, 'CURSED');
  const cursed = settle(firstPending, 'CURSED');

  const secondPending = defeatBoss(applyLock(cursed, 2));
  const delayed = transitionMarketDungeon(secondPending, {
    type: 'settle-boss',
    settlement: oldSettlement,
  }, noRolls());
  assert.equal(delayed.accepted, false);
  assert.equal(delayed.run, secondPending);

  const repeatedMarket = transitionMarketDungeon(secondPending, {
    type: 'settle-boss',
    settlement: { ...settlement(secondPending, 'BLESSED'), marketId: marketId(1) },
  }, noRolls());
  assert.equal(repeatedMarket.accepted, false);

  const rewritten = transitionMarketDungeon(secondPending, {
    type: 'settle-boss',
    settlement: { ...settlement(secondPending, 'BLESSED'), direction: 'UP' },
  }, noRolls());
  assert.equal(rewritten.accepted, false);
  assert.equal(rewritten.run.game.gold, 0);
  const malformedOutcome = transitionMarketDungeon(secondPending, {
    type: 'settle-boss',
    settlement: { ...settlement(secondPending, 'BLESSED'), outcome: 'WIN' as BossOutcome },
  }, noRolls());
  assert.equal(malformedOutcome.accepted, false);
  assert.equal(malformedOutcome.run.game.gold, 0);
  assert.equal(settle(secondPending, 'BLESSED').game.gold, 43);
});

test('combat death ends the run and a spent revive remains spent across a rematch', () => {
  let run = applyLock(nearBoss({ hp: 1, maxHp: 100, equippedRelic: 8, ownedRelics: [8] }), 1);
  const revived = transitionMarketDungeon({ ...run, game: { ...run.game, monsterHp: 100 } }, {
    type: 'gameplay',
    action: { type: 'attack' },
  }, sequence(0, 99, 2));
  assert.equal(revived.run.game.relicReviveUsed, true);
  assert.equal(revived.run.game.hp, 35);

  run = settle(defeatBoss(revived.run), 'CURSED');
  run = applyLock(run, 2);
  const death = transitionMarketDungeon({ ...run, game: { ...run.game, hp: 1, monsterHp: 100 } }, {
    type: 'gameplay',
    action: { type: 'attack' },
  }, sequence(0, 99, 2));
  assert.deepEqual([death.run.phase, death.run.game.active, death.run.game.hp], ['dead', false, 0]);
});

test('live locks require a canonical market identity before combat', () => {
  const run = nearBoss();
  const malformed = transitionMarketDungeon(run, {
    type: 'lock-boss',
    lock: { ...lock(1), marketId: null },
  }, noRolls());
  assert.equal(malformed.accepted, false);

  const locked = applyLock(run, 1);
  assert.equal(locked.currentAttempt?.marketId, marketId(1));
  assert.equal(locked.currentAttempt?.commitment, null);
  assert.equal(locked.currentAttempt?.proofVersion, FULL_RUN_MARKET_PROOF_VERSION);
  assert.equal(locked.game.monsterHp, 122);
});

test('a live omen is locked before room one and remains bound through the tier', () => {
  const fresh = createMarketDungeonRun(sequence(0));
  assert.equal(fresh.phase, 'boss-lock-required');
  assert.equal(fresh.game.roomsCleared, 0);
  assert.equal(fresh.game.monsterHp, 30);

  const opened = transitionMarketDungeon(fresh, { type: 'lock-boss', lock: lock(1) }, noRolls());
  assert.equal(opened.accepted, true, opened.reason);
  assert.equal(opened.run.phase, 'exploring');
  assert.equal(opened.run.currentAttempt?.marketId, marketId(1));
});
