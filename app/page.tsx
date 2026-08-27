'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { canonicalJudgeActionLog, JUDGE_COMBAT, seededRoll, type JudgeCombatAction } from './judge-combat';
import { canonicalReplayProof, type ReplayCombatProof, type ReplayProof } from './replay-proof';
import { verifiedRunShareText } from './share-verified-run';

type Direction = 'UP' | 'DOWN';
type Action = 'attack' | 'storm' | 'potion';
type Phase = 'SETUP' | 'JUDGE_SETUP' | 'COMBAT' | 'CLEARED' | 'MERCHANT' | 'FINAL_MERCHANT' | 'ORACLE' | 'TIER_SETUP' | 'VICTORY' | 'DEAD';
type OracleResult = 'BLESSED' | 'CURSED' | 'VOID' | null;
type DeathCause = 'COMBAT' | 'PREDICTION';
type Species = 'Zombie' | 'Goblin' | 'Orc' | 'Boss';

type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  question: string; strikeUsd: string; tradingStart?: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null; demoReplay?: boolean;
  replaySeal?: string; replayCommitment?: string; replayGameSeed?: string;
  replayLockedDirection?: Direction; replayRevealAfter?: number; replayExpiresAt?: number;
  replayProof?: ReplayProof; combatProof?: ReplayCombatProof;
};

type Persona = {
  name: string; species: Species; image: string; flavor: string;
  baseHp: number; minDamage: number; maxDamage: number; reward: number;
};

type Monster = Persona & { room: number; hp: number };

const TOTAL_ROOMS = 10;
const TOTAL_TIERS = 4;
const START_POTIONS = 3;
const MAX_POTIONS = 5;
const PROFILE_KEY = 'market-dungeon-profile-v1';
const MERCHANT_IMAGE = '/characters/merchant-quartermaster-kevin.webp';
const SOMNIA_EXPLORER = 'https://explorer.somnia.network';

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  marketAddress: '', poolAddress: '', collateral: '',
  question: 'BTC closes at or above its opening price', strikeUsd: '—',
  expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING',
  finalized: false, voided: false, winningOutcome: null,
};

const sealedReplay: Market = {
  marketId: 'sealed', marketAddress: '', poolAddress: '', collateral: '',
  question: 'A finalized BTC 15-minute market will be selected only after your omen is locked.',
  strikeUsd: 'SEALED', expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'READY TO LOCK',
  finalized: true, voided: false, winningOutcome: null, demoReplay: true,
};

const zombies: Persona[] = [
  { name: 'Grave Belle', species: 'Zombie', image: '/monsters/zombie-1-grave-belle.webp', flavor: 'Technically deceased. Socially still very active.', baseHp: 22, minDamage: 3, maxDamage: 7, reward: 6 },
  { name: 'Miss Morgue', species: 'Zombie', image: '/monsters/zombie-2-miss-morgue.webp', flavor: 'She wants brains, compliments, and preferably both.', baseHp: 26, minDamage: 4, maxDamage: 8, reward: 7 },
  { name: 'Velvet Rot', species: 'Zombie', image: '/monsters/zombie-3-velvet-rot.webp', flavor: 'Somewhere between a nightmare and a questionable dating decision.', baseHp: 30, minDamage: 5, maxDamage: 9, reward: 8 },
  { name: 'Lady Decomposition', species: 'Zombie', image: '/monsters/zombie-4-lady-decomposition.webp', flavor: 'Beauty fades. Apparently attitude does not.', baseHp: 34, minDamage: 5, maxDamage: 10, reward: 9 },
];

const goblins: Persona[] = [
  { name: 'Gary', species: 'Goblin', image: '/monsters/goblin-1-gary.webp', flavor: 'Gary has no plan, but he is extremely committed to it.', baseHp: 24, minDamage: 4, maxDamage: 8, reward: 8 },
  { name: 'Kevin the Unqualified', species: 'Goblin', image: '/monsters/goblin-2-kevin-the-unqualified.webp', flavor: 'Nobody knows who hired Kevin. Kevin included.', baseHp: 28, minDamage: 4, maxDamage: 9, reward: 9 },
  { name: 'Gribble', species: 'Goblin', image: '/monsters/goblin-3-gribble.webp', flavor: 'Gribble has discovered armor. Civilization may never recover.', baseHp: 33, minDamage: 5, maxDamage: 10, reward: 10 },
  { name: "Gary's Supervisor", species: 'Goblin', image: '/monsters/goblin-4-garys-supervisor.webp', flavor: 'You finally found the person responsible for Gary.', baseHp: 38, minDamage: 6, maxDamage: 11, reward: 11 },
];

const orcs: Persona[] = [
  { name: 'Thud', species: 'Orc', image: '/monsters/orc-1-thud.webp', flavor: 'Thud hits first, thinks never.', baseHp: 31, minDamage: 6, maxDamage: 10, reward: 12 },
  { name: 'Brutus', species: 'Orc', image: '/monsters/orc-2-brutus.webp', flavor: 'His tactical doctrine contains one word: harder.', baseHp: 38, minDamage: 7, maxDamage: 12, reward: 14 },
  { name: 'Gronk', species: 'Orc', image: '/monsters/orc-3-gronk.webp', flavor: 'Gronk briefly considered diplomacy. He did not enjoy it.', baseHp: 45, minDamage: 8, maxDamage: 13, reward: 16 },
  { name: 'Meatwall', species: 'Orc', image: '/monsters/orc-4-meatwall.webp', flavor: 'Less of an opponent. More of an architectural problem.', baseHp: 52, minDamage: 9, maxDamage: 14, reward: 18 },
];

const bosses: Persona[] = [
  { name: 'The Dungeon Lord', species: 'Boss', image: '/monsters/boss-1-dungeon-lord.webp', flavor: 'Runs the dungeon with absolute authority and questionable competence.', baseHp: 72, minDamage: 9, maxDamage: 14, reward: 35 },
  { name: 'The Senior Dungeon Lord', species: 'Boss', image: '/monsters/boss-2-senior-dungeon-lord.webp', flavor: 'More authority, more paperwork, exactly the same leadership skills.', baseHp: 76, minDamage: 10, maxDamage: 15, reward: 38 },
  { name: 'The Executive Overlord', species: 'Boss', image: '/monsters/boss-3-executive-overlord.webp', flavor: 'Promoted beyond competence. Unfortunately, also beyond mortality.', baseHp: 80, minDamage: 10, maxDamage: 16, reward: 40 },
  { name: 'The Chairman Below', species: 'Boss', image: '/monsters/boss-4-chairman-below.webp', flavor: 'The final authority. There is no escalation path above him.', baseHp: 84, minDamage: 11, maxDamage: 17, reward: 42 },
];

async function sha256Hex(value: string) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function getRegularTier(roomNumber: number) {
  if (roomNumber <= 9) return 0;
  if (roomNumber <= 19) return 1;
  if (roomNumber <= 29) return 2;
  return 3;
}

function getBossTier(roomNumber: number) {
  if (roomNumber <= 10) return 0;
  if (roomNumber <= 20) return 1;
  if (roomNumber <= 30) return 2;
  return 3;
}

