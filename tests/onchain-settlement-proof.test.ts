import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';

import {
  BINARY_SETTLEMENT_ABI,
  DREAMDEX_SETTLEMENT_CONTRACTS,
  MODULE_MARKETS_ABI,
  directSettlementProofRpcOutcome,
  directSettlementProofMatchesMarket,
  directSettlementProofMatchesSomniaRpc,
  directSettlementWinner,
  type DirectOnchainSettlementProof,
  type SettlementProofRpc,
} from '../app/onchain-settlement-proof.ts';

const MARKET_ID = `0x${'12'.repeat(32)}`;
const MARKET = `0x${'34'.repeat(20)}`;
const POOL = `0x${'56'.repeat(20)}`;
const MODULE = DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule;
const SETTLEMENT = DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement;
const COLLATERAL = `0x${'bc'.repeat(20)}`;
const BLOCK_HASH = `0x${'de'.repeat(32)}`;
const ORACLE_QUESTION_ID = '1';
const ORIGIN_OPERATOR_ID = '0';
const ORIGIN_VENUE_ID = `0x${'00'.repeat(32)}`;
const CREATOR = `0x${'89'.repeat(20)}`;
const NONCE = 1n;
const YES_ID = (BigInt(POOL) << 72n) | (NONCE << 8n);
const MARKET_KEY = YES_ID >> 8n;

function moduleResult(input: { marketAddress?: string; poolAddress?: string; yesId?: bigint } = {}) {
  const yesId = input.yesId ?? YES_ID;
  return encodeFunctionResult({
    abi: MODULE_MARKETS_ABI,
    functionName: 'markets',
    result: [
      1n,
      2,
      0,
      COLLATERAL as `0x${string}`,
      0,
      ORIGIN_VENUE_ID as `0x${string}`,
      `0x${'67'.repeat(20)}` as `0x${string}`,
      CREATOR as `0x${string}`,
      (input.marketAddress ?? MARKET) as `0x${string}`,
      (input.poolAddress ?? POOL) as `0x${string}`,
      yesId,
      yesId + 1n,
      1n,
      2n,
    ],
  });
}

function settlementResult(input: {
  payoutNumerators?: readonly [bigint, bigint];
  voided?: boolean;
  blockBacking?: bigint;
} = {}) {
  return encodeFunctionResult({
    abi: BINARY_SETTLEMENT_ABI,
    functionName: 'getSettlement',
    result: [
      COLLATERAL,
      input.blockBacking ?? 0n,
      true,
      input.voided ?? false,
      0n,
      `0x${'ab'.repeat(20)}`,
      POOL,
      NONCE,
      [...(input.payoutNumerators ?? [10_000_000n, 0n])],
    ] as never,
  });
}

function proof(overrides: Partial<DirectOnchainSettlementProof> = {}): DirectOnchainSettlementProof {
  return {
    verified: true,
    source: 'SOMNIA_RPC_ETH_CALL',
    chainId: 5031,
    blockNumber: '16',
    blockHash: BLOCK_HASH,
    blockTag: '0x10',
    marketId: MARKET_ID,
    marketAddress: MARKET,
    poolAddress: POOL,
    moduleAddress: MODULE,
    settlementAddress: SETTLEMENT,
    collateralToken: COLLATERAL,
    oracleQuestionId: ORACLE_QUESTION_ID,
    originOperatorId: ORIGIN_OPERATOR_ID,
    originVenueId: ORIGIN_VENUE_ID,
    creator: CREATOR,
    tradingStart: '1',
    expiry: '2',
    yesId: YES_ID.toString(),
    noId: (YES_ID + 1n).toString(),
    marketKey: MARKET_KEY.toString(),
    nonce: NONCE.toString(),
    backing: '0',
    finalized: true,
    voided: false,
    winningOutcome: 0,
    payoutNumerators: ['10000000', '0'],
    payoutDenominator: '10000000',
    settlementFeeBpsTimes1k: '0',
    calls: {
      moduleMarket: {
        to: MODULE,
        blockTag: '0x10',
        blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
        data: `0x7564912b${MARKET_ID.slice(2)}`,
        result: moduleResult(),
      },
      settlementRecord: {
        to: SETTLEMENT,
        blockTag: '0x10',
        blockReference: { blockHash: BLOCK_HASH, requireCanonical: true },
        data: `0x4c582380${MARKET_KEY.toString(16).padStart(64, '0')}`,
        result: settlementResult(),
      },
    },
    ...overrides,
  };
}

const market = {
  marketId: MARKET_ID,
  marketAddress: MARKET,
  poolAddress: POOL,
  collateral: COLLATERAL,
  oracleQuestionId: ORACLE_QUESTION_ID,
  operatorId: ORIGIN_OPERATOR_ID,
  venueId: ORIGIN_VENUE_ID,
  creator: CREATOR,
  tradingStart: '1',
  expiry: '2',
  yesTokenId: YES_ID.toString(),
  noTokenId: (YES_ID + 1n).toString(),
  finalized: true,
  voided: false,
  winningOutcome: 0,
  payoutNumerators: ['10000000', '0'],
  payoutDenominator: '10000000',
};

test('direct settlement proof binds one RPC block, contracts, market, and payout vector', () => {
  assert.equal(directSettlementProofMatchesMarket(proof(), market), true);
  assert.equal(directSettlementWinner(['10000000', '0'], false), 0);
  assert.equal(directSettlementWinner(['0', '10000000'], false), 1);
});

