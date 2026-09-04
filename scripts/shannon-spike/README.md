# WB-02 — Shannon feasibility spike

Date: 4 September 2026

Branch/base commit inspected: `phase1/winner-v9` / `3c868da`; final regression
also covered the combined v9 working tree.

Scope: isolated Shannon spike plus SDK-readiness migration; no Shannon product
integration, private key, signature, transaction, commit, or push

## Decision

**USER ACTION REQUIRED — Gate 1 is not passed.** The read/build/verify path is
technically feasible, but the acceptance contract requires a dedicated Market
Dungeon wallet to sign an exact approval and an order that produces a real,
non-zero fill. No wallet or funds were available or requested during this spike.

Continue to the user-wallet checkpoint only if the release owner accepts the
two-signature flow and can provide a dedicated Shannon account with enough STT
for gas and a deliberately small amount of tUSDC. Never provide a private key to
the app, repository, shell, server, or evidence bundle.

## SDK 0.29.0 compatibility

The exact npm artifact tested was `@somnia-chain/markets-sdk@0.29.0`, integrity:

`sha512-8qEtXIBh8/mdn/L6NGOZKRMyPxyATL/Rl6/TSQ2mZSJCVT5zGC4TwsRZnKTBlSgakQdAoeLCTdZdilcSaluUZg==`

It was **not** a drop-in replacement for v8. With only the installed package
swapped in an isolated copy, lint passed and all 63 unit tests passed, but the
production build failed because `getBookTops` is no longer a root export. The
client-scoped migration below made the production build pass in that isolated
copy and was subsequently applied to the root integration:

```ts
import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { somniaMainnet } from '@somnia-chain/markets-sdk/chains';

const exchange = new SomniaMarkets({
  indexerUrl: 'https://prd.smk.somnia.host/v1/graphql',
  chain: somniaMainnet,
  addresses: SOMNIA_MAINNET_ADDRESSES,
});

const tops = await exchange.client.getBookTops([marketId]);
```

The root dependency is now pinned as
`"@somnia-chain/markets-sdk": "0.29.0"` (no caret), its lockfile records the
verified 0.29.0 artifact, and the existing odds read uses the client-scoped API.
This is SDK readiness only; no Shannon trade component was added to the product.

Relevant 0.29.0 surfaces are present and were exercised: `SomniaMarkets`,
`SOMNIA_TESTNET_ADDRESSES`, `somniaShannon`, `Trader.buildPlaceOrder`,
`binaryModuleReadAbi`, `binaryPoolWriteAbi`, `erc20WriteAbi`,
`orderBookEventsAbi`, and `outcomeId`. SDK 0.29.0 does not root-export its
`binaryPoolEventsAbi`; the proof kernel therefore pins the single
`BinaryOrderPlaced(uint128,uint8)` fragment copied from 0.29.0 and verified
against the deployed event topic. A production verifier should prefer an SDK
export if one becomes available and must regression-test this pinned fragment.

## Read-only Shannon discovery and binding

The reproducible command is:

```sh
node scripts/shannon-spike/read-only-discovery.mjs
```

It performs no wallet operation. It queries the 0.29.0 development indexer with
all four server-side filters: BTC, 300 seconds, canonical `operatorId = 2`, and
canonical `venueId =
0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c`.
This prevents a simultaneous competing BTC/5m venue from being selected. It
then freezes one RPC block and checks all of these independent bindings:

- RPC chain id is exactly `50312`.
- The indexer row and the block-pinned module record both repeat the exact
  canonical operator/venue pair.
- The module maps the selected `marketId` to the indexed market contract and pool.
- The module declares exactly two outcome slots, a non-zero oracle question,
  the SDK-manifest oracle adapter, and the same void policy and trading window
  as the indexer row.
- The module, pool, and SDK manifest agree on tUSDC collateral.
- Module, pool, and locally derived `(pool, nonce, outcomeIndex)` agree on the
  YES and NO ERC-6909 ids.
- The pool nonce agrees with both the market row and the open indexer binding.
- The market contract reports onchain `Trading` status, and the module trading
  window contains the frozen block timestamp.
