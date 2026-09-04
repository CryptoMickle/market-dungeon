import {
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
} from 'viem';
import {
  binaryModuleReadAbi,
  binaryPoolWriteAbi,
  erc20WriteAbi,
  outcomeId,
  orderBookEventsAbi,
  SOMNIA_TESTNET_ADDRESSES,
} from '@somnia-chain/markets-sdk';

export const SHANNON_CHAIN_ID = 50312;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const CANONICAL_OPERATOR_ID = 2;
export const CANONICAL_VENUE_ID = '0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c';
export const SHANNON_BINARY_MODULE = SOMNIA_TESTNET_ADDRESSES.binaryModule;

const BUY_KIND = Object.freeze({ BUY_YES: 0, BUY_NO: 2 });
const ADDRESS = /^0x[0-9a-f]{40}$/i;
// SDK 0.29.0 does not root-export binaryPoolEventsAbi. This one-event fragment
// exactly mirrors its source ABI and the deployed Shannon event topic.
const binaryOrderPlacedEventsAbi = parseAbi([
  'event BinaryOrderPlaced(uint128 indexed orderId, uint8 kind)',
]);
const erc20AllowanceReadAbi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
]);
const binaryPoolProofReadAbi = parseAbi([
  'function getBinaryPoolParams() view returns ((address collateralToken,address market,address outcomeToken,uint256 yesId,uint256 noId,uint256 oneCollateral,uint256 setBacking,address feeRecipient,uint256 makerFeeBpsTimes1k,uint256 takerFeeBpsTimes1k,uint256 maxBuilderFeeBpsTimes1k,uint256 settlementFeeBpsTimes1k,address settlement,uint64 marketNonce,bool finalized))',
]);
const proofEventsAbi = [...orderBookEventsAbi, ...binaryOrderPlacedEventsAbi];

function requireProof(condition, message) {
  if (!condition) throw new Error(`Shannon proof rejected: ${message}`);
}

function asBigInt(value, label) {
  try {
    return BigInt(value);
  } catch {
    throw new TypeError(`${label} must be an integer`);
  }
}

function sameAddress(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && ADDRESS.test(left)
    && ADDRESS.test(right)
    && left.toLowerCase() === right.toLowerCase();
}

function sameHex(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.toLowerCase() === right.toLowerCase();
}

function verifyBlockTransactionPosition(block, transaction) {
  requireProof(Array.isArray(block.transactions), 'canonical block transaction list is required');
  const transactionIndex = Number(asBigInt(transaction.transactionIndex, 'transaction.transactionIndex'));
  requireProof(Number.isSafeInteger(transactionIndex) && transactionIndex >= 0, 'transaction index is invalid');
  const indexedTransaction = block.transactions[transactionIndex];
  requireProof(indexedTransaction !== undefined, 'transaction index is outside the canonical block');
  const indexedHash = typeof indexedTransaction === 'string'
    ? indexedTransaction
    : indexedTransaction?.hash;
  requireProof(sameHex(indexedHash, transaction.hash), 'block transaction hash/index mismatch');
}

async function readContractAtCanonicalBlockHash({
  publicClient,
  address,
  abi,
  functionName,
  args = [],
  blockHash,
}) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await publicClient.request({
    method: 'eth_call',
    params: [{ to: address, data }, { blockHash, requireCanonical: true }],
  });
  requireProof(typeof result === 'string' && /^0x[0-9a-f]*$/i.test(result), `${functionName} returned malformed data`);
  return decodeFunctionResult({ abi, functionName, data: result });
}

/**
 * Maximum collateral the pool may pull for a buy at the user's YES-price limit.
 * The formula mirrors Markets SDK 0.29.0's binary escrow calculation.
 */
