import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_AUDIO_PROFILES,
  MONSTER_AUDIO_NAMES,
  audioProfileSignature,
  getCharacterAudioProfile,
} from '../app/game-audio-profiles.ts';

const expectedMonsters = [
  'Grave Belle', 'Miss Morgue', 'Velvet Rot', 'Lady Decomposition',
  'Gary', 'Kevin the Unqualified', 'Gribble', "Gary's Supervisor",
  'Thud', 'Brutus', 'Gronk', 'Meatwall',
  'The Dungeon Lord', 'The Senior Dungeon Lord', 'The Executive Overlord', 'The Chairman Below',
] as const;

test('all 16 monsters and Quartermaster Kevin have distinct intro profiles', () => {
  assert.equal(MONSTER_AUDIO_NAMES.length, 16);
  assert.deepEqual([...MONSTER_AUDIO_NAMES].sort(), [...expectedMonsters].sort());
  assert.equal(Object.keys(CHARACTER_AUDIO_PROFILES).length, 17);
  assert.ok('Quartermaster Kevin' in CHARACTER_AUDIO_PROFILES);

  const signatures = Object.values(CHARACTER_AUDIO_PROFILES).map(audioProfileSignature);
  assert.equal(new Set(signatures).size, signatures.length);
});

test('unknown characters receive a stable synthesized fallback profile', () => {
  assert.deepEqual(getCharacterAudioProfile('Future Monster'), getCharacterAudioProfile('Future Monster'));
});
