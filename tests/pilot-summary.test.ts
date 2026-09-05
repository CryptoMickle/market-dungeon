import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPilotMarkdown,
  parsePilotCsv,
  summarizePilotRows,
} from '../scripts/summarize-pilot.ts';

const header = 'participant_id,started_utc,device_class,entry_source,run_status,duration_bucket,verifier_result,direction,result,continued_to_dreamdex,share_engaged,challenge_created,challenge_opened,challenge_verified,dual_victory_understood,read_only_understood,blocker_code';

test('pilot summary reports conservative denominators and distinct participants', () => {
  const rows = parsePilotCsv([
    header,
    'P01,2026-09-05T10:00:00Z,desktop,direct,verified,60-119s,pass,up,blessed,yes,yes,yes,no,no,yes,yes,none',
    'P01-R2,2026-09-05T10:05:00Z,desktop,challenge,verified,under-60s,pass,down,cursed,no,no,no,yes,yes,yes,yes,none',
    'P02,2026-09-05T10:10:00Z,mobile,direct,unresolved-after-reveal,unknown,unresolved,up,not-reached,no,no,no,no,no,yes,yes,availability',
    'P03,2026-09-05T10:15:00Z,mobile,home,abandoned-before-reveal,unknown,not-reached,down,not-reached,no,no,no,no,no,no,yes,combat',
  ].join('\n'));

  const summary = summarizePilotRows(rows);
  assert.equal(summary.distinctParticipants, 3);
  assert.equal(summary.L, 4);
  assert.equal(summary.R, 3);
  assert.equal(summary.P, 2);
  assert.equal(summary.U, 1);
  assert.equal(summary.completionRate, 0.5);
  assert.equal(summary.proofSuccessRate, 2 / 3);
  assert.equal(summary.belowTwoMinutesRate, 1);
  assert.equal(summary.continueRate, 0.5);
  assert.equal(summary.CC, 1);
  assert.equal(summary.CO, 1);
  assert.equal(summary.CV, 1);
  assert.match(formatPilotMarkdown(rows), /usability pilot/);
  assert.match(formatPilotMarkdown(rows), /Continue is discovery intent/);
});

test('pilot parser ignores untouched template rows but rejects inconsistent evidence', () => {
  assert.deepEqual(parsePilotCsv(`${header}\nP01,,,,,,,,,,,,,,,,`), []);

  assert.throws(() => parsePilotCsv([
    header,
    'P01,2026-09-05T10:00:00Z,desktop,direct,verified,60-119s,fail,up,blessed,yes,yes,yes,no,no,yes,yes,none',
  ].join('\n')), /verified requires verifier_result=pass/);

  assert.throws(() => parsePilotCsv([
    header,
    'P01,2026-09-05T10:00:00Z,desktop,direct,fail,unknown,fail,up,cursed,yes,no,no,no,no,yes,yes,verification',
  ].join('\n')), /Continue intent is counted only after verified completion/);
});
