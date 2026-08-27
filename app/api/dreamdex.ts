const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const RPC = 'https://api.infra.mainnet.somnia.network';

export async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(INDEXER, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: Record<string, unknown>; errors?: unknown };
  if (!response.ok || payload.errors) throw new Error('dreamDEX indexer request failed');
  return payload.data as Record<string, unknown>;
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json() as { result?: string; error?: unknown };
  if (payload.error || !payload.result) throw new Error('Somnia RPC request failed');
  return payload.result;
}

function words(hex: string) {
  const data = hex.slice(2);
  return Array.from({ length: data.length / 64 }, (_, i) => BigInt(`0x${data.slice(i * 64, i * 64 + 64)}`));
}

export async function hydrateMarket(market: Record<string, unknown>, demoReplay = false) {
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
  if (chainId !== 5031) throw new Error('Unexpected Somnia chain');
  const rawParams = await rpc('eth_call', [{ to: market.poolAddress, data: '0x0765910c' }, 'latest']);
  const [tickSize, minQuantity, lotSize] = words(rawParams);

  return {
    market: {
      ...market,
      winningOutcome: market.winningOutcome ?? null,
      strikeUsd: (Number(strikeRaw) / 100).toFixed(2),
      expiryIso: new Date(Number(market.expiry) * 1000).toISOString(),
      demoReplay,
    },
    network: { name: 'Somnia mainnet', chainId },
    book: { tickSize: tickSize.toString(), minQuantity: minQuantity.toString(), lotSize: lotSize.toString() },
    safety: { mode: 'DRY_RUN', writesEnabled: false },
  };
}

export async function fetchFullMarket(marketId: string) {
  const data = await graphql(`query ReplaySettlement($id: String!) {
    Market_by_pk(id: $id) {
      marketId marketAddress poolAddress collateral asset question strike tradingStart expiry
      status: clobStatus intervalSec quoteDecimals yesTokenId noTokenId
      winningOutcome payoutNumerators payoutDenominator voided finalized resolvedAtTimestamp lastPrice
    }
  }`, { id: marketId.toLowerCase() });
  return data.Market_by_pk as Record<string, unknown> | null;
}
