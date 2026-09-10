import { JUDGE_COMBAT, replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';

export function judgePolicyActions(gameSeed: string, policy: 'careful' | 'attack-only' | 'storm-only' = 'careful'): JudgeCombatAction[] {
  const actions: JudgeCombatAction[] = [];
  let enteredBoss = false;
  for (let step = 0; step < JUDGE_COMBAT.maxSteps; step += 1) {
    const state = actions.length ? replayJudgeCombat(gameSeed, actions) : null;
    if (state && (!state.playerSurvived || state.verified)) break;
    if (state?.guardDefeated && !enteredBoss) {
      if (policy === 'careful' && state.remainingPotions > 0 && state.finalHp <= 75) {
        actions.push({ room: 8, action: 'potion' });
        continue;
      }
      enteredBoss = true;
    }
    actions.push({
      room: enteredBoss ? 9 : 8,
      action: policy === 'careful' && state && state.finalHp <= 35 && state.remainingPotions > 0
        ? 'potion' : policy === 'storm-only' ? 'storm' : 'attack',
    });
  }
  return actions;
}

export function validLiveJudgeActions(gameSeed: string): JudgeCombatAction[] {
  const actions = judgePolicyActions(gameSeed);
  const replay = replayJudgeCombat(gameSeed, actions);
  if (!replay.verified) throw new Error(`Could not derive a valid live combat transcript: ${replay.reason}`);
  return actions;
}
