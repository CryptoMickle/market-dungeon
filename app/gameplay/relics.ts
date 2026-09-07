// Ported from Delveworn practice mode at commit
// 00932e83dc89af85b2f3986a08bca2c5b6e6bc1c.

export type RelicRarity =
  | 'None'
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary';

export type RelicDefinition = {
  id: number;
  name: string;
  rarity: RelicRarity;
  imageSrc: string | null;
  effect: string;
  tradeoff: string;
};

export const RELIC_MIN_MAX_HP = 20;

function relic(
  id: number,
  name: string,
  rarity: Exclude<RelicRarity, 'None'>,
  effect: string,
  tradeoff: string,
): RelicDefinition {
  return {
    id,
    name,
    rarity,
    imageSrc: `/assets/relics/${name.toLowerCase().replaceAll(' ', '-')}.webp`,
    effect,
    tradeoff,
  };
}

export const RELIC_CATALOG: readonly RelicDefinition[] = [
  {
    id: 0,
    name: 'No Relic',
    rarity: 'None',
    imageSrc: null,
    effect: 'No relic equipped.',
    tradeoff: '',
  },
  relic(1, 'Blood Price', 'Common', '+10% outgoing damage.', 'Entering each new room costs 2 max HP, minimum 20.'),
  relic(2, 'Iron Shell', 'Common', '+20 max HP.', '-5% outgoing damage.'),
  relic(3, 'Echo Lens', 'Common', '+5 percentage points normal-attack critical chance.', '-20% Storm damage.'),
  relic(4, 'Glass Edge', 'Uncommon', '+20% outgoing damage.', '-20 max HP.'),
  relic(5, 'Ashen Fang', 'Uncommon', 'Heal 4 HP after every kill.', '-10 max HP.'),
  relic(6, 'Stormglass', 'Uncommon', '+30% Storm damage.', '-5% normal outgoing damage.'),
  relic(7, 'Gilded Hunger', 'Rare', '+75% gold gained.', '-5% outgoing damage.'),
  relic(8, 'Grave Pact', 'Rare', 'The first lethal hit revives you at 35% max HP.', '-5% outgoing damage.'),
  relic(9, 'Stormheart', 'Rare', '+45% Storm damage.', '-5% normal outgoing damage.'),
  relic(10, 'Titan Bone', 'Epic', '+50 max HP.', '-5% outgoing damage.'),
  relic(11, 'Black Mirror', 'Epic', '+15 percentage points critical chance and critical hits deal 3x damage.', '-15% normal outgoing damage.'),
  relic(12, 'Blood Engine', 'Epic', '+5% outgoing damage and heal 5 HP after every kill.', '-20 max HP.'),
  relic(13, 'Crown of Ruin', 'Legendary', '+35% outgoing damage.', '-40 max HP.'),
  relic(14, 'Undying Flame', 'Legendary', 'The first lethal hit revives you at 50% max HP.', '-15 max HP.'),
  relic(15, 'Worldbreaker', 'Legendary', '+30% outgoing damage and +10 percentage points critical chance.', '+15% incoming damage.'),
];

export function getRelicMaxHpModifier(relicId: number): number {
  if (relicId === 2) return 20;
  if (relicId === 10) return 50;
  if (relicId === 4) return -20;
  if (relicId === 5) return -10;
  if (relicId === 12) return -20;
  if (relicId === 13) return -40;
  if (relicId === 14) return -15;
  return 0;
}

export function getMaxHpForRelic(baseMaxHp: number, relicId: number): number {
  return Math.max(RELIC_MIN_MAX_HP, baseMaxHp + getRelicMaxHpModifier(relicId));
}

export function getOfferedRelics(rarityId: number): readonly RelicDefinition[] {
  if (rarityId < 1 || rarityId > 5) return [];
  const first = (rarityId - 1) * 3 + 1;
  return RELIC_CATALOG.slice(first, first + 3);
}

export function getRelicDefinition(relicId: number): RelicDefinition {
  return RELIC_CATALOG[relicId] ?? RELIC_CATALOG[0];
}
