import { attackLogs, getDelvewornPersona, stormLogs } from './gameplay/delveworn-personas.ts';
import { hashSeed, type JudgeCombatAction } from './judge-combat.ts';
import { liveJudgeCombatState } from './live-judge-combat.ts';

type JournalOptions = { bossEntered?: boolean; rested?: boolean; result?: 'BLESSED' | 'CURSED' | 'VOID' };

const GUARD_ROOM = 39;
const BOSS_ROOM = 40;
const potionQuips = [
  'The bottle has no refund policy.',
  'The label remains legally vague.',
  'Kevin calls this medicine. The bottle declines to comment.',
  'Side effects include continued employment in the dungeon.',
];

/** Cosmetic reconstruction only. No extra action, random roll or saved proof field. */
export function liveJudgeJournal(gameSeed: string, direction: 'UP' | 'DOWN', actions: JudgeCombatAction[], options: JournalOptions = {}) {
  const final = liveJudgeCombatState(gameSeed, actions);
  if (!final.valid) return { entries: [] as string[], preview: '' };

  const entries: string[] = [];
  let preview = '';
  let enteredBoss = false;
  const choose = (lines: readonly string[], label: string) => lines[hashSeed(`${gameSeed}:journal:${label}`) % lines.length];
  function encounter(boss: boolean) {
    const persona = getDelvewornPersona(boss ? 3 : 2, boss ? BOSS_ROOM : GUARD_ROOM);
    preview = choose(persona.encounters, boss ? 'boss-entrance' : 'guard-entrance');
    entries.push(`👁️ ${preview}`);
    if (boss) enteredBoss = true;
  }

  entries.push(`🔮 BTC ${direction} locked before market close. The paperwork is binding. Your survival is still negotiable.`);
  encounter(false);
  let before = liveJudgeCombatState(gameSeed, []);
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    const boss = action.room === 9;
    if (boss && !enteredBoss) encounter(true);
    const next = liveJudgeCombatState(gameSeed, actions.slice(0, index + 1));
    const exchange = next.lastExchange!;
    const room = boss ? BOSS_ROOM : GUARD_ROOM;
    const monsterType = boss ? 3 : 2;
    const persona = getDelvewornPersona(monsterType, room);
    const rolled = exchange.rolledDamage ?? exchange.dealt;
    const turn = (before.phase === 'between' && boss ? 0 : before.turn) + 1;
    // Cycle a seeded starting point so adjacent hits do not repeat the same joke.
    const quip = persona.hitLines[(hashSeed(`${gameSeed}:journal:${room}:hits`) + turn - 1) % persona.hitLines.length];
    const incoming = Math.min(exchange.taken, before.hp + (exchange.healed ?? 0));

    if (action.action === 'potion') {
      const potionQuip = potionQuips[index % potionQuips.length];
      if (before.phase === 'between' && !boss) {
        preview = `Kevin: “${potionQuip}”`;
        entries.push(`🧪 Kevin hands you a potion. +${exchange.healed} HP. No retaliation between fights. “${potionQuip}”`);
      } else {
        preview = `${potionQuip} ${quip}`;
        entries.push(`🧪 Potion restores ${exchange.healed} HP. ${potionQuip} 💢 ${persona.name} deals ${exchange.taken} DAMAGE while you negotiate with the cork. ${incoming} HP lost. ${quip}`);
      }
    } else {
      const lines = action.action === 'storm'
        ? stormLogs(monsterType, room, rolled, 32, exchange.taken)
        : attackLogs(monsterType, room, rolled, exchange.taken, Boolean(exchange.critical));
      const damageDetail = rolled > exchange.dealt
        ? ` Rolled ${rolled} DAMAGE; only ${exchange.dealt} enemy HP remained and ${exchange.dealt} HP was removed.` : '';
      const retaliation = exchange.taken > 0
        ? `💢 ${persona.name} deals ${exchange.taken} DAMAGE. ${quip}${incoming < exchange.taken ? ` ${incoming} HP remained; ${incoming} HP lost.` : ''}`
        : `${persona.name} falls before retaliating. No retaliation.`;
      entries.push(`${lines[0]}${damageDetail} ${retaliation}`);
      preview = exchange.critical ? 'CRITICAL HIT! The paperwork will be incredible.'
        : action.action === 'storm' ? lines[0] : quip;
    }

    if (before.guardHp > 0 && next.guardHp === 0) {
      const farewell = choose(persona.killLines, `guard-defeated:${index}`);
      entries.push(`☠️ ${farewell} Meatwall defeated. 🪙 +18 gold. The dungeon reluctantly honors payroll.`);
      entries.push('🧰 Kevin recommends entering the boss fight with most of your organs. “The others are difficult to expense.”');
      preview = farewell;
    }
    if (before.bossHp > 0 && next.bossHp === 0) {
      const farewell = choose(persona.killLines, `boss-defeated:${index}`);
      entries.push(`☠️ ${farewell} Boss defeated. Its 42 gold remains pending market fate. Even management has to wait for accounting.`);
      preview = farewell;
    }
    if (next.phase === 'dead') {
      entries.push(`☠️ You fell in combat. ${persona.name} retains the position. Kevin has already amended your invoice. No market outcome was applied.`);
    }
    before = next;
  }
  if (options.bossEntered && !enteredBoss && final.phase === 'between') encounter(true);
  if (options.rested && final.phase === 'complete') {
    entries.push(`🧰 Kevin offers a free bandage. +${100 - final.hp} HP. “No charge. Please stop bleeding on the inventory.”`);
  }
  if (options.result && final.phase === 'complete') {
    entries.push(options.result === 'BLESSED'
      ? '✨ Your omen holds. The Chairman stays down. 🪙 +42 gold. Payroll has approved your continued existence.'
      : options.result === 'CURSED'
        ? '💀 Your omen fails. The Chairman rises for one fatal last strike. Your appeal period has expired. No boss reward; Kevin keeps the receipt.'
        : '🔮 Market voided. The Chairman stays down. 🪙 +42 gold; no prediction penalty. Accounting has classified this as somebody else’s problem.');
  }
  return { entries: entries.reverse(), preview };
}
