import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, type BookTop } from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import { deriveDreamDexClobOdds } from '../../clob-odds.ts';
import { SHANNON_TESTNET_PROFILE } from '../../judge-network.ts';
import { LIVE_JUDGE } from '../../live-judge-proof.ts';
import type { LiveJudgeOddsResponse } from '../../live-judge-odds.ts';
import { graphql } from '../dreamdex.ts';
import { checkRateLimit, rateLimitHeaders } from '../request-control.ts';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const READ_TIMEOUT_MS = 3_000;
const HASH = /^0x[0-9a-f]{64}$/i;
type OddsRow = Record<string, unknown>;
type Dependencies = {
  row: (marketId: string) => Promise<OddsRow | null>;
  book: (marketId: string) => Promise<Record<string, BookTop>>;
  now: () => number;
};

async function readOddsRow(marketId: string) {
  const data = await graphql(`query LiveJudgeOddsMarket($id:String!) {
    Market_by_pk(id:$id) {
      marketId marketType asset intervalSec operatorId venueId collateral tradingStart expiry
      clobStatus finalized voided winningOutcome quoteDecimals lastPrice tradeCount
    }
  }`, { id: marketId }, SHANNON_TESTNET_PROFILE, { timeoutMs: READ_TIMEOUT_MS, totalBudgetMs: READ_TIMEOUT_MS });
  const row = data.Market_by_pk;
  return row && typeof row === 'object' && !Array.isArray(row) ? row as OddsRow : null;
}

async function readOddsBook(marketId: string) {
  // Every read gets its own deadline before the SDK captures its request signal.
  // Its default is 30 seconds, too long for a one-minute market. The SDK aborts
  // the underlying fetch; no orphaned request is left behind by Promise.race.
  const exchange = new SomniaMarkets({
    indexerUrl: SHANNON_TESTNET_PROFILE.indexer,
    chain: somniaShannon,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  return exchange.client.getBookTops([marketId]);
}

function integer(value: unknown) {
  if ((typeof value !== 'string' || !/^\d+$/.test(value)) && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validRow(row: OddsRow | null, marketId: string) {
  if (!row || String(row.marketId).toLowerCase() !== marketId || row.marketType !== 'BINARY'
    || (row.asset !== 'BTC' && row.asset !== 'ETH') || integer(row.intervalSec) !== LIVE_JUDGE.intervalSec
    || integer(row.operatorId) !== LIVE_JUDGE.operatorId || String(row.venueId).toLowerCase() !== LIVE_JUDGE.venueId
    || String(row.collateral).toLowerCase() !== LIVE_JUDGE.collateral) return false;
  const start = integer(row.tradingStart); const expiry = integer(row.expiry); const decimals = integer(row.quoteDecimals);
  return start !== null && start > 0 && expiry !== null && expiry - start === LIVE_JUDGE.intervalSec
    && decimals !== null && decimals <= 36 && typeof row.finalized === 'boolean' && typeof row.voided === 'boolean';
}

export function createLiveJudgeOddsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { row: readOddsRow, book: readOddsBook, now: () => Math.floor(Date.now() / 1000), ...overrides };
  return async function GET(request: Request) {
    const quota = checkRateLimit(request, { namespace: 'live-judge-odds', limit: 60, windowMs: 60_000 });
    const headers = { ...NO_STORE, ...rateLimitHeaders(quota) };
    if (!quota.allowed) return Response.json({ error: 'Please wait before refreshing market odds.', retryAfter: quota.retryAfter },
      { status: 429, headers: { ...headers, 'retry-after': String(quota.retryAfter) } });
    const params = new URL(request.url).searchParams;
    const requestedId = params.get('marketId');
    if (!requestedId || !HASH.test(requestedId) || params.size !== 1) {
      return Response.json({ error: 'An exact one-minute Shannon market ID is required.' }, { status: 400, headers });
    }
    const marketId = requestedId.toLowerCase();
    function payload(state: LiveJudgeOddsResponse['state'], extra: Partial<LiveJudgeOddsResponse> = {}): LiveJudgeOddsResponse {
      return { marketId, chainId: LIVE_JUDGE.chainId, venueId: LIVE_JUDGE.venueId, intervalSec: LIVE_JUDGE.intervalSec,
        state, odds: deriveDreamDexClobOdds({ marketId, quoteDecimals: 18 }), serverTime: dependencies.now(), ...extra };
    }
    try {
      const row = await dependencies.row(marketId);
      if (!validRow(row, marketId) || !row) return Response.json({ error: 'This market does not belong to the one-minute Shannon demo.' }, { status: 404, headers });
      const expiry = Number(row.expiry);
      const identity = { asset: row.asset as 'BTC' | 'ETH', expiry };
      const closed = () => expiry <= dependencies.now() || row.clobStatus !== 'Trading' || row.finalized || row.voided || row.winningOutcome !== null;
      if (Number(row.tradingStart) > dependencies.now()) return Response.json({ error: 'This one-minute market has not opened.' }, { status: 404, headers });
      if (closed()) return Response.json(payload('closed', identity), { headers });
      let books: Record<string, BookTop>;
      try { books = await dependencies.book(marketId); }
      catch {
        if (closed()) return Response.json(payload('closed', identity), { headers });
        return Response.json(payload('unavailable', { ...identity, retryAfter: 5 }), { status: 503, headers: { ...headers, 'retry-after': '5' } });
      }
      // A book read can cross expiry. Never stamp an old quote as live afterward.
      if (closed()) return Response.json(payload('closed', identity), { headers });
      const top = books[marketId];
      const trades = integer(row.tradeCount);
      const odds = deriveDreamDexClobOdds({ marketId, quoteDecimals: Number(row.quoteDecimals),
        bestBid: top?.bestBid, bestAsk: top?.bestAsk,
        lastPrice: trades !== null && trades > 0 ? String(row.lastPrice ?? '') : null });
      return Response.json(payload('open', { ...identity, odds }), { headers });
    } catch {
      return Response.json(payload('unavailable', { retryAfter: 5 }), { status: 503, headers: { ...headers, 'retry-after': '5' } });
    }
  };
}

export const liveJudgeOddsHandler = createLiveJudgeOddsHandler();