export function exactBuyAllowance({ side, yesPrice, quantity, oneCollateral }) {
  requireProof(side in BUY_KIND, 'only BUY_YES and BUY_NO are allowed');
  const one = asBigInt(oneCollateral, 'oneCollateral');
  const price = asBigInt(yesPrice, 'yesPrice');
  const size = asBigInt(quantity, 'quantity');
  requireProof(one > 0n, 'oneCollateral must be positive');
  requireProof(price > 0n && price < one, 'YES price must be strictly between zero and oneCollateral');
  requireProof(size > 0n, 'quantity must be positive');
  const sidePrice = side === 'BUY_YES' ? price : one - price;
  return (size * sidePrice + one - 1n) / one;
}

/** Build only the bounded ERC-20 approval. It never signs or sends. */
export function encodeExactApproval({ collateral, pool, amount }) {
  const exact = asBigInt(amount, 'amount');
  requireProof(exact > 0n, 'approval must be positive');
  return {
    to: collateral,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20WriteAbi,
      functionName: 'approve',
      args: [pool, exact],
    }),
  };
}

/** Decode and fail closed unless calldata is the exact intended buy-only IOC. */
export function verifyBuyIocCalldata(data, intent) {
  const decoded = decodeFunctionData({ abi: binaryPoolWriteAbi, data });
  requireProof(decoded.functionName === 'placeBinaryOrder', 'unexpected order function');
  const [kind, price, quantity, expiryNs, orderType, selfMatching, builder, builderFee, userData] = decoded.args;
  requireProof(BUY_KIND[intent.side] === Number(kind), 'order kind is not the intended buy side');
  requireProof(asBigInt(price, 'price') === asBigInt(intent.yesPrice, 'intent.yesPrice'), 'price changed');
  requireProof(asBigInt(quantity, 'quantity') === asBigInt(intent.quantity, 'intent.quantity'), 'quantity changed');
  requireProof(asBigInt(expiryNs, 'expiryNs') === asBigInt(intent.expireTimestampNs, 'intent.expireTimestampNs'), 'expiry changed');
  requireProof(Number(orderType) === 2, 'order is not ImmediateOrCancel');
  requireProof(Number(selfMatching) === 0, 'self-match policy is not CANCEL_TAKER');
  requireProof(sameAddress(builder, ZERO_ADDRESS), 'builder must be the zero address');
  requireProof(asBigInt(builderFee, 'builderFee') === 0n, 'builder fee must be zero');
  requireProof(asBigInt(userData, 'userData') === asBigInt(intent.userData ?? 0n, 'intent.userData'), 'userData changed');
  return { kind: Number(kind), price, quantity, expiryNs, orderType: Number(orderType) };
}

/**
 * Verify a mined approval transaction plus the required block-pinned allowance
 * re-read. Every market gate must still be repeated before the order signature.
 */
