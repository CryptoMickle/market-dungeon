import type {
  BossPredictionLock,
  FullRunPhase,
  MarketDungeonRun,
  SettledBossAttempt,
} from './event-boss-engine.ts';
import type { DeferredBossReward, DelvewornGame } from './delveworn-engine.ts';
import { getMaxHpForRelic } from './relics.ts';

export const FULL_RUN_STORAGE_KEY = 'market-dungeon/full-run-session/v2';

export type ActiveLiveMarket = {
  marketId: string;
  intervalSec: 300;
  question: string;
  strikeUsd: string;
  tradingStart: number;
  expiry: number;
  lockedAt: number;
};

export type FullRunSession = {
  schema: 'market-dungeon/full-run-session/v2';
  run: MarketDungeonRun;
  market: ActiveLiveMarket | null;
};

const HEX_32 = /^0x[0-9a-f]{64}$/;
const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,128}$/;
const PHASES: FullRunPhase[] = [
  'exploring', 'boss-lock-required', 'boss-combat', 'settlement-pending',
  'boss-reward', 'complete', 'dead',
];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function uniqueStrings(value: unknown, pattern: RegExp, maximum: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every((entry) => typeof entry === 'string' && pattern.test(entry))
    && new Set(value).size === value.length;
}

function strings(value: unknown, pattern: RegExp, maximum: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every((entry) => typeof entry === 'string' && pattern.test(entry));
}

function validLock(value: unknown): value is BossPredictionLock {
  if (!record(value)) return false;
  const common = ATTEMPT_ID.test(String(value.attemptId))
    && (value.direction === 'UP' || value.direction === 'DOWN')
    && value.proofVersion === 'market-dungeon/full-run-market/v1';
  if (!common) return false;
  if (value.mode === 'historical') return value.marketId === null && typeof value.commitment === 'string' && HEX_32.test(value.commitment);
  if (value.mode === 'live') {
    return typeof value.marketId === 'string' && HEX_32.test(value.marketId)
      && (value.commitment === null || (typeof value.commitment === 'string' && HEX_32.test(value.commitment)));
  }
  return false;
}

function validSettlement(value: unknown): value is SettledBossAttempt {
  return record(value)
    && ATTEMPT_ID.test(String(value.attemptId))
    && typeof value.marketId === 'string' && HEX_32.test(value.marketId)
    && (value.direction === 'UP' || value.direction === 'DOWN')
    && value.proofVersion === 'market-dungeon/full-run-market/v1'
    && (value.commitment === null || (typeof value.commitment === 'string' && HEX_32.test(value.commitment)))
    && ['BLESSED', 'CURSED', 'VOID'].includes(String(value.outcome));
}

function validReward(value: unknown): value is DeferredBossReward {
  if (!record(value)) return false;
  return integer(value.room, 10, 40)
    && Number(value.room) % 10 === 0
    && value.monsterType === 3
    && integer(value.lootRoll, 0, 99)
    && integer(value.amountRoll, 0, 9_999)
    && integer(value.relicOfferRarity, 1, 5)
    && integer(value.relicOfferId, 1, 15)
    && Math.floor((Number(value.relicOfferId) - 1) / 3) + 1 === value.relicOfferRarity;
}

function validGame(value: unknown): value is DelvewornGame {
  if (!record(value)) return false;
  const numericBounds: Array<[unknown, number, number]> = [
    [value.hp, 0, 150], [value.maxHp, 20, 150], [value.baseMaxHp, 20, 100],
    [value.monsterHp, 0, 10_000], [value.monsterMaxHp, 0, 10_000], [value.roomsCleared, 0, 40],
    [value.gold, 0, 1_000_000_000], [value.potions, 0, 5], [value.weaponLevel, 0, 1_000],
    [value.armorLevel, 0, 1_000], [value.monsterType, 0, 3], [value.lastLootType, 0, 4],
    [value.lastLootAmount, 0, 1_000_000], [value.equippedRelic, 0, 15],
    [value.relicOfferRarity, 0, 5], [value.relicOfferId, 0, 15],
    [value.lastPlayerDamage, 0, 10_000], [value.lastMonsterDamage, 0, 10_000],
    [value.combatPotionsUsed, 0, 3], [value.campPotionsBought, 0, 2],
    [value.supplyPotionsBought, 0, 2],
  ];
  if (!numericBounds.every(([entry, min, max]) => integer(entry, min, max))) return false;
  if (Number(value.hp) > Number(value.maxHp) || Number(value.monsterHp) > Number(value.monsterMaxHp)) return false;
  if (typeof value.hasStarted !== 'boolean' || typeof value.active !== 'boolean'
    || typeof value.relicOfferAvailable !== 'boolean' || typeof value.relicReviveUsed !== 'boolean'
    || typeof value.lastCritical !== 'boolean' || typeof value.campRestUsed !== 'boolean'
    || typeof value.supplyBandageUsed !== 'boolean') return false;
  if (!strings(value.log, /^.{0,500}$/s, 12)) return false;
  if (!Array.isArray(value.ownedRelics)
    || value.ownedRelics.length > 15
    || !value.ownedRelics.every((id) => integer(id, 1, 15))
    || new Set(value.ownedRelics).size !== value.ownedRelics.length) return false;
  if (!Array.isArray(value.relicCounts)
    || value.relicCounts.length !== 16
    || !value.relicCounts.every((count) => integer(count, 0, 1_000))) return false;
  if (value.equippedRelic !== 0 && !value.ownedRelics.includes(value.equippedRelic as number)) return false;
  if (Number(value.maxHp) !== getMaxHpForRelic(Number(value.baseMaxHp), Number(value.equippedRelic))) return false;
  if (value.relicOfferAvailable !== (value.relicOfferId !== 0 && value.relicOfferRarity !== 0)) return false;
  return true;
}

