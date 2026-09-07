import { decodeFunctionResult, encodeFunctionData } from 'viem';
import type { ReplayMarketProvenance } from '../replay-proof.ts';

import {
  SOMNIA_MAINNET_PROFILE,
  type JudgeNetworkProfile,
} from '../judge-network.ts';
import {
  BINARY_SETTLEMENT_ABI,
  DREAMDEX_SETTLEMENT_CONTRACTS,
  MODULE_MARKETS_ABI,
  isTerminalSettlementMarket,
  type DirectOnchainSettlementProof,
} from '../onchain-settlement-proof.ts';

const INDEXER_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 5_000;
const MAX_READ_ATTEMPTS = 2;

export type IndexerReadBudget = { deadline: number; timeoutMs: number };

const OPENING_REFERENCE_QUESTION_ID = Symbol('openingReferenceQuestionId');
type MarketWithOpeningReference = Record<string, unknown> & {
  finalized?: unknown;
  voided?: unknown;
  [OPENING_REFERENCE_QUESTION_ID]?: string | null;
};

function indexerTiming(budget?: IndexerReadBudget) {
  if (!budget) return undefined;
  const remainingMs = Math.ceil(budget.deadline - performance.now());
  if (remainingMs <= 0) {
    throw new UpstreamReadError('Replay indexer read budget exhausted', { retryable: true });
  }
  return { timeoutMs: budget.timeoutMs, totalBudgetMs: remainingMs };
}

// Sourced from @somnia-chain/markets-sdk 0.29.0 mainnet-production manifests.
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
  totalBudgetMs?: number,
): Promise<T> {
  let lastError: UpstreamReadError | undefined;
  let lastStatus: number | undefined;
  const started = performance.now();
  const deadline = totalBudgetMs === undefined ? undefined : performance.now() + totalBudgetMs;
  function fail(error: UpstreamReadError, attempts: number): never {
    // Diagnose provider failures without logging queries, market IDs, seals,
    // request headers, response bodies, or potentially sensitive error text.
    console.warn('market_dungeon_upstream_read_failed', {
      source,
      attempts,
      elapsedMs: Math.round(performance.now() - started),
      status: lastStatus ?? null,
      timeout: error.cause instanceof Error && ['TimeoutError', 'AbortError'].includes(error.cause.name),
      retryable: error.retryable,
    });
    throw error;
  }

  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline === undefined ? timeoutMs : Math.ceil(deadline - performance.now());
    if (remainingMs <= 0) {
      fail(lastError ?? new UpstreamReadError(`${source} read budget exhausted`, { retryable: true }), attempt - 1);
    }
    lastStatus = undefined;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)),
      });
      lastStatus = response.status;
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
      if (!lastError.retryable || attempt === MAX_READ_ATTEMPTS) fail(lastError, attempt);
    }
  }

  throw lastError ?? new UpstreamReadError(`${source} read failed`, { retryable: true });
}

export async function graphql(
  query: string,
  variables: Record<string, unknown> = {},
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
  timing?: { timeoutMs: number; totalBudgetMs: number },
) {
  const payload = await postJsonRead<{ data?: Record<string, unknown>; errors?: unknown }>(
    'dreamDEX indexer',
    profile.indexer,
    { query, variables },
    timing?.timeoutMs ?? INDEXER_TIMEOUT_MS,
    timing?.totalBudgetMs,
  );
  if (payload.errors || !payload.data) {
    throw new UpstreamReadError('dreamDEX indexer rejected the query', { retryable: false });
  }
  return payload.data as Record<string, unknown>;
}

