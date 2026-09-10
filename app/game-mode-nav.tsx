import Link from 'next/link';
import styles from './game-mode-nav.module.css';

export function GameModeNav({ current, replayHref = '/shannon/judge' }: {
  current: 'expedition' | 'live' | 'replay';
  replayHref?: '/judge' | '/shannon/judge';
}) {
  const judge = current !== 'expedition';
  const judgeHref = current === 'replay' ? replayHref : '/shannon/live-judge';
  return <div className={styles.navigation}>
    <nav className={styles.modes} aria-label="Choose game mode">
      <Link href="/" aria-current={!judge ? 'page' : undefined}>FULL EXPEDITION</Link>
      <Link href={judgeHref} aria-current={judge ? 'page' : undefined}>JUDGE DEMO</Link>
    </nav>
    {judge && <nav className={styles.variants} aria-label="Choose Judge demo">
      <Link href="/shannon/live-judge" aria-current={current === 'live' ? 'page' : undefined}>LIVE · 1 MIN</Link>
      <Link href={replayHref} aria-current={current === 'replay' ? 'page' : undefined}>HISTORICAL REPLAY</Link>
    </nav>}
  </div>;
}
