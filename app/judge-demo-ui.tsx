'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { GameLogo } from './game-logo';
import { GameModeNav } from './game-mode-nav';
import { GameText, GoldIcon } from './game-icons';
import styles from './judge-demo-ui.module.css';

type Direction = 'UP' | 'DOWN';
type Result = 'BLESSED' | 'CURSED' | 'VOID' | 'DEFEATED';

export function JudgeDemoHeader({ variant, replayHref, networkLabel = 'Somnia testnet' }: {
  variant: 'live' | 'replay'; replayHref?: '/judge' | '/shannon/judge'; networkLabel?: string;
}) {
  return <header className={styles.header}>
    <GameModeNav current={variant} replayHref={replayHref} />
    <GameLogo compact homeHref="/" />
    <div><strong>{variant === 'live' ? 'LIVE JUDGE DEMO' : 'HISTORICAL JUDGE DEMO'}</strong>
      <span>{variant === 'live' ? '1-minute Event Contract' : 'Sealed historical Event Contract'} · {networkLabel}</span></div>
  </header>;
}

export function JudgeProgress({ step, complete = false }: { step: number; complete?: boolean }) {
  return <ol className={styles.progress} aria-label="Judge demo progress">
    {['LOCK OMEN', 'GUARD', 'BOSS', 'FATE'].map((label, index) => <li key={label}
      aria-current={!complete && step === index + 1 ? 'step' : undefined} data-done={complete || step > index + 1}>
      {index + 1} · {label}
    </li>)}
  </ol>;
}

export function JudgeOmenChoices({ direction, onChange, disabled = false, historical = false }: {
  direction: Direction; onChange: (direction: Direction) => void; disabled?: boolean; historical?: boolean;
}) {
  return <div className={styles.choices} role="group" aria-label="Choose your BTC omen">
    <button aria-pressed={direction === 'UP'} onClick={() => onChange('UP')} disabled={disabled}>
      <b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP</small><span>{historical ? 'Predict an UP result' : 'At or above the target'}</span>
    </button>
    <button aria-pressed={direction === 'DOWN'} onClick={() => onChange('DOWN')} disabled={disabled}>
      <b><span aria-hidden="true">🌑</span> SHADOWS RISE</b><small>BTC DOWN</small><span>{historical ? 'Predict a DOWN result' : 'Below the target'}</span>
    </button>
  </div>;
}

export function JudgeResultSummary({ direction, marketOutcome, result, historical = false }: {
  direction: Direction; marketOutcome?: Direction | 'VOID' | null; result: Result; historical?: boolean;
}) {
  const defeated = result === 'DEFEATED';
  return <section className={styles.resultSummary} aria-label="Choice, market result and boss fate" data-outcome={result}>
    <div><span>YOUR CHOICE</span><strong>BTC {direction}</strong><small>{historical ? 'Locked before the replay was drawn' : 'Locked before the market closed'}</small></div>
    <div><span>MARKET RESULT</span><strong>{defeated ? 'NOT REVEALED' : marketOutcome === 'VOID' ? 'VOID' : marketOutcome ? `BTC ${marketOutcome}` : 'NOT AVAILABLE'}</strong>
      <small>{defeated ? 'Combat ended before the reveal' : marketOutcome === 'VOID' ? 'No winning direction' : marketOutcome ? 'Recorded result verified' : 'No direction can be displayed'}</small></div>
    <div><span>BOSS FATE</span><strong>{defeated ? 'NOT DEFEATED' : result === 'CURSED' ? 'FINAL STRIKE' : 'STAYS DOWN'}</strong>
      <small>{defeated ? 'Run ended in combat' : result === 'CURSED' ? 'Demo ended · no boss reward' : result === 'VOID' ? 'No prediction loss · reward kept' : 'Demo won · boss reward secured'}</small></div>
  </section>;
}

export function JudgeVictoryConditions({ result }: { result: Result }) {
  const cleared = result !== 'DEFEATED';
  return <div className={styles.conditions} aria-label="Two victory conditions">
    <div data-state={cleared ? 'won' : 'lost'}><span>{cleared ? '✓' : '✕'} CONDITION 1 · COMBAT</span><strong>{cleared ? 'Boss defeated in combat' : 'Fell before combat was cleared'}</strong></div>
    <div data-state={result === 'BLESSED' ? 'won' : result === 'CURSED' ? 'lost' : 'neutral'}>
      <span>{result === 'BLESSED' ? '✓' : result === 'CURSED' ? '✕' : '○'} CONDITION 2 · PREDICTION</span>
      <strong>{result === 'BLESSED' ? 'BTC prediction correct' : result === 'CURSED' ? 'BTC prediction incorrect' : result === 'VOID' ? 'Market voided · no prediction penalty' : 'No market outcome applied'}</strong>
    </div>
  </div>;
}

export function JudgeFinalStats({ encounters, gold, hp, potions }: { encounters: number; gold: number; hp: number; potions: number }) {
  return <dl className={styles.finalStats} aria-label="Final run statistics">
    <div><dt>ENCOUNTERS CLEARED</dt><dd>{encounters}/2</dd></div><div><dt>FINAL GOLD</dt><dd><GoldIcon /> {gold}</dd></div>
    <div><dt>FINAL HEALTH</dt><dd>{hp}/100</dd></div><div><dt>POTIONS LEFT</dt><dd>{potions}/5</dd></div>
  </dl>;
}

export function JudgeFooter({ verifierHref, children }: { verifierHref: string; children?: ReactNode }) {
  return <footer className={styles.footer}>{children && <p>{children}</p>}
    <nav aria-label="Judge demo links"><Link href={verifierHref}>VERIFY A PROOF</Link><Link href="/credits">PRIVACY · CREDITS</Link></nav>
  </footer>;
}

export function JudgeDungeonLog({ entries }: { entries: string[] }) {
  return <section className={styles.journal} aria-label="Dungeon log">
    <h3>DUNGEON LOG</h3><ul>{entries.slice(0, 3).map((entry, index) => <li key={index}><GameText>{entry}</GameText></li>)}</ul>
    {entries.length > 3 && <details><summary>READ FULL DUNGEON LOG · {entries.length} ENTRIES</summary><ul aria-label="Full dungeon log">
      {entries.map((entry, index) => <li key={index}><GameText>{entry}</GameText></li>)}
    </ul></details>}
  </section>;
}

export function JudgeDreamDexContinue({ href, description, onContinue }: { href: string; description: string; onContinue?: () => void }) {
  return <section className={styles.dreamdex} aria-label="Continue on dreamDEX">
    <span>NEXT STEP · DREAMDEX · SOMNIA MAINNET</span><h2>Take your next call to dreamDEX.</h2><p>{description}</p>
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onContinue} aria-label="Continue on dreamDEX — opens in a new tab">CONTINUE ON DREAMDEX ↗</a>
    <small>Opens in a new tab. Wallet connection and any transaction happen on dreamDEX.</small>
  </section>;
}
