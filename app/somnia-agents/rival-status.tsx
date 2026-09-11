'use client';

import { useId, useRef, type ReactNode } from 'react';
import { GameAudioToggle } from '../game-audio';
import { compareRival, type RivalDirection, type RivalMode, type RivalOutcome, type RivalRound } from '../../lib/somnia-agents/types';
import dialogStyles from '../mobile-battle.module.css';
import styles from './rival-status.module.css';

/** A status-line item, not a second encounter panel. Never hides after settlement. */
export function KevinRivalStatus({ round, mode, playerDirection, marketOutcome, children }: {
  round: RivalRound | null;
  mode: RivalMode;
  playerDirection?: RivalDirection;
  marketOutcome?: RivalOutcome;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const modeId = useId();
  const actualMode = round?.mode ?? mode;
  const result = round?.status === 'locked' && round.direction && playerDirection && marketOutcome
    ? compareRival(playerDirection, round.direction, marketOutcome) : undefined;
  const verdict = result === 'player' ? 'You win' : result === 'kevin' ? 'Kevin wins' : result === 'tie' ? 'Tie' : result === 'void' ? 'No contest' : null;
  const prediction = round?.status === 'locked' && round.direction ? `BTC ${round.direction}`
    : round?.status === 'unavailable' ? 'Sitting out'
      : round?.status === 'awaiting-wallet' ? 'Wallet approval'
        : round ? 'Choosing…' : 'Not locked yet';
  const summary = verdict ? `${prediction} · ${verdict}` : prediction;
  function open() {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('[aria-label="Close details"]')?.focus();
  }
  return <>
    <button type="button" className={styles.button} aria-label={`Somnia Agent Kevin: ${summary}`} aria-describedby={modeId} onClick={open}>
      <span className={styles.identity}>Somnia Agent Kevin<small id={modeId}>{actualMode === 'simulation' ? 'SIMULATED' : 'SOMNIA TESTNET'}</small></span>
      <strong data-direction={round?.status === 'locked' ? round.direction : undefined}>{prediction}{verdict && <small>{verdict}</small>}</strong>
      <span className={styles.details}>DETAILS ›</span>
    </button>
    <dialog ref={dialog} className={dialogStyles.dialog} aria-label="Somnia Agent Kevin">
      <div className={dialogStyles.dialogHead}><h2>Somnia Agent Kevin</h2><GameAudioToggle inline /><button type="button" aria-label="Close details" onClick={() => dialog.current?.close()}>✕</button></div>
      {children}
    </dialog>
  </>;
}
