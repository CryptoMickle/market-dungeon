import { graphql, hydrateMarket, verifyDirectSettlement } from '../dreamdex';
import { fetchDreamDexClobOdds } from '../dreamdex-odds';
import { selectPreferredActiveMarket } from '../../event-contract-interval';

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const requestedId = searchParams.get('marketId');
    if (requestedId) {
      const data = await graphql(`query Settlement($id: String!) {
        Market_by_pk(id: $id) {
          marketId marketAddress poolAddress collateral yesTokenId noTokenId intervalSec status: clobStatus finalized voided
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

    const nowSeconds = Math.floor(Date.now() / 1000);
    const now = nowSeconds.toString();
    const data = await graphql(`query ActiveBtcPreferred($now: numeric!) {
      Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_in: ["300", "900"]},
        tradingStart: {_lte: $now}, expiry: {_gt: $now}, clobStatus: {_in: ["Listed", "Trading"]}
      }, order_by: {expiry: asc}, limit: 16) {
        marketId marketAddress poolAddress collateral asset question strike tradingStart expiry
        status: clobStatus intervalSec quoteDecimals yesTokenId noTokenId winningOutcome payoutNumerators payoutDenominator voided finalized lastPrice tradeCount
      }
    }`, { now });
    const candidates = (data.Market as Array<Record<string, unknown>>) ?? [];
    const market = selectPreferredActiveMarket(candidates, nowSeconds);
    if (!market) return Response.json({ error: 'No active BTC 5m or 15m market' }, { status: 404 });

    const [hydrated, odds] = await Promise.all([
      hydrateMarket(market),
      fetchDreamDexClobOdds(market),
    ]);
    return Response.json({ ...hydrated, odds }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Market fetch failed' }, { status: 502 });
  }
}
