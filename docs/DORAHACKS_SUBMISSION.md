# Market Dungeon — DoraHacks Submission Copy

Status: **local full-expedition v2 draft — do not publish before candidate approval**

Judge positioning and scope are frozen in
[Market Dungeon — frozen winner positioning](WINNER_POSITIONING.md). This copy
must preserve those claim boundaries through final publication.

The compact source for release, proof, pilot, and ecosystem claims is
[Market Dungeon — judge evidence pack](JUDGE_EVIDENCE_PACK.md). Its pending
gates must be replaced with real evidence or reported as unmet, never inferred.

## One-line pitch

**Defeat the boss. Predict the market. Survive both.**

Market Dungeon turns a dreamDEX BTC Event Contract into the second victory condition of a complete fantasy roguelite. Combat skill wins the fight; a correct market prediction makes the victory permanent, while a miss resurrects the boss for another full-strength fight.

## Project description

Market Dungeon is a playable Delveworn spin-off built for the Somnia × dreamDEX Event Contracts Hackathon. The restored full expedition contains 40 rooms, four full-strength bosses, shops, camps, random loot and all 15 Delveworn relics. Before each 10-room tier, the player chooses **Gold Awakens (UP)** or **Shadows Rise (DOWN)** against a visible active BTC five-minute Event Contract and its real opening reference. The market runs while the player fights.

Combat victory is necessary but not sufficient. After the boss reaches zero HP, the verified dreamDEX outcome determines whether the boss stays down. A correct prediction releases the ordinary boss reward and one relic exactly once. An incorrect prediction grants nothing, resurrects the same boss at full scaled HP, preserves the player's depleted resources and spent revive, and requires a fresh active five-minute Event Contract before the rematch. `VOID` never penalizes the player; unavailable proof freezes the run safely. The Event Contract is therefore repeatable, load-bearing game logic rather than a decorative price widget.

## Judge scorecard

- **Innovation & Originality — 20%:** Event Contract settlement is not a price widget or side bet; it is the second victory condition of a complete fantasy roguelite.
- **Technical Implementation — 25%:** The build combines official Markets SDK CLOB data with EIP-1898 hash-pinned Somnia mainnet reads of `BinaryModule` and `BinarySettlement` at one RPC verification snapshot block, a salted commitment, an authenticated server seal, a publicly verifiable Ed25519 lock receipt, and deterministic server-side combat replay.
- **User Experience & Design — 20%:** A wallet-free judge can complete the focused proof walkthrough in about two minutes and independently verify it, while the separate full expedition demonstrates the actual 40-room difficulty, resource pressure, relic choices and boss-rematch consequence.
- **Business & Ecosystem Impact — 20%:** Market Dungeon is a measurable consumer acquisition and education layer for Event Contracts: entry, prediction lock, verified completion, share or challenge, challenge completion, and Continue on dreamDEX. Human conversion remains a target until the clean-v2 pilot is published.
- **Presentation & Demo — 15%:** One final game-first film and one concise evidence hierarchy will show the same frozen release: the complete product, one uninterrupted Judge run, the Somnia result, independent verification, and the ecosystem loop.

## Why Event Contracts matter here

Market Dungeon keeps two independent conditions legible:

- **Skill condition:** the player must defeat every room and boss through deterministic game actions.
- **Prediction condition:** the selected dreamDEX market outcome must be correct.

Neither condition replaces the other. This gives the Event Contract a clear, dramatic role: it decides whether an earned combat victory becomes permanent.

## Business and ecosystem impact

Market Dungeon is designed as a consumer acquisition layer for Event Contracts. It gives players a reason to understand a market because the settlement changes an outcome they already care about inside the game.

The current read-only build removes wallet, funding and approval friction so any judge or first-time player can complete the full integration safely. A future opt-in trading mode can convert that engagement into DreamDEX activity by offering an exact-amount Event Contract order before dungeon entry, with transaction simulation, maximum-loss disclosure and a separate confirmation for every write.

Every tier introduces a fresh active BTC five-minute Event Contract after the player has chosen a direction. A missed prediction creates another complete boss fight against a new live interval instead of ending the run or replaying the preceding rooms. A completed result can invite another player straight into a fresh, separately sealed two-minute Judge replay through a fixed, identifier-free challenge link. This turns dreamDEX settlements into reusable game content and gives the ecosystem a differentiated path to game-native users. The contest build does not claim current trading volume or validated referral conversion; it implements a testable engagement and referral loop that can precede them.

