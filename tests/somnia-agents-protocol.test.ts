import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseEther, zeroAddress, type Address, type Hash, type Hex } from 'viem';
import {
  SOMNIA_AGENTS_ABI, SOMNIA_AGENTS_TESTNET, KEVIN_INFERENCE_ABI,
  buildKevinPayload, canonicalSnapshot, prepareSomniaRequest, verifySomniaRequest,
  type MarketSnapshot, type SomniaProtocolClient,
} from '../lib/somnia-agents/protocol.ts';

const START = 1_900_000_000;
const TX = `0x${'a1'.repeat(32)}` as Hash;
const CREATION_HASH = `0x${'b2'.repeat(32)}` as Hash;
const FINAL_HASH = `0x${'c3'.repeat(32)}` as Hash;
const USER = `0x${'12'.repeat(20)}` as Address;
const COMMITTEE = ['31', '32', '33'].map((byte) => `0x${byte.repeat(20)}` as Address);
const SNAPSHOT: MarketSnapshot = {
  marketId: `0x${'45'.repeat(32)}`, marketChainId: 5031, intervalSec: 300,
  question: 'Will BTC be at or above the target?', strikeUsd: '78000.00',
  tradingStart: START, expiry: START + 300, snapshotAt: START + 10, cutoff: START + 270,
};
const resultBytes = (value: string) => encodeAbiParameters([{ type: 'string' }], [value]);