async function rpc<T>(method: string, params: unknown[], profile: JudgeNetworkProfile) {
  const payload = await postJsonRead<{ result?: T; error?: unknown }>(
    'Somnia RPC',
    profile.rpc,
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

export async function hydrateMarket(
  market: MarketWithOpeningReference,
  demoReplay = false,
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
  indexerBudget?: IndexerReadBudget,
) {
  let strikeRaw = String(market.strike ?? '0');
  if (BigInt(strikeRaw) === 0n) {
    let qid = market[OPENING_REFERENCE_QUESTION_ID] ?? undefined;
    if (!(OPENING_REFERENCE_QUESTION_ID in market)) {
      const refs = await graphql(`query OpeningRefs($ids: [String!]) {
        MarketReferenceLink(where: {market_id: {_in: $ids}}) { referenceQuestionId }
      }`, { ids: [String(market.marketId).toLowerCase()] }, profile, indexerTiming(indexerBudget));
      qid = (refs.MarketReferenceLink as Array<{ referenceQuestionId: string }>)?.[0]?.referenceQuestionId;
    }
    if (qid) {
      const answers = await graphql(`query OpeningAnswers($qids: [String!]) {
        OracleAnswer(where: {id: {_in: $qids}}) { numericValue }
      }`, { qids: [String(qid)] }, profile, indexerTiming(indexerBudget));
      strikeRaw = (answers.OracleAnswer as Array<{ numericValue: string }>)?.[0]?.numericValue ?? strikeRaw;
    }
  }

  const chainId = Number(BigInt(await rpc<string>('eth_chainId', [], profile)));
  if (chainId !== profile.chainId) throw new Error('Unexpected Somnia chain');
  const rawParams = await rpc<string>('eth_call', [{ to: market.poolAddress, data: '0x0765910c' }, 'latest'], profile);
  const [tickSize, minQuantity, lotSize] = words(rawParams);
  const onchainSettlement = isTerminalSettlementMarket(market)
    ? await verifyDirectSettlement(market, chainId, profile)
    : undefined;

  return {
    market: {
      ...market,
      winningOutcome: market.winningOutcome ?? null,
      strikeUsd: (Number(strikeRaw) / 100).toFixed(2),
      expiryIso: new Date(Number(market.expiry) * 1000).toISOString(),
      demoReplay,
    },
    network: profile.id === SOMNIA_MAINNET_PROFILE.id
      ? { name: profile.name, chainId }
      : { name: profile.name, chainId, profileId: profile.id },
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
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
): Promise<DirectOnchainSettlementProof> {
  return readAndVerifySettlement(market, verifiedChainId, profile, false);
}

// Only the authenticated replay path derives these fields from the fixed
// module contract. Ordinary indexed-market verification keeps strict equality.
async function readAndVerifySettlement(
  market: Record<string, unknown>,
  verifiedChainId: number | undefined,
  profile: JudgeNetworkProfile,
  deriveModuleBindings: boolean,
): Promise<DirectOnchainSettlementProof> {
  const marketId = String(market.marketId ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(marketId) || !isTerminalSettlementMarket(market)) throw new Error('Terminal market required');
  const chainId = verifiedChainId ?? Number(BigInt(await rpc<string>('eth_chainId', [], profile)));
  if (chainId !== profile.chainId) throw new Error('Unexpected Somnia chain');

  const blockTag = await rpc<string>('eth_blockNumber', [], profile);
  if (!/^0x[0-9a-f]+$/i.test(blockTag)) throw new Error('Invalid Somnia block tag');
  const block = await rpc<{ hash?: string; number?: string }>('eth_getBlockByNumber', [blockTag, false], profile);
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
    to: profile.contracts.binaryModule,
    data: moduleData,
  }, blockReference], profile);
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
  if (deriveModuleBindings) {
    market = { ...market, marketAddress, poolAddress, collateral: moduleCollateral,
      yesTokenId: yesId.toString(), noTokenId: noId.toString() };
  }
  if (moduleRecord[1] !== 2 || yesId === 0n || noId !== yesId + 1n
    || !sameAddress(market.marketAddress, marketAddress) || !sameAddress(market.poolAddress, poolAddress)
    || !sameAddress(market.collateral, moduleCollateral)
    || (profile.id !== SOMNIA_MAINNET_PROFILE.id && moduleCollateral.toLowerCase() !== profile.collateral.toLowerCase())
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
    to: profile.contracts.binarySettlement,
    data: settlementData,
  }, blockReference], profile);
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
    chainId: profile.chainId,
    blockNumber: BigInt(blockTag).toString(),
    blockHash,
    blockTag,
    marketId,
    marketAddress,
    poolAddress,
    moduleAddress: profile.contracts.binaryModule,
    settlementAddress: profile.contracts.binarySettlement,
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
        to: profile.contracts.binaryModule,
        blockTag,
        blockReference,
        data: moduleData,
        result: moduleResult,
      },
      settlementRecord: {
        to: profile.contracts.binarySettlement,
        blockTag,
        blockReference,
        data: settlementData,
        result: settlementResult,
      },
    },
  };
}

