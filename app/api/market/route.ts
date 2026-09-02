import { graphql, hydrateMarket, verifyDirectSettlement } from '../dreamdex';
import { fetchDreamDexClobOdds } from '../dreamdex-odds';

const IDEAL_ENTRY_SECONDS = 6 * 60;

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const requestedId = searchParams.get('marketId');
    if (requestedId) {
      const data = await graphql(`query Settlement($id: String!) {
        Market_by_pk(id: $id) {
          marketId marketAddress poolAddress collateral yesTokenId noTokenId status: clobStatus finalized voided
          winningOutcome payoutNumerators payoutDenominator resolvedAtTimestamp
        }
      }`, { id: requestedId.toLowerCase() });
      const market = data.Market_by_pk as Record<string, unknown> | null;
      const onchainSettlement = market?.finalized === true
        ? await verifyDirectSettlement(market)
        : undefined;
      return Response.json({ market, ...(onchainSettlement ? { onchainSettlement } : {}) }, { headers: { 'cache-control': 'no-store' } });
    }

    if (searchParams.has('demo')) {
      return Response.json(
        { error: 'Legacy replay endpoint removed. Use the sealed Judge Replay flow.' },
        { status: 410, headers: { 'cache-control': 'private, no-store, max-age=0' } },
      );
    }

    const now = Math.floor(Date.now() / 1000).toString();
    const data = await graphql(`query ActiveBtc15m($now: numeric!) {
      Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_eq: "900"},
        tradingStart: {_lte: $now}, expiry: {_gt: $now}, clobStatus: {_in: ["Listed", "Trading"]}
      }, order_by: {expiry: asc}, limit: 8) {
        marketId marketAddress poolAddress collateral asset question strike tradingStart expiry
        status: clobStatus intervalSec quoteDecimals yesTokenId noTokenId winningOutcome payoutNumerators payoutDenominator voided finalized lastPrice tradeCount
      }
    }`, { now });
    const candidates = (data.Market as Array<Record<string, unknown>>) ?? [];
    const market = [...candidates].sort((left, right) => {
      const leftRemaining = Number(left.expiry) - Number(now);
      const rightRemaining = Number(right.expiry) - Number(now);
      return Math.abs(leftRemaining - IDEAL_ENTRY_SECONDS) - Math.abs(rightRemaining - IDEAL_ENTRY_SECONDS);
    })[0];
    if (!market) return Response.json({ error: 'No active BTC 15m market' }, { status: 404 });

    const [hydrated, odds] = await Promise.all([
      hydrateMarket(market),
      fetchDreamDexClobOdds(market),
    ]);
    return Response.json({ ...hydrated, odds }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Market fetch failed' }, { status: 502 });
  }
}