### Legacy baseline and clean-v2 success targets

Vercel Web Analytics recorded a **legacy v1** baseline of **65 visitors and 187 page views from 27 August to 3 September 2026**, with **28 visitors referred by DoraHacks**. The old anonymous Judge funnel recorded 17 start pageviews, 14 verified-completion pageviews and 2 Continue-on-dreamDEX pageviews. All 10 completions recorded after interval segmentation used the preferred 5-minute path; four earlier completions are not interval-classified.

This first window is a directional legacy baseline: route totals are event volumes rather than deduplicated users, the schema changed during the window, and automated production smoke runs are included. It implies an 82% completion/start ratio, 14% Continue/completion ratio and 2.8 starts per start-route visitor, but those figures are not presented as clean human conversion or retention and are never mixed with v2.

The clean v2 funnel starts only after a sealed replay response is accepted, records reveal and verifier outcomes once per run, and uses coarse duration buckets. WebDriver plus the fixed `automation=1` smoke marker are suppressed, but aggregate analytics still cannot prove unique humans. After at least 30 starts are independently established by an anonymized recruited-pilot log, targets are **at least 70% verified completion**, **at least 95% proof-verification success**, **a conservative median below two minutes**, and **at least 25% Continue-on-dreamDEX intent**. The exact formulas, raw-count report, privacy limits, and challenge gates are in [Clean pilot measurement v2](PILOT_MEASUREMENT_V2.md). Continue is still an external discovery action. Wallet connection, eligible opt-in orders and trading conversion are future scope and will be measured separately; Market Dungeon makes no current trading-volume claim.

## Two-minute judge path

1. Open the live demo and select **START 2-MIN JUDGE DEMO · VERIFIED RUN**.
2. Confirm that no selected replay market ID, address, strike, expiry or outcome is present before the choice. The visible opening line belongs to a separate live market, is labeled as context only, and does not identify the replay.
3. Choose `UP` or `DOWN`, then press **Lock Omen & Seal Replay**. The server now randomly selects a recent, finalized and traded market and binds its complete BTC/binary template, interval, trading window and origin with an encrypted token and salted commitment. It also signs a receipt over that commitment, direction, and lock window with the environment's Ed25519 key.
4. Note the full SHA-256 commitment, then defeat one wounded Tier 4 guard and the wounded final boss through normal combat. `Attack`, `Storm`, and `Potion` are recorded as a bounded structured action log.
5. Confirm that the exact market identity and outcome remain sealed after the boss reaches zero HP.
6. Press **Reveal Boss Fate**. The server first replays the combat log and refuses reveal unless both enemies were defeated. It then calls BinaryModule and BinarySettlement with both reads pinned to one canonical Somnia block hash, derives the winner from the returned payout vector, and rejects any mismatch with the hidden commitment.
7. Read the compressed result first: both victory conditions, the plain-language proof summary, and the verified Somnia result.
8. Export the canonical proof JSON and open `/verify` in its new tab. That independent, browser-local tool verifies the server-authenticated Ed25519 lock receipt against the fixed public-key endpoint, recomputes the commitment and deterministic combat, decodes the settlement, and freshly re-fetches the recorded Somnia block plus both exact contract results. It reports `PASS`, `FAIL`, or `NOT PROVABLE` and never asks for a wallet or uploads the file.
9. Continue to the current dreamDEX market if desired, then inspect the generated 1200×675 Judge card. **Save image** and **Open X draft** are separate actions so an iPhone user can attach the card deliberately; **Challenge a player** sends a fresh, identifier-free `/judge?challenge=1` invitation. A completed full expedition or relevant combat defeat uses the same card component with actual room, enemies and gold, but the social card itself is never described as portable proof. Raw Judge ABI and calldata remain available afterward in a collapsed technical panel.

The replay is fast, but the settlement is not mocked.

## Onchain proof and safety

