import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { binaryModuleReadAbi, binaryPoolWriteAbi } from '@somnia-chain/markets-sdk';
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  parseAbi,
} from 'viem';

import {
  encodeExactApproval,
  exactBuyAllowance,
  fetchAndVerifyExactApprovalProof,
  readReceiptBlockBinding,
  SHANNON_BINARY_MODULE,
  verifyFilledBuyIocProof,
} from '../../scripts/shannon-spike/proof-kernel.mjs';

const allowanceReadAbi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
]);
const poolReadAbi = parseAbi([
  'function getBinaryPoolParams() view returns ((address collateralToken,address market,address outcomeToken,uint256 yesId,uint256 noId,uint256 oneCollateral,uint256 setBacking,address feeRecipient,uint256 makerFeeBpsTimes1k,uint256 takerFeeBpsTimes1k,uint256 maxBuilderFeeBpsTimes1k,uint256 settlementFeeBpsTimes1k,address settlement,uint64 marketNonce,bool finalized))',
]);

const evidence = JSON.parse(readFileSync(new URL(
  '../../scripts/shannon-spike/evidence/wb02-2026-09-04.json',
  import.meta.url,
), 'utf8'));
const fixture = evidence.publicIocFillFixture;
const intent = {
  account: fixture.transaction.from,
  marketId: fixture.binding.marketId,
  market: fixture.binding.market,
  pool: fixture.binding.pool,
  collateral: fixture.binding.collateral,
  yesId: fixture.binding.yesId,
  noId: fixture.binding.noId,
  nonce: fixture.binding.nonce,
  side: fixture.decodedIntent.side,
  yesPrice: fixture.decodedIntent.yesPrice,
  quantity: fixture.decodedIntent.quantity,
  expireTimestampNs: fixture.decodedIntent.expireTimestampNs,
  userData: fixture.decodedIntent.userData,
};

test('exact buy allowance rounds up and rejects every sell-shaped input', () => {
  assert.equal(exactBuyAllowance({ side: 'BUY_YES', yesPrice: 613_000n, quantity: 1_000_000n, oneCollateral: 1_000_000n }), 613_000n);
  assert.equal(exactBuyAllowance({ side: 'BUY_NO', yesPrice: 134_000n, quantity: 500_000_000n, oneCollateral: 1_000_000n }), 433_000_000n);
  assert.equal(exactBuyAllowance({ side: 'BUY_YES', yesPrice: 1n, quantity: 1n, oneCollateral: 1_000_000n }), 1n);
  assert.throws(() => exactBuyAllowance({ side: 'SELL_YES', yesPrice: 1n, quantity: 1n, oneCollateral: 1_000_000n }), /only BUY_YES and BUY_NO/);
  assert.throws(() => exactBuyAllowance({ side: 'BUY_YES', yesPrice: 1_000_000n, quantity: 1n, oneCollateral: 1_000_000n }), /strictly between/);
});

