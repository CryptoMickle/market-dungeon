'use client';

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import { useGameAudio } from './game-audio';
import styles from './boss-outcome-scene.module.css';

export type BossSceneOutcome = 'pending' | 'blessed' | 'cursed' | 'void' | 'last-strike';

const COPY = {
  pending: { title: 'BOSS DOWN', detail: 'Combat won. The omen decides what happens next.', replay: 'REPLAY BOSS DEFEAT', mark: 'down' },
  blessed: { title: 'THE OMEN HOLDS', detail: 'The boss stays down. Its reward is yours.', replay: 'REPLAY VICTORY', mark: 'seal' },
  cursed: { title: 'RISEN AGAIN', detail: 'Same boss. Full health. Your resources stay spent.', replay: 'REPLAY RESURRECTION', mark: 'rise' },
  void: { title: 'BOSS DEFEATED', detail: 'Market voided. The boss stays down.', replay: 'REPLAY BOSS DEFEAT', mark: 'seal' },
  'last-strike': { title: 'ONE LAST STRIKE', detail: 'The wrong omen gives the boss the final blow.', replay: 'REPLAY LAST STRIKE', mark: 'rise' },
} as const;

/** The scene owns presentation only. Replaying never changes the run or its proof. */
export function BossOutcomeScene({ name, image, outcome, maxHp, compact = false }: {
  name: string; image: string; outcome: BossSceneOutcome; maxHp: number; compact?: boolean;
}) {
  const [replay, setReplay] = useState(0);
  const { playOutcome, playEffect } = useGameAudio();
  const copy = COPY[outcome];
  const resurrected = outcome === 'cursed';
  const description = outcome === 'pending' ? `${name} defeated, awaiting omen settlement`
    : resurrected ? `${name} resurrects at full health`
      : outcome === 'last-strike' ? `${name} delivers a fatal last strike` : `${name} defeated and stays down`;

  return <section className={styles.scene} data-boss-scene={outcome} data-compact={compact} aria-label={description}>
    <div key={`${outcome}-${image}-${replay}`} className={styles.sequence}>
      <div className={styles.artwork} data-boss-artwork>
        <Image src={image} alt={resurrected ? `${name} resurrecting` : name} fill priority sizes={compact ? '(max-width: 800px) 100vw, 600px' : '(max-width: 800px) 100vw, 55vw'} />
      </div>
      <div className={styles.shade} />
      <svg className={styles.impact} viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 145 290 L 455 80 M 178 300 L 422 108" />
      </svg>
      <div className={styles.shockwave} aria-hidden="true" />
      <div className={styles.embers} aria-hidden="true">{Array.from({ length: 12 }, (_, index) =>
        <i key={index} style={{ '--x': `${10 + index * 7}%`, '--delay': `${index % 4 * .09}s`, '--drift': `${(index % 3 - 1) * 34}px` } as CSSProperties} />
      )}</div>
      <div className={styles.identity}><span>DUNGEON MANAGEMENT</span><strong>{name}</strong></div>
      <div className={styles.verdict}>
        <svg className={styles.sigil} viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="34" /><path d="M40 1v10m0 58v10M1 40h10m58 0h10" />
          {copy.mark === 'seal' ? <path d="m23 40 12 12 24-25" /> : copy.mark === 'rise'
            ? <path d="M40 60V22m-14 16 14-16 14 16" /> : <path d="M40 20v38m-14-16 14 16 14-16" />}
        </svg>
        <h2>{copy.title}</h2><p>{copy.detail}</p>
      </div>
      <div className={styles.health} aria-label={`Boss health ${resurrected ? maxHp : 0} of ${maxHp}`}>
        <div><span>{resurrected ? 'BOSS RESURRECTED' : 'BOSS HP'}</span><strong>{resurrected ? `FULL HP · ${maxHp}/${maxHp}` : `0 / ${maxHp}`}</strong></div>
        <i><b /></i>
      </div>
    </div>
    <button type="button" className={styles.replay} onClick={() => {
      setReplay(value => value + 1);
      if (outcome === 'pending') playEffect('attack');
      else playOutcome(outcome === 'last-strike' ? 'CURSED' : outcome.toUpperCase() as 'BLESSED' | 'CURSED' | 'VOID');
    }}><span aria-hidden="true">↻</span> {copy.replay}</button>
  </section>;
}
