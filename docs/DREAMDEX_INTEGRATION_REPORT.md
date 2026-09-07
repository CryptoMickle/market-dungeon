# dreamDEX Integration Report

Released implementation snapshot: 7 September 2026, v11. Local candidate addendum: active-market Full Expedition v3.

Status: **The published baseline is `hackathon-submission-2026-v11`, commit
`f30b9a56532eb6e3147e7ae8473242545635d0ef`. It includes read-only mainnet
and fixed Shannon Testnet Judge/verifier routes. The restored full-expedition,
full-run settlement routes and newer mobile-sharing source changes are local,
not part of v11.** See [Full Expedition rules](FULL_EXPEDITION_RULES.md) and
[release and recording status](RELEASE_STATUS_2026-09-07.md).

Shannon uses chain `50312`, `https://dev.smk.somnia.host/v1/graphql`,
`https://api.infra.testnet.somnia.network`, the Shannon explorer, collateral
`0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`, operator `2`, and the
canonical venue. Versioned commitments and proofs bind this separate profile.
The recorded v11 Preview and Production gates each passed 20 mainnet and
20 Shannon round-trips with zero retries. No completed qualified human session
or independent non-team validation is established by those automated gates.
See [Shannon release record](SHANNON_JUDGE_RELEASE_CANDIDATE.md).

This document also serves as the hackathon submission's optional SDK and documentation feedback report.

## Judge summary

- The released v11 surface includes active BTC market discovery and official-SDK CLOB context. The local full expedition now requires an active BTC five-minute market with a valid opening reference before every tier and CURSED rematch.
- The exact market and direction remain bound to the browser-local run while its interval proceeds during combat. There is no silent 15-minute or historical fallback in Full Expedition.
- The Judge Replay locks the player's direction before a balanced, cryptographically random finalized market is selected.
- The selected market and direction are authenticated inside an AES-256-GCM seal; the browser receives no identifying market metadata before reveal.
- The reveal route deterministically replays the bounded combat transcript and rejects the request unless both the guard and boss were defeated and the player survived.
- Only after combat verification does the server read the fixed BinaryModule and BinarySettlement contracts at one canonical RPC snapshot block. Judge reveal makes no indexer request after lock.
- The server derives the winner from the direct payout vector and fails closed unless its market, pool, collateral, token, nonce, void, and outcome bindings agree. The browser then independently re-fetches the exact block and both raw calls from Somnia RPC, requires byte equality, ABI-decodes the results, validates the exposed proof bindings, and recomputes both cryptographic digests.
- No wallet, approval, order or private key is required to reproduce the judge path.

## Integration surface

The detailed discovery and live-market paths below describe **mainnet**.
Shannon exposes historical finalized Judge Replay only; use the fixed-profile
record above for its endpoints and versioned proof format. **Continue on
dreamDEX** exists on the mainnet result and opens
`https://app.dreamdex.io/event-contracts/WBTC:USDso/5m` (or `15m` for the selected
interval). It does not open Delveworn. Shannon has no such continuation action.


Market Dungeon uses the official dreamDEX Markets SDK plus two server-side data sources. After reveal, the browser also reads the public Somnia RPC directly to reproduce the server proof:

| Source | Endpoint | Actual use |
| --- | --- | --- |
| dreamDEX GraphQL indexer | `https://prd.smk.somnia.host/v1/graphql` | Active-market discovery, finalized replay discovery, market metadata, indexed settlement, opening reference lookup |
| dreamDEX Markets SDK | `@somnia-chain/markets-sdk` `0.29.0` | Recycle-safe top-of-book lookup keyed by the exact active `marketId` |
| Somnia mainnet JSON-RPC | `https://api.infra.mainnet.somnia.network` | Server: chain verification, RPC verification snapshot block number/hash, pool parameters, and EIP-1898 hash-pinned `BinaryModule.markets` / `BinarySettlement.getSettlement` reads. Browser after reveal: independent block-by-hash and canonical hash-pinned call re-fetch with exact raw-result comparison. |

The browser never calls the dreamDEX indexer or SDK upstream directly. It calls only the public Somnia RPC after reveal to reproduce the already exposed read-only proof. No wallet connection, wallet signature request, approval, order, redemption, or transaction write is implemented. The build's Ed25519 signature is a server-authenticated read-only lock receipt; it cannot authorize a wallet or blockchain transaction.

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

