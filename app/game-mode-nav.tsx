'use client';

import Link from 'next/link';
import styles from './game-mode-nav.module.css';

export function GameModeNav({ current, replayHref = '/shannon/judge' }: {
  current: 'expedition' | 'live' | 'replay' | 'agents';
  replayHref?: '/judge' | '/shannon/judge';
}) {
  const judge = current === 'live' || current === 'replay';
  if (!judge) return null;
  return <div className={styles.navigation}>
    <nav className={styles.variants} aria-label="Choose Judge demo">
      <Link href="/shannon/live-judge" aria-current={current === 'live' ? 'page' : undefined}>LIVE · 1 MIN</Link>
      <Link href={replayHref} aria-current={current === 'replay' ? 'page' : undefined}>HISTORICAL REPLAY</Link>
    </nav>
  </div>;
}
