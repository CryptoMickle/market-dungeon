import { decodeFunctionResult, encodeFunctionData } from 'viem';

import {
  BINARY_SETTLEMENT_ABI,
  DREAMDEX_SETTLEMENT_CONTRACTS,
  MODULE_MARKETS_ABI,
  isTerminalSettlementMarket,
  type DirectOnchainSettlementProof,
} from '../onchain-settlement-proof.ts';

const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const RPC = 'https://api.infra.mainnet.somnia.network';
const INDEXER_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 5_000;
const MAX_READ_ATTEMPTS = 2;

// Sourced from @somnia-chain/markets-sdk 0.25.0 mainnet-production manifests.
export const DREAMDEX_MAINNET_CONTRACTS = DREAMDEX_SETTLEMENT_CONTRACTS;

export class UpstreamReadError extends Error {
  readonly retryable: boolean;
  readonly retryAfter: number;

  constructor(message: string, options: { retryable: boolean; retryAfter?: number; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'UpstreamReadError';
    this.retryable = options.retryable;
    this.retryAfter = options.retryAfter ?? 2;
  }
}

export function isRetryableUpstreamError(error: unknown): error is UpstreamReadError {
  return error instanceof UpstreamReadError && error.retryable;
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function responseRetryAfter(response: Response) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(30, Math.ceil(seconds)) : 2;
}

async function postJsonRead<T>(
  source: 'dreamDEX indexer' | 'Somnia RPC',
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  let lastError: UpstreamReadError | undefined;

  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new UpstreamReadError(`${source} returned HTTP ${response.status}`, {
          retryable: retryableStatus(response.status),
          retryAfter: responseRetryAfter(response),
        });
      }
      try {
        return await response.json() as T;
      } catch (cause) {
        throw new UpstreamReadError(`${source} returned invalid JSON`, { retryable: false, cause });
      }
    } catch (cause) {
      lastError = cause instanceof UpstreamReadError
        ? cause
        : new UpstreamReadError(`${source} read timed out or failed`, { retryable: true, cause });
      if (!lastError.retryable || attempt === MAX_READ_ATTEMPTS) throw lastError;
    }
  }

  throw lastError ?? new UpstreamReadError(`${source} read failed`, { retryable: true });
}

export async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const payload = await postJsonRead<{ data?: Record<string, unknown>; errors?: unknown }>(
    'dreamDEX indexer',
    INDEXER,
    { query, variables },
    INDEXER_TIMEOUT_MS,
  );
  if (payload.errors || !payload.data) {
    throw new UpstreamReadError('dreamDEX indexer rejected the query', { retryable: false });
  }
  return payload.data as Record<string, unknown>;
}

async function rpc<T>(method: string, params: unknown[]) {
  const payload = await postJsonRead<{ result?: T; error?: unknown }>(
    'Somnia RPC',
    RPC,
    { jsonrpc: '2.0', id: 1, method, params },
    RPC_TIMEOUT_MS,
  );
  if (payload.error || payload.result == null) {
    throw new UpstreamReadError('Somnia RPC rejected the read', { retryable: false });
  }
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

  const chainId = Number(BigInt(await rpc<string>('eth_chainId', [])));
  if (chainId !== 5031) throw new Error('Unexpected Somnia chain');
  const rawParams = await rpc<string>('eth_call', [{ to: market.poolAddress, data: '0x0765910c' }, 'latest']);
  const [tickSize, minQuantity, lotSize] = words(rawParams);
  const onchainSettlement = isTerminalSettlementMarket(market)
    ? await verifyDirectSettlement(market, chainId)
    : undefined;

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
    ...(onchainSettlement ? { onchainSettlement } : {}),
    safety: { mode: 'DRY_RUN', writesEnabled: false },
  };
}

function sameAddress(left: unknown, right: string) {
  return typeof left === 'string' && /^0x[0-9a-f]{40}$/i.test(left) && left.toLowerCase() === right.toLowerCase();
}

