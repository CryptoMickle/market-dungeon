import { createHash } from 'node:crypto';
import { encodeFunctionData, encodeFunctionResult } from 'viem';
import { attestLiveJudgeLock, liveJudgePublicKey, sealLiveJudgeLock } from '../../app/api/live-judge/crypto.ts';
import { canonicalJudgeActionLog, JUDGE_COMBAT_DOMAIN, replayJudgeCombat } from '../../app/judge-combat.ts';
import {
  LIVE_JUDGE, LIVE_LOCK_SCHEMA, LIVE_MARKET_STATUS_ABI, LIVE_ORACLE_QUESTION_ABI, LIVE_PROOF_SCHEMA, liveJudgeOracleStrike,
  type LiveJudgeCombatProof, type LiveJudgeLock, type LiveJudgeMarket, type LiveJudgeProof, type LiveJudgeSettledResponse,
} from '../../app/live-judge-proof.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI, type DirectOnchainSettlementProof, type DirectSettlementCall } from '../../app/onchain-settlement-proof.ts';
import { validLiveJudgeActions } from '../judge-live-actions.ts';

process.env.JUDGE_REPLAY_SEAL_KEY = '44'.repeat(32);
process.env.VERCEL_ENV = 'development';

export function liveJudgeFixture(options: { now?: number; direction?: 'UP' | 'DOWN'; outcome?: 0 | 1 | 'VOID'; gameSeed?: string; strikeRaw?: bigint } = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const outcome = options.outcome ?? 0;
  const gameSeed = options.gameSeed ?? 'g'.repeat(43);
  const strikeRaw = options.strikeRaw ?? 60_000n * 10n ** 18n;
  const strikeUsd = `${strikeRaw / (10n ** 18n)}.${((strikeRaw / (10n ** 16n)) % 100n).toString().padStart(2, '0')}`;
  const marketId = `0x${'12'.repeat(32)}`;
  const marketAddress = `0x${'34'.repeat(20)}`;
  const poolAddress = `0x${'56'.repeat(20)}`;
  const creator = `0x${'89'.repeat(20)}`;
  const pendingHash = `0x${'de'.repeat(32)}`;
  const finalHash = `0x${'cd'.repeat(32)}`;
  const yesId = (BigInt(poolAddress) << 72n) | (1n << 8n);
  const noId = yesId + 1n;
  const market: LiveJudgeMarket = {
    marketId, marketAddress, poolAddress, creator,
    asset: 'BTC', intervalSec: 60, strikeUsd, strikeExactUsd: liveJudgeOracleStrike(strikeRaw),
    question: `Pricefeed test: will BTC/USDC's price be at or above ${strikeUsd} at unix time ${now + 55}?`,
    tradingStart: now - 5, expiry: now + 55,
    chainId: LIVE_JUDGE.chainId, operatorId: LIVE_JUDGE.operatorId,
    venueId: LIVE_JUDGE.venueId, oracleAdapter: LIVE_JUDGE.oracleAdapter, collateral: LIVE_JUDGE.collateral,
    oracleQuestionId: '1', yesTokenId: yesId.toString(), noTokenId: noId.toString(),
  };
  const moduleResult = encodeFunctionResult({ abi: MODULE_MARKETS_ABI, functionName: 'markets', result: [
    1n, 2, 0, market.collateral, market.operatorId, market.venueId, market.oracleAdapter,
    creator, marketAddress, poolAddress, yesId, noId, BigInt(market.tradingStart), BigInt(market.expiry),
  ] as never });
  const settlementResult = (finalized: boolean) => encodeFunctionResult({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', result: [
    market.collateral, 0n, finalized, finalized && outcome === 'VOID', 0n, `0x${'ab'.repeat(20)}`, poolAddress, 1n,
    !finalized ? [] : outcome === 'VOID' ? [5_000_000n, 5_000_000n] : outcome === 0 ? [10_000_000n, 0n] : [0n, 10_000_000n],
  ] as never });
  const moduleData = encodeFunctionData({ abi: MODULE_MARKETS_ABI, functionName: 'markets', args: [marketId as `0x${string}`] });
  const settlementData = encodeFunctionData({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', args: [yesId >> 8n] });
  const pendingCall = (to: string, data: string, result: string): DirectSettlementCall => ({
    to, data, result, blockTag: '0x10', blockReference: { blockHash: pendingHash, requireCanonical: true },
  });
  const lock: LiveJudgeLock = {
    schema: LIVE_LOCK_SCHEMA, profileId: LIVE_JUDGE.profileId, chainId: LIVE_JUDGE.chainId,
    lockId: `0x${'aa'.repeat(32)}`, market, direction: options.direction ?? 'UP', gameSeed,
    issuedAt: now, expiresAt: market.expiry + LIVE_JUDGE.claimLifetimeSeconds,
    snapshot: {
      chainId: LIVE_JUDGE.chainId, blockNumber: '16', blockHash: pendingHash, blockTimestamp: now - 1,
      moduleMarket: pendingCall(LIVE_JUDGE.moduleAddress, moduleData, moduleResult),
      marketStatus: pendingCall(marketAddress, encodeFunctionData({ abi: LIVE_MARKET_STATUS_ABI, functionName: 'status' }), encodeFunctionResult({ abi: LIVE_MARKET_STATUS_ABI, functionName: 'status', result: 1 })),
      settlementRecord: pendingCall(LIVE_JUDGE.settlementAddress, settlementData, settlementResult(false)),
      oracleQuestion: pendingCall(LIVE_JUDGE.oracleAdapter,
        encodeFunctionData({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', args: [1n] }),
        encodeFunctionResult({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', result: ['BTC/USDC', strikeRaw, BigInt(market.expiry), true] })),
    },
  };
  const finalCall = (to: string, data: string, result: string): DirectSettlementCall => ({
    to, data, result, blockTag: '0x11', blockReference: { blockHash: finalHash, requireCanonical: true },
  });
  const onchainSettlement: DirectOnchainSettlementProof = {
    verified: true, source: 'SOMNIA_RPC_ETH_CALL', chainId: LIVE_JUDGE.chainId,
    blockNumber: '17', blockHash: finalHash, blockTag: '0x11', marketId, marketAddress, poolAddress,
    moduleAddress: LIVE_JUDGE.moduleAddress, settlementAddress: LIVE_JUDGE.settlementAddress,
    collateralToken: market.collateral, oracleQuestionId: market.oracleQuestionId,
    originOperatorId: String(market.operatorId), originVenueId: market.venueId,
    creator, tradingStart: String(market.tradingStart), expiry: String(market.expiry),
    yesId: yesId.toString(), noId: noId.toString(), marketKey: (yesId >> 8n).toString(), nonce: '1', backing: '0',
    finalized: true, voided: outcome === 'VOID', winningOutcome: outcome === 'VOID' ? null : outcome,
    payoutNumerators: outcome === 'VOID' ? ['5000000', '5000000'] : outcome === 0 ? ['10000000', '0'] : ['0', '10000000'],
    payoutDenominator: '10000000', settlementFeeBpsTimes1k: '0',
    calls: {
      moduleMarket: finalCall(LIVE_JUDGE.moduleAddress, moduleData, moduleResult),
      settlementRecord: finalCall(LIVE_JUDGE.settlementAddress, settlementData, settlementResult(true)),
    },
  };
  const actions = validLiveJudgeActions(gameSeed);
  const lockAttestation = attestLiveJudgeLock(lock);
  const combatProof: LiveJudgeCombatProof = {
    ...replayJudgeCombat(gameSeed, actions), ruleset: JUDGE_COMBAT_DOMAIN,
    transcriptDigest: `0x${createHash('sha256').update(canonicalJudgeActionLog(gameSeed, actions)).digest('hex')}`,
  };
  const result = outcome === 'VOID' ? 'VOID' : outcome === (lock.direction === 'UP' ? 0 : 1) ? 'BLESSED' : 'CURSED';
  const proof: LiveJudgeProof = { schema: LIVE_PROOF_SCHEMA, lock, lockAttestation, actions, combatProof, result, onchainSettlement };
  const settled: LiveJudgeSettledResponse = { state: 'settled', result, market, lockAttestation, combatProof, onchainSettlement, proof };
  const session = { seal: sealLiveJudgeLock(lock), gameSeed, lock, lockAttestation };
  const rpc = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    if (method === 'eth_chainId') return `0x${LIVE_JUDGE.chainId.toString(16)}`;
    if (method === 'eth_getBlockByHash') {
      if (params[0] === pendingHash) return { number: '0x10', hash: pendingHash, timestamp: `0x${(now - 1).toString(16)}` };
      if (params[0] === finalHash) return { number: '0x11', hash: finalHash, timestamp: `0x${(market.expiry + 1).toString(16)}` };
    }
    if (method === 'eth_call') {
      const query = params[0] as { to: string; data: string };
      const reference = params[1] as { blockHash: string; requireCanonical: boolean };
      const calls = reference.blockHash === pendingHash
        ? Object.values(lock.snapshot).filter((value): value is DirectSettlementCall => !!value && typeof value === 'object' && 'to' in value)
        : reference.blockHash === finalHash ? Object.values(onchainSettlement.calls) : [];
      const call = calls.find(call => call.to.toLowerCase() === query.to.toLowerCase() && call.data === query.data);
      if (call && reference.requireCanonical === true) return call.result;
    }
    throw new Error(`Unexpected live fixture RPC ${method}: ${JSON.stringify(params)}`);
  };
  return { now, market, session, actions, proof, settled, publicKey: liveJudgePublicKey(), rpc };
}
