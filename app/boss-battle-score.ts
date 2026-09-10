/** Original, deterministic music for an active boss fight. No fetched audio. */
export const BOSS_SCORE_METADATA = Object.freeze({
  title: 'The Throne Below',
  tempo: 84,
  key: 'D minor',
  bars: 16,
  beatsPerBar: 4,
  stepsPerBeat: 4,
});

/** The score has its own bus so stopping it never interrupts other game audio. */
export const BOSS_SCORE_GAIN = 0.34;

const BEAT_SECONDS = 60 / BOSS_SCORE_METADATA.tempo;
const STEP_SECONDS = BEAT_SECONDS / BOSS_SCORE_METADATA.stepsPerBeat;
const STEPS_PER_BAR = BOSS_SCORE_METADATA.beatsPerBar * BOSS_SCORE_METADATA.stepsPerBeat;
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_MILLISECONDS = 25;
const STOP_FADE_SECONDS = 0.035;
const SOURCE_STOP_SECONDS = 0.04;

type ScoreBar = {
  bass: number;
  chord: readonly number[];
  motif: readonly [number, number];
};

// MIDI notes: Dm(add9), Bbmaj7, C(add9), Fmaj7, Gm and A create an uneasy
// sixteen-bar phrase. The second half opens the voicing without getting louder.
const SCORE_BARS: readonly ScoreBar[] = [
  { bass: 38, chord: [50, 57, 65, 76], motif: [62, 69] },
  { bass: 38, chord: [50, 57, 65, 76], motif: [65, 64] },
  { bass: 34, chord: [46, 53, 62, 69], motif: [62, 65] },
  { bass: 36, chord: [48, 55, 62, 64], motif: [64, 67] },
  { bass: 38, chord: [50, 57, 65, 76], motif: [69, 65] },
  { bass: 41, chord: [53, 60, 64, 69], motif: [64, 60] },
  { bass: 31, chord: [43, 50, 58, 65], motif: [62, 58] },
  { bass: 33, chord: [45, 52, 61, 67], motif: [61, 64] },
  { bass: 38, chord: [50, 57, 64, 77], motif: [74, 69] },
  { bass: 38, chord: [50, 57, 65, 76], motif: [65, 64] },
  { bass: 34, chord: [46, 53, 62, 69], motif: [65, 69] },
  { bass: 36, chord: [48, 55, 62, 64], motif: [67, 64] },
  { bass: 38, chord: [50, 57, 65, 76], motif: [69, 65] },
  { bass: 34, chord: [46, 53, 62, 69], motif: [62, 58] },
  { bass: 31, chord: [43, 50, 58, 65], motif: [62, 65] },
  { bass: 33, chord: [45, 52, 61, 67], motif: [64, 61] },
];

function noteFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

type Voice = {
  source: AudioScheduledSourceNode;
  start: number;
  connections: AudioNode[];
};

/**
 * Owns only the boss score. The game owns AudioContext activation, visibility,
 * mute and encounter state. In particular, this class never resumes a context.
 */
export class BossBattleScore {
  private readonly context: AudioContext;
  private readonly bus: GainNode;
  private readonly drumNoise: AudioBuffer;
  private readonly voices = new Set<Voice>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private destroyed = false;
  private nextStepTime = 0;
  private step = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(output);

