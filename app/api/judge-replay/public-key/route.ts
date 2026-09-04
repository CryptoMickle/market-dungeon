import { replayLockAttestationPublicKey } from '../crypto.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };

export async function GET() {
  try {
    return Response.json(replayLockAttestationPublicKey(), { headers: NO_STORE });
  } catch {
    return Response.json(
      { error: 'Judge lock-attestation key is unavailable.' },
      { status: 503, headers: NO_STORE },
    );
  }
}
