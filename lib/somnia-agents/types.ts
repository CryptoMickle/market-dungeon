export type RivalMode = 'simulation' | 'somnia';
export type RivalDirection = 'UP' | 'DOWN';
export type RivalOutcome = RivalDirection | 'VOID';

export type RivalRound = {
  attemptId: string;
  marketId: string;
  expiry: number;
  cutoff: number;
  mode: RivalMode;
  status: 'preparing' | 'awaiting-wallet' | 'pending' | 'locked' | 'unavailable';
  direction?: RivalDirection;
  reason?: string;
  txHash?: string;
  requestId?: string;
  finalizedAt?: number;
  /** Opaque server-authenticated preview receipt, carried only in the browser cache. */
  ticket?: string;
};

// Only call with the market outcome after the game's independent settlement check.
// This side game never changes combat, the boss outcome, rewards or gold.
export function compareRival(player: RivalDirection, kevin: RivalDirection, outcome: RivalOutcome): 'player' | 'kevin' | 'tie' | 'void' {
  if (outcome === 'VOID') return 'void';
  if (player === kevin) return 'tie';
  return player === outcome ? 'player' : 'kevin';
}

export type RivalTransaction = {
  chainId: number;
  to: string;
  data: string;
  value: string;
  depositStt: string;
  agentId: string;
  payload: string;
};

export type RivalResponse = { round: RivalRound; transaction?: RivalTransaction; ticket?: string };
