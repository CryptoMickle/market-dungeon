import { expect, test, type Page } from '@playwright/test';
import { SHANNON_LOCK_PUBLIC_KEY, shannonStartPayload } from './judge-demo-fixture';
import { liveJudgeFixture } from './live-judge-fixture';

type AudioProbe = {
  oscillators: number;
  bufferSources: number;
  resumes: number;
  suspends: number;
};

const now = 1_788_909_000;
const market = {
  marketId: `0x${'9'.repeat(64)}`,
  intervalSec: 300,
  question: 'BTC closes at or above its opening price',
  strikeUsd: '78529.69',
  tradingStart: now,
  expiry: now + 300,
  status: 'Trading',
  finalized: false,
};

async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const audioWindow = window as typeof window & { __marketDungeonAudioProbe?: AudioProbe };
    const probe: AudioProbe = { oscillators: 0, bufferSources: 0, resumes: 0, suspends: 0 };
    audioWindow.__marketDungeonAudioProbe = probe;

    const oscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function createProbedOscillator() {
      probe.oscillators += 1;
      return oscillator.call(this);
    };
    const bufferSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function createProbedBufferSource() {
      probe.bufferSources += 1;
      return bufferSource.call(this);
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function resumeProbedContext() {
      probe.resumes += 1;
      return resume.call(this);
    };
    const suspend = AudioContext.prototype.suspend;
    AudioContext.prototype.suspend = function suspendProbedContext() {
      probe.suspends += 1;
      return suspend.call(this);
    };
  });
}

function readAudioProbe(page: Page) {
  return page.evaluate(() => (window as typeof window & { __marketDungeonAudioProbe: AudioProbe }).__marketDungeonAudioProbe);
}

test('Full Expedition plays only short encounter and action cues outside bosses, and mutes all sounds', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.install({ time: new Date(now * 1_000) });
  await installAudioProbe(page);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market } }));
  await page.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.goto('/');
  const soundOn = page.getByRole('button', { name: 'Turn all game sounds off', exact: true });
  await expect(soundOn).toBeVisible();
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBe(2);
  const afterEntrance = await readAudioProbe(page);
  expect(afterEntrance.bufferSources, 'Entering the dungeon must not start looping air or a drone').toBe(0);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  const afterClick = await readAudioProbe(page);
  expect(afterClick.oscillators).toBeGreaterThanOrEqual(afterEntrance.oscillators + 2);
  expect(afterClick.bufferSources).toBe(afterEntrance.bufferSources);
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).click();

  await page.getByRole('button', { name: 'LOCK BTC UP · ENTER TIER 1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  const soundBox = (await soundOn.boundingBox())!;
  const loadoutLines = await page.getByRole('region', { name: 'Combat view', exact: true }).locator('header small').evaluate(element => {
    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    return Array.from(textRange.getClientRects(), rect => ({ x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }));
  });
  expect(soundBox.width).toBeGreaterThanOrEqual(44);
  expect(soundBox.height).toBeGreaterThanOrEqual(44);
  for (const line of loadoutLines) {
    const overlaps = line.x < soundBox.x + soundBox.width && line.right > soundBox.x
      && line.y < soundBox.y + soundBox.height && line.bottom > soundBox.y;
    expect(overlaps, 'The fixed sound button must leave the desktop loadout readable').toBe(false);
  }
  await page.screenshot({ path: info.outputPath('desktop-sound-control-1280.png') });
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(afterEntrance.oscillators + 4);

  const beforeAttack = await readAudioProbe(page);
  await page.getByRole('button', { name: /⚔️ ATTACK/ }).click();
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(beforeAttack.oscillators);

  const beforePotion = await readAudioProbe(page);
  await page.getByRole('button', { name: /🧪 POTION/ }).click();
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(beforePotion.oscillators + 3);

  const beforeStorm = await readAudioProbe(page);
  await page.getByRole('button', { name: /⚡ STORM/ }).click();
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(beforeStorm.oscillators + 4);

  await soundOn.click();
  const soundOff = page.getByRole('button', { name: 'Turn all game sounds on', exact: true });
  await expect(soundOff).toBeVisible();
  await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(0);
  const whileMuted = await readAudioProbe(page);
  await page.getByRole('button', { name: /Omen details:/ }).click();
  expect(await readAudioProbe(page)).toEqual(whileMuted);
  const dialogSound = page.getByRole('dialog', { name: 'Omen', exact: true }).getByRole('button', { name: 'Turn all game sounds on', exact: true });
  await expect(dialogSound).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn all game sounds on', exact: true })).toHaveCount(1);
  await dialogSound.click();
  await expect.poll(async () => (await readAudioProbe(page)).resumes).toBeGreaterThan(whileMuted.resumes);
});

