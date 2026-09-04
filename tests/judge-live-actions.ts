import { replayJudgeCombat, type JudgeCombatAction } from '../app/judge-combat.ts';

export function validLiveJudgeActions(gameSeed: string): JudgeCombatAction[] {
  const actions: JudgeCombatAction[] = [
    { room: 8, action: 'attack' },
    { room: 9, action: 'attack' },
  ];
  if (replayJudgeCombat(gameSeed, actions).verified) return actions;

  actions.push({ room: 9, action: 'attack' });
  const replay = replayJudgeCombat(gameSeed, actions);
  if (!replay.verified) throw new Error(`Could not derive a valid live combat transcript: ${replay.reason}`);
  return actions;
}
