'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Direction = 'UP' | 'DOWN';
type Action = 'attack' | 'storm' | 'potion';
type Phase = 'SETUP' | 'COMBAT' | 'CLEARED' | 'ORACLE' | 'VICTORY' | 'DEAD';
type OracleResult = 'BLESSED' | 'CURSED' | 'VOID' | null;
type SupplyChoice = 'rest' | 'weapon' | 'armor' | null;

type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  question: string; strikeUsd: string; tradingStart?: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null;
};

type Monster = {
  name: string; species: string; flavor: string; image: string;
  hp: number; minDamage: number; maxDamage: number; reward: number;
};

const TOTAL_ROOMS = 10;

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  marketAddress: '', poolAddress: '', collateral: '',
  question: 'BTC closes at or above its opening price', strikeUsd: '—',
  expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING',
  finalized: false, voided: false, winningOutcome: null,
};

const goblinNames = ['Gary, Market Intern', 'Gribble the Auditor', "Gary's Supervisor", 'Kevin the Unqualified', 'Deputy Gary'];
const orcNames = ['Thud the Liquidator', 'Brutus of Compliance', 'Gronk the Underwriter', 'Meatwall from Risk', 'Thud Senior'];

function monsterFor(room: number): Monster {
  if (room === TOTAL_ROOMS - 1) {
    return {
      name: 'The Oracle Warden', species: 'Market Boss · Room 10',
      flavor: 'The dungeon is finished. The market still has comments.',
      image: '/monsters/boss-1-dungeon-lord.png', hp: 78, minDamage: 10, maxDamage: 16, reward: 40,
    };
  }
  const isGoblin = room % 2 === 0;
  const tier = Math.floor(room / 2);
  return {
    name: isGoblin ? goblinNames[tier] : orcNames[tier],
    species: `${isGoblin ? 'Goblin' : 'Orc'} · Room ${room + 1}`,
    flavor: isGoblin
      ? 'Management insists this encounter was included in the forecast.'
      : 'He considers diversification a sign of weakness.',
    image: isGoblin ? '/monsters/goblin-1-gary.png' : '/monsters/orc-1-thud.png',
    hp: (isGoblin ? 24 : 30) + tier * 9,
    minDamage: (isGoblin ? 4 : 6) + tier,
    maxDamage: (isGoblin ? 8 : 10) + tier * 2,
    reward: (isGoblin ? 7 : 10) + tier * 3,
  };
}

function seededRoll(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function gateTime(expiryIso: string) {
  return new Date(expiryIso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  });
}

