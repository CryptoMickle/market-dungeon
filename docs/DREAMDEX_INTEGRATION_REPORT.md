# dreamDEX integration and SDK feedback

Implementation reviewed 11 September 2026. This report describes Live Judge on one-minute Shannon markets, Historical Replay on fixed network profiles, Full Expedition on five-minute Somnia mainnet markets, and the optional Somnia Agent Kevin rival. The [v17 release record](RELEASE_2026-09-11_KEVIN.md) tracks current publication identity and executed checks. The earlier [release verification](RELEASE_2026-09-10.md) and [v13 source release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v13) preserve the original Live Judge baseline.

This is the submission’s optional SDK and documentation feedback report. Deployment constants below are the values enforced by the application, not a claim that every upstream service is continuously available.

## Integration summary

Market Dungeon discovers Event Contracts through dreamDEX’s GraphQL indexer, reads CLOB context with the official Markets SDK, and verifies terminal outcomes directly against Somnia. The browser independently reproduces the proof before applying the outcome.

Full Expedition and both Judge demos need no wallet or transaction. Kevin's simulator is also wallet-free; its separately selected real-agent path connects MetaMask and asks the player to approve a paid Shannon testnet request. No mode places a dreamDEX order or redemption. The application's Ed25519 Judge lock receipt authenticates game state; it cannot authorize a wallet or blockchain transaction.

| Mode | Discovery | Lock | Result |
| --- | --- | --- | --- |
| Live Judge | Fresh BTC/USDC 60-second Shannon market | Signed exact market and direction, with a pre-expiry pending-state snapshot | Deterministic combat plus final settlement of the same market |
| Historical Replay | Recent, finalized, traded BTC market from balanced outcome pools | Choice before random selection; encrypted seal, salted commitment and signed receipt | Deterministic combat plus direct settlement of the committed market |
| Full Expedition | Active BTC 300-second mainnet market before each tier or rematch | Validated local run binds direction, market and reference | Browser-reproduced settlement gates reward, progression or same-boss rematch |
| Somnia Agent Kevin | Same five-minute mainnet market as the player's expedition | Same local gameplay lock; separate simulated choice or wallet-approved Shannon agent request | Existing settlement decides gameplay; eligible Kevin response is scored separately |

The retained mainnet historical route and older proof formats remain supported. There is no silent cross-network, historical or 15-minute substitution for an active Full Expedition or Live Judge lock.

## Fixed deployment profiles

| Value | Somnia mainnet | Shannon testnet |
| --- | --- | --- |
| Chain ID | `5031` | `50312` |
| Indexer | `https://prd.smk.somnia.host/v1/graphql` | `https://dev.smk.somnia.host/v1/graphql` |
| RPC | `https://api.infra.mainnet.somnia.network` | `https://api.infra.testnet.somnia.network` |
| Explorer | `https://explorer.somnia.network` | `https://shannon-explorer.somnia.network` |
| Collateral | `0x00000022dA000002656c64D9eA6011ea952D008A` | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |
| Historical origin operator | `2` | `2` |

The configured BinaryModule is `0x3ecC694Cef705358864a646142ac17A90E29e388` and BinarySettlement is `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` on both profiles. Their equal addresses do not make the networks interchangeable: proof parsing and RPC reproduction still require the exact profile and chain ID.

The historical venue is `0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c`. The separate live one-minute Shannon series uses:

- Profile `shannon-live-1m`, chain `50312`, interval `60`, operator `4`.
- Venue `0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f`.
- Oracle adapter `0x78bc8e82afbe80d1a348a8b81949ea5c4e54cb0e`.
- At least 20 seconds remaining when the server finishes validating and signs the lock.

See [`app/judge-network.ts`](../app/judge-network.ts) and [`app/live-judge-proof.ts`](../app/live-judge-proof.ts). The live API supports BTC/ETH validation, but the shipped Judge interface selects BTC; ETH is not claimed as an exposed game mode.

## Live one-minute discovery and lock

`/api/live-judge/market` queries `Market` for a binary, trading, unfinalized and non-voided series with the required asset, 60-second interval, operator, venue and collateral. The trading window must already have opened and leave the required lock margin. Candidates are ordered by expiry and bounded to four rows.

