import {
  applyDeferredBossReward,
  attackTransition,
  drinkPotion,
  enterNextRoom,
  reduceGameplay,
  startRun,
  stormTransition,
  type DeferredBossReward,
  type DelvewornGame,
  type GameplayAction,
  type GameplayRandom,
} from './delveworn-engine.ts';

export const FULL_RUN_MARKET_PROOF_VERSION = 'market-dungeon/full-run-market/v1' as const;

export type Direction = 'UP' | 'DOWN';
export type BossOutcome = 'BLESSED' | 'CURSED' | 'VOID' | 'PENDING' | 'NOT_PROVABLE';
export type BossMarketMode = 'historical' | 'live';
export type FullRunPhase =
  | 'exploring'
  | 'boss-lock-required'
  | 'boss-combat'
  | 'settlement-pending'
  | 'boss-reward'
  | 'complete'
  | 'dead';

export type BossPredictionLock = {
  attemptId: string;
  marketId: string | null;
  direction: Direction;
  mode: BossMarketMode;
  proofVersion: typeof FULL_RUN_MARKET_PROOF_VERSION;
  commitment: string | null;
};

export type VerifiedBossSettlement = {
  attemptId: string;
  marketId: string;
  direction: Direction;
  proofVersion: typeof FULL_RUN_MARKET_PROOF_VERSION;
  commitment: string | null;
  outcome: BossOutcome;
};

export type SettledBossAttempt = Pick<
  VerifiedBossSettlement,
  'attemptId' | 'marketId' | 'direction' | 'proofVersion' | 'commitment' | 'outcome'
>;

export type MarketDungeonRun = {
  schema: 'market-dungeon/full-run/v3';
  game: DelvewornGame;
  phase: FullRunPhase;
  attemptNumber: number;
  rematchRequired: boolean;
  currentAttempt: BossPredictionLock | null;
  pendingBossReward: DeferredBossReward | null;
  usedMarketIds: string[];
  usedCommitments: string[];
  resolvedAttemptIds: string[];
  settlements: SettledBossAttempt[];
};

type NonStartGameplayAction = Exclude<GameplayAction, { type: 'start-run' }>;

export type MarketDungeonAction =
  | { type: 'gameplay'; action: NonStartGameplayAction }
  | { type: 'lock-boss'; lock: BossPredictionLock }
  | { type: 'settle-boss'; settlement: VerifiedBossSettlement };

export type MarketDungeonTransition = {
  run: MarketDungeonRun;
  accepted: boolean;
  reason: string;
};

const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,128}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/i;
const COMMITMENT = /^0x[0-9a-f]{64}$/i;

function accepted(run: MarketDungeonRun, reason: string): MarketDungeonTransition {
  return { run, accepted: true, reason };
}

function rejected(run: MarketDungeonRun, reason: string): MarketDungeonTransition {
  return { run, accepted: false, reason };
}

function nextPhase(game: DelvewornGame, currentAttempt: BossPredictionLock | null): FullRunPhase {
  if (!game.active) return 'dead';
  if (game.relicOfferAvailable) return 'boss-reward';
  if (game.roomsCleared >= 40) return 'complete';
  if (!currentAttempt && (
    (game.roomsCleared === 0 && game.monsterHp > 0)
    || (game.roomsCleared > 0 && game.roomsCleared % 10 === 0 && game.monsterHp === 0)
  )) {
    return 'boss-lock-required';
  }
  if (currentAttempt && game.monsterType === 3 && game.monsterHp > 0 && game.roomsCleared % 10 === 9) {
    return 'boss-combat';
  }
  return 'exploring';
}

function sameLock(settlement: VerifiedBossSettlement, lock: BossPredictionLock): boolean {
  return settlement.attemptId === lock.attemptId
    && (lock.marketId === null || settlement.marketId.toLowerCase() === lock.marketId)
    && settlement.direction === lock.direction
    && settlement.proofVersion === lock.proofVersion
    && settlement.commitment === lock.commitment;
}

function validLock(lock: BossPredictionLock): string | null {
  if (!ATTEMPT_ID.test(lock.attemptId)) return 'Invalid attempt identifier';
  if (lock.direction !== 'UP' && lock.direction !== 'DOWN') return 'Invalid locked direction';
  if (lock.mode !== 'historical' && lock.mode !== 'live') return 'Invalid market mode';
  if (lock.proofVersion !== FULL_RUN_MARKET_PROOF_VERSION) return 'Unsupported proof version';
  if (lock.mode === 'historical') {
    if (lock.marketId !== null) return 'Historical market identity must remain sealed until settlement';
    if (lock.commitment === null || !COMMITMENT.test(lock.commitment)) {
      return 'Historical replay requires a canonical commitment';
    }
  }
  if (lock.mode === 'live') {
    if (lock.marketId === null || !MARKET_ID.test(lock.marketId)) return 'Live mode requires a canonical market identifier';
    if (lock.commitment !== null && !COMMITMENT.test(lock.commitment)) return 'Invalid live commitment';
  }
  return null;
}