export async function hydrateSealedReplay(
  claims: ReplayMarketProvenance & { marketId: string; winningOutcome: 0 | 1 },
  profile: JudgeNetworkProfile,
) {
  // Metadata was authenticated at lock time; it is not a fresh indexer read
  // or proof of trades, market text or the creation transaction.
  const metadata = {
    marketId: claims.marketId, marketType: claims.marketType, asset: claims.asset,
    intervalSec: claims.intervalSec, question: claims.question,
    tradingStart: String(claims.tradingStart), expiry: String(claims.marketExpiry),
    status: claims.marketStatus, tradeCount: String(claims.tradeCount),
    lastTradeAt: String(claims.lastTradeAt), operatorId: String(claims.operatorId),
    venueId: claims.venueId, context: claims.marketContext,
    oracleQuestionId: claims.oracleQuestionId, creator: claims.creator,
    createdByTx: claims.createdByTx, winningOutcome: claims.winningOutcome,
    finalized: true, voided: false,
  };
  const proof = await readAndVerifySettlement(metadata, undefined, profile, true);
  return {
    market: {
      ...metadata,
      marketAddress: proof.marketAddress, poolAddress: proof.poolAddress,
      collateral: proof.collateralToken, yesTokenId: proof.yesId, noTokenId: proof.noId,
      winningOutcome: proof.winningOutcome, finalized: proof.finalized, voided: proof.voided,
      payoutNumerators: proof.payoutNumerators, payoutDenominator: proof.payoutDenominator,
      strikeUsd: 'UNAVAILABLE', openingPriceStatus: 'unavailable',
      metadataSource: 'SEALED_AT_START',
      expiryIso: new Date(claims.marketExpiry * 1_000).toISOString(), demoReplay: true,
    },
    network: profile.id === SOMNIA_MAINNET_PROFILE.id
      ? { name: profile.name, chainId: profile.chainId }
      : { name: profile.name, chainId: profile.chainId, profileId: profile.id },
    onchainSettlement: proof,
    safety: { mode: 'DRY_RUN', writesEnabled: false },
  };
}

export async function fetchFullMarket(
  marketId: string,
  profile: JudgeNetworkProfile = SOMNIA_MAINNET_PROFILE,
  indexerBudget?: IndexerReadBudget,
) {
  const normalizedId = marketId.toLowerCase();
  const data = await graphql(`query ReplaySettlement($id: String!, $ids: [String!]) {
    Market_by_pk(id: $id) {
      marketId marketAddress poolAddress collateral marketType asset question strike tradingStart expiry
      status: clobStatus intervalSec tradeCount lastTradeAt operatorId venueId context oracleQuestionId creator createdByTx
      quoteDecimals yesTokenId noTokenId
      winningOutcome payoutNumerators payoutDenominator voided finalized resolvedAtTimestamp lastPrice
    }
    MarketReferenceLink(where: {market_id: {_in: $ids}}) { referenceQuestionId }
  }`, { id: normalizedId, ids: [normalizedId] }, profile, indexerTiming(indexerBudget));
  const market = data.Market_by_pk as Record<string, unknown> | null;
  if (!market) return null;
  const replayMarket: MarketWithOpeningReference = { ...market };
  const referenceQuestionId = (data.MarketReferenceLink as Array<{ referenceQuestionId: string }>)?.[0]?.referenceQuestionId ?? null;
  Object.defineProperty(replayMarket, OPENING_REFERENCE_QUESTION_ID, { value: referenceQuestionId });
  return replayMarket;
}
