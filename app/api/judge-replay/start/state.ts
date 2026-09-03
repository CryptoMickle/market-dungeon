export type ReplayCandidateData = {
  marketId?: unknown;
  winningOutcome?: unknown;
  marketType?: unknown;
  asset?: unknown;
  intervalSec?: unknown;
  question?: unknown;
  tradingStart?: unknown;
  expiry?: unknown;
  status?: unknown;
  tradeCount?: unknown;
  lastTradeAt?: unknown;
  operatorId?: unknown;
  venueId?: unknown;
  context?: unknown;
  oracleQuestionId?: unknown;
  creator?: unknown;
  createdByTx?: unknown;
};

export type CandidateData = {
  fiveMinute?: ReplayCandidateData[];
  fifteenMinute?: ReplayCandidateData[];
};

const CANDIDATE_CACHE_MS = 15_000;

let candidateCache: { data: CandidateData; expiresAt: number } | undefined;
let candidateInflight: Promise<CandidateData> | undefined;

export async function replayCandidates(load: () => Promise<CandidateData>) {
  const now = Date.now();
  if (candidateCache && candidateCache.expiresAt > now) {
    return { data: candidateCache.data, cacheState: 'hit' } as const;
  }
  if (candidateInflight) {
    return { data: await candidateInflight, cacheState: 'shared' } as const;
  }

  const request = load();
  candidateInflight = request;
  try {
    const data = await request;
    candidateCache = { data, expiresAt: Date.now() + CANDIDATE_CACHE_MS };
    return { data, cacheState: 'miss' } as const;
  } finally {
    if (candidateInflight === request) candidateInflight = undefined;
  }
}

export function resetReplayStartStateForTests() {
  candidateCache = undefined;
  candidateInflight = undefined;
}
