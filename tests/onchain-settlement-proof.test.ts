import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DREAMDEX_SETTLEMENT_CONTRACTS,
  directSettlementProofMatchesMarket,
  directSettlementWinner,
  type DirectOnchainSettlementProof,
} from '../app/onchain-settlement-proof.ts';

const MARKET_ID = `0x${'12'.repeat(32)}`;
const MARKET = `0x${'34'.repeat(20)}`;
const POOL = `0x${'56'.repeat(20)}`;
const MODULE = DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule;
const SETTLEMENT = DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement;
const COLLATERAL = `0x${'bc'.repeat(20)}`;
const NONCE = 1n;
const YES_ID = (BigInt(POOL) << 72n) | (NONCE << 8n);
const MARKET_KEY = YES_ID >> 8n;

function proof(overrides: Partial<DirectOnchainSettlementProof> = {}): DirectOnchainSettlementProof {
  return {
    verified: true,
    source: 'SOMNIA_RPC_ETH_CALL',
    chainId: 5031,
    blockNumber: '16',
    blockHash: `0x${'de'.repeat(32)}`,
    blockTag: '0x10',
    marketId: MARKET_ID,
    marketAddress: MARKET,
    poolAddress: POOL,
    moduleAddress: MODULE,
    settlementAddress: SETTLEMENT,
    collateralToken: COLLATERAL,
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
        data: `0x7564912b${MARKET_ID.slice(2)}`,
        result: `0x${'00'.repeat(64)}`,
      },
      settlementRecord: {
        to: SETTLEMENT,
        blockTag: '0x10',
        data: `0x4c582380${MARKET_KEY.toString(16).padStart(64, '0')}`,
        result: `0x${'00'.repeat(64)}`,
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
      settlementRecord: { ...proof().calls.settlementRecord, to: MODULE },
    },
  }), market), false);
});

test('void settlement requires an even payout vector and no winner', () => {
  const voidProof = proof({
    voided: true,
    winningOutcome: null,
    payoutNumerators: ['5000000', '5000000'],
  });
  const voidMarket = {
    ...market,
    voided: true,
    winningOutcome: null,
    payoutNumerators: ['5000000', '5000000'],
  };

  assert.equal(directSettlementProofMatchesMarket(voidProof, voidMarket), true);
  assert.equal(directSettlementWinner(voidProof.payoutNumerators, true), null);
  assert.equal(directSettlementProofMatchesMarket({ ...voidProof, payoutNumerators: ['6000000', '4000000'] }, voidMarket), false);
});
