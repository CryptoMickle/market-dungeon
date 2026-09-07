import {
  getMaxHpForRelic,
  getOfferedRelics,
  getRelicDefinition,
  getRelicMaxHpModifier,
  RELIC_MIN_MAX_HP,
} from './relics.ts';
import {
  attackLogs,
  defeatLogs,
  encounterLog,
  getDelvewornPersona,
  stormLogs,
} from './delveworn-personas.ts';

// Gameplay-only port of Delveworn practice mode at commit
// 00932e83dc89af85b2f3986a08bca2c5b6e6bc1c. Presentation copy deliberately
// does not consume this random source, so visual changes cannot alter a run.

export type MonsterType = 0 | 1 | 2 | 3;
export type LootType = 0 | 1 | 2 | 3 | 4;
export type RelicRarityId = 0 | 1 | 2 | 3 | 4 | 5;
export type MerchantVisit = 'supply' | 'camp';
export type ShopAction =
  | 'supply-bandage'
  | 'supply-potion'
  | 'camp-rest'
  | 'camp-potion'
  | 'camp-weapon'
  | 'camp-armor';

export type GameplayRandom = (maxExclusive: number) => number;

export type DelvewornGame = {
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  monsterHp: number;
  monsterMaxHp: number;
  roomsCleared: number;
  gold: number;
  potions: number;
  weaponLevel: number;
  armorLevel: number;
  monsterType: MonsterType;
  lastLootType: LootType;
  lastLootAmount: number;
  hasStarted: boolean;
  active: boolean;
  equippedRelic: number;
  ownedRelics: number[];
  relicCounts: number[];
  relicOfferAvailable: boolean;
  relicOfferRarity: RelicRarityId;
  relicOfferId: number;
  relicReviveUsed: boolean;
  lastPlayerDamage: number;
  lastMonsterDamage: number;
  lastCritical: boolean;
  combatPotionsUsed: number;
  campRestUsed: boolean;
  campPotionsBought: number;
  supplyBandageUsed: boolean;
  supplyPotionsBought: number;
  log: string[];
};

export type GameplayAction =
  | { type: 'start-run' }
  | { type: 'attack' }
  | { type: 'storm' }
  | { type: 'use-potion' }
  | { type: 'enter-next-room' }
  | { type: 'claim-relic'; equip: boolean }
  | { type: 'equip-relic'; relicId: number }
  | { type: 'buy'; item: ShopAction };

export type DeferredBossReward = {
  room: number;
  monsterType: 3;
  lootRoll: number;
  amountRoll: number;
  relicOfferRarity: RelicRarityId;
  relicOfferId: number;
};

export type CombatTransition = {
  game: DelvewornGame;
  deferredBossReward: DeferredBossReward | null;
};

export const TOTAL_ROOMS = 40;
export const BASE_MAX_HP = 100;
export const MAX_POTIONS = 5;
export const BASE_CRITICAL_CHANCE = 15;

export const MONSTER_NAMES = ['Zombie', 'Goblin', 'Orc', 'Dungeon Lord'] as const;
export const LOOT_NAMES = ['Nothing', 'Potion', 'Bonus gold', 'Weapon upgrade', 'Armor upgrade'] as const;

const MONSTER_BASE_HP = [30, 40, 60, 90] as const;
const MONSTER_BASE_DAMAGE = [5, 7, 9, 12] as const;
const MONSTER_BASE_GOLD = [5, 8, 12, 30] as const;

export function emptyGame(): DelvewornGame {
  return {
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    baseMaxHp: BASE_MAX_HP,
    monsterHp: 0,
    monsterMaxHp: 0,
    roomsCleared: 0,
    gold: 0,
    potions: 3,
    weaponLevel: 0,
    armorLevel: 0,
    monsterType: 0,
    lastLootType: 0,
    lastLootAmount: 0,
    hasStarted: false,
    active: false,
    equippedRelic: 0,
    ownedRelics: [],
    relicCounts: Array(16).fill(0),
    relicOfferAvailable: false,
    relicOfferRarity: 0,
    relicOfferId: 0,
    relicReviveUsed: false,
    lastPlayerDamage: 0,
    lastMonsterDamage: 0,
    lastCritical: false,
    combatPotionsUsed: 0,
    campRestUsed: false,
    campPotionsBought: 0,
    supplyBandageUsed: false,
    supplyPotionsBought: 0,
    log: [],
  };
}