function verifyExactApprovalProof({ chainId, transaction, receipt, block, intent, postAllowance, poolParams }) {
  requireProof(chainId === SHANNON_CHAIN_ID, 'wrong chain');
  requireProof(receipt.status === 'success', 'approval receipt reverted');
  requireProof(sameHex(transaction.hash, receipt.transactionHash), 'approval hash mismatch');
  requireProof(sameHex(transaction.blockHash, receipt.blockHash), 'approval receipt block mismatch');
  requireProof(sameHex(receipt.blockHash, block.hash), 'approval block is not canonical');
  requireProof(asBigInt(transaction.blockNumber, 'transaction.blockNumber') === asBigInt(block.number, 'block.number'), 'approval block number mismatch');
  requireProof(asBigInt(receipt.blockNumber, 'receipt.blockNumber') === asBigInt(block.number, 'block.number'), 'approval receipt block number mismatch');
  requireProof(transaction.transactionIndex != null && receipt.transactionIndex != null, 'approval transaction index is missing');
  requireProof(asBigInt(transaction.transactionIndex, 'transaction.transactionIndex') === asBigInt(receipt.transactionIndex, 'receipt.transactionIndex'), 'approval transaction index mismatch');
  verifyBlockTransactionPosition(block, transaction);
  requireProof(sameAddress(transaction.from, intent.account), 'approval sender changed');
  requireProof(sameAddress(transaction.to, intent.collateral), 'approval target is not collateral');
  requireProof(asBigInt(transaction.value, 'transaction.value') === 0n, 'approval sends native value');
  requireProof(poolParams && typeof poolParams === 'object', 'pool parameters are required');
  requireProof(sameAddress(poolParams.collateralToken, intent.collateral), 'pool collateral does not match approval token');
  requireProof(sameAddress(poolParams.market, intent.market), 'pool market changed before approval');
  requireProof(poolParams.finalized === false, 'pool is finalized');
  requireProof(asBigInt(poolParams.oneCollateral, 'poolParams.oneCollateral') === asBigInt(intent.oneCollateral, 'intent.oneCollateral'), 'oneCollateral is not bound to the pool');

  const decoded = decodeFunctionData({ abi: erc20WriteAbi, data: transaction.input });
  requireProof(decoded.functionName === 'approve', 'unexpected approval function');
  const [spender, amount] = decoded.args;
  const recomputedAllowance = exactBuyAllowance({
    side: intent.side,
    yesPrice: intent.yesPrice,
    quantity: intent.quantity,
    oneCollateral: intent.oneCollateral,
  });
  requireProof(asBigInt(intent.exactAllowance, 'intent.exactAllowance') === recomputedAllowance, 'declared exact allowance does not match maximum loss');
  requireProof(sameAddress(spender, intent.pool), 'approval spender is not the bound pool');
  requireProof(asBigInt(amount, 'approval amount') === recomputedAllowance, 'approval is not exact');
  requireProof(postAllowance != null, 'post-receipt allowance is required');
  requireProof(asBigInt(postAllowance, 'postAllowance') === recomputedAllowance, 'post-receipt allowance is not exact');
  return { spender, amount, recomputedAllowance, postAllowance: asBigInt(postAllowance, 'postAllowance') };
}

/**
 * Re-fetch and verify an approval entirely from Shannon RPC. Allowance and pool
 * scale are EIP-1898 reads at the canonical approval-receipt block hash.
 */
export async function fetchAndVerifyExactApprovalProof({ publicClient, transactionHash, intent }) {
  requireProof(ADDRESS.test(intent.account), 'approval account is invalid');
  requireProof(ADDRESS.test(intent.collateral), 'approval collateral is invalid');
  requireProof(ADDRESS.test(intent.pool), 'approval pool is invalid');
  requireProof(ADDRESS.test(intent.market), 'approval market is invalid');
  const [chainId, transaction, receipt] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getTransaction({ hash: transactionHash }),
    publicClient.getTransactionReceipt({ hash: transactionHash }),
  ]);
  requireProof(receipt?.blockNumber != null && receipt?.blockHash, 'approval receipt block reference is missing');
  const block = await publicClient.getBlock({
    blockNumber: asBigInt(receipt.blockNumber, 'receipt.blockNumber'),
    includeTransactions: true,
  });
  requireProof(sameHex(block.hash, receipt.blockHash), 'approval receipt block is not canonical');
  const [postAllowance, poolParams] = await Promise.all([
    readContractAtCanonicalBlockHash({
      publicClient,
      address: intent.collateral,
      abi: erc20AllowanceReadAbi,
      functionName: 'allowance',
      args: [intent.account, intent.pool],
      blockHash: block.hash,
    }),
    readContractAtCanonicalBlockHash({
      publicClient,
      address: intent.pool,
      abi: binaryPoolProofReadAbi,
      functionName: 'getBinaryPoolParams',
      blockHash: block.hash,
    }),
  ]);
  const verified = verifyExactApprovalProof({
    chainId,
    transaction,
    receipt,
    block,
    intent,
    postAllowance,
    poolParams,
  });
  return { ...verified, block, poolParams };
}

/**
 * Fetch the module binding itself at the canonical receipt block. This prevents
 * a caller-supplied indexer row or latest-block binding from becoming proof.
 */
