import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const headers = [
  'participant_id',
  'started_utc',
  'device_class',
  'entry_source',
  'run_status',
  'duration_bucket',
  'verifier_result',
  'direction',
  'result',
  'continued_to_dreamdex',
  'share_engaged',
  'challenge_created',
  'challenge_opened',
  'challenge_verified',
  'dual_victory_understood',
  'read_only_understood',
  'blocker_code',
] as const;

type Header = (typeof headers)[number];

export type PilotRow = Record<Header, string>;

const allowed = {
  device_class: ['desktop', 'mobile', 'tablet'],
  entry_source: ['direct', 'home', 'challenge'],
  run_status: [
    'verified',
    'abandoned-before-reveal',
    'unresolved-after-reveal',
    'fail',
    'not-provable',
  ],
  duration_bucket: ['under-60s', '60-119s', '120-179s', '180s-plus', 'unknown'],
  verifier_result: ['pass', 'fail', 'not-provable', 'unresolved', 'not-reached'],
  direction: ['up', 'down'],
  result: ['blessed', 'cursed', 'not-reached'],
  boolean: ['yes', 'no'],
  blocker_code: [
    'none',
    'entry',
    'lock',
    'combat',
    'reveal',
    'verification',
    'sharing',
    'mobile-layout',
    'copy',
    'availability',
    'other',
  ],
} as const;

function requireAllowed(row: PilotRow, field: Header, values: readonly string[], line: number) {
  if (!values.includes(row[field])) {
    throw new Error(`line ${line}: ${field} must be one of ${values.join(', ')}`);
  }
}

function validateRow(row: PilotRow, line: number) {
  if (!/^P\d{2}(?:-R\d+)?$/.test(row.participant_id)) {
    throw new Error(`line ${line}: participant_id must match P01 or P01-R2`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.started_utc)
    || Number.isNaN(Date.parse(row.started_utc))) {
    throw new Error(`line ${line}: started_utc must be an exact UTC timestamp`);
  }

  requireAllowed(row, 'device_class', allowed.device_class, line);
  requireAllowed(row, 'entry_source', allowed.entry_source, line);
  requireAllowed(row, 'run_status', allowed.run_status, line);
  requireAllowed(row, 'duration_bucket', allowed.duration_bucket, line);
  requireAllowed(row, 'verifier_result', allowed.verifier_result, line);
  requireAllowed(row, 'direction', allowed.direction, line);
  requireAllowed(row, 'result', allowed.result, line);
  requireAllowed(row, 'blocker_code', allowed.blocker_code, line);

  for (const field of [
    'continued_to_dreamdex',
    'share_engaged',
    'challenge_created',
    'challenge_opened',
    'challenge_verified',
    'dual_victory_understood',
    'read_only_understood',
  ] as const) {
    requireAllowed(row, field, allowed.boolean, line);
  }

  const terminal = row.run_status === 'verified'
    || row.run_status === 'fail'
    || row.run_status === 'not-provable';
  const expectedVerifier = row.run_status === 'verified'
    ? 'pass'
    : row.run_status === 'fail'
      ? 'fail'
      : row.run_status === 'not-provable'
        ? 'not-provable'
        : row.run_status === 'unresolved-after-reveal'
          ? 'unresolved'
          : 'not-reached';

  if (row.verifier_result !== expectedVerifier) {
    throw new Error(`line ${line}: ${row.run_status} requires verifier_result=${expectedVerifier}`);
  }
  if (terminal && row.result === 'not-reached') {
    throw new Error(`line ${line}: a terminal run requires blessed or cursed result`);
  }
  if (!terminal && row.result !== 'not-reached') {
    throw new Error(`line ${line}: a non-terminal run requires result=not-reached`);
  }
  if (row.run_status !== 'verified' && row.continued_to_dreamdex === 'yes') {
    throw new Error(`line ${line}: Continue intent is counted only after verified completion`);
  }
  if (row.challenge_verified === 'yes' && row.challenge_opened !== 'yes') {
    throw new Error(`line ${line}: challenge_verified=yes requires challenge_opened=yes`);
  }
}

