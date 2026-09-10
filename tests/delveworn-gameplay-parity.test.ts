import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyArmor,
  attack,
  attackRange,
  buy,
  campPrices,
  claimRelic,
  currentCriticalChance,
  emptyGame,
  enterNextRoom,
  equipOwnedRelic,
  incomingRange,
  reduceGameplay,
  relicRarityForEntropy,
  scaledMonsterDamage,
  scaledMonsterGold,
  scaledMonsterHp,
  startRun,
  stormRange,
  supplyPrices,
  drinkPotion,
  type DelvewornGame,
  type GameplayRandom,
} from '../app/gameplay/delveworn-engine.ts';
import {
  getMaxHpForRelic,
  getOfferedRelics,
  RELIC_CATALOG,
} from '../app/gameplay/relics.ts';

// Golden expectations below were derived from Delveworn practice engine commit
// 00932e83dc89af85b2f3986a08bca2c5b6e6bc1c. They intentionally compare
// gameplay state rather than presentation copy.

function sequence(...values: number[]): GameplayRandom {
  let cursor = 0;
  return (maxExclusive) => {
    assert.ok(cursor < values.length, `missing deterministic roll for max ${maxExclusive}`);
    const value = values[cursor++];
    assert.ok(value >= 0 && value < maxExclusive, `${value} outside deterministic range 0..${maxExclusive - 1}`);
    return value;
  };
}

function encounter(overrides: Partial<DelvewornGame> = {}): DelvewornGame {
  return {
    ...emptyGame(),
    hasStarted: true,
    active: true,
    monsterType: 0,
    monsterHp: 30,
    monsterMaxHp: 30,
    ...overrides,
  };
}

test('new run, monster distribution boundaries, and four boss scaling vectors match Delveworn', () => {
  const zombie = startRun(sequence(44));
  const goblin = startRun(sequence(45));
  const orc = startRun(sequence(80));
  assert.deepEqual([zombie.monsterType, goblin.monsterType, orc.monsterType], [0, 1, 2]);
  assert.deepEqual([zombie.hp, zombie.potions, zombie.gold, zombie.weaponLevel, zombie.armorLevel], [100, 3, 0, 0, 0]);
  assert.deepEqual([10, 20, 30, 40].map((room) => scaledMonsterHp(3, room)), [122, 158, 194, 230]);
  assert.deepEqual([scaledMonsterDamage(3, 10), scaledMonsterDamage(3, 40)], [13, 16]);
  assert.deepEqual([scaledMonsterGold(3, 10), scaledMonsterGold(3, 40)], [43, 88]);

  const boss = enterNextRoom(encounter({ roomsCleared: 9, monsterHp: 0 }), sequence());
  assert.deepEqual([boss.monsterType, boss.monsterHp, boss.monsterMaxHp], [3, 122, 122]);
});

test('normal attack, critical hit, armor, retaliation, and lethal-hit short circuit match the source', () => {
  const overkill = attack(encounter({ monsterHp: 3 }), sequence(0, 0, 85, 0));
  assert.equal(overkill.lastPlayerDamage, 3, 'HP removed remains capped');
  assert.equal(overkill.lastRolledDamage, 16, 'critical presentation retains the full roll');
  assert.equal(overkill.lastCritical, true);
  assert.equal(overkill.monsterHp, 0);
  const normal = attack(encounter(), sequence(4, 99, 2));
  assert.deepEqual({
    monsterHp: normal.monsterHp,
    hp: normal.hp,
    player: normal.lastPlayerDamage,
    monster: normal.lastMonsterDamage,
    critical: normal.lastCritical,
  }, { monsterHp: 18, hp: 94, player: 12, monster: 6, critical: false });

  const critical = attack(encounter({ monsterHp: 100, monsterMaxHp: 100, equippedRelic: 11, maxHp: 85 }), sequence(0, 0, 1));
  assert.deepEqual([critical.lastPlayerDamage, critical.lastCritical, critical.monsterHp], [21, true, 79]);
  assert.equal(applyArmor(20, 13), 7, 'armor may never prevent more than half, rounded up');

  const killed = attack(encounter({ monsterHp: 1, hp: 2 }), sequence(0, 99, 85, 0));
  assert.equal(killed.hp, 2, 'a defeated monster does not retaliate');
  assert.equal(killed.weaponLevel, 1);
  assert.equal(killed.gold, 5);
  assert.equal(killed.roomsCleared, 1);
});