export const cryptoRandom: GameplayRandom = (maxExclusive) => {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) return 0;
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = range;
  while (value >= limit) {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % maxExclusive;
};

function roll(random: GameplayRandom, maxExclusive: number): number {
  const value = random(maxExclusive);
  if (!Number.isSafeInteger(value) || value < 0 || value >= maxExclusive) {
    throw new RangeError(`Gameplay random returned ${value} for range 0..${maxExclusive - 1}`);
  }
  return value;
}

function withLog(state: DelvewornGame, ...messages: string[]): DelvewornGame {
  return { ...state, log: [...messages.reverse(), ...state.log].slice(0, 12) };
}

function outgoingPercent(relicId: number, storm: boolean): number {
  if (relicId === 1) return 110;
  if (relicId === 2) return 95;
  if (relicId === 3) return storm ? 80 : 100;
  if (relicId === 4) return 120;
  if (relicId === 5) return 100;
  if (relicId === 6) return storm ? 130 : 95;
  if (relicId === 7 || relicId === 8) return 95;
  if (relicId === 9) return storm ? 145 : 95;
  if (relicId === 10) return 95;
  if (relicId === 11) return storm ? 100 : 85;
  if (relicId === 12) return 105;
  if (relicId === 13) return 135;
  if (relicId === 15) return 130;
  return 100;
}

function scaleOutgoing(relicId: number, damage: number, storm: boolean): number {
  const percent = outgoingPercent(relicId, storm);
  return percent >= 100
    ? Math.floor((damage * percent) / 100)
    : Math.floor((damage * percent + 99) / 100);
}

function scaleIncoming(relicId: number, damage: number): number {
  return Math.floor((damage * (relicId === 15 ? 115 : 100) + 99) / 100);
}

function scaleGold(relicId: number, gold: number): number {
  return Math.floor((gold * (100 + (relicId === 7 ? 75 : 0))) / 100);
}

function criticalChance(relicId: number): number {
  if (relicId === 3) return BASE_CRITICAL_CHANCE + 5;
  if (relicId === 11) return BASE_CRITICAL_CHANCE + 15;
  if (relicId === 15) return BASE_CRITICAL_CHANCE + 10;
  return BASE_CRITICAL_CHANCE;
}

function criticalMultiplier(relicId: number): number {
  return relicId === 11 ? 3 : 2;
}

export function scaledMonsterHp(type: MonsterType, room: number): number {
  const base = MONSTER_BASE_HP[type];
  return base + Math.floor((base * (room - 1)) / 25);
}

export function scaledMonsterDamage(type: MonsterType, room: number): number {
  return MONSTER_BASE_DAMAGE[type] + Math.floor((room - 1) / 8);
}

export function scaledMonsterGold(type: MonsterType, room: number): number {
  const base = MONSTER_BASE_GOLD[type];
  return base + Math.floor((base * (room - 1)) / 20);
}

export function applyArmor(armorLevel: number, damage: number): number {
  const flatReduced = damage <= armorLevel ? 1 : damage - armorLevel;
  return Math.max(flatReduced, Math.floor((damage + 1) / 2));
}

function rollMonsterDamage(state: DelvewornGame, random: GameplayRandom): number {
  const room = state.roomsCleared + 1;
  const raw = scaledMonsterDamage(state.monsterType, room) - 1 + roll(random, 3);
  return scaleIncoming(state.equippedRelic, applyArmor(state.armorLevel, raw));
}

