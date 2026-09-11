'use client';

import { useEffect, useRef, useState } from 'react';
import type { RivalRound } from '../../lib/somnia-agents/types';
import { KevinRivalPanel } from './rival-panel';
import { GameLogo } from '../game-logo';
import styles from './rival-panel.module.css';

type Direction = 'UP' | 'DOWN';
type Scenario = 'normal' | 'late' | 'unavailable';

export default function KevinRivalPreview() {
  const [direction, setDirection] = useState<Direction>('UP');
  const [round, setRound] = useState<RivalRound | null>(null);
  const [outcome, setOutcome] = useState<Direction | 'VOID'>();
  const [scenario, setScenario] = useState<Scenario>('normal');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function lock() {
    if (round) return;
    const now = Math.floor(Date.now() / 1000);
    const newRound: RivalRound = {
      attemptId: `playground-${crypto.randomUUID()}`,
      marketId: `0x${'c0'.repeat(32)}`,
      expiry: now + 60,
      cutoff: now + 50,
      mode: 'simulation',
      status: 'pending',
    };
    setRound(newRound);
    setOutcome(undefined);
    timer.current = setTimeout(() => {
      if (scenario !== 'normal') {
        setRound({ ...newRound, status: 'unavailable', reason: scenario === 'late'
          ? 'Playground scenario: Kevin’s answer arrived after the cutoff, so it was discarded.'
          : 'Playground scenario: the agent service did not return an answer.' });
      } else {
        const sample = crypto.getRandomValues(new Uint8Array(1))[0];
        setRound({ ...newRound, status: 'locked', direction: sample % 2 === 0 ? 'UP' : 'DOWN', finalizedAt: Math.floor(Date.now() / 1000) });
      }
      timer.current = null;
    }, 1200);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRound(null);
    setOutcome(undefined);
  }

  return <main className={styles.playground}>
    <div className={styles.previewShell}>
      <div className={styles.previewNav}><GameLogo compact homeHref="/" /></div>
      <header className={styles.previewHeader}>
        <span className={styles.eyebrow}>MARKET DUNGEON · SIMULATED RIVAL PLAYGROUND</span>
        <h1>Somnia Agent Kevin has an opinion.<br />Of course he does.</h1>
        <p>Try the rival experience in seconds. Pick your omen, see Kevin’s random test choice, then choose a pretend market result.</p>
        <div className={`${styles.modeNotice} ${styles.simulationNotice}`} role="note">
          <strong>SIMULATION ONLY · NO REAL MARKET · NO SOMNIA AGENT</strong>
          <span>Every round on this page is made up. No wallet, payment or blockchain request is involved. Play the Somnia Agent Kevin mode to compete alongside a real market.</span>
        </div>
      </header>
      <div className={styles.previewGrid}>
        <section className={styles.previewControls} aria-label="Control the simulated round">
          <h2>1. Make your call.</h2>
          <p>Your choice stays separate from Kevin’s random choice. This tests the experience, not prediction skill.</p>
          <div className={styles.choiceButtons} role="group" aria-label="Choose your simulated Bitcoin direction">
            <button type="button" disabled={!!round} aria-pressed={direction === 'UP'} onClick={() => setDirection('UP')} className={styles.up}>BTC UP<span>GOLD AWAKENS</span></button>
            <button type="button" disabled={!!round} aria-pressed={direction === 'DOWN'} onClick={() => setDirection('DOWN')} className={styles.down}>BTC DOWN<span>SHADOWS RISE</span></button>
          </div>
          <label className={styles.scenario}>Kevin’s response scenario
            <select value={scenario} disabled={!!round} onChange={event => setScenario(event.target.value as Scenario)}>
              <option value="normal">Answer arrives in time</option>
              <option value="late">Answer arrives too late</option>
              <option value="unavailable">No answer arrives</option>
            </select>
          </label>
          <button type="button" className={styles.lockButton} disabled={!!round} onClick={lock}>{round ? 'SIMULATED OMEN LOCKED' : `LOCK SIMULATED BTC ${direction}`}</button>
          <div className={styles.settlement}>
            <h3>2. Pretend the market settled.</h3>
            <p>These controls are only for this playground. The actual game waits for independently verified settlement.</p>
            <div className={styles.previewButtons} role="group" aria-label="Choose a simulated market outcome">
              {(['UP', 'DOWN', 'VOID'] as const).map(value => <button key={value} type="button" disabled={!round || round.status === 'pending'} aria-pressed={outcome === value} onClick={() => setOutcome(value)}>{value === 'VOID' ? 'VOID' : `BTC ${value}`}</button>)}
            </div>
          </div>
          <button type="button" className={styles.resetButton} disabled={!round} onClick={reset}>NEW SIMULATED ROUND</button>
        </section>
        <KevinRivalPanel mode="simulation" round={round} playerDirection={round ? direction : undefined} marketOutcome={outcome} />
      </div>
      <p className={styles.previewFooter}>Kevin competes for bragging rights. He does not change damage, boss resurrection, loot or relics. If he misses the deadline, the normal game continues.</p>
    </div>
  </main>;
}