export async function readReceiptBlockBinding({ publicClient, marketId, receipt }) {
  requireProof(receipt?.blockNumber != null && receipt?.blockHash, 'receipt block reference is missing');
  const blockNumber = asBigInt(receipt.blockNumber, 'receipt.blockNumber');
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: true });
  requireProof(sameHex(block.hash, receipt.blockHash), 'receipt binding block is not canonical');
  const [moduleRecord, nonce] = await Promise.all([
    readContractAtCanonicalBlockHash({
      publicClient,
      address: SHANNON_BINARY_MODULE,
      abi: binaryModuleReadAbi,
      functionName: 'markets',
      args: [marketId],
      blockHash: block.hash,
    }),
    readContractAtCanonicalBlockHash({
      publicClient,
      address: SHANNON_BINARY_MODULE,
      abi: binaryModuleReadAbi,
      functionName: 'marketNonce',
      args: [marketId],
      blockHash: block.hash,
    }),
  ]);
  return {
    block,
    binding: {
      moduleAddress: SHANNON_BINARY_MODULE,
      blockNumber,
      blockHash: block.hash,
      marketId,
      oracleQuestionId: moduleRecord[0],
      outcomeSlotCount: moduleRecord[1],
      voidPolicy: moduleRecord[2],
      collateral: moduleRecord[3],
      originOperatorId: moduleRecord[4],
      originVenueId: moduleRecord[5],
      oracleAdapter: moduleRecord[6],
      market: moduleRecord[8],
      pool: moduleRecord[9],
      yesId: moduleRecord[10],
      noId: moduleRecord[11],
      tradingStart: moduleRecord[12],
      expiry: moduleRecord[13],
      nonce,
    },
  };
}

/** Fetch public Shannon state and run the pure verifier; never signs or sends. */
export async function fetchAndVerifyFilledBuyIocProof({ publicClient, transactionHash, intent }) {
  const [chainId, transaction, receipt] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getTransaction({ hash: transactionHash }),
    publicClient.getTransactionReceipt({ hash: transactionHash }),
  ]);
  const { block, binding } = await readReceiptBlockBinding({
    publicClient,
    marketId: intent.marketId,
    receipt,
  });
  const verified = verifyFilledBuyIocProof({ chainId, transaction, receipt, block, binding, intent });
  return { ...verified, block, binding };
}