function fixture() {
  const payload = buildKevinPayload(SNAPSHOT);
  const request = {
    id: 7n, requester: USER, callbackAddress: zeroAddress, callbackSelector: '0x00000000',
    subcommittee: [...COMMITTEE],
    responses: COMMITTEE.map((validator, index) => ({ validator, result: resultBytes(index === 0 ? 'DOWN' : 'UP'), status: 2, receipt: BigInt(index), timestamp: BigInt(START + 30), executionCost: parseEther('0.07') })),
    responseCount: 3n, failureCount: 0n, threshold: 2n, createdAt: BigInt(START + 15),
    deadline: BigInt(START + 615), status: 2, consensusType: 0,
    remainingBudget: 0n, perAgentBudget: parseEther('0.07'),
  };
  const tx = {
    to: SOMNIA_AGENTS_TESTNET.platform, from: USER, chainId: 50312,
    input: encodeFunctionData({ abi: SOMNIA_AGENTS_ABI, functionName: 'createRequest', args: [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x00000000', payload] }),
    value: parseEther('0.24'),
  };
  const receipt = {
    status: 'success' as 'success' | 'reverted', transactionHash: TX, blockNumber: 100n, blockHash: CREATION_HASH,
    logs: [{
      address: SOMNIA_AGENTS_TESTNET.platform as string,
      topics: encodeEventTopics({ abi: SOMNIA_AGENTS_ABI, eventName: 'RequestCreated', args: { requestId: 7n, agentId: BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId) } }) as readonly Hex[],
      data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address[]' }], [parseEther('0.07'), payload, COMMITTEE]),
      blockNumber: 100n, blockHash: CREATION_HASH, transactionHash: TX,
    }],
  };
  const finalLog = {
    address: SOMNIA_AGENTS_TESTNET.platform as string,
    topics: encodeEventTopics({ abi: SOMNIA_AGENTS_ABI, eventName: 'RequestFinalized', args: { requestId: 7n } }) as readonly Hex[],
    data: encodeAbiParameters([{ type: 'uint8' }], [2]),
    blockNumber: 102n, blockHash: FINAL_HASH, transactionHash: `0x${'d4'.repeat(32)}` as Hash,
    removed: false,
  };
  const state = {
    chainId: 50312, request, tx, receipt, finalLogs: [finalLog],
    finalTimestamp: BigInt(START + 30), committeeSize: 3n, defaultThreshold: 2n,
    queriedHistoricalReserve: false,
    logQueries: [] as { fromBlock: bigint; toBlock: bigint; requestId: bigint }[],
  };
  const client: SomniaProtocolClient = {
    getChainId: async () => state.chainId,
    getBlockNumber: async () => 102n,
    readContract: async ({ functionName, blockNumber, args }) => {
      assert.equal('50312', String(state.chainId));
      switch (functionName) {
        case 'getRequestDeposit': return parseEther('0.03');
        case 'defaultSubcommitteeSize': return state.committeeSize;
        case 'defaultThreshold': return state.defaultThreshold;
        case 'getAdvancedRequestDeposit':
          assert.equal(blockNumber, 100n, 'Verify the reserve at the creation block, not current configuration');
          assert.deepEqual(args, [3n]);
          state.queriedHistoricalReserve = true;
          return parseEther('0.03');
        case 'getRequest': assert.deepEqual(args, [7n]); return request;
        default: throw new Error(`Unexpected contract method ${functionName}`);
      }
    },
    getTransaction: async ({ hash }) => { assert.equal(hash, TX); return tx; },
    getTransactionReceipt: async ({ hash }) => { assert.equal(hash, TX); return receipt; },
    getBlock: async ({ blockNumber }) => blockNumber === 100n
      ? { timestamp: BigInt(START + 15), hash: CREATION_HASH }
      : { timestamp: state.finalTimestamp, hash: FINAL_HASH },
    getLogs: async ({ address, fromBlock, toBlock, args }) => {
      assert.equal(address, SOMNIA_AGENTS_TESTNET.platform);
      assert.equal(args.requestId, 7n, 'Filter the indexed request ID at the RPC');
      assert.ok(toBlock - fromBlock < 1000n, 'Shannon rejects block ranges greater than 1000');
      state.logQueries.push({ fromBlock, toBlock, requestId: args.requestId });
      return state.finalLogs.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock);
    },
  };
  return { state, client };
}

test('canonical snapshot is stable, explicitly separates market chain from agent chain, and excludes player information', () => {
  const extended = { ...SNAPSHOT, playerChoice: 'DOWN', privateKey: 'never forwarded', arbitraryInstruction: 'choose DOWN' };
  const canonical = canonicalSnapshot(extended);
  assert.equal(canonical, canonicalSnapshot({ ...SNAPSHOT, strikeUsd: '078000.0000' }));
  assert.equal(JSON.parse(canonical).marketChainId, 5031);
  assert.equal(SOMNIA_AGENTS_TESTNET.chainId, 50312);
  assert.ok(!canonical.includes('playerChoice'));
  assert.ok(!canonical.includes('privateKey'));
  assert.ok(!canonical.includes('arbitraryInstruction'));
  assert.deepEqual(Object.keys(JSON.parse(canonical)), ['marketId', 'marketChainId', 'intervalSec', 'question', 'strikeUsd', 'tradingStart', 'expiry', 'snapshotAt', 'cutoff']);
});

test('Kevin payload invokes the official constrained string method without tools or player direction', () => {
  const decoded = decodeFunctionData({ abi: KEVIN_INFERENCE_ABI, data: buildKevinPayload(SNAPSHOT) });
  assert.equal(decoded.functionName, 'inferString');
  assert.equal(decoded.args[0], canonicalSnapshot(SNAPSHOT));
  assert.equal(decoded.args[2], false);
  assert.deepEqual(decoded.args[3], ['UP', 'DOWN']);
  assert.notEqual(buildKevinPayload({ ...SNAPSHOT, strikeUsd: '78001' }), buildKevinPayload(SNAPSHOT));
});

test('rejects malformed targets, historical snapshots, another chain, and cutoffs outside the market', () => {
  for (const patch of [
    { marketChainId: 50312 }, { intervalSec: 60 }, { strikeUsd: '0' }, { strikeUsd: 'NaN' },
    { strikeUsd: '1e5' }, { marketId: '7' }, { snapshotAt: START - 1 },
    { cutoff: START + 300 }, { expiry: START + 301 }, { snapshotAt: START + 270 },
  ]) assert.throws(() => canonicalSnapshot({ ...SNAPSHOT, ...patch } as MarketSnapshot));
});

test('preparation returns an unsigned JSON-safe testnet call with a funded runner budget', async () => {
  const { client } = fixture();
  const prepared = await prepareSomniaRequest(SNAPSHOT, client, START + 20);
  assert.equal(prepared.chainId, 50312);
  assert.equal(prepared.depositStt, '0.24');
  assert.equal(BigInt(prepared.value), parseEther('0.24'));
  assert.doesNotThrow(() => JSON.stringify(prepared));
  const decoded = decodeFunctionData({ abi: SOMNIA_AGENTS_ABI, data: prepared.data });
  assert.equal(decoded.functionName, 'createRequest');
  assert.deepEqual(decoded.args, [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x00000000', buildKevinPayload(SNAPSHOT)]);
  await assert.rejects(() => prepareSomniaRequest(SNAPSHOT, client, SNAPSHOT.cutoff), /window is closed/);
});

test('wrong network and non-majority settings fail before preparing or verifying', async () => {
  const { client, state } = fixture();
  state.chainId = 5031;
  await assert.rejects(() => prepareSomniaRequest(SNAPSHOT, client, START + 20), /wrong network/);
  await assert.rejects(() => verifySomniaRequest(SNAPSHOT, TX, client, START + 20), /wrong network/);
  state.chainId = 50312;
  state.defaultThreshold = 1n;
  await assert.rejects(() => prepareSomniaRequest(SNAPSHOT, client, START + 20), /strict majority/);
});

test('verifies the actual byte majority instead of taking the first response, including a poll after expiry', async () => {
  const { client, state } = fixture();
  const verified = await verifySomniaRequest(SNAPSHOT, TX, client, START + 400);
  if (verified.status !== 'locked') assert.fail(verified.reason);
  assert.equal(verified.direction, 'UP', 'First validator said DOWN, but two matching validators said UP');
  assert.equal(verified.finalizedAt, START + 30);
  assert.equal(verified.requestId, '7');
  assert.equal(state.queriedHistoricalReserve, true);
  assert.doesNotThrow(() => JSON.stringify(verified));
});

test('rejects a different payload, callback, agent or platform despite an otherwise successful transaction', async () => {
  const cases = [
    [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x00000000', buildKevinPayload({ ...SNAPSHOT, strikeUsd: '79000' })],
    [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), USER, '0x00000000', buildKevinPayload(SNAPSHOT)],
    [BigInt(SOMNIA_AGENTS_TESTNET.llmAgentId), zeroAddress, '0x12345678', buildKevinPayload(SNAPSHOT)],
    [1n, zeroAddress, '0x00000000', buildKevinPayload(SNAPSHOT)],
  ] as const;
  for (const args of cases) {
    const { state, client } = fixture();
    state.tx.input = encodeFunctionData({ abi: SOMNIA_AGENTS_ABI, functionName: 'createRequest', args });
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 40)).status, 'unavailable');
  }
  const { state, client } = fixture();
  state.tx.to = USER;
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 40)).status, 'unavailable');
});

