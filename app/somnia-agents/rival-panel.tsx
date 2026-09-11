'use client';

import Image from 'next/image';
import { compareRival, type RivalMode, type RivalRound } from '../../lib/somnia-agents/types';
import { useAgentsEnvironment } from '../local-agents-context';
import styles from './rival-panel.module.css';

type Direction = 'UP' | 'DOWN';
type Outcome = Direction | 'VOID';

export type KevinRivalPanelProps = {
  mode: RivalMode;
  onModeChange?: (mode: RivalMode) => void;
  round: RivalRound | null;
  playerDirection?: Direction;
  marketOutcome?: Outcome;
  canConfigure?: boolean;
  compact?: boolean;
};

function roundStatus(round: RivalRound | null) {
  if (!round) return 'A rival for your next omen';
  switch (round.status) {
    case 'preparing': return 'Preparing Kevin’s request';
    case 'awaiting-wallet': return 'Waiting for your testnet approval';
    case 'pending': return 'Kevin is making his call';
    case 'locked': return round.direction ? `Kevin chose BTC ${round.direction}` : 'Kevin’s answer is locked';
    case 'unavailable': return 'Kevin sits this round out';
  }
}

function outcomeText(result: ReturnType<typeof compareRival>) {
  switch (result) {
    case 'player': return { title: 'You beat Kevin.', joke: 'Kevin has requested that this stay off his résumé.' };
    case 'kevin': return { title: 'Kevin wins this round.', joke: 'Unfortunately, he will be mentioning this at every shop.' };
    case 'tie': return { title: 'A tie. Same call, same fate.', joke: 'Kevin insists this means you copied him. There is no evidence.' };
    case 'void': return { title: 'No contest. This market was void.', joke: 'Kevin claims he predicted the paperwork.' };
  }
}