Returned metadata includes exact market and token IDs, market/pool addresses, collateral, question, oracle question ID, creator, trading start and expiry. The indexed strike uses cents. The application reads the oracle’s 18-decimal threshold and preserves its exact value separately from formatted display text.

Before exposing a candidate, the server checks Shannon chain identity and obtains one canonical block snapshot. Four EIP-1898 hash-pinned `eth_call` reads establish:

1. `BinaryModule.markets(marketId)`: exact market, origin, collateral, token and window bindings.
2. The market contract’s `status()`: trading state.
3. `BinarySettlement.getSettlement(marketKey)`: no finalized settlement at that snapshot.
4. Oracle adapter `questions(oracleQuestionId)`: expected asset/USDC symbol, exact target, expiry and existence.

`/api/live-judge/start` accepts only the selected market ID and UP/DOWN direction. It refetches and validates that exact candidate, then samples the current time after upstream reads. A slow response cannot create a lock inside the final 20-second margin. The signed receipt binds the market, direction, independent combat seed, snapshot and server-stated time; an authenticated encrypted seal lets the reveal server recover the same state.

This proves the recorded contract was unresolved at a pre-expiry block and that the application signed the stated choice. It is not a player transaction or independent timestamp. The chain does not attest the player’s input time.

## Live CLOB context

The application pins `@somnia-chain/markets-sdk` version `0.29.0`. For Live Judge it constructs the SDK with the Shannon chain, testnet addresses and indexer, then calls `exchange.client.getBookTops([marketId])`. Mainnet uses the corresponding fixed mainnet configuration. Lookup by exact market ID prevents orders from a recycled pool’s previous market appearing as current quotes.

- Two valid sides: UP is the midpoint of best YES bid and ask.
- One valid side: show that available quote and label its source.
- Empty book with a valid traded price: show a labeled last-trade fallback.
- No usable quote, malformed values or crossed book: show unavailable odds, never an invented 50/50 value.
- DOWN is the complement of the valid UP signal. These are implied market quotes, not guaranteed probabilities.

The live odds endpoint independently verifies market identity, network, venue, interval, collateral and open window. Indexer and SDK calls each have a three-second deadline. Expiry is checked again after the SDK returns so a late response cannot mark an old book as live. Responses are uncached and include identity, observation time and source.

The browser polls an empty open book every two seconds and a quoted book every five seconds, honors retry backoff, pauses while hidden, aborts obsolete requests and clears mismatched or stale quotes. Quotes can still arrive late or remain empty in a testnet market. They are optional context and never enter the signed lock, combat randomness or settlement proof.

## Live settlement and portable proof

`/api/live-judge/reveal` decrypts the original seal, enforces its lifetime and replays the bounded action transcript. The guard and boss must both be defeated with the player alive. Incomplete or invalid combat cannot obtain a settlement result. Reaching expiry alone is insufficient.

After expiry, the server reads the exact locked market from the indexer and rejects changed metadata. If it is not finalized, the round remains pending. It never discovers a replacement. A finalized record must pass direct settlement verification and bind back to the signed lock; its snapshot block must be at or after market expiry.

The versioned `market-dungeon/live-judge-proof/v1` artifact includes the lock, attestation, action log, combat digest and verified settlement. The browser and `/shannon/live-judge/verify` check the trusted same-origin public key, reproduce combat, repeat all four pending-state calls, and independently repeat the final settlement proof. The outcome is applied only after successful verification. `VOID` is distinct from delayed settlement and provider failure.

Live sessions persist in the current tab so completed combat and pending verification can resume after reload. Expired sessions require a new round; this does not reassign a new outcome to the old proof.

## Historical Replay

The historical start route accepts the chosen direction before selecting the market. It queries separate 300- and 900-second candidate pools. Both require a binary BTC market with canonical question and provenance, finalized/non-voided state, positive trade count, a known UP/DOWN outcome, and expiry no more than seven days ago. Each pool is bounded to 64 candidates and validated independently.