function validSettlement(settlement: VerifiedBossSettlement): boolean {
  return ATTEMPT_ID.test(settlement.attemptId)
    && MARKET_ID.test(settlement.marketId)
    && (settlement.direction === 'UP' || settlement.direction === 'DOWN')
    && settlement.proofVersion === FULL_RUN_MARKET_PROOF_VERSION
    && (settlement.commitment === null || COMMITMENT.test(settlement.commitment))
    && ['BLESSED', 'CURSED', 'VOID', 'PENDING', 'NOT_PROVABLE'].includes(settlement.outcome);
}

export function createMarketDungeonRun(random: GameplayRandom): MarketDungeonRun {
  return {
    schema: 'market-dungeon/full-run/v3',
    game: startRun(random),
    phase: 'boss-lock-required',
    attemptNumber: 0,
    rematchRequired: false,
    currentAttempt: null,
    pendingBossReward: null,
    usedMarketIds: [],
    usedCommitments: [],
    resolvedAttemptIds: [],
    settlements: [],
  };
}

function lockBoss(
  run: MarketDungeonRun,
  lock: BossPredictionLock,
  random: GameplayRandom,
): MarketDungeonTransition {
  if (run.phase !== 'boss-lock-required' || run.currentAttempt || run.pendingBossReward) {
    return rejected(run, 'Boss prediction cannot be locked in this phase');
  }
  const error = validLock(lock);
  if (error) return rejected(run, error);
  const marketId = lock.marketId?.toLowerCase() ?? null;
  const commitment = lock.commitment?.toLowerCase() ?? null;
  if (marketId && run.usedMarketIds.includes(marketId)) return rejected(run, 'Market already used by this run');
  if (commitment && run.usedCommitments.includes(commitment)) return rejected(run, 'Commitment already used by this run');
  if (run.resolvedAttemptIds.includes(lock.attemptId)) return rejected(run, 'Attempt identifier already resolved');

  let game = run.game;
  if (run.rematchRequired) {
    if (game.monsterType !== 3 || game.monsterHp <= 0 || game.roomsCleared % 10 !== 9) {
      return rejected(run, 'Boss rematch state is inconsistent');
    }
  } else if (game.monsterHp === 0 && game.roomsCleared > 0 && game.roomsCleared % 10 === 0) {
    game = enterNextRoom(game, random);
  } else if (!(game.roomsCleared === 0 && game.monsterHp > 0 && game.monsterType !== 3)) {
    return rejected(run, 'Tier omen state is inconsistent');
  }
  if (game.monsterHp <= 0) return rejected(run, 'The next encounter did not open');

  const currentAttempt = { ...lock, marketId, commitment };

  return accepted({
    ...run,
    game,
    phase: game.monsterType === 3 ? 'boss-combat' : 'exploring',
    attemptNumber: run.attemptNumber + 1,
    currentAttempt,
    usedCommitments: commitment ? [...run.usedCommitments, commitment] : run.usedCommitments,
  }, run.rematchRequired ? 'Rematch omen locked' : 'Tier omen locked');
}