test('async approval proof fetches canonical allowance and pool scale instead of trusting scalars', async () => {
  const account = '0x1111111111111111111111111111111111111111';
  const collateral = fixture.binding.collateral;
  const pool = fixture.binding.pool;
  const exactAllowance = 20_000n;
  const approval = encodeExactApproval({ collateral, pool, amount: exactAllowance });
  const hash = `0x${'12'.repeat(32)}`;
  const blockHash = `0x${'34'.repeat(32)}`;
  const transaction = { hash, blockHash, blockNumber: 7n, transactionIndex: 1, from: account, to: collateral, value: 0n, input: approval.data };
  const receipt = { transactionHash: hash, blockHash, blockNumber: 7n, transactionIndex: 1, status: 'success' };
  const block = { hash: blockHash, number: 7n, transactions: [`0x${'56'.repeat(32)}`, hash] };
  const approvalIntent = {
    account,
    collateral,
    pool,
    market: fixture.binding.market,
    side: 'BUY_YES',
    yesPrice: 20_000n,
    quantity: 1_000_000n,
    oneCollateral: 1_000_000n,
    exactAllowance,
  };
  const poolParams = {
    collateralToken: collateral,
    market: fixture.binding.market,
    outcomeToken: '0x5555555555555555555555555555555555555555',
    yesId: 1n,
    noId: 2n,
    oneCollateral: 1_000_000n,
    setBacking: 1n,
    feeRecipient: '0x6666666666666666666666666666666666666666',
    makerFeeBpsTimes1k: 0n,
    takerFeeBpsTimes1k: 0n,
    maxBuilderFeeBpsTimes1k: 0n,
    settlementFeeBpsTimes1k: 0n,
    settlement: '0x7777777777777777777777777777777777777777',
    marketNonce: 1n,
    finalized: false,
  };
  const rpcReads = [];
  function client({ allowance = exactAllowance, params = poolParams, transactions = block.transactions, rejectEip1898 = false } = {}) {
    return {
      async getChainId() { return 50312; },
      async getTransaction() { return transaction; },
      async getTransactionReceipt() { return receipt; },
      async getBlock(options) {
        assert.equal(options.includeTransactions, true);
        assert.equal(options.blockNumber, 7n);
        if (transactions === null) {
          return { hash: block.hash, number: block.number };
        }
        return { ...block, transactions };
      },
      async request(request) {
        rpcReads.push(request);
        if (rejectEip1898) throw new Error('canonical EIP-1898 read refused');
        const [call, reference] = request.params;
        assert.deepEqual(reference, { blockHash, requireCanonical: true });
        if (call.to.toLowerCase() === collateral.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: allowanceReadAbi, data: call.data });
          assert.equal(decoded.functionName, 'allowance');
          assert.deepEqual(
            decoded.args.map((value) => value.toLowerCase()),
            [account, pool].map((value) => value.toLowerCase()),
          );
          return encodeFunctionResult({ abi: allowanceReadAbi, functionName: 'allowance', result: allowance });
        }
        assert.equal(call.to.toLowerCase(), pool.toLowerCase());
        assert.equal(decodeFunctionData({ abi: poolReadAbi, data: call.data }).functionName, 'getBinaryPoolParams');
        return encodeFunctionResult({ abi: poolReadAbi, functionName: 'getBinaryPoolParams', result: params });
      },
    };
  }
  const verified = await fetchAndVerifyExactApprovalProof({
    publicClient: client(),
    transactionHash: hash,
    intent: approvalIntent,
  });
  assert.equal(verified.amount, exactAllowance);
  assert.equal(verified.poolParams.oneCollateral, 1_000_000n);
  assert.equal(rpcReads.length, 2);

  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client({ allowance: exactAllowance + 1n }),
    transactionHash: hash,
    intent: approvalIntent,
  }), /post-receipt allowance is not exact/);
  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client({ params: { ...poolParams, oneCollateral: 10n } }),
    transactionHash: hash,
    intent: approvalIntent,
  }), /oneCollateral is not bound to the pool/);
  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client({ params: { ...poolParams, collateralToken: '0x8888888888888888888888888888888888888888' } }),
    transactionHash: hash,
    intent: approvalIntent,
  }), /pool collateral does not match approval token/);
  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client({ rejectEip1898: true }),
    transactionHash: hash,
    intent: approvalIntent,
  }), /canonical EIP-1898 read refused/);
  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client({ transactions: null }),
    transactionHash: hash,
    intent: approvalIntent,
  }), /canonical block transaction list is required/);
  await assert.rejects(() => fetchAndVerifyExactApprovalProof({
    publicClient: client(),
    transactionHash: hash,
    intent: { ...approvalIntent, exactAllowance: exactAllowance + 1n },
  }), /declared exact allowance does not match maximum loss/);
});

test('receipt-block binding is fetched from the canonical module at the receipt block', async () => {
  const calls = [];
  const moduleRecord = [
    1n, 2, 0, fixture.binding.collateral, fixture.binding.originOperatorId,
    fixture.binding.originVenueId, '0x3333333333333333333333333333333333333333',
    '0x4444444444444444444444444444444444444444', fixture.binding.market,
    fixture.binding.pool, BigInt(fixture.binding.yesId), BigInt(fixture.binding.noId),
    BigInt(fixture.binding.tradingStart), BigInt(fixture.binding.expiry),
  ];
  const publicClient = {
    async getBlock(options) {
      calls.push(['block', options]);
      return fixture.block;
    },
    async request(request) {
      calls.push(['request', request]);
      assert.equal(request.method, 'eth_call');
      assert.deepEqual(request.params[1], {
        blockHash: fixture.block.hash,
        requireCanonical: true,
      });
      const decoded = decodeFunctionData({ abi: binaryModuleReadAbi, data: request.params[0].data });
      const result = decoded.functionName === 'markets' ? moduleRecord : BigInt(fixture.binding.nonce);
      return encodeFunctionResult({ abi: binaryModuleReadAbi, functionName: decoded.functionName, result });
    },
  };
  const result = await readReceiptBlockBinding({
    publicClient,
    marketId: fixture.binding.marketId,
    receipt: fixture.receipt,
  });
  assert.equal(result.binding.moduleAddress, SHANNON_BINARY_MODULE);
  assert.equal(result.binding.blockHash, fixture.block.hash);
  assert.equal(result.binding.market, fixture.binding.market);
  assert.equal(result.binding.originVenueId, fixture.binding.originVenueId);
  assert.equal(calls[0][1].includeTransactions, true);
  assert.equal(calls.filter(([kind]) => kind === 'request').length, 2);

  await assert.rejects(() => readReceiptBlockBinding({
    publicClient: {
      ...publicClient,
      async getBlock() { return { ...fixture.block, hash: `0x${'99'.repeat(32)}` }; },
    },
    marketId: fixture.binding.marketId,
    receipt: fixture.receipt,
  }), /receipt binding block is not canonical/);
});