test('direct settlement proof rejects winner, indexer, block, and call-target mismatches', () => {
  assert.equal(directSettlementProofMatchesMarket(proof({ winningOutcome: 1 }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof(), { ...market, payoutDenominator: '1' }), false);
  assert.equal(directSettlementProofMatchesMarket(proof({ blockNumber: '17' }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      moduleMarket: {
        ...proof().calls.moduleMarket,
        blockReference: { blockHash: `0x${'ff'.repeat(32)}`, requireCanonical: true },
      },
    },
  }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      moduleMarket: {
        ...proof().calls.moduleMarket,
        blockReference: {
          blockHash: BLOCK_HASH,
          requireCanonical: true,
          blockNumber: '0x10',
        } as never,
      },
    },
  }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      settlementRecord: { ...proof().calls.settlementRecord, to: MODULE },
    },
  }), market), false);
});

test('raw ABI results must decode to every exposed module and settlement field', () => {
  assert.equal(directSettlementProofMatchesMarket(proof({ originOperatorId: '1' }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({ originVenueId: `0x${'ff'.repeat(32)}` }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({ tradingStart: '0' }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      moduleMarket: { ...proof().calls.moduleMarket, result: `0x${'00'.repeat(64)}` },
    },
  }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      moduleMarket: { ...proof().calls.moduleMarket, result: moduleResult({ marketAddress: SETTLEMENT }) },
    },
  }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      settlementRecord: { ...proof().calls.settlementRecord, result: settlementResult({ blockBacking: 1n }) },
    },
  }), market), false);
  assert.equal(directSettlementProofMatchesMarket(proof({
    calls: {
      ...proof().calls,
      settlementRecord: {
        ...proof().calls.settlementRecord,
        result: settlementResult({ payoutNumerators: [0n, 10_000_000n] }),
      },
    },
  }), market), false);
});

test('void settlement requires an even payout vector and no winner', () => {
  const voidProof = proof({
    voided: true,
    winningOutcome: null,
    payoutNumerators: ['5000000', '5000000'],
    calls: {
      ...proof().calls,
      settlementRecord: {
        ...proof().calls.settlementRecord,
        result: settlementResult({ payoutNumerators: [5_000_000n, 5_000_000n], voided: true }),
      },
    },
  });
  const voidMarket = {
    ...market,
    finalized: false,
    voided: true,
    winningOutcome: null,
    payoutNumerators: ['5000000', '5000000'],
  };

  assert.equal(directSettlementProofMatchesMarket(voidProof, voidMarket), true);
  assert.equal(directSettlementWinner(voidProof.payoutNumerators, true), null);
  assert.equal(directSettlementProofMatchesMarket({ ...voidProof, payoutNumerators: ['6000000', '4000000'] }, voidMarket), false);
});

function matchingRpc(currentProof: DirectOnchainSettlementProof): SettlementProofRpc {
  return async (method, params) => {
    if (method === 'eth_chainId') return '0x13a7';
    if (method === 'eth_getBlockByHash') {
      assert.deepEqual(params, [currentProof.blockHash, false]);
      return { number: currentProof.blockTag, hash: currentProof.blockHash };
    }
    if (method === 'eth_call') {
      const call = params[0] as { to?: string };
      const expectedReference = call.to?.toLowerCase() === currentProof.moduleAddress.toLowerCase()
        ? currentProof.calls.moduleMarket.blockReference
        : currentProof.calls.settlementRecord.blockReference;
      assert.deepEqual(params[1], expectedReference);
      return call.to?.toLowerCase() === currentProof.moduleAddress.toLowerCase()
        ? currentProof.calls.moduleMarket.result
        : currentProof.calls.settlementRecord.result;
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  };
}

test('browser RPC verification re-fetches the exact block and both raw results', async () => {
  const validProof = proof();
  assert.equal(await directSettlementProofMatchesSomniaRpc(validProof, market, matchingRpc(validProof)), true);

  const wrongHashRpc: SettlementProofRpc = async (method, params) => {
    if (method === 'eth_getBlockByHash') {
      return { number: validProof.blockTag, hash: `0x${'ef'.repeat(32)}` };
    }
    return matchingRpc(validProof)(method, params);
  };
  assert.equal(await directSettlementProofMatchesSomniaRpc(validProof, market, wrongHashRpc), false);

  const mutatedModule = moduleResult({ yesId: YES_ID + 256n });
  const mutatedResultRpc: SettlementProofRpc = async (method, params) => {
    if (method === 'eth_call') {
      const call = params[0] as { to?: string };
      if (call.to?.toLowerCase() === validProof.moduleAddress.toLowerCase()) return mutatedModule;
    }
    return matchingRpc(validProof)(method, params);
  };
  assert.equal(await directSettlementProofMatchesSomniaRpc(validProof, market, mutatedResultRpc), false);
});

test('a returned contract contradiction remains FAIL even if the parallel RPC call is unavailable', async () => {
  const validProof = proof();
  const mutatedModule = moduleResult({ yesId: YES_ID + 256n });
  const mixedRpc: SettlementProofRpc = async (method, params) => {
    if (method !== 'eth_call') return matchingRpc(validProof)(method, params);
    const call = params[0] as { to?: string };
    if (call.to?.toLowerCase() === validProof.moduleAddress.toLowerCase()) return mutatedModule;
    throw new Error('settlement RPC unavailable');
  };

  const result = await directSettlementProofRpcOutcome(validProof, market, mixedRpc);
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /does not match/i);
});