export function relicRarityForEntropy(entropy: number): RelicRarityId {
  const value = entropy % 10_000;
  if (value < 5_500) return 1;
  if (value < 8_000) return 2;
  if (value < 9_200) return 3;
  if (value < 9_800) return 4;
  return 5;
}

function equipRelic(state: DelvewornGame, relicId: number, healPositiveModifier: boolean): DelvewornGame {
  const maxHp = getMaxHpForRelic(state.baseMaxHp, relicId);
  const bonusHealing = healPositiveModifier ? Math.max(0, getRelicMaxHpModifier(relicId)) : 0;
  return {
    ...state,
    equippedRelic: relicId,
    maxHp,
    hp: Math.min(maxHp, state.hp + bonusHealing),
  };
}

function spawnMonster(state: DelvewornGame, random: GameplayRandom): DelvewornGame {
  if (state.roomsCleared >= TOTAL_ROOMS) return withLog(state, 'The expedition is complete.');
  const room = state.roomsCleared + 1;
  const monsterType: MonsterType = room % 10 === 0
    ? 3
    : (() => {
        const value = roll(random, 100);
        return value < 45 ? 0 : value < 80 ? 1 : 2;
      })();
  const hp = scaledMonsterHp(monsterType, room);
  return withLog({
    ...state,
    monsterType,
    monsterHp: hp,
    monsterMaxHp: hp,
    combatPotionsUsed: 0,
    lastPlayerDamage: 0,
    lastMonsterDamage: 0,
    lastCritical: false,
  }, ...encounterLog(monsterType, room));
}

function takeDamage(state: DelvewornGame, damage: number): DelvewornGame {
  if (state.hp > damage) return { ...state, hp: state.hp - damage };
  const revivePercent = state.equippedRelic === 8 ? 35 : state.equippedRelic === 14 ? 50 : 0;
  if (revivePercent > 0 && !state.relicReviveUsed) {
    return {
      ...state,
      hp: Math.max(1, Math.floor((state.maxHp * revivePercent) / 100)),
      active: true,
      relicReviveUsed: true,
    };
  }
  return { ...state, hp: 0, active: false };
}

function grantLoot(state: DelvewornGame, lootRoll: number, amountRoll: number): DelvewornGame {
  if (lootRoll < 30) {
    if (state.potions >= MAX_POTIONS) {
      const converted = scaleGold(state.equippedRelic, 10);
      return { ...state, gold: state.gold + converted, lastLootType: 2, lastLootAmount: converted };
    }
    return { ...state, potions: state.potions + 1, lastLootType: 1, lastLootAmount: 1 };
  }
  if (lootRoll < 80) {
    const bonus = scaleGold(state.equippedRelic, 5 + (amountRoll % 16) + Math.floor(state.roomsCleared / 5));
    return { ...state, gold: state.gold + bonus, lastLootType: 2, lastLootAmount: bonus };
  }
  if (lootRoll < 90) {
    return { ...state, weaponLevel: state.weaponLevel + 1, lastLootType: 3, lastLootAmount: 1 };
  }
  return { ...state, armorLevel: state.armorLevel + 1, lastLootType: 4, lastLootAmount: 1 };
}

function rollDefeatReward(state: DelvewornGame, random: GameplayRandom): DeferredBossReward {
  const lootRoll = roll(random, 100);
  const amountRoll = roll(random, 10_000);
  const rarity = state.monsterType === 3 ? relicRarityForEntropy(amountRoll) : 0;
  const offered = getOfferedRelics(rarity);
  return {
    room: state.roomsCleared + 1,
    monsterType: 3,
    lootRoll,
    amountRoll,
    relicOfferRarity: rarity,
    relicOfferId: offered.length === 0 ? 0 : offered[roll(random, offered.length)].id,
  };
}

