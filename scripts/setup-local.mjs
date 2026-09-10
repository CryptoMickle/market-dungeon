import { randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, constants, fchmodSync, openSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';

const KEY = 'JUDGE_REPLAY_SEAL_KEY';
const VALID_KEY = /^[0-9a-fA-F]{64}$/;

function setupLocal() {
  // This hook belongs only to local development. Production keeps explicit key provisioning.
  if ((process.env.NODE_ENV && process.env.NODE_ENV !== 'development')
    || process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    return { generated: false, unchanged: true };
  }

  const shellValue = process.env[KEY];
  if (shellValue !== undefined) {
    if (VALID_KEY.test(shellValue)) return { generated: false, unchanged: true };
    throw new Error(shellValue.length === 0
      ? 'Unset the empty JUDGE_REPLAY_SEAL_KEY in your shell before running local setup.'
      : 'JUDGE_REPLAY_SEAL_KEY in your shell is invalid. Configure exactly 64 hexadecimal characters; no value was overwritten.');
  }

  let failedToLoad = false;
  const { combinedEnv, loadedEnvFiles } = nextEnv.loadEnvConfig(process.cwd(), true, {
    info() {},
    error() { failedToLoad = true; },
  }, true);
  if (failedToLoad) throw new Error('Local environment files could not be read. No Judge key was generated.');

  const existing = combinedEnv[KEY];
  if (existing && VALID_KEY.test(existing)) return { generated: false, unchanged: true };
  if (existing) throw new Error('The effective local JUDGE_REPLAY_SEAL_KEY is invalid. Configure exactly 64 hexadecimal characters; no value was overwritten.');
  const source = loadedEnvFiles.find(file => Object.hasOwn(file.env, KEY));
  if (source?.path === '.env.development.local') {
    throw new Error('Remove the empty JUDGE_REPLAY_SEAL_KEY from .env.development.local before running local setup; it overrides .env.local.');
  }

  const envPath = resolve(process.cwd(), '.env.local');
  const contents = loadedEnvFiles.find(file => file.path === '.env.local')?.contents ?? '';
  // Do not follow a linked environment file or print filesystem errors containing its contents.
  let descriptor;
  try {
    descriptor = openSync(envPath, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    if (readFileSync(descriptor, 'utf8') !== contents) {
      throw new Error('Local configuration changed during setup. Run setup again.');
    }
    fchmodSync(descriptor, 0o600);
    appendFileSync(descriptor, `${contents && !contents.endsWith('\n') ? '\n' : ''}\n# Stable key for local Judge replays; never commit this file.\n${KEY}=${randomBytes(32).toString('hex')}\n`);
  } catch {
    throw new Error('Could not safely update .env.local. Check its permissions and run local setup again.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return { generated: true, unchanged: false };
}

try {
  console.log(JSON.stringify(setupLocal()));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local Judge setup failed.');
  process.exitCode = 1;
}
