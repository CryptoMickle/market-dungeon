import { expect, test, type Locator, type Page } from '@playwright/test';
import { deriveDreamDexClobOdds } from '../../app/clob-odds';
import { LIVE_JUDGE } from '../../app/live-judge-proof';
import { SHANNON_LOCK_PUBLIC_KEY, shannonStartPayload } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

const AUDIO_STORAGE_KEY = 'market-dungeon/audio-enabled/v1';

type AudioOutput = { state: AudioContextState; currentTime: number; rms: number; peakRms: number; peakSample: number };
type AudioOutputWindow = typeof window & { readDungeonAudioOutput: () => AudioOutput[]; resetDungeonAudioPeak: () => void };

/** Measure the real signal entering the native audio destination, not created voices. */
async function installAudioOutputProbe(page: Page) {
  await page.addInitScript(storageKey => {
    localStorage.setItem(storageKey, 'off');
    const outputs: Array<{ context: BaseAudioContext; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer>; peakRms: number; peakSample: number }> = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination: AudioNode | AudioParam, ...ports: number[]) {
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        // Keep exactly one audible connection. The analyser is transparent and
        // observes the master signal without replacing the browser's audio engine.
        Reflect.apply(connect, this, [analyser, ports[0] ?? 0, 0]);
        Reflect.apply(connect, analyser, [destination, 0, ports[1] ?? 0]);
        outputs.push({ context: this.context, analyser, samples: new Float32Array(analyser.fftSize), peakRms: 0, peakSample: 0 });
        return destination;
      }
      return Reflect.apply(connect, this, [destination, ...ports]);
    };
    const sampleOutput = (output: typeof outputs[number]) => {
      output.analyser.getFloatTimeDomainData(output.samples);
      let squared = 0;
      for (const sample of output.samples) {
        squared += sample * sample;
        output.peakSample = Math.max(output.peakSample, Math.abs(sample));
      }
      const rms = Math.sqrt(squared / output.samples.length);
      output.peakRms = Math.max(output.peakRms, rms);
      return { state: output.context.state, currentTime: output.context.currentTime, rms, peakRms: output.peakRms, peakSample: output.peakSample };
    };
    // Clicks last only a few milliseconds, so retain their measured peak rather
    // than hoping a later Playwright poll happens to catch the cue.
    window.setInterval(() => outputs.forEach(sampleOutput), 5);
    (window as AudioOutputWindow).readDungeonAudioOutput = () => outputs.map(sampleOutput);
    (window as AudioOutputWindow).resetDungeonAudioPeak = () => outputs.forEach(output => {
      output.peakRms = 0;
      output.peakSample = 0;
    });
  }, AUDIO_STORAGE_KEY);
}

function readOutput(page: Page) {
  return page.evaluate(() => (window as AudioOutputWindow).readDungeonAudioOutput());
}

async function expectVisibleSoundLabel(button: Locator, state: 'ON' | 'OFF') {
  const label = button.locator('span').filter({ hasText: new RegExp(`^(?:SOUND )?${state}$`) });
  await expect(label).toBeVisible();
  const bounds = (await label.boundingBox())!;
  // A screen-reader-only 1×1 span does not tell a sighted player why every mode is silent.
  expect(bounds.width).toBeGreaterThanOrEqual(10);
  expect(bounds.height).toBeGreaterThanOrEqual(6);
  await expect(button).toHaveAttribute('aria-pressed', state === 'ON' ? 'true' : 'false');
}

async function expectNativeSound(page: Page) {
  await expect.poll(async () => (await readOutput(page)).filter(output => output.state === 'running').length).toBeGreaterThan(0);
  await expect.poll(async () => Math.max(0, ...(await readOutput(page))
    .filter(output => output.state === 'running').map(output => output.peakRms))).toBeGreaterThan(0.00001);
}

async function resetPeak(page: Page) {
  await page.evaluate(() => (window as AudioOutputWindow).resetDungeonAudioPeak());
}

async function expectNonBossSilence(page: Page) {
  // Even the longest encounter intro is finished by this point. Observe a full
  // quiet window, so intermittent ambience cannot masquerade as a short cue.
  await page.waitForTimeout(2_500);
  await resetPeak(page);
  await page.waitForTimeout(700);
  const outputs = await readOutput(page);
  expect(outputs.length).toBeGreaterThan(0);
  expect(Math.max(...outputs.map(output => output.peakRms)), 'No dungeon drone, air or idle drips should remain').toBeLessThan(0.00001);
}

