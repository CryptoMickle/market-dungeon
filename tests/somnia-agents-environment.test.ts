import assert from 'node:assert/strict';
import test from 'node:test';
import { somniaAgentsEnvironment } from '../lib/somnia-agents/environment.ts';

test('agents stay disabled unless the correct deployment explicitly opts in', () => {
  assert.equal(somniaAgentsEnvironment({}), 'disabled');
  assert.equal(somniaAgentsEnvironment({ MARKET_DUNGEON_PREVIEW_AGENTS: '1' }), 'disabled');
  assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview' }), 'disabled');
  assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview', MARKET_DUNGEON_LOCAL_AGENTS: '1' }), 'disabled');
});

test('local and hosted preview adapters are selected separately', () => {
  assert.equal(somniaAgentsEnvironment({ MARKET_DUNGEON_LOCAL_AGENTS: '1' }), 'local');
  assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview', MARKET_DUNGEON_PREVIEW_AGENTS: '1' }), 'preview');
  assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview', MARKET_DUNGEON_PREVIEW_AGENTS: '1', MARKET_DUNGEON_LOCAL_AGENTS: '1' }), 'preview');
});

test('production never inherits either agents flag', () => {
  for (const VERCEL_ENV of ['production', 'development', undefined, 'Preview']) {
    assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV, MARKET_DUNGEON_PREVIEW_AGENTS: '1', MARKET_DUNGEON_LOCAL_AGENTS: '1' }), 'disabled');
  }
  assert.equal(somniaAgentsEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview', MARKET_DUNGEON_PREVIEW_AGENTS: 'true' }), 'disabled');
});
