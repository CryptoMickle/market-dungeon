import path from 'node:path';
import { graphql, hydrateMarket } from '../../dreamdex.ts';
import { canonicalSnapshot, prepareSomniaRequest, verifySomniaRequest, type MarketSnapshot } from '../../../../lib/somnia-agents/protocol.ts';
import { createLocalRival, createLocalRivalHandler, RivalError } from '../../../../lib/somnia-agents/local-rival.ts';

export const runtime = 'nodejs';

async function readMarket(marketId: string, now: number): Promise<MarketSnapshot> {
  const data = await graphql(`query KevinActiveMarket($id: String!) {
    Market_by_pk(id: $id) {
      marketId marketType asset question strike tradingStart expiry status: clobStatus
      intervalSec finalized voided poolAddress
    }
  }`, { id: marketId });
  const market = data.Market_by_pk as Record<string, unknown> | null;
  if (!market || String(market.marketId).toLowerCase() !== marketId || market.marketType !== 'BINARY' || market.asset !== 'BTC'
    || Number(market.intervalSec) !== 300 || !['Listed', 'Trading'].includes(String(market.status))
    || market.finalized !== false || market.voided !== false
    || !Number.isSafeInteger(Number(market.tradingStart)) || !Number.isSafeInteger(Number(market.expiry))
    || Number(market.tradingStart) > now || Number(market.expiry) <= now) {
    throw new RivalError('Kevin needs the exact active BTC five-minute market from this expedition.', 409);
  }
  if (Number(market.expiry) - 10 <= now) throw new RivalError('Kevin’s prediction window has closed. Continue your expedition.', 409);
  const hydrated = await hydrateMarket(market);
  if (hydrated.network.chainId !== 5031) throw new RivalError('Unexpected market network.', 409);
  const snapshot: MarketSnapshot = {
    marketId, marketChainId: 5031, intervalSec: 300, question: String(market.question ?? ''),
    strikeUsd: hydrated.market.strikeUsd, tradingStart: Number(market.tradingStart), expiry: Number(market.expiry),
    snapshotAt: now, cutoff: Number(market.expiry) - 10,
  };
  // Reconstruct the allowlisted shape; hydrated outcome fields never enter agent input.
  return JSON.parse(canonicalSnapshot(snapshot)) as MarketSnapshot;
}

const rival = createLocalRival({
  directory: path.join(process.cwd(), '.local', 'somnia-agents'),
  readMarket, canonicalSnapshot,
  prepareTransaction: (snapshot) => prepareSomniaRequest(snapshot),
  verifyTransaction: (snapshot, txHash) => verifySomniaRequest(snapshot, txHash),
});

export const POST = createLocalRivalHandler(rival, () => process.env.MARKET_DUNGEON_LOCAL_AGENTS === '1' && !process.env.VERCEL);
