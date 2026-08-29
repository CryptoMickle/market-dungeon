export type ReplayDirection = 'UP' | 'DOWN';

export type ReplayCommitmentPayload = {
  marketId: string;
  committedOutcome: 0 | 1;
  lockedDirection: ReplayDirection;
  gameSeed: string;
  issuedAt: number;
  revealAfter: number;
  expiresAt: number;
  salt: string;
};

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

export const REPLAY_COMMITMENT_DOMAIN = 'market-dungeon/judge-replay/v1';

export function secondsUntilReplayReveal(revealAfter: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof revealAfter !== 'number' || !Number.isSafeInteger(revealAfter) || !Number.isFinite(nowSeconds)) return 0;
  return Math.max(0, revealAfter - Math.floor(nowSeconds));
}

export function canonicalReplayProof(proof: ReplayCommitmentPayload) {
  return [
    REPLAY_COMMITMENT_DOMAIN,
    `marketId=${proof.marketId.toLowerCase()}`,
    `outcome=${proof.committedOutcome}`,
    `direction=${proof.lockedDirection}`,
    `gameSeed=${proof.gameSeed}`,
    `issuedAt=${proof.issuedAt}`,
    `revealAfter=${proof.revealAfter}`,
    `expiresAt=${proof.expiresAt}`,
    `salt=${proof.salt}`,
  ].join('\n');
}
