'use client';

import { useEffect, useMemo, useState } from 'react';

type Direction = 'UP' | 'DOWN';
type Choice = 'attack' | 'guard' | 'focus';
type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  question: string; strikeUsd: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null;
};
type Room = { room: number; choice: Choice; success: boolean; damage: number; reward: number; loot: string | null };

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000001b33',
  marketAddress: '', poolAddress: '', collateral: '', question: 'BTC closes at or above its opening price',
  strikeUsd: '78,953.25', expiry: '0',
  expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING', finalized: false, voided: false, winningOutcome: null,
};

function seededRoll(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function Home() {
  const [market, setMarket] = useState<Market>(fallback);
  const [direction, setDirection] = useState<Direction>('UP');
  const [phase, setPhase] = useState<'SETUP' | 'DUNGEON' | 'BOSS' | 'VICTORY' | 'DEFEAT' | 'VOIDED'>('SETUP');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hp, setHp] = useState(10);
  const [score, setScore] = useState(0);
  const [loot, setLoot] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState('LIVE MARKET · UNSIGNED DRY RUN');

  useEffect(() => {
    fetch('/api/market').then((response) => response.json()).then((data) => {
      if (data.market) setMarket(data.market);
      else setNotice('MARKET FEED RETRYING · DEMO DATA SHOWN');
    }).catch(() => setNotice('MARKET FEED RETRYING · DEMO DATA SHOWN'));
  }, []);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Number(market.expiry) - Math.floor(Date.now() / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [market.expiry]);

  const maxLoss = useMemo(() => '0.0005', []);
  const marketCode = market.marketId.slice(-4).toUpperCase();

  function startRun() {
    setRooms([]); setHp(10); setScore(0); setLoot([]); setPhase('DUNGEON');
    setNotice(`${direction} LOCKED · ORDER REMAINS UNSIGNED`);
  }

  function play(choice: Choice) {
    if (phase !== 'DUNGEON') return;
    const room = rooms.length + 1;
    const chance = { attack: .58, guard: .78, focus: .68 }[choice];
    const success = seededRoll(`${market.marketId}:${room}:${choice}`) < chance;
    const reward = success ? { attack: 4, guard: 2, focus: 3 }[choice] : 0;
    const damage = success ? 0 : { attack: 3, guard: 1, focus: 2 }[choice];
    const found = success && seededRoll(`${marketCode}:${room}:${choice}`) > .52 ? ['RUNE', 'POTION', 'COIN'][room - 1] : null;
    const next = [...rooms, { room, choice, success, reward, damage, loot: found }];
    setRooms(next); setHp((value) => Math.max(0, value - damage)); setScore((value) => value + reward);
    if (found) setLoot((value) => [...value, found]);
    setNotice(success ? `ROOM ${room} CLEARED · +${reward} SCORE` : `ROOM ${room} HIT · -${damage} HP`);
    if (next.length === 3) setPhase('BOSS');
  }

  async function checkSettlement() {
    setNotice('CHECKING ONCHAIN SETTLEMENT…');
    try {
      const response = await fetch(`/api/market?marketId=${market.marketId}`);
      const data = await response.json();
      const result = data.market as Market;
      if (!result?.finalized && !result?.voided) { setNotice('BOSS IS STILL WAITING FOR THE ORACLE'); return; }
      if (result.voided) { setPhase('VOIDED'); setNotice('MARKET VOIDED · RUN PRESERVED'); return; }
      const won = Number(result.winningOutcome) === (direction === 'UP' ? 0 : 1);
      setPhase(won && hp > 0 ? 'VICTORY' : 'DEFEAT');
      if (won) setScore((value) => value + 10);
      setNotice(won ? 'ORACLE CONFIRMED · FINAL BLOW LANDED' : 'ORACLE CONFIRMED · THE BOSS ENDURES');
    } catch { setNotice('SETTLEMENT FEED UNAVAILABLE · TRY AGAIN'); }
  }

  function reset() { setPhase('SETUP'); setRooms([]); setHp(10); setScore(0); setLoot([]); setNotice('READY FOR A NEW EXPEDITION'); }

  const activeRoom = Math.min(rooms.length + 1, 3);
  const title = phase === 'SETUP' ? 'Your call.' : phase === 'DUNGEON' ? `Room ${activeRoom}.` : phase === 'BOSS' ? 'Final blow.' : phase === 'VICTORY' ? 'Run won.' : phase === 'VOIDED' ? 'Run voided.' : 'Run lost.';
  const outline = phase === 'SETUP' ? 'Your fate.' : phase === 'DUNGEON' ? 'Choose wisely.' : phase === 'BOSS' ? 'Oracle pending.' : phase === 'VICTORY' ? 'Loot secured.' : phase === 'VOIDED' ? 'No victor.' : 'Rise again.';

  return (
    <main className="shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={reset} aria-label="Reset Market Dungeon"><span className="brand-mark">M</span><span>MARKET DUNGEON</span></button>
        <div className="network"><span /> SOMNIA · {market.status}</div>
        <button className="wallet" type="button">DRY RUN</button>
      </header>

      <section className="arena" id="top">
        <div className="eyebrow">EXPEDITION {rooms.length + 1 < 10 ? `0${rooms.length + 1}` : rooms.length + 1} · THE ORACLE BELOW</div>
        <div className="hero-row">
          <div><h1>{title}<br /><em>{outline}</em></h1><p className="lede">A 15-minute roguelite where the market decides the final blow.</p></div>
          <div className="countdown-block"><span>GATE CLOSES IN</span><strong>{formatTime(remaining)}</strong><small>{new Date(market.expiryIso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'UTC' })} UTC</small></div>
        </div>

        <div className="game-grid">
          <section className="market-panel">
            <div className="panel-head"><span>BTC · 15 MIN</span><span className="live"><i /> {market.status}</span></div>
            {phase === 'SETUP' ? <>
              <div className="question"><span>THE LINE TO BEAT</span><strong>${market.strikeUsd}</strong><p>{market.question}</p></div>
              <div className="direction-grid" aria-label="Choose market direction">
                {(['UP','DOWN'] as Direction[]).map((side) => <button key={side} className={`direction ${side.toLowerCase()} ${direction === side ? 'selected' : ''}`} onClick={() => setDirection(side)}>
                  <span className="arrow">{side === 'UP' ? '↗' : '↘'}</span><span><small>CALL</small><strong>{side}</strong></span><b>0.50</b>
                </button>)}
              </div>
              <div className="risk-row"><span>SELECTED <b>{direction}</b></span><span>MAX LOSS <b>{maxLoss} USDso</b></span><span>FEES <b>0%</b></span></div>
            </> : phase === 'DUNGEON' ? <Encounter room={activeRoom} onChoose={play} previous={rooms.at(-1)} /> : <Boss phase={phase} direction={direction} strike={market.strikeUsd} onCheck={checkSettlement} onReset={reset} />}
          </section>

          <aside className="run-panel">
            <div className="panel-head"><span>RUN STATUS</span><span>#{marketCode}</span></div>
            <div className="character"><div className="crest">Ⅲ</div><div><span>THE WAYFARER</span><strong>{hp} / 10 HP</strong></div><b className="score">{score} XP</b></div>
            <div className="hp"><span style={{ width: `${hp * 10}%` }} /></div>
            <div className="path">
              {['IRON GATE','HOLLOW VAULT','ORACLE CHAMBER'].map((name, index) => <div key={name}>
                <div className={`node ${rooms.length === index && phase === 'DUNGEON' ? 'active' : ''} ${rooms.length > index ? 'done' : ''}`}><b>{rooms.length > index ? '✓' : index + 1}</b><span>{name}<small>{rooms.length > index ? (rooms[index].success ? 'CLEARED' : 'SURVIVED') : rooms.length === index && phase === 'DUNGEON' ? 'READY' : 'LOCKED'}</small></span></div><div className="rail" />
              </div>)}
              <div className={`node boss ${phase === 'BOSS' ? 'active' : ''}`}><b>◆</b><span>MARKET BOSS<small>{phase === 'BOSS' ? 'AWAITING ORACLE' : phase === 'VICTORY' ? 'DEFEATED' : 'SETTLES AT EXPIRY'}</small></span></div>
            </div>
            <div className="inventory"><span>LOOT</span><b>{loot.length ? loot.join(' · ') : '— EMPTY —'}</b></div>
          </aside>
        </div>

        <div className="action-bar"><div><span>EVENT LOG</span><b>{notice}</b></div>{phase === 'SETUP' && <button type="button" onClick={startRun}>ENTER WITH {direction}<span>→</span></button>}<small>UNSIGNED · NOTHING WILL BE SENT</small></div>
      </section>
    </main>
  );
}