test('all fifteen relic combat modifiers and max-HP tradeoffs match frozen vectors', () => {
  const expected = [
    { attack: [8, 12], storm: [0, 20], crit: 15, maxHp: 100 },
    { attack: [8, 13], storm: [0, 22], crit: 15, maxHp: 100 },
    { attack: [8, 12], storm: [0, 19], crit: 15, maxHp: 120 },
    { attack: [8, 12], storm: [0, 16], crit: 20, maxHp: 100 },
    { attack: [9, 14], storm: [0, 24], crit: 15, maxHp: 80 },
    { attack: [8, 12], storm: [0, 20], crit: 15, maxHp: 90 },
    { attack: [8, 12], storm: [0, 26], crit: 15, maxHp: 100 },
    { attack: [8, 12], storm: [0, 19], crit: 15, maxHp: 100 },
    { attack: [8, 12], storm: [0, 19], crit: 15, maxHp: 100 },
    { attack: [8, 12], storm: [0, 29], crit: 15, maxHp: 100 },
    { attack: [8, 12], storm: [0, 19], crit: 15, maxHp: 150 },
    { attack: [7, 11], storm: [0, 20], crit: 30, maxHp: 100 },
    { attack: [8, 12], storm: [0, 21], crit: 15, maxHp: 80 },
    { attack: [10, 16], storm: [0, 27], crit: 15, maxHp: 60 },
    { attack: [8, 12], storm: [0, 20], crit: 15, maxHp: 85 },
    { attack: [10, 15], storm: [0, 26], crit: 25, maxHp: 100 },
  ];

  assert.equal(RELIC_CATALOG.length, 16);
  expected.forEach((vector, relicId) => {
    const state = encounter({ equippedRelic: relicId });
    assert.deepEqual(attackRange(state), vector.attack, `attack range for relic ${relicId}`);
    assert.deepEqual(stormRange(state), vector.storm, `storm range for relic ${relicId}`);
    assert.equal(currentCriticalChance(state), vector.crit, `critical chance for relic ${relicId}`);
    assert.equal(getMaxHpForRelic(100, relicId), vector.maxHp, `max HP for relic ${relicId}`);
  });
  assert.deepEqual(incomingRange(encounter({ equippedRelic: 15 })), [5, 7]);
});

test('loot probabilities, Gilded Hunger gold, kill healing, and boss relic offer match Delveworn', () => {
  const potion = attack(encounter({ monsterHp: 1 }), sequence(0, 99, 29, 0));
  assert.deepEqual([potion.lastLootType, potion.potions], [1, 4]);

  const bonus = attack(encounter({ monsterHp: 1, roomsCleared: 4 }), sequence(0, 99, 30, 15));
  assert.deepEqual([bonus.lastLootType, bonus.lastLootAmount], [2, 21]);

  const gilded = attack(encounter({ monsterHp: 1, equippedRelic: 7 }), sequence(0, 99, 99, 0));
  assert.deepEqual([gilded.gold, gilded.armorLevel], [8, 1]);

  const ashen = attack(encounter({ monsterHp: 1, hp: 50, maxHp: 90, equippedRelic: 5 }), sequence(0, 99, 85, 0));
  const engine = attack(encounter({ monsterHp: 1, hp: 50, maxHp: 80, equippedRelic: 12 }), sequence(0, 99, 85, 0));
  assert.deepEqual([ashen.hp, engine.hp], [54, 55]);

  const boss = attack(encounter({
    roomsCleared: 9,
    monsterType: 3,
    monsterHp: 1,
    monsterMaxHp: 122,
  }), sequence(0, 99, 99, 5_499, 2));
  assert.deepEqual({
    rooms: boss.roomsCleared,
    gold: boss.gold,
    rarity: boss.relicOfferRarity,
    offer: boss.relicOfferId,
  }, { rooms: 10, gold: 43, rarity: 1, offer: 3 });
  assert.equal(getOfferedRelics(1).length, 3);
});

test('loot and relic rarity boundaries are exact and the run stops at room forty', () => {
  const lootAt = (lootRoll: number) => attack(encounter({ monsterHp: 1 }), sequence(0, 99, lootRoll, 0));
  assert.deepEqual([29, 30, 79, 80, 89, 90].map((value) => lootAt(value).lastLootType), [1, 2, 2, 3, 3, 4]);
  assert.deepEqual(
    [0, 5_499, 5_500, 7_999, 8_000, 9_199, 9_200, 9_799, 9_800, 9_999].map(relicRarityForEntropy),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  );

  const complete = encounter({ roomsCleared: 40, monsterHp: 0 });
  const unchanged = enterNextRoom(complete, sequence());
  assert.equal(unchanged.roomsCleared, 40);
  assert.equal(unchanged.monsterHp, 0);
});

