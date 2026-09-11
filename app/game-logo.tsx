import Image from 'next/image';
import Link from 'next/link';
import styles from './game-logo.module.css';

export function GameLogo({ compact = false, onHome, homeHref = '/' }: { compact?: boolean; onHome?: () => void; homeHref?: string }) {
  const content = <>
    <span className={styles.label}>MARKET DUNGEON</span>
    <Image src="/assets/market-dungeon-logo-v1.png" alt="" aria-hidden="true" width={2172} height={724} priority sizes={compact ? '(max-width: 800px) 96px, (max-width: 1199px) 168px, (max-height: 799px) 168px, 252px' : '(max-width: 800px) 240px, 300px'} />
  </>;
  const className = `${styles.logo} ${compact ? styles.compact : ''}`;
  return onHome
    ? <button type="button" className={`${className} ${styles.home}`} onClick={onHome} aria-label="Market Dungeon — back to home">{content}</button>
    : <Link href={homeHref} className={`${className} ${styles.home}`} aria-label="Market Dungeon — back to home">{content}</Link>;
}
