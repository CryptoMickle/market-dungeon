import { decodeFunctionResult, parseAbi } from 'viem';

export type DirectSettlementCall = {
  to: string;
  blockTag: string;
  blockReference: {
    blockHash: string;
    requireCanonical: true;
  };
  data: string;
  result: string;
};

// @somnia-chain/markets-sdk 0.29.0 mainnet-production deployments.
export const DREAMDEX_SETTLEMENT_CONTRACTS = {
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388',
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
} as const;

export const SOMNIA_MAINNET_RPC = 'https://api.infra.mainnet.somnia.network';

export const MODULE_MARKETS_ABI = parseAbi([
  'function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)',
]);

export const BINARY_SETTLEMENT_ABI = parseAbi([
  'function getSettlement(uint256 marketKey) view returns ((address collateralToken, uint128 backing, bool finalized, bool voided, uint256 settlementFeeBpsTimes1k, address feeRecipient, address pool, uint64 nonce, uint256[] payoutNumerators))',
]);

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
  oracleQuestionId: string;
  originOperatorId: string;
  originVenueId: string;
  creator: string;
  tradingStart: string;
  expiry: string;
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
  oracleQuestionId?: string;
  operatorId?: string | number;
  venueId?: string;
  creator?: string;
  tradingStart?: string | number;
  expiry?: string | number;
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

export function isTerminalSettlementMarket<T extends { finalized?: unknown; voided?: unknown }>(
  market: T | null | undefined,
): market is T {
  return market?.finalized === true || market?.voided === true;
}

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

function sameRawHex(left: unknown, right: string) {
  return typeof left === 'string' && ABI_WORDS.test(left) && left.toLowerCase() === right.toLowerCase();
}

function validBlockReference(value: unknown, expectedHash: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as { blockHash?: unknown; requireCanonical?: unknown };
  const keys = Object.keys(reference).sort();
  return keys.length === 2 && keys[0] === 'blockHash' && keys[1] === 'requireCanonical'
    && typeof reference.blockHash === 'string' && BYTES32.test(reference.blockHash)
    && reference.blockHash.toLowerCase() === expectedHash.toLowerCase()
    && reference.requireCanonical === true;
}

