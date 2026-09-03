export type ReplayDirection = 'UP' | 'DOWN';

export const REPLAY_MARKET_QUESTION = 'BTC closes at or above its opening price';
export const MAX_REPLAY_MARKET_AGE_SECONDS = 7 * 24 * 60 * 60;

export type ReplayMarketProvenance = {
  marketType: 'BINARY';
  asset: 'BTC';
  intervalSec: 300 | 900;
  question: typeof REPLAY_MARKET_QUESTION;
  tradingStart: number;
  marketExpiry: number;
  marketStatus: 'Finalized';
  tradeCount: number;
  lastTradeAt: number;
  operatorId: number;
  venueId: string;
  marketContext: string;
  oracleQuestionId: string;
  creator: string;
  createdByTx: string;
};

export type ReplayCommitmentPayload = {
  marketId: string;
  committedOutcome: 0 | 1;
  lockedDirection: ReplayDirection;
  gameSeed: string;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
  salt: string;
} & ReplayMarketProvenance;

export type ReplayProof = ReplayCommitmentPayload & {
  verified: boolean;
  algorithm: 'SHA-256';
  commitment: string;
  canonical: string;
};

export type ReplayCombatProof = {
  verified: boolean;
  ruleset: 'market-dungeon/judge-combat/v1';
  transcriptDigest: string;
  steps: number;
  guardDefeated: boolean;
  bossDefeated: boolean;
  playerSurvived: boolean;
  finalHp: number;
};

export const REPLAY_COMMITMENT_DOMAIN = 'market-dungeon/judge-replay/v2';

const MARKET_ID = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/;
const UNSIGNED_DECIMAL = /^\d+$/;

export function replayMarketProvenanceFromMarket(market: Record<string, unknown>): ReplayMarketProvenance | null {
  const marketType = String(market.marketType ?? '');
  const asset = String(market.asset ?? '');
  const intervalSec = Number(market.intervalSec);
  const question = String(market.question ?? '');
  const tradingStart = Number(market.tradingStart);
  const marketExpiry = Number(market.marketExpiry ?? market.expiry);
  const marketStatus = String(market.marketStatus ?? market.status ?? market.clobStatus ?? '');
  const tradeCount = Number(market.tradeCount);
  const lastTradeAt = Number(market.lastTradeAt);
  const operatorId = Number(market.operatorId);
  const venueId = String(market.venueId ?? '').toLowerCase();
  const marketContext = String(market.marketContext ?? market.context ?? '').toLowerCase();
  const oracleQuestionId = String(market.oracleQuestionId ?? '');
  const creator = String(market.creator ?? '').toLowerCase();
  const createdByTx = String(market.createdByTx ?? '').toLowerCase();

  if (marketType !== 'BINARY' || asset !== 'BTC'
    || (intervalSec !== 300 && intervalSec !== 900)
    || question !== REPLAY_MARKET_QUESTION
    || !Number.isSafeInteger(tradingStart) || tradingStart <= 0
    || !Number.isSafeInteger(marketExpiry) || marketExpiry - tradingStart !== intervalSec
    || marketStatus !== 'Finalized'
    || !Number.isSafeInteger(tradeCount) || tradeCount <= 0
    || !Number.isSafeInteger(lastTradeAt) || lastTradeAt < tradingStart || lastTradeAt > marketExpiry
    || !Number.isSafeInteger(operatorId) || operatorId < 0
    || !MARKET_ID.test(venueId) || !HEX_BYTES.test(marketContext)
    || !UNSIGNED_DECIMAL.test(oracleQuestionId)
    || !ADDRESS.test(creator) || !MARKET_ID.test(createdByTx)) {
    return null;
  }

  return {
    marketType,
    asset,
    intervalSec,
    question,
    tradingStart,
    marketExpiry,
    marketStatus,
    tradeCount,
    lastTradeAt,
    operatorId,
    venueId,
    marketContext,
    oracleQuestionId,
    creator,
    createdByTx,
  };
}

export function replayMarketProvenanceMatches(
  proof: ReplayMarketProvenance,
  market: Record<string, unknown>,
) {
  const left = replayMarketProvenanceFromMarket(proof as unknown as Record<string, unknown>);
  const right = replayMarketProvenanceFromMarket(market);
  if (!left || !right) return false;
  return (Object.keys(left) as Array<keyof ReplayMarketProvenance>)
    .every((key) => left[key] === right[key]);
}

export function secondsUntilReplayReveal(revealAfter: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof revealAfter !== 'number' || !Number.isSafeInteger(revealAfter) || !Number.isFinite(nowSeconds)) return 0;
  return Math.max(0, revealAfter - Math.floor(nowSeconds));
}

export function canonicalReplayProof(proof: ReplayCommitmentPayload) {
  return [
    REPLAY_COMMITMENT_DOMAIN,
    `marketId=${proof.marketId.toLowerCase()}`,
    `marketType=${proof.marketType}`,
    `asset=${proof.asset}`,
    `intervalSec=${proof.intervalSec}`,
    `question=${proof.question}`,
    `tradingStart=${proof.tradingStart}`,
    `marketExpiry=${proof.marketExpiry}`,
    `marketStatus=${proof.marketStatus}`,
    `tradeCount=${proof.tradeCount}`,
    `lastTradeAt=${proof.lastTradeAt}`,
    `operatorId=${proof.operatorId}`,
    `venueId=${proof.venueId.toLowerCase()}`,
    `marketContext=${proof.marketContext.toLowerCase()}`,
    `oracleQuestionId=${proof.oracleQuestionId}`,
    `creator=${proof.creator.toLowerCase()}`,
    `createdByTx=${proof.createdByTx.toLowerCase()}`,
    `outcome=${proof.committedOutcome}`,
    `direction=${proof.lockedDirection}`,
    `gameSeed=${proof.gameSeed}`,
    `issuedAt=${proof.issuedAt}`,
    `revealAfter=${proof.revealAfter}`,
    `expiresAt=${proof.expiresAt}`,
    `salt=${proof.salt}`,
  ].join('\n');
}