The server prefers a five-minute pool containing both outcomes. Otherwise it requires a balanced 15-minute pool. Cryptographic randomness chooses an outcome bucket and a market. If eligibility or balance is missing, start fails rather than exposing a biased or fabricated replay.

AES-256-GCM authenticates the selected metadata and direction. A salted SHA-256 commitment and server-authenticated Ed25519 receipt bind the replay while the market identity and outcome remain hidden. The public combat seed is independent of the hidden market. Historical Shannon has no live reference feed; the historical opening price is unavailable and is not shown as zero.

Reveal checks the seal and deterministic transcript before reading settlement. Unlike the Live Judge settlement path, historical reveal needs no fresh indexer lookup: its authenticated seal supplies the metadata. Mainnet version-2 and Shannon version-3 commitments keep their historical formats; combat and commitment versions are separate. Their existing `/verify` and `/shannon/verify` routes remain compatible.

The historical response contains the revealed salt and canonical commitment input, receipt, actions/digest, and direct settlement snapshot. Its verifier authenticates the receipt, recomputes commitment and combat, and freshly reproduces the contract state. The snapshot is the verification block, not necessarily the block where finalization originally occurred.

Both Judge variants now use the same four-step UI and recovery/result components. Historical rest is available inline after the boss and before manual reveal; this removes an unnecessary screen without changing deterministic actions or the sealed transcript. The live countdown, target and CLOB context remain live-only. The historical anti-peek hold, hidden market identity, manual reveal and network-specific verifiers remain intact.

## Full Expedition

Full Expedition explicitly calls `/api/market?interval=300` before Rooms 1, 11, 21 and 31 and each CURSED rematch. It requires an active BTC five-minute mainnet market and a valid opening reference. If the indexed strike is absent or zero, the reference lookup follows `MarketReferenceLink.referenceQuestionId` to `OracleAnswer.numericValue`. No valid five-minute reference means retry or an explicit mode change, not a silent fallback.

The general mainnet context endpoint retains five-minute preference and a 15-minute fallback for legacy callers. That general fallback does not apply to Full Expedition’s explicit `interval=300` request. The retained `/api/full-run/replay/*` adapter is not used by the active Full Expedition.

The run binds its direction and selected market locally while combat proceeds. After boss defeat it reads `/api/market?marketId=…` for the same ID and independently reproduces the direct settlement before granting reward, progressing or resurrecting the boss. Pending or unavailable proof preserves the pending run. The browser-local lock and local combat are not mislabeled as a Judge receipt or deterministic transcript proof.

## Optional Somnia Agent Kevin

This separate expedition mode uses the same mainnet five-minute market and settlement boundary. Simulated Kevin is the default, visibly labeled **NO AI**: local rounds save a random choice, while hosted rounds derive a stable test choice for the same attempt and market. This path makes no agent or model call.

For a real Somnia Agents request, explicit MetaMask connection precedes omen lock. Connection alone does not lock or transfer STT. After a separate lock, the server reads the official LLM agent's current committee/deposit settings and prepares an unsigned `createRequest` calling `inferString`. Only the player's wallet submits it on Shannon `50312`, with a quoted testnet STT deposit and gas. No new custom smart contract, custody or server wallet is introduced.

The fixed prompt contains only allowlisted public market question, target and timing, with no tools and UP/DOWN output choices. It receives neither the player's choice nor combat state. Verification binds the transaction and request to the prepared input, checks the accepted committee response and its canonical finalization time, and excludes responses finalized later than market expiry minus ten seconds. Failed or unavailable real requests never become simulated answers. The response does not establish settlement or a forecasting advantage; the model has no supplied price history or odds strategy.

The independently verified mainnet settlement scores both calls after gameplay reaches the boss result. Equal calls tie, and a void has no winner. Rival scores do not modify combat, rewards, relics or progression. Hosted tickets are encrypted, authenticated and origin-bound, with separate Preview/Production secrets. They support personal continuity but have no global first-transaction registry or distributed anti-cheat guarantee. See the [Kevin operating guide](../LOCAL_SOMNIA_AGENTS.md) for wallet handoff, finalized-request reconstruction and evidence limits.

## Direct settlement and trust boundaries

