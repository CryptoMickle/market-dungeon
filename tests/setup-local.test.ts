import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const script = fileURLToPath(new URL('../scripts/setup-local.mjs', import.meta.url));
const KEY = 'JUDGE_REPLAY_SEAL_KEY';
const value = 'a4'.repeat(32);
const files = ['.env.development.local', '.env.local', '.env.development', '.env'];

function directory(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'market-local-setup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function setup(cwd: string, extraEnv: Record<string, string | undefined> = {}) {
  const env = { ...process.env };
  for (const name of [KEY, 'NODE_ENV', 'VERCEL', 'VERCEL_ENV', '__NEXT_PROCESSED_ENV']) delete env[name];
  return spawnSync(process.execPath, [script], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

test('local setup creates a private stable key while preserving unrelated configuration', t => {
  const dir = directory(t);
  const envPath = join(dir, '.env.local');
  const original = 'LOCAL_MARKER=keep-this\n';
  writeFileSync(envPath, original, { mode: 0o644 });
  const first = setup(dir);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), { generated: true, unchanged: false });
  const configured = readFileSync(envPath, 'utf8');
  assert.ok(configured.startsWith(original));
  const generatedKey = parseEnv(configured)[KEY];
  assert.ok(generatedKey);
  assert.match(generatedKey, /^[0-9a-f]{64}$/);
  assert.equal(first.stdout.includes(generatedKey), false);
  assert.equal(first.stderr.includes(generatedKey), false);
  assert.equal(statSync(envPath).mode & 0o777, 0o600);
  const second = setup(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), { generated: false, unchanged: true });
  assert.equal(readFileSync(envPath, 'utf8'), configured);
});

test('local setup follows Next development file precedence without replacing valid keys', t => {
  const root = directory(t);
  for (let source = 0; source < files.length; source++) {
    const dir = join(root, `source-${source}`);
    mkdirSync(dir);
    for (let index = source; index < files.length; index++) {
      writeFileSync(join(dir, files[index]), `${KEY}=${index === source ? value : 'invalid-lower-priority-key'}\n`);
    }
    const before = files.map(file => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : null);
    const result = setup(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { generated: false, unchanged: true });
    assert.deepEqual(files.map(file => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : null), before);
  }
});

test('shell keys and Next variable expansion retain their effective precedence', t => {
  const dir = directory(t);
  writeFileSync(join(dir, '.env.development.local'), `${KEY}=invalid-file-key\n`);
  let result = setup(dir, { [KEY]: value });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { generated: false, unchanged: true });
  assert.equal(existsSync(join(dir, '.env.local')), false);
  writeFileSync(join(dir, '.env.development.local'), `${KEY}=\$LOCAL_JUDGE_SECRET\n`);
  result = setup(dir, { LOCAL_JUDGE_SECRET: value });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { generated: false, unchanged: true });
  assert.equal(existsSync(join(dir, '.env.local')), false);
  assert.equal(result.stdout.includes(value), false);
});

test('invalid nonempty keys are rejected without replacing or exposing them', t => {
  const dir = directory(t);
  const invalid = 'do-not-print-or-replace-this';
  const envPath = join(dir, '.env.local');
  writeFileSync(envPath, `${KEY}=${invalid}\n`);
  for (const extraEnv of [{}, { [KEY]: invalid }]) {
    const result = setup(dir, extraEnv);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid/);
    assert.equal(`${result.stdout}${result.stderr}`.includes(invalid), false);
    assert.equal(readFileSync(envPath, 'utf8'), `${KEY}=${invalid}\n`);
  }
});

test('empty local values can be configured while empty higher-priority overrides are explained', t => {
  const dir = directory(t);
  const envPath = join(dir, '.env.local');
  writeFileSync(envPath, `${KEY}=\n`);
  const result = setup(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(parseEnv(readFileSync(envPath, 'utf8'))[KEY] ?? '', /^[0-9a-f]{64}$/);
  const configured = readFileSync(envPath, 'utf8');
  const shellBlocked = setup(dir, { [KEY]: '' });
  assert.equal(shellBlocked.status, 1);
  assert.match(shellBlocked.stderr, /empty.*shell/);
  writeFileSync(join(dir, '.env.development.local'), `${KEY}=\n`);
  const fileBlocked = setup(dir);
  assert.equal(fileBlocked.status, 1);
  assert.match(fileBlocked.stderr, /empty.*\.env\.development\.local/);
  assert.equal(readFileSync(envPath, 'utf8'), configured);
});

test('production and Vercel environments never create local secrets', t => {
  const dir = directory(t);
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }]) {
    const result = setup(dir, env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { generated: false, unchanged: true });
    assert.equal(existsSync(join(dir, '.env.local')), false);
  }
});
