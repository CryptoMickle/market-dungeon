export const PREFERRED_EVENT_INTERVAL_SECONDS = 5 * 60;
export const FALLBACK_EVENT_INTERVAL_SECONDS = 15 * 60;
export const ACTIVE_MARKET_POLL_INTERVAL_MS = 15_000;
export const EXPIRED_MARKET_RETRY_MS = 1_000;

export type EventContractIntervalSeconds =
  | typeof PREFERRED_EVENT_INTERVAL_SECONDS
  | typeof FALLBACK_EVENT_INTERVAL_SECONDS;

type ActiveMarketCandidate = {
  intervalSec?: unknown;
  expiry?: unknown;
};

type ReplayCandidate = {
  marketId?: unknown;
  winningOutcome?: unknown;
};

export function eventContractIntervalSeconds(value: unknown): EventContractIntervalSeconds {
  return Number(value) === FALLBACK_EVENT_INTERVAL_SECONDS
    ? FALLBACK_EVENT_INTERVAL_SECONDS
    : PREFERRED_EVENT_INTERVAL_SECONDS;
}

export function eventContractIntervalLabel(value: unknown) {
  return `${eventContractIntervalSeconds(value) / 60}m`;
}

export function eventContractIntervalName(value: unknown) {
  return `${eventContractIntervalSeconds(value) / 60}-minute`;
}

export function activeMarketRefreshDelayMs(expiry: unknown, nowMilliseconds: number) {
  const expiryMilliseconds = Number(expiry) * 1_000;
  if (!Number.isFinite(expiryMilliseconds) || expiryMilliseconds <= 0) {
    return ACTIVE_MARKET_POLL_INTERVAL_MS;
  }

  const untilExpiry = expiryMilliseconds - nowMilliseconds;
  if (untilExpiry <= 0) return EXPIRED_MARKET_RETRY_MS;
  return Math.min(ACTIVE_MARKET_POLL_INTERVAL_MS, Math.ceil(untilExpiry));
}

export function selectPreferredActiveMarket<T extends ActiveMarketCandidate>(
  candidates: readonly T[],
  nowSeconds: number,
) {
  const eligible = candidates.filter((candidate) => {
    const interval = Number(candidate.intervalSec);
    const expiry = Number(candidate.expiry);
    return (interval === PREFERRED_EVENT_INTERVAL_SECONDS || interval === FALLBACK_EVENT_INTERVAL_SECONDS)
      && Number.isFinite(expiry) && expiry > nowSeconds;
  });
  const preferred = eligible
    .filter((candidate) => Number(candidate.intervalSec) === PREFERRED_EVENT_INTERVAL_SECONDS)
    .sort((left, right) => Number(right.expiry) - Number(left.expiry));
  if (preferred[0]) return preferred[0];

  const idealFallbackExpiry = nowSeconds + 6 * 60;
  return eligible
    .filter((candidate) => Number(candidate.intervalSec) === FALLBACK_EVENT_INTERVAL_SECONDS)
    .sort((left, right) => (
      Math.abs(Number(left.expiry) - idealFallbackExpiry) - Math.abs(Number(right.expiry) - idealFallbackExpiry)
    ))[0];
}

function validReplayCandidates<T extends ReplayCandidate>(candidates: readonly T[]) {
  return candidates
    .map((market) => ({
      ...market,
      marketId: String(market.marketId ?? '').toLowerCase(),
      winningOutcome: Number(market.winningOutcome),
    }))
    .filter((market) => /^0x[0-9a-f]{64}$/.test(market.marketId)
      && (market.winningOutcome === 0 || market.winningOutcome === 1));
}

export function selectBalancedReplayPool(
  preferredCandidates: readonly ReplayCandidate[],
  fallbackCandidates: readonly ReplayCandidate[],
) {
  for (const [intervalSec, source] of [
    [PREFERRED_EVENT_INTERVAL_SECONDS, preferredCandidates],
    [FALLBACK_EVENT_INTERVAL_SECONDS, fallbackCandidates],
  ] as const) {
    const candidates = validReplayCandidates(source);
    const outcomePools = [0, 1].map((outcome) => candidates.filter((market) => market.winningOutcome === outcome));
    if (outcomePools.every((pool) => pool.length > 0)) {
      return { intervalSec, outcomePools };
    }
  }
  return null;
}
