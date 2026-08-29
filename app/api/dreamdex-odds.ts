import { getBookTops } from '@somnia-chain/markets-sdk';

import { deriveDreamDexClobOdds, type DreamDexClobOdds } from '../clob-odds';

const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const SDK_READ_TIMEOUT_MS = 4_000;

type OddsMarket = Record<string, unknown>;

async function sdkBookTop(marketId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getBookTops([marketId], INDEXER),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('dreamDEX SDK order-book read timed out')), SDK_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchDreamDexClobOdds(market: OddsMarket): Promise<DreamDexClobOdds> {
  const marketId = String(market.marketId);
  const quoteDecimals = Number(market.quoteDecimals ?? 18);
  const lastPrice = Number(market.tradeCount ?? 0) > 0 ? String(market.lastPrice ?? '') : null;

  try {
    const books = await sdkBookTop(marketId);
    const top = books[marketId.toLowerCase()];
    return deriveDreamDexClobOdds({
      marketId,
      quoteDecimals,
      bestBid: top?.bestBid,
      bestAsk: top?.bestAsk,
      lastPrice,
    });
  } catch {
    return deriveDreamDexClobOdds({ marketId, quoteDecimals, lastPrice });
  }
}
