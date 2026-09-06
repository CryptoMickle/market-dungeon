import { SHANNON_TESTNET_PROFILE } from '../../../../judge-network.ts';
import { createJudgeReplayStartHandler } from '../../../judge-replay/start/handler.ts';
import { shannonReplayCandidates } from './state.ts';

export const runtime = 'nodejs';

export const POST = createJudgeReplayStartHandler({
  profile: SHANNON_TESTNET_PROFILE,
  candidates: shannonReplayCandidates,
  rateNamespace: 'shannon-judge-replay-start',
});
