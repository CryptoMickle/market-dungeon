# dreamDEX Integration Report

Implementation snapshot: 2 September 2026. This report describes the code in this repository; it does not claim capabilities outside the deployed read-only build.

This document also serves as the hackathon submission's optional SDK and documentation feedback report.

## Judge summary

- The production app prefers active BTC 5-minute Event Contracts, falls back to 15 minutes when required, and reads finalized settlement data from dreamDEX on Somnia mainnet.
- The active prediction cards show live UP/DOWN implied odds from the market-ID-keyed dreamDEX CLOB through the official `@somnia-chain/markets-sdk` package.
- The Judge Replay locks the player's direction before a balanced, cryptographically random finalized market is selected.
- The selected market and direction are authenticated inside an AES-256-GCM seal; the browser receives no identifying market metadata before reveal.
- The reveal route deterministically replays the bounded combat transcript and rejects the request unless both the guard and boss were defeated and the player survived.
- Only after combat verification does the server re-fetch the exact committed market, then independently reads and decodes its finalized BinarySettlement record at a fixed Somnia block.
- The server derives the winner from the direct payout vector and fails closed unless its market, pool, collateral, token, nonce, void, and outcome bindings agree; the browser then validates the exposed proof bindings and recomputes both cryptographic digests.
- No wallet, approval, order or private key is required to reproduce the judge path.

## Integration surface

Market Dungeon uses the official dreamDEX Markets SDK plus two server-side data sources:

| Source | Endpoint | Actual use |
| --- | --- | --- |
| dreamDEX GraphQL indexer | `https://prd.smk.somnia.host/v1/graphql` | Active-market discovery, finalized replay discovery, market metadata, indexed settlement, opening reference lookup |
| dreamDEX Markets SDK | `@somnia-chain/markets-sdk` `^0.25.0` | Recycle-safe top-of-book lookup keyed by the exact active `marketId` |
| Somnia mainnet JSON-RPC | `https://api.infra.mainnet.somnia.network` | Chain verification, fixed block number/hash, pool parameters, `BinaryModule.markets`, and `BinarySettlement.getSettlement` |

No browser code calls either upstream directly. No wallet, approval, order, redemption, signature, or other write is implemented.

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

For the exact active `marketId`, the server calls the official SDK's `getBookTops` helper. This query is keyed by market identity rather than pool address, so resting orders from a recycled pool's previous market cannot bleed into the displayed odds.

- With both sides present, UP is the midpoint between the best YES bid and best YES ask.
- With only one side present, that resting quote is shown as the best available order-book signal.
- If the book is empty and the market has trades, the most recent traded price is used and labeled as such.
- DOWN is the complement of UP. Malformed, out-of-range, or crossed data fails closed to an unavailable state.

The API returns the best bid, best ask, spread, source, observation time, and SDK identity alongside the market. The interface labels the values as implied CLOB odds and explicitly states that they are a read-only snapshot, not a guarantee or an order placed by the game.

### Finalized Judge Replay discovery

`SealedReplayCandidates` requests two independent pools. The preferred pool filters binary BTC 300-second markets by `finalized = true`, `voided = false`, `tradeCount > 0`, and `winningOutcome in [0, 1]`. The fallback applies the original finalized/non-voided rules to 900-second markets. Each pool requests `marketId` and `winningOutcome`, orders by descending expiry, and caps the candidate set at 64. The server uses the 5-minute pool only when both outcomes are represented; otherwise it requires a balanced 15-minute pool. It then chooses an outcome bucket and market with cryptographic randomness.

At reveal, `ReplaySettlement` fetches the exact committed `Market_by_pk` and requests the full metadata set plus `resolvedAtTimestamp`. This indexed record is a metadata and consistency input, not the sole source of truth for the applied winner. The server rejects the reveal if its preliminary `finalized`, `voided`, or `winningOutcome` fields no longer match the encrypted commitment, then requires the direct contract read below to agree.

The lightweight live-settlement lookup requests only `marketId`, `clobStatus`, `finalized`, `voided`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, and `resolvedAtTimestamp`.

