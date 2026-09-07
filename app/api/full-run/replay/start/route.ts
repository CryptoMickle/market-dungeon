import { SOMNIA_MAINNET_PROFILE } from '../../../../judge-network.ts';
import { createJudgeReplayStartHandler } from '../../../judge-replay/start/handler.ts';
import { replayCandidates } from '../../../judge-replay/start/state.ts';

export const runtime = 'nodejs';

// The full expedition uses the same independently sealed historical market
// selection as Judge v1, but it never claims that Judge combat represents the
// forty-room run. Its separate reveal route verifies market settlement only.
export const POST = createJudgeReplayStartHandler({
  profile: SOMNIA_MAINNET_PROFILE,
  candidates: replayCandidates,
  rateNamespace: 'full-run-replay-start',
  allowExcludedMarketIds: true,
  invalidRequestMessage: 'Invalid full-run replay request.',
  unavailableMessage: 'A sealed Event Contract is unavailable. Please try again.',
});