function outcomeFromPayouts(payouts: readonly bigint[], voided: boolean) {
  if (payouts.length !== 2 || payouts.some((value) => value < 0n)) throw new Error('Invalid settlement payout vector');
  if (voided) {
    if (payouts[0] !== payouts[1]) throw new Error('Invalid void settlement vector');
    return null;
  }
  if (payouts[0] === payouts[1]) throw new Error('Settlement has no unique winner');
  return payouts[0] > payouts[1] ? 0 : 1;
}

export async function verifyDirectSettlement(
  market: Record<string, unknown>,
  verifiedChainId?: number,
): Promise<DirectOnchainSettlementProof> {
  const marketId = String(market.marketId ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(marketId) || !isTerminalSettlementMarket(market)) throw new Error('Terminal market required');
  const chainId = verifiedChainId ?? Number(BigInt(await rpc<string>('eth_chainId', [])));
  if (chainId !== 5031) throw new Error('Unexpected Somnia chain');

  const blockTag = await rpc<string>('eth_blockNumber', []);
  if (!/^0x[0-9a-f]+$/i.test(blockTag)) throw new Error('Invalid Somnia block tag');
  const block = await rpc<{ hash?: string; number?: string }>('eth_getBlockByNumber', [blockTag, false]);
  if (!/^0x[0-9a-f]{64}$/i.test(String(block.hash)) || String(block.number).toLowerCase() !== blockTag.toLowerCase()) {
    throw new Error('Invalid Somnia block proof');
  }
  const blockHash = String(block.hash).toLowerCase();
  const blockReference = { blockHash, requireCanonical: true } as const;

  const moduleData = encodeFunctionData({
    abi: MODULE_MARKETS_ABI,
    functionName: 'markets',
    args: [marketId as `0x${string}`],
  });
  const moduleResult = await rpc<`0x${string}`>('eth_call', [{
    to: DREAMDEX_MAINNET_CONTRACTS.binaryModule,
    data: moduleData,
  }, blockReference]);
  const moduleRecord = decodeFunctionResult({
    abi: MODULE_MARKETS_ABI,
    functionName: 'markets',
    data: moduleResult,
  });
  const marketAddress = moduleRecord[8];
  const poolAddress = moduleRecord[9];
  const yesId = moduleRecord[10];
  const noId = moduleRecord[11];
  const moduleCollateral = moduleRecord[3];
  if (moduleRecord[1] !== 2 || yesId === 0n || noId !== yesId + 1n
    || !sameAddress(market.marketAddress, marketAddress) || !sameAddress(market.poolAddress, poolAddress)
    || !sameAddress(market.collateral, moduleCollateral)
    || String(market.yesTokenId) !== yesId.toString() || String(market.noTokenId) !== noId.toString()
    || (market.oracleQuestionId != null && String(market.oracleQuestionId) !== moduleRecord[0].toString())
    || (market.operatorId != null && String(market.operatorId) !== moduleRecord[4].toString())
    || (market.venueId != null && String(market.venueId).toLowerCase() !== moduleRecord[5].toLowerCase())
    || (market.creator != null && String(market.creator).toLowerCase() !== moduleRecord[7].toLowerCase())
    || (market.tradingStart != null && String(market.tradingStart) !== moduleRecord[12].toString())
    || (market.expiry != null && String(market.expiry) !== moduleRecord[13].toString())) {
    throw new Error('Module market binding mismatch');
  }

  const marketKey = yesId >> 8n;
  const settlementData = encodeFunctionData({
    abi: BINARY_SETTLEMENT_ABI,
    functionName: 'getSettlement',
    args: [marketKey],
  });
  const settlementResult = await rpc<`0x${string}`>('eth_call', [{
    to: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
    data: settlementData,
  }, blockReference]);
  const settlement = decodeFunctionResult({
    abi: BINARY_SETTLEMENT_ABI,
    functionName: 'getSettlement',
    data: settlementResult,
  });
  const payoutNumerators = [...settlement.payoutNumerators];
  const payoutDenominator = payoutNumerators.reduce((sum, value) => sum + value, 0n);
  const winningOutcome = outcomeFromPayouts(payoutNumerators, settlement.voided);
  const encodedPool = `0x${(yesId >> 72n).toString(16).padStart(40, '0')}`;
  const encodedNonce = (yesId >> 8n) & ((1n << 64n) - 1n);

  if (!settlement.finalized || settlement.pool.toLowerCase() !== poolAddress.toLowerCase()
    || encodedPool.toLowerCase() !== poolAddress.toLowerCase() || encodedNonce !== settlement.nonce
    || settlement.collateralToken.toLowerCase() !== moduleCollateral.toLowerCase()
    || !sameAddress(market.collateral, settlement.collateralToken)
    || settlement.voided !== (market.voided === true)
    || (!settlement.voided && winningOutcome !== Number(market.winningOutcome))) {
    throw new Error('Direct settlement does not match indexed market');
  }
  if (Array.isArray(market.payoutNumerators)) {
    const indexedPayouts = market.payoutNumerators.map((value) => String(value));
    if (indexedPayouts.length !== 2 || indexedPayouts.some((value, index) => value !== payoutNumerators[index].toString())) {
      throw new Error('Settlement payout vector mismatch');
    }
  }
  if (market.payoutDenominator != null && String(market.payoutDenominator) !== payoutDenominator.toString()) {
    throw new Error('Settlement payout denominator mismatch');
  }

  return {
    verified: true,
    source: 'SOMNIA_RPC_ETH_CALL',
    chainId: 5031,
    blockNumber: BigInt(blockTag).toString(),
    blockHash,
    blockTag,
    marketId,
    marketAddress,
    poolAddress,
    moduleAddress: DREAMDEX_MAINNET_CONTRACTS.binaryModule,
    settlementAddress: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
    collateralToken: settlement.collateralToken,
    oracleQuestionId: moduleRecord[0].toString(),
    originOperatorId: moduleRecord[4].toString(),
    originVenueId: moduleRecord[5],
    creator: moduleRecord[7],
    tradingStart: moduleRecord[12].toString(),
    expiry: moduleRecord[13].toString(),
    yesId: yesId.toString(),
    noId: noId.toString(),
    marketKey: marketKey.toString(),
    nonce: settlement.nonce.toString(),
    backing: settlement.backing.toString(),
    finalized: true,
    voided: settlement.voided,
    winningOutcome,
    payoutNumerators: [payoutNumerators[0].toString(), payoutNumerators[1].toString()],
    payoutDenominator: payoutDenominator.toString(),
    settlementFeeBpsTimes1k: settlement.settlementFeeBpsTimes1k.toString(),
    calls: {
      moduleMarket: {
        to: DREAMDEX_MAINNET_CONTRACTS.binaryModule,
        blockTag,
        blockReference,
        data: moduleData,
        result: moduleResult,
      },
      settlementRecord: {
        to: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
        blockTag,
        blockReference,
        data: settlementData,
        result: settlementResult,
      },
    },
  };
}

export async function fetchFullMarket(marketId: string) {
  const data = await graphql(`query ReplaySettlement($id: String!) {
    Market_by_pk(id: $id) {
      marketId marketAddress poolAddress collateral marketType asset question strike tradingStart expiry
      status: clobStatus intervalSec tradeCount lastTradeAt operatorId venueId context oracleQuestionId creator createdByTx
      quoteDecimals yesTokenId noTokenId
      winningOutcome payoutNumerators payoutDenominator voided finalized resolvedAtTimestamp lastPrice
    }
  }`, { id: marketId.toLowerCase() });
  return data.Market_by_pk as Record<string, unknown> | null;
}
