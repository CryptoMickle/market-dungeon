import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedSomniaAgents, somniaAgentsEnvironment, somniaAgentsPlaygroundEnabled } from '../lib/somnia-agents/environment.ts';

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

test('production requires its own exact opt-in and never enables the manual-outcome playground', () => {
  const env = { VERCEL: '1', VERCEL_ENV: 'production', MARKET_DUNGEON_PRODUCTION_AGENTS: '1' };
  assert.equal(somniaAgentsEnvironment(env), 'production');
  assert.equal(hostedSomniaAgents(somniaAgentsEnvironment(env)), true);
  assert.equal(somniaAgentsPlaygroundEnabled(somniaAgentsEnvironment(env)), false);
  for (const override of [
    { VERCEL: undefined }, { VERCEL: 'true' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' },
    { MARKET_DUNGEON_PRODUCTION_AGENTS: undefined }, { MARKET_DUNGEON_PRODUCTION_AGENTS: 'true' },
  ]) assert.equal(somniaAgentsEnvironment({ ...env, ...override }), 'disabled');
  assert.equal(somniaAgentsPlaygroundEnabled('disabled'), false);
  assert.equal(somniaAgentsPlaygroundEnabled('local'), true);
  assert.equal(somniaAgentsPlaygroundEnabled('preview'), true);
  assert.equal(hostedSomniaAgents('local'), false);
});