export function parsePilotCsv(csv: string): PilotRow[] {
  const lines = csv.replaceAll('\r\n', '\n').trimEnd().split('\n');
  const actualHeaders = (lines.shift() ?? '').split(',');
  if (actualHeaders.join(',') !== headers.join(',')) {
    throw new Error(`CSV header must be exactly: ${headers.join(',')}`);
  }

  const rows: PilotRow[] = [];
  lines.forEach((line, index) => {
    const values = line.split(',');
    const lineNumber = index + 2;
    if (values.length !== headers.length) {
      throw new Error(`line ${lineNumber}: expected ${headers.length} columns, got ${values.length}`);
    }
    if (values.slice(1).every((value) => value === '')) return;
    if (values.some((value) => value === '')) {
      throw new Error(`line ${lineNumber}: a started participant row cannot contain blank fields`);
    }

    const row = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]])) as PilotRow;
    validateRow(row, lineNumber);
    rows.push(row);
  });
  return rows;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function summarizePilotRows(rows: PilotRow[]) {
  const participantIds = new Set(rows.map((row) => row.participant_id.replace(/-R\d+$/, '')));
  const L = rows.length;
  const R = rows.filter((row) => row.run_status !== 'abandoned-before-reveal').length;
  const P = rows.filter((row) => row.run_status === 'verified').length;
  const F = rows.filter((row) => row.run_status === 'fail').length;
  const N = rows.filter((row) => row.run_status === 'not-provable').length;
  const U = rows.filter((row) => row.run_status === 'unresolved-after-reveal').length;
  const D120 = rows.filter((row) => row.run_status === 'verified'
    && (row.duration_bucket === 'under-60s' || row.duration_bucket === '60-119s')).length;
  const C = rows.filter((row) => row.run_status === 'verified'
    && row.continued_to_dreamdex === 'yes').length;
  const CC = rows.filter((row) => row.challenge_created === 'yes').length;
  const CO = rows.filter((row) => row.challenge_opened === 'yes').length;
  const CV = rows.filter((row) => row.challenge_verified === 'yes').length;
  const dual = rows.filter((row) => row.dual_victory_understood === 'yes').length;
  const readOnly = rows.filter((row) => row.read_only_understood === 'yes').length;

  return {
    distinctParticipants: participantIds.size,
    L,
    R,
    P,
    F,
    N,
    U,
    D120,
    C,
    CC,
    CO,
    CV,
    dual,
    readOnly,
    completionRate: ratio(P, L),
    proofSuccessRate: ratio(P, R),
    belowTwoMinutesRate: ratio(D120, P),
    continueRate: ratio(C, P),
    dualComprehensionRate: ratio(dual, L),
    readOnlyComprehensionRate: ratio(readOnly, L),
  };
}

function percent(value: number | null) {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function pass(value: number | null, predicate: (value: number) => boolean) {
  return value === null ? 'not enough data' : predicate(value) ? 'yes' : 'no';
}

export function formatPilotMarkdown(rows: PilotRow[]) {
  const s = summarizePilotRows(rows);
  const sample = s.L >= 30 ? 'qualified pilot' : s.L > 0 ? 'usability pilot' : 'no participant data';

  return [
    '# Market Dungeon pilot summary',
    '',
    `Sample classification: **${sample}**`,
    '',
    `Distinct participants: **${s.distinctParticipants}**`,
    `Qualified runs: **${s.L}**`,
    `Reached verification: **${s.R}**`,
    `Verified: **${s.P}** · FAIL: **${s.F}** · NOT PROVABLE: **${s.N}** · unresolved: **${s.U}**`,
    '',
    '| Metric | Numerator | Denominator | Result | Target | Pass? |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    `| Verified completion | ${s.P} | ${s.L} | ${percent(s.completionRate)} | >=70% and L>=30 | ${s.L >= 30 && s.completionRate !== null && s.completionRate >= 0.7 ? 'yes' : s.L === 0 ? 'not enough data' : 'no'} |`,
    `| End-to-end proof success | ${s.P} | ${s.R} | ${percent(s.proofSuccessRate)} | >=95% | ${pass(s.proofSuccessRate, (value) => value >= 0.95)} |`,
    `| Below two minutes | ${s.D120} | ${s.P} | ${percent(s.belowTwoMinutesRate)} | >50% | ${pass(s.belowTwoMinutesRate, (value) => value > 0.5)} |`,
    `| Continue intent | ${s.C} | ${s.P} | ${percent(s.continueRate)} | >=25% | ${pass(s.continueRate, (value) => value >= 0.25)} |`,
    `| Dual-victory comprehension | ${s.dual} | ${s.L} | ${percent(s.dualComprehensionRate)} | descriptive | — |`,
    `| Read-only comprehension | ${s.readOnly} | ${s.L} | ${percent(s.readOnlyComprehensionRate)} | descriptive | — |`,
    '',
    `Challenge actions: **${s.CC} created / ${s.CO} opened / ${s.CV} verified**; target 10 / 5 / 3.`,
    '',
    'Continue is discovery intent, not a wallet connection, order, fill, trade, volume, or revenue event.',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'docs/pilot/PILOT_LOG_TEMPLATE.csv';
  const rows = parsePilotCsv(readFileSync(file, 'utf8'));
  process.stdout.write(`${formatPilotMarkdown(rows)}\n`);
}