async function installMarkets(page: Page) {
  // Every service used by these audio checks is local or intercepted.
  await page.route('https://**/*', route => route.abort());
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: {
    marketId: `0x${'9'.repeat(64)}`, intervalSec: 300,
    question: 'BTC closes at or above its opening price', strikeUsd: '78529.69',
    tradingStart: now, expiry: now + 300, status: 'Trading', finalized: false,
  } } }));
  await page.route('**/api/shannon/judge-replay/start', route => route.fulfill({ json: shannonStartPayload }));
  await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));

  const live = liveJudgeFixture({ now });
  await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: live.market, serverTime: now } }));
  await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: live.publicKey }));
  await page.route('**/api/live-judge/start', route => route.fulfill({ json: { live: live.session } }));
  await page.route('**/api/live-judge/odds?*', route => route.fulfill({ json: {
    marketId: live.market.marketId, chainId: LIVE_JUDGE.chainId, venueId: LIVE_JUDGE.venueId,
    intervalSec: 60, asset: 'BTC', expiry: live.market.expiry, state: 'open', serverTime: now,
    odds: deriveDreamDexClobOdds({ marketId: live.market.marketId, quoteDecimals: 6,
      observedAtIso: new Date(now * 1_000).toISOString(), bestBid: '590000', bestAsk: '610000' }),
  } }));
}

for (const mode of [
  { name: 'Full Expedition', path: '/', entry: 'ENTER DUNGEON' },
  { name: 'Live Judge', path: '/shannon/live-judge', entry: 'LOCK BTC UP & ENTER DUNGEON' },
  { name: 'Historical Replay', path: '/shannon/judge', entry: 'LOCK BTC UP & ENTER DUNGEON' },
] as const) {
  test(`${mode.name} keeps short cues audible after unmute and is silent between non-boss actions`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installAudioOutputProbe(page);
    await installMarkets(page);
    await page.goto(mode.path);

    const muted = page.getByRole('button', { name: 'Turn all game sounds on', exact: true });
    await expectVisibleSoundLabel(muted, 'OFF');
    expect(await readOutput(page), 'Restoring the shared OFF preference must not create an audio output').toEqual([]);
    await muted.click();
    const enabled = page.getByRole('button', { name: 'Turn all game sounds off', exact: true });
    await expectVisibleSoundLabel(enabled, 'ON');
    await expect.poll(async () => (await readOutput(page)).some(output => output.state === 'running')).toBe(true);

    if (mode.path === '/') {
      await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
      await page.getByRole('button', { name: mode.entry, exact: true }).click();
    }
    await page.waitForTimeout(150);
    await resetPeak(page);
    await page.getByRole('button', { name: /SHADOWS RISE/ }).press('Enter');
    await expectNativeSound(page);
    await page.waitForTimeout(150);
    await resetPeak(page);
    await page.getByRole('button', { name: /GOLD AWAKENS/ }).press('Enter');
    await expectNativeSound(page);
    await page.waitForTimeout(150);
    await resetPeak(page);
    await page.getByRole('button', { name: mode.path === '/' ? 'LOCK BTC UP · ENTER TIER 1' : mode.entry, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    await expectNativeSound(page);
    await expectNonBossSilence(page);

    // Native Enter activation on a narrow viewport must still reach the audio
    // engine, as must custom desktop Enter activation (covered by game-audio).
    await resetPeak(page);
    await page.getByRole('button', { name: /⚔️ ATTACK/ }).press('Enter');
    await expectNativeSound(page);
    await expectNonBossSilence(page);

    await resetPeak(page);
    await page.getByRole('button', { name: /⚡ STORM/ }).press('Enter');
    await expectNativeSound(page);
    // Observe the whole short cue: an RMS average alone can miss a clipped
    // transient when several unpredictable voices overlap.
    await page.waitForTimeout(1_100);
    expect(Math.max(...(await readOutput(page)).map(output => output.peakSample)),
      'Storm should stay below digital clipping at the audio destination').toBeLessThan(1);
    await expectNonBossSilence(page);

    await enabled.click();
    await expectVisibleSoundLabel(muted, 'OFF');
    await expect.poll(async () => (await readOutput(page)).every(output => output.state === 'suspended')).toBe(true);
    const stopped = await readOutput(page);
    await page.waitForTimeout(150);
    expect((await readOutput(page)).map(output => output.currentTime)).toEqual(stopped.map(output => output.currentTime));

    await resetPeak(page);
    await muted.press('Enter');
    await expectVisibleSoundLabel(enabled, 'ON');
    await expectNativeSound(page);
    await expectNonBossSilence(page);
    expect(await page.evaluate(key => localStorage.getItem(key), AUDIO_STORAGE_KEY)).toBe('on');
  });
}
