export type DreamDexClobOdds = {
  marketId: string;
  upProbability: number | null;
  downProbability: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  source: 'ORDER_BOOK' | 'LAST_TRADE' | 'UNAVAILABLE';
  observedAtIso: string;
  provider: 'dreamDEX CLOB';
  sdk: '@somnia-chain/markets-sdk';
};

type RawClobOdds = {
  marketId: string;
  quoteDecimals: number;
  bestBid?: string | null;
  bestAsk?: string | null;
  lastPrice?: string | null;
  observedAtIso?: string;
};

function rawProbability(value: string | null | undefined, decimals: number) {
  if (value == null || !/^\d+$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const scale = 10n ** BigInt(decimals);
  const raw = BigInt(value);
  if (raw < 0n || raw > scale) return null;
  return Number(raw * 1_000_000n / scale) / 1_000_000;
}

function roundedProbability(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function deriveDreamDexClobOdds({
  marketId,
  quoteDecimals,
  bestBid,
  bestAsk,
  lastPrice,
  observedAtIso = new Date().toISOString(),
}: RawClobOdds): DreamDexClobOdds {
  const bid = rawProbability(bestBid, quoteDecimals);
  const ask = rawProbability(bestAsk, quoteDecimals);
  const crossedBook = bid != null && ask != null && bid > ask;
  const trade = rawProbability(lastPrice, quoteDecimals);
  const midpoint = !crossedBook && bid != null && ask != null ? (bid + ask) / 2 : null;
  const oneSided = !crossedBook && (bid == null || ask == null) ? bid ?? ask : null;
  const upProbability = midpoint ?? oneSided ?? trade;

  return {
    marketId,
    upProbability,
    downProbability: upProbability == null ? null : roundedProbability(1 - upProbability),
    bestBid: bid,
    bestAsk: ask,
    spread: bid != null && ask != null && bid <= ask ? roundedProbability(ask - bid) : null,
    source: midpoint != null || oneSided != null ? 'ORDER_BOOK' : trade != null ? 'LAST_TRADE' : 'UNAVAILABLE',
    observedAtIso,
    provider: 'dreamDEX CLOB',
    sdk: '@somnia-chain/markets-sdk',
  };
}

export function formatClobPercent(value: number | null, precision = 0) {
  return value == null ? '—' : `${(value * 100).toFixed(precision)}%`;
}
