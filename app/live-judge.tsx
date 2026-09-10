'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BossOutcomeScene } from './boss-outcome-scene';
import { DesktopNavigation, KeyboardHint } from './desktop-navigation';
import { useGameAudio } from './game-audio';
import { GameLogo } from './game-logo';
import { GameModeNav } from './game-mode-nav';
import { GameText, GoldIcon, LoadoutSummary } from './game-icons';
import { DREAMDEX_BTC_5M_URL } from './dreamdex-link';
import { JUDGE_COMBAT, type JudgeCombatAction, type JudgeCombatActionName } from './judge-combat';
import { liveJudgeCombatState } from './live-judge-combat';
import { liveJudgeJournal } from './live-judge-journal';
import { MobileBattle, PlayerHeader } from './mobile-battle';
import { LiveJudgeProofDetails } from './live-judge-proof-details';
import { LiveMarketOdds } from './live-market-odds';
import { OmenGuide } from './omen-guide';
import { useLiveJudgeOdds } from './use-live-judge-odds';
import { RunSharePanel } from './run-share-panel';
import { isChallengeEntry, liveJudgeChallengeUrl, type RunShareCardInput } from './share-run-card';
import {
  canonicalLiveJson, isLiveJudgeMarket, verifyLiveJudgeLockAttestation, verifyLiveJudgeProof,
  type LiveJudgeMarket, type LiveJudgePublicKey, type LiveJudgeStart, type LiveJudgeProof,
} from './live-judge-proof';
import styles from './live-judge.module.css';

const API = '/api/live-judge';
const STORAGE = 'market-dungeon-live-judge-v1';
const GUARD = { name: 'Meatwall', image: '/monsters/orc-4-meatwall.webp', flavor: 'Less of an opponent. More of an architectural problem.' };
const BOSS = { name: 'The Chairman Below', image: '/monsters/boss-4-chairman-below.webp', flavor: 'The final authority. There is no escalation path above him.' };
const KEVIN = '/characters/merchant-quartermaster-kevin.webp';
const localShareAction = () => {};
type Direction = 'UP' | 'DOWN';
type Verdict = 'BLESSED' | 'CURSED' | 'VOID';
type SavedRun = { live: LiveJudgeStart; actions: JudgeCombatAction[]; bossEntered: boolean; result?: LiveJudgeProof; rested?: boolean };
type VerifiedResult = { result: Verdict; proof: LiveJudgeProof };

const time = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
function price(value: string) {
  if (!/^\d+(?:\.\d{1,18})?$/.test(value) || Number(value) <= 0) return 'Unavailable';
  const [whole, fraction = ''] = value.split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}

class LiveRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: number) { super(message); }
}

async function request(path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`${API}/${path}`, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  const data = await response.json().catch(() => { throw new LiveRequestError('The live service returned an unreadable response. Your progress is unchanged; please retry.', response.status, 5); });
  if (!response.ok) throw new LiveRequestError(typeof data.error === 'string' ? data.error : 'The dungeon connection was interrupted.', response.status,
    Math.max(3, Math.min(120, Number(data.retryAfter ?? response.headers.get('retry-after')) || 5)));
  return data;
}

function OmenDetails({ market, direction, locked }: { market: LiveJudgeMarket; direction: Direction; locked: boolean }) {
  return <div className={styles.proof}>
    <p>{locked ? 'Your locked omen' : 'Available Event Contract'}: <b>BTC {direction}</b>. UP wins when the settlement price is at or above <b>{price(market.strikeExactUsd)}</b>; DOWN wins below it.</p>
    <dl><dt>Market</dt><dd>{market.marketId}</dd><dt>Window closes</dt><dd>{new Date(Number(market.expiry) * 1_000).toLocaleTimeString()}</dd><dt>Network</dt><dd>Somnia Shannon Testnet · 50312</dd></dl>
    <p>This clock tracks the market. You can keep fighting after 00:00. The result is checked after combat and market settlement.</p>
    <p>This is a live one-minute testnet pricefeed series. The target is fixed for this market; it is not a continuously updating spot quote. No wallet or transaction is used.</p>
  </div>;
}

