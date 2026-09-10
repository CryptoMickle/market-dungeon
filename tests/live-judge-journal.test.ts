import assert from 'node:assert/strict';
import test from 'node:test';

import { getDelvewornPersona } from '../app/gameplay/delveworn-personas.ts';
import { canonicalJudgeActionLog, judgeCombatSnapshot, replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';
import { liveJudgeJournal } from '../app/live-judge-journal.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';

const SEED = 'g'.repeat(43);
const CRITICAL_SEED = `${'g'.repeat(40)}001`;
const ZERO_STORM_SEED = `${'g'.repeat(40)}002`;
type JournalOptions = NonNullable<Parameters<typeof liveJudgeJournal>[3]>;

test('journal cosmetics never mutate the action trace, alter its proof, or use runtime randomness', (t) => {
  const actions = validLiveJudgeActions(SEED);
  const trace = structuredClone(actions);
  const proof = replayJudgeCombat(SEED, actions);
  const canonical = canonicalJudgeActionLog(SEED, actions);
  actions.forEach(Object.freeze);
  Object.freeze(actions);
  t.mock.method(Math, 'random', () => { throw new Error('Journal must not consume gameplay randomness'); });

  for (const options of [{}, { bossEntered: true }, { rested: true },
    { result: 'BLESSED' }, { result: 'CURSED' }, { result: 'VOID', rested: true }] satisfies JournalOptions[]) {
    liveJudgeJournal(SEED, 'UP', actions, options);
    assert.deepEqual(actions, trace);
    assert.deepEqual(replayJudgeCombat(SEED, actions), proof);
    assert.equal(canonicalJudgeActionLog(SEED, actions), canonical);
  }
});

test('critical overkill distinguishes the roll from actual enemy HP removed', () => {
  const actions = validLiveJudgeActions(CRITICAL_SEED);
  const combat = judgeCombatSnapshot(CRITICAL_SEED, actions);
  assert.equal(combat.phase, 'complete');
  assert.deepEqual(combat.lastExchange, { dealt: 25, taken: 0, critical: true, rolledDamage: 38 });

  const journal = liveJudgeJournal(CRITICAL_SEED, 'UP', actions);
  const critical = journal.entries.find(entry => entry.includes('CRITICAL HIT') && entry.includes('Rolled 38'));
  assert.ok(critical, 'The final critical strike must be visible in the log');
  assert.match(critical, /38 DAMAGE/);
  assert.match(critical, /25 enemy HP remained/);
  assert.match(critical, /25 HP was removed/);
  assert.match(critical, /No retaliation/);
  assert.doesNotMatch(critical, /Chairman Below deals \d+ DAMAGE/);
});

test('a zero-damage storm keeps its miss and the actual Meatwall retaliation', () => {
  const actions: JudgeCombatAction[] = [{ room: 8, action: 'storm' }];
  const combat = judgeCombatSnapshot(ZERO_STORM_SEED, actions);
  assert.equal(combat.lastExchange?.dealt, 0);
  assert.equal(combat.lastExchange?.taken, 12);
  const initial = liveJudgeJournal(ZERO_STORM_SEED, 'DOWN', []);
  const journal = liveJudgeJournal(ZERO_STORM_SEED, 'DOWN', actions);

  assert.match(journal.entries[0], /Storm deals 0 DAMAGE/);
  assert.match(journal.entries[0], /Magnificent presentation\. No measurable effect\./);
  assert.match(journal.entries[0], /Meatwall deals 12 DAMAGE/);
  assert.doesNotMatch(journal.entries[0], /Chairman|CRITICAL|No retaliation/);
  assert.deepEqual(journal.entries.slice(-initial.entries.length), initial.entries, 'New events belong before the existing history');
});

test('potions report capped actual healing and separate combat retaliation from safe healing', () => {
  const combatPotion: JudgeCombatAction[] = [{ room: 8, action: 'potion' }];
  const combat = judgeCombatSnapshot(SEED, combatPotion);
  assert.equal(combat.lastExchange?.healed, 24);
  assert.equal(combat.lastExchange?.taken, 12);
  assert.equal(combat.hp, 88);
  const entry = liveJudgeJournal(SEED, 'UP', combatPotion).entries[0];
  assert.match(entry, /restores 24 HP/);
  assert.match(entry, /Meatwall deals 12 DAMAGE/);
  assert.match(entry, /12 HP lost/);
  assert.doesNotMatch(entry, /restores 25 HP|No retaliation/);

  const actions = validLiveJudgeActions(SEED);
  const safePotionIndex = actions.findIndex((action, index) => action.action === 'potion'
    && judgeCombatSnapshot(SEED, actions.slice(0, index)).phase === 'between');
  assert.ok(safePotionIndex >= 0);
  const prefix = actions.slice(0, safePotionIndex + 1);
  const healed = judgeCombatSnapshot(SEED, prefix).lastExchange!.healed;
  const safe = liveJudgeJournal(SEED, 'UP', prefix).entries[0];
  assert.match(safe, /Kevin hands you a potion/);
  assert.ok(safe.includes(`+${healed} HP`));
  assert.match(safe, /No retaliation between fights/);
  assert.doesNotMatch(safe, /deals \d+ DAMAGE|HP lost/);
});

test('both knockout exchanges omit retaliation and boss gold waits for an explicit verified outcome', () => {
  const actions = validLiveJudgeActions(SEED);
  let knockouts = 0;
  for (let length = 1; length <= actions.length; length++) {
    const before = judgeCombatSnapshot(SEED, actions.slice(0, length - 1));
    const after = judgeCombatSnapshot(SEED, actions.slice(0, length));
    if (!((before.guardHp > 0 && after.guardHp === 0) || (before.bossHp > 0 && after.bossHp === 0))) continue;
    knockouts += 1;
    const entry = liveJudgeJournal(SEED, 'UP', actions.slice(0, length)).entries.find(line => /falls before retaliating/.test(line));
    assert.ok(entry);
    assert.match(entry, /No retaliation/);
    assert.doesNotMatch(entry, /deals \d+ DAMAGE\. (?:The board|Your appeal|Corporate|The Chairman|Architecture|You have|The building|Meatwall)/);
    assert.equal(after.lastExchange?.taken, 0);
  }
  assert.equal(knockouts, 2);

  const pending = liveJudgeJournal(SEED, 'UP', actions).entries.join('\n');
  assert.match(pending, /\+18 gold/);
  assert.match(pending, /42 gold remains pending/);
  assert.doesNotMatch(pending, /\+42 gold/);
  for (const result of ['BLESSED', 'VOID'] as const) {
    const settled = liveJudgeJournal(SEED, 'UP', actions, { result }).entries;
    assert.match(settled[0], /\+42 gold/);
    assert.equal(settled.filter(line => /\+42 gold/.test(line)).length, 1);
  }
  const cursed = liveJudgeJournal(SEED, 'UP', actions, { result: 'CURSED' }).entries;
  assert.match(cursed[0], /fatal last strike/);
  assert.match(cursed[0], /No boss reward/);
  assert.doesNotMatch(cursed.join('\n'), /\+42 gold/);
  assert.doesNotMatch(liveJudgeJournal(SEED, 'UP', [], { result: 'BLESSED', rested: true }).entries.join('\n'), /\+42 gold|bandage/);
});

test('reload reconstructs the same journal with the final-tier Meatwall and Chairman personas', () => {
  const actions = validLiveJudgeActions(SEED);
  const initial = liveJudgeJournal(SEED, 'DOWN', []);
  const meatwall = getDelvewornPersona(2, 39);
  const chairman = getDelvewornPersona(3, 40);
  assert.ok(meatwall.encounters.some(quote => initial.entries.some(entry => entry.includes(quote))));
  assert.ok(meatwall.encounters.includes(initial.preview));
  assert.ok(!chairman.encounters.some(quote => initial.entries.some(entry => entry.includes(quote))));

  const guardEnd = actions.findIndex((_, index) => judgeCombatSnapshot(SEED, actions.slice(0, index + 1)).guardHp === 0) + 1;
  const bossEntrance = liveJudgeJournal(SEED, 'DOWN', actions.slice(0, guardEnd), { bossEntered: true });
  assert.ok(chairman.encounters.includes(bossEntrance.preview));
  assert.ok(bossEntrance.entries[0].includes(bossEntrance.preview));

  const options: JournalOptions = { bossEntered: true, rested: true, result: 'BLESSED' };
  const original = liveJudgeJournal(SEED, 'DOWN', actions, options);
  const restored = JSON.parse(JSON.stringify({ seed: SEED, direction: 'DOWN', actions, options }));
  assert.deepEqual(liveJudgeJournal(restored.seed, restored.direction, restored.actions, restored.options), original);
  assert.ok(meatwall.killLines.some(quote => original.entries.some(entry => entry.includes(quote))));
  assert.ok(chairman.killLines.some(quote => original.entries.some(entry => entry.includes(quote))));
  assert.equal(original.entries.filter(entry => chairman.encounters.some(quote => entry.includes(quote))).length, 1);
  assert.match(original.entries.join('\n'), /Kevin offers a free bandage/);
  assert.doesNotMatch(original.entries.join('\n'), /The Dungeon Lord|The Executive Overlord|The Senior Dungeon Lord|Room 8|Room 9/);
});

test('invalid transcripts produce no invented journal or terminal rewards', () => {
  assert.deepEqual(liveJudgeJournal(SEED, 'UP', [{ room: 9, action: 'attack' }], { result: 'BLESSED' }), { entries: [], preview: '' });
  const terminal = validLiveJudgeActions(SEED);
  assert.deepEqual(liveJudgeJournal(SEED, 'UP', [...terminal, { room: 9, action: 'attack' }], { result: 'BLESSED' }), { entries: [], preview: '' });
});
