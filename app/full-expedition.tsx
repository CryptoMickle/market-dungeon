'use client';

import Image from 'next/image';
import { GameLogo } from './game-logo';
import { useGameAudio } from './game-audio';
import { BossOutcomeScene, type BossSceneOutcome } from './boss-outcome-scene';
import { DesktopNavigation, KeyboardHint } from './desktop-navigation';
import { GameModeNav } from './game-mode-nav';
import Link from 'next/link';
import { CriticalHitResult, MobileBattle, PlayerHeader, RelicInfo } from './mobile-battle';
import { GameText, GoldIcon as Gold, LoadoutSummary } from './game-icons';
import { dreamDexBtcEventContractUrl } from './dreamdex-link';
import { LiveMarketOdds } from './live-market-odds';
import { OmenGuide } from './omen-guide';
import { RecoverySupplies } from './recovery-supplies';
import type { DreamDexClobOdds } from './clob-odds';
import { ACTIVE_MARKET_POLL_INTERVAL_MS } from './event-contract-interval';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  emitAnalyticsEvent,
  shareActionEvent,
  shareEngagedEvent,
  type ShareAction,
} from './analytics-events.ts';
import {
  FULL_RUN_MARKET_PROOF_VERSION,
  createMarketDungeonRun,
  transitionMarketDungeon,
  type Direction,
  type MarketDungeonAction,
  type MarketDungeonTransition,
} from './gameplay/event-boss-engine.ts';
import {
  attackRange,
  campPrices,
  cryptoRandom,
  currentCriticalChance,
  getMerchantVisit,
  incomingRange,
  stormRange,
  supplyPrices,
  type GameplayAction,
} from './gameplay/delveworn-engine.ts';
import {
  bossDialogue,
  getDelvewornPersona,
} from './gameplay/delveworn-personas.ts';
import {
  FULL_RUN_STORAGE_KEY,
  parseFullRunSession,
  serializeFullRunSession,
  type ActiveLiveMarket,
  type FullRunSession,
} from './gameplay/full-run-storage.ts';
import {
  directSettlementProofMatchesMarket,
  directSettlementProofRpcOutcome,
  isTerminalSettlementMarket,
  type SettlementMarket,
} from './onchain-settlement-proof.ts';
import { isStrictOnchainSettlementProof } from './verify-proof.ts';
import { getRelicDefinition, RELIC_CATALOG } from './gameplay/relics.ts';
import { RunSharePanel } from './run-share-panel.tsx';
import {
  MARKET_DUNGEON_CHALLENGE_URL,
  type RunShareCardInput,
} from './share-run-card.ts';
import styles from './full-expedition.module.css';

const LOOT_ART = [
  null,
  { image: '/assets/loot/potion-v1.webp', label: 'Potion' },
  { image: '/assets/delveworn-gold-coin.webp', label: 'bonus gold' },
  { image: '/assets/loot/weapon-v1.webp', label: 'Weapon +1' },
  { image: '/assets/loot/armor-v1.webp', label: 'Armor +1' },
] as const;

type ActiveMarketResponse = {
  marketId: string;
  intervalSec: string | number;
  question: string;
  strikeUsd: string;
  tradingStart: string | number;
  expiry: string | number;
  expiryIso?: string;
  status: string;
};

function activeFiveMinuteMarket(value: unknown, now: number): ActiveMarketResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const market = value as Partial<ActiveMarketResponse>;
  const tradingStart = Number(market.tradingStart);
  const expiry = Number(market.expiry);
  const strike = Number(market.strikeUsd);
  if (typeof market.marketId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(market.marketId)
    || Number(market.intervalSec) !== 300
    || typeof market.question !== 'string' || market.question.length === 0
    || !Number.isFinite(strike) || strike <= 0
    || !Number.isSafeInteger(tradingStart) || !Number.isSafeInteger(expiry)
    || tradingStart >= expiry || expiry <= now
    || !['Listed', 'Trading'].includes(String(market.status))) return null;
  return market as ActiveMarketResponse;
}

function formatUsd(value: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(value));
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function resultMessage(transition: MarketDungeonTransition): string {
  if (!transition.accepted) return transition.reason;
  if (transition.run.phase === 'settlement-pending') return 'Boss defeated. Its locked Event Contract decides whether it stays down.';
  if (transition.run.phase === 'boss-lock-required' && transition.run.rematchRequired) return 'CURSED — the boss is back at full HP. Lock a new Event Contract to fight again.';
  if (transition.run.phase === 'boss-reward') return 'Boss fate settled. Claim the relic to continue.';
  if (transition.run.phase === 'dead') return 'The expedition ends here.';
  if (transition.run.phase === 'complete') return 'All four tiers are permanently cleared.';
  return transition.reason;
}