function immediateRewardRolls(state: DelvewornGame, random: GameplayRandom): DeferredBossReward {
  const lootRoll = roll(random, 100);
  const amountRoll = roll(random, 10_000);
  if (state.monsterType !== 3) {
    return {
      room: state.roomsCleared + 1,
      monsterType: 3,
      lootRoll,
      amountRoll,
      relicOfferRarity: 0,
      relicOfferId: 0,
    };
  }
  const rarity = relicRarityForEntropy(amountRoll);
  const offered = getOfferedRelics(rarity);
  return {
    room: state.roomsCleared + 1,
    monsterType: 3,
    lootRoll,
    amountRoll,
    relicOfferRarity: rarity,
    relicOfferId: offered[roll(random, offered.length)].id,
  };
}

export function applyDeferredBossReward(
  state: DelvewornGame,
  rewardRolls: DeferredBossReward,
): DelvewornGame {
  const expectedRarity = relicRarityForEntropy(rewardRolls.amountRoll);
  const validOffer = getOfferedRelics(expectedRarity).some((relic) => relic.id === rewardRolls.relicOfferId);
  if (
    state.monsterType !== 3
    || state.monsterHp !== 0
    || rewardRolls.monsterType !== 3
    || rewardRolls.room !== state.roomsCleared + 1
    || rewardRolls.lootRoll < 0
    || rewardRolls.lootRoll >= 100
    || rewardRolls.amountRoll < 0
    || rewardRolls.amountRoll >= 10_000
    || rewardRolls.relicOfferRarity !== expectedRarity
    || !validOffer
  ) {
    throw new Error('Invalid deferred boss reward');
  }
  return defeatMonster(state, rewardRolls);
}

function defeatMonster(
  state: DelvewornGame,
  rewardRolls: DeferredBossReward,
): DelvewornGame {
  const room = state.roomsCleared + 1;
  const reward = scaleGold(state.equippedRelic, scaledMonsterGold(state.monsterType, room));
  let next = grantLoot({
    ...state,
    monsterHp: 0,
    gold: state.gold + reward,
    roomsCleared: state.roomsCleared + 1,
  }, rewardRolls.lootRoll, rewardRolls.amountRoll);

  const killHeal = next.equippedRelic === 5 ? 4 : next.equippedRelic === 12 ? 5 : 0;
  if (killHeal > 0 && next.hp > 0) next = { ...next, hp: Math.min(next.maxHp, next.hp + killHeal) };

  if (state.monsterType === 3) {
    next = {
      ...next,
      relicOfferAvailable: rewardRolls.relicOfferId !== 0,
      relicOfferRarity: rewardRolls.relicOfferRarity,
      relicOfferId: rewardRolls.relicOfferId,
    };
  }
  if (next.roomsCleared % 5 === 0) {
    next = { ...next, supplyBandageUsed: false, supplyPotionsBought: 0 };
  }
  if (next.roomsCleared % 10 === 9) {
    next = {
      ...next,
      hp: Math.min(next.maxHp, next.hp + 15),
      campRestUsed: false,
      campPotionsBought: 0,
    };
  }
  return withLog(next, ...defeatLogs(state.monsterType, room, reward));
}

export function startRun(random: GameplayRandom = cryptoRandom): DelvewornGame {
  return spawnMonster({
    ...emptyGame(),
    hasStarted: true,
    active: true,
    log: ['A new Delveworn run begins.'],
  }, random);
}

export function attack(state: DelvewornGame, random: GameplayRandom = cryptoRandom): DelvewornGame {
  return attackTransition(state, random).game;
}