    // One repeatable noise texture for drum skins. It has no connection to the
    // game's random rolls and never changes the sequence of combat outcomes.
    this.drumNoise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
    const data = this.drumNoise.getChannelData(0);
    let seed = 0x4d445247;
    for (let index = 0; index < data.length; index += 1) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      data[index] = ((seed / 0x1_0000_0000) * 2 - 1) * Math.exp(-index / (context.sampleRate * 0.045));
    }
  }

  start() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.step = 0;
    const now = this.context.currentTime;
    this.nextStepTime = now + 0.025;
    this.bus.gain.cancelAndHoldAtTime(now);
    this.bus.gain.linearRampToValueAtTime(BOSS_SCORE_GAIN, now + 0.05);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), SCHEDULER_MILLISECONDS);
  }

  stop(immediate = false) {
    if (this.destroyed || (!this.running && !immediate)) return;
    this.running = false;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    const now = this.context.currentTime;
    this.bus.gain.cancelAndHoldAtTime(now);
    if (immediate) this.bus.gain.setValueAtTime(0, now);
    else this.bus.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
    for (const voice of this.voices) {
      // Cancel the lookahead notes before their start, and release the notes
      // already sounding. There are no delays or reverb tails after the bus.
      try { voice.source.stop(immediate || voice.start > now ? now : now + SOURCE_STOP_SECONDS); }
      catch { /* A source may have finished while the event loop was busy. */ }
      // Context suspension freezes audio time, so a fade cannot finish there.
      // Disconnect immediately to keep old notes out of the next explicit start.
      if (immediate) this.disconnect(voice);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.stop(true);
    this.destroyed = true;
    this.bus.disconnect();
  }

  private disconnect(voice: Voice) {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.connections.forEach(node => node.disconnect());
    this.voices.delete(voice);
  }

  private track(source: AudioScheduledSourceNode, start: number, end: number, connections: AudioNode[]) {
    const voice: Voice = { source, start, connections };
    this.voices.add(voice);
    source.onended = () => this.disconnect(voice);
    source.start(start);
    source.stop(end);
  }

  private envelope(start: number, duration: number, volume: number, attack: number, release: number) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, start + Math.max(attack, duration - release));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    return gain;
  }

  private tone(midi: number, start: number, duration: number, volume: number, type: OscillatorType, attack: number, release: number, pan = 0) {
    const source = this.context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(noteFrequency(midi), start);
    const gain = this.envelope(start, duration, volume, attack, release);
    const position = this.context.createStereoPanner();
    position.pan.value = pan;
    source.connect(gain).connect(position).connect(this.bus);
    this.track(source, start, start + duration + 0.005, [gain, position]);
  }

  private bass(midi: number, start: number, accented: boolean) {
    const duration = STEP_SECONDS * 2.6;
    this.tone(midi, start, duration, accented ? 0.16 : 0.115, 'triangle', 0.012, duration * 0.65);
    if (accented) this.tone(midi - 12, start, duration, 0.065, 'sine', 0.016, duration * 0.75);
  }

  private drum(start: number, deep: boolean, accent: number) {
    const duration = deep ? 0.32 : 0.19;
    const source = this.context.createOscillator();
    source.type = 'sine';
    source.frequency.setValueAtTime(deep ? 118 : 176, start);
    source.frequency.exponentialRampToValueAtTime(deep ? 42 : 91, start + duration * 0.62);
    const gain = this.envelope(start, duration, (deep ? 0.25 : 0.12) * accent, 0.004, duration - 0.004);
    source.connect(gain).connect(this.bus);
    this.track(source, start, start + duration + 0.005, [gain]);

    const noise = this.context.createBufferSource();
    noise.buffer = this.drumNoise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = deep ? 540 : 1_050;
    filter.Q.value = 0.65;
    const skin = this.envelope(start, 0.12, (deep ? 0.08 : 0.055) * accent, 0.003, 0.117);
    noise.connect(filter).connect(skin).connect(this.bus);
    this.track(noise, start, start + 0.125, [filter, skin]);
  }

  private playStep(absoluteStep: number, start: number) {
    const barIndex = Math.floor(absoluteStep / STEPS_PER_BAR) % SCORE_BARS.length;
    const position = absoluteStep % STEPS_PER_BAR;
    const bar = SCORE_BARS[barIndex];

    if (position === 0) {
      bar.chord.forEach((note, index) => {
        this.tone(note, start, BEAT_SECONDS * 3.95, index === 3 ? 0.019 : 0.03,
          index % 2 === 0 ? 'sine' : 'triangle', 0.32, 0.65, (index - 1.5) * 0.23);
      });
    }

    if ([0, 3, 6, 8, 11, 14].includes(position)) {
      const octave = position === 14 && barIndex % 4 === 3 ? 12 : 0;
      this.bass(bar.bass + octave, start, position === 0 || position === 8);
    }

    if (position === 0 || position === 8) this.drum(start, true, position === 0 ? 1 : 0.82);
    if (position === 4 || position === 12) this.drum(start, false, barIndex >= 8 ? 0.78 : 0.6);
    if (barIndex % 4 === 3 && position === 14) this.drum(start, false, 0.5);

    if (position === 2 || position === 10) {
      const note = bar.motif[position === 2 ? 0 : 1];
      this.tone(note, start, BEAT_SECONDS * 1.55, 0.058, 'sine', 0.045, 0.62, position === 2 ? -0.15 : 0.15);
      // A soft octave gives the motif a bell-like edge without a sharp lead.
      this.tone(note + 12, start, BEAT_SECONDS * 0.85, 0.012, 'sine', 0.014, 0.55);
    }
  }

  private schedule() {
    if (!this.running || this.destroyed || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // If a long task delays the scheduler, skip missed beats instead of playing
    // them all at once. This never activates or restarts an audio context.
    if (this.nextStepTime < now - STEP_SECONDS) {
      const missed = Math.ceil((now - this.nextStepTime) / STEP_SECONDS);
      this.step += missed;
      this.nextStepTime += missed * STEP_SECONDS;
    }
    while (this.nextStepTime < now + LOOKAHEAD_SECONDS) {
      this.playStep(this.step, Math.max(now, this.nextStepTime));
      this.step = (this.step + 1) % (SCORE_BARS.length * STEPS_PER_BAR);
      this.nextStepTime += STEP_SECONDS;
    }
  }
}
