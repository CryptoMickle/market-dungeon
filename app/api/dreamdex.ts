import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';

import {
  DREAMDEX_SETTLEMENT_CONTRACTS,
  type DirectOnchainSettlementProof,
} from '../onchain-settlement-proof.ts';

const INDEXER = 'https://prd.smk.somnia.host/v1/graphql';
const RPC = 'https://api.infra.mainnet.somnia.network';

// Sourced from @somnia-chain/markets-sdk 0.25.0 mainnet-production manifests.
export const DREAMDEX_MAINNET_CONTRACTS = DREAMDEX_SETTLEMENT_CONTRACTS;

export const MODULE_MARKETS_ABI = parseAbi([
  'function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)',
]);

export const BINARY_SETTLEMENT_ABI = parseAbi([
  'function getSettlement(uint256 marketKey) view returns ((address collateralToken, uint128 backing, bool finalized, bool voided, uint256 settlementFeeBpsTimes1k, address feeRecipient, address pool, uint64 nonce, uint256[] payoutNumerators))',
]);

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

async function rpc<T>(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json() as { result?: T; error?: unknown };
  if (!response.ok || payload.error || payload.result == null) throw new Error('Somnia RPC request failed');
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
  const onchainSettlement = market.finalized === true
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
  if (!/^0x[0-9a-f]{64}$/.test(marketId) || market.finalized !== true) throw new Error('Finalized market required');
  const chainId = verifiedChainId ?? Number(BigInt(await rpc<string>('eth_chainId', [])));
  if (chainId !== 5031) throw new Error('Unexpected Somnia chain');

  const blockTag = await rpc<string>('eth_blockNumber', []);
  if (!/^0x[0-9a-f]+$/i.test(blockTag)) throw new Error('Invalid Somnia block tag');
  const block = await rpc<{ hash?: string; number?: string }>('eth_getBlockByNumber', [blockTag, false]);
  if (!/^0x[0-9a-f]{64}$/i.test(String(block.hash)) || String(block.number).toLowerCase() !== blockTag.toLowerCase()) {
    throw new Error('Invalid Somnia block proof');
  }

  const moduleData = encodeFunctionData({
    abi: MODULE_MARKETS_ABI,
    functionName: 'markets',
    args: [marketId as `0x${string}`],
  });
  const moduleResult = await rpc<`0x${string}`>('eth_call', [{
    to: DREAMDEX_MAINNET_CONTRACTS.binaryModule,
    data: moduleData,
  }, blockTag]);
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
    || String(market.yesTokenId) !== yesId.toString() || String(market.noTokenId) !== noId.toString()) {
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
  }, blockTag]);
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
    blockHash: String(block.hash),
    blockTag,
    marketId,
    marketAddress,
    poolAddress,
    moduleAddress: DREAMDEX_MAINNET_CONTRACTS.binaryModule,
    settlementAddress: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
    collateralToken: settlement.collateralToken,
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
        data: moduleData,
        result: moduleResult,
      },
      settlementRecord: {
        to: DREAMDEX_MAINNET_CONTRACTS.binarySettlement,
        blockTag,
        data: settlementData,
        result: settlementResult,
      },
    },
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
