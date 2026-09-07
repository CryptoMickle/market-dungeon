'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

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

function Gold() {
  return <span className={styles.gold} aria-hidden="true" />;
}

export default function FullExpedition() {
  const [session, setSession] = useState<FullRunSession | null>(null);
  const [ready, setReady] = useState(false);
  const [direction, setDirection] = useState<Direction>('UP');
  const [busy, setBusy] = useState(false);
  const [marketCandidate, setMarketCandidate] = useState<ActiveMarketResponse | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [notice, setNotice] = useState('Ready for a fresh expedition.');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const shareActionsTracked = useRef(new Set<ShareAction>());
  const shareEngagedTracked = useRef(false);

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
    if (!ready || session?.run.phase !== 'boss-lock-required' || session.market) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/market?interval=300', { cache: 'no-store' });
        const body = await response.json() as { market?: unknown; error?: string };
        const market = activeFiveMinuteMarket(body.market, Math.floor(Date.now() / 1_000));
        if (!response.ok || !market) throw new Error(body.error ?? 'No usable active BTC 5-minute market was returned.');
        if (!cancelled) {
          setMarketCandidate(market);
          setMarketError(null);
        }
      } catch (error) {
        if (!cancelled) setMarketError(error instanceof Error ? error.message : 'Active BTC market unavailable.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [marketRefresh, ready, session?.market, session?.run.phase]);

  useEffect(() => {
    if (!marketCandidate || session?.run.phase !== 'boss-lock-required') return;
    const delay = Math.max(0, Number(marketCandidate.expiry) * 1_000 - Date.now() + 250);
    const timer = window.setTimeout(() => {
      setMarketCandidate(null);
      setMarketRefresh((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [marketCandidate, session?.run.phase]);

  const run = session?.run ?? null;
  const game = run?.game ?? null;
  const room = game ? Math.min(40, game.roomsCleared + (game.monsterHp > 0 ? 1 : 0)) : 0;
  const tier = Math.min(4, Math.max(1, Math.ceil(Math.max(1, room) / 10)));
  const isBoss = game?.monsterType === 3 && game.monsterMaxHp > 0;
  const merchant = game ? getMerchantVisit(game) : null;
  const marketRemaining = session?.market ? Math.max(0, session.market.expiry - now) : 0;
  const candidateRemaining = marketCandidate ? Math.max(0, Number(marketCandidate.expiry) - now) : 0;
  const activeRelic = game ? getRelicDefinition(game.equippedRelic) : RELIC_CATALOG[0];
  const persona = game ? getDelvewornPersona(game.monsterType, Math.max(1, room)) : getDelvewornPersona(3, 10);
  const attack = game ? attackRange(game) : [0, 0];
  const storm = game ? stormRange(game) : [0, 0];
  const incoming = game ? incomingRange(game) : [0, 0];
  const hpPercent = game ? Math.max(0, Math.min(100, game.hp / game.maxHp * 100)) : 100;
  const enemyPercent = game?.monsterMaxHp ? Math.max(0, Math.min(100, game.monsterHp / game.monsterMaxHp * 100)) : 0;
  const tierNodes = useMemo(() => [1, 2, 3, 4], []);
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
    const next: FullRunSession = {
      schema: 'market-dungeon/full-run-session/v2',
      run: createMarketDungeonRun(cryptoRandom),
      market: null,
    };
    setSession(next);
    setMarketCandidate(null);
    setNotice('Choose an omen before Room 1. The five-minute market runs while you fight.');
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
        setNotice('dreamDEX has not finalized this market yet. Your defeated boss and run remain frozen; retry shortly.');
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
      apply({
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
    <main className={styles.shell}>
      <div className={styles.column}>
        <header className={styles.header}>
          <p>DELVEWORN · EVENT CONTRACTS EDITION</p>
          <h1>MARKET DUNGEON</h1>
          <strong>DEFEAT THE BOSS · PREDICT THE MARKET · SURVIVE BOTH</strong>
          <div><span /> SOMNIA MAINNET · LIVE 5-MINUTE EVENT CONTRACTS · NO TRANSACTIONS</div>
        </header>

        {!run || !game ? (
          <section className={styles.startCard}>
            <div className={styles.hero}>
              <Image src="/assets/market-dungeon-party-hero.webp" alt="Delveworn party facing a dungeon boss" fill priority sizes="(max-width: 620px) 100vw, 560px" />
            </div>
            <div className={styles.startCopy}>
              <p>THE FULL EXPEDITION</p>
              <h2>Forty rooms. Four bosses. One market curse at a time.</h2>
              <span>Original Delveworn combat, tier personas, loot, camps and all 15 relics. Lock BTC UP or DOWN before each tier; fight while the five-minute market runs. A wrong omen resurrects only that tier boss.</span>
              <button onClick={beginNewRun}>ENTER THE DUNGEON</button>
              <Link href="/judge">JUDGES: OPEN THE 2-MINUTE PROOF WALKTHROUGH →</Link>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.tiers} aria-label="Tier progress">
              {tierNodes.map((number) => <div key={number} className={number < tier || run.phase === 'complete' ? styles.done : number === tier ? styles.active : ''}><b>{number < tier || run.phase === 'complete' ? '✓' : number}</b><span>TIER {number}</span></div>)}
            </section>

            <section className={styles.hud}>
              <div><span>HEALTH</span><strong>❤️ {game.hp}/{game.maxHp}</strong><i><b style={{ width: `${hpPercent}%` }} /></i></div>
              <div><span>POTIONS</span><strong>🧪 {game.potions}/5</strong></div>
              <div><span>GOLD</span><strong><Gold /> {game.gold}</strong></div>
              <div><span>LOADOUT</span><strong>⚔️ {game.weaponLevel} · 🛡️ {game.armorLevel}</strong></div>
              <div><span>RELIC</span><strong>{activeRelic.id ? `◆ ${activeRelic.name}` : '— NONE'}</strong></div>
              <div><span>EXPEDITION</span><strong>T{tier} · {game.roomsCleared}/40</strong></div>
            </section>

            {session?.market && run.currentAttempt && (
              <section className={styles.omenStrip}>
                <div><span>LOCKED TIER OMEN</span><strong>{run.currentAttempt.direction === 'UP' ? '🪙 GOLD AWAKENS · BTC UP' : '🌑 SHADOWS RISE · BTC DOWN'}</strong></div>
                <div><span>OPENING REFERENCE</span><strong>{formatUsd(session.market.strikeUsd)}</strong></div>
                <div><span>SETTLEMENT</span><strong>{marketRemaining > 0 ? formatTime(marketRemaining) : 'READY'}</strong></div>
              </section>
            )}

            {run.phase === 'boss-lock-required' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>{run.rematchRequired ? 'CURSED REMATCH' : `TIER ${tier} · OMEN BEFORE COMBAT`}</p>
                <h2>{run.rematchRequired ? 'The boss is back. Lock a fresh omen.' : `Lock your omen before Room ${game.roomsCleared + 1}.`}</h2>
                <span>{run.rematchRequired ? 'Only this boss resets to full HP. Your health, potions, equipment, relic and used revive carry forward.' : 'The active five-minute Event Contract runs while you fight the tier. Reach the boss before settlement and you wait only for the time left.'}</span>
                {marketCandidate ? (
                  <div className={styles.marketReference}>
                    <span>LIVE BTC OPENING REFERENCE</span>
                    <strong>{formatUsd(marketCandidate.strikeUsd)}</strong>
                    <b>{candidateRemaining > 0 ? `${formatTime(candidateRemaining)} REMAINING` : 'MARKET ROLLING OVER'}</b>
                    <small>{marketCandidate.question}</small>
                  </div>
                ) : marketError ? (
                  <div className={styles.marketUnavailable}>
                    <b>ACTIVE 5-MINUTE MARKET UNAVAILABLE</b>
                    <span>{marketError}</span>
                    <button onClick={() => { setMarketError(null); setMarketRefresh((value) => value + 1); }}>RETRY MARKET</button>
                    <Link href="/judge">OPEN THE HISTORICAL JUDGE DEMO INSTEAD →</Link>
                  </div>
                ) : <div className={styles.marketLoading}>FINDING THE ACTIVE BTC 5-MINUTE MARKET…</div>}
                <div className={styles.predictions}>
                  <button className={direction === 'UP' ? styles.upSelected : ''} onClick={() => setDirection('UP')}><b>🪙 GOLD AWAKENS</b><small>BTC UP</small></button>
                  <button className={direction === 'DOWN' ? styles.downSelected : ''} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN</small></button>
                </div>
                <button className={styles.primary} onClick={lockActiveOmen} disabled={busy || !marketCandidate || candidateRemaining <= 0}>{run.rematchRequired ? `LOCK BTC ${direction} · REMATCH BOSS` : `LOCK BTC ${direction} · ENTER TIER ${tier}`}</button>
                <small className={styles.disclosure}>Active dreamDEX BTC 5m market · local direction lock · direct Somnia settlement proof · no wallet, order or transaction</small>
              </section>
            ) : run.phase === 'settlement-pending' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>LIVE EVENT CONTRACT · BOSS DOWN</p>
                <h2>{marketRemaining > 0 ? 'Hold the gate until settlement.' : 'The market is ready to verify.'}</h2>
                <span>{marketRemaining > 0 ? 'Combat finished before the five-minute market. You wait only for the remaining interval.' : 'The browser will reproduce the finalized dreamDEX result directly against Somnia before applying it.'}</span>
                <div className={styles.commitment}><span>LOCKED OMEN</span><b>BTC {run.currentAttempt?.direction} · {session?.market ? formatUsd(session.market.strikeUsd) : '—'}</b><code>{run.currentAttempt?.marketId}</code></div>
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
                    <div className={styles.encounterArt}><Image src={persona.image} alt={persona.name} fill priority sizes="(max-width: 620px) 100vw, 560px" /></div>
                    <div className={styles.encounterCopy}>
                      <p>{isBoss ? `${persona.rank} · BOSS · ROOM ${room}` : `ROOM ${room} · ${persona.species.toUpperCase()} · ${persona.chance}`}</p>
                      <h2>{persona.name}</h2>
                      <blockquote>{isBoss ? bossDialogue(room) : `“${persona.flavor}”`}</blockquote>
                      <div className={styles.enemyBar}><span>ENEMY HP</span><b>{game.monsterHp}/{game.monsterMaxHp}</b><i><em style={{ width: `${enemyPercent}%` }} /></i></div>
                      <div className={styles.ranges}><div><span>INCOMING</span><b>{incoming[0]}–{incoming[1]}</b></div><div><span>ROOM</span><b>{room}/40</b></div></div>
                    </div>
                  </>
                ) : (
                  <div className={styles.cleared}>
                    <p>ROOM {game.roomsCleared} CLEARED</p>
                    <h2>{game.lastLootType ? `Loot secured: ${['', 'Potion', `${game.lastLootAmount} bonus gold`, 'Weapon +1', 'Armor +1'][game.lastLootType]}` : 'The path ahead is open.'}</h2>
                    {merchant && <Merchant game={game} onBuy={(item) => gameplay({ type: 'buy', item })} />}
                    <button className={styles.secondary} onClick={() => gameplay({ type: 'use-potion' })} disabled={game.potions === 0 || game.hp >= game.maxHp}>USE OWN POTION SAFELY · {game.potions}/5</button>
                    <button className={styles.primary} onClick={() => gameplay({ type: 'enter-next-room' })}>ENTER ROOM {game.roomsCleared + 1}</button>
                  </div>
                )}
              </section>
            )}

            {(run.phase === 'exploring' || run.phase === 'boss-combat') && game.monsterHp > 0 && (
              <section className={styles.actions} aria-label="Combat actions">
                <button className={styles.stormAction} onClick={() => gameplay({ type: 'storm' })}><b>⚡ STORM</b><small>DAMAGE {storm[0]}–{storm[1]} · high variance</small></button>
                <button className={styles.potionAction} onClick={() => gameplay({ type: 'use-potion' })} disabled={game.potions === 0 || game.hp >= game.maxHp || game.combatPotionsUsed >= (isBoss ? 3 : 2)}><b>🧪 POTION</b><small>HEAL 25 · {game.combatPotionsUsed}/{isBoss ? 3 : 2} used</small></button>
                <button className={styles.attackAction} onClick={() => gameplay({ type: 'attack' })}><b>⚔️ ATTACK</b><small>DAMAGE {attack[0]}–{attack[1]} · reliable</small></button>
              </section>
            )}

            {game.ownedRelics.length > 0 && game.monsterHp === 0 && run.phase !== 'settlement-pending' && (
              <section className={styles.collection}>
                <p>RELIC COLLECTION · ONE ACTIVE</p>
                <div>{[0, ...game.ownedRelics].map((id) => {
                  const relic = getRelicDefinition(id);
                  return <button key={id} className={game.equippedRelic === id ? styles.equipped : ''} onClick={() => gameplay({ type: 'equip-relic', relicId: id })}>{id === 0 ? <i className={styles.noRelic}>◇</i> : <Image src={relic.imageSrc!} alt="" width={316} height={270} />}<span><b>{id === 0 ? 'UNEQUIP ACTIVE RELIC' : relic.name}</b><small>{id === 0 ? 'Return to no relic' : `${game.relicCounts[id]} owned · ${relic.rarity}`}</small></span></button>;
                })}</div>
              </section>
            )}

            {runShareInput && <RunSharePanel
              input={runShareInput}
              challengeUrl={MARKET_DUNGEON_CHALLENGE_URL}
              onAction={(action) => trackShare(runShareInput, action)}
              onChallenge={() => {}}
            />}

            <section className={styles.log} aria-live="polite">
              <div><span>DUNGEON LOG</span><b>{notice}</b></div>
              {(run.phase === 'boss-lock-required' && game.roomsCleared === 0 && !run.rematchRequired ? [] : game.log.slice(0, 4))
                .map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
            </section>
          </>
        )}

        <footer className={styles.footer}>
          <span>FULL GAME · DELVEWORN RULES · ACTIVE 5M DREAMDEX SETTLEMENT</span>
          <p>No wallet · no approval · no order · no transaction</p>
          <nav><Link href="/judge">JUDGE PROOF WALKTHROUGH</Link><Link href="/verify">VERIFY A PROOF</Link><Link href="/credits">PRIVACY · CREDITS</Link></nav>
        </footer>
      </div>
    </main>
  );
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
    <section className={`${styles.panel} ${styles.relicReward}`}>
      <p>BOSS RELIC · {relic.rarity.toUpperCase()}</p>
      <div className={styles.relicImage}><Image src={relic.imageSrc!} alt={relic.name} width={316} height={270} sizes="160px" /></div>
      <h2>{relic.name}</h2>
      <span>{relic.effect}</span><small>{relic.tradeoff}</small>
      <div className={styles.rewardActions}><button onClick={() => onClaim(true)}>CLAIM & EQUIP</button><button onClick={() => onClaim(false)}>KEEP CURRENT RELIC</button></div>
    </section>
  );
}
