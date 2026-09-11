import type { JudgeNetworkProfileId } from './judge-network';

export type HistoricalResumeSummary = { phase: string; hp: number; hasLockedReplay: boolean };
type Checkpoint = { summary: HistoricalResumeSummary; state: unknown };

// Same-tab navigation memory only. No browser storage, no new proof trust, and
// no state survives a page reload or a browser restart.
const checkpoints = new Map<JudgeNetworkProfileId, Checkpoint>();

export function getHistoricalResume(profile: JudgeNetworkProfileId): HistoricalResumeSummary | null {
  return checkpoints.get(profile)?.summary ?? null;
}

export function getLatestHistoricalProfile(): JudgeNetworkProfileId | null {
  return Array.from(checkpoints.keys()).at(-1) ?? null;
}

export function readHistoricalCheckpoint<T>(profile: JudgeNetworkProfileId): T | undefined {
  return checkpoints.get(profile)?.state as T | undefined;
}

export function keepHistoricalCheckpoint<T>(profile: JudgeNetworkProfileId, state: T, summary: HistoricalResumeSummary) {
  // Move the active profile last so Home can resume the same network.
  checkpoints.delete(profile);
  checkpoints.set(profile, { state, summary });
}

export function clearHistoricalCheckpoint(profile: JudgeNetworkProfileId) {
  checkpoints.delete(profile);
}