- The pool is not finalized, and the onchain book has bids and asks.

The final run passed all 32 checks for a canonical BTC 5m market at block
`479628136`, hash
`0x5b7bf3a53a2d55f41f227ca6ac8b72961862673ee9b1293b979e329f54dd9674`.
The versioned evidence file also retains a prior 5m snapshot at block
`479610657` so the result remains reviewable after the rolling pool is recycled.

## Exact approval and buy-only IOC

For six-decimal collateral, let `Q` be raw outcome quantity, `P` the raw YES
price, and `ONE = 1_000_000`. The only allowed sides and exact maximum-loss
allowances are:

```text
BUY_YES = ceil(Q × P / ONE)
BUY_NO  = ceil(Q × (ONE − P) / ONE)
ceil(a / b) = (a + b − 1) / b
```

`build-unsigned-intent.mjs` exercised SDK 0.29.0 with a deliberately inert,
non-signing wallet shape. For a historical BUY_YES fixture with `Q = 1.0` and
`P = 0.02`, it produced:

- exact tUSDC approval: `20_000` raw units (`0.02` tUSDC), not `maxUint256`;
- spender: the exact bound pool;
- `placeBinaryOrder` kind `0` (BUY_YES), order type `2` (IOC);
- `autoApprove: false`, zero native value, `CANCEL_TAKER`, zero builder, zero
  builder fee, and a bounded expiry.

SDK auto-approval must never be used: 0.29.0 still approves `maxUint256` when
`autoApprove` is left enabled. The application must encode and simulate
`approve(pool, exactMaximumLoss)` itself. If an earlier allowance exceeds the
new intent, the exact approval must reduce it before the order signature.
`fetchAndVerifyExactApprovalProof` fetches the transaction, receipt, and
canonical block with full transactions from Shannon RPC. It then makes
EIP-1898 `{ blockHash, requireCanonical: true }` reads of both
`allowance(owner, pool)` and the target pool's `getBinaryPoolParams()` at that
same receipt block. The verifier binds the pool's collateral, market,
`finalized` state, and `oneCollateral`, recomputes maximum loss from that scale,
and requires the calldata amount and fetched allowance to equal it. A caller
cannot supply a scalar allowance or unverified collateral scale as proof.

The approval calldata successfully simulated with a zero-balance inert address.
The independent order simulation then failed closed with
`ERC20InsufficientAllowance`, as expected because separate `eth_call` requests
do not retain simulated approval state. This is not a filled-trade result.

## Receipt and fill proof

The evidence bundle includes a public, third-party Shannon transaction solely
as a verifier fixture:

<https://shannon-explorer.somnia.network/tx/0x4c5a1e82be4e837fbc5c440f290dc1f21ef7476dbdd1c4d8b49b56a224a4cc1f>

It is a successful `BUY_NO` IOC with zero builder fee. At its canonical receipt
block the module binds the expected market to the target pool and the same
canonical operator/venue pair, and two
`OrderFilled` logs from that pool total the requested quantity. It is **not** a
Market Dungeon transaction and proves no Gate 1 write criterion by itself.

Its authoritative read-only re-fetch is reproducible with:

```sh
node scripts/shannon-spike/verify-public-fill.mjs
```

The final run re-fetched and verified the two fills through Shannon RPC. It uses
the public fixture as expected intent only; transaction, receipt, full block,
module record, nonce, and logs come from RPC during the run.

`proof-kernel.mjs` adds checks the SDK result alone does not provide. In
particular, SDK 0.29.0's internal receipt decoder recognizes event topics but
does not itself filter `log.address`; the independent verifier must:

1. re-fetch transaction, receipt, and canonical block from Shannon RPC; the
   supplied `readReceiptBlockBinding` helper reads the canonical testnet module's
   `markets(marketId)` and `marketNonce(marketId)` with EIP-1898
   `{ blockHash, requireCanonical: true }` at that receipt block rather than
   accepting an indexer, block-number-only, or latest-state binding;
