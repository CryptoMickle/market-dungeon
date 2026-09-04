import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { somniaMainnet } from '@somnia-chain/markets-sdk/chains';

import { deriveDreamDexClobOdds, type DreamDexClobOdds } from '../clob-odds';

const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const exchange = new SomniaMarkets({
  indexerUrl: INDEXER,
  chain: somniaMainnet,
  addresses: SOMNIA_MAINNET_ADDRESSES,
});

type OddsMarket = Record<string, unknown>;

async function sdkBookTop(marketId: string) {
  // SDK 0.29 routes typed reads through its GraphQL boundary, which uses
  // AbortSignal.timeout. Avoid an outer Promise.race that returns early while
  // leaving the SDK's underlying request running in the background.
  return exchange.client.getBookTops([marketId]);
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