test('Judge Demo starts encounter audio and keeps the all-sound preference after reload', async ({ page }) => {
  await installAudioProbe(page);
  await page.route('**/api/shannon/judge-replay/start', route => route.fulfill({ json: shannonStartPayload }));
  await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));
  await page.goto('/shannon/judge');
  const sound = page.getByRole('button', { name: 'Turn all game sounds off', exact: true });
  await expect(sound).toBeVisible();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'LOCK BTC UP & ENTER DUNGEON' }).click();
  await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
  // Two click voices plus the guard's short musical introduction, without a drone.
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(2);
  await expect.poll(async () => (await readAudioProbe(page)).bufferSources).toBeGreaterThan(0);
  await sound.click();
  await expect(page.getByRole('button', { name: 'Turn all game sounds on', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Turn all game sounds on', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await readAudioProbe(page)).oscillators).toBe(0);
});

test('muting still suspends audio when browser storage is unavailable', async ({ page }) => {
  await installAudioProbe(page);
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (key === 'market-dungeon/audio-enabled/v1') throw new DOMException('Storage is blocked', 'SecurityError');
      return originalGetItem.call(this, key);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'market-dungeon/audio-enabled/v1') throw new DOMException('Storage is blocked', 'SecurityError');
      return originalSetItem.call(this, key, value);
    };
  });
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market } }));
  await page.goto('/');
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).oscillators).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Turn all game sounds off', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(0);
  const muted = await readAudioProbe(page);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  expect(await readAudioProbe(page)).toEqual(muted);
  await page.getByRole('button', { name: 'Turn all game sounds on', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).resumes).toBeGreaterThan(muted.resumes);
});

test('dungeon audio stays paused on return until a new player interaction and respects mute', async ({ page }) => {
  await installAudioProbe(page);
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    (window as typeof window & { setAudioTestHidden: (value: boolean) => void }).setAudioTestHidden = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market } }));
  await page.goto('/');
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { setAudioTestHidden: (value: boolean) => void }).setAudioTestHidden(true));
  await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(0);
  const hidden = await readAudioProbe(page);
  await page.evaluate(() => (window as typeof window & { setAudioTestHidden: (value: boolean) => void }).setAudioTestHidden(false));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(650);
  expect((await readAudioProbe(page)).resumes).toBe(hidden.resumes);
  await expect(page.getByRole('button', { name: 'Resume game sounds', exact: true })).toBeVisible();
  // A script-generated click must not count as fresh permission to reclaim audio.
  await page.getByRole('button', { name: /SHADOWS RISE/ }).dispatchEvent('click');
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await page.getByRole('button', { name: /GOLD AWAKENS/ }).dispatchEvent('click');
  expect((await readAudioProbe(page)).resumes).toBe(hidden.resumes);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).press('Enter');
  await expect.poll(async () => (await readAudioProbe(page)).resumes).toBeGreaterThan(hidden.resumes);
  await page.getByRole('button', { name: 'Turn all game sounds off', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(hidden.suspends);
  const muted = await readAudioProbe(page);
  await page.evaluate(() => {
    const setHidden = (window as typeof window & { setAudioTestHidden: (value: boolean) => void }).setAudioTestHidden;
    setHidden(true);
    setHidden(false);
  });
  expect(await readAudioProbe(page)).toEqual(muted);
});


