'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Direction = 'UP' | 'DOWN';
type Action = 'attack' | 'storm' | 'potion';
type Phase = 'SETUP' | 'COMBAT' | 'CLEARED' | 'MERCHANT' | 'FINAL_MERCHANT' | 'ORACLE' | 'TIER_SETUP' | 'VICTORY' | 'DEAD';
type OracleResult = 'BLESSED' | 'CURSED' | 'VOID' | null;
type DeathCause = 'COMBAT' | 'PREDICTION';
type Species = 'Zombie' | 'Goblin' | 'Orc' | 'Boss';

type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  question: string; strikeUsd: string; tradingStart?: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null; demoReplay?: boolean;
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

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  marketAddress: '', poolAddress: '', collateral: '',
  question: 'BTC closes at or above its opening price', strikeUsd: '—',
  expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING',
  finalized: false, voided: false, winningOutcome: null,
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

function hashSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function seededRoll(seed: string) {
  return hashSeed(seed) / 4294967295;
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
    const refresh = window.setInterval(() => { void load(); }, 30000);
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
  const marketCode = market.marketId.slice(-4).toUpperCase();
  const monsterPercent = Math.max(0, Math.min(100, (monsterHp / monster.hp) * 100));
  const playerPercent = Math.max(0, Math.min(100, hp));
  const attackMin = 7 + weapon * 2;
  const attackMax = 11 + weapon * 2;
  const stormMax = 20 + weapon * 3;
  const combatPotionLimit = isBoss ? 3 : 2;
  const finalHealCost = Math.ceil((100 - hp) / 25) * 8;
  const marketReady = market.status !== 'CONNECTING' && market.marketId !== fallback.marketId && remaining > 0;
  const expiryLabel = useMemo(() => gateTime(market.expiryIso), [market.expiryIso]);
  const omenName = direction === 'UP' ? 'GOLD AWAKENS' : 'SHADOWS RISE';
  const omenIcon = direction === 'UP' ? <GoldIcon /> : '🌑';
  const judgeStep = ['VICTORY', 'DEAD'].includes(phase) ? 3 : ['ORACLE', 'FINAL_MERCHANT'].includes(phase) ? 2 : 1;

  const subtitle = phase === 'SETUP'
    ? 'The complete Delveworn loop, powered by a live Event Contract.'
    : phase === 'TIER_SETUP'
      ? `Tier ${tier} cleared. Choose a fresh prediction for Tier ${tier + 1}.`
    : phase === 'MERCHANT'
      ? 'Quartermaster Kevin has found you. Regrettably.'
      : phase === 'FINAL_MERCHANT'
        ? 'One last stop before the final chest.'
      : phase === 'ORACLE'
        ? 'The boss is down. The prediction decides who gets back up.'
        : phase === 'VICTORY'
          ? 'Expedition complete.'
          : `Room ${room + 1} of ${TOTAL_ROOMS} · ${monster.species} · ${omenName} · BTC ${direction}`;

  function addLog(message: string) {
    setCombatLog((previous) => [message, ...previous].slice(0, 10));
  }

  function startRun() {
    const nextRoster = buildRoster();
    setRoster(nextRoster); setTier(1); setRoom(0); setTurn(0); setPhase('COMBAT');
    setHp(100); setMonsterHp(nextRoster[0].hp); setPotions((value) => Math.min(MAX_POTIONS, Math.max(START_POTIONS, value))); setWeapon(1); setArmor(0);
    setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
    setJudgeMode(false); setDeathCause('COMBAT');
    setCombatLog([`${omenName} recorded: BTC ${direction} against live dreamDEX market #${market.marketId.slice(-4).toUpperCase()}. No order was sent.`]);
    setNotice(`${omenName} · DELVEWORN RUN STARTED`);
  }

  async function startJudgeDemo() {
    if (judgeLoading) return;
    setJudgeLoading(true); setNotice('LOADING FINALIZED ONCHAIN REPLAY…');
    try {
      const response = await fetch('/api/market?demo=settled');
      const data = await response.json();
      if (!response.ok || !data.market) throw new Error(data.error ?? 'Replay unavailable');
      const replayMarket = data.market as Market;
      const nextRoster = buildRoster((TOTAL_TIERS - 1) * TOTAL_ROOMS + 1);
      const bossRoom = TOTAL_ROOMS - 1;
      setMarket(replayMarket); setRoster(nextRoster); setTier(TOTAL_TIERS); setRoom(bossRoom); setTurn(0); setPhase('COMBAT');
      setHp(72); setMonsterHp(Math.min(24, nextRoster[bossRoom].hp)); setPotions(2); setGold(62); setWeapon(4); setArmor(1);
      setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
      setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
      setJudgeMode(true); setDeathCause('COMBAT');
      setCombatLog([`Judge Demo loaded finalized dreamDEX market #${replayMarket.marketId.slice(-4).toUpperCase()}. The replay uses its real Somnia settlement.`]);
      setNotice('JUDGE DEMO · FINAL BOSS REPLAY · REAL SETTLED MARKET');
    } catch {
      setNotice('JUDGE DEMO UNAVAILABLE · LIVE EXPEDITION STILL READY');
    } finally {
      setJudgeLoading(false);
    }
  }

  function incomingDamage(action: Action, nextTurn: number) {
    const spread = monster.maxDamage - monster.minDamage + 1;
    const raw = monster.minDamage + Math.floor(seededRoll(`${market.marketId}:${room}:${nextTurn}:${action}:enemy`) * spread);
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
    const nextTurn = turn + 1;
    setTurn(nextTurn);

    if (action === 'potion') {
      if (potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit) return;
      const healed = Math.min(25, 100 - hp);
      const incoming = incomingDamage(action, nextTurn);
      const nextHp = Math.max(0, hp + healed - incoming);
      setPotions((value) => value - 1); setCombatPotionUses((value) => value + 1); setHp(nextHp);
      addLog(`Potion restores ${healed} HP. ${monster.name} retaliates for ${incoming}.`);
      if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
      return;
    }

    const roll = seededRoll(`${market.marketId}:${room}:${nextTurn}:${action}:player`);
    const crit = action === 'attack' && seededRoll(`${marketCode}:${room}:${nextTurn}:crit`) < 0.15;
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
    addLog('Quartermaster Kevin appears between you and the final chest. This is probably not a coincidence.');
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

  function returnToFinalChest() {
    if (phase !== 'FINAL_MERCHANT') return;
    setPhase('ORACLE');
    setNotice(remaining > 0 ? 'FINAL CHEST READY · ORACLE ARMED' : 'FINAL CHEST READY · CHECKING SETTLEMENT');
    addLog('You leave Kevin behind and return to the final chest. He keeps the receipt.');
  }

  function nextRoom() {
    if (!['CLEARED', 'MERCHANT'].includes(phase)) return;
    const next = room + 1;
    setRoom(next); setTurn(0); setMonsterHp(roster[next].hp); setCombatPotionUses(0); setPhase('COMBAT');
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
    setCombatLog([`Tier ${nextTier} prediction recorded: BTC ${direction} on dreamDEX market #${market.marketId.slice(-4).toUpperCase()}.`, ...combatLog].slice(0, 10));
    setNotice(`TIER ${nextTier} · NEW PREDICTION LOCKED · ${omenName}`);
  }

  async function checkSettlement(automatic = false) {
    if (oracleBusyRef.current || phase !== 'ORACLE') return;
    oracleBusyRef.current = true; setOracleBusy(true); setOracleChecks((value) => value + 1);
    setNotice(automatic ? 'ORACLE AUTO-CHECK IN PROGRESS…' : 'CHECKING DREAMDEX SETTLEMENT…');
    try {
      const response = await fetch(`/api/market?marketId=${market.marketId}`);
      const data = await response.json();
      const result = data.market as Market;
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
      const won = Number(result.winningOutcome) === (direction === 'UP' ? 0 : 1);
      if (won) {
        const reward = monster.reward + 50;
        setOracleResult('BLESSED'); setGold((value) => value + reward);
        setPhase(judgeMode || tier === TOTAL_TIERS ? 'VICTORY' : 'TIER_SETUP');
        setNotice(judgeMode || tier === TOTAL_TIERS ? `FINAL BOSS DEFEATED · +${reward} GOLD` : `TIER ${tier} CLEARED · NEW BTC PREDICTION REQUIRED`);
        addLog(`${omenName} was correct. The boss stays down: ${monster.reward} boss gold + 50 prediction gold.`);
      } else {
        setOracleResult('CURSED'); setHp(0); setDeathCause('PREDICTION'); setPhase('DEAD'); setNotice('PREDICTION WRONG · BOSS LAST STAND · RUN ENDED');
        addLog(`${omenName} was wrong. The fallen boss rises for one final strike. No boss reward is awarded.`);
      }
    } catch {
      setNotice(automatic ? 'SETTLEMENT FEED RETRYING IN 5S' : 'SETTLEMENT FEED UNAVAILABLE · AUTO-RETRY ARMED');
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
    setRoster(nextRoster); setTier(1); setPhase('SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(nextRoster[0].hp);
    setPotions(profile.potions); setGold(profile.gold); setWeapon(1); setArmor(0); setCombatPotionUses(0); setCombatLog([]); setLastReward('');
    setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false;
    setJudgeMode(false); setJudgeLoading(false); setDeathCause('COMBAT');
    setNotice('LIVE DREAMDEX MARKET · READ ONLY');
  }

  const resultHeading = oracleResult === 'BLESSED' ? 'Combat and prediction conquered.' : oracleResult === 'CURSED' ? 'The boss strikes back.' : 'Dungeon conquered.';
  const resultCopy = oracleResult === 'BLESSED'
    ? `${omenName} was correct. The final boss stays down and the run earns both boss and prediction gold.`
    : oracleResult === 'CURSED'
      ? `${omenName} was wrong. You won the combat, but the boss's last stand ends the run.`
      : 'The Event Contract was voided, so the defeated boss remained down without a prediction penalty.';

  return (
    <main className="game-shell">
      <div className="game-column">
        <header className="game-header">
          <p className="eyebrow">DELVEWORN · EVENT CONTRACTS EDITION</p>
          <h1>MARKET DUNGEON</h1>
          <p className="subtitle">{subtitle}</p>
          <div className="safety-line"><span className="live-dot" /> SOMNIA MAINNET <i /> LIVE DREAMDEX DATA <i /> NO TRANSACTIONS</div>
        </header>

        <section className="market-ribbon" aria-label="Live dreamDEX Event Contract">
          <div><span>BTC · 15 MIN</span><strong>{market.status}</strong></div>
          <div><span>LINE</span><strong>${market.strikeUsd}</strong></div>
          <div><span>EXPIRY</span><strong>{formatTime(remaining)}</strong><small>{expiryLabel} UTC</small></div>
          <div><span>DUNGEON OMEN</span><strong className={direction === 'UP' ? 'text-up' : 'text-down'}>{omenIcon} {omenName}</strong><small>BTC {direction}</small></div>
        </section>

        {judgeMode && phase !== 'SETUP' && (
          <section className="judge-replay-banner" aria-label="Judge Demo progress">
            <div className="judge-replay-heading">
              <span>⚡ 2-MIN JUDGE DEMO</span>
              <strong>FINALIZED MARKET REPLAY · #{marketCode}</strong>
              <small>Tiers 1–3 and Rooms 1–9 were fast-forwarded. Defeat the final boss, then the real prediction decides who stays down.</small>
            </div>
            <div className="judge-replay-steps">
              <span className={judgeStep === 1 ? 'active' : 'done'}><b>1</b> DEFEAT FINAL BOSS</span>
              <span className={judgeStep === 2 ? 'active' : judgeStep > 2 ? 'done' : ''}><b>2</b> MERCHANT OPTIONAL</span>
              <span className={judgeStep === 3 ? 'active' : ''}><b>3</b> REVEAL BOSS FATE</span>
            </div>
          </section>
        )}

        {!judgeMode && <TierTrack activeTier={phase === 'TIER_SETUP' ? tier + 1 : tier} complete={phase === 'VICTORY'} failed={phase === 'DEAD'} />}

        {phase !== 'SETUP' && (
          <section className="sticky-hud" aria-label="Expedition status">
            <div><span>HEALTH</span><strong>❤️ {hp}/100</strong><div className="mini-bar"><i style={{ width: `${playerPercent}%` }} /></div></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div>
            <div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div>
            <div className="hud-wide"><span>LOADOUT</span><strong>⚔️ Lv {weapon} · 🛡️ Lv {armor}</strong></div>
            <div className="hud-wide"><span>EXPEDITION</span><strong>TIER {tier}/{TOTAL_TIERS} · {roomsCleared}/{TOTAL_ROOMS} · {omenIcon} {omenName}</strong></div>
          </section>
        )}

        <section className={`main-card ${isBoss && !['SETUP', 'TIER_SETUP'].includes(phase) ? 'boss-card' : ''}`}>
          {phase === 'SETUP' ? (
            <div className="setup-view">
              <div className="setup-monsters" aria-hidden="true">
                <img src="/monsters/zombie-1-grave-belle.webp" alt="" />
                <img className="front" src="/monsters/goblin-1-gary.webp" alt="" />
                <img src="/monsters/orc-1-thud.webp" alt="" />
              </div>
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
              <div className="rule-grid">
                <div><span>⚔️</span><b>WIN THE COMBAT</b><small>Fight normally and reduce the boss to zero HP</small></div>
                <div><span>🔮</span><b>WIN THE PREDICTION</b><small>Correct BTC outcome keeps the defeated boss down</small></div>
                <div><span>🧰</span><b>BUILD WITHIN THE RUN</b><small>Kevin&apos;s attack and defense upgrades last until defeat</small></div>
                <div><span>🏰</span><b>CLIMB FOUR TIERS</b><small>Every tier brings a new roster, boss and prediction</small></div>
              </div>
              <div className="competition-note">Built for the Somnia × dreamDEX Event Contracts Hackathon.</div>
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
              <h2>Against all evidence, you remain alive.</h2>
              <p className="muted">Heal safely with a potion before opening the next gate.</p>
              <div className="reward-box"><span>RECOVERED</span><strong><GoldIcon /> {lastReward}</strong></div>
            </div>
          ) : phase === 'VICTORY' ? (
            <div className="result-view">
              <div className="result-icon">{oracleResult === 'BLESSED' ? '✨' : oracleResult === 'CURSED' ? '📉' : '👑'}</div>
              <p className="section-kicker">{judgeMode ? 'JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED' : `TIER ${tier}/${TOTAL_TIERS} · FULL RUN COMPLETE`} · {oracleResult ?? 'SETTLED'}</p>
              <h2>{resultHeading}</h2><p className="muted">{resultCopy}</p>
              {judgeMode && <div className="judge-verification"><span>✓ VERIFIED REPLAY</span><strong>dreamDEX market #{marketCode}</strong><small>Finalized outcome read from Somnia chain 5031 · no mocked settlement</small></div>}
              <div className="victory-conditions resolved"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>{oracleResult === 'VOID' ? '○ VOID EXCEPTION' : '✓ CONDITION 2'}</span><strong>{oracleResult === 'VOID' ? 'Prediction voided · no loss' : 'BTC prediction correct'}</strong></div></div>
              <div className="final-stats"><div><span>TIERS CLEARED</span><strong>{judgeMode ? 'REPLAY' : `${tier}/${TOTAL_TIERS}`}</strong></div><div><span>FINAL GOLD</span><strong><GoldIcon /> {gold}</strong></div></div>
            </div>
          ) : phase === 'DEAD' ? (
            <div className="result-view">
              <div className="result-icon">☠️</div><p className="section-kicker">{judgeMode ? 'JUDGE DEMO COMPLETE · ONCHAIN LOSS VERIFIED' : `TIER ${tier} · EXPEDITION ENDED`}</p>
              <h2>{deathCause === 'PREDICTION' ? 'The boss strikes back.' : 'You fell in combat.'}</h2><p className="muted">{deathCause === 'PREDICTION' ? resultCopy : 'The prediction cannot save a lost fight. Gold persists, potions return to at least the starting amount, and attack and defense reset for the next run.'}</p>
              {deathCause === 'PREDICTION' && <div className="victory-conditions failed"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>✕ CONDITION 2</span><strong>BTC prediction incorrect</strong></div></div>}
              {judgeMode && deathCause === 'PREDICTION' && <div className="judge-verification"><span>✓ VERIFIED REPLAY</span><strong>dreamDEX market #{marketCode}</strong><small>The losing outcome is the real finalized result from Somnia chain 5031.</small></div>}
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
                {judgeMode && <div className="judge-stage-label">⚡ FINAL TIER REPLAY · TIERS 1–3 + ROOMS 1–9 CLEARED · BOSS WOUNDED</div>}
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
                  <div className="integration-proof"><span>SOMNIA CHAIN 5031</span><span>MARKET #{marketCode}</span><span>READ-ONLY CHAIN CALL</span></div>
                </div>}
              </div>
            </div>
          )}
        </section>

        <section className="action-dock">
          {phase === 'SETUP' ? (
            <div className="judge-entry">
              <button className="primary-action" onClick={startRun} disabled={!marketReady}>{marketReady ? <>BEGIN TIER 1 · {omenIcon} {omenName}</> : 'WAITING FOR ACTIVE BTC MARKET…'}</button>
              <button className="judge-action" onClick={() => void startJudgeDemo()} disabled={judgeLoading}>⚡ {judgeLoading ? 'LOADING SETTLED MARKET…' : '2-MIN JUDGE DEMO · REAL MARKET REPLAY'}</button>
              <small>Judge Demo skips directly to the wounded Tier 4 boss using a finalized BTC Event Contract from Somnia mainnet.</small>
            </div>
          ) : phase === 'TIER_SETUP' ? (
            <div className="tier-action">
              <button className="primary-action" onClick={startNextTier} disabled={!marketReady}>{marketReady ? <>ENTER TIER {tier + 1} · {omenIcon} {omenName}</> : 'WAITING FOR THE NEXT BTC MARKET…'}</button>
              <small>Same run: gold, potions, health, attack and defense continue into the next tier.</small>
            </div>
          ) : phase === 'COMBAT' ? (
            <>
              {judgeMode && <div className="judge-next-action"><span>JUDGE STEP 1 OF 3</span><b>Defeat the wounded boss, then choose merchant or reveal its prediction fate.</b></div>}
              <div className="combat-actions">
                <button className="attack" onClick={() => act('attack')}><b>⚔️ ATTACK</b><strong>DAMAGE {attackMin}–{attackMax}</strong><small>Reliable · 15% critical</small></button>
                <button className="storm" onClick={() => act('storm')}><b>⚡ STORM</b><strong>DAMAGE 0–{stormMax}</strong><small>High variance · no critical</small></button>
              </div>
              <button className="potion" onClick={() => act('potion')} disabled={potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit}><span><b>🧪 POTION · {potions}/{MAX_POTIONS}</b><small>Heal up to 25 HP · enemy retaliates</small></span><strong>{combatPotionUses}/{combatPotionLimit}</strong></button>
            </>
          ) : phase === 'CLEARED' ? (
            <div className="between-actions">
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>🧪 HEAL +25 HP · {potions}/{MAX_POTIONS}</button>
              <button className="primary-action" onClick={nextRoom}>🎲 NEXT ROOM</button>
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
              <div className="shop-heading"><div><span>KEVIN&apos;S AFTERCARE</span><b>Patch up before the final chest</b></div><strong><GoldIcon /> {gold}</strong></div>
              <div className="shop-grid">
                <button onClick={() => finalMerchantHeal(false)} disabled={hp >= 100 || gold < 8}><b>❤️ FIELD DRESSING</b><small>Heal up to 25 HP</small><strong><GoldIcon /> 8</strong></button>
                <button onClick={() => finalMerchantHeal(true)} disabled={hp >= 100 || gold < finalHealCost}><b>✨ FULL TREATMENT</b><small>{hp >= 100 ? 'Already at full health' : `Restore ${100 - hp} HP`}</small><strong><GoldIcon /> {finalHealCost}</strong></button>
              </div>
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>USE OWN POTION SAFELY · {potions}/{MAX_POTIONS}</button>
              <button className="oracle-action" onClick={returnToFinalChest}>🔮 RETURN TO FINAL CHEST</button>
            </div>
          ) : phase === 'ORACLE' ? (
            <div className="oracle-dock">
              <div className="between-actions">
                <button className="heal-action" onClick={visitFinalMerchant}>🧰 VISIT TRAVELLING MERCHANT</button>
                <button className="oracle-action" onClick={() => void checkSettlement(false)} disabled={oracleBusy}>🔮 {oracleBusy ? 'CHECKING…' : 'REVEAL BOSS FATE'}</button>
              </div>
              <small>{judgeMode ? 'Finalized replay · reveal whether combat victory becomes permanent' : remaining > 0 ? `Automatic checks begin in ${formatTime(remaining)}` : 'Automatic settlement checks run every 5 seconds'}</small>
            </div>
          ) : (
            <div className="new-run-action"><button className="primary-action" onClick={reset}>↻ BEGIN NEW EXPEDITION</button><small>Keep gold and up to 5 potions · reset attack and defense</small></div>
          )}
        </section>

        <section className="dungeon-log">
          <div><span>DUNGEON LOG</span><b>{notice}</b></div>
          {combatLog.length ? combatLog.map((entry, index) => <p key={`${entry}-${index}`} className={index === 0 ? 'latest' : ''}>{entry}</p>) : <p>The dungeon is quiet. This is almost certainly temporary.</p>}
        </section>

        <footer><p>DELVEWORN × DREAMDEX EVENT CONTRACTS · SOMNIA</p><span>Competition prototype · no wallet · no approval · no order submission · market #{marketCode || '—'}</span></footer>
      </div>
    </main>
  );
}
