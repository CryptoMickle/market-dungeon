'use client';

import Image from 'next/image';
import { GameLogo } from './game-logo';
import { GameAudioToggle, useGameAudio } from './game-audio';
import { KeyboardHint } from './desktop-navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './mobile-battle.module.css';
import { GameText, GoldIcon, playerHealthTone } from './game-icons';

type CompactLoadout = { gold: number; weapon: number; armor: number; progress: string };

function openDetails(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[aria-label="Close details"]')?.focus();
}

type Props = {
  location: string;
  mode: string;
  onHome?: () => void;
  desktopSummary?: ReactNode;
  loadout: CompactLoadout;
  room?: number;
  hp: number;
  maxHp: number;
  enemy: { name: string; image: string; hp: number; maxHp: number; incoming: string; flavor: string; isBoss?: boolean };
  omen: string;
  omenHint?: string;
  omenDetails: ReactNode;
  gear: ReactNode;
  log: string[];
  logPreview?: string;
  firstFightHint?: boolean;
  lastExchange?: { dealt: number; taken: number; critical?: boolean; rolledDamage?: number } | null;
  attack: string;
  criticalChance: number;
  storm: string;
  potions: number;
  potionUses: number;
  potionLimit: number;
  onAttack: () => void;
  onStorm: () => void;
  onPotion: () => void;
};

/** Retain the finishing blow feedback when combat gives way to a result. */
export function CriticalHitResult({ damage }: { damage: number }) {
  return <div className={styles.criticalResult} role="status" aria-label="Critical finishing blow">🔥 CRITICAL! · <b>{damage} HP</b></div>;
}

export function BattleHeader({ mode, summary, onHome }: { mode: string; summary?: ReactNode; onHome?: () => void }) {
  return <header className={styles.header}><strong><GameLogo compact onHome={onHome} /></strong><span>{mode}</span><small className={styles.desktopSummary}>{summary}</small></header>;
}

type PlayerStatusProps = {
  hp: number; maxHp: number; location: string; potions: number;
  loadout: CompactLoadout;
  omen?: string; omenHint?: string; omenDetails?: ReactNode; gear: ReactNode;
};

/** One status instance: stacked on mobile, three balanced columns on desktop. */
export function PlayerHeader({ mode, summary, onHome, ...status }: PlayerStatusProps & { mode: string; summary?: ReactNode; onHome?: () => void }) {
  return <div className={styles.topBar}>
    <BattleHeader mode={mode} summary={summary} onHome={onHome} />
    <PlayerStatus {...status} mode={mode} />
  </div>;
}

