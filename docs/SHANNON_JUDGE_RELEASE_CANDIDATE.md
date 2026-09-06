# Market Dungeon — Shannon Judge release candidate

Status: **local release candidate; not pushed, tagged, deployed, or externally validated**

Prepared: 7 September 2026

Implementation commit: `2dfe0f484822a8ffcc7f7c2303cdc80f66896829`

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

## Open external gates

- No Preview or Production deployment contains this commit.
- No public `/api/build` has been matched to this candidate.
- No Preview or Production live Judge-to-verifier gate has been run on it.
- Human participant invitations: `0`; participants: `0`; sessions: `0`.
- Independent validator invitations: `0`; validators: `0`.
- One Discord moderator-routing request has been sent; permission to post a
  participant invitation has not been received.
- No final release tag exists for this candidate.

Until those facts change, describe the candidate as **locally verified and
independently reproducible by design**, not publicly released, user-validated,
independently validated, or audited.

## Release order

1. Obtain explicit authorization for push and Preview deployment.
2. Confirm Preview `/api/build` matches the exact candidate commit.
3. Run the documented zero-retry Preview gate on both the intended Shannon
   entry and the preserved mainnet regression path.
4. Close the human-pilot window with actual results or an explicit zero-result.
5. Create a new immutable release tag; never move v10.
6. Deploy the identical commit to Production and repeat the live gate.
7. Obtain qualified validator records if available, or disclose zero.
8. Freeze public copy and only then begin the final video block.
