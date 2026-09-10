export type JudgeCombatActionName = 'attack' | 'storm' | 'potion';
export type JudgeCombatRoom = 8 | 9;

export type JudgeCombatAction = {
  room: JudgeCombatRoom;
  action: JudgeCombatActionName;
};

export type JudgeCombatReplay = {
  verified: boolean;
  reason: string | null;
  steps: number;
  guardDefeated: boolean;
  bossDefeated: boolean;
  playerSurvived: boolean;
  finalHp: number;
  remainingPotions: number;
};

export type JudgeCombatSnapshot = {
  hp: number;
  potions: number;
  guardHp: number;
  bossHp: number;
  turn: number;
  potionUses: number;
  phase: 'guard' | 'between' | 'boss' | 'complete' | 'dead';
  lastExchange: { dealt: number; taken: number; critical?: boolean; rolledDamage?: number; healed?: number } | null;
  valid: boolean;
  reason: string | null;
};

type JudgeCombatEvaluation = { replay: JudgeCombatReplay; snapshot: JudgeCombatSnapshot };

export const JUDGE_COMBAT_DOMAIN = 'market-dungeon/judge-combat/v2';
export type JudgeCombatRuleset = 'market-dungeon/judge-combat/v1' | typeof JUDGE_COMBAT_DOMAIN;
export const isJudgeCombatRuleset = (value: unknown): value is JudgeCombatRuleset => value === JUDGE_COMBAT_DOMAIN || value === 'market-dungeon/judge-combat/v1';

export const JUDGE_COMBAT = {
  maxSteps: 64,
  player: { hp: 76, potions: 2, weapon: 4, armor: 1 },
  guard: { room: 8, hp: 40, minDamage: 9, maxDamage: 14, potionLimit: 2 },
  boss: { room: 9, hp: 72, minDamage: 11, maxDamage: 17, potionLimit: 3 },
} as const;

// Existing exported proofs must retain their original interpretation.
const LEGACY_JUDGE_COMBAT = {
  maxSteps: 64,
  player: { hp: 76, potions: 2, weapon: 4, armor: 1 },
  guard: { room: 8, hp: 12, minDamage: 9, maxDamage: 14, potionLimit: 2 },
  boss: { room: 9, hp: 24, minDamage: 11, maxDamage: 17, potionLimit: 3 },
} as const;

const GAME_SEED = /^[A-Za-z0-9_-]{43}$/;

export function hashSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function seededRoll(seed: string) {
  return hashSeed(seed) / 0x1_0000_0000;
}

export function canonicalJudgeActionLog(gameSeed: string, actions: JudgeCombatAction[], ruleset: JudgeCombatRuleset = JUDGE_COMBAT_DOMAIN) {
  return [
    ruleset,
    `gameSeed=${gameSeed}`,
    `steps=${actions.length}`,
    ...actions.map((entry, index) => `${index + 1}:${entry.room}:${entry.action}`),
  ].join('\n');
}

function isAction(value: unknown): value is JudgeCombatAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<JudgeCombatAction>;
  const keys = Object.keys(value).sort();
  return keys.length === 2
    && keys[0] === 'action'
    && keys[1] === 'room'
    && (entry.room === JUDGE_COMBAT.guard.room || entry.room === JUDGE_COMBAT.boss.room)
    && (entry.action === 'attack' || entry.action === 'storm' || entry.action === 'potion');
}