The shared direct proof checks chain identity, snapshots a block number and hash, and calls the fixed BinaryModule and BinarySettlement using `{ blockHash, requireCanonical: true }` for both reads. It validates the binary token pair, derives the market key, pool and nonce from the token encoding, and requires settlement collateral, pool, nonce, payout denominator and finalized/void state to agree. UP/DOWN comes from the payout vector, not an application label.

For live modes, module and settlement state must agree with the indexed record and locked market. Historical mode instead compares its authenticated committed provenance and outcome. Human-readable text, trade history and creation-transaction metadata are discovery evidence; the settlement calls do not independently prove every indexed field.

The browser re-fetches the exact block by hash, repeats the canonical calls and requires byte-for-byte raw result equality before ABI decoding and binding checks. A missing archival read produces an unprovable state; a demonstrated contradiction fails. A reorganization that makes a required hash noncanonical cannot silently pass.

No proof claims human gameplay, server honesty, a decentralized timestamp, a trade or the original finalization transaction. Receipt-key rotation changes what the current trusted endpoint can authenticate; older artifacts need the matching trusted historical key. No historical key archive is claimed.

## Request and privacy boundaries

- Judge state responses use `cache-control: private, no-store, max-age=0`.
- Historical start/reveal input is bounded, with a 15-second anti-peek hold, 30-minute seal lifetime and at most 64 combat actions. Historical reveal is capped at 8 KiB.
- Live start is capped at 512 bytes. Live reveal is capped at 24 KiB and 64 actions; its claim expires 30 minutes after market expiry. Exact accepted fields and transcript transitions are validated.
- Rate limits and bounded reveal deduplication protect upstream reads. A conflicting transcript for an already submitted lock is rejected. Transient failures retain a bounded retry path.
- Rate and deduplication state is per warm application instance, not a claim of deployment-wide durable enforcement.
- Market discovery and Markets SDK calls run on the server; settlement verification uses the application and fixed public Somnia RPCs. The opt-in Kevin connection also permits the specified MetaMask relay, and its public transaction is submitted by the wallet. Application seal keys remain server-side; the server has no wallet private key.
- Historical funnel events use closed enumerated labels, suppress WebDriver and the fixed automation marker, and exclude wallet IDs, market IDs, commitments, proofs, transcripts and exact timing. Historical analytics must not be presented as Live Judge conversion evidence.

See [provenance and privacy](PROVENANCE_AND_PRIVACY.md) and [pilot measurement definitions](PILOT_MEASUREMENT_V2.md). Result-card sharing is separate from proof export; an X draft contains text and a link, not an automatically attached image or confirmed publication.

## SDK and documentation feedback

The one-minute Shannon integration exposed a useful distinction: supporting chain `50312` alone is insufficient. An integrator also needs the correct operator, venue, oracle, collateral, interval and proof schema. The existing historical Shannon operator-2 profile cannot simply be relabeled as the live operator-4 series.

Recommended upstream documentation and SDK improvements:

1. Publish a versioned deployment/series manifest covering chain, operator, venue, oracle adapter, collateral, assets and available intervals. Keep mainnet and testnet examples together and current.
2. Provide separate end-to-end examples for an active unresolved one-minute market and a finalized historical market, including pending, voided and unavailable settlement states.
3. Document GraphQL lifecycle fields, case normalization and numeric scaling. The one-minute indexed target uses cents while the oracle retains 18 decimals; examples should preserve the exact threshold and define the equality boundary.
4. Show market-ID-keyed `getBookTops` use for recycled pools, plus empty-book behavior, one-sided/last-trade fallbacks and a per-request abort signal appropriate to short intervals.
5. Publish verified ABIs and canonical EIP-1898 examples for the module, settlement, market status and oracle question. Document expected archive, finality and reorganization behavior.
6. Expose or document the finalization transaction/event path separately from a state-verification snapshot, so applications can link both honestly.
7. Document provider rate limits, recommended polling, timeouts and retry semantics for short-lived consumer sessions.

These are implementation-informed integration suggestions. The game does not claim upstream endorsement, an SDK defect for an empty book, or a guarantee of testnet liquidity.