test('public Shannon transaction proves a canonical, same-market, non-zero buy-only IOC fill', () => {
  const result = verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: fixture.block,
    binding: fixture.binding,
    intent,
  });
  assert.equal(result.fills.length, fixture.expectedFill.count);
  assert.equal(result.totalFilled, BigInt(fixture.expectedFill.totalQuantity));
  assert.equal(Number(result.binaryPlaced.args.kind), 2);
});

test('fill proof rejects a competing venue, changed market contract, or lost transaction position', () => {
  const blockWithoutTransactions = { ...fixture.block };
  delete blockWithoutTransactions.transactions;
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: blockWithoutTransactions,
    binding: fixture.binding,
    intent,
  }), /canonical block transaction list is required/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: fixture.block,
    binding: { ...fixture.binding, originVenueId: `0x${'11'.repeat(32)}` },
    intent,
  }), /non-canonical origin venue/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: fixture.block,
    binding: { ...fixture.binding, market: '0x2222222222222222222222222222222222222222' },
    intent,
  }), /market contract changed/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, transactionIndex: fixture.receipt.transactionIndex + 1 },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /transaction index mismatch/);

  const changedLogIndex = fixture.receipt.logs.map((log, index) => index === 0
    ? { ...log, transactionIndex: log.transactionIndex + 1 }
    : log);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: changedLogIndex },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /pool log transaction index mismatch/);

  const wrongBlockPosition = [...fixture.block.transactions];
  wrongBlockPosition[fixture.transaction.transactionIndex] = `0x${'77'.repeat(32)}`;
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: { ...fixture.block, transactions: wrongBlockPosition },
    binding: fixture.binding,
    intent,
  }), /block transaction hash\/index mismatch/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: fixture.block,
    binding: { ...fixture.binding, blockHash: `0x${'88'.repeat(32)}` },
    intent,
  }), /binding block hash mismatch/);

  const changedLogBlock = fixture.receipt.logs.map((log, index) => index === 0
    ? { ...log, blockHash: `0x${'66'.repeat(32)}` }
    : log);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: changedLogBlock },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /pool log block hash mismatch/);

  const duplicateLogIndex = fixture.receipt.logs.map((log, index) => index === 1
    ? { ...log, logIndex: fixture.receipt.logs[0].logIndex }
    : log);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: duplicateLogIndex },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /duplicate pool log index/);
});

test('fill proof requires BinaryOrderPlaced to link the same order id and authoritative kind', () => {
  const withoutBinaryKind = fixture.receipt.logs.filter((log) => log.logIndex !== 5);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: withoutBinaryKind },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /exactly one matching BinaryOrderPlaced/);

  const wrongKind = fixture.receipt.logs.map((log) => log.logIndex === 5
    ? { ...log, data: `0x${'00'.repeat(32)}` }
    : log);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: wrongKind },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /BinaryOrderPlaced kind changed/);

  const wrongOrderId = fixture.receipt.logs.map((log) => log.logIndex === 5
    ? { ...log, topics: [log.topics[0], `0x${'00'.repeat(31)}01`] }
    : log);
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: wrongOrderId },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /exactly one matching BinaryOrderPlaced/);
});

test('fill proof rejects foreign-pool logs, zero fills, changed binding, and a builder fee', () => {
  const foreignLogs = fixture.receipt.logs.map((log) => ({
    ...log,
    address: '0x2222222222222222222222222222222222222222',
  }));
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: foreignLogs },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /matching OrderPlaced event is absent/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: { ...fixture.receipt, logs: [fixture.receipt.logs[0], fixture.receipt.logs.at(-1)] },
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /zero-fill receipt/);

  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: fixture.transaction,
    receipt: fixture.receipt,
    block: fixture.block,
    binding: { ...fixture.binding, nonce: '23' },
    intent,
  }), /pool nonce changed/);

  const changedInput = encodeFunctionData({
    abi: binaryPoolWriteAbi,
    functionName: 'placeBinaryOrder',
    args: [2, 134_000n, 500_000_000n, 1_788_526_254_000_000_000n, 2, 0,
      '0x0000000000000000000000000000000000000000', 1n, 0n],
  });
  assert.throws(() => verifyFilledBuyIocProof({
    chainId: fixture.chainId,
    transaction: { ...fixture.transaction, input: changedInput },
    receipt: fixture.receipt,
    block: fixture.block,
    binding: fixture.binding,
    intent,
  }), /builder fee must be zero/);
});
