export type DirectSettlementCall = {
  to: string;
  blockTag: string;
  data: string;
  result: string;
};

// @somnia-chain/markets-sdk 0.25.0 mainnet-production deployments.
export const DREAMDEX_SETTLEMENT_CONTRACTS = {
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388',
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
} as const;

const MODULE_MARKETS_SELECTOR = '0x7564912b';
const GET_SETTLEMENT_SELECTOR = '0x4c582380';

export type DirectOnchainSettlementProof = {
  verified: true;
  source: 'SOMNIA_RPC_ETH_CALL';
  chainId: 5031;
  blockNumber: string;
  blockHash: string;
  blockTag: string;
  marketId: string;
  marketAddress: string;
  poolAddress: string;
  moduleAddress: string;
  settlementAddress: string;
  collateralToken: string;
  yesId: string;
  noId: string;
  marketKey: string;
  nonce: string;
  backing: string;
  finalized: true;
  voided: boolean;
  winningOutcome: 0 | 1 | null;
  payoutNumerators: [string, string];
  payoutDenominator: string;
  settlementFeeBpsTimes1k: string;
  calls: {
    moduleMarket: DirectSettlementCall;
    settlementRecord: DirectSettlementCall;
  };
};

type SettlementMarket = {
  marketId: string;
  marketAddress?: string;
  poolAddress?: string;
  collateral?: string;
  yesTokenId?: string;
  noTokenId?: string;
  finalized: boolean;
  voided: boolean;
  winningOutcome: number | null;
  payoutNumerators?: unknown;
  payoutDenominator?: unknown;
};

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x[0-9a-f]+$/i;
const ABI_WORDS = /^0x(?:[0-9a-f]{64})+$/i;

function sameHex(left: string | undefined, right: string) {
  return !left || left.toLowerCase() === right.toLowerCase();
}

function decimal(value: string) {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function directSettlementWinner(
  payoutNumerators: readonly string[],
  voided: boolean,
): 0 | 1 | null {
  if (payoutNumerators.length !== 2) return null;
  const yes = decimal(payoutNumerators[0]);
  const no = decimal(payoutNumerators[1]);
  if (yes === null || no === null || yes < 0n || no < 0n) return null;
  if (voided || yes === no) return null;
  return yes > no ? 0 : 1;
}

export function directSettlementProofMatchesMarket(
  proof: DirectOnchainSettlementProof | undefined,
  market: SettlementMarket,
) {
  if (!proof || proof.verified !== true || proof.source !== 'SOMNIA_RPC_ETH_CALL' || proof.chainId !== 5031) return false;
  if (!BYTES32.test(proof.marketId) || proof.marketId.toLowerCase() !== market.marketId.toLowerCase()) return false;
  if (![proof.marketAddress, proof.poolAddress, proof.moduleAddress, proof.settlementAddress, proof.collateralToken].every((value) => ADDRESS.test(value))) return false;
  if (proof.moduleAddress.toLowerCase() !== DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule.toLowerCase()
    || proof.settlementAddress.toLowerCase() !== DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement.toLowerCase()) return false;
  if (!sameHex(market.marketAddress, proof.marketAddress) || !sameHex(market.poolAddress, proof.poolAddress) || !sameHex(market.collateral, proof.collateralToken)) return false;
  if (!BYTES32.test(proof.blockHash) || !HEX.test(proof.blockTag) || decimal(proof.blockNumber) === null) return false;
  if (BigInt(proof.blockTag) !== BigInt(proof.blockNumber)) return false;
  if (!proof.finalized || !market.finalized || proof.voided !== market.voided) return false;

  const payouts = proof.payoutNumerators.map(decimal);
  const yesId = decimal(proof.yesId);
  const noId = decimal(proof.noId);
  const marketKey = decimal(proof.marketKey);
  const nonce = decimal(proof.nonce);
  const backing = decimal(proof.backing);
  const fee = decimal(proof.settlementFeeBpsTimes1k);
  const indexedYesId = decimal(String(market.yesTokenId ?? ''));
  const indexedNoId = decimal(String(market.noTokenId ?? ''));
  if (payouts.some((value) => value === null) || yesId === null || noId === null || marketKey === null
    || nonce === null || backing === null || fee === null || indexedYesId !== yesId || indexedNoId !== noId
    || noId !== yesId + 1n || marketKey !== yesId >> 8n) return false;
  const encodedPool = `0x${(yesId >> 72n).toString(16).padStart(40, '0')}`;
  const encodedNonce = (yesId >> 8n) & ((1n << 64n) - 1n);
  if (encodedPool.toLowerCase() !== proof.poolAddress.toLowerCase() || encodedNonce !== nonce) return false;
  const denominator = decimal(proof.payoutDenominator);
  if (denominator === null || payouts[0]! + payouts[1]! !== denominator) return false;
  const winner = directSettlementWinner(proof.payoutNumerators, proof.voided);
  if (proof.voided) {
    if (proof.winningOutcome !== null || payouts[0] !== payouts[1]) return false;
  } else if (winner === null || proof.winningOutcome !== winner || market.winningOutcome !== winner) {
    return false;
  }

  if (Array.isArray(market.payoutNumerators)) {
    const indexed = market.payoutNumerators.map(String);
    if (indexed.length !== 2 || indexed.some((value, index) => value !== proof.payoutNumerators[index])) return false;
  }
  if (market.payoutDenominator != null && String(market.payoutDenominator) !== proof.payoutDenominator) return false;

  const calls = [proof.calls.moduleMarket, proof.calls.settlementRecord];
  if (calls.some((call) => call.blockTag !== proof.blockTag || !ADDRESS.test(call.to) || !HEX.test(call.data) || !ABI_WORDS.test(call.result))) return false;
  if (proof.calls.moduleMarket.to.toLowerCase() !== proof.moduleAddress.toLowerCase()) return false;
  if (proof.calls.settlementRecord.to.toLowerCase() !== proof.settlementAddress.toLowerCase()) return false;
  if (proof.calls.moduleMarket.data.toLowerCase() !== `${MODULE_MARKETS_SELECTOR}${proof.marketId.slice(2)}`.toLowerCase()) return false;
  if (proof.calls.settlementRecord.data.toLowerCase() !== `${GET_SETTLEMENT_SELECTOR}${marketKey.toString(16).padStart(64, '0')}`.toLowerCase()) return false;
  return true;
}
