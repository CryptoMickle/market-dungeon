import { judgeCombatSnapshot, type JudgeCombatAction, type JudgeCombatSnapshot } from './judge-combat.ts';

export type LiveJudgeCombatState = JudgeCombatSnapshot;

/** Entering the boss room changes presentation, not the signed action transcript. */
export function liveJudgeCombatState(
  gameSeed: string,
  actions: JudgeCombatAction[],
  options: { bossEntered?: boolean } = {},
): LiveJudgeCombatState {
  const state = judgeCombatSnapshot(gameSeed, actions);
  if (state.valid && state.phase === 'between' && options.bossEntered) {
    return { ...state, phase: 'boss', turn: 0, potionUses: 0, lastExchange: null };
  }
  return state;
}
