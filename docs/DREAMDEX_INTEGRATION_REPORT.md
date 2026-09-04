# dreamDEX Integration Report

Implementation snapshot: 4 September 2026.

Status: **This report spans the deployed read-only v8 build and the unreleased
read-only v9 candidate. Sections that describe the public proof verifier,
Ed25519 lock receipt, v2 analytics, or v9 sharing refer to the candidate until
the atomic v9 release is complete.**

This document also serves as the hackathon submission's optional SDK and documentation feedback report.

## Judge summary

- The deployed v8 app and the v9 candidate prefer active BTC 5-minute Event Contracts, fall back to 15 minutes when required, and read finalized settlement data from dreamDEX on Somnia mainnet.
- The active prediction cards show live UP/DOWN implied odds from the market-ID-keyed dreamDEX CLOB through the official `@somnia-chain/markets-sdk` package.
- The Judge Replay locks the player's direction before a balanced, cryptographically random finalized market is selected.
- The selected market and direction are authenticated inside an AES-256-GCM seal; the browser receives no identifying market metadata before reveal.
- The reveal route deterministically replays the bounded combat transcript and rejects the request unless both the guard and boss were defeated and the player survived.
- Only after combat verification does the server re-fetch the exact committed market, then independently reads and decodes its finalized BinarySettlement record at an RPC verification snapshot block.
- The server derives the winner from the direct payout vector and fails closed unless its market, pool, collateral, token, nonce, void, and outcome bindings agree. The browser then independently re-fetches the exact block and both raw calls from Somnia RPC, requires byte equality, ABI-decodes the results, validates the exposed proof bindings, and recomputes both cryptographic digests.
- No wallet, approval, order or private key is required to reproduce the judge path.

## Integration surface

Market Dungeon uses the official dreamDEX Markets SDK plus two server-side data sources. After reveal, the browser also reads the public Somnia RPC directly to reproduce the server proof:

| Source | Endpoint | Actual use |
| --- | --- | --- |
| dreamDEX GraphQL indexer | `https://prd.smk.somnia.host/v1/graphql` | Active-market discovery, finalized replay discovery, market metadata, indexed settlement, opening reference lookup |
| dreamDEX Markets SDK | `@somnia-chain/markets-sdk` `0.29.0` | Recycle-safe top-of-book lookup keyed by the exact active `marketId` |
| Somnia mainnet JSON-RPC | `https://api.infra.mainnet.somnia.network` | Server: chain verification, RPC verification snapshot block number/hash, pool parameters, and EIP-1898 hash-pinned `BinaryModule.markets` / `BinarySettlement.getSettlement` reads. Browser after reveal: independent block-by-hash and canonical hash-pinned call re-fetch with exact raw-result comparison. |

The browser never calls the dreamDEX indexer or SDK upstream directly. It calls only the public Somnia RPC after reveal to reproduce the already exposed read-only proof. No wallet connection, wallet signature request, approval, order, redemption, or transaction write is implemented. The v9 candidate's Ed25519 signature is a server-authenticated read-only lock receipt; it cannot authorize a wallet or blockchain transaction.

## GraphQL queries and fields

### Active BTC 5-minute discovery with 15-minute fallback

`ActiveBtcPreferred` filters `Market` by:

- `marketType = BINARY`
- `asset = BTC`
- `intervalSec in [300, 900]`
- `tradingStart <= now`
- `expiry > now`
- `clobStatus in [Listed, Trading]`

It requests up to 16 markets ordered by ascending expiry. Any active 300-second candidate wins, with the freshest eligible window selected if more than one appears during a transition. If no 300-second market is active, the server selects the 900-second candidate closest to six minutes from entry. Requested fields are:

`marketId`, `marketAddress`, `poolAddress`, `collateral`, `asset`, `question`, `strike`, `tradingStart`, `expiry`, `clobStatus` (aliased to `status`), `intervalSec`, `quoteDecimals`, `yesTokenId`, `noTokenId`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, `voided`, `finalized`, `lastPrice`, and `tradeCount`.

If `strike` is zero, `MarketReferenceLink.referenceQuestionId` is resolved and passed to `OracleAnswer.id`; `OracleAnswer.numericValue` becomes the opening strike. The UI currently formats the raw strike by dividing by 100.