export function attackTransition(
  state: DelvewornGame,
  random: GameplayRandom = cryptoRandom,
  deferBossReward = false,
): CombatTransition {
  if (!state.active || state.monsterHp <= 0) {
    return { game: withLog(state, 'There is nothing to attack.'), deferredBossReward: null };
  }
  const base = 10 + state.weaponLevel * 2;
  let damage = base - 2 + roll(random, 5);
  const critical = roll(random, 100) < criticalChance(state.equippedRelic);
  if (critical) damage *= criticalMultiplier(state.equippedRelic);
  damage = scaleOutgoing(state.equippedRelic, damage, false);
  const actual = Math.min(damage, state.monsterHp);
  let next = { ...state, lastPlayerDamage: actual, lastCritical: critical };
  if (damage >= state.monsterHp) {
    next = { ...next, monsterHp: 0, lastMonsterDamage: 0 };
    if (deferBossReward && state.monsterType === 3) {
      const rewardRolls = rollDefeatReward(state, random);
      return { game: next, deferredBossReward: rewardRolls };
    }
    return { game: defeatMonster(next, immediateRewardRolls(state, random)), deferredBossReward: null };
  }
  next = { ...next, monsterHp: state.monsterHp - damage };
  const incoming = rollMonsterDamage(next, random);
  const wasReviveUnused = !state.relicReviveUsed;
  next = takeDamage({ ...next, lastMonsterDamage: incoming }, incoming);
  const messages = attackLogs(state.monsterType, state.roomsCleared + 1, actual, incoming, critical);
  if (wasReviveUnused && next.relicReviveUsed) {
    messages.push(`${getRelicDefinition(next.equippedRelic).name} revived you.`);
  }
  return { game: withLog(next, ...messages), deferredBossReward: null };
}

export function stormAttack(state: DelvewornGame, random: GameplayRandom = cryptoRandom): DelvewornGame {
  return stormTransition(state, random).game;
}

export function stormTransition(
  state: DelvewornGame,
  random: GameplayRandom = cryptoRandom,
  deferBossReward = false,
): CombatTransition {
  if (!state.active || state.monsterHp <= 0) {
    return { game: withLog(state, 'There is nothing to attack.'), deferredBossReward: null };
  }
  const maximum = (10 + state.weaponLevel * 2) * 2;
  const damage = scaleOutgoing(state.equippedRelic, roll(random, maximum + 1), true);
  const actual = Math.min(damage, state.monsterHp);
  let next = { ...state, lastPlayerDamage: actual, lastCritical: false };
  if (damage >= state.monsterHp) {
    next = { ...next, monsterHp: 0, lastMonsterDamage: 0 };
    if (deferBossReward && state.monsterType === 3) {
      const rewardRolls = rollDefeatReward(state, random);
      return { game: next, deferredBossReward: rewardRolls };
    }
    return { game: defeatMonster(next, immediateRewardRolls(state, random)), deferredBossReward: null };
  }
  next = { ...next, monsterHp: state.monsterHp - damage };
  const incoming = rollMonsterDamage(next, random);
  next = takeDamage({ ...next, lastMonsterDamage: incoming }, incoming);
  return {
    game: withLog(
      next,
      ...stormLogs(state.monsterType, state.roomsCleared + 1, actual, maximum, incoming),
    ),
    deferredBossReward: null,
  };
}

export function drinkPotion(state: DelvewornGame, random: GameplayRandom = cryptoRandom): DelvewornGame {
  if (!state.active) return withLog(state, 'The run is over.');
  if (state.potions <= 0) return withLog(state, 'No potions left.');
  if (state.hp >= state.maxHp) return withLog(state, 'HP is already full.');
  if (state.monsterHp === 0) {
    const hp = Math.min(state.maxHp, state.hp + 25);
    return withLog({
      ...state,
      hp,
      potions: state.potions - 1,
      lastPlayerDamage: 0,
      lastMonsterDamage: 0,
      lastCritical: false,
    }, `🧪 Potion restores ${hp - state.hp} HP. The label remains legally vague.`);
  }
  const limit = state.monsterType === 3 ? 3 : 2;
  if (state.combatPotionsUsed >= limit) return withLog(state, 'Combat potion limit reached.');
  const incoming = Math.floor((rollMonsterDamage(state, random) + 1) / 2);
  const hp = Math.min(state.maxHp, Math.max(0, state.hp + 25 - incoming));
  let next: DelvewornGame = {
    ...state,
    hp,
    potions: state.potions - 1,
    combatPotionsUsed: state.combatPotionsUsed + 1,
    lastPlayerDamage: 0,
    lastMonsterDamage: incoming,
    lastCritical: false,
  };
  if (hp === 0) next = takeDamage(next, 0);
  const persona = getDelvewornPersona(state.monsterType, state.roomsCleared + 1);
  return withLog(next, `🧪 Potion used. ${persona.name} deals ${incoming} DAMAGE while you negotiate with the cork.`);
}