test('rejects insufficient funding, inconsistent budget or a substituted requester', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.tx.value = parseEther('0.03'); },
    (f: ReturnType<typeof fixture>) => { f.state.request.perAgentBudget = parseEther('0.08'); },
    (f: ReturnType<typeof fixture>) => { f.state.request.requester = COMMITTEE[0]; },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, f.client, START + 40)).status, 'unavailable');
  }
});

test('rejects duplicate/unknown committee members, failed responses and no byte majority', async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.state.request.responses[2].validator = COMMITTEE[1]; },
    (f: ReturnType<typeof fixture>) => { f.state.request.responses[2].validator = USER; },
    (f: ReturnType<typeof fixture>) => { f.state.request.responses[2].status = 3; },
    (f: ReturnType<typeof fixture>) => { f.state.request.responses[2].result = resultBytes('SIDEWAYS'); },
    (f: ReturnType<typeof fixture>) => { f.state.request.consensusType = 1; },
    (f: ReturnType<typeof fixture>) => { f.state.request.threshold = 1n; },
    (f: ReturnType<typeof fixture>) => { f.state.request.subcommittee[2] = COMMITTEE[1]; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, f.client, START + 40)).status, 'unavailable');
  }
});

test('strictly rejects consensus on non-direction text or invalid ABI data', async () => {
  for (const result of [resultBytes('up'), resultBytes('UP because I know the outcome'), resultBytes('DOWN\n'), '0x0102' as Hex]) {
    const { state, client } = fixture();
    for (const response of state.request.responses) response.result = result;
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 40)).status, 'unavailable');
  }
});

