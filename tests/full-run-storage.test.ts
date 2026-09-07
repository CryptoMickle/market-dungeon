import assert from 'node:assert/strict';
import test from 'node:test';

import { createMarketDungeonRun, FULL_RUN_MARKET_PROOF_VERSION } from '../app/gameplay/event-boss-engine.ts';
import {
  FULL_RUN_STORAGE_KEY,
  parseFullRunSession,
  serializeFullRunSession,
  type FullRunSession,
} from '../app/gameplay/full-run-storage.ts';

const zero = () => 0;
const market = {
  marketId: `0x${'ab'.repeat(32)}`,
  intervalSec: 300 as const,
  question: 'BTC closes at or above its opening price',
  strikeUsd: '100000.00',
  tradingStart: 1_700_000_000,
  expiry: 1_700_000_300,
  lockedAt: 1_700_000_001,
};

function session(): FullRunSession {
  return {
    schema: 'market-dungeon/full-run-session/v2',
    run: createMarketDungeonRun(zero),
    market: null,
  };
}

test('new versioned full-run session round-trips without touching the legacy profile key', () => {
  const current = session();
  assert.equal(parseFullRunSession(serializeFullRunSession(current))?.run.game.monsterHp, 30);
  assert.equal(FULL_RUN_STORAGE_KEY, 'market-dungeon/full-run-session/v2');
  assert.notEqual(FULL_RUN_STORAGE_KEY, 'market-dungeon/profile/v1');
});

test('malformed, oversized, impossible, and unknown session states fail closed', () => {
  assert.equal(parseFullRunSession(null), null);
  assert.equal(parseFullRunSession('{'), null);
  assert.equal(parseFullRunSession('x'.repeat(80_001)), null);

  const current = session();
  assert.equal(parseFullRunSession(JSON.stringify({ ...current, schema: 'future' })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, phase: 'complete', game: { ...current.run.game, roomsCleared: 1 } },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, game: { ...current.run.game, gold: -1 } },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, game: { ...current.run.game, baseMaxHp: 101, maxHp: 101 } },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, game: { ...current.run.game, maxHp: 101 } },
  })), null);
});

test('active tier progress cannot resume without its exact five-minute market context', () => {
  const current = session();
  const lock = {
    attemptId: 'attempt_1',
    marketId: market.marketId,
    direction: 'UP' as const,
    mode: 'live' as const,
    proofVersion: FULL_RUN_MARKET_PROOF_VERSION,
    commitment: null,
  };
  const bossCombat: FullRunSession = {
    ...current,
    market,
    run: {
      ...current.run,
      phase: 'boss-combat',
      attemptNumber: 1,
      currentAttempt: lock,
      usedCommitments: [],
      game: {
        ...current.run.game,
        roomsCleared: 9,
        monsterType: 3,
        monsterHp: 122,
        monsterMaxHp: 122,
      },
    },
  };
  assert.ok(parseFullRunSession(JSON.stringify(bossCombat)));
  assert.equal(parseFullRunSession(JSON.stringify({ ...bossCombat, market: null })), null);
  assert.equal(parseFullRunSession(JSON.stringify({ ...bossCombat, market: { ...market, marketId: `0x${'cd'.repeat(32)}` } })), null);
});

test('tampered completed rewards and duplicate identities are rejected', () => {
  const current = session();
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, usedMarketIds: [`0x${'11'.repeat(32)}`, `0x${'11'.repeat(32)}`] },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, game: { ...current.run.game, equippedRelic: 15 } },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, attemptNumber: 1 },
  })), null);
  assert.equal(parseFullRunSession(JSON.stringify({
    ...current,
    run: { ...current.run, phase: 'exploring', game: { ...current.run.game, roomsCleared: 40 } },
  })), null);
});
