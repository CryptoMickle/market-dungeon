import type { Page, TestInfo } from '@playwright/test';

// Test-only timing: no run contents, seals or user identifiers are recorded.
export async function observeRunCardPreparation(page: Page) {
  await page.addInitScript(() => {
    const events: Array<{ stage: string; event: string; at: number }> = [];
    Reflect.set(window, '__runCardPreparation', events);
    const record = (stage: string, event: string) => events.push({ stage, event, at: performance.now() });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const stage = this.src.startsWith('data:image/svg') ? 'overlay-decode' : 'artwork-decode';
      record(stage, 'start');
      return decode.call(this).then(() => { record(stage, 'ready'); }, (error: unknown) => {
        record(stage, 'error');
        throw error;
      });
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      record('png-encode', 'start');
      return toBlob.call(this, (blob) => {
        record('png-encode', blob ? 'ready' : 'error');
        callback(blob);
      }, type, quality);
    };
  });
}

export async function attachRunCardPreparation(page: Page, info: TestInfo) {
  if (info.status === info.expectedStatus && !process.env.RUN_CARD_TIMINGS) return;
  const diagnostic = await page.evaluate(() => ({
    events: Reflect.get(window, '__runCardPreparation'),
    status: document.querySelector('.run-share-status')?.textContent,
    visibility: document.visibilityState,
  })).catch(() => ({ unavailable: true }));
  if (process.env.RUN_CARD_TIMINGS) console.info('Run-card timing:', JSON.stringify(diagnostic));
  await info.attach('run-card-preparation', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
}
