import { SOMNIA_MAINNET_PROFILE } from '../../../judge-network.ts';
import { createJudgeReplayRevealHandler } from './handler.ts';
import { dedupeReveal } from './state.ts';

export const runtime = 'nodejs';

export const POST = createJudgeReplayRevealHandler({
  profile: SOMNIA_MAINNET_PROFILE,
  dedupe: dedupeReveal,
  rateNamespace: 'judge-replay-reveal',
});
