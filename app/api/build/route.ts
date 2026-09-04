export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? '';
  if (!COMMIT_SHA.test(commit)) {
    return Response.json(
      { schema: 'market-dungeon/build-identity/v1', app: 'market-dungeon', error: 'Build commit unavailable.' },
      { status: 503, headers: NO_STORE },
    );
  }

  return Response.json(
    { schema: 'market-dungeon/build-identity/v1', app: 'market-dungeon', commit },
    { headers: NO_STORE },
  );
}