test('an enabled preference from another tab never starts playback by itself', async ({ page }) => {
  await installAudioProbe(page);
  await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market } }));
  await page.goto('/');
  await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
  await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
  await page.getByRole('button', { name: 'Turn all game sounds off', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(0);
  const muted = await readAudioProbe(page);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {
    key: 'market-dungeon/audio-enabled/v1', newValue: 'on', oldValue: 'off',
  })));
  await expect(page.getByRole('button', { name: 'Resume game sounds', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  expect((await readAudioProbe(page)).resumes).toBe(muted.resumes);
  await page.getByRole('button', { name: /SHADOWS RISE/ }).click();
  await expect.poll(async () => (await readAudioProbe(page)).resumes).toBeGreaterThan(muted.resumes);
});


for (const mode of [
  { name: 'Full Expedition', path: '/', entry: 'ENTER DUNGEON' },
  { name: 'Live Judge', path: '/shannon/live-judge', entry: 'LOCK BTC UP & ENTER DUNGEON' },
  { name: 'Historical Replay', path: '/shannon/judge', entry: 'LOCK BTC UP & ENTER DUNGEON' },
] as const) {
  test(`${mode.name} plays each keyboard selection and attack once, including held Enter`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAudioProbe(page);
    const live = liveJudgeFixture();
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/market?interval=300', route => route.fulfill({ json: { market: {
      ...market, tradingStart: live.now, expiry: live.now + 300,
    } } }));
    await page.route('**/api/shannon/judge-replay/start', route => route.fulfill({ json: shannonStartPayload }));
    await page.route('**/api/shannon/judge-replay/public-key', route => route.fulfill({ json: SHANNON_LOCK_PUBLIC_KEY }));
    await page.route('**/api/live-judge/market?*', route => route.fulfill({ json: { market: live.market, serverTime: live.now } }));
    await page.route('**/api/live-judge/public-key', route => route.fulfill({ json: live.publicKey }));
    await page.route('**/api/live-judge/start', route => route.fulfill({ json: { live: live.session } }));
    await page.route('**/api/live-judge/odds?*', route => route.fulfill({ status: 503, json: { error: 'No fixture quotes' } }));
    await page.goto(mode.path);
    if (mode.path === '/') {
      await page.getByRole('radio', { name: 'Full Expedition', exact: true }).check();
      await page.getByRole('button', { name: mode.entry, exact: true }).press('Enter');
    }

    const down = page.getByRole('button', { name: /SHADOWS RISE/ });
    const up = page.getByRole('button', { name: /GOLD AWAKENS/ });
    const beforeMouse = await readAudioProbe(page);
    await down.click();
    const afterMouse = await readAudioProbe(page);
    expect(afterMouse.oscillators - beforeMouse.oscillators).toBe(2);
    expect(afterMouse.bufferSources).toBe(beforeMouse.bufferSources);

    await up.focus();
    const beforeKeyboard = await readAudioProbe(page);
    await page.keyboard.down('Enter');
    await expect.poll(async () => (await readAudioProbe(page)).oscillators - beforeKeyboard.oscillators).toBe(2);
    const firstPress = await readAudioProbe(page);
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    expect(await readAudioProbe(page), 'Holding Enter must not repeat the click cue or activation').toEqual(firstPress);

    // A fresh key press must remain audible, after the prior key was released.
    await down.press('Enter');
    expect((await readAudioProbe(page)).oscillators).toBe(firstPress.oscillators + 2);
    await up.press('Enter');
    await page.getByRole('button', { name: mode.path === '/' ? 'LOCK BTC UP · ENTER TIER 1' : mode.entry, exact: true }).press('Enter');
    await expect(page.getByRole('region', { name: 'Combat view', exact: true })).toBeVisible();
    const beforeAttack = await readAudioProbe(page);
    await page.getByRole('button', { name: /⚔️ ATTACK/ }).press('Enter');
    const afterAttack = await readAudioProbe(page);
    expect(afterAttack.oscillators - beforeAttack.oscillators, 'Attack via Enter uses one attack cue, without an extra click').toBe(2);
    expect(afterAttack.bufferSources - beforeAttack.bufferSources).toBe(1);

    await page.getByRole('button', { name: 'Turn all game sounds off', exact: true }).press('Enter');
    await expect.poll(async () => (await readAudioProbe(page)).suspends).toBeGreaterThan(afterAttack.suspends);
    const muted = await readAudioProbe(page);
    await page.getByRole('button', { name: /Omen details:/ }).press('Enter');
    expect(await readAudioProbe(page), 'Keyboard controls must respect the global mute').toEqual(muted);
  });
}
