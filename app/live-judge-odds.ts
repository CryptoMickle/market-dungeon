import type { DreamDexClobOdds } from './clob-odds.ts';

export type LiveJudgeOddsResponse = {
  marketId: string;
  chainId: 50312;
  venueId: string;
  intervalSec: 60;
  state: 'open' | 'closed' | 'unavailable';
  odds: DreamDexClobOdds;
  serverTime: number;
  asset?: 'BTC' | 'ETH';
  expiry?: number;
  retryAfter?: number;
};