export default function FullExpedition() {
  const { playCharacterIntro, playOutcome } = useGameAudio();
  const [session, setSession] = useState<FullRunSession | null>(null);
  const [showHome, setShowHome] = useState(false);
  const homeHeading = useRef<HTMLHeadingElement>(null);
  const [ready, setReady] = useState(false);
  const [direction, setDirection] = useState<Direction>('UP');
  const [busy, setBusy] = useState(false);
  const [marketCandidate, setMarketCandidate] = useState<ActiveMarketResponse | null>(null);
  const [marketOdds, setMarketOdds] = useState<DreamDexClobOdds | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [awaitingSettlementMarketId, setAwaitingSettlementMarketId] = useState<string | null>(null);
  const [notice, setNotice] = useState('Ready for a fresh expedition.');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const shareActionsTracked = useRef(new Set<ShareAction>());
  const shareEngagedTracked = useRef(false);
  const needsMarketCandidate = ready && (!session || (session.run.phase === 'boss-lock-required' && !session.market));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(FULL_RUN_STORAGE_KEY);
      const restored = parseFullRunSession(raw);
      setSession(restored);
      setNotice(restored ? 'Saved expedition restored on this device.' : raw ? 'Saved data was invalid and was not loaded.' : 'Ready for a fresh expedition.');
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    window.localStorage.setItem(FULL_RUN_STORAGE_KEY, serializeFullRunSession(session));
  }, [ready, session]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!needsMarketCandidate) return;
    let cancelled = false;
    let refresh: number | undefined;
    const load = async () => {
      try {
        const response = await fetch('/api/market?interval=300', { cache: 'no-store' });
        const body = await response.json() as { market?: unknown; odds?: DreamDexClobOdds; error?: string };
        const market = activeFiveMinuteMarket(body.market, Math.floor(Date.now() / 1_000));
        if (!response.ok || !market) throw new Error(body.error ?? 'No usable active BTC 5-minute market was returned.');
        if (!cancelled) {
          setMarketCandidate(market);
          setMarketOdds(body.odds?.marketId?.toLowerCase() === market.marketId.toLowerCase() ? body.odds : null);
          setMarketError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMarketOdds(null);
          setMarketError(error instanceof Error ? error.message : 'Active BTC market unavailable.');
        }
      } finally {
        if (!cancelled) refresh = window.setTimeout(() => { void load(); }, ACTIVE_MARKET_POLL_INTERVAL_MS);
      }
    };
    void load();
    return () => { cancelled = true; if (refresh !== undefined) window.clearTimeout(refresh); };
  }, [marketRefresh, needsMarketCandidate]);

  useEffect(() => {
    if (!marketCandidate || !needsMarketCandidate) return;
    const delay = Math.max(0, Number(marketCandidate.expiry) * 1_000 - Date.now() + 250);
    const timer = window.setTimeout(() => {
      setMarketCandidate(null);
      setMarketOdds(null);
      setMarketRefresh((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [marketCandidate, needsMarketCandidate]);

  const run = showHome ? null : session?.run ?? null;
  const game = run?.game ?? null;
  const currentRoomIsUncleared = game && (game.monsterHp > 0 || run?.phase === 'settlement-pending'
    || (run?.phase === 'boss-lock-required' && !run.rematchRequired));
  const room = game ? Math.min(40, game.roomsCleared + (currentRoomIsUncleared ? 1 : 0)) : 0;
  const tier = Math.min(4, Math.max(1, Math.ceil(Math.max(1, room) / 10)));
  const isBoss = game?.monsterType === 3 && game.monsterMaxHp > 0;
  const merchant = game ? getMerchantVisit(game) : null;
  const marketRemaining = session?.market ? Math.max(0, session.market.expiry - now) : 0;
  const candidateRemaining = marketCandidate ? Math.max(0, Number(marketCandidate.expiry) - now) : 0;
  const activeRelic = game ? getRelicDefinition(game.equippedRelic) : RELIC_CATALOG[0];
  const persona = game ? getDelvewornPersona(game.monsterType, Math.max(1, room)) : getDelvewornPersona(3, 10);
  const monsterRemark = game && isBoss && game.lastPlayerDamage === 0 && game.lastMonsterDamage === 0
    ? bossDialogue(room)
    : game?.log[0]?.replace(/^💢 .*? deals \d+ DAMAGE\. /, '').replace(/^👁️ /, '');
  const attack = game ? attackRange(game) : [0, 0];
  const storm = game ? stormRange(game) : [0, 0];
  const incoming = game ? incomingRange(game) : [0, 0];
  const enemyPercent = game?.monsterMaxHp ? Math.max(0, Math.min(100, game.monsterHp / game.monsterMaxHp * 100)) : 0;
  const mobileCombat = Boolean(game && game.monsterHp > 0 && (run?.phase === 'exploring' || run?.phase === 'boss-combat'));
  const loot = game && run?.phase === 'exploring' && game.monsterHp === 0 && game.roomsCleared > 0 ? LOOT_ART[game.lastLootType] : null;
  const lootLabel = loot && game ? game.lastLootType === 2 ? `${game.lastLootAmount} bonus gold` : loot.label : '';
  const gearDetails = game && <><p><LoadoutSummary gold={game.gold} weapon={game.weaponLevel} armor={game.armorLevel} /></p><p>◆ Active relic: {activeRelic.name}<br />{activeRelic.effect}<br />{activeRelic.tradeoff}</p><RelicReviveStatus game={game} relicId={game.equippedRelic} />{game.ownedRelics.length > 0 && <p>{mobileCombat ? 'After this fight, open CHANGE / UNEQUIP RELIC between rooms. Equipment stays locked during combat.' : run?.rematchRequired || run?.phase === 'settlement-pending' ? 'Equipment stays locked until this boss is resolved.' : 'Use CHANGE / UNEQUIP RELIC in the room panel when available.'}</p>}</>;
  const omenSummary = run?.currentAttempt ? `BTC ${run.currentAttempt.direction} · ${marketRemaining > 0 ? `MARKET CLOSES IN ${formatTime(marketRemaining)}` : 'MARKET CLOSED'}` : undefined;
  const omenHint = marketRemaining > 0 ? 'You can keep fighting after 00:00.' : 'Market closed. Keep fighting to reach the boss result.';
  const relicSummary = game?.equippedRelic ? <RelicInfo name={activeRelic.name}><p>{activeRelic.effect}</p><p>{activeRelic.tradeoff}</p><RelicReviveStatus game={game} relicId={game.equippedRelic} /><p>Relics can only be changed between fights when the loadout controls are available.</p></RelicInfo> : activeRelic.name;
  const omenDetails = <><p>LOCKED TIER OMEN · BTC {run?.currentAttempt?.direction}</p><p>Opening reference: {session?.market ? formatUsd(session.market.strikeUsd) : 'Unavailable'}</p><p>{marketRemaining > 0 ? `Market closes in ${formatTime(marketRemaining)}. You can keep fighting after 00:00.` : 'Market closed. Defeat the boss to check the result; settlement can take longer.'}</p><OmenGuide mode="expedition" /><p>Live five-minute dreamDEX Event Contract · Somnia Mainnet.</p></>;
  const merchantStage = Boolean(merchant && run?.phase === 'exploring' && game?.monsterHp === 0);
  const closedGate = run?.phase === 'boss-lock-required' && !run.rematchRequired;
  const latestSettlement = run?.settlements.at(-1) ?? null;
  const verifiedBossMoment = latestSettlement && (
    (latestSettlement.outcome === 'CURSED' && run?.phase === 'boss-lock-required' && run.rematchRequired)
    || ((latestSettlement.outcome === 'BLESSED' || latestSettlement.outcome === 'VOID') && run?.phase === 'boss-reward')
  ) ? latestSettlement : null;
  const bossSceneOutcome: BossSceneOutcome | null = run?.phase === 'settlement-pending' ? 'pending'
    : verifiedBossMoment?.outcome === 'CURSED' ? 'cursed'
      : verifiedBossMoment?.outcome === 'BLESSED' ? 'blessed'
        : verifiedBossMoment?.outcome === 'VOID' ? 'void' : null;
  const settledDirection = verifiedBossMoment?.outcome === 'VOID'
    ? 'VOID'
    : verifiedBossMoment?.outcome === 'BLESSED'
      ? verifiedBossMoment.direction
      : verifiedBossMoment?.direction === 'UP' ? 'DOWN' : 'UP';
  const verifiedBossStatus = verifiedBossMoment && game && <section className={`${styles.settlementMoment} ${verifiedBossMoment.outcome === 'CURSED' ? styles.settlementCursed : verifiedBossMoment.outcome === 'BLESSED' ? styles.settlementBlessed : styles.settlementVoid}`} role="status" aria-label="Verified boss outcome">
              <p>SOMNIA VERIFIED · {verifiedBossMoment.outcome}</p>
              <div className={styles.settlementFlow}>
                <span><small>YOU CHOSE</small><b>BTC {verifiedBossMoment.direction}</b></span>
                <span><small>MARKET SETTLED</small><b>BTC {settledDirection}</b></span>
                <span><small>CONSEQUENCE</small><b>{verifiedBossMoment.outcome === 'CURSED' ? 'BOSS RETURNS' : verifiedBossMoment.outcome === 'BLESSED' ? 'RELIC UNLOCKED' : 'BOSS STAYS DOWN'}</b></span>
              </div>
              <strong>{verifiedBossMoment.outcome === 'CURSED'
                ? `You chose ${verifiedBossMoment.direction}. The market ended ${settledDirection}. ${persona.name} rises again at ${game.monsterMaxHp}/${game.monsterMaxHp} HP.`
                : verifiedBossMoment.outcome === 'BLESSED'
                  ? `You chose ${verifiedBossMoment.direction}. The market agreed. ${persona.name} stays down and the relic is yours.`
                  : 'The market was voided. The defeated boss stays down and the relic is still yours.'}</strong>
              {verifiedBossMoment.outcome === 'CURSED' && <small>Your run continues with {game.hp}/{game.maxHp} HP, {game.potions}/5 potions and {game.gold} gold. Used resources remain spent.</small>}
            </section>;
  const journeyFocus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (merchantStage) playCharacterIntro('Quartermaster Kevin');
  }, [merchantStage, playCharacterIntro]);
  useLayoutEffect(() => {
    if (mobileCombat) return;
    // Set the entry position before paint so a late animation frame cannot
    // overwrite the player's first scroll toward the recovery controls.
    window.scrollTo({ top: 0, behavior: 'instant' });
    journeyFocus.current?.focus({ preventScroll: true });
  }, [mobileCombat, run?.phase]);
  const tierNodes = useMemo(() => [1, 2, 3, 4], []);

  useEffect(() => {
    if (!showHome) return;
    homeHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [showHome]);
  const runShareInput = useMemo<RunShareCardInput | null>(() => {
    if (!run || !game || (run.phase !== 'dead' && run.phase !== 'complete')) return null;
    const latestSettlement = run.settlements.at(-1);
    const directionForCard = run.currentAttempt?.direction ?? latestSettlement?.direction;
    if (!directionForCard) return null;
    const completed = run.phase === 'complete';
    const actualOutcome = completed && latestSettlement
      ? latestSettlement.outcome === 'VOID'
        ? 'VOID'
        : latestSettlement.outcome === 'BLESSED'
          ? latestSettlement.direction
          : latestSettlement.direction === 'UP' ? 'DOWN' : 'UP'
      : undefined;
    return {
      mode: 'FULL_RUN',
      result: completed ? latestSettlement?.outcome === 'VOID' ? 'VOID' : 'BLESSED' : 'DEFEATED',
      tier,
      totalTiers: 4,
      reachedRoom: Math.max(1, Math.min(40, game.roomsCleared + (game.monsterHp > 0 ? 1 : 0))),
      totalRooms: 40,
      enemiesDefeated: game.roomsCleared,
      gold: game.gold,
      lockedDirection: directionForCard,
      actualOutcome,
      verifiedOnchain: completed,
      marketId: latestSettlement?.marketId,
    };
  }, [game, run, tier]);

  function trackShare(input: RunShareCardInput, action: ShareAction) {
    if (!shareActionsTracked.current.has(action)) {
      shareActionsTracked.current.add(action);
      emitAnalyticsEvent(shareActionEvent('full_run', action));
    }
    if (!shareEngagedTracked.current) {
      shareEngagedTracked.current = true;
      emitAnalyticsEvent(shareEngagedEvent('full_run'));
    }
  }

  function beginNewRun() {
    setShowHome(false);
    const next: FullRunSession = {
      schema: 'market-dungeon/full-run-session/v2',
      run: createMarketDungeonRun(cryptoRandom),
      market: null,
    };
    setSession(next);
    if (session) {
      setMarketCandidate(null);
      setMarketOdds(null);
      setMarketError(null);
    }
    setNotice('Choose an omen before Room 1. The five-minute market runs while you fight.');
  }

  function continueExpedition() {
    setShowHome(false);
  }

  function apply(action: MarketDungeonAction, market: ActiveLiveMarket | null | undefined = undefined): boolean {
    if (!session) return false;
    const transition = transitionMarketDungeon(session.run, action, cryptoRandom);
    if (!transition.accepted) {
      setNotice(transition.reason);
      return false;
    }
    const keepMarket = market === undefined ? session.market : market;
    setSession({ ...session, run: transition.run, market: keepMarket });
    setNotice(resultMessage(transition));
    return true;
  }

  function gameplay(action: Exclude<GameplayAction, { type: 'start-run' }>) {
    apply({ type: 'gameplay', action });
  }

  function lockActiveOmen() {
    if (!session || session.run.phase !== 'boss-lock-required' || busy) return;
    const lockedAt = Math.floor(Date.now() / 1_000);
    const active = activeFiveMinuteMarket(marketCandidate, lockedAt);
    if (!active) {
      setMarketCandidate(null);
      setMarketOdds(null);
      setMarketRefresh((value) => value + 1);
      setNotice('That five-minute market expired. Fetching the next active market…');
      return;
    }
    const market: ActiveLiveMarket = {
      marketId: active.marketId.toLowerCase(),
      intervalSec: 300,
      question: active.question,
      strikeUsd: Number(active.strikeUsd).toFixed(2),
      tradingStart: Number(active.tradingStart),
      expiry: Number(active.expiry),
      lockedAt,
    };
    const attemptId = `attempt_${Date.now()}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
    const accepted = apply({
      type: 'lock-boss',
      lock: {
        attemptId,
        marketId: market.marketId,
        direction,
        mode: 'live',
        proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
        commitment: null,
      },
    }, market);
    if (accepted) {
      setMarketCandidate(null);
      setMarketOdds(null);
    } else {
      setMarketRefresh((value) => value + 1);
    }
  }

  async function revealBossFate() {
    if (!session?.market || !session.run.currentAttempt || session.run.phase !== 'settlement-pending' || busy || marketRemaining > 0) return;
    setBusy(true);
    setNotice('Reading the finalized Event Contract and reproducing its Somnia proof…');
    try {
      const response = await fetch(`/api/market?marketId=${encodeURIComponent(session.market.marketId)}`, { cache: 'no-store' });
      const body = await response.json() as { market?: Record<string, unknown>; onchainSettlement?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Settlement is not available yet.');
      const value = body.market as SettlementMarket | undefined;
      const active = session.run.currentAttempt;
      if (!value || String(value.marketId).toLowerCase() !== active.marketId) {
        throw new Error('Settlement identity did not match the locked market.');
      }
      if (!isTerminalSettlementMarket(value)) {
        setAwaitingSettlementMarketId(active.marketId);
        setNotice('dreamDEX has not finalized this market yet. Your defeated boss and locked omen remain intact; retry shortly.');
        return;
      }
      const proof = isStrictOnchainSettlementProof(body.onchainSettlement) ? body.onchainSettlement : undefined;
      if (!proof || !directSettlementProofMatchesMarket(proof, value)) throw new Error('The indexed settlement did not match its direct Somnia proof.');
      const rpc = await directSettlementProofRpcOutcome(proof, value);
      if (rpc.status === 'NOT PROVABLE') {
        setNotice('Somnia RPC is temporarily unavailable. No outcome was applied; retry safely.');
        return;
      }
      if (rpc.status !== 'PASS') throw new Error('Independent Somnia RPC reproduction failed.');
      const winning = Number(value.winningOutcome);
      const outcome = value.voided === true ? 'VOID' : winning === (active.direction === 'UP' ? 0 : 1) ? 'BLESSED' : 'CURSED';
      const accepted = apply({
        type: 'settle-boss',
        settlement: {
          attemptId: active.attemptId,
          marketId: active.marketId!,
          direction: active.direction,
          proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
          commitment: null,
          outcome,
        },
      }, null);
      if (accepted) playOutcome(outcome);
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : 'Settlement check failed.'} Your run remains frozen; retry safely.`);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <main className={styles.shell}><div className={styles.loading}>RESTORING EXPEDITION…</div></main>;
  }

  return (
    <main className={`${styles.shell} ${mobileCombat ? styles.mobileCombatActive : ''} ${run && game ? styles.activeExpedition : styles.homeScreen}`}>
      <DesktopNavigation />
      <div className={styles.column}>
        <div className={styles.modeNavigation}><GameModeNav current="expedition" /></div>
        {mobileCombat && game && run && <MobileBattle
          room={room}
          onHome={() => setShowHome(true)}
          location={`T${tier} · ROOM ${room}/40`} loadout={{ gold: game.gold, weapon: game.weaponLevel, armor: game.armorLevel, progress: `T${tier} · R${room}` }}
          mode="FULL EXPEDITION"
          desktopSummary={<LoadoutSummary gold={game.gold} weapon={game.weaponLevel} armor={game.armorLevel} relic={relicSummary} potions={`${game.potions}/5`} />}
          hp={game.hp} maxHp={game.maxHp}
          enemy={{ name: persona.name, image: persona.image, hp: game.monsterHp, maxHp: game.monsterMaxHp, incoming: `${incoming[0]}–${incoming[1]}`, flavor: persona.flavor, isBoss }}
          omen={omenSummary ?? 'OMEN NOT LOCKED'}
          omenDetails={omenDetails}
          omenHint={omenHint}
          gear={gearDetails}
          log={game.log}
          logPreview={monsterRemark}
          firstFightHint={game.roomsCleared === 0 && !run.rematchRequired}
          lastExchange={game.lastPlayerDamage > 0 || game.lastMonsterDamage > 0 ? { dealt: game.lastPlayerDamage, taken: game.lastMonsterDamage, critical: game.lastCritical, rolledDamage: game.lastRolledDamage } : null}
          attack={`${attack[0]}–${attack[1]}`} storm={`${storm[0]}–${storm[1]}`}
          criticalChance={currentCriticalChance(game)}
          potions={game.potions} potionUses={game.combatPotionsUsed} potionLimit={isBoss ? 3 : 2}
          onAttack={() => gameplay({ type: 'attack' })} onStorm={() => gameplay({ type: 'storm' })} onPotion={() => gameplay({ type: 'use-potion' })}
        />}
        {run && game && !mobileCombat && <div className={styles.stageHeader}>
          <PlayerHeader mode="FULL EXPEDITION" onHome={() => setShowHome(true)} summary={<LoadoutSummary gold={game.gold} weapon={game.weaponLevel} armor={game.armorLevel} relic={relicSummary} potions={`${game.potions}/5`} />} hp={game.hp} maxHp={game.maxHp} location={`T${tier} · ROOM ${room}/40`} loadout={{ gold: game.gold, weapon: game.weaponLevel, armor: game.armorLevel, progress: `T${tier} · R${room}` }} potions={game.potions} omen={omenSummary} omenHint={run.currentAttempt ? omenHint : undefined} omenDetails={omenDetails} gear={gearDetails} />
        </div>}
        <header className={styles.header}>
          <p>DELVEWORN · EVENT CONTRACTS EDITION</p>
          <h1 ref={homeHeading} tabIndex={-1}><GameLogo /></h1>
          <strong>DEFEAT THE BOSS · PREDICT THE MARKET · SURVIVE BOTH</strong>
          <div><span /> SOMNIA MAINNET · LIVE 5-MINUTE EVENT CONTRACTS · NO TRANSACTIONS</div>
        </header>

        {!run || !game ? (
          <section className={styles.startCard}>
            <div className={styles.hero}>
              <Image src="/assets/delveworn-tier2-party-hero.webp" alt="Delveworn Tier 2 monsters: zombie, goblin and orc" fill priority sizes="(max-width: 800px) 100vw, (max-width: 1200px) 50vw, 600px" />
            </div>
            <div className={styles.startCopy}>
              <p>THE FULL EXPEDITION · 40 ROOMS · 4 BOSSES</p>
              <h2>Defeat the boss. Predict correctly. Survive both.</h2>
              <span>Choose BTC UP or DOWN, then fight while a real five-minute market runs. A correct omen keeps the defeated boss down. A wrong one brings that same boss back.</span>
              <section className={styles.homeMarket} aria-label="Expedition market">
                {session?.market ? <>
                  <div className={styles.marketReference}>
                    <span>YOUR LOCKED OMEN · BTC {session.run.currentAttempt?.direction}</span>
                    <strong>{formatUsd(session.market.strikeUsd)}</strong>
                    <b>{marketRemaining > 0 ? `MARKET CLOSES IN ${formatTime(marketRemaining)}` : 'MARKET CLOSED'}</b>
                    <small>Opening reference for your saved expedition. You can keep fighting after 00:00.</small>
                  </div>
                  <p className={styles.homeMarketNote}>Your progress is saved. Continue to fight or check the boss result.</p>
                </> : needsMarketCandidate ? <>
                  {marketCandidate && candidateRemaining > 0 ? <>
                    <div className={styles.marketReference}>
                      <span>LIVE BTC 5M · OPENING REFERENCE</span>
                      <strong>{formatUsd(marketCandidate.strikeUsd)}</strong>
                      <b>MARKET CLOSES IN {formatTime(candidateRemaining)}</b>
                      <small>{marketCandidate.question}</small>
                      <small>You can keep fighting after 00:00.</small>
                    </div>
                    <div className={styles.homeOdds}><LiveMarketOdds odds={marketOdds} /></div>
                  </> : <p className={styles.homeMarketNote} role="status">{marketError ? 'Live market temporarily unavailable. Retrying automatically; you can still open the Judge demo below.' : 'Finding the active BTC five-minute market…'}</p>}
                  <p className={styles.homeMarketNote}>Choose and lock your omen on the next screen.</p>
                </> : <p className={styles.homeMarketNote}>Your expedition is saved on this device. Continue where you left off.</p>}
              </section>
            </div>
            <div className={styles.homeActions} data-keyboard-actions>
              <button className={styles.primary} onClick={session ? continueExpedition : beginNewRun}>{session ? 'CONTINUE EXPEDITION' : 'ENTER THE DUNGEON'}</button>
              <KeyboardHint />
              <Link href="/shannon/live-judge">JUDGES: PLAY THE LIVE 1-MINUTE DEMO →</Link>
              {session && <span>Your expedition is saved on this device. The market timer keeps running.</span>}
            </div>
          </section>
        ) : (
          <div ref={journeyFocus} tabIndex={-1} aria-label="Expedition stage" className={`${styles.journey} ${runShareInput ? styles.resultJourney : ''}`}>
            {bossSceneOutcome ? <div className={styles.bossSceneStage}>
              <BossOutcomeScene key={`${verifiedBossMoment?.attemptId ?? run.currentAttempt?.attemptId}-${bossSceneOutcome}`} name={persona.name} image={persona.image} maxHp={game.monsterMaxHp} outcome={bossSceneOutcome} />
              {verifiedBossMoment?.outcome === 'CURSED' && verifiedBossStatus}
            </div> : !mobileCombat && <div className={`${styles.journeyArt} ${merchantStage || closedGate ? styles.merchantArt : ''} ${loot && !merchantStage ? styles.lootArt : ''}`} data-loot={loot ? game.lastLootType : undefined} data-crop={!merchantStage && !closedGate && !loot}>
              <div className={styles.journeyImage}>
                <Image src={closedGate ? '/assets/market-dungeon-closed-gate-v1.png' : merchantStage ? '/characters/merchant-quartermaster-kevin.webp' : loot ? loot.image : persona.image} alt={closedGate ? 'Closed dungeon gate' : merchantStage ? 'Quartermaster Kevin' : loot ? `Loot: ${lootLabel}` : persona.name} fill priority sizes="(max-width: 800px) 1px, 55vw" />
              </div>
            </div>}
            <div className={styles.journeyDetails} data-keyboard-actions data-keyboard-vertical={(run.phase === 'exploring' && game.monsterHp === 0) || run.phase === 'boss-reward' ? 'edges' : undefined}>
            <section className={styles.tiers} aria-label="Tier progress">
              {tierNodes.map((number) => <div key={number} className={number < tier || run.phase === 'complete' ? styles.done : number === tier ? styles.active : ''}><b>{number < tier || run.phase === 'complete' ? '✓' : number}</b><span>TIER {number}</span></div>)}
            </section>

            {game.monsterHp === 0 && game.lastCritical && <CriticalHitResult damage={game.lastRolledDamage ?? game.lastPlayerDamage} />}

            {verifiedBossMoment?.outcome !== 'CURSED' && verifiedBossStatus}

            {run.phase === 'boss-lock-required' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>{run.rematchRequired ? 'CURSED REMATCH' : `TIER ${tier} · OMEN BEFORE COMBAT`}</p>
                <h2>{run.rematchRequired ? 'The boss is back. Lock a fresh omen.' : `Lock your omen before Room ${game.roomsCleared + 1}.`}</h2>
                <span>{run.rematchRequired ? 'Only this boss resets to full HP. Your health, potions, equipment, relic and used revive carry forward.' : 'Clear nine rooms and the boss. Your Bitcoin prediction decides whether that boss stays down.'}</span>

                <div className={styles.marketOverview}>
                  {marketCandidate ? (
                    <div className={styles.marketReference}>
                      <span>LIVE BTC OPENING REFERENCE</span>
                      <strong>{formatUsd(marketCandidate.strikeUsd)}</strong>
                      <b>{candidateRemaining > 0 ? `MARKET CLOSES IN ${formatTime(candidateRemaining)}` : 'MARKET ROLLING OVER'}</b>
                      <small>UP wins at or above the opening reference. DOWN wins below it.</small>
                      <small>You can keep fighting after 00:00.</small>
                    </div>
                  ) : marketError ? (
                    <div className={styles.marketUnavailable}>
                      <b>ACTIVE 5-MINUTE MARKET UNAVAILABLE</b>
                      <span>{marketError}</span>
                      <button onClick={() => { setMarketError(null); setMarketRefresh((value) => value + 1); }}>RETRY MARKET</button>
                      <Link href="/shannon/judge">OPEN THE HISTORICAL JUDGE DEMO INSTEAD →</Link>
                    </div>
                  ) : <div className={styles.marketLoading}>FINDING THE ACTIVE BTC 5-MINUTE MARKET…</div>}
                  {marketCandidate && candidateRemaining > 0 && <LiveMarketOdds odds={marketOdds} direction={direction} />}
                </div>
                <div className={styles.predictions}>
                  <button aria-pressed={direction === 'UP'} className={direction === 'UP' ? styles.upSelected : ''} onClick={() => setDirection('UP')}><b><Gold /> GOLD AWAKENS</b><small>BTC UP</small></button>
                  <button aria-pressed={direction === 'DOWN'} className={direction === 'DOWN' ? styles.downSelected : ''} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN</small></button>
                </div>
                {!run.rematchRequired && <OmenGuide mode="expedition" />}
                <button className={styles.primary} onClick={lockActiveOmen} disabled={busy || !marketCandidate || candidateRemaining <= 0}>{run.rematchRequired ? `LOCK BTC ${direction} · REMATCH BOSS` : `LOCK BTC ${direction} · ENTER TIER ${tier}`}</button>
                <small className={styles.disclosure}>Active dreamDEX BTC 5m market · local direction lock · direct Somnia settlement proof · no wallet, order or transaction</small>
                {run.rematchRequired && <>
                  <RecoverySupplies hp={game.hp} maxHp={game.maxHp} potions={game.potions} />
                  <button className={`${styles.secondary} ${styles.recoveryPotion}`} onClick={() => gameplay({ type: 'use-potion' })} disabled={busy || game.potions === 0 || game.hp >= game.maxHp}>🧪 USE POTION · {game.potions}/5 · {game.potions === 0 ? 'EMPTY' : game.hp >= game.maxHp ? 'FULL HP' : `+${Math.min(25, game.maxHp - game.hp)} HP · NO RETALIATION`}</button>
                </>}
                {game.monsterHp === 0 && !run.rematchRequired && <RelicLoadout game={game} onEquip={(relicId) => gameplay({ type: 'equip-relic', relicId })} />}
              </section>
            ) : run.phase === 'settlement-pending' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>LIVE EVENT CONTRACT · BOSS DOWN</p>
                <h2>{marketRemaining > 0 ? 'Hold the gate until settlement.' : awaitingSettlementMarketId === session?.market?.marketId ? 'Waiting for the market result.' : 'Market closed. Check the result.'}</h2>
                <span>{marketRemaining > 0 ? 'Combat finished before the five-minute market. You wait only for the remaining interval.' : 'The five-minute interval has ended, but finalization may take longer. A result is applied only after independent Somnia verification.'}</span>
                {awaitingSettlementMarketId === session?.market?.marketId && <p role="status">The latest check returned no finalized result. Your defeated boss and locked omen are safe. Wait briefly, then try Reveal Boss Fate again.</p>}
                <div className={styles.commitment}><span>LOCKED OMEN</span><b>BTC {run.currentAttempt?.direction} · {session?.market ? formatUsd(session.market.strikeUsd) : '—'}</b><details><summary>Market reference</summary><code>{run.currentAttempt?.marketId}</code></details></div>
                <RecoverySupplies hp={game.hp} maxHp={game.maxHp} potions={game.potions} />
                <button className={`${styles.secondary} ${styles.recoveryPotion}`} onClick={() => gameplay({ type: 'use-potion' })} disabled={busy || game.potions === 0 || game.hp >= game.maxHp}>🧪 USE POTION · {game.potions}/5 · {game.potions === 0 ? 'EMPTY' : game.hp >= game.maxHp ? 'FULL HP' : `+${Math.min(25, game.maxHp - game.hp)} HP · NO RETALIATION`}</button>
                <button className={styles.primary} onClick={() => void revealBossFate()} disabled={busy || marketRemaining > 0}>{busy ? 'VERIFYING ON SOMNIA…' : marketRemaining > 0 ? `REVEAL IN ${formatTime(marketRemaining)}` : 'REVEAL BOSS FATE'}</button>
              </section>
            ) : run.phase === 'boss-reward' ? (
              <RelicReward game={game} onClaim={(equip) => gameplay({ type: 'claim-relic', equip })} />
            ) : run.phase === 'dead' || run.phase === 'complete' ? (
              <section className={`${styles.panel} ${run.phase === 'complete' ? styles.victory : styles.death}`}>
                <p>{run.phase === 'complete' ? 'EXPEDITION COMPLETE' : 'EXPEDITION ENDED'}</p>
                <h2>{run.phase === 'complete' ? 'Every boss stayed down.' : `You cleared ${game.roomsCleared} of 40 rooms.`}</h2>
                <span>New expeditions always restart at 100 HP, 3 potions, 0 gold, weapon 0, armor 0 and no relic.</span>
                <button className={styles.primary} onClick={beginNewRun}>BEGIN NEW EXPEDITION</button>
              </section>
            ) : (
              <section className={`${styles.panel} ${isBoss ? styles.bossPanel : ''}`}>
                {game.monsterHp > 0 ? (
                  <>
                    <div className={styles.encounterArt}>
                      <Image src={persona.image} alt={persona.name} fill priority sizes="(max-width: 620px) 100vw, 560px" />
                      <div className={styles.enemyArtHud} data-boss={isBoss} aria-label={`Enemy health ${game.monsterHp} of ${game.monsterMaxHp}`}>
                        <span>ENEMY HP</span><b>{game.monsterHp}/{game.monsterMaxHp}</b>
                        <i><em style={{ width: `${enemyPercent}%` }} /></i>
                      </div>
                    </div>
                    <div className={styles.encounterCopy}>
                      <p>{isBoss ? `${persona.rank} · BOSS · ROOM ${room}` : `ROOM ${room} · ${persona.species.toUpperCase()} · ${persona.chance}`}</p>
                      <h2>{persona.name}</h2>
                      <blockquote>{persona.flavor}</blockquote>
                      <p className={styles.monsterRemark}>{monsterRemark}</p>
                      <div className={styles.ranges}><div><span>INCOMING</span><b>{incoming[0]}–{incoming[1]}</b></div><div><span>ROOM</span><b>{room}/40</b></div></div>
                    </div>
                  </>
                ) : (
                  <div className={styles.cleared} data-loot={Boolean(loot)}>
                    <p>ROOM {game.roomsCleared} CLEARED</p>
                    <h2>{loot ? `Loot secured: ${lootLabel}` : 'The path ahead is open.'}</h2>
                    {loot && <div className={styles.lootInline} data-merchant={merchantStage}>
                      <Image src={loot.image} alt={`Loot: ${lootLabel}`} width={160} height={160} sizes="(max-width: 800px) 64px, 80px" />
                    </div>}
                    <blockquote>{game.log.find((entry) => entry.startsWith('☠️'))?.replace(/^☠️ /, '')}</blockquote>
                    {merchant && <Merchant game={game} onBuy={(item) => gameplay({ type: 'buy', item })} />}
                    {!merchant && <RecoverySupplies hp={game.hp} maxHp={game.maxHp} potions={game.potions} />}
                    <button className={`${styles.secondary} ${styles.recoveryPotion}`} onClick={() => gameplay({ type: 'use-potion' })} disabled={game.potions === 0 || game.hp >= game.maxHp}>USE OWN POTION SAFELY · {game.potions}/5</button>
                    <RelicLoadout game={game} onEquip={(relicId) => gameplay({ type: 'equip-relic', relicId })} />
                    <button className={styles.primary} onClick={() => gameplay({ type: 'enter-next-room' })}>ENTER ROOM {game.roomsCleared + 1}</button>
                  </div>
                )}
              </section>
            )}

            {(run.phase === 'exploring' || run.phase === 'boss-combat') && game.monsterHp > 0 && (
              <section className={styles.actions} aria-label="Combat actions">
                <button data-game-audio="storm" className={styles.stormAction} onClick={() => gameplay({ type: 'storm' })}><b>⚡ STORM</b><small>DAMAGE {storm[0]}–{storm[1]} · high variance</small></button>
                <button data-game-audio="potion" className={styles.potionAction} onClick={() => gameplay({ type: 'use-potion' })} disabled={game.potions === 0 || game.hp >= game.maxHp || game.combatPotionsUsed >= (isBoss ? 3 : 2)}><b>🧪 POTION</b><small>HEAL 25 · {game.combatPotionsUsed}/{isBoss ? 3 : 2} used</small></button>
                <button data-game-audio="attack" className={styles.attackAction} onClick={() => gameplay({ type: 'attack' })}><b>⚔️ ATTACK</b><small>DAMAGE {attack[0]}–{attack[1]} · reliable</small></button>
              </section>
            )}

            {runShareInput && <RunSharePanel
              input={runShareInput}
              challengeUrl={MARKET_DUNGEON_CHALLENGE_URL}
              onAction={(action) => trackShare(runShareInput, action)}
              onChallenge={() => {}}
            />}

            {(run.phase === 'complete' || run.phase === 'dead') && <section className={styles.dreamdexContinue} aria-label="Continue on dreamDEX">
              <b>THE DUNGEON ENDS. THE MARKET DOESN’T.</b>
              <p>Explore the current BTC 5-minute Event Contract on dreamDEX.</p>
              <a className={styles.dreamdexLink} href={dreamDexBtcEventContractUrl(300)} target="_blank" rel="noopener noreferrer">CONTINUE ON DREAMDEX ↗</a>
              <small>Opens dreamDEX in a new tab. Wallet connection and trading take place there.</small>
            </section>}

            <section className={styles.log} aria-live="polite">
              <div><span>DUNGEON LOG</span><b>{notice}</b></div>
              {(run.phase === 'boss-lock-required' && game.roomsCleared === 0 && !run.rematchRequired ? [] : game.log.slice(0, 4))
                .map((entry, index) => <p key={`${entry}-${index}`}><GameText>{entry}</GameText></p>)}
            </section>
            </div>
          </div>
        )}

        <footer className={styles.footer}>
          <span>FULL GAME · DELVEWORN RULES · ACTIVE 5M DREAMDEX SETTLEMENT</span>
          <p>No wallet · no approval · no order · no transaction</p>
          <nav><a href={dreamDexBtcEventContractUrl(300)} target="_blank" rel="noopener noreferrer">CONTINUE ON DREAMDEX ↗</a><Link href="/shannon/live-judge">LIVE JUDGE DEMO</Link><Link href="/credits">PRIVACY · CREDITS</Link></nav>
        </footer>
      </div>
    </main>
  );
}

