import { createReplayCandidateStore } from '../../../judge-replay/start/state.ts';

const shannonCandidateStore = createReplayCandidateStore();

export const shannonReplayCandidates = shannonCandidateStore.load;
export const resetShannonReplayStartStateForTests = shannonCandidateStore.reset;