function evaluateJudgeCombat(gameSeed: string, actions: JudgeCombatAction[], ruleset: JudgeCombatRuleset, allowEmpty: boolean): JudgeCombatEvaluation {
  const rules = ruleset === 'market-dungeon/judge-combat/v1' ? LEGACY_JUDGE_COMBAT : JUDGE_COMBAT;
  let hp: number = rules.player.hp;
  let potions: number = rules.player.potions;
  let guardHp: number = rules.guard.hp;
  let bossHp: number = rules.boss.hp;
  let room: 'guard' | 'between' | 'boss' | 'complete' | 'dead' = 'guard';
  let turn = 0;
  let combatPotionUses = 0;
  let reason: string | null = null;
  let lastExchange: JudgeCombatSnapshot['lastExchange'] = null;

  const snapshot = (valid: boolean, failure: string | null): JudgeCombatSnapshot => ({
    hp, potions, guardHp, bossHp, turn, potionUses: combatPotionUses,
    phase: room, lastExchange, valid, reason: failure,
  });
  const fail = (message: string, steps: number): JudgeCombatEvaluation => ({
    replay: {
      verified: false,
      reason: message,
      steps,
      guardDefeated: guardHp === 0,
      bossDefeated: bossHp === 0,
      playerSurvived: hp > 0,
      finalHp: hp,
      remainingPotions: potions,
    },
    snapshot: snapshot(false, message),
  });

  if (!isJudgeCombatRuleset(ruleset)) return fail('Invalid combat ruleset', 0);
  if (!GAME_SEED.test(gameSeed)) return fail('Invalid game seed', 0);
  if (!Array.isArray(actions) || (!allowEmpty && actions.length === 0) || actions.length > rules.maxSteps) {
    return fail('Invalid action count', 0);
  }

  for (let index = 0; index < actions.length; index += 1) {
    const entry = actions[index];
    if (!isAction(entry)) return fail('Invalid action entry', index);
    if (room === 'complete' || room === 'dead') return fail('Action after terminal state', index);

    if (room === 'guard' && entry.room !== rules.guard.room) {
      return fail('Boss entered before guard defeat', index);
    }

    if (room === 'between') {
      if (entry.room === rules.guard.room) {
        if (entry.action !== 'potion' || potions === 0 || hp >= 100) {
          return fail('Invalid between-room action', index);
        }
        const healed = Math.min(25, 100 - hp);
        hp = Math.min(100, hp + 25);
        potions -= 1;
        lastExchange = { dealt: 0, taken: 0, healed };
        continue;
      }
      room = 'boss';
      turn = 0;
      combatPotionUses = 0;
    }

    if (room === 'boss' && entry.room !== rules.boss.room) {
      return fail('Returned to defeated guard', index);
    }

    const enemy = room === 'guard' ? rules.guard : rules.boss;
    turn += 1;

    const incomingDamage = () => {
      const spread = enemy.maxDamage - enemy.minDamage + 1;
      const raw = enemy.minDamage + Math.floor(seededRoll(`${gameSeed}:${enemy.room}:${turn}:${entry.action}:enemy`) * spread);
      return Math.max(1, raw - rules.player.armor);
    };

    if (entry.action === 'potion') {
      if (potions === 0 || hp >= 100 || combatPotionUses >= enemy.potionLimit) {
        return fail('Invalid combat potion', index);
      }
      const healed = Math.min(25, 100 - hp);
      const incoming = incomingDamage();
      hp = Math.max(0, hp + healed - incoming);
      potions -= 1;
      combatPotionUses += 1;
      lastExchange = { dealt: 0, taken: incoming, healed };
      if (hp === 0) room = 'dead';
      continue;
    }

    const attackMin = 7 + rules.player.weapon * 2;
    const attackMax = 11 + rules.player.weapon * 2;
    const stormMax = 20 + rules.player.weapon * 3;
    const roll = seededRoll(`${gameSeed}:${enemy.room}:${turn}:${entry.action}:player`);
    const crit = entry.action === 'attack' && seededRoll(`${gameSeed}:${enemy.room}:${turn}:crit`) < 0.15;
    const base = entry.action === 'attack'
      ? attackMin + Math.floor(roll * (attackMax - attackMin + 1))
      : Math.floor(roll * (stormMax + 1));
    const damage = crit ? base * 2 : base;
    lastExchange = { dealt: Math.min(damage, room === 'guard' ? guardHp : bossHp), taken: 0, critical: crit, rolledDamage: damage };

    if (room === 'guard') {
      guardHp = Math.max(0, guardHp - damage);
      if (guardHp === 0) {
        room = 'between';
        turn = 0;
        combatPotionUses = 0;
        continue;
      }
    } else {
      bossHp = Math.max(0, bossHp - damage);
      if (bossHp === 0) {
        room = 'complete';
        continue;
      }
    }

    const incoming = incomingDamage();
    hp = Math.max(0, hp - incoming);
    lastExchange.taken = incoming;
    if (hp === 0) room = 'dead';
  }

  const verified = guardHp === 0 && bossHp === 0 && hp > 0 && room === 'complete';
  if (!verified) reason = hp === 0 ? 'Player defeated' : 'Combat incomplete';
  return {
    replay: {
      verified,
      reason,
      steps: actions.length,
      guardDefeated: guardHp === 0,
      bossDefeated: bossHp === 0,
      playerSurvived: hp > 0,
      finalHp: hp,
      remainingPotions: potions,
    },
    snapshot: snapshot(true, null),
  };
}

/** Existing proof replay contract: empty, incomplete and invalid traces retain their original results. */
export function replayJudgeCombat(gameSeed: string, actions: JudgeCombatAction[], ruleset: JudgeCombatRuleset = JUDGE_COMBAT_DOMAIN): JudgeCombatReplay {
  return evaluateJudgeCombat(gameSeed, actions, ruleset, false).replay;
}

/** Partial UI state from the exact same rules used by the proof verifier. */
export function judgeCombatSnapshot(gameSeed: string, actions: JudgeCombatAction[], ruleset: JudgeCombatRuleset = JUDGE_COMBAT_DOMAIN): JudgeCombatSnapshot {
  return evaluateJudgeCombat(gameSeed, actions, ruleset, true).snapshot;
}