### Live CLOB implied odds

For the exact active `marketId`, the server calls the official SDK client's `getBookTops` method. This query is keyed by market identity rather than pool address, so resting orders from a recycled pool's previous market cannot bleed into the displayed odds.

- With both sides present, UP is the midpoint between the best YES bid and best YES ask.
- With only one side present, that resting quote is shown as the best available order-book signal.
- If the book is empty and the market has trades, the most recent traded price is used and labeled as such.
- DOWN is the complement of UP. Malformed, out-of-range, or crossed data fails closed to an unavailable state.

The API returns the best bid, best ask, spread, source, observation time, and SDK identity alongside the market. The interface labels the values as implied CLOB odds and explicitly states that they are a read-only snapshot, not a guarantee or an order placed by the game.

### Finalized Judge Replay discovery

`SealedReplayCandidates` requests independent 300- and 900-second pools with identical integrity rules: `marketType = BINARY`, `asset = BTC`, the canonical BTC close question, `clobStatus = Finalized`, `finalized = true`, `voided = false`, `tradeCount > 0`, `winningOutcome in [0, 1]`, and an expiry between now and seven days ago. Required provenance fields must also be present. Each pool requests market ID, outcome, market type, asset, interval, question, trading start, expiry, status, trade count, last trade time, operator ID, venue ID, context, oracle question ID, creator, and creation transaction; orders by descending expiry; and caps the candidate set at 64. The server independently validates each row, uses the 5-minute pool only when both outcomes are represented, otherwise requires a balanced 15-minute pool, then chooses an outcome bucket and market with cryptographic randomness.

At reveal, `ReplaySettlement` fetches the exact committed `Market_by_pk` and requests the full metadata set plus `resolvedAtTimestamp`. The server rejects the reveal unless every sealed provenance field above, plus `finalized`, `voided`, and `winningOutcome`, still matches exactly. This indexed record remains a metadata and consistency input rather than the sole source of truth for the applied winner; the direct contract read below must also agree.

The lightweight live-settlement lookup requests only `marketId`, `clobStatus`, `finalized`, `voided`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, and `resolvedAtTimestamp`.

## Chain 5031 and RPC verification

Every fully hydrated active or revealed market calls `eth_chainId` and rejects any result other than decimal `5031`. It also performs a read-only `eth_call` against the indexed `poolAddress` with selector `0x0765910c`; the return data is decoded as `tickSize`, `minQuantity`, and `lotSize`.

For every terminal market—indexed as either `finalized = true` or `voided = true`—settlement verification additionally:

