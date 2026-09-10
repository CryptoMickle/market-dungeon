import { decodeFunctionResult, encodeFunctionData } from 'viem';
import { graphql, verifyDirectSettlement } from '../dreamdex.ts';
import { SHANNON_TESTNET_PROFILE } from '../../judge-network.ts';
import { BINARY_SETTLEMENT_ABI, MODULE_MARKETS_ABI, type DirectSettlementCall } from '../../onchain-settlement-proof.ts';
import {
  LIVE_JUDGE, LIVE_MARKET_STATUS_ABI, LIVE_ORACLE_QUESTION_ABI, isLiveJudgeMarket, liveJudgeRpc, liveJudgeSettlementMatchesLock,
  liveJudgeSnapshotMatchesMarket, liveJudgeOracleStrike, type LiveJudgeLock, type LiveJudgeMarket,
} from '../../live-judge-proof.ts';

const FIELDS = `marketId marketType asset intervalSec question strike tradingStart expiry clobStatus finalized voided
  winningOutcome operatorId venueId collateral marketAddress poolAddress oracleQuestionId creator yesTokenId noTokenId
  payoutNumerators payoutDenominator`;

function integer(value: unknown) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid indexed number');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unsafe indexed number');
  return number;
}
function marketFromRow(row: Record<string, unknown>): LiveJudgeMarket {
  if (row.marketType !== 'BINARY' || integer(row.intervalSec) !== LIVE_JUDGE.intervalSec || Number(row.operatorId) !== LIVE_JUDGE.operatorId) throw new Error('Unexpected live market series');
  const strike = String(row.strike);
  if (!/^\d{1,14}$/.test(strike)) throw new Error('Invalid indexed price threshold');
  const rawStrike = BigInt(strike);
  const market = {
    marketId: String(row.marketId).toLowerCase(), asset: row.asset, intervalSec: LIVE_JUDGE.intervalSec,
    question: row.question, strikeUsd: `${rawStrike / 100n}.${(rawStrike % 100n).toString().padStart(2, '0')}`,
    // Replaced by the exact 18-decimal oracle threshold before returning an active market.
    strikeExactUsd: liveJudgeOracleStrike(rawStrike * (10n ** 16n)),
    tradingStart: integer(row.tradingStart), expiry: integer(row.expiry), chainId: LIVE_JUDGE.chainId,
    operatorId: LIVE_JUDGE.operatorId, venueId: String(row.venueId).toLowerCase(),
    // The adapter is independently checked in the block-pinned module call below.
    oracleAdapter: LIVE_JUDGE.oracleAdapter, collateral: String(row.collateral).toLowerCase(),
    marketAddress: String(row.marketAddress).toLowerCase(), poolAddress: String(row.poolAddress).toLowerCase(),
    oracleQuestionId: String(row.oracleQuestionId), creator: String(row.creator).toLowerCase(),
    yesTokenId: String(row.yesTokenId), noTokenId: String(row.noTokenId),
  };
  if (!isLiveJudgeMarket(market)) throw new Error('Indexed live market metadata is inconsistent');
  return market;
}

async function indexerRow(marketId: string) {
  const data = await graphql(`query LiveJudgeMarketById($id:String!) { Market_by_pk(id:$id) { ${FIELDS} } }`, { id: marketId }, SHANNON_TESTNET_PROFILE);
  const row = data.Market_by_pk;
  return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : null;
}

