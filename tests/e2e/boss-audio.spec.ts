import { expect, test, type Page } from '@playwright/test';
import { BOSS_SCORE_GAIN } from '../../app/boss-battle-score';
import { createMarketDungeonRun, FULL_RUN_MARKET_PROOF_VERSION, transitionMarketDungeon } from '../../app/gameplay/event-boss-engine';
import { FULL_RUN_STORAGE_KEY, serializeFullRunSession, type FullRunSession } from '../../app/gameplay/full-run-storage';
import { SOMNIA_MAINNET_RPC } from '../../app/onchain-settlement-proof';
import { BLOCK_HASH, BLOCK_TAG, LOCK_PUBLIC_KEY, market, onchainSettlement, startPayload, startPayloadForGameSeed } from './judge-demo-fixture';
import { playJudgeBoss, playJudgeGuard } from './judge-play';

type BossAudioSnapshot = {
  starts: number;
  stops: number;
  activeScores: number;
  events: Array<'start' | 'stop'>;
  sources: number;
  uncancelledSources: number;
  remainingReleaseSources: number;
  resumes: number;
  suspends: number;
  states: string[];
};

type AudioTestWindow = typeof window & {
  readBossAudio: () => BossAudioSnapshot;
  setBossAudioHidden: (hidden: boolean) => void;
  suspendBossAudio: () => Promise<void>;
};

/** Observe native sources and their routing; no production debug API is used. */
async function installBossAudioProbe(page: Page) {
  await page.addInitScript(({ scoreGain }) => {
    const links = new Map<AudioNode, Set<AudioNode>>();
    const gainOwners = new WeakMap<AudioParam, GainNode>();
    const musicBuses = new Set<AudioNode>();
    const activeBuses = new Set<AudioNode>();
    const events: Array<'start' | 'stop'> = [];
    const contexts = new Set<AudioContext>();
    const sources: Array<{ node: AudioScheduledSourceNode; stop: number | null; ended: boolean }> = [];
    let starts = 0;
    let stops = 0;
    let resumes = 0;
    let suspends = 0;

    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      contexts.add(this);
      const gain = createGain.call(this);
      gainOwners.set(gain.gain, gain);
      return gain;
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination: AudioNode | AudioParam, ...ports: number[]) {
      if (destination instanceof AudioNode) {
        const targets = links.get(this) ?? new Set<AudioNode>();
        targets.add(destination);
        links.set(this, targets);
      }
      return Reflect.apply(connect, this, [destination, ...ports]);
    };
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    function recordStop(parameter: AudioParam) {
      const owner = gainOwners.get(parameter);
      if (owner && activeBuses.delete(owner)) { stops++; events.push('stop'); }
    }
    const setValue = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, startTime) {
      if (value === 0) recordStop(this);
      return setValue.call(this, value, startTime);
    };
    AudioParam.prototype.linearRampToValueAtTime = function (value, endTime) {
      const owner = gainOwners.get(this);
      // The score has its own fade-in bus. Follow that native routing graph to
      // distinguish music from click, character intro and dungeon ambience.
      if (owner && value === scoreGain) {
        musicBuses.add(owner);
        activeBuses.add(owner);
        starts++;
        events.push('start');
      }
      if (value === 0) recordStop(this);
      return ramp.call(this, value, endTime);
    };
    function observe<T extends AudioScheduledSourceNode>(source: T): T {
      const entry = { node: source, stop: null as number | null, ended: false };
      sources.push(entry);
      const stop = source.stop.bind(source);
      source.stop = (when = 0) => {
        entry.stop = Math.max(when, source.context.currentTime);
        stop(when);
      };
      source.addEventListener('ended', () => { entry.ended = true; });
      return source;
    }
    const oscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { return observe(oscillator.call(this)); };
    const buffer = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () { return observe(buffer.call(this)); };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () { resumes++; return resume.call(this); };
    const suspend = AudioContext.prototype.suspend;
    AudioContext.prototype.suspend = function () { suspends++; return suspend.call(this); };

    function routesToMusic(node: AudioNode, seen = new Set<AudioNode>()): boolean {
      if (musicBuses.has(node)) return true;
      if (seen.has(node)) return false;
      seen.add(node);
      return Array.from(links.get(node) ?? []).some(target => routesToMusic(target, seen));
    }
    const audioWindow = window as AudioTestWindow;
    audioWindow.readBossAudio = () => {
      const scoreSources = sources.filter(source => routesToMusic(source.node));
      return {
        starts,
        stops,
        activeScores: activeBuses.size,
        events: [...events],
        sources: scoreSources.length,
        // Stop may fade for up to 60 ms. Future notes must also be cancelled,
        // including sources that have been scheduled but have not started yet.
        uncancelledSources: scoreSources.filter(source => !source.ended
          && (source.stop === null || source.stop > source.node.context.currentTime + 0.06)).length,
        remainingReleaseSources: scoreSources.filter(source => !source.ended
          && source.stop !== null && source.stop > source.node.context.currentTime).length,
        resumes,
        suspends,
        states: Array.from(contexts, context => context.state),
      };
    };
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    audioWindow.setBossAudioHidden = value => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    // Reproduce an externally suspended device/context, such as an output
    // interruption, without changing the app's enabled preference.
    audioWindow.suspendBossAudio = () => Promise.all(Array.from(contexts, context => suspend.call(context))).then(() => undefined);
  }, { scoreGain: BOSS_SCORE_GAIN });
}

