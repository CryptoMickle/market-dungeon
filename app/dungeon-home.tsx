'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameLogo } from './game-logo';
import { useAgentsEnvironment, useLocalAgents } from './local-agents-context';
import { FULL_RUN_STORAGE_KEY, parseFullRunSession } from './gameplay/full-run-storage';
import { getHistoricalResume, getLatestHistoricalProfile } from './historical-navigation';
import { judgeNetworkProfile } from './judge-network';
import { liveJudgeCombatState } from './live-judge-combat';
import styles from './dungeon-home.module.css';

export type DungeonMode = 'expedition' | 'judge' | 'agents';
type Demo = 'live' | 'replay';
type SavedEntry = { summary: string; finished: boolean };
const AGENTS_SAVE = 'market-dungeon/local-agents/full-run/v1';
const modes = [
  { id: 'expedition', name: 'Full Expedition' },
  { id: 'judge', name: 'Judge Demo' },
  { id: 'agents', name: 'Somnia Agents' },
] as const;

const descriptions = {
  neutral: {
    eyebrow: 'WELCOME TO MARKET DUNGEON', title: 'Choose your way into the dungeon.',
    intro: 'Select a version above to see what you will play and how it works. Nothing starts until you press Enter Dungeon.',
    points: ['Take your time. You can compare the versions before entering.', 'The Market Dungeon logo brings you back here whenever you need it.'],
    facts: [], note: 'Your adventure starts with your choice.',
  },
  expedition: {
    eyebrow: 'THE COMPLETE ADVENTURE', title: 'Fight your way through forty rooms.',
    intro: 'Build your equipment, collect relics and survive four bosses. Your Bitcoin prediction decides whether a defeated boss stays down.',
    points: ['Lock UP or DOWN before each tier’s live five-minute market ends.', 'A correct prediction earns the boss relic. A wrong one brings the boss back.'],
    facts: ['40 rooms', '4 bosses', 'Live · 5 min'],
    note: 'Free to play. No wallet or transactions. Progress is saved on this device.',
  },
  live: {
    eyebrow: 'JUDGE DEMO · LIVE', title: 'One short run. A fresh market result.',
    intro: 'Fight a guard and a boss while a real one-minute Bitcoin market unfolds. This is the quickest way to see combat meet an Event Contract.',
    points: ['Choose UP or DOWN, fight, then reveal the independently verified result.', 'A correct prediction wins the demo. A wrong one ends the run.'],
    facts: [], note: 'No wallet or transactions. Final settlement can take longer than one minute.',
  },
  replay: {
    eyebrow: 'JUDGE DEMO · HISTORICAL REPLAY', title: 'A short run with a sealed outcome.',
    intro: 'Choose your omen before the server draws a hidden, finalized market. Fight the guard and boss, then reveal the result and inspect its proof.',
    points: ['Shows choice first, a signed lock and independent settlement verification.', 'Uses a historical market. Your choice does not predict today’s Bitcoin price.'],
    facts: [], note: 'No wallet or transactions. You can return from Home in this tab; reloading starts a new replay.',
  },
  agents: {
    eyebrow: 'SOMNIA AGENTS · LOCAL EDITION', title: 'Can you outpredict Somnia Agent Kevin?',
    intro: 'Play the full adventure with Kevin as your prediction rival. His call stays beside yours in the status bar while you fight.',
    points: ['You both face the same market. Kevin’s choice does not change your combat or boss result.', 'Compare your calls after settlement. Bragging rights are the prize.'],
    facts: ['40 rooms', 'Kevin as rival', 'Live · 5 min'],
    note: 'Local simulation needs no wallet. For a real Somnia testnet agent, open Kevin’s Details before locking; a testnet wallet and STT are required.',
  },
} as const;