function Encounter({ room, onChoose, previous }: { room:number; onChoose:(choice:Choice)=>void; previous?:Room }) {
  const names = ['THE IRON WARDEN','THE HOLLOW MIMIC','THE ORACLE SHADE'];
  return <div className="encounter"><div className="encounter-meta"><span>ENCOUNTER {room} / 3</span><b>{previous ? (previous.success ? 'PATH OPEN' : 'WOUNDED') : 'HOSTILE'}</b></div><div className="enemy"><span className="enemy-glyph">{['♜','◈','☷'][room-1]}</span><div><small>LVL {room + 2} SENTINEL</small><h2>{names[room-1]}</h2><p>{['A rusted guardian blocks the descent.','It wears the shape of a forgotten treasure.','It speaks in prices that have not happened yet.'][room-1]}</p></div></div><div className="choice-grid">{([
    ['attack','AGGRESSIVE','High reward · high damage'],['guard','DEFENSIVE','Safe path · low reward'],['focus','TACTICAL','Balanced risk · rune chance']
  ] as [Choice,string,string][]).map(([choice,label,note]) => <button key={choice} onClick={() => onChoose(choice)}><span>{label}</span><strong>{choice.toUpperCase()}</strong><small>{note}</small></button>)}</div></div>;
}

function Boss({ phase, direction, strike, onCheck, onReset }: { phase:string; direction:Direction; strike:string; onCheck:()=>void; onReset:()=>void }) {
  const finished = ['VICTORY','DEFEAT','VOIDED'].includes(phase);
  return <div className={`boss-stage ${phase.toLowerCase()}`}><span className="boss-glyph">◆</span><small>THE MARKET BOSS</small><h2>{phase === 'BOSS' ? 'THE ORACLE STIRS' : phase === 'VICTORY' ? 'CONTRACT CONQUERED' : phase === 'VOIDED' ? 'THE GATE DISSOLVES' : 'THE DUNGEON CLAIMS YOU'}</h2><p>Your {direction} call faces the line at ${strike}. The dungeon is complete; only the market can decide the run.</p><button onClick={finished ? onReset : onCheck}>{finished ? 'NEW EXPEDITION' : 'CHECK SETTLEMENT'}<span>→</span></button></div>;
}
