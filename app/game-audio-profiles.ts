export type IntroWave = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type IntroTexture = 'grave' | 'rattle' | 'stomp' | 'throne' | 'coin';

export type CharacterAudioProfile = {
  baseFrequency: number;
  intervals: readonly number[];
  wave: IntroWave;
  stepSeconds: number;
  texture: IntroTexture;
};

/**
 * Every Delveworn character has a stable musical fingerprint. These profiles
 * drive synthesized intro cues, so the game does not need downloaded audio.
 */
export const CHARACTER_AUDIO_PROFILES = {
  'Grave Belle': { baseFrequency: 196, intervals: [0, -3, -7], wave: 'sawtooth', stepSeconds: 0.16, texture: 'grave' },
  'Miss Morgue': { baseFrequency: 220, intervals: [0, 3, -5], wave: 'triangle', stepSeconds: 0.15, texture: 'grave' },
  'Velvet Rot': { baseFrequency: 174, intervals: [0, 6, -2], wave: 'sine', stepSeconds: 0.18, texture: 'grave' },
  'Lady Decomposition': { baseFrequency: 147, intervals: [0, 4, 1, -8], wave: 'sawtooth', stepSeconds: 0.14, texture: 'grave' },
  Gary: { baseFrequency: 330, intervals: [0, 7, 3], wave: 'square', stepSeconds: 0.1, texture: 'rattle' },
  'Kevin the Unqualified': { baseFrequency: 294, intervals: [0, 12, -1], wave: 'square', stepSeconds: 0.12, texture: 'rattle' },
  Gribble: { baseFrequency: 262, intervals: [0, 5, 10], wave: 'triangle', stepSeconds: 0.11, texture: 'rattle' },
  "Gary's Supervisor": { baseFrequency: 247, intervals: [0, -2, 7, 0], wave: 'square', stepSeconds: 0.09, texture: 'rattle' },
  Thud: { baseFrequency: 98, intervals: [0, -5], wave: 'square', stepSeconds: 0.23, texture: 'stomp' },
  Brutus: { baseFrequency: 110, intervals: [0, 3, -4], wave: 'sawtooth', stepSeconds: 0.2, texture: 'stomp' },
  Gronk: { baseFrequency: 82, intervals: [0, 7, -5], wave: 'square', stepSeconds: 0.21, texture: 'stomp' },
  Meatwall: { baseFrequency: 73, intervals: [0, 2, -7], wave: 'sawtooth', stepSeconds: 0.24, texture: 'stomp' },
  'The Dungeon Lord': { baseFrequency: 131, intervals: [0, -2, -7, -12], wave: 'sawtooth', stepSeconds: 0.2, texture: 'throne' },
  'The Senior Dungeon Lord': { baseFrequency: 123, intervals: [0, 3, -4, -9], wave: 'triangle', stepSeconds: 0.19, texture: 'throne' },
  'The Executive Overlord': { baseFrequency: 117, intervals: [0, 6, 3, -10], wave: 'sawtooth', stepSeconds: 0.18, texture: 'throne' },
  'The Chairman Below': { baseFrequency: 65, intervals: [0, 1, -5, -12], wave: 'square', stepSeconds: 0.24, texture: 'throne' },
  'Quartermaster Kevin': { baseFrequency: 392, intervals: [0, 4, 7, 12], wave: 'triangle', stepSeconds: 0.105, texture: 'coin' },
} as const satisfies Record<string, CharacterAudioProfile>;

export type AudioCharacterName = keyof typeof CHARACTER_AUDIO_PROFILES;

export const MONSTER_AUDIO_NAMES = Object.freeze(
  Object.keys(CHARACTER_AUDIO_PROFILES).filter((name) => name !== 'Quartermaster Kevin'),
) as readonly Exclude<AudioCharacterName, 'Quartermaster Kevin'>[];

export function audioProfileSignature(profile: CharacterAudioProfile): string {
  return [profile.baseFrequency, profile.intervals.join(','), profile.wave, profile.stepSeconds, profile.texture].join('|');
}

export function getCharacterAudioProfile(name: string): CharacterAudioProfile {
  const known = CHARACTER_AUDIO_PROFILES[name as AudioCharacterName];
  if (known) return known;

  let hash = 0;
  for (const character of name) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return {
    baseFrequency: 90 + (hash % 260),
    intervals: [0, 3 + (hash % 5), -2 - (hash % 7)],
    wave: (['sine', 'square', 'sawtooth', 'triangle'] as const)[hash % 4],
    stepSeconds: 0.12 + (hash % 6) * 0.015,
    texture: (['grave', 'rattle', 'stomp', 'throne'] as const)[hash % 4],
  };
}