test('relic ownership, duplicates, swapping, Blood Price, and one-use revives are preserved', () => {
  const first = claimRelic(encounter({
    hp: 50,
    monsterHp: 0,
    roomsCleared: 10,
    relicOfferAvailable: true,
    relicOfferRarity: 1,
    relicOfferId: 2,
  }), true);
  assert.deepEqual([first.ownedRelics, first.relicCounts[2], first.equippedRelic, first.maxHp, first.hp], [[2], 1, 2, 120, 70]);

  const duplicate = claimRelic({ ...first, hp: 70, relicOfferAvailable: true, relicOfferRarity: 1, relicOfferId: 2 }, true);
  assert.deepEqual([duplicate.ownedRelics, duplicate.relicCounts[2], duplicate.hp], [[2], 2, 70]);
  assert.equal(equipOwnedRelic({ ...duplicate, monsterHp: 1 }, 0).equippedRelic, 2, 'cannot swap during combat');
  assert.equal(equipOwnedRelic({ ...duplicate, monsterHp: 0 }, 0).equippedRelic, 0);

  const bloodPrice = enterNextRoom(encounter({
    hp: 100,
    monsterHp: 0,
    roomsCleared: 1,
    equippedRelic: 1,
  }), sequence(0));
  assert.deepEqual([bloodPrice.baseMaxHp, bloodPrice.maxHp, bloodPrice.hp], [98, 98, 98]);
  const bloodPriceFloor = enterNextRoom(encounter({
    hp: 20,
    maxHp: 20,
    baseMaxHp: 20,
    monsterHp: 0,
    roomsCleared: 1,
    equippedRelic: 1,
  }), sequence(0));
  assert.deepEqual([bloodPriceFloor.baseMaxHp, bloodPriceFloor.maxHp, bloodPriceFloor.hp], [20, 20, 20]);

  const gravePact = attack(encounter({ hp: 1, monsterHp: 100, equippedRelic: 8 }), sequence(0, 99, 2));
  assert.deepEqual([gravePact.active, gravePact.hp, gravePact.relicReviveUsed], [true, 35, true]);
  const spentPact = attack({ ...gravePact, hp: 1 }, sequence(0, 99, 2));
  assert.deepEqual([spentPact.active, spentPact.hp], [false, 0]);

  const flame = attack(encounter({ hp: 1, maxHp: 85, equippedRelic: 14 }), sequence(0, 99, 2));
  assert.deepEqual([flame.hp, flame.relicReviveUsed], [42, true]);
});

test('potions, supply stop, camp limits, and prices match the source', () => {
  const inCombat = drinkPotion(encounter({ hp: 50, potions: 3 }), sequence(2));
  assert.deepEqual([inCombat.hp, inCombat.potions, inCombat.combatPotionsUsed, inCombat.lastMonsterDamage], [72, 2, 1, 3]);
  const atLimit = drinkPotion({ ...inCombat, hp: 50, combatPotionsUsed: 2 }, sequence());
  assert.equal(atLimit.potions, 2);

  const supply = encounter({ roomsCleared: 5, monsterHp: 0, hp: 50, gold: 100, potions: 3 });
  assert.deepEqual(supplyPrices(supply), { bandage: 20, potion: 25 });
  const bandaged = buy(supply, 'supply-bandage');
  assert.deepEqual([bandaged.hp, bandaged.gold, bandaged.supplyBandageUsed], [75, 80, true]);
  assert.equal(buy(bandaged, 'supply-bandage').gold, 80);

  const camp = encounter({ roomsCleared: 9, monsterHp: 0, hp: 40, gold: 200, potions: 3 });
  assert.deepEqual(campPrices(camp), { rest: 25, potion: 20, weapon: 60, armor: 60 });
  const rested = buy(camp, 'camp-rest');
  const armed = buy(rested, 'camp-weapon');
  assert.deepEqual([armed.hp, armed.gold, armed.weaponLevel], [70, 115, 1]);
  assert.deepEqual(campPrices({ ...camp, roomsCleared: 39 }), { rest: 40, potion: 35, weapon: 120, armor: 120 });
  assert.deepEqual(supplyPrices({ ...supply, roomsCleared: 35 }), { bandage: 35, potion: 40 });
});

test('the single reducer dispatches deterministic gameplay without hidden randomness', () => {
  const started = reduceGameplay(emptyGame(), { type: 'start-run' }, sequence(0));
  const attacked = reduceGameplay(started, { type: 'attack' }, sequence(4, 99, 2));
  assert.deepEqual([attacked.monsterHp, attacked.hp], [18, 94]);
  assert.throws(() => reduceGameplay(started, { type: 'attack' }, () => 999), /Gameplay random returned/);
});