function RelicReviveStatus({ game, relicId }: { game: FullRunSession['run']['game']; relicId: number }) {
  if (relicId !== 8 && relicId !== 14) return null;
  return <small className={styles.reviveStatus}>{game.relicReviveUsed
    ? 'REVIVE SPENT · No further revival this expedition.'
    : 'REVIVE READY · One revival this expedition.'}</small>;
}

function RelicLoadout({ game, onEquip }: { game: FullRunSession['run']['game']; onEquip: (id: number) => void }) {
  if (!game.ownedRelics.length) return null;
  const active = getRelicDefinition(game.equippedRelic);
  return <details className={styles.collection}>
    <summary><b>CHANGE / UNEQUIP RELIC</b><span>Active: {active.name} · {game.ownedRelics.length} owned</span></summary>
    <div role="group" aria-label="Choose active relic">{[0, ...game.ownedRelics].map((id) => {
      const relic = getRelicDefinition(id);
      return <button type="button" key={id} aria-pressed={game.equippedRelic === id} className={game.equippedRelic === id ? styles.equipped : ''} onClick={() => onEquip(id)}>
        {id === 0 ? <i className={styles.noRelic}>◇</i> : <Image src={relic.imageSrc!} alt="" width={316} height={270} />}
        <span><b>{id === 0 ? 'UNEQUIP ACTIVE RELIC' : relic.name}</b><small>{game.equippedRelic === id ? 'ACTIVE · ' : ''}{id === 0 ? 'No relic equipped' : relic.rarity}</small><small>{relic.effect} {relic.tradeoff}</small><RelicReviveStatus game={game} relicId={id} /></span>
      </button>;
    })}</div>
  </details>;
}

