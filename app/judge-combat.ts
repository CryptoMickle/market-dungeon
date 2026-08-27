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

export const JUDGE_COMBAT_DOMAIN = 'market-dungeon/judge-combat/v1';

export const JUDGE_COMBAT = {
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
  return hashSeed(seed) / 4294967295;
}

export function canonicalJudgeActionLog(gameSeed: string, actions: JudgeCombatAction[]) {
  return [
    JUDGE_COMBAT_DOMAIN,
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

export function replayJudgeCombat(gameSeed: string, actions: JudgeCombatAction[]): JudgeCombatReplay {
  let hp: number = JUDGE_COMBAT.player.hp;
  let potions: number = JUDGE_COMBAT.player.potions;
  let guardHp: number = JUDGE_COMBAT.guard.hp;
  let bossHp: number = JUDGE_COMBAT.boss.hp;
  let room: 'guard' | 'between' | 'boss' | 'complete' | 'dead' = 'guard';
  let turn = 0;
  let combatPotionUses = 0;
  let reason: string | null = null;

  const fail = (message: string, steps: number): JudgeCombatReplay => ({
    verified: false,
    reason: message,
    steps,
    guardDefeated: guardHp === 0,
    bossDefeated: bossHp === 0,
    playerSurvived: hp > 0,
    finalHp: hp,
    remainingPotions: potions,
  });

  if (!GAME_SEED.test(gameSeed)) return fail('Invalid game seed', 0);
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > JUDGE_COMBAT.maxSteps) {
    return fail('Invalid action count', 0);
  }

  for (let index = 0; index < actions.length; index += 1) {
    const entry = actions[index];
    if (!isAction(entry)) return fail('Invalid action entry', index);
    if (room === 'complete' || room === 'dead') return fail('Action after terminal state', index);

    if (room === 'guard' && entry.room !== JUDGE_COMBAT.guard.room) {
      return fail('Boss entered before guard defeat', index);
    }

    if (room === 'between') {
      if (entry.room === JUDGE_COMBAT.guard.room) {
        if (entry.action !== 'potion' || potions === 0 || hp >= 100) {
          return fail('Invalid between-room action', index);
        }
        hp = Math.min(100, hp + 25);
        potions -= 1;
        continue;
      }
      room = 'boss';
      turn = 0;
      combatPotionUses = 0;
    }

    if (room === 'boss' && entry.room !== JUDGE_COMBAT.boss.room) {
      return fail('Returned to defeated guard', index);
    }

    const enemy = room === 'guard' ? JUDGE_COMBAT.guard : JUDGE_COMBAT.boss;
    turn += 1;

    const incomingDamage = () => {
      const spread = enemy.maxDamage - enemy.minDamage + 1;
      const raw = enemy.minDamage + Math.floor(seededRoll(`${gameSeed}:${enemy.room}:${turn}:${entry.action}:enemy`) * spread);
      return Math.max(1, raw - JUDGE_COMBAT.player.armor);
    };

    if (entry.action === 'potion') {
      if (potions === 0 || hp >= 100 || combatPotionUses >= enemy.potionLimit) {
        return fail('Invalid combat potion', index);
      }
      hp = Math.max(0, hp + Math.min(25, 100 - hp) - incomingDamage());
      potions -= 1;
      combatPotionUses += 1;
      if (hp === 0) room = 'dead';
      continue;
    }

    const attackMin = 7 + JUDGE_COMBAT.player.weapon * 2;
    const attackMax = 11 + JUDGE_COMBAT.player.weapon * 2;
    const stormMax = 20 + JUDGE_COMBAT.player.weapon * 3;
    const roll = seededRoll(`${gameSeed}:${enemy.room}:${turn}:${entry.action}:player`);
    const crit = entry.action === 'attack' && seededRoll(`${gameSeed}:${enemy.room}:${turn}:crit`) < 0.15;
    const base = entry.action === 'attack'
      ? attackMin + Math.floor(roll * (attackMax - attackMin + 1))
      : Math.floor(roll * (stormMax + 1));
    const damage = crit ? base * 2 : base;

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

    hp = Math.max(0, hp - incomingDamage());
    if (hp === 0) room = 'dead';
  }

  const verified = guardHp === 0 && bossHp === 0 && hp > 0 && room === 'complete';
  if (!verified) reason = hp === 0 ? 'Player defeated' : 'Combat incomplete';
  return {
    verified,
    reason,
    steps: actions.length,
    guardDefeated: guardHp === 0,
    bossDefeated: bossHp === 0,
    playerSurvived: hp > 0,
    finalHp: hp,
    remainingPotions: potions,
  };
}