function rawCallResultsMatchProof(proof: DirectOnchainSettlementProof) {
  try {
    const moduleRecord = decodeFunctionResult({
      abi: MODULE_MARKETS_ABI,
      functionName: 'markets',
      data: proof.calls.moduleMarket.result as `0x${string}`,
    });
    const settlement = decodeFunctionResult({
      abi: BINARY_SETTLEMENT_ABI,
      functionName: 'getSettlement',
      data: proof.calls.settlementRecord.result as `0x${string}`,
    });
    const rawPayouts = [...settlement.payoutNumerators];

    return moduleRecord[1] === 2
      && moduleRecord[0].toString() === proof.oracleQuestionId
      && moduleRecord[3].toLowerCase() === proof.collateralToken.toLowerCase()
      && moduleRecord[4].toString() === proof.originOperatorId
      && moduleRecord[5].toLowerCase() === proof.originVenueId.toLowerCase()
      && moduleRecord[7].toLowerCase() === proof.creator.toLowerCase()
      && moduleRecord[8].toLowerCase() === proof.marketAddress.toLowerCase()
      && moduleRecord[9].toLowerCase() === proof.poolAddress.toLowerCase()
      && moduleRecord[10].toString() === proof.yesId
      && moduleRecord[11].toString() === proof.noId
      && moduleRecord[12].toString() === proof.tradingStart
      && moduleRecord[13].toString() === proof.expiry
      && settlement.collateralToken.toLowerCase() === proof.collateralToken.toLowerCase()
      && settlement.backing.toString() === proof.backing
      && settlement.finalized === proof.finalized
      && settlement.voided === proof.voided
      && settlement.settlementFeeBpsTimes1k.toString() === proof.settlementFeeBpsTimes1k
      && settlement.pool.toLowerCase() === proof.poolAddress.toLowerCase()
      && settlement.nonce.toString() === proof.nonce
      && rawPayouts.length === 2
      && rawPayouts[0]?.toString() === proof.payoutNumerators[0]
      && rawPayouts[1]?.toString() === proof.payoutNumerators[1];
  } catch {
    return false;
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
  if (![proof.marketAddress, proof.poolAddress, proof.moduleAddress, proof.settlementAddress, proof.collateralToken, proof.creator].every((value) => ADDRESS.test(value))) return false;
  if (!BYTES32.test(proof.originVenueId)) return false;
  if (proof.moduleAddress.toLowerCase() !== DREAMDEX_SETTLEMENT_CONTRACTS.binaryModule.toLowerCase()
    || proof.settlementAddress.toLowerCase() !== DREAMDEX_SETTLEMENT_CONTRACTS.binarySettlement.toLowerCase()) return false;
  if (!sameHex(market.marketAddress, proof.marketAddress) || !sameHex(market.poolAddress, proof.poolAddress) || !sameHex(market.collateral, proof.collateralToken)) return false;
  if ((market.oracleQuestionId != null && String(market.oracleQuestionId) !== proof.oracleQuestionId)
    || (market.operatorId != null && String(market.operatorId) !== proof.originOperatorId)
    || (market.venueId != null && !sameHex(market.venueId, proof.originVenueId))
    || (market.creator != null && !sameHex(market.creator, proof.creator))
    || (market.tradingStart != null && String(market.tradingStart) !== proof.tradingStart)
    || (market.expiry != null && String(market.expiry) !== proof.expiry)) return false;
  if (!BYTES32.test(proof.blockHash) || !HEX.test(proof.blockTag) || decimal(proof.blockNumber) === null) return false;
  if (BigInt(proof.blockTag) !== BigInt(proof.blockNumber)) return false;
  if (!proof.finalized || !isTerminalSettlementMarket(market) || proof.voided !== market.voided) return false;

  const payouts = proof.payoutNumerators.map(decimal);
  const yesId = decimal(proof.yesId);
  const noId = decimal(proof.noId);
  const marketKey = decimal(proof.marketKey);
  const nonce = decimal(proof.nonce);
  const backing = decimal(proof.backing);
  const fee = decimal(proof.settlementFeeBpsTimes1k);
  const oracleQuestionId = decimal(proof.oracleQuestionId);
  const operatorId = decimal(proof.originOperatorId);
  const tradingStart = decimal(proof.tradingStart);
  const expiry = decimal(proof.expiry);
  const indexedYesId = decimal(String(market.yesTokenId ?? ''));
  const indexedNoId = decimal(String(market.noTokenId ?? ''));
  if (payouts.some((value) => value === null) || yesId === null || noId === null || marketKey === null
    || nonce === null || backing === null || fee === null || oracleQuestionId === null || operatorId === null
    || tradingStart === null || expiry === null || expiry <= tradingStart
    || indexedYesId !== yesId || indexedNoId !== noId
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
  if (calls.some((call) => !validBlockReference(call.blockReference, proof.blockHash))) return false;
  if (proof.calls.moduleMarket.to.toLowerCase() !== proof.moduleAddress.toLowerCase()) return false;
  if (proof.calls.settlementRecord.to.toLowerCase() !== proof.settlementAddress.toLowerCase()) return false;
  if (proof.calls.moduleMarket.data.toLowerCase() !== `${MODULE_MARKETS_SELECTOR}${proof.marketId.slice(2)}`.toLowerCase()) return false;
  if (proof.calls.settlementRecord.data.toLowerCase() !== `${GET_SETTLEMENT_SELECTOR}${marketKey.toString(16).padStart(64, '0')}`.toLowerCase()) return false;
  return rawCallResultsMatchProof(proof);
}

export type SettlementProofRpc = (method: string, params: readonly unknown[]) => Promise<unknown>;

export type SettlementProofRpcOutcome = {
  status: 'PASS' | 'FAIL' | 'NOT PROVABLE';
  reason: string;
};

async function somniaMainnetRpc(method: string, params: readonly unknown[]) {
  const response = await fetch(SOMNIA_MAINNET_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json() as { result?: unknown; error?: unknown };
  if (!response.ok || payload.error || !Object.hasOwn(payload, 'result')) throw new Error('Somnia RPC verification failed');
  return payload.result;
}

export async function directSettlementProofRpcOutcome(
  proof: DirectOnchainSettlementProof | undefined,
  market: SettlementMarket,
  rpc: SettlementProofRpc = somniaMainnetRpc,
): Promise<SettlementProofRpcOutcome> {
  if (!proof || !directSettlementProofMatchesMarket(proof, market)) {
    return {
      status: 'FAIL',
      reason: 'The proof does not match the canonical market and settlement structure.',
    };
  }

  let chainId: unknown;
  try {
    chainId = await rpc('eth_chainId', []);
  } catch {
    return {
      status: 'NOT PROVABLE',
      reason: 'Somnia RPC was unavailable before its chain identity could be checked.',
    };
  }

  if (typeof chainId !== 'string' || !HEX.test(chainId) || Number(BigInt(chainId)) !== proof.chainId) {
    return {
      status: 'FAIL',
      reason: 'The responding RPC did not identify as the recorded Somnia chain.',
    };
  }

  let block: unknown;
  try {
    block = await rpc('eth_getBlockByHash', [proof.blockHash, false]);
  } catch {
    return {
      status: 'NOT PROVABLE',
      reason: 'Somnia RPC was unavailable while the recorded block was being fetched.',
    };
  }
  const rpcBlock = block as { number?: unknown; hash?: unknown } | null;
  const blockMatches = typeof rpcBlock?.number === 'string'
    && HEX.test(rpcBlock.number)
    && BigInt(rpcBlock.number) === BigInt(proof.blockTag)
    && typeof rpcBlock.hash === 'string'
    && BYTES32.test(rpcBlock.hash)
    && rpcBlock.hash.toLowerCase() === proof.blockHash.toLowerCase();
  if (!blockMatches) {
    return {
      status: 'FAIL',
      reason: 'Somnia did not return the recorded canonical block number and hash.',
    };
  }

  const [moduleCall, settlementCall] = await Promise.allSettled([
    rpc('eth_call', [{ to: proof.calls.moduleMarket.to, data: proof.calls.moduleMarket.data }, proof.calls.moduleMarket.blockReference]),
    rpc('eth_call', [{ to: proof.calls.settlementRecord.to, data: proof.calls.settlementRecord.data }, proof.calls.settlementRecord.blockReference]),
  ]);
  const moduleMismatch = moduleCall.status === 'fulfilled'
    && !sameRawHex(moduleCall.value, proof.calls.moduleMarket.result);
  const settlementMismatch = settlementCall.status === 'fulfilled'
    && !sameRawHex(settlementCall.value, proof.calls.settlementRecord.result);
  if (moduleMismatch || settlementMismatch) {
    return {
      status: 'FAIL',
      reason: 'Somnia returned contract data that does not match the recorded proof.',
    };
  }
  if (moduleCall.status === 'rejected' || settlementCall.status === 'rejected') {
    return {
      status: 'NOT PROVABLE',
      reason: 'Somnia RPC was unavailable while the recorded contract state was being fetched.',
    };
  }

  return {
    status: 'PASS',
    reason: 'Somnia returned the recorded canonical block and both exact contract results.',
  };
}

export async function directSettlementProofMatchesSomniaRpc(
  proof: DirectOnchainSettlementProof | undefined,
  market: SettlementMarket,
  rpc: SettlementProofRpc = somniaMainnetRpc,
) {
  return (await directSettlementProofRpcOutcome(proof, market, rpc)).status === 'PASS';
}
