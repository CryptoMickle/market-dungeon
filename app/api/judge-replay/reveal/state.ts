export type RevealResult = {
  status: number;
  body: Record<string, unknown>;
  retryAfter?: number;
};

type RevealEntry = {
  digest: string;
  expiresAt: number;
  settled: boolean;
  promise: Promise<RevealResult>;
};

export type RevealDedupeResult =
  | { state: 'conflict' }
  | { state: 'miss' | 'shared' | 'hit'; result: RevealResult };

const MAX_REVEAL_ENTRIES = 2_048;
const reveals = new Map<string, RevealEntry>();

function pruneReveals(now: number) {
  for (const [commitment, entry] of reveals) {
    if (entry.expiresAt <= now) reveals.delete(commitment);
  }
  while (reveals.size >= MAX_REVEAL_ENTRIES) {
    const oldest = reveals.keys().next().value;
    if (!oldest) break;
    reveals.delete(oldest);
  }
}

export async function dedupeReveal(input: {
  commitment: string;
  digest: string;
  expiresAt: number;
  verify: () => Promise<RevealResult>;
}): Promise<RevealDedupeResult> {
  pruneReveals(Date.now());
  const existing = reveals.get(input.commitment);
  if (existing) {
    if (existing.digest !== input.digest) return { state: 'conflict' };
    const state = existing.settled ? 'hit' : 'shared';
    return { state, result: await existing.promise };
  }

  const promise = input.verify();
  const entry: RevealEntry = {
    digest: input.digest,
    expiresAt: input.expiresAt,
    settled: false,
    promise,
  };
  reveals.set(input.commitment, entry);
  const result = await promise;
  entry.settled = true;
  if (result.status === 503) {
    entry.expiresAt = Math.min(entry.expiresAt, Date.now() + (result.retryAfter ?? 2) * 1_000);
  }
  return { state: 'miss', result };
}

export function resetReplayRevealStateForTests() {
  reveals.clear();
}