## Chain 5031 and RPC verification

Every fully hydrated active or revealed market calls `eth_chainId` and rejects any result other than decimal `5031`. It also performs a read-only `eth_call` against the indexed `poolAddress` with selector `0x0765910c`; the return data is decoded as `tickSize`, `minQuantity`, and `lotSize`.

For every finalized market, settlement verification additionally:

1. snapshots `eth_blockNumber` and resolves the same block's 32-byte hash;
2. calls `markets(bytes32 marketId)` on mainnet BinaryModule `0x3ecC694Cef705358864a646142ac17A90E29e388` at that block;
3. binds the returned market, pool, collateral, YES ID, and NO ID to the indexed record and requires a binary consecutive token pair;
4. derives `marketKey = yesId >> 8`, plus the pool and nonce encoded inside `yesId`;
5. calls `getSettlement(uint256 marketKey)` on BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` at the identical block;
6. requires a finalized record with matching pool, collateral and nonce, then derives UP/DOWN from the unique maximum in `payoutNumerators`; and
7. fails closed unless the direct void state, payout vector, denominator and derived winner agree with the indexer and encrypted replay commitment.

The revealed proof includes the block number/hash, deployments, market key, IDs, payout vector, and the raw target/block-tag/calldata/result for both `eth_call`s. The UI exposes explorer links and the reproducible call inputs. This proves contract state at the recorded block; it does not claim the transaction hash that originally finalized that state.

## Metadata, settlement, and combat boundaries

- Active-market metadata is public immediately and drives the full live expedition.
- Judge Replay returns no selected-market identifier, address, strike, expiry, or outcome before reveal. Those values are authenticated inside an AES-256-GCM seal under a server-only environment key.
- The pre-reveal SHA-256 commitment binds market ID, recorded outcome, locked direction, independent `gameSeed`, timestamps, and a hidden random salt.
- At reveal, the server replays the bounded `Attack`, `Storm`, and `Potion` transcript from the sealed `gameSeed`. The request is rejected unless both the guard and boss are defeated and the player survives.
- Only after combat verification does the server re-fetch the committed metadata and execute the fixed-block module and settlement reads. The browser validates the direct proof bindings and recomputes both the combat transcript digest and replay commitment before applying the payout-derived result.

The stateless combat check proves that the submitted action sequence is valid under the published deterministic rules. Because the seed is public, it is not proof of human input or elapsed play time.

## Cache and security limits

- Replay responses use `Cache-Control: private, no-store, max-age=0`; active market and settlement responses use `no-store`.
- There is no application-level response cache. The browser refreshes active discovery and CLOB odds every 15 seconds and polls live settlement every five seconds after expiry.
- The SDK top-of-book read has an application-level four-second budget. If it fails, market loading and gameplay continue using the existing verified metadata path; the odds module falls back to a valid last trade or displays an unavailable state.
- Judge start accepts one `UP`/`DOWN` field and at most 128 request bytes.
- Judge reveal accepts only `seal` plus a structured action array, caps the body at 8 KiB, the seal at 4,096 characters, and the transcript at 64 steps, and rejects extra fields.
- Replay seals have a 15-second minimum hold and a 30-minute lifetime. The browser mirrors the hold with a visible countdown and disabled reveal action, while the server remains authoritative. Environment-bound AES-GCM authentication, strict claim validation, balanced outcome pools, direct settlement re-validation, and deterministic combat replay all fail closed.
- Vercel Web Analytics records three anonymous funnel checkpoints as manual pageviews: Judge Demo started, verified Judge Demo completed, and Continue on dreamDEX clicked. Stable `/funnel/...` paths encode only interval, mode, direction, and result so 5m adoption remains visible on Vercel Hobby, where custom events are unavailable; wallet addresses, market IDs, commitments, and combat transcripts are excluded.
- Broader retry, rate-limit handling, and circuit breaking are not yet explicit. Availability therefore depends directly on the public indexer, RPC, and hosting platform limits.

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
