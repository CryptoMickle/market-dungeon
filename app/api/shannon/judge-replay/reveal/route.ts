import { SHANNON_TESTNET_PROFILE } from '../../../../judge-network.ts';
import { createJudgeReplayRevealHandler } from '../../../judge-replay/reveal/handler.ts';
import { dedupeShannonReveal } from './state.ts';

export const runtime = 'nodejs';

export const POST = createJudgeReplayRevealHandler({
  profile: SHANNON_TESTNET_PROFILE,
  dedupe: dedupeShannonReveal,
  rateNamespace: 'shannon-judge-replay-reveal',
});
