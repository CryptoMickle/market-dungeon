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
  FULL_RUN_STORAGE_KEY,
  parseFullRunSession,
  serializeFullRunSession,
  type ActiveHistoricalReplay,
  type FullRunSession,
} from './gameplay/full-run-storage.ts';
import { getRelicDefinition, RELIC_CATALOG } from './gameplay/relics.ts';
import { RunSharePanel } from './run-share-panel.tsx';
import {
  MARKET_DUNGEON_CHALLENGE_URL,
  type RunShareCardInput,
} from './share-run-card.ts';
import styles from './full-expedition.module.css';

const MONSTER_IMAGES = [
  '/monsters/zombie-1-grave-belle.webp',
  '/monsters/goblin-1-gary.webp',
  '/monsters/orc-1-thud.webp',
  '/monsters/boss-1-dungeon-lord.webp',
] as const;

type ReplayStart = {
  seal: string;
  commitment: string;
  lockedDirection: Direction;
  revealAfter: number;
  expiresAt: number;
};

function validReplayStart(value: unknown, direction: Direction): value is ReplayStart {
  if (!value || typeof value !== 'object') return false;
  const replay = value as Partial<ReplayStart>;
  return typeof replay.seal === 'string'
    && /^v2\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43,4000}\.[A-Za-z0-9_-]{22}$/.test(replay.seal)
    && typeof replay.commitment === 'string' && /^0x[0-9a-f]{64}$/i.test(replay.commitment)
    && replay.lockedDirection === direction
    && Number.isSafeInteger(replay.revealAfter)
    && Number.isSafeInteger(replay.expiresAt)
    && Number(replay.revealAfter) < Number(replay.expiresAt);
}

