# dreamDEX Integration Report

Implementation snapshot: 27 August 2026. This report describes the code in this repository; it does not claim capabilities outside the deployed read-only build.

## Integration surface

Market Dungeon uses two server-side data sources:

| Source | Endpoint | Actual use |
| --- | --- | --- |
| dreamDEX GraphQL indexer | `https://prd.smk.somnia.host/v1/graphql` | Active-market discovery, finalized replay discovery, market metadata, indexed settlement, opening reference lookup |
| Somnia mainnet JSON-RPC | `https://api.infra.mainnet.somnia.network` | `eth_chainId` verification and read-only `eth_call` for pool parameters |

No browser code calls either upstream directly. No wallet, approval, order, redemption, signature, or other write is implemented.

## GraphQL queries and fields

### Active BTC 15-minute discovery

`ActiveBtc15m` filters `Market` by:

- `marketType = BINARY`
- `asset = BTC`
- `intervalSec = 900`
- `tradingStart <= now`
- `expiry > now`
- `clobStatus in [Listed, Trading]`

It requests up to eight markets ordered by ascending expiry, then selects the expiry closest to six minutes from entry. Requested fields are:

`marketId`, `marketAddress`, `poolAddress`, `collateral`, `asset`, `question`, `strike`, `tradingStart`, `expiry`, `clobStatus` (aliased to `status`), `intervalSec`, `quoteDecimals`, `yesTokenId`, `noTokenId`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, `voided`, `finalized`, and `lastPrice`.

If `strike` is zero, `MarketReferenceLink.referenceQuestionId` is resolved and passed to `OracleAnswer.id`; `OracleAnswer.numericValue` becomes the opening strike. The UI currently formats the raw strike by dividing by 100.

### Finalized Judge Replay discovery

`SealedReplayCandidates` filters binary BTC 900-second markets by `finalized = true`, `voided = false`, and `winningOutcome in [0, 1]`. It requests `marketId` and `winningOutcome`, orders by descending expiry, and caps the candidate set at 64. The server requires at least one candidate for each outcome, chooses an outcome bucket with cryptographic randomness, then chooses a market within that bucket.

At reveal, `ReplaySettlement` fetches the exact committed `Market_by_pk` and requests the full metadata set plus `resolvedAtTimestamp`. The server rejects the reveal if `finalized`, `voided`, or `winningOutcome` no longer matches the encrypted commitment.

The lightweight live-settlement lookup requests only `marketId`, `clobStatus`, `finalized`, `voided`, `winningOutcome`, `payoutNumerators`, `payoutDenominator`, and `resolvedAtTimestamp`.

## Chain 5031 and RPC verification

Every fully hydrated active or revealed market calls `eth_chainId` and rejects any result other than decimal `5031`. It then performs a read-only `eth_call` against the indexed `poolAddress` with selector `0x0765910c`. The return data is decoded as three 32-byte words: `tickSize`, `minQuantity`, and `lotSize`.

This is an important boundary: settlement fields currently come from the dreamDEX indexer. RPC verifies the Somnia network and reads pool parameters, but it does not independently reconstruct `winningOutcome` from a settlement transaction or contract event. Post-reveal explorer links expose the market ID, market address, and pool address for human inspection.

## Metadata, settlement, and combat boundaries

- Active-market metadata is public immediately and drives the full live expedition.
- Judge Replay returns no selected-market identifier, address, strike, expiry, or outcome before reveal. Those values are authenticated inside an AES-256-GCM seal under a server-only environment key.
- The pre-reveal SHA-256 commitment binds market ID, recorded outcome, locked direction, independent `gameSeed`, timestamps, and a hidden random salt.
- At reveal, the server replays the bounded `Attack`, `Storm`, and `Potion` transcript from the sealed `gameSeed`. The request is rejected unless both the guard and boss are defeated and the player survives.
- Only after combat verification does the server re-fetch and hydrate the committed market. The browser recomputes both the combat transcript digest and the replay commitment before applying the indexed settlement.

The stateless combat check proves that the submitted action sequence is valid under the published deterministic rules. Because the seed is public, it is not proof of human input or elapsed play time.

## Cache and security limits

- Replay responses use `Cache-Control: private, no-store, max-age=0`; active market and settlement responses use `no-store`.
- There is no application-level response cache. The browser refreshes active discovery every 15 seconds and polls live settlement every five seconds after expiry.
- Judge start accepts one `UP`/`DOWN` field and at most 128 request bytes.
- Judge reveal accepts only `seal` plus a structured action array, caps the body at 8 KiB, the seal at 4,096 characters, and the transcript at 64 steps, and rejects extra fields.
- Replay seals have a 15-second minimum hold and a 30-minute lifetime. Environment-bound AES-GCM authentication, strict claim validation, balanced outcome pools, settlement re-validation, and deterministic combat replay all fail closed.
- Upstream timeouts, retries, rate-limit handling, and circuit breaking are not yet explicit. Availability therefore depends directly on the public indexer, RPC, and hosting platform limits.

## Documentation gaps

The implementation would be easier to audit against upstream contracts if official, versioned references covered:

1. the GraphQL schema and the lifecycle semantics of `clobStatus`, `finalized`, `voided`, and `resolvedAtTimestamp`;
2. the canonical meaning of outcome values `0` and `1`, including their YES/NO and UP/DOWN mapping;
3. units and decimal scaling for `strike`, `OracleAnswer.numericValue`, quantities, payouts, prices, and timestamps;
4. the ABI source for selector `0x0765910c` and the guaranteed return order of pool parameters;
5. stable contract addresses by deployment, indexer/RPC rate limits, expected error formats, and finality/reorg behavior; and
6. a canonical explorer or contract-level path from `marketId` to the settlement event, transaction, and block.

## Recommended improvements

- Publish a versioned GraphQL schema with active and finalized market examples.
- Publish deployment manifests and verified ABIs for the market, settlement, and pool contracts.
- Document outcome mapping, units, settlement lifecycle, and indexer consistency guarantees explicitly.
- Add official timeout, retry, cache, and rate-limit guidance for judge-facing applications.
- Expose transaction hash and block number with finalized settlement data, or document the exact RPC/event verification procedure, so clients can independently verify the indexed outcome onchain.

These recommendations do not require wallet or trading functionality and preserve Market Dungeon's current read-only safety boundary.
