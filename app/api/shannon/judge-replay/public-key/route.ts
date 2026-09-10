import { SHANNON_TESTNET_PROFILE } from '../../../../judge-network.ts';
import { replayLockAttestationPublicKey } from '../../../judge-replay/crypto.ts';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };

export async function GET() {
  try {
    return Response.json(replayLockAttestationPublicKey(SHANNON_TESTNET_PROFILE), { headers: NO_STORE });
  } catch {
    return Response.json(
      { error: 'Shannon Judge lock-attestation key is unavailable.', retryState: 'config_unavailable' },
      { status: 503, headers: NO_STORE },
    );
  }
}