export function enterNextRoom(state: DelvewornGame, random: GameplayRandom = cryptoRandom): DelvewornGame {
  if (!state.active) return withLog(state, 'The run is over.');
  if (state.monsterHp > 0) return withLog(state, 'Defeat the monster first.');
  if (state.roomsCleared >= TOTAL_ROOMS) return withLog(state, 'The expedition is complete.');
  let next = state;
  if (state.equippedRelic === 1 && state.baseMaxHp > RELIC_MIN_MAX_HP) {
    const baseMaxHp = Math.max(RELIC_MIN_MAX_HP, state.baseMaxHp - 2);
    const maxHp = getMaxHpForRelic(baseMaxHp, state.equippedRelic);
    next = { ...state, baseMaxHp, maxHp, hp: Math.min(state.hp, maxHp) };
  }
  return spawnMonster(next, random);
}

export function claimRelic(state: DelvewornGame, equip: boolean): DelvewornGame {
  if (!state.relicOfferAvailable || state.monsterHp > 0) return withLog(state, 'No boss relic can be claimed.');
  const relicId = state.relicOfferId;
  const expectedRarity = Math.floor((relicId - 1) / 3) + 1;
  if (relicId === 0 || expectedRarity !== state.relicOfferRarity) return withLog(state, 'Invalid boss relic offer.');
  const alreadyOwned = state.ownedRelics.includes(relicId);
  const previousCount = state.relicCounts[relicId] ?? (alreadyOwned ? 1 : 0);
  const relicCounts = [...state.relicCounts];
  relicCounts[relicId] = previousCount + 1;
  const acquired: DelvewornGame = {
    ...state,
    ownedRelics: alreadyOwned ? state.ownedRelics : [...state.ownedRelics, relicId],
    relicCounts,
    relicOfferAvailable: false,
    relicOfferRarity: 0,
    relicOfferId: 0,
  };
  const relic = getRelicDefinition(relicId);
  return withLog(
    equip ? equipRelic(acquired, relicId, !alreadyOwned) : acquired,
    equip ? `◆ ${relic.name} equipped. This seems powerful and therefore suspicious.` : `◆ ${relic.name} added to the collection. Kevin files the receipt.`,
  );
}

export function equipOwnedRelic(state: DelvewornGame, relicId: number): DelvewornGame {
  if (!state.active) return withLog(state, 'The run is over.');
  if (state.monsterHp > 0) return withLog(state, 'Relics can only be changed between rooms.');
  if (relicId !== 0 && !state.ownedRelics.includes(relicId)) return withLog(state, 'You do not own that relic.');
  if (relicId === state.equippedRelic) return state;
  return withLog(
    equipRelic(state, relicId, false),
    relicId === 0 ? '◇ Active relic unequipped. You feel responsibly ordinary.' : `◆ ${getRelicDefinition(relicId).name} equipped.`,
  );
}

export function supplyAvailable(state: DelvewornGame): boolean {
  return state.active && state.monsterHp === 0 && state.roomsCleared >= 5 && state.roomsCleared % 5 === 0;
}

export function campAvailable(state: DelvewornGame): boolean {
  return state.active && state.monsterHp === 0 && state.roomsCleared > 0 && state.roomsCleared % 10 === 9;
}

export function getMerchantVisit(state: DelvewornGame): MerchantVisit | null {
  if (campAvailable(state)) return 'camp';
  if (supplyAvailable(state)) return 'supply';
  return null;
}

export function supplyPrices(state: DelvewornGame): { bandage: number; potion: number } {
  const tier = Math.floor((state.roomsCleared - 5) / 10);
  return { bandage: 20 + tier * 5, potion: 25 + tier * 5 };
}

