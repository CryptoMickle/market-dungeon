const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const RPC = 'https://api.infra.mainnet.somnia.network';

async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(INDEXER, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: Record<string, unknown>; errors?: unknown };
  if (!response.ok || payload.errors) throw new Error(JSON.stringify(payload.errors ?? payload));
  return payload.data as Record<string, unknown>;
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json() as { result?: string; error?: unknown };
  if (payload.error || !payload.result) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}

function words(hex: string) {
  const data = hex.slice(2);
  return Array.from({ length: data.length / 64 }, (_, i) => BigInt(`0x${data.slice(i * 64, i * 64 + 64)}`));
}

export async function GET(request: Request) {
  try {
    const requestedId = new URL(request.url).searchParams.get('marketId');
    if (requestedId) {
      const data = await graphql(`query Settlement($id: String!) {
        Market_by_pk(id: $id) { marketId status: clobStatus finalized voided winningOutcome payoutNumerators payoutDenominator resolvedAtTimestamp }
      }`, { id: requestedId.toLowerCase() });
      return Response.json({ market: data.Market_by_pk }, { headers: { 'cache-control': 'no-store' } });
    }

    const now = Math.floor(Date.now() / 1000).toString();
    const data = await graphql(`query ActiveBtc15m($now: numeric!) {
      Market(where: {
        marketType: {_eq: "BINARY"}, asset: {_eq: "BTC"}, intervalSec: {_eq: "900"},
        tradingStart: {_lte: $now}, expiry: {_gt: $now}, clobStatus: {_in: ["Listed", "Trading"]}
      }, order_by: {expiry: asc}, limit: 8) {
        marketId marketAddress poolAddress collateral asset question strike tradingStart expiry
        status: clobStatus intervalSec quoteDecimals yesTokenId noTokenId winningOutcome payoutNumerators payoutDenominator voided finalized lastPrice
      }
    }`, { now });
    const candidates = (data.Market as Array<Record<string, unknown>>) ?? [];
    const idealRemaining = 13 * 60;
    const market = [...candidates].sort((left, right) => {
      const leftRemaining = Number(left.expiry) - Number(now);
      const rightRemaining = Number(right.expiry) - Number(now);
      const leftPenalty = leftRemaining >= 10 * 60 ? Math.abs(leftRemaining - idealRemaining) : 10_000 + Math.abs(leftRemaining - idealRemaining);
      const rightPenalty = rightRemaining >= 10 * 60 ? Math.abs(rightRemaining - idealRemaining) : 10_000 + Math.abs(rightRemaining - idealRemaining);
      return leftPenalty - rightPenalty;
    })[0];
    if (!market) return Response.json({ error: 'No active BTC 15m market' }, { status: 404 });

    let strikeRaw = String(market.strike ?? '0');
    if (BigInt(strikeRaw) === 0n) {
      const refs = await graphql(`query OpeningRefs($ids: [String!]) {
        MarketReferenceLink(where: {market_id: {_in: $ids}}) { referenceQuestionId }
      }`, { ids: [String(market.marketId).toLowerCase()] });
      const qid = (refs.MarketReferenceLink as Array<{ referenceQuestionId: string }>)?.[0]?.referenceQuestionId;
      if (qid) {
        const answers = await graphql(`query OpeningAnswers($qids: [String!]) {
          OracleAnswer(where: {id: {_in: $qids}}) { numericValue }
        }`, { qids: [String(qid)] });
        strikeRaw = (answers.OracleAnswer as Array<{ numericValue: string }>)?.[0]?.numericValue ?? strikeRaw;
      }
    }

    const chainId = Number(BigInt(await rpc('eth_chainId', [])));
    if (chainId !== 5031) throw new Error(`Unexpected chain ${chainId}`);
    const rawParams = await rpc('eth_call', [{ to: market.poolAddress, data: '0x0765910c' }, 'latest']);
    const [tickSize, minQuantity, lotSize] = words(rawParams);

    return Response.json({
      market: { ...market, strikeUsd: (Number(strikeRaw) / 100).toFixed(2), expiryIso: new Date(Number(market.expiry) * 1000).toISOString() },
      network: { name: 'Somnia mainnet', chainId },
      book: { tickSize: tickSize.toString(), minQuantity: minQuantity.toString(), lotSize: lotSize.toString() },
      safety: { mode: 'DRY_RUN', writesEnabled: false },
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Market fetch failed' }, { status: 502 });
  }
}
