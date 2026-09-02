import { eventContractIntervalSeconds, type EventContractIntervalSeconds } from './event-contract-interval.ts';

export type LiveBtcContext = {
  priceUsd: string;
  observedAtIso: string;
  intervalSec: EventContractIntervalSeconds;
};

export function liveBtcContextFromMarket(value: unknown): LiveBtcContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const market = value as Record<string, unknown>;
  const price = Number(market.strikeUsd);
  const observedAtSeconds = Number(market.tradingStart);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(observedAtSeconds) || observedAtSeconds <= 0) return null;

  const observedAt = new Date(observedAtSeconds * 1000);
  if (Number.isNaN(observedAt.getTime())) return null;
  return {
    priceUsd: price.toFixed(2),
    observedAtIso: observedAt.toISOString(),
    intervalSec: eventContractIntervalSeconds(market.intervalSec),
  };
}

export function liveBtcContextPrice(context: LiveBtcContext) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(context.priceUsd));
}

export function liveBtcContextTime(context: LiveBtcContext) {
  return `${context.observedAtIso.slice(11, 16)} UTC`;
}