export function campPrices(state: DelvewornGame): { rest: number; potion: number; weapon: number; armor: number } {
  const tier = Math.floor((state.roomsCleared + 1) / 10) - 1;
  return {
    rest: 25 + tier * 5,
    potion: 20 + tier * 5,
    weapon: 60 + tier * 20,
    armor: 60 + tier * 20,
  };
}

export function buy(state: DelvewornGame, action: ShopAction): DelvewornGame {
  if (action.startsWith('supply') && !supplyAvailable(state)) return withLog(state, 'Supply stop unavailable.');
  if (action.startsWith('camp') && !campAvailable(state)) return withLog(state, 'Camp unavailable.');
  const supply = supplyPrices(state);
  const camp = campPrices(state);
  const costs: Record<ShopAction, number> = {
    'supply-bandage': supply.bandage,
    'supply-potion': supply.potion,
    'camp-rest': camp.rest,
    'camp-potion': camp.potion,
    'camp-weapon': camp.weapon,
    'camp-armor': camp.armor,
  };
  const cost = costs[action];
  if (state.gold < cost) return withLog(state, 'Not enough gold.');
  if (action === 'supply-bandage') {
    if (state.supplyBandageUsed || state.hp >= state.maxHp) return state;
    return { ...state, gold: state.gold - cost, hp: Math.min(state.maxHp, state.hp + 25), supplyBandageUsed: true };
  }
  if (action === 'supply-potion') {
    if (state.supplyPotionsBought >= 2 || state.potions >= MAX_POTIONS) return state;
    return { ...state, gold: state.gold - cost, potions: state.potions + 1, supplyPotionsBought: state.supplyPotionsBought + 1 };
  }
  if (action === 'camp-rest') {
    if (state.campRestUsed || state.hp >= state.maxHp) return state;
    return { ...state, gold: state.gold - cost, hp: Math.min(state.maxHp, state.hp + 30), campRestUsed: true };
  }
  if (action === 'camp-potion') {
    if (state.campPotionsBought >= 2 || state.potions >= MAX_POTIONS) return state;
    return { ...state, gold: state.gold - cost, potions: state.potions + 1, campPotionsBought: state.campPotionsBought + 1 };
  }
  if (action === 'camp-weapon') return { ...state, gold: state.gold - cost, weaponLevel: state.weaponLevel + 1 };
  return { ...state, gold: state.gold - cost, armorLevel: state.armorLevel + 1 };
}

export function attackRange(state: DelvewornGame): [number, number] {
  const base = 10 + state.weaponLevel * 2;
  return [scaleOutgoing(state.equippedRelic, base - 2, false), scaleOutgoing(state.equippedRelic, base + 2, false)];
}

export function stormRange(state: DelvewornGame): [number, number] {
  const base = 10 + state.weaponLevel * 2;
  return [0, scaleOutgoing(state.equippedRelic, base * 2, true)];
}

export function incomingRange(state: DelvewornGame): [number, number] {
  const base = scaledMonsterDamage(state.monsterType, state.roomsCleared + 1);
  return [
    scaleIncoming(state.equippedRelic, applyArmor(state.armorLevel, base - 1)),
    scaleIncoming(state.equippedRelic, applyArmor(state.armorLevel, base + 1)),
  ];
}

export function currentCriticalChance(state: DelvewornGame): number {
  return criticalChance(state.equippedRelic);
}

export function reduceGameplay(
  state: DelvewornGame,
  action: GameplayAction,
  random: GameplayRandom = cryptoRandom,
): DelvewornGame {
  switch (action.type) {
    case 'start-run': return startRun(random);
    case 'attack': return attack(state, random);
    case 'storm': return stormAttack(state, random);
    case 'use-potion': return drinkPotion(state, random);
    case 'enter-next-room': return enterNextRoom(state, random);
    case 'claim-relic': return claimRelic(state, action.equip);
    case 'equip-relic': return equipOwnedRelic(state, action.relicId);
    case 'buy': return buy(state, action.item);
  }
}