function resultMessage(transition: MarketDungeonTransition): string {
  if (!transition.accepted) return transition.reason;
  if (transition.run.phase === 'settlement-pending') return 'Boss defeated. The sealed Event Contract is ready to verify.';
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

  const run = session?.run ?? null;
  const game = run?.game ?? null;
  const room = game ? Math.min(40, game.roomsCleared + (game.monsterHp > 0 ? 1 : 0)) : 0;
  const tier = Math.min(4, Math.max(1, Math.ceil(Math.max(1, room) / 10)));
  const isBoss = game?.monsterType === 3 && game.monsterMaxHp > 0;
  const merchant = game ? getMerchantVisit(game) : null;
  const revealRemaining = session?.replay ? Math.max(0, session.replay.revealAfter - now) : 0;
  const activeRelic = game ? getRelicDefinition(game.equippedRelic) : RELIC_CATALOG[0];
  const monsterImage = game ? MONSTER_IMAGES[game.monsterType] : MONSTER_IMAGES[3];
  const monsterName = game ? ['Grave Belle', 'Gary', 'Thud', `Tier ${tier} Dungeon Lord`][game.monsterType] : 'Dungeon Lord';
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
      schema: 'market-dungeon/full-run-session/v1',
      run: createMarketDungeonRun(cryptoRandom),
      replay: null,
    };
    setSession(next);
    setNotice('Room 1 opens. Survive forty rooms and four sealed boss fates.');
  }

  function apply(action: MarketDungeonAction, replay: ActiveHistoricalReplay | null | undefined = undefined) {
    if (!session) return;
    const transition = transitionMarketDungeon(session.run, action, cryptoRandom);
    if (!transition.accepted) {
      setNotice(transition.reason);
      return;
    }
    const keepReplay = replay === undefined ? session.replay : replay;
    setSession({ ...session, run: transition.run, replay: transition.run.phase === 'dead' ? null : keepReplay });
    setNotice(resultMessage(transition));
  }

  function gameplay(action: Exclude<GameplayAction, { type: 'start-run' }>) {
    apply({ type: 'gameplay', action });
  }

  async function lockHistoricalBoss() {
    if (!session || session.run.phase !== 'boss-lock-required' || busy) return;
    setBusy(true);
    setNotice('Selecting and sealing a finalized Event Contract…');
    try {
      const response = await fetch('/api/full-run/replay/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction, excludeMarketIds: session.run.usedMarketIds }),
      });
      const body = await response.json() as { replay?: unknown; error?: string; retryAfter?: number };
      if (!response.ok || !validReplayStart(body.replay, direction)) {
        throw new Error(body.error ?? 'The sealed replay response was invalid.');
      }
      const replay = body.replay;
      const activeReplay = { seal: replay.seal, revealAfter: replay.revealAfter, expiresAt: replay.expiresAt };
      const attemptId = `attempt_${Date.now()}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
      apply({
        type: 'lock-boss',
        lock: {
          attemptId,
          marketId: null,
          direction,
          mode: 'historical',
          proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
          commitment: replay.commitment.toLowerCase(),
        },
      }, activeReplay);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No replay was locked. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revealBossFate() {
    if (!session?.replay || !session.run.currentAttempt || session.run.phase !== 'settlement-pending' || busy || revealRemaining > 0) return;
    setBusy(true);
    setNotice('Verifying the sealed Event Contract against Somnia…');
    try {
      const response = await fetch('/api/full-run/replay/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seal: session.replay.seal }),
      });
      const body = await response.json() as { settlement?: Record<string, unknown>; error?: string; retryAfter?: number };
      if (!response.ok) throw new Error(body.error ?? 'Settlement is not verifiable yet.');
      const value = body.settlement;
      const active = session.run.currentAttempt;
      if (!value
        || value.proofVersion !== FULL_RUN_MARKET_PROOF_VERSION
        || value.commitment !== active.commitment
        || value.direction !== active.direction
        || typeof value.marketId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value.marketId)
        || !['BLESSED', 'CURSED', 'VOID'].includes(String(value.outcome))) {
        throw new Error('Settlement binding did not match the locked attempt.');
      }
      apply({
        type: 'settle-boss',
        settlement: {
          attemptId: active.attemptId,
          marketId: value.marketId.toLowerCase(),
          direction: active.direction,
          proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
          commitment: active.commitment,
          outcome: value.outcome as 'BLESSED' | 'CURSED' | 'VOID',
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
          <div><span /> SOMNIA MAINNET · VERIFIED HISTORICAL EVENT CONTRACTS · NO TRANSACTIONS</div>
        </header>

        {!run || !game ? (
          <section className={styles.startCard}>
            <div className={styles.hero}>
              <Image src="/assets/market-dungeon-party-hero.webp" alt="Delveworn party facing a dungeon boss" fill priority sizes="(max-width: 620px) 100vw, 560px" />
            </div>
            <div className={styles.startCopy}>
              <p>THE FULL EXPEDITION</p>
              <h2>Forty rooms. Four bosses. One market curse at a time.</h2>
              <span>Original Delveworn combat, loot, camps and all 15 relics are restored. Choose BTC UP or DOWN before each boss; a wrong finalized outcome resurrects that boss at full strength.</span>
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

            {run.phase === 'boss-lock-required' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>{run.rematchRequired ? 'CURSED REMATCH' : `BOSS GATE · TIER ${tier}`}</p>
                <h2>{run.rematchRequired ? 'The boss has returned at full HP.' : 'Lock your omen before entering.'}</h2>
                <span>{run.rematchRequired ? 'Your HP, potions, equipment, relic and used revive carry forward. Camp does not reopen.' : 'A recently finalized Event Contract is selected after your choice and remains hidden until the boss falls.'}</span>
                {!run.rematchRequired && merchant === 'camp' && <Merchant game={game} onBuy={(item) => gameplay({ type: 'buy', item })} />}
                <div className={styles.predictions}>
                  <button className={direction === 'UP' ? styles.upSelected : ''} onClick={() => setDirection('UP')}><b>🪙 GOLD AWAKENS</b><small>BTC UP</small></button>
                  <button className={direction === 'DOWN' ? styles.downSelected : ''} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN</small></button>
                </div>
                <button className={styles.primary} onClick={() => void lockHistoricalBoss()} disabled={busy}>{busy ? 'SEALING EVENT CONTRACT…' : `LOCK BTC ${direction} · OPEN BOSS GATE`}</button>
                <small className={styles.disclosure}>Historical finalized market · identity and outcome sealed · no wallet, order or transaction</small>
              </section>
            ) : run.phase === 'settlement-pending' ? (
              <section className={`${styles.panel} ${styles.oraclePanel}`}>
                <p>FINALIZED ONCHAIN REPLAY</p>
                <h2>Boss defeated. Fate remains sealed.</h2>
                <span>Your combat is complete. This check proves only the selected historical Event Contract settlement; it does not mislabel the full run as Judge-v1 combat proof.</span>
                <div className={styles.commitment}><span>LOCKED OMEN</span><b>BTC {run.currentAttempt?.direction}</b><code>{run.currentAttempt?.commitment}</code></div>
                <button className={styles.primary} onClick={() => void revealBossFate()} disabled={busy || revealRemaining > 0}>{busy ? 'VERIFYING ON SOMNIA…' : revealRemaining > 0 ? `REVEAL IN ${revealRemaining}S` : 'REVEAL BOSS FATE'}</button>
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
                    <div className={styles.encounterArt}><Image src={monsterImage} alt={monsterName} fill priority sizes="(max-width: 620px) 100vw, 560px" /></div>
                    <div className={styles.encounterCopy}>
                      <p>{isBoss ? `BOSS · ROOM ${room}` : `ROOM ${room} · ${['ZOMBIE', 'GOBLIN', 'ORC'][game.monsterType]}`}</p>
                      <h2>{monsterName}</h2>
                      <div className={styles.enemyBar}><span>ENEMY HP</span><b>{game.monsterHp}/{game.monsterMaxHp}</b><i><em style={{ width: `${enemyPercent}%` }} /></i></div>
                      <div className={styles.ranges}><div><span>INCOMING</span><b>{incoming[0]}–{incoming[1]}</b></div><div><span>ROOM</span><b>{room}/40</b></div></div>
                      <div className={styles.actions}>
                        <button onClick={() => gameplay({ type: 'attack' })}><b>⚔️ ATTACK</b><small>{attack[0]}–{attack[1]} damage · crit possible</small></button>
                        <button onClick={() => gameplay({ type: 'storm' })}><b>⚡ STORM</b><small>{storm[0]}–{storm[1]} damage · volatile</small></button>
                        <button onClick={() => gameplay({ type: 'use-potion' })} disabled={game.potions === 0 || game.hp >= game.maxHp || game.combatPotionsUsed >= (isBoss ? 3 : 2)}><b>🧪 POTION</b><small>Heal 25 · enemy retaliates · {game.combatPotionsUsed}/{isBoss ? 3 : 2}</small></button>
                      </div>
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

            {game.ownedRelics.length > 0 && run.phase !== 'boss-combat' && run.phase !== 'settlement-pending' && (
              <section className={styles.collection}>
                <p>RELIC COLLECTION · ONE ACTIVE</p>
                <div>{game.ownedRelics.map((id) => {
                  const relic = getRelicDefinition(id);
                  return <button key={id} className={game.equippedRelic === id ? styles.equipped : ''} onClick={() => gameplay({ type: 'equip-relic', relicId: id })}><Image src={relic.imageSrc!} alt="" width={316} height={270} /><span><b>{relic.name}</b><small>{game.relicCounts[id]} owned · {relic.rarity}</small></span></button>;
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
              {game.log.slice(0, 4).map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
            </section>
          </>
        )}

        <footer className={styles.footer}>
          <span>FULL GAME · LOCAL GAMEPLAY RANDOMNESS · VERIFIED HISTORICAL MARKET SETTLEMENT</span>
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
