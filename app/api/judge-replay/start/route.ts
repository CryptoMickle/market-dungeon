import { SOMNIA_MAINNET_PROFILE } from '../../../judge-network.ts';
import { createJudgeReplayStartHandler } from './handler.ts';
import { replayCandidates } from './state.ts';

export const runtime = 'nodejs';

export const POST = createJudgeReplayStartHandler({
  profile: SOMNIA_MAINNET_PROFILE,
  candidates: replayCandidates,
  rateNamespace: 'judge-replay-start',
});
