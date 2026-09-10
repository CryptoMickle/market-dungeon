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
    {
      "name": "Grave Belle",
      "species": "Zombie",
      "image": "/monsters/zombie-1-grave-belle.webp",
      "flavor": "Technically deceased. Socially still very active.",
      "chance": "45% spawn class",
      "encounters": [
        "Grave Belle notices you. Personal boundaries immediately become optional.",
        "She's undead, stylish, and suspiciously happy to see you.",
        "Grave Belle looks you up and down. Apparently dinner has arrived.",
        "Death has done very little for her confidence."
      ],
      "hitLines": [
        "Personal space remains an unresolved issue.",
        "She seems pleased with herself.",
        "That was unnecessarily intimate.",
        "Apparently manners died first."
      ],
      "killLines": [
        "Grave Belle collapses dramatically. Even now, she commits to the performance.",
        "Grave Belle has died again. Awkward.",
        "Her second death was somehow more theatrical than the first.",
        "Grave Belle exits with all the subtlety of her entrance."
      ]
    },
    {
      "name": "Miss Morgue",
      "species": "Zombie",
      "image": "/monsters/zombie-2-miss-morgue.webp",
      "flavor": "She wants brains, compliments, and preferably both.",
      "chance": "45% spawn class",
      "encounters": [
        "Miss Morgue appears with the confidence of someone who has nothing left to lose.",
        "She smiles. You immediately regret being biologically active.",
        "Miss Morgue has arrived. She seems professionally interested in your pulse.",
        "She looks surprisingly cheerful for someone with no vital signs."
      ],
      "hitLines": [
        "She calls that bedside manner.",
        "Your insurance probably does not cover this.",
        "Miss Morgue seems delighted by the result.",
        "Medical ethics have left the dungeon."
      ],
      "killLines": [
        "Miss Morgue clocks out permanently. Again.",
        "Miss Morgue is no longer accepting patients.",
        "The consultation has been terminated.",
        "Cause of death: adventurer."
      ]
    },
    {
      "name": "Velvet Rot",
      "species": "Zombie",
      "image": "/monsters/zombie-3-velvet-rot.webp",
      "flavor": "Somewhere between a nightmare and a questionable dating decision.",
      "chance": "45% spawn class",
      "encounters": [
        "Velvet Rot enters like this is somehow your fault.",
        "She makes undeath look alarmingly deliberate.",
        "Velvet Rot gives you the kind of smile usually followed by paperwork.",
        "You suddenly understand why the dungeon has no dating app."
      ],
      "hitLines": [
        "That relationship escalated quickly.",
        "She takes your discomfort as encouragement.",
        "Velvet appears satisfied. You are less enthusiastic.",
        "This date is going badly."
      ],
      "killLines": [
        "Velvet Rot dramatically exits the relationship.",
        "There will not be a second date.",
        "Velvet Rot leaves behind several red flags and some gold.",
        "It's not you. It's the sword."
      ]
    },
    {
      "name": "Lady Decomposition",
      "species": "Zombie",
      "image": "/monsters/zombie-4-lady-decomposition.webp",
      "flavor": "Beauty fades. Apparently attitude does not.",
      "chance": "45% spawn class",
      "encounters": [
        "Lady Decomposition arrives fashionably late by several centuries.",
        "She has the posture of royalty and the circulation of furniture.",
        "Lady Decomposition looks offended that you are still alive.",
        "Apparently the aristocracy survives everything except decomposition."
      ],
      "hitLines": [
        "Nobility has spoken.",
        "She considers this appropriate etiquette.",
        "The aristocracy remains surprisingly hands-on.",
        "You have offended the undead upper class."
      ],
      "killLines": [
        "Lady Decomposition finally experiences downward mobility.",
        "The undead aristocracy has lost another member.",
        "Her reign ends with significantly less dignity than intended.",
        "The estate will be hearing about this."
      ]
    }
  ],
  [
    {
      "name": "Gary",
      "species": "Goblin",
      "image": "/monsters/goblin-1-gary.webp",
      "flavor": "Gary has no plan, but he is extremely committed to it.",
      "chance": "35% spawn class",
      "encounters": [
        "Gary charges. Planning was apparently optional.",
        "Gary has mistaken confidence for competence.",
        "He has a knife, several bad ideas, and absolutely nothing to lose.",
        "Gary appears. Nobody requested Gary."
      ],
      "hitLines": [
        "This has significantly improved Gary's confidence.",
        "Gary looks shocked that this worked.",
        "Gary immediately considers himself a tactical genius.",
        "This was the best moment of Gary's week."
      ],
      "killLines": [
        "Gary has been promoted to former employee.",
        "Gary's plan has encountered a minor implementation issue.",
        "Gary is no longer available for comment.",
        "Gary finally runs out of confidence."
      ]
    },
    {
      "name": "Kevin the Unqualified",
      "species": "Goblin",
      "image": "/monsters/goblin-2-kevin-the-unqualified.webp",
      "flavor": "Nobody knows who hired Kevin. Kevin included.",
      "chance": "35% spawn class",
      "encounters": [
        "Kevin arrives carrying equipment he clearly does not understand.",
        "Kevin has received absolutely no training for this.",
        "Someone gave Kevin responsibility. This was a mistake.",
        "Kevin looks prepared. This is misleading."
      ],
      "hitLines": [
        "Kevin cannot believe that worked.",
        "His annual review is going surprisingly well.",
        "Kevin briefly achieves competence.",
        "This will absolutely go on Kevin's résumé."
      ],
      "killLines": [
        "Kevin has failed probation.",
        "Kevin's contract has been terminated with immediate effect.",
        "The hiring manager has several questions to answer.",
        "Kevin's onboarding process ends abruptly."
      ]
    },
    {
      "name": "Gribble",
      "species": "Goblin",
      "image": "/monsters/goblin-3-gribble.webp",
      "flavor": "Gribble has discovered armor. Civilization may never recover.",
      "chance": "35% spawn class",
      "encounters": [
        "Gribble has acquired equipment and immediately become unbearable.",
        "Gribble appears to have discovered the concept of preparation.",
        "Someone armed Gribble properly. Find them.",
        "Gribble looks extremely proud of several stolen objects."
      ],
      "hitLines": [
        "Gribble's investment in equipment pays dividends.",
        "He is going to talk about that hit for weeks.",
        "Gribble considers this proof of superiority.",
        "His confidence reaches dangerous levels."
      ],
      "killLines": [
        "Gribble's technological revolution ends here.",
        "Civilization narrowly avoids the Gribble era.",
        "Gribble's equipment is now available on the secondary market.",
        "Progress has once again been contained."
      ]
    },
    {
      "name": "Gary's Supervisor",
      "species": "Goblin",
      "image": "/monsters/goblin-4-garys-supervisor.webp",
      "flavor": "You finally found the person responsible for Gary.",
      "chance": "35% spawn class",
      "encounters": [
        "Gary's Supervisor would like to discuss your recent performance.",
        "Management has become aware of the Gary situation.",
        "He has a title, a coat, and no visible qualifications.",
        "You finally meet the man who approved Gary."
      ],
      "hitLines": [
        "Management considers this constructive feedback.",
        "Your performance review is deteriorating.",
        "He calls this leadership.",
        "Apparently this qualifies as employee development."
      ],
      "killLines": [
        "Gary's Supervisor has been removed from management.",
        "The organization chart just improved.",
        "Gary is now effectively unsupervised. Somehow worse.",
        "Middle management takes another historic loss."
      ]
    }
  ],
  [
    {
      "name": "Thud",
      "species": "Orc",
      "image": "/monsters/orc-1-thud.webp",
      "flavor": "Thud hits first, thinks never.",
      "chance": "20% spawn class",
      "encounters": [
        "Thud appears. The dungeon floor files a structural complaint.",
        "Thud has chosen force. To be fair, Thud always chooses force.",
        "He briefly considers strategy. The moment passes.",
        "Thud enters the room like a collapsing building."
      ],
      "hitLines": [
        "Complex negotiations have failed.",
        "Thud considers this diplomacy.",
        "The floor shakes slightly.",
        "Thud appears intellectually satisfied."
      ],
      "killLines": [
        "Thud falls over. The dungeon briefly registers seismic activity.",
        "Thud has encountered an unsolvable problem.",
        "The structural complaint has been resolved.",
        "Gravity completes the performance."
      ]
    },
    {
      "name": "Brutus",
      "species": "Orc",
      "image": "/monsters/orc-2-brutus.webp",
      "flavor": "His tactical doctrine contains one word: harder.",
      "chance": "20% spawn class",
      "encounters": [
        "Brutus has developed a strategy. Unfortunately it is still hitting things.",
        "Brutus believes subtlety is a type of weakness.",
        "His battle plan appears to have been written in crayon.",
        "Brutus arrives with several muscles and very few questions."
      ],
      "hitLines": [
        "His doctrine remains frustratingly effective.",
        "Brutus sees no reason to reconsider the plan.",
        "Thinking remains unnecessary.",
        "He seems encouraged by the simplicity of violence."
      ],
      "killLines": [
        "Brutus discovers that harder was not always the answer.",
        "The tactical doctrine requires revision.",
        "Brutus has reached the limits of applied force.",
        "The crayon battle plan requires significant amendments."
      ]
    },
    {
      "name": "Gronk",
      "species": "Orc",
      "image": "/monsters/orc-3-gronk.webp",
      "flavor": "Gronk briefly considered diplomacy. He did not enjoy it.",
      "chance": "20% spawn class",
      "encounters": [
        "Gronk enters. Diplomatic relations immediately deteriorate.",
        "Gronk has returned to his preferred negotiation format.",
        "Gronk has one facial expression. This is it.",
        "Negotiations begin without an agenda and with several muscles."
      ],
      "hitLines": [
        "Diplomacy has officially ended.",
        "Gronk considers the discussion productive.",
        "The negotiations remain physical.",
        "Gronk nods approvingly at his own technique."
      ],
      "killLines": [
        "Gronk's diplomatic mission has concluded.",
        "Peace has been restored through unconventional means.",
        "Gronk will not be attending the next summit.",
        "Formal relations have been suspended indefinitely."
      ]
    },
    {
      "name": "Meatwall",
      "species": "Orc",
      "image": "/monsters/orc-4-meatwall.webp",
      "flavor": "Less of an opponent. More of an architectural problem.",
      "chance": "20% spawn class",
      "encounters": [
        "Meatwall arrives. Technically, part of the room arrives with him.",
        "You are unsure whether to fight him or obtain planning permission.",
        "Meatwall appears to violate several building regulations.",
        "The dungeon has somehow developed shoulders."
      ],
      "hitLines": [
        "Architecture becomes unexpectedly aggressive.",
        "You have been struck by infrastructure.",
        "The building regulations remain unenforced.",
        "Meatwall continues being geographically inconvenient."
      ],
      "killLines": [
        "Meatwall becomes floorplan.",
        "The architectural problem has been demolished.",
        "Local property values immediately improve.",
        "Planning permission is no longer required."
      ]
    }
  ],
  [
    {
      "name": "The Dungeon Lord",
      "species": "Boss",
      "rank": "Dungeon Management",
      "image": "/monsters/boss-1-dungeon-lord.webp",
      "flavor": "Runs the dungeon with absolute authority and questionable administrative competence.",
      "chance": "BOSS spawn class",
      "encounters": [
        "The Dungeon Lord looks up from his paperwork. You have interrupted something deeply unnecessary.",
        "The Dungeon Lord sighs. Apparently nobody around here can do their job.",
        "The first layer of management has been notified.",
        "A crown, a title and absolutely no accountability."
      ],
      "hitLines": [
        "Management has entered the fight.",
        "This will be documented in the quarterly report.",
        "The Dungeon Lord calls this performance management.",
        "Your complaint has been denied."
      ],
      "killLines": [
        "The Dungeon Lord has been defeated. Organizational restructuring begins immediately.",
        "Dungeon management is currently unavailable.",
        "The first layer of management has collapsed.",
        "The org chart has developed a vacancy."
      ]
    },
    {
      "name": "The Senior Dungeon Lord",
      "species": "Boss",
      "rank": "Senior Management",
      "image": "/monsters/boss-2-senior-dungeon-lord.webp",
      "flavor": "More authority, more paperwork, exactly the same leadership skills.",
      "chance": "BOSS spawn class",
      "encounters": [
        "Your case has been escalated to senior management.",
        "Apparently defeating his subordinate generated paperwork.",
        "The Senior Dungeon Lord has reviewed your file. He dislikes it.",
        "Management would like this matter resolved permanently."
      ],
      "hitLines": [
        "Senior management provides direct feedback.",
        "This meeting is becoming increasingly hostile.",
        "Your escalation request has been denied.",
        "The chain of command remains surprisingly physical."
      ],
      "killLines": [
        "Senior management has left the organization.",
        "Your case has now been escalated even further.",
        "The dungeon urgently requires succession planning.",
        "The promotion committee regrets everything."
      ]
    },
    {
      "name": "The Executive Overlord",
      "species": "Boss",
      "rank": "Executive Management",
      "image": "/monsters/boss-3-executive-overlord.webp",
      "flavor": "Promoted beyond competence. Unfortunately, also beyond mortality.",
      "chance": "BOSS spawn class",
      "encounters": [
        "The Executive Overlord has reviewed the incident report.",
        "Your survival has become a board-level concern.",
        "He was told this would take five minutes.",
        "The executive team has finally noticed you."
      ],
      "hitLines": [
        "Executive action has been authorized.",
        "This is what leadership calls decisive action.",
        "The quarterly targets suddenly feel personal.",
        "Your KPI is now survival."
      ],
      "killLines": [
        "The executive team has lost quorum.",
        "Corporate governance has broken down completely.",
        "Your case is moving to the very top.",
        "Executive leadership has been involuntarily streamlined."
      ]
    },
    {
      "name": "The Chairman Below",
      "species": "Boss",
      "rank": "Board Level",
      "image": "/monsters/boss-4-chairman-below.webp",
      "flavor": "The final authority. There is no escalation path above him.",
      "chance": "BOSS spawn class",
      "encounters": [
        "The Chairman Below has cancelled three meetings to deal with you personally.",
        "You have reached the top of an organization that should never have existed.",
        "The Chairman has read the reports. All of them.",
        "The dungeon's final escalation procedure is apparently this."
      ],
      "hitLines": [
        "The board has reached a unanimous decision.",
        "Your appeal period has expired.",
        "Corporate policy has become extremely literal.",
        "The Chairman calls this stakeholder engagement."
      ],
      "killLines": [
        "The Chairman Below has been removed by unanimous adventurer vote.",
        "The board is dissolved. Mostly because you dissolved it.",
        "The dungeon enters immediate administration.",
        "There is officially nobody left to escalate this to."
      ]
    }
  ]
];

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