function probe(page: Page) {
  return page.evaluate(() => (window as AudioTestWindow).readBossAudio());
}

async function expectScoreRunning(page: Page, starts = 1) {
  await expect.poll(async () => (await probe(page)).activeScores).toBe(1);
  const before = await probe(page);
  // Dev StrictMode can replay a newly mounted effect, but it must cancel the
  // first score before restarting. Production must start each requested score
  // once. Neither environment may run two scores or restart without a stop.
  let allowed: string[][] = [[]];
  for (let index = 0; index < starts; index++) {
    allowed = allowed.flatMap(prefix => (process.env.PLAYWRIGHT_PRODUCTION === '1' ? [1] : [1, 2]).map(copies => [
      ...prefix, ...(prefix.length ? ['stop'] : []), 'start', ...(copies === 2 ? ['stop', 'start'] : []),
    ]));
  }
  expect(allowed).toContainEqual(before.events);
  expect(before.starts - before.stops).toBe(1);
  expect(before.sources).toBeGreaterThan(0);
  await expect.poll(async () => (await probe(page)).sources).toBeGreaterThan(before.sources);
}

async function expectScoreStopped(page: Page) {
  const stopped = await probe(page);
  expect(stopped.activeScores).toBe(0);
  expect(stopped.starts).toBe(stopped.stops);
  expect(stopped.uncancelledSources, 'Every score source must be cancelled within the 60 ms release window').toBe(0);
  // More than four scheduler look-ahead windows: a leaked music timer would
  // create additional score notes even after its old sources were stopped.
  await page.waitForTimeout(650);
  const after = await probe(page);
  expect(after.sources).toBe(stopped.sources);
  expect(after.starts).toBe(stopped.starts);
  return after;
}

function fullSession(kind: 'room' | 'boss', lethal = false): FullRunSession {
  const transition = transitionMarketDungeon(createMarketDungeonRun(() => 0), {
    type: 'lock-boss',
    lock: { attemptId: 'boss_audio_1', marketId: market.marketId, direction: 'DOWN', mode: 'live', proofVersion: FULL_RUN_MARKET_PROOF_VERSION, commitment: null },
  }, () => 0);
  expect(transition.accepted).toBe(true);
  const run = transition.run;
  run.phase = kind === 'boss' ? 'boss-combat' : 'exploring';
  run.game = {
    ...run.game, roomsCleared: kind === 'boss' ? 9 : 8,
    monsterType: kind === 'boss' ? 3 : 2,
    monsterHp: kind === 'boss' ? 122 : 1, monsterMaxHp: kind === 'boss' ? 122 : 30,
    // Keep one-hit combat without starting at the persistence ceiling: ordinary
    // random equipment loot must remain a valid session after room nine.
    hp: lethal ? 1 : 100, weaponLevel: lethal ? 0 : 100, armorLevel: lethal ? 0 : 100, potions: 0,
  };
  return {
    schema: 'market-dungeon/full-run-session/v2', run,
    market: { marketId: market.marketId, intervalSec: 300, question: market.question, strikeUsd: market.strikeUsd, tradingStart: 100, expiry: 400, lockedAt: 101 },
  };
}

async function installRoutes(page: Page) {
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: { ...market, marketId: `0x${'9'.repeat(64)}`, tradingStart: now, expiry: now + 300, status: 'Trading', finalized: false, winningOutcome: null } } }));
  await page.route('**/api/market?marketId=*', route => route.fulfill({ json: { market, onchainSettlement } }));
  await page.route('**/api/judge-replay/start', route => route.fulfill({ json: startPayload }));
  await page.route('**/api/judge-replay/public-key', route => route.fulfill({ json: LOCK_PUBLIC_KEY }));
  await page.route(SOMNIA_MAINNET_RPC, route => {
    const body = route.request().postDataJSON() as { id: number; method: string; params: Array<{ to?: string }> };
    const result = body.method === 'eth_chainId' ? '0x13a7'
      : body.method === 'eth_getBlockByHash' ? { number: BLOCK_TAG, hash: BLOCK_HASH }
        : body.params[0]?.to?.toLowerCase() === onchainSettlement.moduleAddress.toLowerCase()
          ? onchainSettlement.calls.moduleMarket.result : onchainSettlement.calls.settlementRecord.result;
    return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result } });
  });
}

async function openFull(page: Page, session: FullRunSession) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FULL_RUN_STORAGE_KEY, value: serializeFullRunSession(session),
  });
  await page.goto('/expedition');
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  // Merely restoring a saved battle must not seize the audio output.
  expect((await probe(page)).starts).toBe(0);
  await page.getByRole('button', { name: 'Open dungeon log', exact: true }).click();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await installBossAudioProbe(page);
  await installRoutes(page);
});

