import { createPublicClient, http, parseAbi } from 'viem';
import {
  binaryModuleReadAbi,
  outcomeId,
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const INDEXER_URL = 'https://dev.smk.somnia.host/v1/graphql';
const RPC_URL = 'https://api.infra.testnet.somnia.network';
const EXPLORER_URL = 'https://shannon-explorer.somnia.network';
const MIN_HEADROOM_SECONDS = 90;
const CANONICAL_OPERATOR_ID = 2;
const CANONICAL_VENUE_ID = '0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c';

const poolReadAbi = parseAbi([
  'function getBinaryPoolParams() view returns ((address collateralToken,address market,address outcomeToken,uint256 yesId,uint256 noId,uint256 oneCollateral,uint256 setBacking,address feeRecipient,uint256 makerFeeBpsTimes1k,uint256 takerFeeBpsTimes1k,uint256 maxBuilderFeeBpsTimes1k,uint256 settlementFeeBpsTimes1k,address settlement,uint64 marketNonce,bool finalized))',
  'function getOrderBookParameters() view returns ((uint256 tickSize,uint256 minQuantity,uint256 lotSize))',
  'function getBookLevels(bool isBid,uint64 numLevels) view returns ((uint256 price,uint256 quantity)[])',
]);

const marketReadAbi = parseAbi([
  'function status() view returns (uint8)',
]);

function fail(message) {
  throw new Error(`Shannon discovery rejected: ${message}`);
}

function sameAddress(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.toLowerCase() === right.toLowerCase();
}

const exchange = new SomniaMarkets({
  indexerUrl: INDEXER_URL,
  chain: somniaShannon,
  addresses: SOMNIA_TESTNET_ADDRESSES,
});

const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(RPC_URL, { retryCount: 0, timeout: 8_000 }),
});

