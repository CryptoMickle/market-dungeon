import { pageview } from '@vercel/analytics';

import { eventContractIntervalLabel } from './event-contract-interval.ts';

export type JudgeDemoResult = 'blessed' | 'cursed' | 'void';
export type MarketDungeonMode = 'judge_demo' | 'full_run';
export type JudgeEntrySource = 'home' | 'direct' | 'challenge';
export type JudgeDurationBucket = 'under-60s' | '60-119s' | '120-179s' | '180s-plus' | 'unknown';
export type JudgeVerificationFailureReason = 'server-rejected' | 'browser-mismatch';
export type JudgeVerificationNotProvableReason = 'seal-expired';
export type ShareAction = 'native-completed' | 'x-intent-opened' | 'card-downloaded' | 'text-copied';

type AnalyticsPageview = {
  path: `/funnel/v2/${string}`;
};

function segment(value: string) {
  return value.toLowerCase().replaceAll('_', '-');
}

export function judgeDurationBucket(elapsedMs: unknown): JudgeDurationBucket {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 'unknown';
  if (elapsedMs < 60_000) return 'under-60s';
  if (elapsedMs < 120_000) return '60-119s';
  if (elapsedMs < 180_000) return '120-179s';
  return '180s-plus';
}

export function judgeDemoEntryEvent(source: JudgeEntrySource): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/entry/${source}`,
  };
}

export function judgeDemoLockedEvent(intervalSec: unknown): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/locked/${eventContractIntervalLabel(intervalSec)}`,
  };
}

export function judgeDemoRevealAttemptedEvent(intervalSec: unknown): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/reveal-attempted/${eventContractIntervalLabel(intervalSec)}`,
  };
}

export function judgeDemoVerifiedEvent(
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
  intervalSec: unknown,
  elapsedMs: unknown,
): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/verified/${eventContractIntervalLabel(intervalSec)}/${judgeDurationBucket(elapsedMs)}/${result}/${segment(direction)}`,
  };
}

export function judgeDemoVerificationFailedEvent(
  reason: JudgeVerificationFailureReason,
): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/verification/fail/${reason}`,
  };
}

export function judgeDemoVerificationNotProvableEvent(
  reason: JudgeVerificationNotProvableReason,
): AnalyticsPageview {
  return {
    path: `/funnel/v2/judge/verification/not-provable/${reason}`,
  };
}

export function dreamDexCtaClickedEvent(
  mode: MarketDungeonMode,
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
  intervalSec: unknown,
): AnalyticsPageview {
  return {
    path: `/funnel/v2/dreamdex/continue/${eventContractIntervalLabel(intervalSec)}/${segment(mode)}/${result}/${segment(direction)}`,
  };
}

export function shareEngagedEvent(mode: MarketDungeonMode): AnalyticsPageview {
  return {
    path: `/funnel/v2/share/engaged/${segment(mode)}`,
  };
}

export function shareActionEvent(
  mode: MarketDungeonMode,
  action: ShareAction,
): AnalyticsPageview {
  return {
    path: `/funnel/v2/share/action/${segment(mode)}/${action}`,
  };
}

export function challengeCreatedEvent(): AnalyticsPageview {
  return {
    path: '/funnel/v2/challenge/created',
  };
}

export function challengeOpenedEvent(): AnalyticsPageview {
  return {
    path: '/funnel/v2/challenge/opened',
  };
}

export function challengeVerifiedEvent(): AnalyticsPageview {
  return {
    path: '/funnel/v2/challenge/verified',
  };
}

export function hasAnalyticsAutomationMarker(search: string) {
  return new URLSearchParams(search).get('automation') === '1';
}

export function shouldEmitAnalyticsEvent(automatedBrowser: boolean, automatedMarker = false) {
  return !automatedBrowser && !automatedMarker;
}

export function emitAnalyticsEvent(event: AnalyticsPageview) {
  try {
    // Playwright sets navigator.webdriver. Excluding those sessions keeps the
    // scheduled production smoke from inflating the non-WebDriver pilot funnel.
    if (!shouldEmitAnalyticsEvent(
      typeof navigator !== 'undefined' && navigator.webdriver,
      typeof window !== 'undefined' && hasAnalyticsAutomationMarker(window.location.search),
    )) {
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