function gameplay(
  run: MarketDungeonRun,
  action: NonStartGameplayAction,
  random: GameplayRandom,
): MarketDungeonTransition {
  if (run.phase === 'settlement-pending' || run.phase === 'dead' || run.phase === 'complete') {
    return rejected(run, 'Gameplay is frozen in this phase');
  }

  if (run.phase === 'boss-reward') {
    if (action.type !== 'claim-relic') return rejected(run, 'Claim the boss relic first');
    const game = reduceGameplay(run.game, action, random);
    return accepted({ ...run, game, phase: nextPhase(game, null) }, 'Boss relic claimed');
  }

  if (run.phase === 'boss-lock-required') {
    if (run.rematchRequired) return rejected(run, 'Lock a new market before the rematch');
    if (!['use-potion', 'equip-relic', 'buy'].includes(action.type)) {
      return rejected(run, run.rematchRequired ? 'Lock a new market before the rematch' : 'Lock an omen before entering the tier');
    }
    const game = reduceGameplay(run.game, action, random);
    return accepted({ ...run, game }, 'Pre-boss preparation applied');
  }

  if (run.phase === 'boss-combat') {
    if (!run.currentAttempt) return rejected(run, 'Boss combat has no bound market attempt');
    if (action.type === 'use-potion') {
      const game = drinkPotion(run.game, random);
      return accepted({ ...run, game, phase: nextPhase(game, run.currentAttempt) === 'dead' ? 'dead' : 'boss-combat' }, 'Boss combat action applied');
    }
    if (action.type !== 'attack' && action.type !== 'storm') {
      return rejected(run, 'Only combat actions are allowed during the boss fight');
    }
    const result = action.type === 'attack'
      ? attackTransition(run.game, random, true)
      : stormTransition(run.game, random, true);
    if (!result.game.active) {
      return accepted({ ...run, game: result.game, phase: 'dead', pendingBossReward: null }, 'Run ended in combat');
    }
    if (result.game.monsterHp === 0) {
      if (!result.deferredBossReward) return rejected(run, 'Boss reward was not deferred');
      return accepted({
        ...run,
        game: result.game,
        phase: 'settlement-pending',
        pendingBossReward: result.deferredBossReward,
      }, 'Boss defeated; settlement required');
    }
    return accepted({ ...run, game: result.game }, 'Boss combat action applied');
  }

  if (!run.currentAttempt) return rejected(run, 'Lock a tier omen before exploring');
  if (action.type === 'claim-relic') return rejected(run, 'No boss relic is awaiting a claim');
  const game = reduceGameplay(run.game, action, random);
  return accepted({ ...run, game, phase: nextPhase(game, run.currentAttempt) }, 'Gameplay action applied');
}

function settleBoss(
  run: MarketDungeonRun,
  settlement: VerifiedBossSettlement,
): MarketDungeonTransition {
  if (run.phase !== 'settlement-pending' || !run.currentAttempt || !run.pendingBossReward) {
    return rejected(run, 'No boss settlement is pending');
  }
  if (!validSettlement(settlement)) return rejected(run, 'Invalid settlement envelope');
  if (run.resolvedAttemptIds.includes(settlement.attemptId)) return rejected(run, 'Attempt already resolved');
  if (!sameLock(settlement, run.currentAttempt)) return rejected(run, 'Settlement does not match the active lock');
  const settledMarketId = settlement.marketId.toLowerCase();
  if (run.usedMarketIds.includes(settledMarketId)) return rejected(run, 'Settlement reused an earlier market');

  if (settlement.outcome === 'PENDING' || settlement.outcome === 'NOT_PROVABLE') {
    return accepted(run, 'Settlement remains unresolved; run is frozen');
  }

  const recorded: SettledBossAttempt = {
    ...settlement,
    marketId: settledMarketId,
    commitment: settlement.commitment?.toLowerCase() ?? null,
  };
  const shared = {
    currentAttempt: null,
    pendingBossReward: null,
    usedMarketIds: [...run.usedMarketIds, settledMarketId],
    resolvedAttemptIds: [...run.resolvedAttemptIds, settlement.attemptId],
    settlements: [...run.settlements, recorded],
  };

  if (settlement.outcome === 'CURSED') {
    const game = {
      ...run.game,
      monsterHp: run.game.monsterMaxHp,
      combatPotionsUsed: 0,
      lastPlayerDamage: 0,
      lastMonsterDamage: 0,
      lastCritical: false,
    };
    return accepted({
      ...run,
      ...shared,
      game,
      phase: 'boss-lock-required',
      rematchRequired: true,
    }, 'Prediction missed; boss restored for a new locked attempt');
  }

  let game: DelvewornGame;
  try {
    game = applyDeferredBossReward(run.game, run.pendingBossReward);
  } catch {
    return rejected(run, 'Deferred boss reward failed validation');
  }
  return accepted({
    ...run,
    ...shared,
    game,
    phase: nextPhase(game, null),
    rematchRequired: false,
  }, settlement.outcome === 'VOID'
    ? 'Voided market; ordinary boss progression granted'
    : 'Prediction correct; ordinary boss progression granted');
}

export function transitionMarketDungeon(
  run: MarketDungeonRun,
  action: MarketDungeonAction,
  random: GameplayRandom,
): MarketDungeonTransition {
  switch (action.type) {
    case 'gameplay': return gameplay(run, action.action, random);
    case 'lock-boss': return lockBoss(run, action.lock, random);
    case 'settle-boss': return settleBoss(run, action.settlement);
  }
}