try {
  const now = Math.floor(Date.now() / 1_000);
  const markets = await exchange.client.listLiveBinaryMarkets({
    operatorId: CANONICAL_OPERATOR_ID,
    venueId: CANONICAL_VENUE_ID,
    asset: 'BTC',
    intervalSec: 300,
    limit: 50,
  });
  const books = await exchange.client.getBookTops(markets.map((market) => market.marketId));
  const candidates = markets
    .filter((market) => market.status === 'Trading')
    .filter((market) => market.operatorId === CANONICAL_OPERATOR_ID)
    .filter((market) => sameAddress(market.venueId, CANONICAL_VENUE_ID))
    .filter((market) => Number(market.expiry) > now + MIN_HEADROOM_SECONDS)
    .filter((market) => books[market.marketId]?.bestBid && books[market.marketId]?.bestAsk)
    .sort((left, right) => Number(BigInt(right.cumulativeQuoteVolume) - BigInt(left.cumulativeQuoteVolume)));
  const market = candidates[0];
  if (!market) fail('no active, two-sided canonical BTC 5m market has sufficient headroom');

  const block = await publicClient.getBlock();
  const atBlock = { blockNumber: block.number };
  const [chainId, moduleRecord, nonce, pool, bindings] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({
      address: SOMNIA_TESTNET_ADDRESSES.binaryModule,
      abi: binaryModuleReadAbi,
      functionName: 'markets',
      args: [market.marketId],
      ...atBlock,
    }),
    publicClient.readContract({
      address: SOMNIA_TESTNET_ADDRESSES.binaryModule,
      abi: binaryModuleReadAbi,
      functionName: 'marketNonce',
      args: [market.marketId],
      ...atBlock,
    }),
    exchange.client.getPool(market.poolAddress),
    exchange.client.getPoolBindings(market.poolAddress),
  ]);
  const boundPool = moduleRecord[9];
  const [marketStatus, poolParams, grid, bids, asks] = await Promise.all([
    publicClient.readContract({ address: moduleRecord[8], abi: marketReadAbi, functionName: 'status', ...atBlock }),
    publicClient.readContract({ address: boundPool, abi: poolReadAbi, functionName: 'getBinaryPoolParams', ...atBlock }),
    publicClient.readContract({ address: boundPool, abi: poolReadAbi, functionName: 'getOrderBookParameters', ...atBlock }),
    publicClient.readContract({ address: boundPool, abi: poolReadAbi, functionName: 'getBookLevels', args: [true, 5n], ...atBlock }),
    publicClient.readContract({ address: boundPool, abi: poolReadAbi, functionName: 'getBookLevels', args: [false, 5n], ...atBlock }),
  ]);
  const openBinding = bindings.find((binding) => binding.toBlock === null);
  const checks = {
    chainId: chainId === 50312,
    indexerOperator: market.operatorId === CANONICAL_OPERATOR_ID,
    indexerVenue: sameAddress(market.venueId, CANONICAL_VENUE_ID),
    moduleOperator: Number(moduleRecord[4]) === CANONICAL_OPERATOR_ID,
    moduleVenue: sameAddress(moduleRecord[5], CANONICAL_VENUE_ID),
    indexerMarketAddress: sameAddress(market.marketAddress, moduleRecord[8]),
    binaryOutcomeSlots: Number(moduleRecord[1]) === 2,
    indexerVoidPolicy: Number(market.voidPolicy) === Number(moduleRecord[2]),
    indexerOracleQuestion: market.oracleQuestionId != null
      && BigInt(market.oracleQuestionId) === moduleRecord[0],
    oracleAdapter: sameAddress(moduleRecord[6], SOMNIA_TESTNET_ADDRESSES.oracleHub),
    marketStatusTrading: Number(marketStatus) === 1,
    marketWasTradingAtBlock: moduleRecord[12] <= block.timestamp && block.timestamp < moduleRecord[13],
    indexerTradingStart: BigInt(market.tradingStart) === moduleRecord[12],
    indexerExpiry: BigInt(market.expiry) === moduleRecord[13],
    fiveMinuteCadence: moduleRecord[13] - moduleRecord[12] >= 270n
      && moduleRecord[13] - moduleRecord[12] <= 330n,
    indexerPool: sameAddress(market.poolAddress, boundPool),
    indexerCollateral: sameAddress(market.collateral, moduleRecord[3]),
    expectedCollateral: sameAddress(moduleRecord[3], SOMNIA_TESTNET_ADDRESSES.collateral),
    indexerYesId: BigInt(market.yesTokenId) === moduleRecord[10],
    indexerNoId: BigInt(market.noTokenId) === moduleRecord[11],
    indexerNonce: BigInt(market.nonce) === nonce,
    derivedYesId: outcomeId(boundPool, nonce, 0) === moduleRecord[10],
    derivedNoId: outcomeId(boundPool, nonce, 1) === moduleRecord[11],
    poolMarket: sameAddress(poolParams.market, moduleRecord[8]),
    poolCollateral: sameAddress(poolParams.collateralToken, moduleRecord[3]),
    poolYesId: poolParams.yesId === moduleRecord[10],
    poolNoId: poolParams.noId === moduleRecord[11],
    poolNonce: poolParams.marketNonce === nonce,
    poolNotFinalized: poolParams.finalized === false,
    indexerCurrentMarket: pool?.currentMarketId?.toLowerCase() === market.marketId.toLowerCase(),
    openBinding: openBinding?.marketId.toLowerCase() === market.marketId.toLowerCase()
      && BigInt(openBinding.nonce) === nonce,
    twoSidedBook: bids.length > 0 && asks.length > 0,
  };
  if (!Object.values(checks).every(Boolean)) fail('one or more binding checks failed');

  const output = {
    schema: 'market-dungeon-shannon-read-only-discovery/v1',
    safety: 'READ_ONLY; NO WALLET; NO SIGNATURE; NO TRANSACTION',
    observedAt: new Date().toISOString(),
    sources: { indexer: INDEXER_URL, rpc: RPC_URL, sdk: '@somnia-chain/markets-sdk@0.29.0' },
    block: { number: block.number, hash: block.hash, timestamp: block.timestamp },
    market: {
      marketId: market.marketId,
      originOperatorId: moduleRecord[4],
      originVenueId: moduleRecord[5],
      oracleQuestionId: moduleRecord[0],
      oracleAdapter: moduleRecord[6],
      outcomeSlotCount: moduleRecord[1],
      voidPolicy: moduleRecord[2],
      interval: market.interval,
      question: market.question,
      status: market.status,
      onchainStatus: marketStatus,
      tradeCount: market.tradeCount,
      cumulativeQuoteVolume: market.cumulativeQuoteVolume,
      marketAddress: moduleRecord[8],
      pool: boundPool,
      collateral: moduleRecord[3],
      outcomeToken: poolParams.outcomeToken,
      yesId: moduleRecord[10],
      noId: moduleRecord[11],
      nonce,
      tradingStart: moduleRecord[12],
      expiry: moduleRecord[13],
      oneCollateral: poolParams.oneCollateral,
      finalized: poolParams.finalized,
      grid,
      bids,
      asks,
    },
    checks,
    explorer: {
      block: `${EXPLORER_URL}/block/${block.number}`,
      market: `${EXPLORER_URL}/address/${moduleRecord[8]}`,
      pool: `${EXPLORER_URL}/address/${boundPool}`,
      collateral: `${EXPLORER_URL}/address/${moduleRecord[3]}`,
      module: `${EXPLORER_URL}/address/${SOMNIA_TESTNET_ADDRESSES.binaryModule}`,
    },
  };
  console.log(JSON.stringify(output, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
} finally {
  await exchange.close();
}
