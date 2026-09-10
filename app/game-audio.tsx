'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getCharacterAudioProfile, type IntroTexture, type IntroWave } from './game-audio-profiles';
import styles from './game-audio.module.css';
import { BossBattleScore } from './boss-battle-score';

const AUDIO_STORAGE_KEY = 'market-dungeon/audio-enabled/v1';

export type GameSoundEffect = 'click' | 'attack' | 'storm' | 'potion';
export type GameOutcome = 'BLESSED' | 'CURSED' | 'VOID';

type GameAudioValue = {
  enabled: boolean;
  paused: boolean;
  setBossBattle: (active: boolean) => void;
  toggleAudio: () => void;
  playKeyboardAction: (event: KeyboardEvent, control: HTMLElement) => void;
  playCharacterIntro: (name: string) => void;
  playEffect: (effect: GameSoundEffect) => void;
  playOutcome: (outcome: GameOutcome) => void;
};

const EMPTY_AUDIO: GameAudioValue = {
  enabled: true,
  paused: false,
  setBossBattle: () => undefined,
  toggleAudio: () => undefined,
  playKeyboardAction: () => undefined,
  playCharacterIntro: () => undefined,
  playEffect: () => undefined,
  playOutcome: () => undefined,
};

const GameAudioContext = createContext<GameAudioValue>(EMPTY_AUDIO);

function semitone(frequency: number, interval: number): number {
  return frequency * (2 ** (interval / 12));
}

class DungeonAudioEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly effects: GainNode;
  private enabled = true;
  private active = false;
  private resuming = false;
  private bossBattle = false;
  private readonly bossScore: BossBattleScore;
  private suspendTimer: number | undefined;
  private readonly effectNodes = new Set<AudioScheduledSourceNode>();

  constructor(private readonly onInterrupted: () => void) {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.effects = this.context.createGain();
    this.master.gain.value = 0.72;
    this.effects.gain.value = 0.78;
    this.effects.connect(this.master);
    this.master.connect(this.context.destination);
    this.bossScore = new BossBattleScore(this.context, this.master);
    this.context.onstatechange = () => {
      if (this.context.state === 'running') {
        if (!this.active || !this.enabled || document.hidden || !document.hasFocus()) this.pause();
        else this.syncBossMusic();
      } else if (this.context.state !== 'closed' && this.active && !this.resuming) {
        // A route change or OS interruption must not be fought by our scheduler.
        this.pause();
        this.onInterrupted();
      }
    };
  }

  /** Called only for an explicit interaction in the foreground game. */
  resume() {
    if (!this.enabled || document.hidden || !document.hasFocus()) return;
    this.active = true;
    if (this.context.state === 'running') {
      this.syncBossMusic();
      return;
    }
    if (this.resuming || this.context.state === 'closed') return;
    this.resuming = true;
    void this.context.resume().then(() => {
      if (!this.active || !this.enabled || document.hidden || !document.hasFocus()) this.pause();
      else this.syncBossMusic();
    }).catch(() => {
      this.active = false;
      this.onInterrupted();
    }).finally(() => { this.resuming = false; });
  }

  private canSchedule() {
    return this.active && this.enabled && !document.hidden && document.hasFocus()
      && (this.context.state === 'running' || this.resuming);
  }

  pause() {
    this.active = false;
    this.bossScore.stop(true);
    // Stop short cues too: returning must not replay an old hit or monster intro.
    this.effectNodes.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    this.effectNodes.clear();
    if (this.context.state !== 'running' && String(this.context.state) !== 'interrupted') return;
    void this.context.suspend().catch(() => undefined);
  }

  setBossBattle(active: boolean) {
    this.bossBattle = active;
    this.syncBossMusic();
  }

  private syncBossMusic() {
    const playing = this.bossBattle && this.canSchedule() && this.context.state === 'running';
    if (playing) this.bossScore.start();
    else this.bossScore.stop();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.suspendTimer !== undefined) window.clearTimeout(this.suspendTimer);
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    if (enabled) {
      this.master.gain.exponentialRampToValueAtTime(0.72, now + 0.08);
    } else {
      this.active = false;
      this.bossScore.stop();
      this.master.gain.linearRampToValueAtTime(0, now + 0.055);
      this.suspendTimer = window.setTimeout(() => this.pause(), 65);
    }
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    wave: OscillatorType = 'sine',
    destination: AudioNode = this.effects,
    endFrequency?: number,
  ) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.025, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(destination);
    this.effectNodes.add(oscillator);
    oscillator.onended = () => {
      this.effectNodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(
    start: number,
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    frequency: number,
    destination: AudioNode = this.effects,
  ) {
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      const fade = 1 - (index / frames);
      data[index] = (Math.random() * 2 - 1) * fade;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(destination);
    this.effectNodes.add(source);
    source.onended = () => {
      this.effectNodes.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  playEffect(effect: GameSoundEffect) {
    if (!this.canSchedule()) return;
    const now = this.context.currentTime + 0.006;
    if (effect === 'click') {
      this.tone(880, now, 0.045, 0.045, 'square');
      this.tone(540, now + 0.018, 0.04, 0.025, 'triangle');
      return;
    }
    if (effect === 'attack') {
      this.noise(now, 0.12, 0.19, 'bandpass', 1250);
      this.tone(920, now, 0.11, 0.12, 'triangle', this.effects, 260);
      this.tone(145, now + 0.025, 0.15, 0.1, 'square', this.effects, 72);
      return;
    }
    if (effect === 'storm') {
      // A crackling, tumbling spell: tension without a win/loss cadence.
      // Decorative variation never reads or consumes the combat random source.
      const patterns = [
        [640, 1010, 760, 1240, 900, 1130],
        [780, 1120, 670, 990, 840, 1210],
        [710, 950, 1220, 810, 1080, 920],
      ];
      const pitches = patterns[Math.floor(Math.random() * patterns.length)];
      const detune = 2 ** ((Math.random() * 2 - 1) / 12);
      this.noise(now, 0.13, 0.08, 'bandpass', 2600);
      this.tone(240, now, 0.34, 0.065, 'sine', this.effects, 570);
      [0.025, 0.078, 0.145, 0.22, 0.31, 0.405].forEach((offset, index) => {
        const frequency = pitches[index] * detune;
        this.tone(frequency, now + offset, 0.095, 0.065, 'triangle', this.effects, frequency * (index % 2 ? 0.87 : 1.19));
      });
      this.noise(now + 0.43, 0.17, 0.075, 'bandpass', 3400);
      // Two close, gently rising tones leave a suspended shimmer, not a verdict.
      this.tone(962 * detune, now + 0.43, 0.25, 0.035, 'sine', this.effects, 1040 * detune);
      this.tone(1041 * detune, now + 0.445, 0.23, 0.028, 'sine', this.effects, 1122 * detune);
      return;
    }
    this.tone(170, now, 0.24, 0.08, 'sine', this.effects, 510);
    [659, 880, 1175].forEach((frequency, index) => {
      this.tone(frequency, now + 0.055 + index * 0.075, 0.18, 0.075, 'triangle');
    });
  }

  private texture(texture: IntroTexture, start: number, duration: number) {
    if (texture === 'grave') {
      this.noise(start, duration, 0.045, 'lowpass', 520);
      this.tone(52, start, duration, 0.055, 'sine', this.effects, 43);
    } else if (texture === 'rattle') {
      [0, 0.075, 0.15].forEach((offset) => this.noise(start + offset, 0.04, 0.055, 'highpass', 1900));
    } else if (texture === 'stomp') {
      this.noise(start, 0.19, 0.13, 'lowpass', 180);
      this.tone(72, start, 0.25, 0.11, 'sine', this.effects, 38);
    } else if (texture === 'throne') {
      this.tone(43, start, duration + 0.45, 0.09, 'sawtooth', this.effects, 32);
      this.noise(start + duration * 0.4, 0.32, 0.08, 'bandpass', 760);
    } else {
      [1320, 1760, 2200].forEach((frequency, index) => {
        this.tone(frequency, start + index * 0.055, 0.12, 0.06, 'triangle');
      });
    }
  }

  playCharacterIntro(name: string) {
    if (!this.canSchedule()) return;
    const profile = getCharacterAudioProfile(name);
    const now = this.context.currentTime + 0.025;
    const noteDuration = Math.max(0.16, profile.stepSeconds * 1.65);
    profile.intervals.forEach((interval, index) => {
      const frequency = semitone(profile.baseFrequency, interval);
      const wave = profile.wave as IntroWave;
      this.tone(frequency, now + index * profile.stepSeconds, noteDuration, profile.texture === 'throne' ? 0.105 : 0.085, wave);
      this.tone(frequency / 2, now + index * profile.stepSeconds, noteDuration * 1.2, 0.035, 'sine');
    });
    this.texture(profile.texture, now, profile.intervals.length * profile.stepSeconds);
  }

  playOutcome(outcome: GameOutcome) {
    if (!this.canSchedule()) return;
    const frequencies = outcome === 'BLESSED' ? [523, 659, 784] : outcome === 'CURSED' ? [196, 147, 110] : [330, 330];
    const duration = outcome === 'CURSED' ? 0.32 : 0.2;
    const now = this.context.currentTime + 0.015;
    frequencies.forEach((frequency, index) => {
      this.tone(frequency, now + index * duration * 0.72, duration, 0.1, outcome === 'CURSED' ? 'sawtooth' : 'sine');
    });
  }

  destroy() {
    this.context.onstatechange = null;
    this.bossScore.destroy();
    if (this.suspendTimer !== undefined) window.clearTimeout(this.suspendTimer);
    void this.context.close();
  }
}

function actionSound(control: HTMLElement): GameSoundEffect | 'silent' {
  const explicit = control.dataset.gameAudio;
  if (explicit === 'silent') return 'silent';
  if (explicit === 'attack' || explicit === 'storm' || explicit === 'potion' || explicit === 'click') return explicit;
  const label = `${control.getAttribute('aria-label') ?? ''} ${control.textContent ?? ''}`;
  if (/\bSTORM\b/i.test(label)) return 'storm';
  if (/\bATTACK\b/i.test(label)) return 'attack';
  if (/\bPOTION\b/i.test(label) && !/POTIONS?\s*\d+\s*\/\s*5/i.test(label)) return 'potion';
  return 'click';
}

export function GameAudioProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const enabledRef = useRef(true);
  const pausedRef = useRef(false);
  const engagedRef = useRef(false);
  const bossBattleRef = useRef(false);
  const engineRef = useRef<DungeonAudioEngine | null>(null);

  const markPaused = useCallback(() => {
    if (!enabledRef.current || !engagedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const ensureEngine = useCallback(() => {
    if (typeof window === 'undefined' || !enabledRef.current || !engagedRef.current
      || pausedRef.current || document.hidden || !document.hasFocus()) return null;
    if (engineRef.current) return engineRef.current;
    try {
      engineRef.current = new DungeonAudioEngine(markPaused);
      engineRef.current.setEnabled(enabledRef.current);
      engineRef.current.setBossBattle(bossBattleRef.current);
      return engineRef.current;
    } catch {
      return null;
    }
  }, [markPaused]);

  const resumeForInteraction = useCallback(() => {
    if (!enabledRef.current || document.hidden || !document.hasFocus()) return null;
    engagedRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    const engine = ensureEngine();
    engine?.resume();
    engine?.setBossBattle(bossBattleRef.current);
    return engine;
  }, [ensureEngine]);

  useEffect(() => {
    let restored = enabledRef.current;
    try {
      restored = window.localStorage.getItem(AUDIO_STORAGE_KEY) !== 'off';
    } catch { /* Sound controls still work when browser storage is unavailable. */ }
    enabledRef.current = restored;
    engineRef.current?.setEnabled(restored);
    const timer = window.setTimeout(() => setEnabled(restored), 0);
    const syncPreference = (event: StorageEvent) => {
      if (event.key !== AUDIO_STORAGE_KEY) return;
      const next = event.newValue !== 'off';
      enabledRef.current = next;
      setEnabled(next);
      engineRef.current?.setEnabled(next);
      // Another tab can mute this one, but must never make it reclaim audio.
      engineRef.current?.pause();
      if (next) markPaused();
      else { pausedRef.current = false; setPaused(false); }
    };
    window.addEventListener('storage', syncPreference);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', syncPreference);
    };
  }, [markPaused]);

  useEffect(() => {
    const pauseForBackground = () => {
      engineRef.current?.pause();
      markPaused();
    };
    const handleVisibility = () => {
      if (document.hidden) pauseForBackground();
      // Becoming visible or focused is not permission to resume playback.
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', pauseForBackground);
    window.addEventListener('pagehide', pauseForBackground);
    navigator.mediaDevices?.addEventListener('devicechange', pauseForBackground);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', pauseForBackground);
      window.removeEventListener('pagehide', pauseForBackground);
      navigator.mediaDevices?.removeEventListener('devicechange', pauseForBackground);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [markPaused]);

  const setBossBattle = useCallback((active: boolean) => {
    bossBattleRef.current = active;
    engineRef.current?.setBossBattle(active);
  }, []);

  const playEffect = useCallback((effect: GameSoundEffect) => {
    ensureEngine()?.playEffect(effect);
  }, [ensureEngine]);

  const playCharacterIntro = useCallback((name: string) => {
    ensureEngine()?.playCharacterIntro(name);
  }, [ensureEngine]);

  const playOutcome = useCallback((outcome: GameOutcome) => {
    ensureEngine()?.playOutcome(outcome);
  }, [ensureEngine]);

  const playKeyboardAction = useCallback((event: KeyboardEvent, control: HTMLElement) => {
    if (!event.isTrusted || event.repeat || event.key !== 'Enter'
      || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
      || control.matches(':disabled, [aria-disabled="true"]')) return;
    const effect = actionSound(control);
    if (effect !== 'silent') resumeForInteraction()?.playEffect(effect);
  }, [resumeForInteraction]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Desktop Enter activation plays its cue explicitly before .click().
      // Script-generated clicks must never resume audio on their own.
      if (!event.isTrusted) return;
      const origin = event.target instanceof Element ? event.target : null;
      const control = origin?.closest<HTMLElement>('button, a, summary');
      if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.dataset.gameAudio === 'silent') return;
      const engine = resumeForInteraction();
      if (!engine) return;
      const effect = actionSound(control);
      if (effect !== 'silent') engine.playEffect(effect);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat || event.metaKey || event.ctrlKey || event.altKey
        || !['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [data-game-audio="silent"]')) return;
      resumeForInteraction();
    };
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [resumeForInteraction]);

  const toggle = useCallback(() => {
    if (enabledRef.current && pausedRef.current) {
      resumeForInteraction();
      return;
    }
    const next = !enabledRef.current;
    enabledRef.current = next;
    pausedRef.current = false;
    setEnabled(next);
    setPaused(false);
    try {
      window.localStorage.setItem(AUDIO_STORAGE_KEY, next ? 'on' : 'off');
    } catch { /* Do not let storage restrictions prevent muting the engine. */ }
    engineRef.current?.setEnabled(next);
    if (next) resumeForInteraction()?.playEffect('click');
  }, [resumeForInteraction]);

  const value = useMemo<GameAudioValue>(() => ({
    enabled, paused, setBossBattle,
    toggleAudio: toggle,
    playKeyboardAction,
    playCharacterIntro,
    playEffect,
    playOutcome,
  }), [enabled, paused, playCharacterIntro, playEffect, playKeyboardAction, playOutcome, setBossBattle, toggle]);

  return <GameAudioContext.Provider value={value}>
    {children}
    <GameAudioToggle />
  </GameAudioContext.Provider>;
}

/** The inline version stays usable inside a modal dialog's focus boundary. */
export function GameAudioToggle({ inline = false }: { inline?: boolean }) {
  const { enabled, paused, toggleAudio } = useGameAudio();
  const label = enabled && paused ? 'Resume game sounds' : enabled ? 'Turn all game sounds off' : 'Turn all game sounds on';
  return <button
      type="button"
      className={`${styles.toggle} ${inline ? styles.inline : styles.floating}`}
      data-enabled={enabled && !paused}
      data-paused={enabled && paused}
      data-game-audio="silent"
      aria-label={label}
      aria-pressed={enabled && !paused}
      title={enabled && paused ? 'Sound paused · click here or continue playing to resume' : label}
      onClick={toggleAudio}
    >
      <span className={styles.icon} aria-hidden="true">{enabled && paused ? '▶' : enabled ? '🔊' : '🔇'}</span>
      <span className={styles.label}>{enabled && paused ? 'RESUME' : enabled ? 'SOUND ON' : 'SOUND OFF'}</span>
    </button>;
}

export function useGameAudio(): GameAudioValue {
  return useContext(GameAudioContext);
}