function validRun(value: unknown): value is MarketDungeonRun {
  if (!record(value)
    || value.schema !== 'market-dungeon/full-run/v3'
    || !validGame(value.game)
    || !PHASES.includes(value.phase as FullRunPhase)
    || !integer(value.attemptNumber, 0, 10_000)
    || typeof value.rematchRequired !== 'boolean'
    || !(value.currentAttempt === null || validLock(value.currentAttempt))
    || !(value.pendingBossReward === null || validReward(value.pendingBossReward))
    || !uniqueStrings(value.usedMarketIds, HEX_32, 40)
    || !uniqueStrings(value.usedCommitments, HEX_32, 40)
    || !uniqueStrings(value.resolvedAttemptIds, ATTEMPT_ID, 10_000)
    || !Array.isArray(value.settlements)
    || value.settlements.length > 10_000
    || !value.settlements.every(validSettlement)) return false;

  const run = value as unknown as MarketDungeonRun;
  const expectedMarketIds = run.settlements.map((settlement) => settlement.marketId.toLowerCase());
  const expectedAttemptIds = run.settlements.map((settlement) => settlement.attemptId);
  const expectedCommitments = run.settlements
    .map((settlement) => settlement.commitment?.toLowerCase() ?? null)
    .filter((commitment): commitment is string => commitment !== null);
  if (run.currentAttempt?.commitment) expectedCommitments.push(run.currentAttempt.commitment.toLowerCase());
  if (run.attemptNumber !== run.settlements.length + (run.currentAttempt ? 1 : 0)
    || JSON.stringify(run.usedMarketIds) !== JSON.stringify(expectedMarketIds)
    || JSON.stringify(run.resolvedAttemptIds) !== JSON.stringify(expectedAttemptIds)
    || JSON.stringify(run.usedCommitments) !== JSON.stringify(expectedCommitments)
    || run.settlements.filter((settlement) => settlement.outcome !== 'CURSED').length !== Math.floor(run.game.roomsCleared / 10)
    || (run.currentAttempt !== null && run.resolvedAttemptIds.includes(run.currentAttempt.attemptId))) return false;

  if (run.phase === 'boss-combat') return run.currentAttempt?.mode === 'live' && run.pendingBossReward === null && run.game.monsterType === 3 && run.game.monsterHp > 0 && run.game.roomsCleared % 10 === 9;
  if (run.phase === 'settlement-pending') return run.currentAttempt !== null && run.pendingBossReward !== null && run.game.monsterType === 3 && run.game.monsterHp === 0 && run.game.roomsCleared % 10 === 9;
  if (run.phase === 'boss-reward') return run.currentAttempt === null && run.pendingBossReward === null && run.game.relicOfferAvailable && run.game.roomsCleared > 0 && run.game.roomsCleared % 10 === 0;
  if (run.phase === 'boss-lock-required') {
    return run.currentAttempt === null
      && run.pendingBossReward === null
      && (run.rematchRequired
        ? run.game.roomsCleared % 10 === 9 && run.game.monsterType === 3 && run.game.monsterHp === run.game.monsterMaxHp && run.game.monsterHp > 0
        : (run.game.roomsCleared === 0 && run.game.monsterType !== 3 && run.game.monsterHp > 0)
          || (run.game.roomsCleared > 0 && run.game.roomsCleared < 40 && run.game.roomsCleared % 10 === 0 && run.game.monsterHp === 0));
  }
  if (run.phase === 'dead') return !run.game.active;
  if (run.phase === 'complete') return run.game.roomsCleared === 40 && !run.game.relicOfferAvailable && run.currentAttempt === null;
  return run.currentAttempt?.mode === 'live'
    && run.pendingBossReward === null
    && run.game.active
    && !run.game.relicOfferAvailable
    && run.game.roomsCleared < 40
    && (run.game.monsterHp === 0 || run.game.monsterType !== 3);
}

function validMarket(value: unknown): value is ActiveLiveMarket {
  return record(value)
    && typeof value.marketId === 'string' && HEX_32.test(value.marketId)
    && value.intervalSec === 300
    && typeof value.question === 'string' && value.question.length > 0 && value.question.length <= 500
    && typeof value.strikeUsd === 'string' && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(value.strikeUsd)
    && Number(value.strikeUsd) > 0
    && integer(value.tradingStart, 1, Number.MAX_SAFE_INTEGER)
    && integer(value.expiry, 1, Number.MAX_SAFE_INTEGER)
    && integer(value.lockedAt, 1, Number.MAX_SAFE_INTEGER)
    && Number(value.tradingStart) < Number(value.expiry)
    && Number(value.lockedAt) < Number(value.expiry);
}

export function parseFullRunSession(raw: string | null): FullRunSession | null {
  if (!raw || raw.length > 80_000) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!record(value)
      || value.schema !== 'market-dungeon/full-run-session/v2'
      || !validRun(value.run)
      || !(value.market === null || validMarket(value.market))) return null;
    const session = value as unknown as FullRunSession;
    const needsMarket = session.run.currentAttempt?.mode === 'live';
    if (needsMarket !== (session.market !== null)) return null;
    if (session.market && session.run.currentAttempt?.marketId !== session.market.marketId) return null;
    return session;
  } catch {
    return null;
  }
}

export function serializeFullRunSession(session: FullRunSession): string {
  const serialized = JSON.stringify(session);
  if (!parseFullRunSession(serialized)) throw new Error('Refusing to persist an invalid full-run session');
  return serialized;
}
