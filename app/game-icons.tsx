import { Fragment, type ReactNode } from 'react';

/** Reuse Delveworn's coin artwork instead of the platform-dependent coin emoji. */
export function GoldIcon() {
  return <span className="gold-icon" aria-hidden="true" />;
}

/** Presentation only: persisted combat logs and proof transcripts stay unchanged. */
export function GameText({ children }: { children: string }) {
  return children.split('🪙').map((part, index) => <Fragment key={index}>{index > 0 && <GoldIcon />}{part}</Fragment>);
}

export function LoadoutSummary({ gold, weapon, armor, relic, potions, children }: {
  gold: number;
  weapon: number;
  armor: number;
  relic?: ReactNode;
  potions?: string;
  children?: ReactNode;
}) {
  return <><GoldIcon /> Gold {gold} · ⚔️ Weapon {weapon} · 🛡️ Armor {armor}{relic !== undefined && <> · ◆ Relic: {relic}</>}{potions !== undefined && <> · 🧪 Potions {potions}</>}{children && <> · {children}</>}</>;
}

/** Delveworn practice HUD thresholds, using percentage of the current relic max HP. */
export function playerHealthTone(hp: number, maxHp: number) {
  // Compare integer products so 55/100 cannot round above the 55% boundary.
  if (maxHp <= 0 || hp * 100 <= maxHp * 25) return 'danger';
  return hp * 100 <= maxHp * 55 ? 'warning' : 'healthy';
}