function Merchant({ game, onBuy }: {
  game: NonNullable<FullRunSession['run']['game']>;
  onBuy: (item: 'supply-bandage' | 'supply-potion' | 'camp-rest' | 'camp-potion' | 'camp-weapon' | 'camp-armor') => void;
}) {
  const visit = getMerchantVisit(game);
  if (!visit) return null;
  const supply = supplyPrices(game);
  const camp = campPrices(game);
  return (
    <div className={styles.merchant}>
      <div><span>{visit === 'camp' ? 'CAMP BEFORE THE BOSS' : 'SUPPLY STOP'}</span><b>Quartermaster Kevin</b><strong><Gold /> {game.gold}</strong></div>
      <figure className={styles.mobileMerchantArt}><Image src="/characters/merchant-quartermaster-kevin.webp" alt="Quartermaster Kevin" fill sizes="(max-width: 800px) 96px, 1px" /></figure>
      <section className={styles.merchantStats} aria-label="Supplies at Kevin">
        <dl>
          <div><dt>HEALTH</dt><dd>{game.hp}/{game.maxHp}</dd></div>
          <div><dt>POTIONS</dt><dd>{game.potions}/5</dd></div>
          <div><dt>GOLD</dt><dd><Gold /> {game.gold}</dd></div>
          <div><dt>WEAPON</dt><dd>{game.weaponLevel}</dd></div>
          <div><dt>ARMOR</dt><dd>{game.armorLevel}</dd></div>
        </dl>
      </section>
      <div className={styles.shop}>
        {visit === 'supply' ? <>
          <button onClick={() => onBuy('supply-bandage')} disabled={game.gold < supply.bandage || game.supplyBandageUsed || game.hp >= game.maxHp}>BANDAGE +25 <b>{supply.bandage}G</b></button>
          <button onClick={() => onBuy('supply-potion')} disabled={game.gold < supply.potion || game.supplyPotionsBought >= 2 || game.potions >= 5}>POTION <b>{supply.potion}G</b></button>
        </> : <>
          <button onClick={() => onBuy('camp-rest')} disabled={game.gold < camp.rest || game.campRestUsed || game.hp >= game.maxHp}>REST +30 <b>{camp.rest}G</b></button>
          <button onClick={() => onBuy('camp-potion')} disabled={game.gold < camp.potion || game.campPotionsBought >= 2 || game.potions >= 5}>POTION <b>{camp.potion}G</b></button>
          <button onClick={() => onBuy('camp-weapon')} disabled={game.gold < camp.weapon}>WEAPON +1 <b>{camp.weapon}G</b></button>
          <button onClick={() => onBuy('camp-armor')} disabled={game.gold < camp.armor}>ARMOR +1 <b>{camp.armor}G</b></button>
        </>}
      </div>
    </div>
  );
}

