'use client';

import { useEffect, useMemo, useState } from 'react';

type Direction = 'UP' | 'DOWN';
type Action = 'attack' | 'storm' | 'potion';
type Phase = 'SETUP' | 'COMBAT' | 'CLEARED' | 'ORACLE' | 'VICTORY' | 'DEAD' | 'VOIDED';

type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  question: string; strikeUsd: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null;
};

type Monster = {
  name: string; species: string; flavor: string; image: string;
  hp: number; minDamage: number; maxDamage: number; reward: number;
};

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  marketAddress: '', poolAddress: '', collateral: '',
  question: 'BTC closes at or above its opening price', strikeUsd: '—',
  expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING',
  finalized: false, voided: false, winningOutcome: null,
};

const monsters: Monster[] = [
  {
    name: 'Gary, Market Intern', species: 'Goblin · Room 1',
    flavor: 'He was told to manage risk. He has misunderstood the assignment.',
    image: '/monsters/goblin-1-gary.png', hp: 24, minDamage: 4, maxDamage: 8, reward: 8,
  },
  {
    name: 'Thud the Liquidator', species: 'Orc · Room 2',
    flavor: 'His strategy has one step, and that step is usually you.',
    image: '/monsters/orc-1-thud.png', hp: 34, minDamage: 6, maxDamage: 10, reward: 14,
  },
  {
    name: 'The Oracle Warden', species: 'Market Boss · Final Room',
    flavor: 'Price is temporary. Performance reviews are eternal.',
    image: '/monsters/boss-1-dungeon-lord.png', hp: 48, minDamage: 8, maxDamage: 13, reward: 30,
  },
];

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
  const [monsterHp, setMonsterHp] = useState(monsters[0].hp);
  const [potions, setPotions] = useState(3);
  const [gold, setGold] = useState(0);
  const [weapon, setWeapon] = useState(1);
  const [armor, setArmor] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState('LIVE MARKET · READ ONLY');
  const [combatLog, setCombatLog] = useState<string[]>([]);

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

  const monster = monsters[room];
  const marketCode = market.marketId.slice(-4).toUpperCase();
  const monsterPercent = Math.max(0, Math.min(100, (monsterHp / monster.hp) * 100));
  const playerPercent = Math.max(0, Math.min(100, hp));
  const attackMin = 7 + weapon * 2;
  const attackMax = 11 + weapon * 2;
  const stormMax = 20 + weapon * 2;
  const roomsCleared = phase === 'CLEARED' ? room + 1 : phase === 'VICTORY' ? 3 : room;
  const subtitle = phase === 'SETUP'
    ? 'Choose the market. Survive the dungeon.'
    : phase === 'ORACLE'
      ? 'The final blow belongs to the oracle.'
      : `Room ${room + 1} of 3 · BTC ${direction}`;
  const expiryLabel = useMemo(() => gateTime(market.expiryIso), [market.expiryIso]);

  function addLog(message: string) {
    setCombatLog((previous) => [message, ...previous].slice(0, 7));
  }

  function startRun() {
    setPhase('COMBAT'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(monsters[0].hp);
    setPotions(3); setGold(0); setWeapon(1); setArmor(0);
    setCombatLog([`BTC ${direction} locked for this expedition. No order was sent.`]);
    setNotice(`${direction} LOCKED · GAMEPLAY ONLY`);
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
      if (nextHp === 0) setPhase('DEAD');
      return;
    }

    const roll = seededRoll(`${market.marketId}:${room}:${nextTurn}:${action}:player`);
    const crit = action === 'attack' && seededRoll(`${marketCode}:${room}:${nextTurn}:crit`) < 0.15;
    const baseDamage = action === 'attack'
      ? attackMin + Math.floor(roll * (attackMax - attackMin + 1))
      : Math.floor(roll * (stormMax + 1));
    const damage = crit ? baseDamage * 2 : baseDamage;
    const lethalFloor = room === 2 ? 1 : 0;
    const nextMonsterHp = Math.max(lethalFloor, monsterHp - damage);
    setMonsterHp(nextMonsterHp);

    if (room === 2 && nextMonsterHp === 1) {
      setPhase('ORACLE'); setNotice('BOSS AT 1 HP · ORACLE DECIDES THE FINAL BLOW');
      addLog(`${crit ? 'Critical! ' : ''}${damage} damage. The Oracle Warden refuses to fall before settlement.`);
      return;
    }
    if (nextMonsterHp === 0) {
      setGold((value) => value + monster.reward);
      if (room === 0) {
        setWeapon((value) => value + 1);
        addLog(`${monster.name} defeated. +${monster.reward} gold · weapon upgraded.`);
      } else {
        setPotions((value) => Math.min(5, value + 1));
        addLog(`${monster.name} defeated. +${monster.reward} gold · potion recovered.`);
      }
      setPhase('CLEARED'); setNotice(`ROOM ${room + 1} CLEARED`);
      return;
    }

    const incoming = retaliate(action, nextTurn);
    const nextHp = Math.max(0, hp - incoming);
    setHp(nextHp);
    addLog(`${crit ? 'Critical hit! ' : ''}${action === 'storm' ? 'Storm' : 'Attack'} deals ${damage}. You take ${incoming}.`);
    if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
  }

  function nextRoom() {
    const next = room + 1;
    setRoom(next); setTurn(0); setMonsterHp(monsters[next].hp); setPhase('COMBAT');
    setNotice(next === 2 ? 'MARKET BOSS · FINAL ROOM' : `ROOM ${next + 1} · READY`);
    addLog(`The gate opens. Room ${next + 1} is regrettably occupied.`);
  }

  async function checkSettlement() {
    setNotice('CHECKING DREAMDEX SETTLEMENT…');
    try {
      const response = await fetch(`/api/market?marketId=${market.marketId}`);
      const data = await response.json();
      const result = data.market as Market;
      if (!result?.finalized && !result?.voided) {
        setNotice('ORACLE PENDING · THE BOSS REMAINS AT 1 HP');
        addLog('Settlement is not final yet. The dungeon is forced to practice patience.');
        return;
      }
      if (result.voided) {
        setPhase('VOIDED'); setNotice('MARKET VOIDED · RUN PRESERVED');
        addLog('The market was voided. Even the boss accepts the paperwork.');
        return;
      }
      const won = Number(result.winningOutcome) === (direction === 'UP' ? 0 : 1);
      if (won) {
        setMonsterHp(0); setGold((value) => value + monster.reward); setPhase('VICTORY');
        setNotice('ORACLE CONFIRMED · FINAL BLOW LANDED');
        addLog(`BTC ${direction} wins. The Oracle Warden is defeated.`);
      } else {
        setHp(0); setPhase('DEAD'); setNotice('ORACLE CONFIRMED · THE DUNGEON WINS');
        addLog(`BTC ${direction} loses. The Oracle Warden completes your performance review.`);
      }
    } catch { setNotice('SETTLEMENT FEED UNAVAILABLE · TRY AGAIN'); }
  }

  function reset() {
    setPhase('SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(monsters[0].hp);
    setPotions(3); setGold(0); setWeapon(1); setArmor(0); setCombatLog([]);
    setNotice('LIVE MARKET · READ ONLY');
  }

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
          <div><span>GATE</span><strong>{formatTime(remaining)}</strong><small>{expiryLabel} UTC</small></div>
          <div><span>CALL</span><strong className={direction === 'UP' ? 'text-up' : 'text-down'}>{direction === 'UP' ? '↗ UP' : '↘ DOWN'}</strong></div>
        </section>

        {phase !== 'SETUP' && (
          <section className="sticky-hud" aria-label="Expedition status">
            <div><span>HEALTH</span><strong>❤️ {hp}/100</strong><div className="mini-bar"><i style={{ width: `${playerPercent}%` }} /></div></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/5</strong></div>
            <div><span>GOLD</span><strong>🪙 {gold}</strong></div>
            <div className="hud-wide"><span>LOADOUT</span><strong>⚔️ Lv {weapon} · {attackMin}–{attackMax} DAMAGE</strong></div>
            <div className="hud-wide"><span>EXPEDITION</span><strong>{roomsCleared}/3 CLEARED · BTC {direction}</strong></div>
          </section>
        )}

        <section className={`main-card ${room === 2 && phase !== 'SETUP' ? 'boss-card' : ''}`}>
          {phase === 'SETUP' ? (
            <div className="setup-view">
              <div className="dungeon-sigil">🏰</div>
              <p className="section-kicker">ONE MARKET · THREE ROOMS</p>
              <h2>The Dungeon Awaits</h2>
              <p className="muted">Choose BTC UP or DOWN once. Fight through the rooms while the contract runs. Settlement controls the final blow.</p>
              <div className="prediction-card">
                <span>THE LINE TO BEAT</span><strong>${market.strikeUsd}</strong><p>{market.question}</p>
                <div className="prediction-buttons">
                  <button className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b>↗ UP</b><small>BTC finishes at or above the line</small></button>
                  <button className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>↘ DOWN</b><small>BTC finishes below the line</small></button>
                </div>
              </div>
              <div className="rule-grid">
                <div><span>⚔️</span><b>ATTACK</b><small>Reliable damage + critical chance</small></div>
                <div><span>⚡</span><b>STORM</b><small>Wild range, glorious consequences</small></div>
                <div><span>🧪</span><b>POTION</b><small>Heal while the enemy retaliates</small></div>
                <div><span>🔮</span><b>ORACLE</b><small>Market result decides the boss</small></div>
              </div>
            </div>
          ) : phase === 'CLEARED' ? (
            <div className="result-view">
              <div className="result-icon">🏆</div><p className="section-kicker">ROOM {room + 1} CLEARED</p>
              <h2>Against all evidence,<br />you remain alive.</h2>
              <div className="reward-box"><span>RECOVERED</span><strong>{room === 0 ? '⚔️ Weapon Level +1' : '🧪 Potion +1'} · 🪙 {monster.reward} Gold</strong></div>
            </div>
          ) : phase === 'VICTORY' || phase === 'DEAD' || phase === 'VOIDED' ? (
            <div className="result-view">
              <div className="result-icon">{phase === 'VICTORY' ? '👑' : phase === 'VOIDED' ? '📜' : '☠️'}</div>
              <p className="section-kicker">{phase === 'VICTORY' ? 'ORACLE CONFIRMED' : phase === 'VOIDED' ? 'MARKET VOIDED' : 'EXPEDITION ENDED'}</p>
              <h2>{phase === 'VICTORY' ? 'Management defeated.' : phase === 'VOIDED' ? 'No victor today.' : 'You died.'}</h2>
              <p className="muted">{phase === 'VICTORY' ? `BTC ${direction} delivered the final blow.` : phase === 'VOIDED' ? 'The run is preserved without a market winner.' : 'The dungeon has updated your performance review.'}</p>
              <div className="final-stats"><div><span>ROOMS</span><strong>{roomsCleared}</strong></div><div><span>GOLD</span><strong>🪙 {gold}</strong></div></div>
            </div>
          ) : (
            <div className="combat-view">
              <div className="monster-stage">
                <img src={monster.image} alt={monster.name} /><div className="stage-fade" />
                <div className="room-map" aria-label="Dungeon progress">
                  {[0, 1, 2].map((index) => <span key={index} className={index < room ? 'done' : index === room ? 'active' : ''}>{index === 2 ? '◆' : index + 1}</span>)}
                </div>
              </div>
              <div className="monster-info">
                {room === 2 && <p className="boss-label">👑 MARKET BOSS</p>}
                <div className="monster-heading"><div><h2>{monster.name}</h2><span>{monster.species}</span></div><b>ROOM {room + 1}/3</b></div>
                <p className="flavor">“{monster.flavor}”</p>
                <div className="hp-label"><span>ENEMY HP</span><strong>{monsterHp} / {monster.hp}</strong></div>
                <div className="enemy-bar"><i className={room === 2 ? 'boss-health' : ''} style={{ width: `${monsterPercent}%` }} /></div>
                <div className="enemy-stats"><div><span>ENEMY DAMAGE</span><strong>💥 {monster.minDamage}–{monster.maxDamage}</strong></div><div><span>BASE REWARD</span><strong>🪙 {monster.reward}</strong></div></div>
                {phase === 'ORACLE' && <div className="oracle-lock"><span>🔮 FINAL BLOW LOCKED</span><strong>BTC {direction} must win at settlement</strong><small>Market data is read only. No order exists.</small></div>}
              </div>
            </div>
          )}
        </section>

        <section className="action-dock">
          {phase === 'SETUP' ? (
            <button className="primary-action" onClick={startRun}>ENTER THE DUNGEON · BTC {direction}</button>
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
            <button className="oracle-action" onClick={checkSettlement}>🔮 CHECK DREAMDEX SETTLEMENT</button>
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