export default function LiveJudge() {
  const { playCharacterIntro, playOutcome } = useGameAudio();
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [candidate, setCandidate] = useState<LiveJudgeMarket | null>(null);
  const [direction, setDirection] = useState<Direction>('UP');
  const [live, setLive] = useState<LiveJudgeStart | null>(null);
  const [publicKey, setPublicKey] = useState<LiveJudgePublicKey | null>(null);
  const [actions, setActions] = useState<JudgeCombatAction[]>([]);
  const [bossEntered, setBossEntered] = useState(false);
  const [result, setResult] = useState<VerifiedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [finding, setFinding] = useState(false);
  const [marketIssue, setMarketIssue] = useState('');
  const [nextMarketAt, setNextMarketAt] = useState(0);
  const [rested, setRested] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState('');
  const [invited, setInvited] = useState(false);
  const [expired, setExpired] = useState(false);
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const bossDownAt = useRef(0);
  const actionLogRef = useRef<JudgeCombatAction[]>([]);
  const stage = useRef<HTMLElement>(null);

  const combat = liveJudgeCombatState(live?.gameSeed ?? 'g'.repeat(43), actions, { bossEntered });
  const journal = useMemo(() => live
    ? liveJudgeJournal(live.gameSeed, live.lock.direction, actions, { bossEntered, rested, result: result?.result })
    : { entries: [] as string[], preview: '' }, [live, actions, bossEntered, rested, result]);
  const log = journal.entries;
  const fighting = Boolean(live && (combat.phase === 'guard' || combat.phase === 'boss'));
  const isBoss = combat.phase === 'boss';
  const market = live?.lock.market ?? candidate;
  const remaining = market ? Math.max(0, Math.ceil(Number(market.expiry) - (now + clockOffset) / 1_000)) : 0;
  const retry = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  const ended = result !== null || (live !== null && combat.phase === 'dead');
  const marketOdds = useLiveJudgeOdds(market, ready && remaining > 0 && !ended);
  const step = !live ? 0 : combat.phase === 'guard' || (combat.phase === 'dead' && !bossEntered) ? 1
    : combat.phase === 'between' || combat.phase === 'boss' || combat.phase === 'dead' ? 2 : 3;
  const shownHp = result?.result === 'CURSED' ? 0 : rested && combat.phase === 'complete' ? 100 : combat.hp;
  const gold = 62 + (combat.guardHp === 0 ? 18 : 0) + (result && result.result !== 'CURSED' ? 42 : 0);
  const encounters = Number(combat.guardHp === 0) + Number(combat.bossHp === 0);
  const actualOutcome = result ? result.proof.onchainSettlement.voided ? 'VOID'
    : result.proof.onchainSettlement.winningOutcome === 0 ? 'UP' : 'DOWN' : undefined;
  const runShareInput: RunShareCardInput | null = ended && live ? {
    mode: 'LIVE_JUDGE', result: result?.result ?? 'DEFEATED', tier: 4, totalTiers: 4,
    reachedRoom: bossEntered ? 2 : 1, totalRooms: 2, enemiesDefeated: encounters,
    gold, lockedDirection: live.lock.direction, actualOutcome,
    verifiedOnchain: Boolean(result), marketId: live.lock.market.marketId,
  } : null;
  const summary = <LoadoutSummary gold={gold} weapon={4} armor={1} potions={`${combat.potions}/5`} />;
  const gear = <p>Weapon 4 · Armor 1. Attack deals 15–19 damage with a 15% critical chance. Storm rolls 0–32. A potion heals 25 HP; enemies retaliate during combat.</p>;

  useEffect(() => {
    mounted.current = true;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 500);
    window.addEventListener('focus', tick);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', tick); controller.current?.abort(); };
  }, []);

  useEffect(() => {
    const restoreController = new AbortController();
    async function restore() {
      try {
        // An invitation starts a separate run. Keep any old proof in storage
        // until the player explicitly accepts a new market lock.
        if (isChallengeEntry(window.location.search)) { setInvited(true); return; }
        let raw: string | null;
        try { raw = sessionStorage.getItem(STORAGE); } catch { return; }
        if (!raw) return;
        if (raw.length > 65_536) throw new Error('Saved run is invalid.');
        const saved = JSON.parse(raw) as SavedRun;
        const savedCombat = saved.live && Array.isArray(saved.actions)
          ? liveJudgeCombatState(saved.live.gameSeed, saved.actions, { bossEntered: saved.bossEntered }) : null;
        const key = await request('public-key', restoreController.signal) as LiveJudgePublicKey;
        if (!saved.live || saved.live.lock.market.asset !== 'BTC' || (!saved.result && savedCombat?.phase !== 'dead' && saved.live.lock.expiresAt * 1_000 <= Date.now())
          || !await verifyLiveJudgeLockAttestation(saved.live.lock, saved.live.lockAttestation, key)
          || saved.live.gameSeed !== saved.live.lock.gameSeed
          || !savedCombat?.valid) {
          throw new Error('The saved live run has expired or could not be verified. Start a fresh market.');
        }
        if (saved.result) {
          if (canonicalLiveJson(saved.result.lock) !== canonicalLiveJson(saved.live.lock)
            || canonicalLiveJson(saved.result.actions) !== canonicalLiveJson(saved.actions)) throw new Error('The saved proof does not match this run.');
          const checked = await verifyLiveJudgeProof(saved.result, { trustedKey: key });
          if (checked.status !== 'PASS') throw new Error('The saved proof could not be checked right now. Reload to retry; the saved proof remains on this device.');
        }
        if (restoreController.signal.aborted) return;
        setPublicKey(key); setLive(saved.live); setActions(saved.actions); actionLogRef.current = saved.actions;
        setBossEntered(Boolean(saved.bossEntered)); setDirection(saved.live.lock.direction);
        setRested(saved.rested === true);
        if (saved.result) setResult({ result: saved.result.result, proof: saved.result });
        bossDownAt.current = Date.now();
      } catch (error) {
        if (!restoreController.signal.aborted) setIssue(error instanceof Error ? error.message : 'The saved run could not be restored.');
      } finally {
        if (!restoreController.signal.aborted) {
          setChallengeUrl(liveJudgeChallengeUrl(window.location.origin));
          setReady(true);
        }
      }
    }
    void restore();
    return () => restoreController.abort();
  }, []);

  useEffect(() => {
    if (!ready || !live) return;
    try { sessionStorage.setItem(STORAGE, JSON.stringify({ live, actions, bossEntered, ...(result ? { result: result.proof } : {}), rested } satisfies SavedRun)); }
    catch { /* Play remains available with storage disabled. */ }
  }, [ready, live, actions, bossEntered, result, rested]);

  useEffect(() => {
    if (!ready || fighting) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (live && window.matchMedia('(min-width: 801px)').matches) stage.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, live, fighting, combat.phase, result]);

  useEffect(() => {
    if (!ready || live) return;
    const candidateController = new AbortController();
    let timer: number | undefined;
    async function load() {
      if (document.hidden || busyRef.current) { timer = window.setTimeout(load, 5_000); return; }
      setFinding(true);
      try {
        const data = await request('market?asset=BTC', candidateController.signal);
        if (candidateController.signal.aborted) return;
        if (busyRef.current) { timer = window.setTimeout(load, 5_000); return; }
        if (Number.isFinite(data.serverTime)) setClockOffset(data.serverTime * 1_000 - Date.now());
        if (data.market !== null && (!isLiveJudgeMarket(data.market) || data.market.asset !== 'BTC')) throw new Error('The live market did not match the supported BTC testnet series.');
        setCandidate(data.market);
        setMarketIssue('');
        setNextMarketAt(data.market ? 0 : Date.now() + (Number(data.retryAfter) || 5) * 1_000);
        timer = window.setTimeout(load, Math.max(3, Math.min(15, Number(data.retryAfter) || 10)) * 1_000);
      } catch (error) {
        if (candidateController.signal.aborted) return;
        setCandidate(null);
        setMarketIssue(error instanceof Error ? error.message : 'Live markets are temporarily unavailable.');
        timer = window.setTimeout(load, (error instanceof LiveRequestError ? error.retryAfter : 10) * 1_000);
      } finally { if (!candidateController.signal.aborted) setFinding(false); }
    }
    void load();
    return () => { candidateController.abort(); window.clearTimeout(timer); };
  }, [ready, live, refresh]);

  async function lockOmen() {
    if (!candidate || remaining < 20 || busyRef.current || retry > 0) return;
    busyRef.current = true; setBusy(true); setIssue('');
    const pending = new AbortController(); controller.current = pending;
    const chosen = { marketId: candidate.marketId, direction };
    const shownMarket = candidate;
    try {
      const key = publicKey ?? await request('public-key', pending.signal) as LiveJudgePublicKey;
      const data = await request('start', pending.signal, chosen);
      const next = data.live as LiveJudgeStart;
      if (!next || next.lock.market.marketId !== chosen.marketId || next.lock.direction !== chosen.direction
        || canonicalLiveJson(next.lock.market) !== canonicalLiveJson(shownMarket)
        || next.gameSeed !== next.lock.gameSeed || !await verifyLiveJudgeLockAttestation(next.lock, next.lockAttestation, key)) {
        throw new Error('The signed omen did not match your choice. No fight was started.');
      }
      if (pending.signal.aborted || !mounted.current) return;
      if (isChallengeEntry(window.location.search)) {
        const acceptedUrl = new URL(window.location.href);
        acceptedUrl.searchParams.delete('challenge');
        window.history.replaceState(window.history.state, '', acceptedUrl);
      }
      setInvited(false);
      setPublicKey(key); setLive(next); setActions([]); actionLogRef.current = [];
      setBossEntered(false); setRetryAt(0); setRested(false);
    } catch (error) {
      if (pending.signal.aborted || !mounted.current) return;
      setIssue(error instanceof Error ? error.message : 'The omen could not be locked. Please retry.');
      setRetryAt(Date.now() + (error instanceof LiveRequestError ? error.retryAfter : 3) * 1_000);
      if (error instanceof LiveRequestError && error.status === 409) { setCandidate(null); setRefresh(value => value + 1); }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  function act(action: JudgeCombatActionName) {
    if (!live || result || (combat.phase !== 'guard' && combat.phase !== 'between' && combat.phase !== 'boss')) return;
    const nextActions = [...actionLogRef.current, { room: (combat.phase === 'boss' ? 9 : 8) as 8 | 9, action }];
    const next = liveJudgeCombatState(live.gameSeed, nextActions, { bossEntered });
    if (!next.valid) return;
    actionLogRef.current = nextActions; setActions(nextActions);
    if (next.phase === 'between' && combat.phase !== 'between') playCharacterIntro('Quartermaster Kevin');
    if (next.phase === 'complete') { bossDownAt.current = Date.now(); setRetryAt(Date.now() + 3_500); }
  }

  async function reveal() {
    if (!live || !publicKey || combat.phase !== 'complete' || result || busyRef.current || remaining > 0 || retry > 0) return;
    busyRef.current = true; setBusy(true); setIssue('');
    const pending = new AbortController(); controller.current = pending;
    try {
      const data = await request('reveal', pending.signal, { seal: live.seal, actions });
      if (canonicalLiveJson(data.proof?.lock) !== canonicalLiveJson(live.lock)
        || canonicalLiveJson(data.proof?.actions) !== canonicalLiveJson(actions)) throw new Error('The result does not belong to your original locked market and completed combat.');
      const check = await verifyLiveJudgeProof(data.proof, { trustedKey: publicKey });
      if (pending.signal.aborted || !mounted.current) return;
      if (check.status !== 'PASS') throw new Error(check.reason);
      const verdict = data.proof.result as Verdict;
      if (!['BLESSED', 'CURSED', 'VOID'].includes(verdict)) throw new Error('The market result is invalid.');
      setResult({ result: verdict, proof: data.proof }); playOutcome(verdict);
    } catch (error) {
      if (pending.signal.aborted || !mounted.current) return;
      const pendingSettlement = error instanceof LiveRequestError && error.status === 425;
      if (error instanceof LiveRequestError && error.status === 410) setExpired(true);
      setRetryAt(Date.now() + Math.max(8, error instanceof LiveRequestError ? error.retryAfter : 5) * 1_000);
      if (!pendingSettlement) setIssue(error instanceof Error ? error.message : 'Verification paused. Your locked market and completed combat are kept in this tab.');
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  useEffect(() => {
    if (ready && live && combat.phase === 'complete' && !result && !issue && !busy && remaining === 0 && retry === 0
      && now >= bossDownAt.current + 3_000 && !document.hidden) void reveal();
    // Absolute time drives bounded checks; pending responses advance retryAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, live, combat.phase, result, issue, busy, remaining, retry, now]);

  function reset() {
    controller.current?.abort(); busyRef.current = false; setBusy(false);
    try { sessionStorage.removeItem(STORAGE); } catch { /* Storage may be disabled. */ }
    setLive(null); setActions([]); actionLogRef.current = []; setBossEntered(false); setResult(null);
    setCandidate(null); setIssue(''); setMarketIssue(''); setNextMarketAt(0); setRetryAt(0); setRested(false); setExpired(false);
    bossDownAt.current = 0; setRefresh(value => value + 1);
  }

  const oddsPanel = <LiveMarketOdds {...marketOdds} direction={live?.lock.direction ?? direction} networkLabel="SHANNON TESTNET · 1 MIN" />;
  const omenDetails = market ? <><OmenDetails market={market} direction={live?.lock.direction ?? direction} locked={Boolean(live)} />{live && !ended && <><OmenGuide mode="live" />{oddsPanel}</>}</> : null;
  const footer = <nav className={styles.footer} aria-label="Live Judge navigation"><Link href="/">FULL EXPEDITION</Link><Link href="/shannon/judge">HISTORICAL REPLAY</Link><Link href="/shannon/live-judge/verify">VERIFY LIVE PROOF</Link><Link href="/credits">PRIVACY · CREDITS</Link></nav>;
  if (!ready) return <main className={styles.shell}><div className={styles.frame}><GameLogo /><p role="status">Opening the live dungeon…</p></div></main>;

  if (fighting && live) return <main className={`${styles.shell} ${styles.combat}`}>
    <DesktopNavigation />
    <div className={styles.combatModes}><GameModeNav current="live" /></div>
    <div className={styles.combatClock} aria-label="Live market countdown"><span>{remaining > 0 ? 'MARKET CLOSES IN' : 'MARKET CLOSED'}</span><b>{remaining > 0 ? time(remaining) : '00:00'}</b><small>{remaining > 0 ? 'You can keep fighting after 00:00.' : 'Keep fighting. The boss result comes after combat.'}</small></div>
    <MobileBattle mode="LIVE JUDGE DEMO" desktopSummary={summary} location={`${isBoss ? 'BOSS' : 'GUARD'} · ${isBoss ? '2' : '1'} OF 2`} loadout={{ gold, weapon: 4, armor: 1, progress: isBoss ? 'BOSS 2/2' : 'GUARD 1/2' }} hp={combat.hp} maxHp={100}
      enemy={{ ...(isBoss ? BOSS : GUARD), hp: isBoss ? combat.bossHp : combat.guardHp, maxHp: isBoss ? JUDGE_COMBAT.boss.hp : JUDGE_COMBAT.guard.hp, incoming: isBoss ? '10–16' : '8–13', isBoss }}
      omen={`BTC ${live.lock.direction} · ${remaining > 0 ? time(remaining) : 'WINDOW CLOSED'}`} omenDetails={omenDetails} gear={gear} log={log} logPreview={journal.preview} firstFightHint={!bossEntered}
      lastExchange={combat.lastExchange} attack="15–19" criticalChance={15} storm="0–32" potions={combat.potions} potionUses={combat.potionUses} potionLimit={isBoss ? 3 : 2}
      onAttack={() => act('attack')} onStorm={() => act('storm')} onPotion={() => act('potion')} />
    {footer}
  </main>;

  return <main className={styles.shell} data-setup={!live} data-ended={ended}>
    <DesktopNavigation />
    <div className={styles.frame}>
      <GameModeNav current="live" />
      {!live ? <header className={styles.header}><GameLogo compact /><div><strong className={styles.eyebrow}>LIVE JUDGE DEMO</strong><span className={styles.subtitle}>1-minute Event Contracts · Somnia testnet</span></div></header>
        : <PlayerHeader mode="LIVE JUDGE DEMO" summary={summary} hp={shownHp} maxHp={100} location={ended ? 'RUN COMPLETE' : combat.phase === 'between' ? 'GUARD DEFEATED' : 'BOSS DEFEATED'} potions={combat.potions} loadout={{ gold, weapon: 4, armor: 1, progress: `${combat.guardHp === 0 ? combat.bossHp === 0 ? 2 : 1 : 0}/2` }} omen={`BTC ${live.lock.direction} · ${remaining > 0 ? time(remaining) : 'WINDOW CLOSED'}`} omenDetails={omenDetails} gear={gear} />}
      <ol className={styles.steps} aria-label="Judge demo progress">{['1 · LOCK OMEN', '2 · GUARD', '3 · BOSS', '4 · FATE'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-done={step > index}>{label}</li>)}</ol>
      <div className={`${styles.journey} ${live ? styles.result : ''}`} data-result={result?.result}>
        {live && combat.phase === 'complete' ? <BossOutcomeScene name={BOSS.name} image={BOSS.image} maxHp={72} compact={ended} outcome={result?.result === 'BLESSED' ? 'blessed' : result?.result === 'CURSED' ? 'last-strike' : result?.result === 'VOID' ? 'void' : 'pending'} />
          : <div className={styles.art}><Image src={!live ? '/assets/delveworn-tier2-party-hero.webp' : combat.phase === 'between' ? KEVIN : bossEntered ? BOSS.image : GUARD.image} alt={!live ? 'The dungeon awaits' : combat.phase === 'between' ? 'Quartermaster Kevin' : 'The undefeated dungeon enemy'} fill priority sizes="(max-width: 800px) 100vw, 55vw" /><div className={styles.artCaption}><strong>{!live ? 'Your call. Your fate.' : combat.phase === 'between' ? 'A brief appointment with Kevin.' : 'The dungeon wins this one.'}</strong><span>{!live ? 'One guard. One boss. A market that is unfolding now.' : 'Dungeon management appreciates your participation.'}</span></div></div>}
        <section ref={stage} tabIndex={-1} className={styles.panel} data-keyboard-action-scope data-keyboard-actions aria-label="Live Judge stage">
          {!live ? <>
            <span className={styles.eyebrow}>{invited ? 'YOU’RE INVITED · MAKE YOUR OWN CALL' : 'A FRESH OUTCOME · EVERY ROUND'}</span>
            <h1>Fight the boss.<br />Let the market decide.</h1>
            <p>Choose a Bitcoin prediction. Fight one guard and one boss while a fresh one-minute market runs.</p>
            <div className={styles.market} aria-label="Available live market">
              <div className={styles.marketHeading}><span>{candidate ? 'BTC/USDC · MARKET CLOSES IN' : 'NEXT BTC/USDC WINDOW'}</span><b className={styles.timer}>{candidate ? time(remaining) : nextMarketAt > now ? time(Math.ceil((nextMarketAt - now) / 1_000)) : '—'}</b></div>
              {candidate && remaining >= 20 ? <><strong className={styles.price}>{price(candidate.strikeExactUsd)}</strong><small>LOCKED TARGET · UP at or above this price when the market settles. DOWN below it.</small></>
                : <p role="status">{finding ? 'Finding a fresh one-minute market…' : 'Waiting for the next market with enough time to lock your omen.'}</p>}
              <small className={styles.clockHint}>You can keep fighting after 00:00.</small>
            </div>
            {oddsPanel}
            <div className={styles.choices} role="group" aria-label="Choose your BTC omen">
              <button aria-pressed={direction === 'UP'} onClick={() => setDirection('UP')} disabled={busy}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP</small><span>At or above the target</span></button>
              <button aria-pressed={direction === 'DOWN'} onClick={() => setDirection('DOWN')} disabled={busy}><b><span aria-hidden="true">🌑</span> SHADOWS RISE</b><small>BTC DOWN</small><span>Below the target</span></button>
            </div>
            <OmenGuide mode="live" />
            <button className={styles.primary} data-keyboard-default="true" onClick={() => void lockOmen()} disabled={!candidate || remaining < 20 || busy || retry > 0}>{busy ? 'LOCKING YOUR OMEN…' : retry > 0 ? `RETRY LOCK IN ${retry}S` : !candidate || remaining < 20 ? 'WAITING FOR A FRESH MARKET' : `LOCK BTC ${direction} & ENTER DUNGEON`}</button>
            <small className={styles.note}>No wallet · No approval · No transaction. Combat and the market run together; settlement can take longer than one minute.</small>
            <KeyboardHint />
            {(issue || marketIssue) && <div className={styles.error} role="status">{issue || marketIssue}</div>}
            <details className={styles.proof}><summary>ABOUT THIS LIVE TESTNET ROUND</summary>{omenDetails}<p>Your signed lock receipt records your choice before the deadline. The server attests the lock time; Somnia independently supplies the settlement. This is a fresh market, not historical replay.</p></details>
            <Link className={styles.secondary} href="/shannon/judge">USE HISTORICAL REPLAY INSTEAD</Link>
          </> : combat.phase === 'between' ? <>
            <span className={styles.eyebrow}>GUARD DEFEATED · +18 GOLD</span><h1>One boss to go.</h1>
            <p>“You look almost adequately alive. A rare achievement.” — Kevin</p><p>Heal before the boss if you need it. Your market keeps running.</p>
            <button className={styles.secondary} data-game-audio="potion" disabled={combat.potions === 0 || combat.hp >= 100} onClick={() => act('potion')}>POTION · HEAL +25 HP · {combat.potions}/5</button>
            <button className={styles.primary} data-keyboard-default="true" onClick={() => setBossEntered(true)}>ENTER FINAL BOSS</button>
            <small className={styles.note}>A potion between fights costs no retaliation.</small>
          </> : combat.phase === 'dead' ? <>
            <span className={styles.eyebrow}>COMBAT LOST</span><h1>The dungeon keeps its boss.</h1><p>Your omen cannot save a lost fight. No market outcome was applied to this run.</p>
          </> : result ? <>
            <span className={styles.eyebrow}>SOMNIA VERIFIED · {result.result}</span>
            <h1>{result.result === 'BLESSED' ? 'Your omen holds.' : result.result === 'CURSED' ? 'One fatal last strike.' : 'Market voided. Boss defeated.'}</h1>
            <p>{result.result === 'BLESSED' ? 'You won the fight and called the market correctly. The boss stays down. Its 42 gold is yours.' : result.result === 'CURSED' ? 'You won the fight, but your prediction was wrong. The fallen boss rises for a final strike. The run ends here.' : 'The market produced no winning prediction. Your combat victory and boss reward are preserved.'}</p>
            <div className={styles.verification}><div><small>YOU LOCKED</small><b>BTC {live.lock.direction}</b></div><div><small>MARKET RESULT</small><b>{actualOutcome === 'VOID' ? 'VOID' : `BTC ${actualOutcome}`}</b></div></div>
          </> : <>
            <span className={styles.eyebrow}>COMBAT WON · MARKET FATE PENDING</span><h1>{remaining > 0 ? 'The boss is down. The clock is running.' : 'The boss is down. Its fate is being checked.'}</h1>
            <p>{remaining > 0 ? 'Your locked market is still open. The result will be checked automatically when the window closes.' : 'We are checking the same locked Event Contract on Somnia. A closed window alone is not a confirmed result.'}</p>
            <div className={styles.market}><div className={styles.marketHeading}><span>LOCKED · BTC {live.lock.direction}</span><b className={styles.timer}>{remaining > 0 ? time(remaining) : busy ? 'VERIFYING' : 'AWAITING RESULT'}</b></div><strong className={styles.price}>{price(live.lock.market.strikeExactUsd)}</strong><small>Your market and direction cannot change during this run.</small></div>
            {issue && <div className={styles.error} role="status">{issue}<br />Your locked market and completed combat are kept in this tab.</div>}
            {issue && !expired && <button className={styles.primary} onClick={() => void reveal()} disabled={busy || remaining > 0 || retry > 0}>{retry > 0 ? `RETRY VERIFICATION IN ${retry}S` : 'RETRY THIS MARKET'}</button>}
            {expired && <button className={styles.primary} onClick={reset}>START A NEW LIVE ROUND</button>}
            {!issue && <small className={styles.note} role="status">{busy ? 'Checking combat, signed lock and the onchain result…' : remaining > 0 ? 'Automatic verification starts when the market closes.' : 'Settlement pending. Checking again shortly.'}</small>}
            <button className={styles.secondary} disabled={rested || combat.hp >= 100} onClick={() => { setRested(true); playCharacterIntro('Quartermaster Kevin'); }}> {rested ? 'KEVIN’S BANDAGE APPLIED' : 'REST WITH KEVIN · FREE'}</button>
            <small className={styles.note}>Rest cannot change your omen or save you from a wrong prediction.</small>
          </>}
          {ended && <>
            <div className={styles.conditions} aria-label="Two victory conditions">
              <div data-state={result ? 'won' : 'lost'}><span>{result ? '✓' : '✕'} CONDITION 1 · COMBAT</span><strong>{result ? 'Boss defeated in combat' : 'Fell before combat was cleared'}</strong></div>
              <div data-state={result?.result === 'BLESSED' ? 'won' : result?.result === 'CURSED' ? 'lost' : 'neutral'}><span>{result?.result === 'BLESSED' ? '✓' : result?.result === 'CURSED' ? '✕' : '○'} CONDITION 2 · PREDICTION</span><strong>{result?.result === 'BLESSED' ? 'BTC prediction correct' : result?.result === 'CURSED' ? 'BTC prediction incorrect' : result?.result === 'VOID' ? 'Market voided · no prediction penalty' : 'No market outcome applied'}</strong></div>
            </div>
            <dl className={styles.finalStats} aria-label="Final run statistics"><div><dt>ENCOUNTERS CLEARED</dt><dd>{encounters}/2</dd></div><div><dt>FINAL GOLD</dt><dd><GoldIcon /> {gold}</dd></div><div><dt>FINAL HEALTH</dt><dd>{shownHp}/100</dd></div><div><dt>POTIONS LEFT</dt><dd>{combat.potions}/5</dd></div></dl>
            <button className={styles.primary} data-keyboard-default="true" onClick={reset}>START NEW LIVE DEMO</button>
            <Link className={styles.secondary} href="/">PLAY FULL EXPEDITION</Link>
          </>}
          {live && <>{!result && <details className={styles.proof}><summary>YOUR LOCKED MARKET & RECEIPT</summary>{omenDetails}<p>Choice locked: {new Date(live.lock.issuedAt * 1_000).toLocaleTimeString()}. Server-signed time; settlement is checked independently on Somnia.</p></details>}
            <ul className={styles.log} aria-label="Dungeon log">{log.slice(0, 3).map((entry, index) => <li key={index}><GameText>{entry}</GameText></li>)}</ul>
            {log.length > 3 && <details className={styles.logHistory}><summary>READ FULL DUNGEON LOG · {log.length} ENTRIES</summary><ul className={styles.log} aria-label="Full dungeon log">{log.map((entry, index) => <li key={index}><GameText>{entry}</GameText></li>)}</ul></details>}
          </>}
        </section>
      {runShareInput &&
        <div className={styles.sharing}>
          <RunSharePanel input={runShareInput} challengeUrl={challengeUrl} onAction={localShareAction} onChallenge={localShareAction} />
          {result && <section className={styles.dreamdex} aria-label="Continue on dreamDEX">
            <span className={styles.eyebrow}>NEXT STEP · DREAMDEX · SOMNIA MAINNET</span>
            <h2>Take your next call to dreamDEX.</h2>
            <p>Explore BTC 5-minute Event Contracts on dreamDEX. This opens a separate mainnet market; your one-minute Shannon testnet result stays here.</p>
            <a className={styles.dreamdexAction} href={DREAMDEX_BTC_5M_URL} target="_blank" rel="noopener noreferrer" aria-label="Continue on dreamDEX — opens in a new tab">CONTINUE ON DREAMDEX ↗</a>
            <small>Opens in a new tab. Wallet connection and any transaction happen on dreamDEX.</small>
          </section>}
          {!result && <section className={styles.defeatNote}><span className={styles.eyebrow}>YOUR RUN · COMBAT DEFEAT</span><h2>Every run has a story.</h2><p>Your card records the encounters you cleared and the omen you locked. This fight ended before market verification, so the card carries no verified market result.</p><p>Start another live round, or try Full Expedition for the complete dungeon.</p></section>}
        </div>
      }
      </div>
      {result && <div className={styles.resultExtras}><LiveJudgeProofDetails proof={result.proof} /></div>}
      {footer}
    </div>
  </main>;
}