At reveal, the authenticated seal supplies the committed market ID and metadata without a new `ReplaySettlement` or opening-price request. The fixed BinaryModule supplies market/pool/collateral/token bindings; oracle question, operator, venue, creator and trading window must match the seal. BinarySettlement must be finalized, non-void and match the committed outcome and the module bindings. Market text, trade history, context and creation transaction remain metadata authenticated at lock time, not newly fetched or independently proved onchain. The historical opening price is explicitly `UNAVAILABLE`, never a fabricated zero. The v2 mainnet and v3 Shannon seal, receipt, commitment and portable-proof formats are unchanged.

The lightweight live-settlement lookup requests only `marketId`, `clobStatus`, `finalized`, `voided`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, and `resolvedAtTimestamp`.

### Active full-expedition settlement adapter — local candidate

Full Expedition calls `/api/market?interval=300` before Rooms 1, 11, 21 and 31
and before every CURSED rematch. The explicit query accepts only 300 seconds;
if no active BTC five-minute market or valid opening reference is available,
the UI fails closed with retry and a link to Judge Demo. The selected market ID,
opening reference, trading window and direction are persisted locally with the
run. This is deliberately described as a local gameplay lock, not the
server-authenticated Judge receipt.

Combat proceeds while the market is live. After the boss falls, the UI waits
only until the recorded expiry and fetches the same ID through
`/api/market?marketId=…`. BLESSED, CURSED or VOID is applied only when a strict
direct settlement proof matches that market and the browser independently
re-fetches the canonical block plus both exact Somnia contract results. Pending
or unavailable proof leaves the boss down and the run frozen for safe retry.
The retained `/api/full-run/replay/*` source is a pre-release historical
adapter and is not called by the active Full Expedition.

## Chain 5031 and RPC verification

Mainnet hydration verifies chain ID `5031`; the fixed Shannon Judge profile requires `50312`. Active-market hydration also reads pool parameters (`tickSize`, `minQuantity`, `lotSize`) using selector `0x0765910c`. Judge reveal does not need those parameters: its successful uncached server path uses exactly five RPC reads (chain ID, block number, block header, module, settlement) and zero indexer reads.

For every terminal market—indexed as either `finalized = true` or `voided = true`—settlement verification additionally:

1. snapshots `eth_blockNumber` and resolves the same block's 32-byte hash;
2. creates the EIP-1898 reference `{ blockHash, requireCanonical: true }` and calls `markets(bytes32 marketId)` on mainnet BinaryModule `0x3ecC694Cef705358864a646142ac17A90E29e388` against that exact canonical hash;
3. requires a binary consecutive token pair and validates module bindings against the indexed record for live markets; for Judge reveal, derives market/pool/collateral/token bindings from the fixed module and compares oracle question, operator, venue, creator and trading window to the authenticated seal;
4. derives `marketKey = yesId >> 8`, plus the pool and nonce encoded inside `yesId`;
5. calls `getSettlement(uint256 marketKey)` on BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` with the identical EIP-1898 reference;
6. requires a finalized record with matching pool, collateral and nonce, then derives UP/DOWN from the unique maximum in `payoutNumerators`; and
7. fails closed unless the direct void state, payout vector, denominator and derived winner are valid and agree with the indexed record for live markets or the authenticated committed outcome for Judge Replay.

The live settlement endpoint never returns a terminal result for application unless this direct proof succeeds. The browser then independently repeats the proof before it applies a void refund path, prediction win/loss, gold, death, victory, or tier progression. A pending non-terminal market may still be returned without a settlement proof because it cannot yet change game state.

The build's revealed proof includes the RPC verification snapshot block number/hash, canonical EIP-1898 reference, deployments, market origin and trading window, market key, IDs, payout vector, and the raw target/block-reference/calldata/result for both `eth_call`s. The UI exposes working block and contract links and a copyable market ID. Social sharing is intentionally separated from technical verification: a client-generated 1200×675 PNG summarizes either two-encounter Judge replay progress or the full expedition's actual room/tier, plus enemies, gold, prediction and verification status, for supported native image sharing or manual attachment to an X post. In the newer local implementation, the PNG is prepared before the share gesture; copying text, sharing/saving the image, downloading to Files, and opening X are separate explicit actions. The X link contains text and a challenge URL, not the PNG. An iPhone download is not a Photos save, and actual share targets depend on browser/OS/app support. Physical iPhone acceptance remains pending; this change is not in v11. Copy/download JSON actions retain the server-authenticated lock receipt, complete canonical commitment input, combat actions/digest, and reproducible RPC requests/results. The card is rendered locally and does not publish or persist run data. The JSON proves contract state at the recorded snapshot block; it does not claim that this is the block containing the transaction that originally finalized that state.

## Metadata, settlement, and combat boundaries

- Active-market metadata drives the local Full Expedition. The player sees the opening reference and remaining five-minute interval before choosing a tier omen.
- The exact selected market and direction are bound locally through the tier. A different active five-minute market is required after every CURSED result.
- Judge Replay returns no selected replay market identifier, address, strike, expiry, or outcome before reveal. Those values are authenticated inside an AES-256-GCM seal under a server-only environment key.
- The start route also signs an Ed25519 receipt over the salted commitment, locked direction, and lock-window timestamps. The browser verifies that receipt against the fixed same-origin public-key endpoint before accepting the lock, and reveal must return the byte-identical receipt. This prevents a client from fabricating a post-hoc portable proof, but it is a Market Dungeon server authentication boundary—not an external timestamp, decentralized attestation, or proof of server honesty.
- The version-2 pre-reveal SHA-256 commitment binds market ID, binary/BTC template, interval, canonical question, trading window, finalized status, trade count, last trade, operator, venue, context, oracle question ID, creator, creation transaction, recorded outcome, locked direction, independent `gameSeed`, replay timestamps, and a hidden random salt.
- At reveal, the server replays the bounded `Attack`, `Storm`, and `Potion` transcript from the sealed `gameSeed`. The request is rejected unless both the guard and boss are defeated and the player survives.
- Only after combat verification does the server execute both module and settlement reads against the same canonical EIP-1898 block-hash reference, using authenticated lock-time metadata without contacting the indexer. The browser independently fetches the block by hash and repeats both canonical hash-pinned calls from Somnia RPC, requires an exact raw-result match, ABI-decodes both responses, validates the direct proof bindings, and recomputes both the combat transcript digest and replay commitment before applying the payout-derived result.

The stateless combat check proves that the submitted action sequence is valid under the published deterministic rules. Because the seed is public, it is not proof of human input or elapsed play time.

## Cache and security limits

- Replay responses use `Cache-Control: private, no-store, max-age=0`; active market and settlement responses use `no-store`.
- Global response headers set a deny-by-default CSP, block framing and MIME sniffing, restrict referrers and unused browser capabilities, and enable HSTS in production. Client connections are limited to the same origin and the fixed Somnia mainnet and Shannon RPCs used for the independent browser proof. Next.js hydration and the UI's dynamic progress styles require the documented `unsafe-inline` script/style allowances; development alone additionally permits eval, WebSocket connections and Vercel's analytics debug-script origin for the local toolchain.
- Reveal ingress is capped at 8 KiB measured as UTF-8 bytes rather than JavaScript characters. Oversize `Content-Length` is rejected without reading the request stream; an absent or understated length falls back to incremental reads that cancel the stream as soon as the cap is crossed.
- Judge Replay candidate rows have a 15-second server-side cache with in-flight request sharing. The selected market remains random per start and is never exposed before reveal. The browser refreshes active discovery and CLOB odds every 15 seconds and polls live settlement every five seconds after expiry.
- The SDK 0.29 top-of-book read uses its own aborting GraphQL timeout. The former outer four-second `Promise.race` was removed because it returned without cancelling the underlying SDK request. If the SDK read fails, market loading and gameplay continue using the existing verified metadata path; the odds module falls back to a valid last trade or displays an unavailable state.
- Application-level client guards allow six replay starts and twelve reveal attempts per fixed one-minute window. They derive the client identity from platform forwarding headers, return `429`, `Retry-After`, and `RateLimit-*` metadata, and run before any upstream settlement read.
- A successfully verified combat transcript reserves its replay commitment before settlement verification starts. Concurrent identical reveals share one promise, later identical reveals use the same bounded result, and a different transcript for that commitment fails with `409`. Transient `503` results are shared only for their short retry window; successful or definitive results remain deduplicated until seal expiry.
- Server-side direct indexer and RPC reads use five-second `AbortSignal.timeout` budgets and at most one retry. The independent browser Somnia proof calls use an eight-second timeout. Retries are limited to idempotent transport failures and retryable HTTP statuses; query errors, invalid JSON, RPC errors, and proof mismatches fail closed without retry.
- Judge start accepts one `UP`/`DOWN` field and at most 128 request bytes. The separately namespaced full-run start may additionally accept at most 40 unique canonical excluded market IDs and caps the request at 3,072 characters.
- Full-run reveal accepts only one opaque seal, caps the body at 4 KiB, and returns verified market settlement without a Judge combat-proof claim.
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
