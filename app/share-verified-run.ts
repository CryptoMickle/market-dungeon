import type { ReplayDirection } from './replay-proof.ts';
import { eventContractIntervalLabel } from './event-contract-interval.ts';

export const MARKET_DUNGEON_URL = 'https://market-dungeon.vercel.app';
export const SOMNIA_EXPLORER_URL = 'https://explorer.somnia.network';

export function verifiedRunShareText(input: {
  lockedDirection: ReplayDirection;
  winningOutcome: 0 | 1;
  result: 'BLESSED' | 'CURSED' | 'VOID';
  marketId: string;
  commitment: string;
  combatSteps: number;
  onchainBlockNumber: string;
  settlementAddress: string;
  payoutNumerators: [string, string];
  intervalSec: unknown;
}) {
  const actualOutcome = input.winningOutcome === 0 ? 'UP' : 'DOWN';
  const result = input.result === 'BLESSED'
    ? 'VICTORY — prediction correct'
    : input.result === 'CURSED'
      ? 'BOSS LAST STAND — prediction incorrect'
      : 'VOID — no prediction loss';
  const proofUrl = `${SOMNIA_EXPLORER_URL}/search?q=${encodeURIComponent(input.marketId)}`;
  const blockUrl = `${SOMNIA_EXPLORER_URL}/block/${encodeURIComponent(input.onchainBlockNumber)}`;
  const settlementUrl = `${SOMNIA_EXPLORER_URL}/address/${encodeURIComponent(input.settlementAddress)}`;

  return [
    '⚔️ Market Dungeon — verified Judge run',
    `Market: BTC ${eventContractIntervalLabel(input.intervalSec)}`,
    `Locked choice: BTC ${input.lockedDirection}`,
    `Actual outcome: BTC ${actualOutcome}`,
    `Result: ${result}`,
    `Market ID: ${input.marketId}`,
    `Combat verified: guard + boss · ${input.combatSteps} actions`,
    `Commitment verified: ${input.commitment}`,
    `Direct Somnia RPC settlement: block #${input.onchainBlockNumber} · payout [${input.payoutNumerators.join(', ')}]`,
    `Settlement block: ${blockUrl}`,
    `BinarySettlement: ${settlementUrl}`,
    `Somnia proof: ${proofUrl}`,
    `Play Market Dungeon: ${MARKET_DUNGEON_URL}`,
  ].join('\n');
}
