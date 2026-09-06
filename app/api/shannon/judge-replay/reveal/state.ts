import { createReplayRevealStore } from '../../../judge-replay/reveal/state.ts';

const shannonRevealStore = createReplayRevealStore();

export const dedupeShannonReveal = shannonRevealStore.dedupe;
export const resetShannonReplayRevealStateForTests = shannonRevealStore.reset;
