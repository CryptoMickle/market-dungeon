'use client';

import Link from 'next/link';
import { useLocalAgents } from './local-agents-context';
import styles from './game-mode-nav.module.css';

export function GameModeNav({ current, replayHref = '/shannon/judge' }: {
  current: 'expedition' | 'live' | 'replay' | 'agents';
  replayHref?: '/judge' | '/shannon/judge';
}) {
  const localAgents = useLocalAgents();
  const judge = current === 'live' || current === 'replay';
  const judgeHref = current === 'replay' ? replayHref : '/shannon/live-judge';
  return <div className={styles.navigation} data-local-agents={localAgents || undefined}>
    <nav className={styles.modes} aria-label="Choose game mode" data-local-agents={localAgents || undefined}>
      <Link href="/" aria-current={current === 'expedition' ? 'page' : undefined}>FULL EXPEDITION</Link>
      <Link href={judgeHref} aria-current={judge ? 'page' : undefined}>JUDGE DEMO</Link>
      {localAgents && <Link href="/somnia-agents" aria-current={current === 'agents' ? 'page' : undefined} className={styles.agentsLink}>
        <span>SOMNIA AGENTS</span><small className={styles.newBadge}>New!</small>
      </Link>}
    </nav>
    {judge && <nav className={styles.variants} aria-label="Choose Judge demo">
      <Link href="/shannon/live-judge" aria-current={current === 'live' ? 'page' : undefined}>LIVE · 1 MIN</Link>
      <Link href={replayHref} aria-current={current === 'replay' ? 'page' : undefined}>HISTORICAL REPLAY</Link>
    </nav>}
  </div>;
}