/** Decode only order-book logs emitted by the expected pool. */
export function decodeExpectedPoolEvents(logs, expectedPool, receipt) {
  const decoded = [];
  const seenLogIndexes = new Set();
  for (const log of logs) {
    if (!sameAddress(log.address, expectedPool)) continue;
    requireProof(sameHex(log.transactionHash, receipt.transactionHash), 'pool log transaction hash mismatch');
    requireProof(sameHex(log.blockHash, receipt.blockHash), 'pool log block hash mismatch');
    requireProof(asBigInt(log.blockNumber, 'log.blockNumber') === asBigInt(receipt.blockNumber, 'receipt.blockNumber'), 'pool log block number mismatch');
    requireProof(log.transactionIndex != null, 'pool log transaction index is missing');
    requireProof(
      asBigInt(log.transactionIndex, 'log.transactionIndex') === asBigInt(receipt.transactionIndex, 'receipt.transactionIndex'),
      'pool log transaction index mismatch',
    );
    const logIndex = Number(asBigInt(log.logIndex, 'log.logIndex'));
    requireProof(Number.isSafeInteger(logIndex) && logIndex >= 0, 'pool log index is invalid');
    requireProof(!seenLogIndexes.has(logIndex), 'duplicate pool log index');
    seenLogIndexes.add(logIndex);
    try {
      const event = decodeEventLog({
        abi: proofEventsAbi,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      decoded.push({
        logIndex,
        transactionIndex: Number(log.transactionIndex),
        eventName: event.eventName,
        args: event.args,
      });
    } catch {
      // The pool emits non-order-book events too. Unknown topics are not proof.
    }
  }
  return decoded.sort((left, right) => left.logIndex - right.logIndex);
}

/**
 * Verify that a canonical Shannon receipt contains a real fill for the exact
 * intended order and the exact market binding at the receipt block.
 */
export function verifyFilledBuyIocProof({ chainId, transaction, receipt, block, binding, intent }) {
  requireProof(chainId === SHANNON_CHAIN_ID, 'wrong chain');
  requireProof(receipt.status === 'success', 'order receipt reverted');
  requireProof(sameHex(transaction.hash, receipt.transactionHash), 'transaction hash mismatch');
  requireProof(sameHex(transaction.blockHash, receipt.blockHash), 'transaction/receipt block mismatch');
  requireProof(sameHex(receipt.blockHash, block.hash), 'receipt block is not canonical');
  requireProof(asBigInt(transaction.blockNumber, 'transaction.blockNumber') === asBigInt(block.number, 'block.number'), 'transaction block number mismatch');
  requireProof(asBigInt(receipt.blockNumber, 'receipt.blockNumber') === asBigInt(block.number, 'block.number'), 'receipt block number mismatch');
  requireProof(transaction.transactionIndex != null && receipt.transactionIndex != null, 'transaction index is missing');
  requireProof(asBigInt(transaction.transactionIndex, 'transaction.transactionIndex') === asBigInt(receipt.transactionIndex, 'receipt.transactionIndex'), 'transaction index mismatch');
  verifyBlockTransactionPosition(block, transaction);
  requireProof(sameAddress(transaction.from, intent.account), 'order sender changed');
  requireProof(sameAddress(transaction.to, intent.pool), 'order target is not the bound pool');
  requireProof(asBigInt(transaction.value, 'transaction.value') === 0n, 'order sends native value');

  verifyBuyIocCalldata(transaction.input, intent);

  requireProof(sameHex(binding.marketId, intent.marketId), 'marketId changed');
  requireProof(sameAddress(binding.moduleAddress, SHANNON_BINARY_MODULE), 'unexpected BinaryMarketsModule');
  requireProof(asBigInt(binding.blockNumber, 'binding.blockNumber') === asBigInt(block.number, 'block.number'), 'binding block number mismatch');
  requireProof(sameHex(binding.blockHash, block.hash), 'binding block hash mismatch');
  requireProof(sameAddress(binding.market, intent.market), 'market contract changed');
  requireProof(sameAddress(binding.pool, intent.pool), 'module pool binding changed');
  requireProof(sameAddress(binding.collateral, intent.collateral), 'collateral binding changed');
  requireProof(Number(binding.outcomeSlotCount) === 2, 'market is not binary two-slot');
  requireProof(asBigInt(binding.oracleQuestionId, 'binding.oracleQuestionId') > 0n, 'oracle question id is missing');
  requireProof(sameAddress(binding.oracleAdapter, SOMNIA_TESTNET_ADDRESSES.oracleHub), 'unexpected oracle adapter');
  requireProof(Number(binding.originOperatorId) === CANONICAL_OPERATOR_ID, 'non-canonical origin operator');
  requireProof(sameHex(binding.originVenueId, CANONICAL_VENUE_ID), 'non-canonical origin venue');
  requireProof(asBigInt(binding.yesId, 'binding.yesId') === asBigInt(intent.yesId, 'intent.yesId'), 'YES outcome id changed');
  requireProof(asBigInt(binding.noId, 'binding.noId') === asBigInt(intent.noId, 'intent.noId'), 'NO outcome id changed');
  requireProof(asBigInt(binding.nonce, 'binding.nonce') === asBigInt(intent.nonce, 'intent.nonce'), 'pool nonce changed');
  requireProof(outcomeId(binding.pool, asBigInt(binding.nonce, 'binding.nonce'), 0) === asBigInt(binding.yesId, 'binding.yesId'), 'module YES id is not derived from pool and nonce');
  requireProof(outcomeId(binding.pool, asBigInt(binding.nonce, 'binding.nonce'), 1) === asBigInt(binding.noId, 'binding.noId'), 'module NO id is not derived from pool and nonce');
  requireProof(asBigInt(block.timestamp, 'block.timestamp') >= asBigInt(binding.tradingStart, 'binding.tradingStart'), 'fill predates trading');
  requireProof(asBigInt(block.timestamp, 'block.timestamp') < asBigInt(binding.expiry, 'binding.expiry'), 'fill is after market expiry');
  const orderExpiryNs = asBigInt(intent.expireTimestampNs, 'intent.expireTimestampNs');
  requireProof(orderExpiryNs > asBigInt(block.timestamp, 'block.timestamp') * 1_000_000_000n, 'order was already expired at inclusion');
  requireProof(orderExpiryNs <= asBigInt(binding.expiry, 'binding.expiry') * 1_000_000_000n, 'order expiry exceeds market expiry');

  const events = decodeExpectedPoolEvents(receipt.logs, intent.pool, receipt);
  const placed = events.find((event) => {
    if (event.eventName !== 'OrderPlaced') return false;
    const order = event.args.placedOrder;
    return asBigInt(event.args.orderId, 'OrderPlaced.orderId') === asBigInt(order.orderId, 'placedOrder.orderId')
      && sameAddress(order.owner, intent.account)
      && asBigInt(order.price, 'placed price') === asBigInt(intent.yesPrice, 'intent.yesPrice')
      && asBigInt(order.fullQuantity, 'placed quantity') === asBigInt(intent.quantity, 'intent.quantity')
      && asBigInt(order.expireTimestampNs, 'placed expiry') === asBigInt(intent.expireTimestampNs, 'intent.expireTimestampNs')
      && asBigInt(order.userData, 'placed userData') === asBigInt(intent.userData ?? 0n, 'intent.userData')
      && Boolean(order.isBid) === (intent.side === 'BUY_YES');
  });
  requireProof(placed, 'matching OrderPlaced event is absent');

  const orderId = asBigInt(placed.args.orderId, 'orderId');
  const binaryPlaced = events.filter((event) => event.eventName === 'BinaryOrderPlaced'
    && asBigInt(event.args.orderId, 'BinaryOrderPlaced.orderId') === orderId);
  requireProof(binaryPlaced.length === 1, 'exactly one matching BinaryOrderPlaced event is required');
  requireProof(Number(binaryPlaced[0].args.kind) === BUY_KIND[intent.side], 'BinaryOrderPlaced kind changed');
  const fills = events.filter((event) => event.eventName === 'OrderFilled'
    && asBigInt(event.args.takerOrderId, 'takerOrderId') === orderId);
  requireProof(fills.length > 0, 'zero-fill receipt');
  const totalFilled = fills.reduce((sum, event) => {
    const quantityFilled = asBigInt(event.args.quantityFilled, 'quantityFilled');
    const fillPrice = asBigInt(event.args.fillPrice, 'fillPrice');
    requireProof(quantityFilled > 0n, 'non-positive fill quantity');
    requireProof(
      intent.side === 'BUY_YES'
        ? fillPrice <= asBigInt(intent.yesPrice, 'intent.yesPrice')
        : fillPrice >= asBigInt(intent.yesPrice, 'intent.yesPrice'),
      'fill violated the price limit',
    );
    return sum + quantityFilled;
  }, 0n);
  requireProof(totalFilled <= asBigInt(intent.quantity, 'intent.quantity'), 'fills exceed requested quantity');
  requireProof(!events.some((event) => event.eventName === 'OrderRested'
    && asBigInt(event.args.orderId, 'rested orderId') === orderId), 'IOC order rested on the book');

  return { orderId, binaryPlaced: binaryPlaced[0], fills, totalFilled, events };
}