2. require chain `50312`, successful receipt, matching hash/block hash/block
   number/transaction index, the transaction hash at that exact position in the
   mandatory full canonical block transaction list, sender, target pool, and
   zero native value;
3. decode the exact transaction input and require BUY_YES/BUY_NO only, IOC,
   `CANCEL_TAKER`, zero builder/fee, intended price/quantity/userData, and an
   expiry no later than the bound market expiry;
4. read `BinaryMarketsModule.markets(marketId)` and `marketNonce(marketId)` at
   the **receipt block**, then match the canonical operator/venue, market
   contract, pool, collateral, nonce, YES id, NO id, and trading window;
5. ignore every receipt log whose address is not the expected pool, and require
   every retained pool log's transaction hash, block number/hash, and
   transaction index to match the receipt; reject duplicate log indexes;
6. bind the same order id across `BinaryOrderPlaced`, both copies in
   `OrderPlaced`, and every taker `OrderFilled`; require its authoritative
   `BinaryOrderPlaced.kind` to equal the intended buy side and at least one
   positive fill;
7. require fill prices to respect the limit, total filled quantity not to exceed
   the request, and no `OrderRested` event for that IOC;
8. report zero fills, stale/recycled binding, ambiguous RPC result, or any
   mismatch as `FAIL`/`NOT PROVABLE`, never as a trade.

## USER ACTION REQUIRED

These steps remain deliberately unexecuted:

1. Connect a dedicated user-controlled wallet on chain `50312`; expose only its
   public address to the client.
2. Obtain minimal STT gas and a low tUSDC balance. Set an explicit loss cap
   (recommended default at most `1 tUSDC`, hard cap `5 tUSDC`).
3. Select a fresh two-sided BTC market with adequate headroom, then bind it as
   the discovery script does.
4. Re-check account, balance, status, block timestamp, pool binding, nonce,
   collateral, outcomes, grid, book freshness, and maximum loss.
5. Ask the wallet to sign the exact approval. Pass its hash to
   `fetchAndVerifyExactApprovalProof`; continue only after its canonical
   allowance and pool-parameter reads pass.
6. Re-run every market/account/book check, build the exact IOC with
   `autoApprove:false`, simulate those exact bytes, and ask for one signature.
7. Submit once. On an ambiguous provider error, recover by transaction hash or
   nonce; never automatically rebuild or resend.
8. Re-fetch and verify the receipt with `proof-kernel.mjs`. Retain both explorer
   links and a redacted evidence artifact only when a non-zero fill is proven.

If the dedicated wallet lacks STT/tUSDC, the market rolls during the two-step
flow, simulation fails, the receipt has zero fills, or independent re-fetch is
not reproducible, stop. Gate 1 remains failed.

## Checks run

| Check | Result |
| --- | --- |
| Isolated v8 with only SDK 0.29.0 swapped: lint | PASS |
| Isolated v8 with only SDK 0.29.0 swapped: unit | PASS, 63/63 |
| Isolated v8 with only SDK 0.29.0 swapped: build | Expected migration signal: removed root export |
| SDK 0.29.0, client-scoped root migration | Applied; complete regression results below |
| Shannon read-only discovery script | PASS, all 32 binding checks |
| Isolated proof-kernel tests | PASS, 7/7 including RPC binding, origin, order-link, allowance and index adversarial cases |
| Public fill authoritative RPC/EIP-1898 re-fetch | PASS, 2 fills / `500000000` raw quantity |
| Unsigned exact-approval / IOC construction | PASS |
| Current combined v9 lint | PASS |
| Current combined v9 unit tests | PASS, 63/63 |
| Current combined v9 production build (`--webpack`) | PASS |
| Current combined v9 Chromium E2E | PASS, 7/7 |
| Signed exact approval | USER ACTION REQUIRED |
| Signed order with real Market Dungeon fill | USER ACTION REQUIRED |
| Market Dungeon explorer proof | USER ACTION REQUIRED |

The evidence JSON contains public chain data only. Do not send wallet addresses,
transaction hashes, market ids, calldata, receipts, or proof artifacts to
analytics.
