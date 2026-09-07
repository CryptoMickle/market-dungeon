import type { MonsterType } from './delveworn-engine.ts';

export type DelvewornPersona = {
  name: string;
  species: 'Zombie' | 'Goblin' | 'Orc' | 'Boss';
  rank?: string;
  image: string;
  flavor: string;
  chance?: string;
  encounters: readonly string[];
  hitLines: readonly string[];
  killLines: readonly string[];
};

const PERSONAS: readonly (readonly DelvewornPersona[])[] = [
  [
    { name: 'Grave Belle', species: 'Zombie', image: '/monsters/zombie-1-grave-belle.webp', flavor: 'Technically deceased. Socially still very active.', chance: '45% spawn class', encounters: ['Grave Belle notices you. Personal boundaries immediately become optional.', "She's undead, stylish, and suspiciously happy to see you."], hitLines: ['Personal space remains an unresolved issue.', 'Apparently manners died first.', 'She seems pleased with herself.', 'That was unnecessarily intimate.'], killLines: ['Grave Belle has died again. Awkward.', 'Her second death was somehow more theatrical than the first.'] },
    { name: 'Miss Morgue', species: 'Zombie', image: '/monsters/zombie-2-miss-morgue.webp', flavor: 'She wants brains, compliments, and preferably both.', chance: '45% spawn class', encounters: ['She smiles. You immediately regret being biologically active.', 'Miss Morgue seems professionally interested in your pulse.'], hitLines: ['Your insurance probably does not cover this.', 'Medical ethics have left the dungeon.', 'She calls that bedside manner.', 'Miss Morgue seems delighted by the result.'], killLines: ['Miss Morgue is no longer accepting patients.', 'Cause of death: adventurer.'] },
    { name: 'Velvet Rot', species: 'Zombie', image: '/monsters/zombie-3-velvet-rot.webp', flavor: 'Somewhere between a nightmare and a questionable dating decision.', chance: '45% spawn class', encounters: ['Velvet Rot enters like this is somehow your fault.', 'You suddenly understand why the dungeon has no dating app.'], hitLines: ['That relationship escalated quickly.', 'This date is going badly.', 'She takes your discomfort as encouragement.', 'Velvet appears satisfied. You are less enthusiastic.'], killLines: ['Velvet Rot leaves behind several red flags and some gold.', "It's not you. It's the sword."] },
    { name: 'Lady Decomposition', species: 'Zombie', image: '/monsters/zombie-4-lady-decomposition.webp', flavor: 'Beauty fades. Apparently attitude does not.', chance: '45% spawn class', encounters: ['Lady Decomposition arrives fashionably late by several centuries.', 'She looks offended that you are still alive.'], hitLines: ['Nobility has spoken.', 'You have offended the undead upper class.', 'She considers this appropriate etiquette.', 'The aristocracy remains surprisingly hands-on.'], killLines: ['Lady Decomposition finally experiences downward mobility.', 'The estate will be hearing about this.'] },
  ],
  [
    { name: 'Gary', species: 'Goblin', image: '/monsters/goblin-1-gary.webp', flavor: 'Gary has no plan, but he is extremely committed to it.', chance: '35% spawn class', encounters: ['Gary charges. Planning was apparently optional.', 'Gary appears. Nobody requested Gary.'], hitLines: ["Gary looks shocked that this worked.", "This was the best moment of Gary's week."], killLines: ['Gary has been promoted to former employee.', "Gary's plan has encountered a minor implementation issue."] },
    { name: 'Kevin the Unqualified', species: 'Goblin', image: '/monsters/goblin-2-kevin-the-unqualified.webp', flavor: 'Nobody knows who hired Kevin. Kevin included.', chance: '35% spawn class', encounters: ['Kevin has received absolutely no training for this.', 'Kevin looks prepared. This is misleading.'], hitLines: ['Kevin cannot believe that worked.', "This will absolutely go on Kevin's résumé."], killLines: ['Kevin has failed probation.', 'The hiring manager has several questions to answer.'] },
    { name: 'Gribble', species: 'Goblin', image: '/monsters/goblin-3-gribble.webp', flavor: 'Gribble has discovered armor. Civilization may never recover.', chance: '35% spawn class', encounters: ['Gribble has acquired equipment and immediately become unbearable.', 'Someone armed Gribble properly. Find them.'], hitLines: ['He is going to talk about that hit for weeks.', "Gribble's investment in equipment pays dividends."], killLines: ["Gribble's technological revolution ends here.", 'Civilization narrowly avoids the Gribble era.'] },
    { name: "Gary's Supervisor", species: 'Goblin', image: '/monsters/goblin-4-garys-supervisor.webp', flavor: 'You finally found the person responsible for Gary.', chance: '35% spawn class', encounters: ['Management has become aware of the Gary situation.', 'You finally meet the man who approved Gary.'], hitLines: ['Management considers this constructive feedback.', 'He calls this leadership.'], killLines: ['The organization chart just improved.', 'Middle management takes another historic loss.'] },
  ],
  [
    { name: 'Thud', species: 'Orc', image: '/monsters/orc-1-thud.webp', flavor: 'Thud hits first, thinks never.', chance: '20% spawn class', encounters: ['Thud appears. The dungeon floor files a structural complaint.', 'He briefly considers strategy. The moment passes.'], hitLines: ['Complex negotiations have failed.', 'Thud considers this diplomacy.'], killLines: ['Thud falls over. The dungeon briefly registers seismic activity.', 'The structural complaint has been resolved.'] },
    { name: 'Brutus', species: 'Orc', image: '/monsters/orc-2-brutus.webp', flavor: 'His tactical doctrine contains one word: harder.', chance: '20% spawn class', encounters: ['Brutus believes subtlety is a type of weakness.', 'His battle plan appears to have been written in crayon.'], hitLines: ['His doctrine remains frustratingly effective.', 'Thinking remains unnecessary.'], killLines: ['Brutus discovers that harder was not always the answer.', 'The crayon battle plan requires significant amendments.'] },
    { name: 'Gronk', species: 'Orc', image: '/monsters/orc-3-gronk.webp', flavor: 'Gronk briefly considered diplomacy. He did not enjoy it.', chance: '20% spawn class', encounters: ['Gronk enters. Diplomatic relations immediately deteriorate.', 'Negotiations begin without an agenda and with several muscles.'], hitLines: ['Diplomacy has officially ended.', 'Gronk considers the discussion productive.'], killLines: ['Gronk will not be attending the next summit.', 'Formal relations have been suspended indefinitely.'] },
    { name: 'Meatwall', species: 'Orc', image: '/monsters/orc-4-meatwall.webp', flavor: 'Less of an opponent. More of an architectural problem.', chance: '20% spawn class', encounters: ['Meatwall arrives. Technically, part of the room arrives with him.', 'You are unsure whether to fight him or obtain planning permission.'], hitLines: ['You have been struck by infrastructure.', 'Architecture becomes unexpectedly aggressive.'], killLines: ['The architectural problem has been demolished.', 'Local property values immediately improve.'] },
  ],
  [
    { name: 'The Dungeon Lord', species: 'Boss', rank: 'Dungeon Management', image: '/monsters/boss-1-dungeon-lord.webp', flavor: 'Runs the dungeon with absolute authority and questionable administrative competence.', encounters: ['The Dungeon Lord looks up from his paperwork. You have interrupted something deeply unnecessary.', 'A crown, a title and absolutely no accountability.'], hitLines: ['This will be documented in the quarterly report.', 'Your complaint has been denied.'], killLines: ['Organizational restructuring begins immediately.', 'Dungeon management is currently unavailable.'] },
    { name: 'The Senior Dungeon Lord', species: 'Boss', rank: 'Senior Management', image: '/monsters/boss-2-senior-dungeon-lord.webp', flavor: 'More authority, more paperwork, exactly the same leadership skills.', encounters: ['Your case has been escalated to senior management.', 'The Senior Dungeon Lord has reviewed your file. He dislikes it.'], hitLines: ['Senior management provides direct feedback.', 'Your escalation request has been denied.'], killLines: ['Senior management has left the organization.', 'The dungeon urgently requires succession planning.'] },
    { name: 'The Executive Overlord', species: 'Boss', rank: 'Executive Management', image: '/monsters/boss-3-executive-overlord.webp', flavor: 'Promoted beyond competence. Unfortunately, also beyond mortality.', encounters: ['Your survival has become a board-level concern.', 'The executive team has finally noticed you.'], hitLines: ['The quarterly targets suddenly feel personal.', 'Your KPI is now survival.'], killLines: ['The executive team has lost quorum.', 'Executive leadership has been involuntarily streamlined.'] },
    { name: 'The Chairman Below', species: 'Boss', rank: 'Board Level', image: '/monsters/boss-4-chairman-below.webp', flavor: 'The final authority. There is no escalation path above him.', encounters: ['You have reached the top of an organization that should never have existed.', 'The Chairman has read the reports. All of them.'], hitLines: ['The board has reached a unanimous decision.', 'Your appeal period has expired.'], killLines: ['The board is dissolved. Mostly because you dissolved it.', 'There is officially nobody left to escalate this to.'] },
  ],
] as const;

