import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionResult } from 'viem';
import { hydrateSealedReplay, verifyDirectSettlement } from '../app/api/dreamdex.ts';
import { newReplayClaims, openReplay, sealReplay } from '../app/api/judge-replay/crypto.ts';
import { POST as mainnetReveal } from '../app/api/judge-replay/reveal/route.ts';
import { POST as shannonReveal } from '../app/api/shannon/judge-replay/reveal/route.ts';
import { resetReplayRevealStateForTests } from '../app/api/judge-replay/reveal/state.ts';
import { resetShannonReplayRevealStateForTests } from '../app/api/shannon/judge-replay/reveal/state.ts';
import { resetRequestControlForTests } from '../app/api/request-control.ts';
import { validLiveJudgeActions } from './judge-live-actions.ts';
import { SOMNIA_MAINNET_PROFILE, SHANNON_TESTNET_PROFILE, type JudgeNetworkProfile } from '../app/judge-network.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI, directSettlementProofMatchesMarket } from '../app/onchain-settlement-proof.ts';
import { REPLAY_MARKET_QUESTION } from '../app/replay-proof.ts';

const originalFetch = globalThis.fetch;
const marketId = `0x${'ab'.repeat(32)}`;
const marketAddress = `0x${'34'.repeat(20)}` as const;
const pool = `0x${'56'.repeat(20)}` as const;
const creator = `0x${'78'.repeat(20)}` as const;
const blockHash = `0x${'90'.repeat(32)}`;
const nonce = 46n;
const yesId = (BigInt(pool) << 72n) | (nonce << 8n);
type Fault = 'none' | 'timeout' | 'chain' | 'block' | 'operator' | 'venue' | 'creator' | 'oracle' | 'expiry' | 'tokens' | 'winner' | 'void' | 'finalized' | 'pool' | 'collateral';

function claimsFor(profile: JudgeNetworkProfile) {
  const now = Math.floor(Date.now() / 1000);
  return newReplayClaims({
    marketId, winningOutcome: 0, direction: 'UP', issuedAt: now - 30,
    revealAfter: now - 15, expiresAt: now + 1_000,
    marketType: 'BINARY', asset: 'BTC', intervalSec: 300,
    question: REPLAY_MARKET_QUESTION, tradingStart: now - 360, marketExpiry: now - 60,
    marketStatus: 'Finalized', tradeCount: 2, lastTradeAt: now - 61,
    operatorId: profile.originOperatorId, venueId: profile.originVenueId,
    marketContext: '0x', oracleQuestionId: '51115', creator, createdByTx: `0x${'12'.repeat(32)}`,
  }, profile);
}

function stubRpc(profile: JudgeNetworkProfile, claims: ReturnType<typeof claimsFor>, fault: () => Fault) {
  const reads = { indexer: 0, rpc: 0 };
  globalThis.fetch = async (url, init) => {
    if (String(url) !== profile.rpc) {
      reads.indexer += 1;
      throw new Error('All indexer access is blocked after lock');
    }
    reads.rpc += 1;
    if (fault() === 'timeout') throw new DOMException('provider timeout', 'TimeoutError');
    const body = JSON.parse(String(init?.body));
    const result = (value: unknown) => Response.json({ jsonrpc: '2.0', id: 1, result: value });
    if (body.method === 'eth_chainId') return result(`0x${(fault() === 'chain' ? 1 : profile.chainId).toString(16)}`);
    if (body.method === 'eth_blockNumber') return result('0x10');
    if (body.method === 'eth_getBlockByNumber') return result({ number: fault() === 'block' ? '0x11' : '0x10', hash: blockHash });
    assert.equal(body.method, 'eth_call');
    assert.deepEqual(body.params[1], { blockHash, requireCanonical: true });
    const target = body.params[0].to.toLowerCase();
    if (target === profile.contracts.binaryModule.toLowerCase()) {
      assert.ok(body.params[0].data.toLowerCase().endsWith(marketId.slice(2)));
      return result(encodeFunctionResult({ abi: MODULE_MARKETS_ABI, functionName: 'markets', result: [
        BigInt(claims.oracleQuestionId) + (fault() === 'oracle' ? 1n : 0n), 2, 0,
        profile.collateral, claims.operatorId + (fault() === 'operator' ? 1 : 0),
        (fault() === 'venue' ? `0x${'ff'.repeat(32)}` : claims.venueId) as `0x${string}`,
        creator, fault() === 'creator' ? pool : creator, marketAddress, pool,
        yesId, yesId + (fault() === 'tokens' ? 2n : 1n),
        BigInt(claims.tradingStart), BigInt(claims.marketExpiry) + (fault() === 'expiry' ? 1n : 0n),
      ] }));
    }
    assert.equal(target, profile.contracts.binarySettlement.toLowerCase());
    assert.ok(body.params[0].data.endsWith((yesId >> 8n).toString(16).padStart(64, '0')));
    return result(encodeFunctionResult({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', result: [
      fault() === 'collateral' ? creator : profile.collateral, 1_000n,
      fault() !== 'finalized', fault() === 'void', 0n, creator,
      fault() === 'pool' ? creator : pool, nonce,
      fault() === 'winner' ? [0n, 10_000_000n] : fault() === 'void' ? [5_000_000n, 5_000_000n] : [10_000_000n, 0n],
    ] as never }));
  };
  return reads;
}

