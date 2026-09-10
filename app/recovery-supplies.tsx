import type { ReactNode } from 'react';
import { playerHealthTone } from './game-icons';
import styles from './recovery-supplies.module.css';

/** Keep the current health beside recovery decisions, even when the HUD is offscreen. */
export function RecoverySupplies({ hp, maxHp, potions, maxPotions = 5, children }: {
  hp: number;
  maxHp: number;
  potions: number;
  maxPotions?: number;
  children?: ReactNode;
}) {
  const percent = Math.max(0, Math.min(100, maxHp > 0 ? hp / maxHp * 100 : 0));
  return <section className={styles.supplies} aria-label="Recovery supplies" data-health={playerHealthTone(hp, maxHp)}>
    <div className={styles.stats} aria-live="polite" aria-atomic="true">
      <div><span>YOUR HP</span><strong>❤️ {hp}/{maxHp}</strong></div>
      <div><span>POTIONS</span><strong>🧪 {potions}/{maxPotions}</strong></div>
      {children}
    </div>
    <div className={styles.healthBar} aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
  </section>;
}