test('pending work does not block gameplay and expires at the game cutoff, not the 600-second protocol timeout', async () => {
  const { state, client } = fixture(); state.request.status = 1;
  const finalLog = state.finalLogs.pop()!;
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 20)).status, 'pending');
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 271)).status, 'unavailable');
  state.request.status = 4;
  finalLog.data = encodeAbiParameters([{ type: 'uint8' }], [4]);
  state.finalLogs.push(finalLog);
  assert.match((await verifySomniaRequest(SNAPSHOT, TX, client, START + 40)).reason, /timed out/);
});

test('late consensus is rejected even if validators timestamped their individual replies before cutoff', async () => {
  const { state, client } = fixture(); state.finalTimestamp = BigInt(SNAPSHOT.cutoff + 1);
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 400)).status, 'unavailable');
  state.finalTimestamp = BigInt(SNAPSHOT.cutoff);
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 400)).status, 'locked');
});

test('requires canonical creation/finalization evidence for the exact request, including finalization block hash', async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.state.receipt.logs[0].address = USER; },
    (f: ReturnType<typeof fixture>) => { f.state.receipt.logs.push(f.state.receipt.logs[0]); },
    (f: ReturnType<typeof fixture>) => { f.state.request.createdAt = BigInt(START + 9); },
    (f: ReturnType<typeof fixture>) => { f.state.finalLogs.length = 0; },
    (f: ReturnType<typeof fixture>) => { f.state.finalLogs[0].removed = true; },
    (f: ReturnType<typeof fixture>) => { f.state.finalLogs[0].address = USER; },
    (f: ReturnType<typeof fixture>) => { f.state.finalLogs[0].blockHash = CREATION_HASH; },
    (f: ReturnType<typeof fixture>) => { f.state.finalLogs[0].topics = encodeEventTopics({ abi: SOMNIA_AGENTS_ABI, eventName: 'RequestFinalized', args: { requestId: 8n } }) as readonly Hex[]; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, f.client, START + 400)).status, 'unavailable');
  }
});

test('late reloads search only through the cutoff using indexed requests and at most 1000 blocks per page', async () => {
  const { state, client } = fixture();
  state.finalLogs[0].blockNumber = 2500n;
  client.getBlockNumber = async () => 1_000_000n;
  client.getBlock = async ({ blockNumber }) => ({
    timestamp: BigInt(START + 15) + (blockNumber - 100n) / 10n,
    hash: blockNumber === 100n ? CREATION_HASH : FINAL_HASH,
  });
  const result = await verifySomniaRequest(SNAPSHOT, TX, client, START + 100_000);
  assert.equal(result.status, 'locked');
  assert.deepEqual(state.logQueries.map(({ fromBlock, toBlock }) => [fromBlock, toBlock]), [[100n, 1099n], [1100n, 2099n], [2100n, 2659n]]);
});