async function snapshotFor(market: LiveJudgeMarket) {
  const [chain, block] = await Promise.all([
    liveJudgeRpc('eth_chainId', []),
    liveJudgeRpc('eth_getBlockByNumber', ['latest', false]),
  ]);
  const head = block as { hash?: string; number?: string; timestamp?: string } | null;
  if (chain !== '0xc488' || !head || !/^0x[0-9a-f]{64}$/.test(String(head.hash))
    || !/^0x[0-9a-f]+$/.test(String(head.number)) || !/^0x[0-9a-f]+$/.test(String(head.timestamp))) throw new Error('Unexpected Shannon chain or head');
  const blockHash = head.hash!;
  const blockTag = head.number!;
  const reference = { blockHash, requireCanonical: true } as const;
  async function call(to: string, data: string): Promise<DirectSettlementCall> {
    const result = await liveJudgeRpc('eth_call', [{ to, data }, reference]);
    if (typeof result !== 'string' || !/^0x(?:[0-9a-f]{64})+$/.test(result)) throw new Error('Malformed Shannon contract response');
    return { to, data, result, blockTag, blockReference: reference };
  }
  const [moduleMarket, marketStatus, settlementRecord, oracleQuestion] = await Promise.all([
    call(LIVE_JUDGE.moduleAddress, encodeFunctionData({ abi: MODULE_MARKETS_ABI, functionName: 'markets', args: [market.marketId as `0x${string}`] })),
    call(market.marketAddress, encodeFunctionData({ abi: LIVE_MARKET_STATUS_ABI, functionName: 'status' })),
    call(LIVE_JUDGE.settlementAddress, encodeFunctionData({ abi: BINARY_SETTLEMENT_ABI, functionName: 'getSettlement', args: [BigInt(market.yesTokenId) >> 8n] })),
    call(LIVE_JUDGE.oracleAdapter, encodeFunctionData({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', args: [BigInt(market.oracleQuestionId)] })),
  ]);
  const snapshot = { chainId: LIVE_JUDGE.chainId, blockNumber: BigInt(blockTag).toString(), blockHash,
    blockTimestamp: Number(BigInt(head.timestamp!)), moduleMarket, marketStatus, settlementRecord, oracleQuestion };
  const oracle = decodeFunctionResult({ abi: LIVE_ORACLE_QUESTION_ABI, functionName: 'questions', data: oracleQuestion.result as `0x${string}` });
  const exactMarket = { ...market, strikeExactUsd: liveJudgeOracleStrike(oracle[1]) };
  if (!isLiveJudgeMarket(exactMarket) || !liveJudgeSnapshotMatchesMarket(snapshot, exactMarket)) throw new Error('Shannon did not confirm an active, unresolved live market');
  return { market: exactMarket, snapshot };
}

export async function readLiveJudgeMarket(input: { marketId?: string; asset?: 'BTC' | 'ETH'; now: number }) {
  let rows: Record<string, unknown>[];
  if (input.marketId) {
    const row = await indexerRow(input.marketId);
    rows = row ? [row] : [];
  } else {
    const data = await graphql(`query LiveJudgeCandidates($now:numeric!,$minExpiry:numeric!,$asset:String!) {
      Market(where:{marketType:{_eq:"BINARY"},asset:{_eq:$asset},intervalSec:{_eq:"60"},
        operatorId:{_eq:4},venueId:{_eq:"${LIVE_JUDGE.venueId}"},collateral:{_eq:"${LIVE_JUDGE.collateral}"},
        tradingStart:{_lte:$now},expiry:{_gte:$minExpiry},clobStatus:{_eq:"Trading"},finalized:{_eq:false},voided:{_eq:false}}
        order_by:{expiry:asc},limit:4) { ${FIELDS} }
    }`, { now: String(input.now), minExpiry: String(input.now + LIVE_JUDGE.minRemainingSeconds), asset: input.asset ?? 'BTC' }, SHANNON_TESTNET_PROFILE);
    rows = (data.Market ?? []) as Record<string, unknown>[];
  }
  for (const row of rows) {
    if (row.clobStatus !== 'Trading' || row.finalized !== false || row.voided !== false || row.winningOutcome !== null) continue;
    const market = marketFromRow(row);
    if (input.marketId && market.marketId !== input.marketId) throw new Error('The indexer changed the requested market');
    if (input.asset && market.asset !== input.asset) throw new Error('The indexer changed the requested asset');
    if (market.tradingStart > input.now || market.expiry - input.now < LIVE_JUDGE.minRemainingSeconds) continue;
    return snapshotFor(market);
  }
  return null;
}

export async function readLiveJudgeSettlement(lock: LiveJudgeLock) {
  const row = await indexerRow(lock.market.marketId);
  if (!row) throw new Error('The locked market is not available from the indexer');
  const market = marketFromRow(row);
  // The signed metadata remains the only requested market; never discover a substitute.
  if (Object.keys(market).some(key => key !== 'strikeExactUsd' && market[key as keyof LiveJudgeMarket] !== lock.market[key as keyof LiveJudgeMarket])) throw new Error('The indexed market changed after the choice was locked');
  if (row.finalized !== true) return null;
  const proof = await verifyDirectSettlement(row, undefined, SHANNON_TESTNET_PROFILE);
  if (!liveJudgeSettlementMatchesLock(proof, lock)) throw new Error('Final settlement does not match the live lock');
  const moduleRecord = decodeFunctionResult({ abi: MODULE_MARKETS_ABI, functionName: 'markets', data: proof.calls.moduleMarket.result as `0x${string}` });
  if (moduleRecord[6].toLowerCase() !== LIVE_JUDGE.oracleAdapter) throw new Error('Unexpected live oracle adapter');
  const block = await liveJudgeRpc('eth_getBlockByHash', [proof.blockHash, false]) as { timestamp?: string } | null;
  if (!block || Number(BigInt(block.timestamp ?? '-1')) < lock.market.expiry) throw new Error('Settlement block precedes the market expiry');
  return proof;
}