export function RelicInfo({ name, children }: { name: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className={styles.relicInfo} aria-label={`Relic details: ${name}`} onClick={() => openDetails(dialog.current)}>{name} ⓘ</button>
    <dialog ref={dialog} className={styles.dialog} aria-label="Relic details">
      <div className={styles.dialogHead}><h2>{name}</h2><GameAudioToggle inline /><button autoFocus aria-label="Close details" onClick={() => dialog.current?.close()}>✕</button></div>
      {children}
    </dialog>
  </>;
}

export function PlayerHealth({ hp, maxHp, location, accessories }: { hp: number; maxHp: number; location: string; accessories?: ReactNode }) {
  const percent = Math.max(0, Math.min(100, maxHp > 0 ? hp / maxHp * 100 : 0));
  return <div className={styles.player} data-health={playerHealthTone(hp, maxHp)} aria-label={`Your health ${hp} of ${maxHp}`}>
    <div className={styles.statusTop}>
      <div className={styles.healthText}><small>{location}</small><div><span>YOUR HP</span><div className={styles.healthValue}><span className={styles.healthHeart} aria-hidden="true">❤️</span><b>{hp}/{maxHp}</b></div></div></div>
      {accessories}
    </div>
    <i><em style={{ width: `${percent}%` }} /></i>
  </div>;
}

/** The same read-only player dashboard is used in combat and between rooms. */
export function PlayerStatus({ hp, maxHp, location, potions, loadout, omen, omenHint, omenDetails, gear, mode }: PlayerStatusProps & { mode: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<'Omen' | 'Gear'>('Omen');
  function show(next: typeof detail) { setDetail(next); openDetails(dialog.current); }
  return <section className={styles.playerStatus} aria-label="Player status">
    <PlayerHealth hp={hp} maxHp={maxHp} location={location} accessories={<div className={styles.inventory}>
        <span aria-label={`Potions ${potions} of 5`}><small className={styles.mobileLabel}>POTIONS</small>🧪 {potions}/5</span>
        <span className={styles.mobileStat} aria-label={`Gold ${loadout.gold}`}><small>GOLD</small><span><GoldIcon /> {loadout.gold}</span></span>
        <button className={styles.gearButton} aria-label={`GEAR details: Weapon ${loadout.weapon}, Armor ${loadout.armor}`} onClick={() => show('Gear')}><small>GEAR ›</small><span>⚔️ {loadout.weapon} · 🛡️ {loadout.armor}</span></button>
        <span className={styles.mobileStat} aria-label={location}><small>{mode.startsWith('JUDGE') ? 'JUDGE' : 'EXPEDITION'}</small><span>{loadout.progress}</span></span>
      </div>} />
    {omen && <button className={styles.omenButton} onClick={() => show('Omen')} aria-label={`Omen details: ${omen}`}><b>{omen}</b><span>DETAILS ›</span></button>}
    {omen && omenHint && <p className={styles.omenHint}>{omenHint}</p>}
    {!omen && <div className={styles.mobileMode}>{mode}</div>}
    <dialog ref={dialog} className={styles.dialog} aria-label={detail}>
      <div className={styles.dialogHead}><h2>{detail === 'Gear' ? '⚔️ Gear' : 'Omen'}</h2><GameAudioToggle inline /><button autoFocus onClick={() => dialog.current?.close()} aria-label="Close details">✕</button></div>
      {detail === 'Omen' ? omenDetails : gear}
    </dialog>
  </section>;
}

/** Full Expedition's ten rooms in the current tier; indicators are not controls. */
function RoomProgress({ room }: { room: number }) {
  const tier = Math.ceil(room / 10);
  const current = (room - 1) % 10 + 1;
  return <ol className={styles.roomProgress} aria-label={`Room progress: tier ${tier}, room ${current} of 10`}>
    {Array.from({ length: 10 }, (_, index) => {
      const step = index + 1;
      return <li key={step} aria-current={step === current ? 'step' : undefined} data-complete={step < current} aria-label={`${step === 10 ? 'Boss' : 'Room'} ${step}${step < current ? ', cleared' : ''}`}><span aria-hidden="true">{step === 10 ? '◆' : step}</span></li>;
    })}
  </ol>;
}

/** Presentation only: each game owns its rules, transcript and action callbacks. */
export function MobileBattle(props: Props) {
  const { playCharacterIntro, setBossBattle } = useGameAudio();
  const bossBattleActive = Boolean(props.enemy.isBoss && props.enemy.hp > 0 && props.hp > 0);
  const screen = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const potionReason = props.potions === 0 ? 'Empty' : props.hp >= props.maxHp ? 'Full HP' : props.potionUses >= props.potionLimit ? 'Limit' : null;
  const percent = (hp: number, max: number) => `${Math.max(0, Math.min(100, max > 0 ? hp / max * 100 : 0))}%`;
  useEffect(() => {
    if (!window.matchMedia('(max-width: 800px)').matches) return;
    // Locking from the longer setup page can leave its scroll offset behind.
    // Include the mode navigation and clock above combat; reset only on entry.
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    // Keep desktop encounter focus and scrolling independent of mobile entry.
    // Neither effect runs again after an individual hit.
    if (!window.matchMedia('(min-width: 801px)').matches) return;
    screen.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    screen.current?.focus({ preventScroll: true });
  }, [props.enemy.name]);
  useEffect(() => {
    setBossBattle(bossBattleActive);
    return () => setBossBattle(false);
  }, [bossBattleActive, setBossBattle]);
  useEffect(() => {
    playCharacterIntro(props.enemy.name);
  }, [playCharacterIntro, props.enemy.name]);
  return (
    <section ref={screen} tabIndex={-1} className={`mobile-battle-root ${styles.screen}`} aria-label="Combat view">
      <PlayerHeader mode={props.mode} summary={props.desktopSummary} onHome={props.onHome} hp={props.hp} maxHp={props.maxHp} location={props.location} potions={props.potions} loadout={props.loadout} omen={props.omen} omenHint={props.omenHint} omenDetails={props.omenDetails} gear={props.gear} />
      <div className={styles.encounter}>
        {props.room !== undefined && <RoomProgress room={props.room} />}
        <div className={styles.enemy} data-boss={Boolean(props.enemy.isBoss)} aria-label={`Enemy health ${props.enemy.hp} of ${props.enemy.maxHp}`}>
          <div><h2>{props.enemy.name}</h2><b>{props.enemy.hp}/{props.enemy.maxHp}</b></div>
          <i><em style={{ width: percent(props.enemy.hp, props.enemy.maxHp) }} /></i>
          <span>ENEMY HP <small>💥 RETALIATION {props.enemy.incoming}</small></span>
        </div>
        <div className={styles.art}><Image src={props.enemy.image} alt={props.enemy.name} fill priority sizes="(max-width: 800px) 100vw, (max-width: 1920px) 52vw, 1000px" /></div>
        <blockquote>{props.enemy.flavor}</blockquote>
      </div>
      <div className={styles.bottom}>
        {props.firstFightHint && <aside className={styles.firstFightHint} aria-label="First fight guide">
          <b>FIRST FIGHT</b><span>Your omen does not change attack damage.</span>
        </aside>}
        <button className={styles.log} onClick={() => openDetails(dialog.current)} aria-label="Open dungeon log">
          <span>READ DUNGEON LOG <b className={styles.logPrompt}>READ MORE ›</b></span><p aria-live="polite"><GameText>{props.logPreview ?? props.log[0] ?? 'The dungeon is quiet. This is almost certainly temporary.'}</GameText></p>
        </button>
        <div className={styles.exchange} role="status" aria-label="Last combat exchange">
          <span>TOOK <b>{props.lastExchange ? `${props.lastExchange.taken} HP` : '—'}</b></span>
          <span className={props.lastExchange?.critical ? styles.critical : undefined} key={`${props.enemy.hp}:${props.hp}`}>{props.lastExchange?.critical ? '🔥 CRITICAL!' : 'DEALT'} <b>{props.lastExchange ? `${props.lastExchange.critical ? props.lastExchange.rolledDamage ?? props.lastExchange.dealt : props.lastExchange.dealt} HP` : '—'}</b></span>
        </div>
        <section className={styles.actions} aria-label="Combat actions" data-keyboard-actions>
          <button data-game-audio="storm" className={styles.storm} onClick={props.onStorm}><b>⚡ STORM</b><span className={styles.actionHint}>Risky · can deal 0</span><small>{props.storm} DMG</small></button>
          <button data-game-audio="attack" data-keyboard-default="true" className={styles.attack} onClick={props.onAttack}><b>⚔️ ATTACK</b><span className={styles.actionHint}>Steady damage</span><small>{props.attack} DMG · {props.criticalChance}% CRIT</small></button>
          <button data-game-audio="potion" className={styles.potion} onClick={props.onPotion} disabled={Boolean(potionReason)}><b>🧪 POTION</b><span className={styles.potionDetails}><small>Heals up to 25 HP · enemy strikes back</small><span className={styles.potionUses}>{props.potions}/5{potionReason ? ` · ${potionReason}` : ''} · {props.potionUses}/{props.potionLimit} used this fight</span></span></button>
        </section>
        <KeyboardHint />
      </div>
      <dialog ref={dialog} className={styles.dialog} aria-label="Dungeon log">
        <div className={styles.dialogHead}><h2>Dungeon log</h2><GameAudioToggle inline /><button autoFocus onClick={() => dialog.current?.close()} aria-label="Close details">✕</button></div>
        {props.log.map((entry, index) => <p key={index}><GameText>{entry}</GameText></p>)}
      </dialog>
    </section>
  );
}
