import { pageview } from '@vercel/analytics';

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
): AnalyticsPageview {
  return {
    path: `/funnel/judge-demo/completed/${segment(result)}/${segment(direction)}`,
  };
}

export function dreamDexCtaClickedEvent(
  mode: MarketDungeonMode,
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
): AnalyticsPageview {
  return {
    path: `/funnel/dreamdex/continue/${segment(mode)}/${segment(result)}/${segment(direction)}`,
  };
}

export function emitAnalyticsEvent(event: AnalyticsPageview) {
  try {
    // Manual pageviews keep the funnel visible on Vercel Hobby, where custom
    // events are unavailable. These paths are analytics labels only; gameplay
    // stays on the current URL.
    pageview({ route: event.path, path: event.path });
  } catch {
    // Analytics must never interrupt gameplay or verification.
  }
}
