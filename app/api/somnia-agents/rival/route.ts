import path from 'node:path';
import { graphql, hydrateMarket } from '../../dreamdex.ts';
import { canonicalSnapshot, prepareSomniaRequest, verifySomniaRequest, type MarketSnapshot } from '../../../../lib/somnia-agents/protocol.ts';
import { createLocalRival, createLocalRivalHandler, RivalError } from '../../../../lib/somnia-agents/local-rival.ts';
import { createPreviewRival, createPreviewRivalHandler } from '../../../../lib/somnia-agents/preview-rival.ts';
import { hostedSomniaAgents, somniaAgentsEnvironment } from '../../../../lib/somnia-agents/environment.ts';
import { checkRateLimit } from '../../request-control.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

const dependencies = {
  readMarket, canonicalSnapshot,
  prepareTransaction: (snapshot: MarketSnapshot) => prepareSomniaRequest(snapshot),
  verifyTransaction: (snapshot: MarketSnapshot, txHash: string) => verifySomniaRequest(snapshot, txHash),
};
const rival = createLocalRival({
  ...dependencies,
  directory: path.join(process.cwd(), '.local', 'somnia-agents'),
});
const localHandler = createLocalRivalHandler(rival, () => somniaAgentsEnvironment(process.env) === 'local');
const previewHandler = createPreviewRivalHandler(createPreviewRival({ ...dependencies, environment: {
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  MARKET_DUNGEON_PREVIEW_AGENTS: process.env.MARKET_DUNGEON_PREVIEW_AGENTS,
  MARKET_DUNGEON_PRODUCTION_AGENTS: process.env.MARKET_DUNGEON_PRODUCTION_AGENTS,
  JUDGE_REPLAY_SEAL_KEY: process.env.JUDGE_REPLAY_SEAL_KEY,
} }), {
  // Per-instance pressure relief, not a global quota or gameplay authenticity claim.
  limitRequest: request => checkRateLimit(request, { namespace: 'somnia-agents-hosted', limit: 90, windowMs: 60_000 }),
});

export async function POST(request: Request) {
  return hostedSomniaAgents(somniaAgentsEnvironment(process.env)) ? previewHandler(request) : localHandler(request);
}
