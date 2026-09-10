import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { somniaMainnet } from '@somnia-chain/markets-sdk/chains';

import { deriveDreamDexClobOdds, type DreamDexClobOdds } from '../clob-odds.ts';

const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const READ_TIMEOUT_MS = 3_000;

type OddsMarket = Record<string, unknown>;

async function sdkBookTop(marketId: string) {
  // The SDK's default is 30 seconds. Give each read a fresh deadline so an
  // optional odds read cannot hold the market response that long. The SDK
  // aborts its underlying fetch; a timed-out client is never reused.
  const exchange = new SomniaMarkets({
    indexerUrl: INDEXER,
    chain: somniaMainnet,
    addresses: SOMNIA_MAINNET_ADDRESSES,
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  return exchange.client.getBookTops([marketId]);
}

export async function fetchDreamDexClobOdds(market: OddsMarket): Promise<DreamDexClobOdds> {
  const marketId = String(market.marketId);
  const quoteDecimals = Number(market.quoteDecimals ?? 18);
  const lastPrice = Number(market.tradeCount ?? 0) > 0 ? String(market.lastPrice ?? '') : null;

  try {
    const books = await sdkBookTop(marketId);
    const top = books[marketId.toLowerCase()];
    return {
      ...deriveDreamDexClobOdds({
        marketId,
        quoteDecimals,
        bestBid: top?.bestBid,
        bestAsk: top?.bestAsk,
        lastPrice,
      }),
      bookStatus: 'ok',
    };
  } catch (error) {
    // Distinguish a failed read from a successfully empty book without logging
    // provider responses, request details or potentially sensitive error text.
    console.warn('market_dungeon_clob_read_failed', {
      timeout: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name),
    });
    return {
      ...deriveDreamDexClobOdds({ marketId, quoteDecimals, lastPrice }),
      bookStatus: 'unavailable',
    };
  }
}