export default function DungeonHome() {
  const enabled = useLocalAgents();
  const agentsEnvironment = useAgentsEnvironment();
  const router = useRouter();
  const [mode, setMode] = useState<DungeonMode | null>(null);
  const [demo, setDemo] = useState<Demo>('live');
  const [saved, setSaved] = useState<Record<string, SavedEntry>>({});
  const [replayHref, setReplayHref] = useState<'/judge' | '/shannon/judge'>('/shannon/judge');
  const baseContent = descriptions[mode === 'judge' ? demo : mode ?? 'neutral'];
  const content = mode === 'agents' && agentsEnvironment === 'preview' ? {
    ...baseContent,
    eyebrow: 'SOMNIA AGENTS · PREVIEW',
    note: 'Starts with Simulated Kevin: random, no AI or wallet. For a real Somnia testnet agent, open Kevin’s Details before locking. A wallet browser and testnet STT are required.',
  } : baseContent;
  const key = mode === 'judge' ? demo : mode ?? 'neutral';
  const resume = saved[key];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Read summaries only. Home never starts a market, replay or agent request.
      const summaries: Record<string, SavedEntry> = {};
      try {
        for (const [name, storageKey] of [['expedition', FULL_RUN_STORAGE_KEY], ['agents', AGENTS_SAVE]]) {
          const session = parseFullRunSession(localStorage.getItem(storageKey));
          if (session) {
            const game = session.run.game;
            const room = Math.min(40, game.roomsCleared + (game.monsterHp > 0 || session.run.phase === 'boss-lock-required' || session.run.phase === 'settlement-pending' ? 1 : 0));
            const finished = ['dead', 'complete'].includes(session.run.phase);
            summaries[name] = { finished, summary: finished ? 'Your last run is saved. View its result or start again inside.' : `Saved expedition · Room ${Math.max(1, room)}/40 · ${game.hp}/${game.maxHp} HP` };
          }
        }
      } catch { /* An unavailable save must not prevent entry or shift the layout. */ }
      try {
        const raw = sessionStorage.getItem('market-dungeon-live-judge-v1');
        const live = raw && raw.length <= 65_536 ? JSON.parse(raw) : null;
        if (live?.live?.lock && Array.isArray(live.actions)) {
          const combat = liveJudgeCombatState(live.live.gameSeed, live.actions, { bossEntered: live.bossEntered });
          const finished = Boolean(live.result) || combat.phase === 'dead';
          if (combat.valid && (finished || live.live.lock.expiresAt * 1_000 > Date.now())) {
            summaries.live = { finished, summary: finished ? 'Your last demo is saved in this tab. Open it to view the result.' : 'A live demo is saved in this tab. Market time continues while you are here.' };
          }
        }
      } catch { /* Live verifies the saved lock again when the player enters. */ }
      const replayProfile = getLatestHistoricalProfile() ?? 'shannon-testnet';
      const replay = getHistoricalResume(replayProfile);
      setReplayHref(judgeNetworkProfile(replayProfile).judgePath);
      if (replay?.hasLockedReplay) {
        const finished = ['VICTORY', 'DEAD'].includes(replay.phase);
        summaries.replay = { finished, summary: finished ? 'Your last replay is kept in this tab. Open it to view the result.' : `Replay paused in this tab · ${replay.hp}/100 HP` };
      }
      setSaved(summaries);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function enter() {
    if (!mode) return;
    const href = mode === 'judge' ? demo === 'live' ? '/shannon/live-judge' : replayHref : mode === 'agents' ? '/somnia-agents' : '/expedition';
    router.push(href);
  }

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <header className={styles.header}>
        <GameLogo onHome={() => { setMode(null); setDemo('live'); window.scrollTo({ top: 0, behavior: 'instant' }); }} />
        <h1>Your call. Your way in.</h1>
        <p>Defeat the boss. Let the market decide if it stays down.</p>
      </header>
      <fieldset className={styles.modes} aria-label="Choose your dungeon" data-count={enabled ? 3 : 2}>
        <legend>Choose your dungeon</legend>
        {modes.filter(item => item.id !== 'agents' || enabled).map(item => <label key={item.id} className={styles.mode}>
          <input type="radio" name="dungeon-mode" aria-label={item.name} value={item.id} checked={mode === item.id} onChange={() => setMode(item.id)} />
          <span className={styles.modeTitle}>{item.name}{item.id === 'agents' && <small>New!</small>}</span>
        </label>)}
      </fieldset>
      <section className={styles.details} aria-label="Selected dungeon">
        <div className={styles.art}>
          <Image src="/assets/delveworn-tier2-party-hero.webp" alt="Grave Belle, Gary and Meatwall waiting in the dungeon" fill priority sizes="(max-width: 800px) 100vw, 560px" />
          <div><span>WELCOME TO MARKET DUNGEON</span><strong>The dungeon has opinions.<br />Now you get one too.</strong></div>
        </div>
        <div className={styles.copy}>
          <div className={styles.explanation} aria-live="polite" aria-atomic="true">
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h2>{content.title}</h2>
            <p className={styles.intro}>{content.intro}</p>
            <ul>{content.points.map(point => <li key={point}>{point}</li>)}</ul>
          </div>
          <div className={styles.formatSlot}>
            {mode === 'judge' ? <fieldset className={styles.variants} aria-label="Choose Judge format">
              <legend>Choose Judge format</legend>
              {(['live', 'replay'] as const).map(value => <label key={value}><input type="radio" name="judge-demo" checked={demo === value} onChange={() => setDemo(value)} aria-label={value === 'live' ? 'Live · 1 min' : 'Historical replay'} /><span>{value === 'live' ? 'LIVE · 1 MIN' : 'HISTORICAL REPLAY'}</span></label>)}
            </fieldset> : <div className={styles.facts}>{content.facts.map(fact => <span key={fact}>{fact}</span>)}</div>}
          </div>
          <div className={styles.entry}>
            <p className={styles.resume}>{resume?.summary || 'Choose a version, then enter when you are ready.'}</p>
            <button type="button" className={styles.enter} disabled={!mode} onClick={enter}>{!mode ? 'CHOOSE A MODE' : resume?.finished ? 'VIEW LAST RUN' : resume ? 'CONTINUE RUN' : 'ENTER DUNGEON'}<span aria-hidden="true">→</span></button>
            <p className={styles.note}>{content.note}</p>
          </div>
        </div>
      </section>
      <footer className={styles.footer}><span>DELVEWORN × DREAMDEX · SOMNIA EVENT CONTRACTS</span><Link href="/credits">Privacy · Credits</Link></footer>
    </div>
  </main>;
}
