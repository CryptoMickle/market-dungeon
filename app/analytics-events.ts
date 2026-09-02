import { track } from '@vercel/analytics';

export type JudgeDemoResult = 'blessed' | 'cursed' | 'void';
export type MarketDungeonMode = 'judge_demo' | 'full_run';

type AnalyticsEvent = {
  name: 'judge_demo_started' | 'judge_demo_completed' | 'dreamdex_cta_clicked';
  properties: Record<string, string | number | boolean>;
};

const BASE_PROPERTIES = {
  experience: 'sealed_replay_v1',
  network: 'somnia_mainnet',
  chain_id: 5031,
} as const;

export function judgeDemoStartedEvent(): AnalyticsEvent {
  return {
    name: 'judge_demo_started',
    properties: { ...BASE_PROPERTIES },
  };
}

export function judgeDemoCompletedEvent(direction: 'UP' | 'DOWN', result: JudgeDemoResult): AnalyticsEvent {
  return {
    name: 'judge_demo_completed',
    properties: {
      ...BASE_PROPERTIES,
      direction,
      result,
      verified: true,
    },
  };
}

export function dreamDexCtaClickedEvent(
  mode: MarketDungeonMode,
  direction: 'UP' | 'DOWN',
  result: JudgeDemoResult,
): AnalyticsEvent {
  return {
    name: 'dreamdex_cta_clicked',
    properties: {
      network: BASE_PROPERTIES.network,
      chain_id: BASE_PROPERTIES.chain_id,
      mode,
      direction,
      result,
    },
  };
}

export function emitAnalyticsEvent(event: AnalyticsEvent) {
  try {
    track(event.name, event.properties);
  } catch {
    // Analytics must never interrupt gameplay or verification.
  }
}