export default function Home() {
  const [market, setMarket] = useState<Market>(fallback);
  const [direction, setDirection] = useState<Direction>('UP');
  const [phase, setPhase] = useState<Phase>('SETUP');
  const [room, setRoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const [hp, setHp] = useState(100);
  const [monsterHp, setMonsterHp] = useState(monsterFor(0).hp);
  const [potions, setPotions] = useState(3);
  const [gold, setGold] = useState(0);
  const [weapon, setWeapon] = useState(1);
  const [armor, setArmor] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState('LIVE MARKET · READ ONLY');
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [oracleBusy, setOracleBusy] = useState(false);
  const [oracleChecks, setOracleChecks] = useState(0);
  const [oracleResult, setOracleResult] = useState<OracleResult>(null);
  const [preparations, setPreparations] = useState<string[]>([]);
  const [supplyChoice, setSupplyChoice] = useState<SupplyChoice>(null);
  const oracleBusyRef = useRef(false);

  useEffect(() => {
    fetch('/api/market').then((response) => response.json()).then((data) => {
      if (data.market) setMarket(data.market);
      else setNotice('MARKET FEED RETRYING · NO ACTION REQUIRED');
    }).catch(() => setNotice('MARKET FEED RETRYING · NO ACTION REQUIRED'));
  }, []);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Number(market.expiry) - Math.floor(Date.now() / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [market.expiry]);

  const monster = monsterFor(room);
  const marketCode = market.marketId.slice(-4).toUpperCase();
  const monsterPercent = Math.max(0, Math.min(100, (monsterHp / monster.hp) * 100));
  const playerPercent = Math.max(0, Math.min(100, hp));
  const attackMin = 7 + weapon * 2;
  const attackMax = 11 + weapon * 2;
  const stormMax = 20 + weapon * 3;
  const currentRoomCleared = phase === 'CLEARED' || phase === 'ORACLE' || phase === 'VICTORY';
  const roomsCleared = phase === 'SETUP' ? 0 : room + (currentRoomCleared ? 1 : 0);
  const isBoss = room === TOTAL_ROOMS - 1;
  const isSupplyStop = phase === 'CLEARED' && room === 4;
  const subtitle = phase === 'SETUP'
    ? 'Play the dungeon. Let the market shape the ending.'
    : phase === 'ORACLE'
      ? 'Ten rooms cleared. Final loot awaits the oracle.'
      : phase === 'VICTORY'
        ? 'Expedition complete.'
        : `Room ${room + 1} of ${TOTAL_ROOMS} · BTC ${direction}`;
  const expiryLabel = useMemo(() => gateTime(market.expiryIso), [market.expiryIso]);

  function addLog(message: string) {
    setCombatLog((previous) => [message, ...previous].slice(0, 8));
  }

  function startRun() {
    const first = monsterFor(0);
    setPhase('COMBAT'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(first.hp);
    setPotions(3); setGold(0); setWeapon(1); setArmor(0); setSupplyChoice(null);
    setOracleChecks(0); setOracleResult(null); setPreparations([]); setOracleBusy(false); oracleBusyRef.current = false;
    setCombatLog([`BTC ${direction} recorded as the expedition call. No order was sent.`]);
    setNotice(`${direction} RECORDED · TEN-ROOM RUN STARTED`);
  }

  function retaliate(action: Action, nextTurn: number) {
    const spread = monster.maxDamage - monster.minDamage + 1;
    const raw = monster.minDamage + Math.floor(seededRoll(`${market.marketId}:${room}:${nextTurn}:${action}:enemy`) * spread);
    return Math.max(1, raw - armor);
  }

  function act(action: Action) {
    if (phase !== 'COMBAT') return;
    const nextTurn = turn + 1;
    setTurn(nextTurn);

    if (action === 'potion') {
      if (potions === 0 || hp >= 100) return;
      const healed = Math.min(25, 100 - hp);
      const incoming = retaliate(action, nextTurn);
      const nextHp = Math.max(0, hp + healed - incoming);
      setPotions((value) => value - 1); setHp(nextHp);
      addLog(`Potion restores ${healed} HP. ${monster.name} answers for ${incoming}.`);
      if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
      return;
    }

    const roll = seededRoll(`${market.marketId}:${room}:${nextTurn}:${action}:player`);
    const crit = action === 'attack' && seededRoll(`${marketCode}:${room}:${nextTurn}:crit`) < 0.15;
    const baseDamage = action === 'attack'
      ? attackMin + Math.floor(roll * (attackMax - attackMin + 1))
      : Math.floor(roll * (stormMax + 1));
    const damage = crit ? baseDamage * 2 : baseDamage;
    const nextMonsterHp = Math.max(0, monsterHp - damage);
    setMonsterHp(nextMonsterHp);

    if (nextMonsterHp === 0) {
      setGold((value) => value + monster.reward);
      if (isBoss) {
        setPhase('ORACLE');
        setNotice(remaining > 0 ? 'ROOM 10 CLEARED · ORACLE ARMED' : 'ROOM 10 CLEARED · CHECKING ORACLE');
        addLog(`The Oracle Warden falls. +${monster.reward} gold. Market settlement now modifies the final chest.`);
      } else {
        if ((room + 1) % 3 === 0) {
          setWeapon((value) => value + 1);
          addLog(`${monster.name} defeated. +${monster.reward} gold · weapon upgraded.`);
        } else if ((room + 1) % 2 === 0) {
          setPotions((value) => Math.min(5, value + 1));
          addLog(`${monster.name} defeated. +${monster.reward} gold · potion recovered.`);
        } else {
          addLog(`${monster.name} defeated. +${monster.reward} gold.`);
        }
        setPhase('CLEARED'); setNotice(`ROOM ${room + 1} CLEARED · ${TOTAL_ROOMS - room - 1} REMAIN`);
      }
      return;
    }

    const incoming = retaliate(action, nextTurn);
    const nextHp = Math.max(0, hp - incoming);
    setHp(nextHp);
    addLog(`${crit ? 'Critical hit! ' : ''}${action === 'storm' ? 'Storm' : 'Attack'} deals ${damage}. You take ${incoming}.`);
    if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
  }

  function chooseSupply(choice: Exclude<SupplyChoice, null>) {
    if (!isSupplyStop || supplyChoice) return;
    if (choice === 'rest') {
      const healed = Math.min(25, 100 - hp);
      setHp((value) => Math.min(100, value + 25));
      addLog(`Supply stop: you recover ${healed} HP.`);
    } else if (choice === 'weapon' && gold >= 10) {
      setGold((value) => value - 10); setWeapon((value) => value + 1);
      addLog('Supply stop: weapon upgraded for 10 gold. The receipt looks suspicious.');
    } else if (choice === 'armor' && gold >= 10) {
      setGold((value) => value - 10); setArmor((value) => value + 1);
      addLog('Supply stop: armor upgraded for 10 gold. It almost fits.');
    } else return;
    setSupplyChoice(choice);
  }

  function nextRoom() {
    const next = room + 1;
    const nextMonster = monsterFor(next);
    setRoom(next); setTurn(0); setMonsterHp(nextMonster.hp); setPhase('COMBAT');
    setNotice(next === TOTAL_ROOMS - 1 ? 'ROOM 10 · MARKET BOSS' : `ROOM ${next + 1} · READY`);
    addLog(`The gate opens. Room ${next + 1} is regrettably occupied.`);
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
        setNotice(remaining > 0 ? 'RUN COMPLETE · AUTO-CHECK STARTS AT EXPIRY' : 'ORACLE PENDING · NEXT AUTO-CHECK IN 5S');
        if (!automatic) addLog('Settlement is pending. The ten-room run is already complete; only the final loot modifier remains.');
        return;
      }
      if (result.voided) {
        setOracleResult('VOID'); setPhase('VICTORY'); setNotice('MARKET VOIDED · BASE LOOT PRESERVED');
        addLog('The market was voided. The completed run keeps its base rewards.');
        return;
      }
      const won = Number(result.winningOutcome) === (direction === 'UP' ? 0 : 1);
      if (won) {
        setOracleResult('BLESSED'); setGold((value) => value + 50); setPhase('VICTORY');
        setNotice('ORACLE BLESSING · +50 GOLD');
        addLog(`BTC ${direction} wins. The final chest receives a +50 gold oracle blessing.`);
      } else {
        setOracleResult('CURSED'); setGold((value) => Math.max(0, value - 20)); setPhase('VICTORY');
        setNotice('ORACLE CURSE · RUN STILL COMPLETE');
        addLog(`BTC ${direction} loses. The run survives, but the final chest pays a 20 gold curse.`);
      }
    } catch {
      setNotice(automatic ? 'ORACLE FEED RETRYING IN 5S' : 'SETTLEMENT FEED UNAVAILABLE · AUTO-RETRY ARMED');
    } finally {
      oracleBusyRef.current = false; setOracleBusy(false);
    }
  }

  function prepare(kind: 'search' | 'brew' | 'appeal') {
    if (preparations.includes(kind) || phase !== 'ORACLE') return;
    setPreparations((value) => [...value, kind]);
    if (kind === 'search') {
      setGold((value) => value + 4); addLog('You search the boss room. +4 gold. This is called post-combat liquidity.');
    } else if (kind === 'brew') {
      setPotions((value) => Math.min(5, value + 1)); addLog('You brew one last potion. Its regulatory status remains unclear.');
    } else {
      setGold((value) => value + 6); addLog('You file an appeal against the oracle. +6 gold in recovered fees.');
    }
  }

  useEffect(() => {
    if (phase !== 'ORACLE' || remaining > 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await checkSettlement(true);
      if (!cancelled) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  // Polling is intentionally armed only after the selected market expires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining > 0, market.marketId, direction]);

  function reset() {
    setPhase('SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(monsterFor(0).hp);
    setPotions(3); setGold(0); setWeapon(1); setArmor(0); setCombatLog([]); setPreparations([]);
    setSupplyChoice(null); setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false;
    setNotice('LIVE MARKET · READ ONLY');
  }

  const resultHeading = oracleResult === 'BLESSED' ? 'Oracle-blessed victory.' : oracleResult === 'CURSED' ? 'Victory, with paperwork.' : 'Dungeon conquered.';
  const resultCopy = oracleResult === 'BLESSED'
    ? `BTC ${direction} added 50 gold to the completed run.`
    : oracleResult === 'CURSED'
      ? `BTC ${direction} missed. The run still counts; only 20 gold was lost.`
      : 'The market was voided, so the completed run kept its base rewards.';

  return (
    <main className="game-shell">
      <div className="game-column">
        <header className="game-header">
          <p className="eyebrow">FULLY READ-ONLY · SOMNIA</p>
          <h1>MARKET DUNGEON</h1>
          <p className="subtitle">{subtitle}</p>
          <div className="safety-line"><span className="live-dot" /> LIVE DREAMDEX DATA <i /> NO WALLET · NO TRANSACTIONS</div>
        </header>

        <section className="market-ribbon" aria-label="Active market">
          <div><span>BTC · 15 MIN</span><strong>{market.status}</strong></div>
          <div><span>LINE</span><strong>${market.strikeUsd}</strong></div>
          <div><span>EXPIRY</span><strong>{formatTime(remaining)}</strong><small>{expiryLabel} UTC</small></div>
          <div><span>CALL</span><strong className={direction === 'UP' ? 'text-up' : 'text-down'}>{direction === 'UP' ? '↗ UP' : '↘ DOWN'}</strong></div>
        </section>

        {phase !== 'SETUP' && (
          <section className="sticky-hud" aria-label="Expedition status">
            <div><span>HEALTH</span><strong>❤️ {hp}/100</strong><div className="mini-bar"><i style={{ width: `${playerPercent}%` }} /></div></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/5</strong></div>
            <div><span>GOLD</span><strong>🪙 {gold}</strong></div>
            <div className="hud-wide"><span>LOADOUT</span><strong>⚔️ Lv {weapon} · 🛡️ Lv {armor}</strong></div>
            <div className="hud-wide"><span>EXPEDITION</span><strong>{roomsCleared}/{TOTAL_ROOMS} CLEARED · BTC {direction}</strong></div>
          </section>
        )}

        <section className={`main-card ${isBoss && phase !== 'SETUP' ? 'boss-card' : ''}`}>
          {phase === 'SETUP' ? (
            <div className="setup-view">
              <div className="dungeon-sigil">🏰</div>
              <p className="section-kicker">ONE MARKET · TEN ROOMS</p>
              <h2>The Dungeon Runs Normally</h2>
              <p className="muted">Choose BTC UP or DOWN once, then play ten Delveworn-style rooms. The market never blocks combat—it only modifies the final chest after Room 10.</p>
              <div className="prediction-card">
                <span>THE LINE TO BEAT</span><strong>${market.strikeUsd}</strong><p>{market.question}</p>
                <div className="prediction-buttons">
                  <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b>↗ UP</b><small>BTC finishes at or above the line</small></button>
                  <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>↘ DOWN</b><small>BTC finishes below the line</small></button>
                </div>
              </div>
              <div className="rule-grid">
                <div><span>⚔️</span><b>ROOMS 1–9</b><small>Normal combat, loot and upgrades</small></div>
                <div><span>🧰</span><b>ROOM 5</b><small>Supply stop and one upgrade</small></div>
                <div><span>👑</span><b>ROOM 10</b><small>Fight the boss normally</small></div>
                <div><span>🔮</span><b>AFTER BOSS</b><small>Market modifies final loot only</small></div>
              </div>
            </div>
          ) : phase === 'CLEARED' ? (
            <div className="result-view cleared-view">
              <div className="result-icon">{isSupplyStop ? '🧰' : '🏆'}</div>
              <p className="section-kicker">{isSupplyStop ? 'ROOM 5 · SUPPLY STOP' : `ROOM ${room + 1} CLEARED`}</p>
              <h2>{isSupplyStop ? 'Quartermaster break.' : 'Against all evidence, you remain alive.'}</h2>
              {isSupplyStop ? <>
                <p className="muted">Choose one preparation before the lower dungeon.</p>
                <div className="supply-actions">
                  <button onClick={() => chooseSupply('rest')} disabled={Boolean(supplyChoice) || hp >= 100}><b>❤️ REST</b><small>Recover up to 25 HP</small></button>
                  <button onClick={() => chooseSupply('weapon')} disabled={Boolean(supplyChoice) || gold < 10}><b>⚔️ WEAPON</b><small>Level +1 · 10 gold</small></button>
                  <button onClick={() => chooseSupply('armor')} disabled={Boolean(supplyChoice) || gold < 10}><b>🛡️ ARMOR</b><small>Level +1 · 10 gold</small></button>
                </div>
                {supplyChoice && <div className="reward-box"><span>PREPARATION COMPLETE</span><strong>{supplyChoice.toUpperCase()} SELECTED</strong></div>}
              </> : <div className="reward-box"><span>RECOVERED</span><strong>{(room + 1) % 3 === 0 ? '⚔️ Weapon Level +1' : (room + 1) % 2 === 0 ? '🧪 Potion +1' : '🎒 Base loot'} · 🪙 {monster.reward} Gold</strong></div>}
            </div>
          ) : phase === 'VICTORY' ? (
            <div className="result-view">
              <div className="result-icon">{oracleResult === 'BLESSED' ? '✨' : oracleResult === 'CURSED' ? '📉' : '👑'}</div>
              <p className="section-kicker">TEN ROOMS CLEARED · {oracleResult ?? 'SETTLED'}</p>
              <h2>{resultHeading}</h2><p className="muted">{resultCopy}</p>
              <div className="final-stats"><div><span>ROOMS</span><strong>10</strong></div><div><span>FINAL GOLD</span><strong>🪙 {gold}</strong></div></div>
            </div>
          ) : phase === 'DEAD' ? (
            <div className="result-view">
              <div className="result-icon">☠️</div><p className="section-kicker">EXPEDITION ENDED</p>
              <h2>You died.</h2><p className="muted">The dungeon updates its performance statistics. The market prediction remains read-only and irrelevant to the failed run.</p>
              <div className="final-stats"><div><span>ROOMS</span><strong>{roomsCleared}</strong></div><div><span>GOLD</span><strong>🪙 {gold}</strong></div></div>
            </div>
          ) : (
            <div className="combat-view">
              <div className="monster-stage">
                <img src={monster.image} alt={monster.name} /><div className="stage-fade" />
                <div className="room-map ten-room-map" aria-label="Dungeon progress">
                  {Array.from({ length: TOTAL_ROOMS }, (_, index) => {
                    const done = index < room || (index === room && currentRoomCleared);
                    return <span key={index} className={done ? 'done' : index === room ? 'active' : ''}>{index === TOTAL_ROOMS - 1 ? '◆' : index + 1}</span>;
                  })}
                </div>
              </div>
              <div className="monster-info">
                {isBoss && <p className="boss-label">👑 MARKET BOSS</p>}
                <div className="monster-heading"><div><h2>{monster.name}</h2><span>{monster.species}</span></div><b>ROOM {room + 1}/{TOTAL_ROOMS}</b></div>
                <p className="flavor">“{monster.flavor}”</p>
                <div className="hp-label"><span>ENEMY HP</span><strong>{monsterHp} / {monster.hp}</strong></div>
                <div className="enemy-bar"><i className={isBoss ? 'boss-health' : ''} style={{ width: `${monsterPercent}%` }} /></div>
                <div className="enemy-stats"><div><span>ENEMY DAMAGE</span><strong>💥 {monster.minDamage}–{monster.maxDamage}</strong></div><div><span>BASE REWARD</span><strong>🪙 {monster.reward}</strong></div></div>
                {phase === 'ORACLE' && <div className="oracle-lock">
                  <div className="oracle-status">
                    <span>🔮 RUN COMPLETE · {remaining > 0 ? 'AUTO-CHECK AT EXPIRY' : oracleBusy ? 'CHECKING ORACLE' : 'AUTO-CHECK EVERY 5 SECONDS'}</span>
                    <strong>{remaining > 0 ? formatTime(remaining) : oracleBusy ? 'READING…' : `${oracleChecks} CHECK${oracleChecks === 1 ? '' : 'S'}`}</strong>
                    <small>Only the final loot modifier is pending. The boss and all ten rooms are already cleared.</small>
                  </div>
                  <div className="waiting-label"><span>POST-RUN ACTIVITIES</span><small>Each can be used once</small></div>
                  <div className="waiting-actions">
                    <button onClick={() => prepare('search')} disabled={preparations.includes('search')}><b>🪨 SEARCH</b><small>{preparations.includes('search') ? '✓ +4 GOLD' : 'Boss room · +4 gold'}</small></button>
                    <button onClick={() => prepare('brew')} disabled={preparations.includes('brew') || potions >= 5}><b>🧪 BREW</b><small>{preparations.includes('brew') ? '✓ +1 POTION' : 'Make one potion'}</small></button>
                    <button onClick={() => prepare('appeal')} disabled={preparations.includes('appeal')}><b>📜 APPEAL</b><small>{preparations.includes('appeal') ? '✓ +6 GOLD' : 'Recover filing fees'}</small></button>
                  </div>
                </div>}
              </div>
            </div>
          )}
        </section>

        <section className="action-dock">
          {phase === 'SETUP' ? (
            <button className="primary-action" onClick={startRun}>ENTER TEN-ROOM DUNGEON · BTC {direction}</button>
          ) : phase === 'COMBAT' ? (
            <>
              <div className="combat-actions">
                <button className="attack" onClick={() => act('attack')}><b>⚔️ ATTACK</b><strong>DAMAGE {attackMin}–{attackMax}</strong><small>Reliable · 15% critical</small></button>
                <button className="storm" onClick={() => act('storm')}><b>⚡ STORM</b><strong>DAMAGE 0–{stormMax}</strong><small>High variance · no critical</small></button>
              </div>
              <button className="potion" onClick={() => act('potion')} disabled={potions === 0 || hp >= 100}><span><b>🧪 POTION · {potions}/5</b><small>Heal up to 25 HP · enemy retaliates</small></span><strong>USE</strong></button>
            </>
          ) : phase === 'CLEARED' ? (
            <button className="primary-action" onClick={nextRoom}>🎲 CONTINUE TO ROOM {room + 2}</button>
          ) : phase === 'ORACLE' ? (
            <div className="oracle-dock">
              <button className="oracle-action" onClick={() => void checkSettlement(false)} disabled={oracleBusy}>🔮 {oracleBusy ? 'CHECKING SETTLEMENT…' : 'CHECK FINAL LOOT NOW'}</button>
              <small>{remaining > 0 ? `Automatic polling begins in ${formatTime(remaining)}` : 'Automatic settlement checks run every 5 seconds'}</small>
            </div>
          ) : (
            <button className="primary-action" onClick={reset}>↻ BEGIN NEW EXPEDITION</button>
          )}
        </section>

        <section className="dungeon-log">
          <div><span>DUNGEON LOG</span><b>{notice}</b></div>
          {combatLog.length ? combatLog.map((entry, index) => <p key={`${entry}-${index}`} className={index === 0 ? 'latest' : ''}>{entry}</p>) : <p>The dungeon is quiet. This is almost certainly temporary.</p>}
        </section>

        <footer><p>MARKET DUNGEON · DREAMDEX EVENT CONTRACTS · SOMNIA</p><span>Read-only prototype · no wallet · no approval · no order submission · market #{marketCode || '—'}</span></footer>
      </div>
    </main>
  );
}
