import styles from './omen-guide.module.css';

export function OmenGuide({ mode }: { mode: 'expedition' | 'live' | 'replay' }) {
  const expedition = mode === 'expedition';
  return <section className={styles.guide} aria-label="How your Bitcoin choice works">
    <p><b>BTC means Bitcoin.</b> Your UP or DOWN choice decides the boss’s fate after you win the fight. It does not change Attack or Storm damage.</p>
    <div className={styles.outcomes}>
      <div><b>CORRECT PREDICTION</b><span>{expedition ? 'The boss stays down. Claim its relic.' : 'The boss stays down. You win the demo.'}</span></div>
      <div><b>WRONG PREDICTION</b><span>{expedition ? 'The same boss returns at full HP. Fight it again with a new prediction.' : 'The boss’s final strike ends this demo.'}</span></div>
    </div>
    {!expedition && <small>In Full Expedition, a wrong prediction lets you rematch that boss instead.</small>}
  </section>;
}