function tierIndex(room: number): number {
  return Math.max(0, Math.min(3, Math.floor((Math.max(1, room) - 1) / 10)));
}

function pick(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length]!;
}

export function getDelvewornPersona(monsterType: MonsterType, room: number): DelvewornPersona {
  return PERSONAS[monsterType]![tierIndex(room)]!;
}

export function encounterLog(monsterType: MonsterType, room: number): string[] {
  const persona = getDelvewornPersona(monsterType, room);
  return [
    `🚪 You enter Room ${room}. ${monsterType === 3 ? 'Management has been notified.' : 'The safety inspection remains theoretical.'}`,
    `👁️ ${pick(persona.encounters, room)}`,
  ];
}

export function attackLogs(monsterType: MonsterType, room: number, damage: number, incoming: number, critical: boolean): string[] {
  const persona = getDelvewornPersona(monsterType, room);
  return [
    critical
      ? `💥 CRITICAL HIT! The paperwork will be incredible. ${damage} DAMAGE.`
      : `⚔️ You deal ${damage} DAMAGE to ${persona.name}. Negotiations remain unproductive.`,
    `💢 ${persona.name} deals ${incoming} DAMAGE. ${pick(persona.hitLines, room + damage + incoming)}`,
  ];
}

export function stormLogs(monsterType: MonsterType, room: number, damage: number, maximum: number, incoming: number): string[] {
  const persona = getDelvewornPersona(monsterType, room);
  const ratio = maximum > 0 ? damage / maximum : 0;
  const verdict = damage === 0 ? 'Magnificent presentation. No measurable effect.'
    : ratio < .35 ? 'More drizzle than thunderstorm.'
      : ratio < .75 ? 'Acceptable chaos.' : 'The storm has chosen violence.';
  return [`⚡ Storm deals ${damage} DAMAGE. ${verdict}`, `💢 ${persona.name} deals ${incoming} DAMAGE. ${pick(persona.hitLines, room + damage)}`];
}

export function defeatLogs(monsterType: MonsterType, room: number, reward: number): string[] {
  const persona = getDelvewornPersona(monsterType, room);
  return [
    `☠️ ${pick(persona.killLines, room + reward)}`,
    `🪙 Base reward: ${reward} gold. The dungeon reluctantly honors payroll.`,
  ];
}

export function bossDialogue(room: number): string {
  if (room >= 40) return '“You have reached the board. There is nowhere left to escalate.”';
  if (room >= 30) return '“Your continued survival has become an executive-level concern.”';
  if (room >= 20) return '“Your case has been escalated. I was told you would be less persistent.”';
  return '“Ah. Another adventurer. How original.”';
}
