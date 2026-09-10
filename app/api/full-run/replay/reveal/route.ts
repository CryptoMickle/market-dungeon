import { SOMNIA_MAINNET_PROFILE } from '../../../../judge-network.ts';
import { createFullRunReplayRevealHandler } from './handler.ts';

export const runtime = 'nodejs';

export const POST = createFullRunReplayRevealHandler({ profile: SOMNIA_MAINNET_PROFILE });