test.beforeEach(() => {
  process.env.JUDGE_REPLAY_SEAL_KEY = '55'.repeat(32);
  process.env.VERCEL_ENV = 'preview';
  resetRequestControlForTests();
  resetReplayRevealStateForTests();
  resetShannonReplayRevealStateForTests();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

for (const profile of [SOMNIA_MAINNET_PROFILE, SHANNON_TESTNET_PROFILE]) {
  test(`${profile.id}: existing seal completes with all indexer access blocked and price unavailable`, async () => {
    const claims = claimsFor(profile);
    const seal = sealReplay(claims);
    const reads = stubRpc(profile, claims, () => 'none');
    const result = await hydrateSealedReplay(openReplay(seal, profile), profile);
    assert.equal(reads.indexer, 0);
    assert.equal(reads.rpc, 5);
    assert.equal(result.market.strikeUsd, 'UNAVAILABLE');
    assert.equal(result.market.metadataSource, 'SEALED_AT_START');
    assert.equal(result.market.tradeCount, String(claims.tradeCount));
    assert.equal(directSettlementProofMatchesMarket(result.onchainSettlement, result.market, profile), true);
    assert.equal(result.onchainSettlement.winningOutcome, claims.winningOutcome);
    await assert.rejects(verifyDirectSettlement({ ...result.market, poolAddress: creator }, undefined, profile), /binding mismatch/);
  });

  test(`${profile.id}: RPC recovery reveals the same seal and completed combat`, async (t) => {
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    const claims = claimsFor(profile);
    const actions = validLiveJudgeActions(claims.gameSeed);
    const seal = sealReplay(claims);
    let fault: Fault = 'timeout';
    const reads = stubRpc(profile, claims, () => fault);
    const handler = profile.id === 'somnia-mainnet' ? mainnetReveal : shannonReveal;
    const request = () => new Request(`http://test${profile.apiPath}/reveal`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.48' },
      body: JSON.stringify({ seal, actions }) });
    const unavailable = await handler(request());
    assert.equal(unavailable.status, 503);
    const failure = await unavailable.json();
    assert.equal(failure.retryState, 'upstream_retry');
    now += (failure.retryAfter + 1) * 1_000;
    fault = 'none';
    const recovered = await handler(request());
    assert.equal(recovered.status, 200);
    const result = await recovered.json();
    assert.equal(result.combatProof.verified, true);
    assert.equal(result.replayProof.verified, true);
    assert.equal(result.onchainSettlement.verified, true);
    assert.equal(reads.indexer, 0);
  });

  test(`${profile.id}: conflicting contract data cannot replace authenticated claims`, async () => {
    const claims = claimsFor(profile);
    const faults: Fault[] = ['chain', 'block', 'operator', 'venue', 'creator', 'oracle', 'expiry', 'tokens', 'winner', 'void', 'finalized', 'pool', 'collateral'];
    for (const fault of faults) {
      const reads = stubRpc(profile, claims, () => fault);
      await assert.rejects(hydrateSealedReplay(claims, profile), (error: unknown) => error instanceof Error, fault);
      assert.equal(reads.indexer, 0);
    }
  });
}