export function KevinRivalPanel({ mode, onModeChange, round, playerDirection, marketOutcome, canConfigure = false, compact = false }: KevinRivalPanelProps) {
  const hosted = useAgentsEnvironment() === 'preview';
  const executionMode = round?.mode ?? mode;
  const simulated = executionMode === 'simulation';
  const direction = round?.status === 'locked' ? round.direction : undefined;
  const result = playerDirection && direction && marketOutcome ? compareRival(playerDirection, direction, marketOutcome) : undefined;
  const verdict = result ? outcomeText(result) : undefined;
  const pending = round?.status === 'pending' || round?.status === 'preparing';
  const title = verdict?.title ?? roundStatus(round);
  const body = <div className={styles.body}>
    <div className={styles.introduction}>
      <div className={styles.portrait}>
        <Image src="/characters/merchant-quartermaster-kevin.webp" alt="Somnia Agent Kevin, your dungeon shopkeeper and prediction rival" fill sizes="88px" />
      </div>
      <div>
        <span className={styles.eyebrow}>SOMNIA AGENT KEVIN · YOUR RIVAL</span>
        <h2>Can you beat Kevin’s market call?</h2>
        <p>He sells potions. Apparently, he also has opinions.</p>
      </div>
    </div>

    <div className={`${styles.modeNotice} ${simulated ? styles.simulationNotice : styles.somniaNotice}`}>
      <strong>{simulated ? hosted ? 'SIMULATED KEVIN · NO AI' : 'LOCAL SIMULATION' : 'SOMNIA AGENTS · TESTNET'}</strong>
      <span>{simulated
        ? 'Kevin’s test choice is random. No AI or onchain agent is running in this mode.'
        : 'A real Somnia Agents request runs on Shannon testnet. Your wallet approval and testnet STT are required; this request has a fee.'}</span>
    </div>

    {canConfigure && onModeChange && <fieldset className={styles.modePicker}>
      <legend>{round ? 'Kevin’s mode for your next omen' : 'Choose how Kevin makes his call'}</legend>
      <button type="button" aria-pressed={mode === 'simulation'} onClick={() => onModeChange('simulation')}>
        <strong>{hosted ? 'SIMULATED KEVIN' : 'TRY LOCALLY'}</strong><span>Random test rival · no wallet</span>
      </button>
      <button type="button" aria-pressed={mode === 'somnia'} onClick={() => onModeChange('somnia')}>
        <strong>SOMNIA AGENTS</strong><span>Testnet wallet + STT fee</span>
      </button>
    </fieldset>}

    {!simulated && <p className={styles.supporting}>
      On iPhone, open this preview in your wallet’s built-in browser to approve a testnet request. In Safari, choose Simulated Kevin to play without a wallet.
    </p>}

    {round && <div className={styles.round}>
      <div className={styles.status} role="status" aria-live="polite">
        {pending && <span className={styles.pendingDot} aria-hidden="true" />}
        <strong>{title}</strong>
      </div>
      {(pending || round.status === 'awaiting-wallet') && <p className={styles.supporting}>
        {round.status === 'awaiting-wallet'
          ? 'Approve the testnet request in your wallet to invite Kevin. Your expedition can continue without him.'
          : 'Keep fighting. Kevin’s answer must arrive before the rival cutoff, 10 seconds before the market closes.'}
      </p>}
      {round.status === 'unavailable' && <p className={styles.supporting}>{round.reason ?? 'No valid answer was locked in time.'} Your expedition, boss fight and rewards continue as usual.</p>}
      {round.status === 'awaiting-wallet' && round.reason && <p className={styles.supporting}>{round.reason}</p>}
      <div className={styles.predictions}>
        <div>
          <span>YOUR LOCKED OMEN</span>
          <strong className={playerDirection === 'UP' ? styles.up : playerDirection === 'DOWN' ? styles.down : ''}>{playerDirection ? `BTC ${playerDirection}` : 'Not locked yet'}</strong>
        </div>
        <div>
          <span>KEVIN’S {simulated ? 'SIMULATED ' : ''}CALL</span>
          <strong className={direction === 'UP' ? styles.up : direction === 'DOWN' ? styles.down : ''}>{direction ? `BTC ${direction}` : round.status === 'unavailable' ? 'Sitting out' : 'Waiting…'}</strong>
        </div>
      </div>
      {verdict && <div className={`${styles.verdict} ${result === 'player' ? styles.playerWins : ''}`}>
        <span>{simulated ? 'SIMULATED RIVAL RESULT' : 'RIVAL RESULT'}</span>
        <strong>{marketOutcome === 'VOID' ? 'MARKET VOID' : `MARKET SETTLED BTC ${marketOutcome}`}</strong>
        <p>{verdict.joke}</p>
      </div>}
      {direction && !marketOutcome && <p className={styles.supporting}>Both calls are locked. The rival result appears after the game verifies the market settlement.</p>}
      {(round.reason || round.txHash || round.requestId) && <details className={styles.receipt}>
        <summary>Request details</summary>
        {round.reason && <p>{round.reason}</p>}
        {round.txHash && <a href={`https://shannon-explorer.somnia.network/tx/${round.txHash}`} target="_blank" rel="noopener noreferrer">View testnet request transaction ↗</a>}
        {round.requestId && <p>Request ID <code>{round.requestId}</code></p>}
      </details>}
    </div>}

    <details className={styles.rules}>
      <summary>A fair side bet. Bragging rights only.</summary>
      <p>Kevin gets the same market and a fixed snapshot, without your UP or DOWN choice. His answer must be locked at least 10 seconds before expiry. The game’s existing market verification decides the result; the agent does not verify it.</p>
      <p>Same prediction means a tie. A missing or late answer means Kevin sits out. Your attacks, boss fate, gold and relics keep their normal rules.</p>
    </details>
  </div>;

  if (compact) return <details className={`${styles.panel} ${styles.compact}`} data-testid="kevin-rival-panel">
    <summary className={styles.compactSummary}>
      <span><strong>{title}</strong><small>{simulated ? 'SIMULATED RIVAL' : 'SOMNIA TESTNET RIVAL'}</small></span>
      <span className={styles.expand} aria-hidden="true">DETAILS <b>⌄</b></span>
    </summary>
    {body}
  </details>;

  return <section className={styles.panel} aria-label="Kevin’s prediction rival" data-testid="kevin-rival-panel">{body}</section>;
}
