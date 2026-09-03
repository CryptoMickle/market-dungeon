import { pageview } from '@vercel/analytics';

import { eventContractIntervalLabel } from './event-contract-interval.ts';

export type JudgeDemoResult = 'blessed' | 'cursed' | 'void';
export type MarketDungeonMode = 'judge_demo' | 'full_run';

type AnalyticsPageview = {
  path: `/funnel/${string}`;
};

function segment(value: string) {
  return value.toLowerCase().replaceAll('_', '-');
}

export function judgeDemoStartedEvent(): AnalyticsPageview {
  return {
    path: '/funnel/judge-demo/started',
  };
}

export function judgeDemoCompletedEvent(
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
  intervalSec: unknown,
): AnalyticsPageview {
  return {
    path: `/funnel/judge-demo/completed/${eventContractIntervalLabel(intervalSec)}/${segment(result)}/${segment(direction)}`,
  };
}

export function dreamDexCtaClickedEvent(
  mode: MarketDungeonMode,
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
  intervalSec: unknown,
): AnalyticsPageview {
  return {
    path: `/funnel/dreamdex/continue/${eventContractIntervalLabel(intervalSec)}/${segment(mode)}/${segment(result)}/${segment(direction)}`,
  };
}

export function shouldEmitAnalyticsEvent(automatedBrowser: boolean) {
  return !automatedBrowser;
}

export function emitAnalyticsEvent(event: AnalyticsPageview) {
  try {
    // Playwright sets navigator.webdriver. Excluding those sessions keeps the
    // scheduled production smoke from inflating the human Judge funnel.
    if (!shouldEmitAnalyticsEvent(typeof navigator !== 'undefined' && navigator.webdriver)) {
      return;
    }

    // Manual pageviews keep the funnel visible on Vercel Hobby, where custom
    // events are unavailable. These paths are analytics labels only; gameplay
    // stays on the current URL.
    pageview({ route: event.path, path: event.path });
  } catch {
    // Analytics must never interrupt gameplay or verification.
  }
}