function RelicReward({ game, onClaim }: {
  game: NonNullable<FullRunSession['run']['game']>;
  onClaim: (equip: boolean) => void;
}) {
  const relic = getRelicDefinition(game.relicOfferId);
  return (
    <section className={`${styles.panel} ${styles.relicReward}`} aria-label="Relic reward">
      <p>BOSS RELIC · {relic.rarity.toUpperCase()}</p>
      <div className={styles.relicImage}><Image src={relic.imageSrc!} alt={relic.name} width={316} height={270} sizes="(max-width: 800px) 160px, 190px" priority /></div>
      <h2>{relic.name}</h2>
      <span>{relic.effect}</span><small>{relic.tradeoff}</small><RelicReviveStatus game={game} relicId={relic.id} />
      {game.equippedRelic !== 0 && <div className={styles.relicComparison}>
        <b>CURRENT RELIC · {getRelicDefinition(game.equippedRelic).name}</b>
        <span>{getRelicDefinition(game.equippedRelic).effect}</span>
        <small>{getRelicDefinition(game.equippedRelic).tradeoff}</small><RelicReviveStatus game={game} relicId={game.equippedRelic} />
      </div>}
      <div className={styles.rewardActions}>
        <button onClick={() => onClaim(true)}>CLAIM & EQUIP</button>
        <button onClick={() => onClaim(false)}>{game.equippedRelic === 0 ? 'CLAIM WITHOUT EQUIPPING' : 'KEEP CURRENT RELIC'}</button>
      </div>
    </section>
  );
}