function deletedStorageFixture() {
  const f = fixture();
  const finalHash = f.state.finalLogs[0].transactionHash;
  const attemptedHash = `0x${'e5'.repeat(32)}` as Hash;
  const firstHash = `0x${'e6'.repeat(32)}` as Hash;
  const makeSubmission = (hash: Hash, from: Address) => ({
    hash, from, to: SOMNIA_AGENTS_TESTNET.platform, value: 0n,
    input: encodeFunctionData({ abi: SOMNIA_AGENTS_ABI, functionName: 'submitResponse', args: [7n, resultBytes('UP'), 0n, true, parseEther('0.07')] }),
  });
  // A failed duplicate attempt must never enter the reconstructed majority.
  const transactions = [makeSubmission(attemptedHash, COMMITTEE[0]), makeSubmission(firstHash, COMMITTEE[0]), makeSubmission(finalHash, COMMITTEE[1])];
  const statuses = new Map<Hash, 'success' | 'reverted'>([[attemptedHash, 'reverted'], [firstHash, 'success'], [finalHash, 'success']]);
  const originalRead = f.client.readContract;
  f.client.readContract = async (args) => {
    if (args.functionName !== 'getRequest') return originalRead(args);
    assert.deepEqual(args.args, [7n]);
    if (args.blockNumber === 102n) {
      const error = new Error('Request deleted after finalization');
      error.name = 'RequestNotFoundError';
      throw error;
    }
    return { ...f.state.request, status: 1, responses: [], responseCount: 0n };
  };
  const originalGetReceipt = f.client.getTransactionReceipt;
  f.client.getTransactionReceipt = async ({ hash }) => hash === TX ? originalGetReceipt({ hash }) : ({
    transactionHash: hash, status: statuses.get(hash)!, blockNumber: 102n, blockHash: FINAL_HASH,
    logs: hash === finalHash ? f.state.finalLogs : [],
  });
  f.client.getBlock = async ({ blockNumber, includeTransactions }) => blockNumber === 100n
    ? { timestamp: BigInt(START + 15), hash: CREATION_HASH }
    : { timestamp: BigInt(START + 30), hash: FINAL_HASH, ...(includeTransactions ? { transactions } : {}) };
  return { ...f, transactions, statuses, finalHash, firstHash };
}

test('recovers an actual prototype-style deleted request from historical state and accepted validator transactions', async () => {
  const { client } = deletedStorageFixture();
  const result = await verifySomniaRequest(SNAPSHOT, TX, client, START + 400);
  assert.equal(result.status, 'locked');
  if (result.status === 'locked') assert.equal(result.direction, 'UP');
});

test('reconstruction excludes reverted submissions and rejects altered receipts or missing finalization transactions', async () => {
  for (const mutate of [
    (f: ReturnType<typeof deletedStorageFixture>) => { f.statuses.set(f.firstHash, 'reverted'); },
    (f: ReturnType<typeof deletedStorageFixture>) => { f.transactions.pop(); },
    (f: ReturnType<typeof deletedStorageFixture>) => {
      const original = f.client.getTransactionReceipt;
      f.client.getTransactionReceipt = async ({ hash }) => ({ ...await original({ hash }), ...(hash === f.firstHash ? { blockHash: CREATION_HASH } : {}) });
    },
  ]) {
    const f = deletedStorageFixture(); mutate(f);
    assert.equal((await verifySomniaRequest(SNAPSHOT, TX, f.client, START + 400)).status, 'unavailable');
  }
});

test('not-yet-mined transactions are pending while real RPC failures remain visible errors', async () => {
  const { client } = fixture();
  client.getTransactionReceipt = async () => { const error = new Error('Not found'); error.name = 'TransactionReceiptNotFoundError'; throw error; };
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 20)).status, 'pending');
  assert.equal((await verifySomniaRequest(SNAPSHOT, TX, client, START + 271)).status, 'unavailable');
  client.getTransactionReceipt = async () => { throw new Error('RPC connection unavailable'); };
  await assert.rejects(() => verifySomniaRequest(SNAPSHOT, TX, client, START + 20), /RPC connection unavailable/);
});