Before Judge reveal, the interface exposes only the selected public interval, generic BTC / Somnia `5031` facts and a salted commitment. It prefers a balanced 5-minute replay pool and uses 15 minutes only when the 5-minute outcomes are not balanced; both pools require the same finalized, non-voided, positively traded profile and a maximum market age of seven days. After reveal, it exposes the direct BinarySettlement payout, RPC verification snapshot block number and hash, market key, deployed contract links, and reproducible RPC call inputs/results through the [Somnia explorer](https://explorer.somnia.network), plus server-verified combat, the combat transcript digest, the revealed salt, and the browser-verified version-2 commitment. The snapshot proves contract state at reveal time; it is not claimed to be the block containing the original finalization transaction. Before applying the Judge outcome, the browser revalidates the sealed market provenance, independently re-fetches the block by hash, repeats both raw calls using the same canonical EIP-1898 block reference, requires byte-for-byte equality, and ABI-decodes every exposed settlement field. The separate full expedition visibly locks an active five-minute market before each tier and applies its result only after the same direct settlement and browser-RPC checks; it never claims that Judge-v1 combat proof covers the 40-room run.

The hackathon build is intentionally read-only:

- no connected wallet;
- no token approval;
- no order submission;
- no redemption or other transaction; and
- no private key in the browser.

The Judge Demo sends no identifying market metadata before reveal. The selected market and locked direction are authenticated inside an AES-256-GCM seal under a server-only key; combat uses an unrelated public seed so damage rolls cannot identify the hidden market. The start response also includes an Ed25519 receipt that binds the commitment, direction, and stated lock window to the official Market Dungeon environment. This is a server-authenticated receipt, not an external timestamp, third-party endorsement, or proof that the server itself was honest. The independent verifier trusts only the public key returned by the fixed same-origin endpoint. Rotating the environment secret changes that key, so historical proofs require retained historical public keys to remain fully provable.

The browser presents **Reveal Boss Fate** only after boss defeat, and the API independently replays the structured action log before returning any settlement. The replay is stateless, capped at 64 actions and 8 KiB, and fails closed for invalid transitions, impossible potion use, player death, incomplete combat, or actions after completion. It proves a valid transcript under the public deterministic seed, not human input or elapsed play time. A short 15-second anti-peek hold still applies; the interface shows the remaining seconds and keeps reveal disabled until the server boundary opens.

## Technical architecture

- Next.js application with a deterministic client-side dungeon state machine.
- A fresh active BTC five-minute Event Contract before every full-run tier and CURSED boss rematch.
- Balanced selection that prefers recent finalized BTC 5m markets and falls back to BTC 15m without changing settlement semantics.
- Official `@somnia-chain/markets-sdk` integration for market-ID-keyed CLOB best bid/ask and live implied UP/DOWN odds.
- Separate Judge Replay start and reveal routes with CSPRNG selection, AES-256-GCM sealing, salted SHA-256 commitments, and deterministic server-side combat replay.
- dreamDEX GraphQL indexer for discovery, market metadata, reference question, and settlement consistency checks.
- EIP-1898 hash-pinned Somnia mainnet RPC reads of `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)` at one RPC verification snapshot block, with payout-derived outcome and fail-closed indexer/commitment comparison.
- `cache-control: private, no-store, max-age=0` for replay state.
- A ported Delveworn reducer with all 15 relics, versioned fail-closed local persistence and a market-bound full-strength boss-rematch state machine.
- Responsive desktop and mobile layouts with a focused five-step Judge flow, social-ready result cards, a separate portable Judge proof artifact, and a browser-local independent verifier.

## Links

- Live demo: https://market-dungeon.vercel.app
- Independent proof verifier: https://market-dungeon.vercel.app/verify
- Current public baseline video (1:52): https://youtu.be/6IviQrMweZ4
- Final competition video: produced once, after the final release freeze; pending capture, captions, and embed QA
- Frozen v10 submission release: https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v10
- Source code: https://github.com/CryptoMickle/market-dungeon
- Integration and SDK/docs feedback: https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v10/docs/DREAMDEX_INTEGRATION_REPORT.md

## Current scope

The local candidate includes the restored 40-room Delveworn roguelite, all 15 relics, tier-specific personas and humor, one active BTC five-minute Event Contract per tier or CURSED rematch, full-strength rematches with preserved resource pressure, hash-pinned direct-RPC settlement verification, stateless server-verified Judge combat, social-ready run cards, portable Judge proof JSON, a browser-local independent verifier, and responsive presentation. The full expedition proves the market settlement but describes its direction lock and locally random combat honestly; the Judge route separately proves its signed pre-selection lock and deterministic transcript. Wallet writes remain outside scope so judges can inspect the integration without signing or risking assets. The frozen [dreamDEX integration report](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v10/docs/DREAMDEX_INTEGRATION_REPORT.md) remains the immutable published reference; the working-tree report records the local candidate addendum. This copy remains a draft until the candidate is independently reviewed, tested on the owner's iPhone and desktop, previewed, approved and released.
