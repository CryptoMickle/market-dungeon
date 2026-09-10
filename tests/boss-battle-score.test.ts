import assert from 'node:assert/strict';
import test from 'node:test';
import { BossBattleScore, BOSS_SCORE_GAIN } from '../app/boss-battle-score.ts';

class TestParam {
  value = 0;
  ramps: { value: number; time: number }[] = [];
  setValueAtTime(value: number) { this.value = value; }
  cancelAndHoldAtTime() {}
  linearRampToValueAtTime(value: number, time: number) { this.ramps.push({ value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.ramps.push({ value, time }); }
}

class TestNode {
  gain = new TestParam();
  frequency = new TestParam();
  pan = new TestParam();
  Q = new TestParam();
  type = '';
  buffer: unknown;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: number[] = [];
  disconnected = false;
  connect(destination: TestNode) { return destination; }
  disconnect() { this.disconnected = true; }
  start(when = 0) { this.starts.push(when); }
  stop(when = 0) { this.stops.push(when); }
}

function scoreFixture() {
  const sources: TestNode[] = [];
  const gains: TestNode[] = [];
  const addSource = () => {
    const node = new TestNode();
    sources.push(node);
    return node;
  };
  const context = {
    currentTime: 0,
    sampleRate: 48_000,
    state: 'running',
    createGain() { const node = new TestNode(); gains.push(node); return node; },
    createOscillator: addSource,
    createBufferSource: addSource,
    createStereoPanner: () => new TestNode(),
    createBiquadFilter: () => new TestNode(),
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    resume() { assert.fail('The score must never activate an audio context.'); },
  };
  const score = new BossBattleScore(context as unknown as AudioContext, new TestNode() as unknown as AudioNode);
  return { context, score, sources, gains };
}

test('boss knockout cancels future notes and ends sounding music within 60 ms', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { context, score, sources, gains } = scoreFixture();
  score.start();
  const initialSources = sources.length;
  assert.ok(initialSources > 0);
  score.start();
  assert.equal(sources.length, initialSources, 'Repeated active boss updates must not stack tracks.');
  assert.equal(gains[0].gain.ramps.at(-1)?.value, BOSS_SCORE_GAIN);

  // Advance far enough that some notes are sounding and one upcoming step is
  // scheduled by the lookahead window, then simulate the exact knockout time.
  context.currentTime = 0.31;
  t.mock.timers.tick(25);
  assert.ok(sources.some(source => source.starts[0] > context.currentTime));
  assert.ok(sources.some(source => source.starts[0] <= context.currentTime));
  score.stop();
  const sourceCountAtKnockout = sources.length;
  for (const source of sources) {
    const stoppedAt = source.stops.at(-1)!;
    if (source.starts[0] > context.currentTime) assert.ok(stoppedAt <= context.currentTime);
    else assert.ok(stoppedAt <= context.currentTime + 0.06);
  }
  assert.equal(gains[0].gain.ramps.at(-1)?.value, 0);
  assert.ok(gains[0].gain.ramps.at(-1)!.time <= context.currentTime + 0.06);
  context.currentTime += 10;
  t.mock.timers.tick(10_000);
  assert.equal(sources.length, sourceCountAtKnockout, 'No timer may make fresh notes after knockout.');
  score.destroy();
  assert.ok(sources.every(source => source.disconnected));
});

test('a suspended context stays inactive, and only an explicit new start begins a stopped score', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { context, score, sources } = scoreFixture();
  context.state = 'suspended';
  score.start();
  t.mock.timers.tick(1_000);
  assert.equal(sources.length, 0);
  score.stop();
  context.state = 'running';
  context.currentTime = 3;
  t.mock.timers.tick(1_000);
  assert.equal(sources.length, 0, 'A state change must not restart a stopped track.');
  score.start();
  assert.ok(sources.length > 0);
  score.destroy();
  const afterDestroy = sources.length;
  score.start();
  t.mock.timers.tick(1_000);
  assert.equal(sources.length, afterDestroy);
});

test('pausing during the knockout fade silences old voices before a later rematch resumes audio time', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { context, score, sources, gains } = scoreFixture();
  score.start();
  context.currentTime = 0.1;
  const oldVoices = [...sources];
  score.stop();
  assert.ok(oldVoices.some(source => source.stops.at(-1)! > context.currentTime), 'Knockout normally leaves a short release.');

  // The OS freezes this context before that release can elapse. Hard pause must
  // still clear the track even though ordinary stop already set running=false.
  context.state = 'suspended';
  score.stop(true);
  assert.equal(gains[0].gain.value, 0);
  assert.ok(oldVoices.every(source => source.stops.at(-1)! <= context.currentTime && source.disconnected));
  t.mock.timers.tick(1_000);
  assert.equal(sources.length, oldVoices.length);

  context.state = 'running';
  score.start();
  assert.ok(sources.length > oldVoices.length);
  assert.ok(oldVoices.every(source => source.disconnected), 'A new fade-in must never reconnect a previous fight.');
  assert.equal(gains[0].gain.ramps.at(-1)?.value, BOSS_SCORE_GAIN);
  score.destroy();
});