test('Full Expedition reserves the score for the boss, cancels it on knockout and starts a fresh score for a rematch', async ({ page }) => {
  await openFull(page, fullSession('room'));
  await page.waitForTimeout(650);
  expect((await probe(page)).sources).toBe(0);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await page.getByRole('button', { name: 'ENTER ROOM 10', exact: true }).click();
  await expectScoreRunning(page);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect(page.locator('[data-boss-scene="pending"]')).toBeVisible();
  const stopped = await expectScoreStopped(page);
  await page.getByRole('button', { name: 'REPLAY BOSS DEFEAT', exact: true }).click();
  await expectScoreStopped(page);
  expect((await probe(page)).starts).toBe(stopped.starts);
  await page.getByRole('button', { name: 'REVEAL BOSS FATE', exact: true }).click();
  await expect(page.locator('[data-boss-scene="cursed"]')).toBeVisible();
  await expectScoreStopped(page);
  await page.getByRole('button', { name: 'LOCK BTC UP · REMATCH BOSS', exact: true }).click();
  await expectScoreRunning(page, 2);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expectScoreStopped(page);
});

test('Judge score starts at its final boss rather than the guard, and stops when combat gives way to the reveal', async ({ page }) => {
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true }).click();
  await playJudgeGuard(page);
  expect((await probe(page)).sources).toBe(0);
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS', exact: true }).click();
  await expectScoreRunning(page);
  await playJudgeBoss(page);
  await expect(page.getByRole('button', { name: '🔮 REVEAL BOSS FATE', exact: true })).toBeVisible();
  await expectScoreStopped(page);
});

test('dying against a Full Expedition boss cancels its pending notes and scheduler', async ({ page }) => {
  await openFull(page, fullSession('boss', true));
  await expectScoreRunning(page);
  await page.getByRole('button', { name: /ATTACK/ }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.phase, FULL_RUN_STORAGE_KEY)).toBe('dead');
  await expectScoreStopped(page);
});

test('dying in Judge boss combat cancels its score without revealing the market', async ({ page }) => {
  await page.route('**/api/judge-replay/start', route => route.fulfill({ json: startPayloadForGameSeed('a'.repeat(42) + '5') }));
  await page.goto('/judge');
  await page.getByRole('button', { name: 'LOCK OMEN & SEAL REPLAY', exact: true }).click();
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: /STORM/ }).click();
  await page.getByRole('button', { name: '👑 ENTER FINAL BOSS', exact: true }).click();
  await expectScoreRunning(page);
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: /STORM/ }).click();
  await expect(page.getByRole('heading', { name: 'You fell in combat.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /REVEAL BOSS FATE/ })).toHaveCount(0);
  await expectScoreStopped(page);
});

test('leaving boss combat for the home screen cancels the score', async ({ page }) => {
  await openFull(page, fullSession('boss'));
  await expectScoreRunning(page);
  await page.getByRole('button', { name: 'Market Dungeon — back to home', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toHaveCount(0);
  await expectScoreStopped(page);
});

test('muting a boss cancels every score source and only an explicit unmute starts it again', async ({ page }) => {
  await openFull(page, fullSession('boss'));
  await expectScoreRunning(page);
  await page.getByRole('button', { name: 'Turn all game sounds off', exact: true }).click();
  const muted = await expectScoreStopped(page);
  expect(muted.remainingReleaseSources).toBe(0);
  await page.getByRole('button', { name: 'Open dungeon log', exact: true }).click();
  expect((await probe(page)).sources).toBe(muted.sources);
  await page.getByRole('button', { name: 'Turn all game sounds on', exact: true }).click();
  await expectScoreRunning(page, 2);
});

for (const interruption of ['hidden', 'blur', 'device suspension', 'device change'] as const) {
  test(`boss music stays paused after ${interruption} and returning focus until a new player action`, async ({ page }) => {
    await openFull(page, fullSession('boss'));
    await expectScoreRunning(page);
    await page.evaluate(async kind => {
      const audioWindow = window as AudioTestWindow;
      if (kind === 'hidden') audioWindow.setBossAudioHidden(true);
      else if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      else if (kind === 'device change') navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      else await audioWindow.suspendBossAudio();
    }, interruption);
    const paused = await expectScoreStopped(page);
    expect(paused.states).not.toContain('running');
    // A scheduled 40 ms release cannot finish on a suspended audio timeline.
    // It must be cancelled now, otherwise old notes play briefly on resumption.
    expect(paused.remainingReleaseSources).toBe(0);
    await expect(page.getByRole('button', { name: 'Resume game sounds', exact: true })).toBeVisible();
    await page.evaluate(() => {
      (window as AudioTestWindow).setBossAudioHidden(false);
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(650);
    const returned = await probe(page);
    expect(returned.resumes).toBe(paused.resumes);
    expect(returned.starts).toBe(paused.starts);
    expect(returned.sources).toBe(paused.sources);
    await page.getByRole('button', { name: 'Resume game sounds', exact: true }).click();
    await expectScoreRunning(page, 2);
    expect(await page.evaluate(() => localStorage.getItem('market-dungeon/audio-enabled/v1'))).not.toBe('off');
  });
}