function buildRoster(chapterStartRoom = 1): Monster[] {
  const sequence: Array<typeof zombies> = [zombies, goblins, orcs, zombies, goblins, orcs, zombies, goblins, orcs];
  const regulars = sequence.map((group, index) => {
    const roomNumber = chapterStartRoom + index;
    const tier = getRegularTier(roomNumber);
    const persona = group[tier];
    return { ...persona, room: roomNumber, hp: persona.baseHp, minDamage: persona.minDamage, maxDamage: persona.maxDamage };
  });
  const bossRoom = chapterStartRoom + 9;
  const boss = bosses[getBossTier(bossRoom)];
  return [...regulars, { ...boss, room: bossRoom, hp: boss.baseHp }];
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function gateTime(expiryIso: string) {
  return new Date(expiryIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
}

function GoldIcon() {
  return <span className="gold-icon" aria-hidden="true" />;
}

function MarketProof({
  market,
  mode,
  open = false,
}: {
  market: Market;
  mode: 'live' | 'sealed' | 'revealed';
  open?: boolean;
}) {
  if (mode === 'sealed') {
    return (
      <details className="onchain-proof proof-sealed" open={open || undefined}>
        <summary>
          <span>SEALED REPLAY PROOF</span>
          <strong>{market.replayCommitment ? 'DIRECTION LOCKED · IDENTITY ENCRYPTED' : 'CREATED AFTER OMEN LOCK'}</strong>
        </summary>
        <div className="proof-grid">
          <div className="proof-wide">
            <span>SALTED SHA-256 COMMITMENT</span>
            <code>{market.replayCommitment ?? 'Generated only after UP or DOWN is locked'}</code>
          </div>
          <div><span>MARKET ID</span><strong>NOT SENT TO THE BROWSER</strong></div>
          <div><span>OUTCOME</span><strong>ENCRYPTED IN AN AUTHENTICATED SERVER SEAL</strong></div>
          <div><span>COMBAT RANDOMNESS</span><strong>INDEPENDENT OF THE HIDDEN MARKET</strong></div>
          <div><span>NETWORK</span><strong>SOMNIA MAINNET · 5031</strong></div>
        </div>
      </details>
    );
  }

  const hasMarket = /^0x[0-9a-f]{64}$/i.test(market.marketId);
  const status = mode === 'revealed' ? 'COMBAT + COMMITMENT + SETTLEMENT VERIFIED' : 'LIVE READ-ONLY MARKET';

  return (
    <details className={`onchain-proof proof-${mode}`} open={open || undefined}>
      <summary>
        <span>{mode === 'live' ? 'LIVE MARKET PROOF' : 'FINALIZED REPLAY PROOF'}</span>
        <strong>{status}</strong>
      </summary>
      <div className="proof-grid">
        {mode === 'revealed' && market.combatProof && <>
          <div className="proof-wide">
            <span>✓ COMBAT VERIFIED BY SERVER</span>
            <code>{market.combatProof.transcriptDigest}</code>
          </div>
          <div><span>TRANSCRIPT</span><strong>{market.combatProof.steps} ACTIONS · GUARD + BOSS DEFEATED</strong></div>
          <div><span>RULESET</span><strong>DETERMINISTIC SEED REPLAY · V1</strong></div>
        </>}
        {mode === 'revealed' && market.replayProof && <>
          <div className="proof-wide">
            <span>✓ COMMITMENT VERIFIED IN BROWSER</span>
            <code>{market.replayProof.commitment}</code>
          </div>
          <div><span>LOCKED DIRECTION</span><strong>BTC {market.replayProof.lockedDirection}</strong></div>
          <div><span>REVEALED SALT</span><code>{market.replayProof.salt}</code></div>
          <div className="proof-wide"><span>CANONICAL COMMITMENT INPUT</span><code>{market.replayProof.canonical}</code></div>
        </>}
        <div className="proof-wide">
          <span>FULL MARKET ID</span>
          {hasMarket ? <a href={`${SOMNIA_EXPLORER}/search?q=${encodeURIComponent(market.marketId)}`} target="_blank" rel="noreferrer"><code>{market.marketId}</code><b>↗</b></a> : <code>Loading…</code>}
        </div>
        <div>
          <span>MARKET ADDRESS</span>
          {market.marketAddress ? <a href={`${SOMNIA_EXPLORER}/address/${market.marketAddress}`} target="_blank" rel="noreferrer"><code>{market.marketAddress}</code><b>↗</b></a> : <code>Loading…</code>}
        </div>
        <div>
          <span>POOL ADDRESS</span>
          {market.poolAddress ? <a href={`${SOMNIA_EXPLORER}/address/${market.poolAddress}`} target="_blank" rel="noreferrer"><code>{market.poolAddress}</code><b>↗</b></a> : <code>Loading…</code>}
        </div>
        <div><span>NETWORK</span><strong>SOMNIA MAINNET · 5031</strong></div>
        <div><span>SAFETY</span><strong>READ ONLY · NO WALLET · NO APPROVAL · NO ORDER</strong></div>
      </div>
    </details>
  );
}

function TierTrack({ activeTier, complete = false, failed = false }: { activeTier: number; complete?: boolean; failed?: boolean }) {
  return (
    <section className="tier-track" aria-label="Dungeon tier progression">
      <div><span>FULL RUN</span><strong>{complete ? 'ALL TIERS CLEARED' : failed ? `ENDED AT TIER ${activeTier}` : `TIER ${activeTier} OF ${TOTAL_TIERS}`}</strong></div>
      <div className="tier-nodes">
        {Array.from({ length: TOTAL_TIERS }, (_, index) => {
          const number = index + 1;
          const state = complete || number < activeTier ? 'done' : failed && number === activeTier ? 'failed' : number === activeTier ? 'active' : '';
          return <span key={number} className={state}><b>{state === 'done' ? '✓' : number}</b><small>TIER {number}</small></span>;
        })}
      </div>
    </section>
  );
}

function readProfile() {
  if (typeof window === 'undefined') return { gold: 0, potions: START_POTIONS };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? '{}') as { gold?: number; potions?: number };
    return {
      gold: Math.max(0, Number(saved.gold) || 0),
      potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, Number(saved.potions) || START_POTIONS)),
    };
  } catch {
    return { gold: 0, potions: START_POTIONS };
  }
}

