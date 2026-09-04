import { pathToFileURL } from 'node:url';

const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export function marketDungeonDeploymentOrigin(value: unknown) {
  if (typeof value !== 'string' || !value) {
    throw new Error('LIVE_SMOKE_BASE_URL is required.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LIVE_SMOKE_BASE_URL must be a valid absolute URL.');
  }

  const host = url.hostname.toLowerCase();
  const allowedHost = host === 'market-dungeon.vercel.app'
    || (host.startsWith('market-dungeon-') && host.endsWith('.vercel.app'));
  if (url.protocol !== 'https:' || !allowedHost || url.port || url.pathname !== '/'
    || url.search || url.hash || url.username || url.password) {
    throw new Error('LIVE_SMOKE_BASE_URL must be an HTTPS Market Dungeon Vercel deployment origin.');
  }
  return url;
}

export async function validateLiveTarget(
  baseUrl: unknown,
  expectedCommit: unknown,
  fetchIdentity: typeof fetch = fetch,
) {
  const origin = marketDungeonDeploymentOrigin(baseUrl);
  if (typeof expectedCommit !== 'string' || !COMMIT_SHA.test(expectedCommit)) {
    throw new Error('EXPECTED_COMMIT must be a full 40-character commit SHA.');
  }

  const response = await fetchIdentity(new URL('/api/build', origin), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Deployment build identity is unavailable.');

  const identity = await response.json() as Record<string, unknown>;
  if (identity.schema !== 'market-dungeon/build-identity/v1'
    || identity.app !== 'market-dungeon'
    || identity.commit !== expectedCommit.toLowerCase()) {
    throw new Error('Deployment commit does not match the workflow commit.');
  }

  return { origin: origin.origin, commit: identity.commit };
}

async function main() {
  const result = await validateLiveTarget(
    process.env.LIVE_SMOKE_BASE_URL,
    process.env.EXPECTED_COMMIT,
  );
  process.stdout.write(`Validated ${result.origin} at ${result.commit}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Live target validation failed.'}\n`);
    process.exitCode = 1;
  });
}
