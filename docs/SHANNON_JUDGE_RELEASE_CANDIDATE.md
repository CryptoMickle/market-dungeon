# Market Dungeon — Shannon Judge release candidate

Status: **branch-published release candidate; final tag, Production, human, and
independent validation still pending**

Prepared: 7 September 2026

Initial implementation commit: `2dfe0f484822a8ffcc7f7c2303cdc80f66896829`.
The final source identity is intentionally assigned only by the next immutable
post-v10 release tag and its matching public `/api/build` response.

This record separates what the local Shannon candidate proves from what still
depends on a public deployment or independent people. It does not replace the
immutable v10 mainnet release.

## Product surface

- `/shannon/judge` is a fixed, read-only Judge Replay on Somnia Shannon
  Testnet. It uses historical finalized dreamDEX BTC 5-minute markets, with the
  same balanced 15-minute fallback, rather than depending on an active market.
- `/shannon/verify` independently checks the exported Shannon proof against the
  fixed testnet profile.
- The existing `/judge` and `/verify` routes retain their mainnet v2 formats
  and behavior.
- Shannon does not show the production dreamDEX continuation action. It cannot
  imply that a testnet replay is a live mainnet trading path.
- Neither profile connects a wallet, requests a signature, grants token
  approval, sends an order, or performs any other chain write.

## Fixed Shannon profile

| Surface | Fixed value |
| --- | --- |
| Profile | `shannon-testnet` |
| Chain ID | `50312` |
| Indexer | `https://dev.smk.somnia.host/v1/graphql` |
| RPC | `https://api.infra.testnet.somnia.network` |
| Explorer | `https://shannon-explorer.somnia.network` |
| Collateral | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |
| Origin operator | `2` |
| Origin venue | `0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c` |
| BinaryModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |

The server selects the profile from the fixed route. The request cannot supply
an RPC, indexer, explorer, chain, collateral, deployment, operator, or venue.

## Versioned proof boundary

- Mainnet preserves replay commitment/seal v2, lock-attestation/key v1, and
  verified-run artifact v2.
- Shannon uses replay commitment/seal v3. Profile ID and chain ID are included
  in the canonical commitment and AES-GCM additional authenticated data.
- Shannon uses profile-bound lock-attestation/key v2 and verified-run artifact
  v3.
- Candidate and reveal-deduplication state is isolated per profile.
- The verifier requires the fixed chain, contracts, collateral, origin,
  token/pool/nonce structure, payout, raw RPC results, and EIP-1898 canonical
  block-hash reference. An unavailable network is `NOT PROVABLE`; a demonstrated
  contradiction is `FAIL`.

## Local verification on the implementation commit

| Gate | Result |
| --- | --- |
| ESLint | PASS, 0 errors |
| TypeScript | PASS |
| Unit/integration tests | PASS, 99/99 |
| Shannon proof kernel | PASS, 7/7 |
| Optimized webpack build | PASS, 15 routes generated |
| Deterministic Chromium | PASS, 22/22 |
| Dedicated Shannon browser flow | PASS, 1/1 inside the 22-test suite |
| Diff/secret/scope checks | PASS |

The dedicated Shannon browser test completes lock, guard and boss combat,
reveal, result, proof export, and `/shannon/verify` PASS. It confirms chain
`50312`, fixed Shannon API/RPC/explorer values, Shannon-preserving reset and
challenge routes, and zero mainnet API/RPC calls.

An independent GPT-6 Astra Extra High security pass completed 61 focused
regression tests. A malformed-type matrix tested 1,575 proof mutations: 759
mainnet and 816 Shannon. Every mutation failed during local parsing with zero
exceptions, public-key requests, or RPC calls. The pass also compared the new
implementation with the actual pre-change mainnet code in 12 environment,
direction, and interval scenarios and confirmed identical commitment bytes,
digests, public keys, signatures, and mutual legacy-seal compatibility.

These are project-controlled automated and expert-assisted checks. They are not
human usability sessions, independent non-team validation, production health,
or a third-party audit.

## Fresh read-only feasibility evidence

The preceding WB-01 read-only probe found 64 eligible records in each of the
four bounded groups—5-minute UP, 5-minute DOWN, 15-minute UP, and 15-minute
DOWN—and directly reproduced one settlement from each group with all 29
recorded conditions satisfied. It found no active canonical short-window market
at the time. That evidence supports historical Judge Replay availability; it
does not prove this candidate is publicly deployed or continuously available.

## First public Preview gate

- Preview `064da1d178751590587a07e8a585d0de741b91f0` matched its public
  `/api/build` identity.
- The preserved mainnet Judge-to-verifier path passed 20/20 consecutive live
  runs with zero retries.
- The new Shannon live gate correctly rejected that Preview: the start route
  returned `503` because the fixed checksummed collateral address was compared
  case-sensitively with the indexer's lowercase address value.
- Release was halted. The filter now emits canonical lowercase address values,
  a regression assertion covers the query, and a fresh local call against the
  real Shannon indexer returns a balanced 5-minute pool. The corrected commit
  still requires a new exact-identity Preview and both live gates.

This failed first Preview is release-engineering evidence, not a successful
Shannon deployment claim.

## Remaining external gates

- No final release tag or matching Production deployment exists for the
  corrected candidate.
- The corrected candidate has not yet passed its exact-identity public Preview
  or Production gates.
- Human participant invitations: `0`; participants: `0`; sessions: `0`.
- Independent validator invitations: `0`; validators: `0`.
- Participant recruitment remains unpublished pending separate manual user
  approval. Administrative routing evidence is retained privately and is not
  product-quality, participant, endorsement, or validation evidence.

Until those facts change, describe the candidate as **branch-published, locally
verified, and independently reproducible by design**, not finally released,
user-validated, independently validated, or audited.

## Release order

1. Confirm a new Preview `/api/build` matches the corrected candidate commit.
2. Run the documented zero-retry Preview gate on both the intended Shannon
   entry and the preserved mainnet regression path.
3. Close the human-pilot window with actual results or an explicit zero-result.
4. Create a new immutable release tag; never move v10.
5. Deploy the identical commit to Production and repeat both live gates.
6. Obtain qualified validator records if available, or disclose zero.
7. Freeze public copy and only then begin the final video block.