export default function Home() {
  const [market, setMarket] = useState<Market>(fallback);
  const [direction, setDirection] = useState<Direction>('UP');
  const [phase, setPhase] = useState<Phase>('SETUP');
  const [tier, setTier] = useState(1);
  const [roster, setRoster] = useState<Monster[]>(() => buildRoster());
  const [room, setRoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const [hp, setHp] = useState(100);
  const [monsterHp, setMonsterHp] = useState(roster[0].hp);
  const [potions, setPotions] = useState(START_POTIONS);
  const [gold, setGold] = useState(0);
  const [weapon, setWeapon] = useState(1);
  const [armor, setArmor] = useState(0);
  const [combatPotionUses, setCombatPotionUses] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [marketEntryRemaining, setMarketEntryRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState('LIVE DREAMDEX MARKET · READ ONLY');
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [lastReward, setLastReward] = useState('');
  const [oracleBusy, setOracleBusy] = useState(false);
  const [oracleChecks, setOracleChecks] = useState(0);
  const [oracleResult, setOracleResult] = useState<OracleResult>(null);
  const [bandageUsed, setBandageUsed] = useState(false);
  const [merchantPotions, setMerchantPotions] = useState(2);
  const [weaponSold, setWeaponSold] = useState(false);
  const [armorSold, setArmorSold] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);
  const [judgeLoading, setJudgeLoading] = useState(false);
  const [deathCause, setDeathCause] = useState<DeathCause>('COMBAT');
  const [profileReady, setProfileReady] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const [judgeActionLog, setJudgeActionLog] = useState<JudgeCombatAction[]>([]);
  const [shareStatus, setShareStatus] = useState('');
  const oracleBusyRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const profile = readProfile();
      setGold(profile.gold); setPotions(profile.potions); setProfileReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!profileReady || judgeMode) return;
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify({
      gold: Math.max(0, gold),
      potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, potions)),
    }));
  }, [gold, potions, judgeMode, profileReady]);

  useEffect(() => {
    if (!['SETUP', 'TIER_SETUP'].includes(phase)) return;
    let cancelled = false;
    const load = () => fetch('/api/market').then((response) => response.json()).then((data) => {
      if (!cancelled && data.market) setMarket(data.market);
      else if (!cancelled) setNotice('DREAMDEX FEED RETRYING · NO ACTION REQUIRED');
    }).catch(() => { if (!cancelled) setNotice('DREAMDEX FEED RETRYING · NO ACTION REQUIRED'); });
    void load();
    const refresh = window.setInterval(() => { void load(); }, 15000);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, [phase]);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Number(market.expiry) - Math.floor(Date.now() / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [market.expiry]);

  const monster = roster[room] ?? roster[0];
  const isBoss = room === TOTAL_ROOMS - 1;
  const currentRoomCleared = ['CLEARED', 'MERCHANT', 'FINAL_MERCHANT', 'ORACLE', 'TIER_SETUP', 'VICTORY'].includes(phase) || (phase === 'DEAD' && monsterHp === 0);
  const roomsCleared = phase === 'SETUP' ? 0 : room + (currentRoomCleared ? 1 : 0);
  const replaySealed = judgeMode && !market.replayProof;
  const marketCode = replaySealed
    ? market.replayCommitment?.slice(2, 10).toUpperCase() ?? 'SEALED'
    : market.marketId.slice(-4).toUpperCase();
  const combatSeed = judgeMode ? market.replayGameSeed ?? 'judge-replay-awaiting-lock' : market.marketId;
  const monsterPercent = Math.max(0, Math.min(100, (monsterHp / monster.hp) * 100));
  const playerPercent = Math.max(0, Math.min(100, hp));
  const attackMin = 7 + weapon * 2;
  const attackMax = 11 + weapon * 2;
  const stormMax = 20 + weapon * 3;
  const combatPotionLimit = isBoss ? 3 : 2;
  const finalHealCost = Math.ceil((100 - hp) / 25) * 8;
  const marketReady = market.status !== 'CONNECTING' && market.marketId !== fallback.marketId && remaining > 0;
  const expiryLabel = useMemo(() => replaySealed ? 'IDENTITY SEALED' : gateTime(market.expiryIso), [market.expiryIso, replaySealed]);
  const omenName = direction === 'UP' ? 'GOLD AWAKENS' : 'SHADOWS RISE';
  const omenIcon = direction === 'UP' ? <GoldIcon /> : '🌑';
  const judgeStep = phase === 'JUDGE_SETUP'
    ? 1
    : room === TOTAL_ROOMS - 2 && phase === 'COMBAT'
      ? 2
      : room === TOTAL_ROOMS - 1 && phase === 'COMBAT'
        ? 3
        : phase === 'FINAL_MERCHANT'
          ? 4
          : ['ORACLE', 'VICTORY', 'DEAD'].includes(phase)
            ? 5
            : 3;

  const subtitle = phase === 'SETUP'
    ? 'The complete Delveworn loop, powered by a live Event Contract.'
    : phase === 'JUDGE_SETUP'
      ? 'Choose first. The finalized market is selected and sealed only after your omen locks.'
    : phase === 'TIER_SETUP'
      ? `Tier ${tier} cleared. Choose a fresh prediction for Tier ${tier + 1}.`
    : phase === 'MERCHANT'
      ? 'Quartermaster Kevin has found you. Regrettably.'
      : phase === 'FINAL_MERCHANT'
        ? 'One last stop before the prediction verdict.'
      : phase === 'ORACLE'
        ? 'The boss is down. The prediction decides who gets back up.'
        : phase === 'VICTORY'
          ? 'Expedition complete.'
          : `Room ${room + 1} of ${TOTAL_ROOMS} · ${monster.species} · ${omenName} · BTC ${direction}`;

  function addLog(message: string) {
    setCombatLog((previous) => [message, ...previous].slice(0, 10));
  }

  function recordJudgeAction(action: Action, actionRoom = room) {
    if (!judgeMode) return true;
    if ((actionRoom !== JUDGE_COMBAT.guard.room && actionRoom !== JUDGE_COMBAT.boss.room)
      || judgeActionLog.length >= JUDGE_COMBAT.maxSteps) {
      setNotice('COMBAT LOG LIMIT REACHED · START A NEW JUDGE DEMO');
      return false;
    }
    setJudgeActionLog((previous) => [...previous, { room: actionRoom, action }]);
    return true;
  }

  function startRun() {
    if (!marketReady) return;
    const nextRoster = buildRoster();
    setRoster(nextRoster); setTier(1); setRoom(0); setTurn(0); setPhase('COMBAT');
    setHp(100); setMonsterHp(nextRoster[0].hp); setPotions((value) => Math.min(MAX_POTIONS, Math.max(START_POTIONS, value))); setWeapon(1); setArmor(0);
    setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
    setJudgeMode(false); setDeathCause('COMBAT');
    setJudgeActionLog([]); setShareStatus('');
    setMarketEntryRemaining(remaining);
    setCombatLog([`${omenName} recorded: BTC ${direction} against live dreamDEX market #${market.marketId.slice(-4).toUpperCase()}. No order was sent.`]);
    setNotice(`${omenName} · DELVEWORN RUN STARTED`);
  }

  function startJudgeDemo() {
    if (judgeLoading) return;
    setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setJudgeMode(true); setDeathCause('COMBAT');
    setJudgeActionLog([]); setShareStatus('');
    setMarketEntryRemaining(null);
    setCombatLog(['Choose BTC UP or DOWN first. The server will then draw a random finalized market and return only an encrypted seal plus commitment.']);
    setNotice('JUDGE DEMO · CHOOSE OMEN BEFORE MARKET SELECTION');
  }

  async function startJudgeReplay() {
    if (phase !== 'JUDGE_SETUP' || !market.demoReplay || judgeLoading) return;
    setJudgeLoading(true); setNotice('LOCKING OMEN · DRAWING SEALED REPLAY…');
    try {
      const response = await fetch('/api/judge-replay/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await response.json();
      if (!response.ok || !data.replay) throw new Error(data.error ?? 'Replay unavailable');
      const replay = data.replay as {
        seal: string; commitment: string; gameSeed: string; lockedDirection: Direction;
        revealAfter: number; expiresAt: number;
      };
      const nextRoster = buildRoster((TOTAL_TIERS - 1) * TOTAL_ROOMS + 1);
      const guardRoom = TOTAL_ROOMS - 2;
      setMarket({
        ...sealedReplay,
        marketId: `sealed:${replay.commitment}`,
        status: 'OMEN LOCKED',
        replaySeal: replay.seal,
        replayCommitment: replay.commitment,
        replayGameSeed: replay.gameSeed,
        replayLockedDirection: replay.lockedDirection,
        replayRevealAfter: replay.revealAfter,
        replayExpiresAt: replay.expiresAt,
      });
      setDirection(replay.lockedDirection);
      setRoster(nextRoster); setTier(TOTAL_TIERS); setRoom(guardRoom); setTurn(0); setPhase('COMBAT');
      setHp(JUDGE_COMBAT.player.hp); setMonsterHp(Math.min(JUDGE_COMBAT.guard.hp, nextRoster[guardRoom].hp));
      setPotions(JUDGE_COMBAT.player.potions); setGold(62); setWeapon(JUDGE_COMBAT.player.weapon); setArmor(JUDGE_COMBAT.player.armor);
      setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
      setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
      setJudgeActionLog([]); setShareStatus('');
      setCombatLog([`${omenName} locked before market selection. Commitment ${replay.commitment.slice(0, 14)}… binds the encrypted replay; combat uses an independent seed.`]);
      setNotice(`JUDGE DEMO · ${omenName} LOCKED · DEFEAT THE WOUNDED GUARD`);
    } catch {
      setNotice('SEALED REPLAY UNAVAILABLE · YOUR OMEN WAS NOT LOCKED');
    } finally {
      setJudgeLoading(false);
    }
  }

  function incomingDamage(action: Action, nextTurn: number) {
    const spread = monster.maxDamage - monster.minDamage + 1;
    const raw = monster.minDamage + Math.floor(seededRoll(`${combatSeed}:${room}:${nextTurn}:${action}:enemy`) * spread);
    return Math.max(1, raw - armor);
  }

  function awardRoomLoot() {
    let reward = `${monster.reward} gold`;
    setGold((value) => value + monster.reward);
    if ((room + 1) % 3 === 0 && room < 8) {
      setWeapon((value) => value + 1); reward += ' · ⚔️ weapon +1';
    } else if ((room + 1) % 2 === 0) {
      setPotions((value) => Math.min(MAX_POTIONS, value + 1)); reward += ' · 🧪 potion found';
    }
    setLastReward(reward);
    return reward;
  }

  function act(action: Action) {
    if (phase !== 'COMBAT') return;

    if (action === 'potion') {
      if (potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit) return;
      if (!recordJudgeAction(action)) return;
      const nextTurn = turn + 1;
      setTurn(nextTurn);
      const healed = Math.min(25, 100 - hp);
      const incoming = incomingDamage(action, nextTurn);
      const nextHp = Math.max(0, hp + healed - incoming);
      setPotions((value) => value - 1); setCombatPotionUses((value) => value + 1); setHp(nextHp);
      addLog(`Potion restores ${healed} HP. ${monster.name} retaliates for ${incoming}.`);
      if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
      return;
    }

    if (!recordJudgeAction(action)) return;
    const nextTurn = turn + 1;
    setTurn(nextTurn);
    const roll = seededRoll(`${combatSeed}:${room}:${nextTurn}:${action}:player`);
    const crit = action === 'attack' && seededRoll(`${combatSeed}:${room}:${nextTurn}:crit`) < 0.15;
    const base = action === 'attack' ? attackMin + Math.floor(roll * (attackMax - attackMin + 1)) : Math.floor(roll * (stormMax + 1));
    const damage = crit ? base * 2 : base;
    const nextMonsterHp = Math.max(0, monsterHp - damage);
    setMonsterHp(nextMonsterHp);

    if (nextMonsterHp === 0) {
      if (isBoss) {
        const reward = `${monster.reward} gold pending`; setLastReward(reward);
        setPhase('ORACLE'); setNotice(remaining > 0 ? 'BOSS DEFEATED · ORACLE ARMED' : 'BOSS DEFEATED · CHECKING SETTLEMENT');
        addLog(`${monster.name} is down. The ${monster.reward} gold boss reward unlocks only if the BTC prediction is correct.`);
      } else {
        const reward = awardRoomLoot();
        if (room === 4) {
        setPhase('MERCHANT'); setNotice('ROOM 5 CLEARED · TRAVELLING MERCHANT');
        addLog(`${monster.name} defeated. ${reward}. Quartermaster Kevin smells disposable income.`);
        } else {
          setPhase('CLEARED'); setNotice(`ROOM ${room + 1} CLEARED · HEAL OR CONTINUE`);
          addLog(`${monster.name} defeated. ${reward}.`);
        }
      }
      return;
    }

    const incoming = incomingDamage(action, nextTurn);
    const nextHp = Math.max(0, hp - incoming);
    setHp(nextHp);
    addLog(`${crit ? 'Critical hit! ' : ''}${action === 'storm' ? 'Storm' : 'Attack'} deals ${damage}. ${monster.name} deals ${incoming}.`);
    if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
  }

  function useBetweenRoomPotion() {
    if (!['CLEARED', 'MERCHANT', 'FINAL_MERCHANT'].includes(phase) || potions === 0 || hp >= 100) return;
    if (judgeMode && phase === 'CLEARED' && !recordJudgeAction('potion')) return;
    const healed = Math.min(25, 100 - hp);
    setPotions((value) => value - 1); setHp((value) => Math.min(100, value + 25));
    addLog(`You use a potion safely between rooms. +${healed} HP. No retaliation.`);
  }

  function merchantBuy(kind: 'bandage' | 'potion' | 'weapon' | 'armor') {
    if (phase !== 'MERCHANT') return;
    if (kind === 'bandage' && !bandageUsed && hp < 100 && gold >= 8) {
      const healed = Math.min(25, 100 - hp);
      setGold((value) => value - 8); setHp((value) => Math.min(100, value + 25)); setBandageUsed(true);
      addLog(`Kevin applies something he calls a bandage. +${healed} HP · 8 gold.`);
    } else if (kind === 'potion' && merchantPotions > 0 && potions < MAX_POTIONS && gold >= 7) {
      setGold((value) => value - 7); setPotions((value) => value + 1); setMerchantPotions((value) => value - 1);
      addLog('Kevin sells you a suspicious potion. +1 potion · 7 gold.');
    } else if (kind === 'weapon' && !weaponSold && gold >= 15) {
      setGold((value) => value - 15); setWeapon((value) => value + 1); setWeaponSold(true);
      addLog('Kevin upgrades your weapon. The warranty is verbal. · 15 gold.');
    } else if (kind === 'armor' && !armorSold && gold >= 15) {
      setGold((value) => value - 15); setArmor((value) => value + 1); setArmorSold(true);
      addLog('Kevin adds armor plating. It belonged to someone else. · 15 gold.');
    }
  }

  function visitFinalMerchant() {
    if (phase !== 'ORACLE') return;
    setPhase('FINAL_MERCHANT');
    setNotice('BOSS DEFEATED · TRAVELLING MERCHANT AVAILABLE');
    addLog('Quartermaster Kevin appears beside the fallen boss before the prediction verdict. This is probably not a coincidence.');
  }

  function finalMerchantHeal(full = false) {
    if (phase !== 'FINAL_MERCHANT' || hp >= 100) return;
    const cost = full ? finalHealCost : 8;
    if (gold < cost) return;
    const healed = full ? 100 - hp : Math.min(25, 100 - hp);
    setGold((value) => value - cost);
    setHp((value) => Math.min(100, value + healed));
    addLog(`Kevin patches the post-boss damage. +${healed} HP · ${cost} gold.`);
  }

  function returnToBossFate() {
    if (phase !== 'FINAL_MERCHANT') return;
    setPhase('ORACLE');
    setNotice(remaining > 0 ? 'BOSS FATE READY · ORACLE ARMED' : 'BOSS FATE READY · CHECKING SETTLEMENT');
    addLog('You leave Kevin behind and return to the fallen boss. The prediction will decide who stays down.');
  }

  function nextRoom() {
    if (!['CLEARED', 'MERCHANT'].includes(phase)) return;
    const next = room + 1;
    const nextMonsterHp = judgeMode && next === TOTAL_ROOMS - 1 ? Math.min(JUDGE_COMBAT.boss.hp, roster[next].hp) : roster[next].hp;
    setRoom(next); setTurn(0); setMonsterHp(nextMonsterHp); setCombatPotionUses(0); setPhase('COMBAT');
    setNotice(next === TOTAL_ROOMS - 1 ? 'ROOM 10 · DUNGEON MANAGEMENT' : `ROOM ${next + 1} · ${roster[next].species.toUpperCase()}`);
    addLog(`The gate opens. ${roster[next].name} is regrettably employed here.`);
  }

  function startNextTier() {
    if (phase !== 'TIER_SETUP' || tier >= TOTAL_TIERS || !marketReady) return;
    const nextTier = tier + 1;
    const nextRoster = buildRoster((nextTier - 1) * TOTAL_ROOMS + 1);
    setTier(nextTier); setRoster(nextRoster); setRoom(0); setTurn(0); setMonsterHp(nextRoster[0].hp); setPhase('COMBAT');
    setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
    setMarketEntryRemaining(remaining);
    setCombatLog([`Tier ${nextTier} prediction recorded: BTC ${direction} on dreamDEX market #${market.marketId.slice(-4).toUpperCase()}.`, ...combatLog].slice(0, 10));
    setNotice(`TIER ${nextTier} · NEW PREDICTION LOCKED · ${omenName}`);
  }

  async function checkSettlement(automatic = false) {
    if (oracleBusyRef.current || phase !== 'ORACLE') return;
    oracleBusyRef.current = true; setOracleBusy(true); setOracleChecks((value) => value + 1);
    setNotice(automatic ? 'ORACLE AUTO-CHECK IN PROGRESS…' : 'CHECKING DREAMDEX SETTLEMENT…');
    try {
      const response = judgeMode
        ? await fetch('/api/judge-replay/reveal', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ seal: market.replaySeal, actions: judgeActionLog }),
          })
        : await fetch(`/api/market?marketId=${market.marketId}`);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 425) {
          setNotice(`REPLAY SEAL HOLDING · ${Math.max(1, Number(data.retryAfter) || 1)}S`);
          addLog('The server is enforcing its short anti-peek hold. Your direction remains cryptographically locked.');
          return;
        }
        if (judgeMode && [400, 409, 410, 422].includes(response.status)) {
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice(response.status === 410 ? 'REPLAY SEAL EXPIRED · LOCK A NEW OMEN' : 'REPLAY VERIFICATION FAILED · LOCK A NEW OMEN');
          setCombatLog([response.status === 410
            ? 'The encrypted replay expired. Choose and lock a fresh omen to start a new sealed replay.'
            : 'The sealed replay could not be verified, so no outcome was applied. Choose and lock a fresh omen.']);
          return;
        }
        throw new Error(data.error ?? 'Settlement unavailable');
      }
      const result = data.market as Market;
      let resolvedDirection = direction;
      if (judgeMode) {
        const replayProof = data.replayProof as ReplayProof | undefined;
        const combatProof = data.combatProof as ReplayCombatProof | undefined;
        const reconstructedCanonical = replayProof ? canonicalReplayProof(replayProof) : '';
        const computedCommitment = reconstructedCanonical ? await sha256Hex(reconstructedCanonical) : '';
        const reconstructedCombat = market.replayGameSeed ? canonicalJudgeActionLog(market.replayGameSeed, judgeActionLog) : '';
        const computedCombatDigest = reconstructedCombat ? await sha256Hex(reconstructedCombat) : '';
        const proofMatches = replayProof?.verified === true
          && combatProof?.verified === true
          && combatProof.guardDefeated === true
          && combatProof.bossDefeated === true
          && combatProof.playerSurvived === true
          && combatProof.steps === judgeActionLog.length
          && combatProof.transcriptDigest === computedCombatDigest
          && replayProof.canonical === reconstructedCanonical
          && computedCommitment === replayProof.commitment
          && replayProof.commitment === market.replayCommitment
          && replayProof.gameSeed === market.replayGameSeed
          && replayProof.lockedDirection === market.replayLockedDirection
          && replayProof.marketId.toLowerCase() === result.marketId.toLowerCase()
          && replayProof.committedOutcome === Number(result.winningOutcome);
        if (!proofMatches) {
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice('REPLAY PROOF MISMATCH · LOCK A NEW OMEN');
          setCombatLog(['The revealed market failed its browser-side SHA-256 commitment check. No outcome was applied; start a fresh sealed replay.']);
          return;
        }
        resolvedDirection = replayProof.lockedDirection;
        setDirection(resolvedDirection);
        setMarket((previous) => ({ ...previous, ...result, replayProof, combatProof }));
      }
      if (!result?.finalized && !result?.voided) {
        setNotice(remaining > 0 ? 'BOSS DOWN · AUTO-CHECK STARTS AT EXPIRY' : 'SETTLEMENT PENDING · NEXT CHECK IN 5S');
        if (!automatic) addLog('dreamDEX has not finalized yet. The boss remains down, but the tier is not cleared until the prediction resolves.');
        return;
      }
      if (result.voided) {
        setOracleResult('VOID'); setGold((value) => value + monster.reward);
        setPhase(judgeMode || tier === TOTAL_TIERS ? 'VICTORY' : 'TIER_SETUP');
        setNotice('MARKET VOIDED · NO PREDICTION LOSS · BOSS REWARD PRESERVED');
        addLog(`The Event Contract was voided. The boss stays down and its ${monster.reward} gold base reward is preserved.`);
        return;
      }
      const resolvedOmenName = resolvedDirection === 'UP' ? 'GOLD AWAKENS' : 'SHADOWS RISE';
      const won = Number(result.winningOutcome) === (resolvedDirection === 'UP' ? 0 : 1);
      if (won) {
        const reward = monster.reward + 50;
        setOracleResult('BLESSED'); setGold((value) => value + reward);
        setPhase(judgeMode || tier === TOTAL_TIERS ? 'VICTORY' : 'TIER_SETUP');
        setNotice(judgeMode || tier === TOTAL_TIERS ? `FINAL BOSS DEFEATED · +${reward} GOLD` : `TIER ${tier} CLEARED · NEW BTC PREDICTION REQUIRED`);
        addLog(`${resolvedOmenName} was correct. The boss stays down: ${monster.reward} boss gold + 50 prediction gold.`);
      } else {
        setOracleResult('CURSED'); setHp(0); setDeathCause('PREDICTION'); setPhase('DEAD'); setNotice('PREDICTION WRONG · BOSS LAST STAND · RUN ENDED');
        addLog(`${resolvedOmenName} was wrong. The fallen boss rises for one final strike. No boss reward is awarded.`);
      }
    } catch {
      setNotice(judgeMode
        ? 'REPLAY VERIFICATION UNAVAILABLE · RETRY REVEAL'
        : automatic ? 'SETTLEMENT FEED RETRYING IN 5S' : 'SETTLEMENT FEED UNAVAILABLE · AUTO-RETRY ARMED');
      if (judgeMode) addLog('The verification service is temporarily unavailable. No outcome was applied; retry Reveal Boss Fate.');
    } finally {
      oracleBusyRef.current = false; setOracleBusy(false);
    }
  }

  useEffect(() => {
    if (phase !== 'ORACLE' || remaining > 0 || judgeMode) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await checkSettlement(true);
      if (!cancelled) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  // Poll only after the chosen Event Contract expires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining > 0, market.marketId, direction, judgeMode]);

  function reset() {
    const profile = judgeMode ? readProfile() : { gold, potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, potions)) };
    const nextRoster = buildRoster();
    setMarket(fallback); setRoster(nextRoster); setTier(1); setPhase('SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(nextRoster[0].hp);
    setPotions(profile.potions); setGold(profile.gold); setWeapon(1); setArmor(0); setCombatPotionUses(0); setCombatLog([]); setLastReward('');
    setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false;
    setJudgeMode(false); setJudgeLoading(false); setDeathCause('COMBAT');
    setJudgeActionLog([]); setShareStatus('');
    setMarketEntryRemaining(null);
    setNotice('LIVE DREAMDEX MARKET · READ ONLY');
  }

  const resultHeading = oracleResult === 'BLESSED' ? 'Combat and prediction conquered.' : oracleResult === 'CURSED' ? 'The boss strikes back.' : 'Dungeon conquered.';
  const resultCopy = oracleResult === 'BLESSED'
    ? `${omenName} was correct. The final boss stays down and the run earns both boss and prediction gold.`
    : oracleResult === 'CURSED'
      ? `${omenName} was wrong. You won the combat, but the boss's last stand ends the run.`
      : 'The Event Contract was voided, so the defeated boss remained down without a prediction penalty.';

  async function shareVerifiedRun(preferShare: boolean) {
    if (!market.replayProof || !market.combatProof || !oracleResult) return;
    const text = verifiedRunShareText({
      lockedDirection: market.replayProof.lockedDirection,
      winningOutcome: market.replayProof.committedOutcome,
      result: oracleResult,
      marketId: market.replayProof.marketId,
      commitment: market.replayProof.commitment,
      combatSteps: market.combatProof.steps,
    });

    try {
      if (preferShare && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Market Dungeon — verified Judge run', text });
        setShareStatus('VERIFIED RUN SHARED');
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus('VERIFIED RESULT COPIED');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('SHARE FAILED · COPY THE PROOF BELOW');
    }
  }

  const verifiedSharePanel = judgeMode && market.replayProof && market.combatProof && oracleResult ? (
    <div className="verified-share">
      <div>
        <span>SHAREABLE VERIFIED RESULT</span>
        <strong>LOCKED BTC {market.replayProof.lockedDirection} · OUTCOME BTC {market.replayProof.committedOutcome === 0 ? 'UP' : 'DOWN'}</strong>
        <small>Includes market ID, commitment, combat verification, Somnia proof and the Market Dungeon link.</small>
      </div>
      <div className="verified-share-actions">
        <button type="button" onClick={() => void shareVerifiedRun(true)}>↗ SHARE VERIFIED RUN</button>
        <button type="button" onClick={() => void shareVerifiedRun(false)}>COPY RESULT</button>
      </div>
      <p aria-live="polite">{shareStatus}</p>
    </div>
  ) : null;

  return (
    <main className={`game-shell phase-${phase.toLowerCase()} ${['SETUP', 'JUDGE_SETUP'].includes(phase) ? 'setup-shell' : 'in-expedition'}`}>
      <div className="game-column">
        <header className="game-header">
          <p className="eyebrow">DELVEWORN · EVENT CONTRACTS EDITION</p>
          <h1>MARKET DUNGEON</h1>
          <p className="subtitle">{subtitle}</p>
          <div className="safety-line"><span className="live-dot" /> SOMNIA MAINNET <i /> LIVE DREAMDEX DATA <i /> NO TRANSACTIONS</div>
        </header>

        <section className="market-ribbon" aria-label="Live dreamDEX Event Contract">
          <div><span>BTC · 15 MIN</span><strong>{market.status}</strong><small>{judgeMode ? 'FINALIZED ONCHAIN REPLAY' : marketEntryRemaining !== null ? `LOCKED WITH ${formatTime(marketEntryRemaining)} LEFT` : 'STARTS IMMEDIATELY · LIVE MARKET'}</small></div>
          <div><span>LINE</span><strong>{replaySealed ? 'HIDDEN' : `$${market.strikeUsd}`}</strong></div>
          <div><span>EXPIRY</span><strong>{replaySealed ? 'FINALIZED' : formatTime(remaining)}</strong><small>{replaySealed ? expiryLabel : `${expiryLabel} UTC`}</small></div>
          <div><span>DUNGEON OMEN</span><strong className={direction === 'UP' ? 'text-up' : 'text-down'}>{omenIcon} {omenName}</strong><small>BTC {direction}</small></div>
        </section>

        {judgeMode && phase !== 'SETUP' && (
          <section className="judge-replay-banner" aria-label="Judge Demo progress">
            <div className="judge-replay-heading">
              <span>⚡ 2-MIN JUDGE DEMO</span>
              <strong>{market.replayProof ? `VERIFIED MARKET REPLAY · #${marketCode}` : market.replayCommitment ? `SEALED REPLAY · COMMIT ${marketCode}` : 'CRYPTOGRAPHIC REPLAY SETUP'}</strong>
              <small>{market.replayProof ? 'Combat transcript, commitment and Somnia settlement all verified.' : market.replayCommitment ? 'Your direction is locked. The exact market identity and outcome remain encrypted while you defeat the guard and boss.' : 'Choose UP or DOWN before the server randomly selects and seals a finalized market.'}</small>
              {market.replayCommitment && !market.replayProof && <code className="judge-replay-commitment">{market.replayCommitment}</code>}
            </div>
            <div className="judge-replay-steps">
              <span className={judgeStep === 1 ? 'active' : 'done'}><b>1</b> LOCK OMEN</span>
              <span className={judgeStep === 2 ? 'active' : judgeStep > 2 ? 'done' : ''}><b>2</b> DEFEAT GUARD</span>
              <span className={judgeStep === 3 ? 'active' : judgeStep > 3 ? 'done' : ''}><b>3</b> DEFEAT BOSS</span>
              <span className={judgeStep === 4 ? 'active' : judgeStep > 4 ? 'done' : ''}><b>4</b> HEAL OPTIONAL</span>
              <span className={market.replayProof ? 'done' : judgeStep === 5 ? 'active' : ''}><b>5</b> REVEAL FATE</span>
            </div>
          </section>
        )}

        {!judgeMode && <TierTrack activeTier={phase === 'TIER_SETUP' ? tier + 1 : tier} complete={phase === 'VICTORY'} failed={phase === 'DEAD'} />}

        {!['SETUP', 'JUDGE_SETUP'].includes(phase) && (
          <section className="sticky-hud" aria-label="Expedition status">
            <div><span>HEALTH</span><strong>❤️ {hp}/100</strong><div className="mini-bar"><i style={{ width: `${playerPercent}%` }} /></div></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div>
            <div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div>
            <div className="hud-wide"><span>LOADOUT</span><strong className="desktop-hud-value">⚔️ Lv {weapon} · 🛡️ Lv {armor}</strong><strong className="mobile-hud-value">⚔️ {weapon} · 🛡️ {armor}</strong></div>
            <div className="hud-wide"><span>EXPEDITION</span><strong className="desktop-hud-value">TIER {tier}/{TOTAL_TIERS} · {roomsCleared}/{TOTAL_ROOMS} · {omenIcon} {omenName}</strong><strong className="mobile-hud-value">T{tier} · R{Math.min(room + 1, TOTAL_ROOMS)}</strong></div>
          </section>
        )}

        <section className={`main-card ${isBoss && !['SETUP', 'JUDGE_SETUP', 'TIER_SETUP'].includes(phase) ? 'boss-card' : ''}`}>
          {phase === 'SETUP' ? (
            <div className="setup-view">
              <div className="setup-hero">
                <img src="/assets/delveworn-tier2-party-hero.webp" alt="Miss Morgue, Kevin the Unqualified and Brutus assembled in the dungeon" />
              </div>
              <div className="setup-content">
                <div className="setup-intro">
                  <p className="section-kicker">THE REAL DELVEWORN LOOP · THE BITCOIN HOARD</p>
                  <h2>Defeat the boss. Predict correctly. Survive both.</h2>
                  <p className="muted">Each tier has ten combat rooms and a fresh BTC prediction. A boss victory only becomes permanent when the dreamDEX prediction is also correct; otherwise the boss delivers a fatal last strike.</p>
                  <div className="legacy-inventory"><div><span>PERSISTENT GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>NEXT-RUN POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div><small>Gold and potions above the starting amount survive a new run. Attack and defense reset.</small></div>
                  <div className="prediction-card">
                    <span>TIER 1 PREDICTION · MARKET #{marketCode || '—'}</span><strong>${market.strikeUsd}</strong><p>{market.question}</p>
                    <div className="prediction-buttons">
                      <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP · finishes at or above the line</small></button>
                      <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN · finishes below the line</small></button>
                    </div>
                  </div>
                </div>
                <div className="setup-details">
                  <div className="rule-grid">
                    <div><span>⚔️</span><b>WIN THE COMBAT</b><small>Fight normally and reduce the boss to zero HP</small></div>
                    <div><span>🔮</span><b>WIN THE PREDICTION</b><small>Correct BTC outcome keeps the defeated boss down</small></div>
                    <div><span>🧰</span><b>BUILD WITHIN THE RUN</b><small>Kevin&apos;s attack and defense upgrades last until defeat</small></div>
                    <div><span>🏰</span><b>CLIMB FOUR TIERS</b><small>Every tier brings a new roster, boss and prediction</small></div>
                  </div>
                  <div className="competition-note"><b>LIVE CONTRACT INTEGRATION:</b> Each tier immediately locks the active BTC 15-minute dreamDEX market. Its real market ID, expiry and Somnia settlement are preserved.</div>
                  <MarketProof market={market} mode="live" />
                </div>
              </div>
            </div>
          ) : phase === 'JUDGE_SETUP' ? (
            <div className="judge-setup-view">
              <p className="section-kicker">STEP 1 · CHOOSE BEFORE MARKET SELECTION</p>
              <h2>Lock your omen before the replay is drawn.</h2>
              <p className="muted">After you lock UP or DOWN, the server randomly selects a finalized BTC 15-minute market. Only an encrypted seal, a salted commitment and an unrelated combat seed reach this browser.</p>
              <div className="prediction-card judge-prediction-card">
                <span>SEALED BTC 15-MIN REPLAY · SOMNIA MAINNET</span>
                <strong>UP OR DOWN</strong>
                <p>The exact market ID, addresses, strike, expiry and outcome are not selected or sent before your choice locks.</p>
                <div className="prediction-buttons">
                  <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP · finishes at or above the line</small></button>
                  <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN · finishes below the line</small></button>
                </div>
              </div>
              <div className="judge-seal-note"><span>CRYPTOGRAPHIC SEAL</span><strong>Your direction locks before a random historical settlement is selected.</strong><small>After lock, the browser receives no identifying market metadata. Full proof, revealed salt and outcome appear only at Reveal Boss Fate.</small></div>
              <MarketProof market={market} mode="sealed" open />
            </div>
          ) : phase === 'TIER_SETUP' ? (
            <div className="tier-setup-view">
              <div className="result-icon">⚔️</div>
              <p className="section-kicker">TIER {tier} CLEARED · BOTH CONDITIONS MET</p>
              <h2>Choose a new prediction for Tier {tier + 1}.</h2>
              <p className="muted">Your gold, potions, health, attack and defense continue because this is still the same run. A defeat will reset attack and defense before the next expedition.</p>
              <div className="carry-forward"><div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div><div><span>RUN LOADOUT</span><strong>⚔️ {weapon} · 🛡️ {armor}</strong></div></div>
              <div className="prediction-card">
                <span>TIER {tier + 1} PREDICTION · NEW MARKET #{marketCode || '—'}</span><strong>${market.strikeUsd}</strong><p>{market.question}</p>
                <div className="prediction-buttons">
                  <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP · finishes at or above the line</small></button>
                  <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN · finishes below the line</small></button>
                </div>
              </div>
            </div>
          ) : phase === 'MERCHANT' || phase === 'FINAL_MERCHANT' ? (
            <div className="merchant-view">
              <div className="merchant-stage"><img src={MERCHANT_IMAGE} alt="Quartermaster Kevin, Travelling Merchant" /><div className="stage-fade" /></div>
              <div className="merchant-copy">
                <p className="section-kicker">🧰 {phase === 'FINAL_MERCHANT' ? 'POST-BOSS' : 'ROOM 5'} · TRAVELLING MERCHANT</p>
                <h2>Quartermaster Kevin</h2>
                <p className="merchant-role">Questionable procurement · impeccable timing</p>
                <p className="flavor">“{phase === 'FINAL_MERCHANT' ? 'The boss is down. Permanently? Ask Bitcoin. Shall we improve your odds of surviving the answer?' : 'You look terrible. Fortunately, I accept gold.'}”</p>
                <div className="merchant-stats"><div><span>HEALTH</span><strong>❤️ {hp}/100</strong></div><div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div></div>
              </div>
            </div>
          ) : phase === 'CLEARED' ? (
            <div className="result-view cleared-view">
              <div className="result-icon">🏆</div><p className="section-kicker">ROOM {room + 1} CLEARED</p>
              <h2>{judgeMode ? 'The final boss gate is open.' : 'Against all evidence, you remain alive.'}</h2>
              <p className="muted">{judgeMode ? 'The guard demonstrated normal combat. Continue to the wounded boss for the dual-condition finale.' : 'Heal safely with a potion before opening the next gate.'}</p>
              <div className="reward-box"><span>RECOVERED</span><strong><GoldIcon /> {lastReward}</strong></div>
            </div>
          ) : phase === 'VICTORY' ? (
            <div className="result-view">
              <div className="result-icon">{oracleResult === 'BLESSED' ? '✨' : oracleResult === 'CURSED' ? '📉' : '👑'}</div>
              <p className="section-kicker">{judgeMode ? 'JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED' : `TIER ${tier}/${TOTAL_TIERS} · FULL RUN COMPLETE`} · {oracleResult ?? 'SETTLED'}</p>
              <h2>{resultHeading}</h2><p className="muted">{resultCopy}</p>
              {judgeMode && <><div className="judge-verification"><span>✓ COMBAT + COMMITMENT + SETTLEMENT VERIFIED</span><strong>dreamDEX market #{marketCode}</strong><small>Server replayed {market.combatProof?.steps ?? 0} seeded combat actions; the browser then verified the transcript digest and salted commitment before applying the Somnia outcome.</small></div>{verifiedSharePanel}<MarketProof market={market} mode="revealed" open /></>}
              <div className="victory-conditions resolved"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>{oracleResult === 'VOID' ? '○ VOID EXCEPTION' : '✓ CONDITION 2'}</span><strong>{oracleResult === 'VOID' ? 'Prediction voided · no loss' : 'BTC prediction correct'}</strong></div></div>
              <div className="final-stats"><div><span>TIERS CLEARED</span><strong>{judgeMode ? 'REPLAY' : `${tier}/${TOTAL_TIERS}`}</strong></div><div><span>FINAL GOLD</span><strong><GoldIcon /> {gold}</strong></div></div>
            </div>
          ) : phase === 'DEAD' ? (
            <div className="result-view">
              <div className="result-icon">☠️</div><p className="section-kicker">{judgeMode ? 'JUDGE DEMO COMPLETE · ONCHAIN LOSS VERIFIED' : `TIER ${tier} · EXPEDITION ENDED`}</p>
              <h2>{deathCause === 'PREDICTION' ? 'The boss strikes back.' : 'You fell in combat.'}</h2><p className="muted">{deathCause === 'PREDICTION' ? resultCopy : 'The prediction cannot save a lost fight. Gold persists, potions return to at least the starting amount, and attack and defense reset for the next run.'}</p>
              {deathCause === 'PREDICTION' && <div className="victory-conditions failed"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>✕ CONDITION 2</span><strong>BTC prediction incorrect</strong></div></div>}
              {judgeMode && deathCause === 'PREDICTION' && <><div className="judge-verification"><span>✓ COMBAT + COMMITMENT + SETTLEMENT VERIFIED</span><strong>dreamDEX market #{marketCode}</strong><small>Server-verified guard and boss combat preceded the reveal; the losing Somnia outcome matched the market hidden inside the pre-combat commitment.</small></div>{verifiedSharePanel}<MarketProof market={market} mode="revealed" open /></>}
              <div className="final-stats"><div><span>TIER / ROOMS</span><strong>{tier} · {roomsCleared}/{TOTAL_ROOMS}</strong></div><div><span>GOLD KEPT</span><strong><GoldIcon /> {gold}</strong></div></div>
            </div>
          ) : (
            <div className="combat-view">
              <div className="room-progress">
                <div className="room-map ten-room-map" aria-label="Dungeon progress">
                  {Array.from({ length: TOTAL_ROOMS }, (_, index) => {
                    const done = index < room || (index === room && currentRoomCleared);
                    return <span key={index} className={done ? 'done' : index === room ? 'active' : ''}>{index === TOTAL_ROOMS - 1 ? '◆' : index + 1}</span>;
                  })}
                </div>
              </div>
              <div className="monster-stage">
                <img src={monster.image} alt={monster.name} />
                {judgeMode && <div className="judge-stage-label">{room === TOTAL_ROOMS - 2 ? '⚡ FINAL TIER REPLAY · ONE WOUNDED GUARD REMAINS BEFORE THE BOSS' : '⚡ FINAL BOSS · WOUNDED FOR THE FAST DEMO'}</div>}
                <div className="stage-fade" />
              </div>
              <div className="monster-info">
                {isBoss && <p className="boss-label">👑 DUNGEON MANAGEMENT</p>}
                <div className="monster-heading"><div><h2>{monster.name}</h2><span>{monster.species} · Room {room + 1}</span></div><b>{monster.species === 'Boss' ? 'BOSS' : monster.species.toUpperCase()}</b></div>
                <p className="flavor">“{monster.flavor}”</p>
                <div className="hp-label"><span>ENEMY HP</span><strong>{monsterHp} / {monster.hp}</strong></div>
                <div className="enemy-bar"><i className={isBoss ? 'boss-health' : ''} style={{ width: `${monsterPercent}%` }} /></div>
                <div className="enemy-stats"><div><span>ENEMY DAMAGE</span><strong>💥 {monster.minDamage}–{monster.maxDamage}</strong></div><div><span>BASE REWARD</span><strong><GoldIcon /> {monster.reward}</strong></div></div>
                {isBoss && <div className={`victory-conditions ${phase === 'ORACLE' ? 'pending' : ''}`}><div><span>{phase === 'ORACLE' ? '✓ CONDITION 1' : 'CONDITION 1'}</span><strong>{phase === 'ORACLE' ? 'Boss defeated in combat' : 'Reduce boss HP to zero'}</strong></div><div><span>CONDITION 2</span><strong>{phase === 'ORACLE' ? 'BTC prediction awaiting result' : `${omenName} must be correct`}</strong></div></div>}
                {phase === 'ORACLE' && <div className="oracle-lock">
                  <div className="oracle-status"><span>🔮 {judgeMode ? 'FINALIZED ONCHAIN REPLAY' : 'LIVE DREAMDEX SETTLEMENT'}</span><strong>{judgeMode ? 'READY TO REVEAL' : remaining > 0 ? formatTime(remaining) : oracleBusy ? 'READING…' : `${oracleChecks} CHECK${oracleChecks === 1 ? '' : 'S'}`}</strong><small>{judgeMode ? 'This fast demo uses a real finalized dreamDEX market and its recorded Somnia outcome.' : 'The boss is down, but not permanently defeated. A wrong BTC prediction triggers its fatal last strike.'}</small></div>
                  <div className="integration-proof"><span>SOMNIA CHAIN 5031</span><span>{judgeMode ? `COMMIT ${marketCode}` : `MARKET #${marketCode}`}</span><span>READ-ONLY CHAIN CALL</span><span>{judgeMode ? 'IDENTITY + OUTCOME SEALED' : 'SETTLEMENT PENDING'}</span></div>
                  {judgeMode && <MarketProof market={market} mode="sealed" />}
                </div>}
              </div>
            </div>
          )}
        </section>

        <section className={`action-dock action-dock-${phase.toLowerCase()}`}>
          {phase === 'SETUP' ? (
            <div className="judge-entry">
              <div className="desktop-omen-picker" aria-label="Choose BTC direction">
                <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> BTC UP</b><small>GOLD AWAKENS</small></button>
                <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 BTC DOWN</b><small>SHADOWS RISE</small></button>
              </div>
              <button className="primary-action" onClick={startRun} disabled={!marketReady}>{marketReady ? <>BEGIN TIER 1 · {omenIcon} {omenName}</> : 'WAITING FOR ACTIVE BTC MARKET…'}</button>
              <button className="judge-action" onClick={startJudgeDemo} disabled={judgeLoading}>⚡ 2-MIN JUDGE DEMO · SEALED MARKET REPLAY</button>
              <small>Choose first. A random finalized market is encrypted and committed only after your omen locks.</small>
            </div>
          ) : phase === 'JUDGE_SETUP' ? (
            <div className="judge-lock-action">
              <div><span>YOUR LOCKED CHOICE WILL BE</span><strong>{omenIcon} {omenName} · BTC {direction}</strong><small>No wallet, approval or order will be requested.</small></div>
              <button className="judge-action" onClick={() => void startJudgeReplay()} disabled={judgeLoading}>{judgeLoading ? 'LOCKING + SEALING REPLAY…' : 'LOCK OMEN & SEAL REPLAY'}</button>
            </div>
          ) : phase === 'TIER_SETUP' ? (
            <div className="tier-action">
              <button className="primary-action" onClick={startNextTier} disabled={!marketReady}>{marketReady ? <>ENTER TIER {tier + 1} · {omenIcon} {omenName}</> : 'WAITING FOR THE NEXT BTC MARKET…'}</button>
              <small>Same run: gold, potions, health, attack and defense continue into the next tier.</small>
            </div>
          ) : phase === 'COMBAT' ? (
            <>
              {judgeMode && <div className="judge-next-action"><span>JUDGE STEP {judgeStep} OF 5</span><b>{room === TOTAL_ROOMS - 2 ? 'Defeat the wounded guard to open the final boss gate.' : 'Defeat the wounded boss, then choose merchant or reveal its prediction fate.'}</b></div>}
              <div className="combat-actions">
                <button className="attack" onClick={() => act('attack')}><b>⚔️ ATTACK</b><strong>DAMAGE {attackMin}–{attackMax}</strong><small>Reliable · 15% critical</small></button>
                <button className="storm" onClick={() => act('storm')}><b>⚡ STORM</b><strong>DAMAGE 0–{stormMax}</strong><small>High variance · no critical</small></button>
                <button className="potion" onClick={() => act('potion')} disabled={potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit}><span><b>🧪 POTION · {potions}/{MAX_POTIONS}</b><small>Heal up to 25 HP · enemy retaliates</small></span><strong>{combatPotionUses}/{combatPotionLimit}</strong></button>
              </div>
            </>
          ) : phase === 'CLEARED' ? (
            <div className="between-actions">
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>🧪 HEAL +25 HP · {potions}/{MAX_POTIONS}</button>
              <button className="primary-action" onClick={nextRoom}>{judgeMode ? '👑 ENTER FINAL BOSS' : '🎲 NEXT ROOM'}</button>
            </div>
          ) : phase === 'MERCHANT' ? (
            <div className="merchant-shop">
              <div className="shop-heading"><div><span>KEVIN&apos;S SUPPLY SHOP</span><b>Prepare for Room 6</b></div><strong><GoldIcon /> {gold}</strong></div>
              <div className="shop-grid">
                <button onClick={() => merchantBuy('bandage')} disabled={bandageUsed || hp >= 100 || gold < 8}><b>❤️ BANDAGE</b><small>Heal up to 25 HP</small><strong><GoldIcon /> 8</strong></button>
                <button onClick={() => merchantBuy('potion')} disabled={merchantPotions === 0 || potions >= MAX_POTIONS || gold < 7}><b>🧪 POTION</b><small>Stock {merchantPotions}/2</small><strong><GoldIcon /> 7</strong></button>
                <button onClick={() => merchantBuy('weapon')} disabled={weaponSold || gold < 15}><b>⚔️ WEAPON +1</b><small>{weaponSold ? 'Sold' : `Current Lv ${weapon}`}</small><strong><GoldIcon /> 15</strong></button>
                <button onClick={() => merchantBuy('armor')} disabled={armorSold || gold < 15}><b>🛡️ ARMOR +1</b><small>{armorSold ? 'Sold' : `Current Lv ${armor}`}</small><strong><GoldIcon /> 15</strong></button>
              </div>
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>USE OWN POTION SAFELY · {potions}/{MAX_POTIONS}</button>
              <button className="primary-action" onClick={nextRoom}>🚪 CONTINUE TO ROOM 6</button>
            </div>
          ) : phase === 'FINAL_MERCHANT' ? (
            <div className="merchant-shop">
              <div className="shop-heading"><div><span>KEVIN&apos;S AFTERCARE</span><b>Patch up before the prediction verdict</b></div><strong><GoldIcon /> {gold}</strong></div>
              <div className="shop-grid">
                <button onClick={() => finalMerchantHeal(false)} disabled={hp >= 100 || gold < 8}><b>❤️ FIELD DRESSING</b><small>Heal up to 25 HP</small><strong><GoldIcon /> 8</strong></button>
                <button onClick={() => finalMerchantHeal(true)} disabled={hp >= 100 || gold < finalHealCost}><b>✨ FULL TREATMENT</b><small>{hp >= 100 ? 'Already at full health' : `Restore ${100 - hp} HP`}</small><strong><GoldIcon /> {finalHealCost}</strong></button>
              </div>
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>USE OWN POTION SAFELY · {potions}/{MAX_POTIONS}</button>
              <button className="oracle-action" onClick={returnToBossFate}>🔮 RETURN TO BOSS FATE</button>
            </div>
          ) : phase === 'ORACLE' ? (
            <div className="oracle-dock">
              <div className="between-actions">
                <button className="heal-action" onClick={visitFinalMerchant}>🧰 VISIT TRAVELLING MERCHANT</button>
                <button className="oracle-action" onClick={() => void checkSettlement(false)} disabled={oracleBusy}>🔮 {oracleBusy ? 'VERIFYING COMBAT + SETTLEMENT…' : 'REVEAL BOSS FATE'}</button>
              </div>
              <small>{judgeMode ? `Finalized replay · ${judgeActionLog.length} logged actions will be server-verified before reveal` : remaining > 0 ? `Automatic checks begin in ${formatTime(remaining)}` : 'Automatic settlement checks run every 5 seconds'}</small>
            </div>
          ) : (
            <div className="new-run-action"><button className="primary-action" onClick={reset}>↻ BEGIN NEW EXPEDITION</button><small>Keep gold and up to 5 potions · reset attack and defense</small></div>
          )}
        </section>

        <section className={`dungeon-log ${mobileLogOpen ? 'mobile-open' : ''}`}>
          <div><span>DUNGEON LOG</span><b>{notice}</b><button type="button" onClick={() => setMobileLogOpen((open) => !open)} aria-expanded={mobileLogOpen}>{mobileLogOpen ? 'HIDE' : 'SHOW'}</button></div>
          <div className="dungeon-log-entries">
            {combatLog.length ? combatLog.map((entry, index) => <p key={`${entry}-${index}`} className={index === 0 ? 'latest' : ''}>{entry}</p>) : <p>The dungeon is quiet. This is almost certainly temporary.</p>}
          </div>
        </section>

        <footer><p>DELVEWORN × DREAMDEX EVENT CONTRACTS · SOMNIA</p><span>Competition prototype · no wallet · no approval · no order submission · {replaySealed ? `sealed commitment ${marketCode}` : `market #${marketCode || '—'}`}</span></footer>
      </div>
    </main>
  );
}