1. snapshots `eth_blockNumber` and resolves the same block's 32-byte hash;
2. creates the EIP-1898 reference `{ blockHash, requireCanonical: true }` and calls `markets(bytes32 marketId)` on mainnet BinaryModule `0x3ecC694Cef705358864a646142ac17A90E29e388` against that exact canonical hash;
3. binds the returned oracle question ID, origin operator, origin venue, creator, trading window, market, pool, collateral, YES ID, and NO ID to the indexed record and requires a binary consecutive token pair;
4. derives `marketKey = yesId >> 8`, plus the pool and nonce encoded inside `yesId`;
5. calls `getSettlement(uint256 marketKey)` on BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` with the identical EIP-1898 reference;
6. requires a finalized record with matching pool, collateral and nonce, then derives UP/DOWN from the unique maximum in `payoutNumerators`; and
7. fails closed unless the direct void state, payout vector, denominator and derived winner agree with the indexer and, for Judge Replay, the encrypted commitment.

The live settlement endpoint never returns a terminal result for application unless this direct proof succeeds. The browser then independently repeats the proof before it applies a void refund path, prediction win/loss, gold, death, victory, or tier progression. A pending non-terminal market may still be returned without a settlement proof because it cannot yet change game state.

The v9 candidate's revealed proof includes the RPC verification snapshot block number/hash, canonical EIP-1898 reference, deployments, market origin and trading window, market key, IDs, payout vector, and the raw target/block-reference/calldata/result for both `eth_call`s. The UI exposes working block and contract links and a copyable market ID. Social sharing is intentionally separated from technical verification: a client-generated 1200×675 PNG summarizes either two-encounter Judge replay progress or the full expedition's actual room/tier, plus enemies, gold, prediction and verification status, for native sharing or a pre-filled X post. Copy/download JSON actions retain the server-authenticated lock receipt, complete canonical commitment input, combat actions/digest, and reproducible RPC requests/results. The card is rendered locally and does not publish or persist run data. The JSON proves contract state at the recorded snapshot block; it does not claim that this is the block containing the transaction that originally finalized that state.

## Metadata, settlement, and combat boundaries

- Active-market metadata is public immediately and drives the full live expedition.
- Judge Replay returns no selected replay market identifier, address, strike, expiry, or outcome before reveal. Those values are authenticated inside an AES-256-GCM seal under a server-only environment key.
- The v9 candidate's start route also signs an Ed25519 receipt over the salted commitment, locked direction, and lock-window timestamps. The browser verifies that receipt against the fixed same-origin public-key endpoint before accepting the lock, and reveal must return the byte-identical receipt. This prevents a client from fabricating a post-hoc portable proof, but it is a Market Dungeon server authentication boundary—not an external timestamp, decentralized attestation, or proof of server honesty.
- The version-2 pre-reveal SHA-256 commitment binds market ID, binary/BTC template, interval, canonical question, trading window, finalized status, trade count, last trade, operator, venue, context, oracle question ID, creator, creation transaction, recorded outcome, locked direction, independent `gameSeed`, replay timestamps, and a hidden random salt.
- At reveal, the server replays the bounded `Attack`, `Storm`, and `Potion` transcript from the sealed `gameSeed`. The request is rejected unless both the guard and boss are defeated and the player survives.
- Only after combat verification does the server re-fetch the committed metadata and execute both module and settlement reads against the same canonical EIP-1898 block-hash reference. The browser independently fetches the block by hash and repeats both canonical hash-pinned calls from Somnia RPC, requires an exact raw-result match, ABI-decodes both responses, validates the direct proof bindings, and recomputes both the combat transcript digest and replay commitment before applying the payout-derived result.

The stateless combat check proves that the submitted action sequence is valid under the published deterministic rules. Because the seed is public, it is not proof of human input or elapsed play time.

## Cache and security limits

- Replay responses use `Cache-Control: private, no-store, max-age=0`; active market and settlement responses use `no-store`.
- Global response headers set a deny-by-default CSP, block framing and MIME sniffing, restrict referrers and unused browser capabilities, and enable HSTS in production. Client connections are limited to the same origin and the fixed Somnia mainnet RPC used for the independent browser proof. Next.js hydration and the UI's dynamic progress styles require the documented `unsafe-inline` script/style allowances; development alone additionally permits eval, WebSocket connections and Vercel's analytics debug-script origin for the local toolchain.
- Reveal ingress is capped at 8 KiB measured as UTF-8 bytes rather than JavaScript characters. Oversize `Content-Length` is rejected without reading the request stream; an absent or understated length falls back to incremental reads that cancel the stream as soon as the cap is crossed.
- Judge Replay candidate rows have a 15-second server-side cache with in-flight request sharing. The selected market remains random per start and is never exposed before reveal. The browser refreshes active discovery and CLOB odds every 15 seconds and polls live settlement every five seconds after expiry.
- The SDK 0.29 top-of-book read uses its own aborting GraphQL timeout. The former outer four-second `Promise.race` was removed because it returned without cancelling the underlying SDK request. If the SDK read fails, market loading and gameplay continue using the existing verified metadata path; the odds module falls back to a valid last trade or displays an unavailable state.
- Application-level client guards allow six replay starts and twelve reveal attempts per fixed one-minute window. They derive the client identity from platform forwarding headers, return `429`, `Retry-After`, and `RateLimit-*` metadata, and run before any upstream settlement read.
- A successfully verified combat transcript reserves its replay commitment before settlement verification starts. Concurrent identical reveals share one promise, later identical reveals use the same bounded result, and a different transcript for that commitment fails with `409`. Transient `503` results are shared only for their short retry window; successful or definitive results remain deduplicated until seal expiry.
- Server-side direct indexer and RPC reads use five-second `AbortSignal.timeout` budgets and at most one retry. The independent browser Somnia proof calls use an eight-second timeout. Retries are limited to idempotent transport failures and retryable HTTP statuses; query errors, invalid JSON, RPC errors, and proof mismatches fail closed without retry.
- Judge start accepts one `UP`/`DOWN` field and at most 128 request bytes.
- Judge reveal accepts only `seal` plus a structured action array, caps the body at 8 KiB, the seal at 4,096 characters, and the transcript at 64 steps, and rejects extra fields.
- Replay seals have a 15-second minimum hold and a 30-minute lifetime. Eligible markets have an explicit maximum age of seven days in both interval pools. The browser mirrors the hold with a visible countdown and disabled reveal action, while the server remains authoritative. Environment-bound AES-GCM authentication, strict full-provenance claim validation, balanced outcome pools, direct settlement re-validation, and deterministic combat replay all fail closed.
- The lock-receipt Ed25519 seed is domain-separated from the replay encryption key, and the public endpoint exposes only the active environment key. Rotating `JUDGE_REPLAY_SEAL_KEY` therefore changes the receipt key as well; without a retained historical-key archive, an older exported proof is `NOT PROVABLE` because the matching trusted key is unavailable. `FAIL` is reserved for an invalid signature under a matching trusted key or another demonstrated contradiction.
- Vercel Web Analytics records a closed `/funnel/v2/...` lifecycle as manual pageviews: entry source, accepted seal, first reveal attempt, verified completion with a coarse duration bucket, definitive verification failure, terminal `NOT PROVABLE`, sharing, challenge activity, and Continue-on-dreamDEX intent. Labels contain only enumerated categories; wallet addresses, market IDs, commitments, proofs, transcripts, exact timings, and arbitrary query text are excluded. WebDriver sessions and the exact `automation=1` smoke marker are suppressed. The frozen definitions and raw-count formulas are in [Clean pilot measurement v2](PILOT_MEASUREMENT_V2.md).
- The first production baseline (27 August–3 September 2026) contains 17 legacy start, 14 legacy verified-completion and 2 legacy Continue pageviews. Ten interval-classified completions used 5m; four earlier completions predate interval segmentation. Because the window spans a schema change and includes earlier smoke traffic, its 82% completion/start, 14% Continue/completion and 2.8 starts-per-start-route-visitor ratios are directional only and must never be combined with v2. The clean-v2 evaluation requires raw UTC counts and a separately established recruited-human denominator before any human-conversion claim.
- Rate and deduplication state is intentionally bounded in memory and therefore applies per warm application instance. Deployment-wide enforcement across independently scaled instances still depends on a Vercel Firewall rule or shared durable rate-limit store; this is an infrastructure hardening option, not a hidden guarantee in the application code.

## Documentation gaps

The implementation would be easier to audit against upstream contracts if official, versioned references covered:

1. the GraphQL schema and the lifecycle semantics of `clobStatus`, `finalized`, `voided`, and `resolvedAtTimestamp`;
2. the canonical meaning of outcome values `0` and `1`, including their YES/NO and UP/DOWN mapping;
3. units and decimal scaling for `strike`, `OracleAnswer.numericValue`, quantities, payouts, prices, and timestamps;
4. the ABI source for selector `0x0765910c` and the guaranteed return order of pool parameters;
5. stable contract addresses by deployment, indexer/RPC rate limits, expected error formats, and finality/reorg behavior; and
6. a canonical event/transaction path from `marketId` or `marketKey` to the transaction and block that originally finalized the settlement.

As of 2 September 2026, the live trading interface exposes a BTC 5-minute interval while the public trading overview still describes only 15-minute and 1-hour rolling windows. A versioned availability table would help integrators discover new intervals without relying on UI inspection.

## Recommended improvements

- Publish a versioned GraphQL schema with active and finalized market examples.
- Publish deployment manifests and verified ABIs for the market, settlement, and pool contracts.
- Document outcome mapping, units, settlement lifecycle, and indexer consistency guarantees explicitly.
- Keep the documented interval matrix synchronized with the live Event Contracts selector and announce newly available windows through a machine-readable source.
- Add official timeout, retry, cache, and rate-limit guidance for judge-facing applications.
- Expose the settlement transaction hash and finalized block in indexed data, and document the canonical event procedure, so clients can link the directly verified state to the transaction that created it.

These recommendations do not require wallet or trading functionality and preserve Market Dungeon's current read-only safety boundary.
