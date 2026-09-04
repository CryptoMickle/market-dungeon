# Market Dungeon — DoraHacks Submission Copy

## One-line pitch

Market Dungeon turns a live dreamDEX BTC Event Contract into the second victory condition of a complete fantasy roguelite: defeat the boss, predict the market correctly, and survive both.

## Project description

Market Dungeon is a playable Delveworn spin-off built for the Somnia × dreamDEX Event Contracts Hackathon. Each dungeon tier prefers a real BTC 5-minute Event Contract as an omen, with automatic 15-minute fallback. Before choosing, the player can inspect live UP/DOWN implied odds derived from that market's dreamDEX CLOB through the official Markets SDK. The player then chooses **Gold Awakens (UP)** or **Shadows Rise (DOWN)**, clears ten combat rooms, manages health, potions, gold, attack, and defense, and defeats the boss.

Combat victory is necessary but not sufficient. After the boss reaches zero HP, the finalized dreamDEX outcome determines whether the boss stays down. A correct prediction awards the boss reward plus prediction gold and opens the next tier. An incorrect prediction triggers the defeated boss's fatal last strike. Four tiers, fresh markets, persistent gold, merchants, and deterministic combat make the market outcome part of a real game loop instead of a decorative price widget.

## Judge scorecard

- **Innovation & Originality — 20%:** Event Contract settlement is not a price widget or side bet; it is the second victory condition of a complete fantasy roguelite.
- **Technical Implementation — 25%:** The build combines official Markets SDK CLOB data with EIP-1898 hash-pinned Somnia mainnet reads of `BinaryModule` and `BinarySettlement` at one RPC verification snapshot block, a salted commitment, an authenticated server seal, and deterministic server-side combat replay.
- **User Experience & Design — 20%:** Judges can explore the full four-tier game or complete a focused five-step replay in under two minutes, with BTC 5m markets preferred so the market cadence fits a play session.
- **Business & Ecosystem Impact — 20%:** Every tier introduces another dreamDEX Event Contract, turning market discovery into repeatable game content and creating a low-friction acquisition path toward a future opt-in trading mode.
- **Presentation & Demo — 15%:** The 1:52 video, live production build, social-ready progress card, and reproducible Somnia proof make the complete claim easy to understand, share and independently inspect.

## Why Event Contracts matter here

Market Dungeon keeps two independent conditions legible:

- **Skill condition:** the player must defeat every room and boss through deterministic game actions.
- **Prediction condition:** the selected dreamDEX market outcome must be correct.

Neither condition replaces the other. This gives the Event Contract a clear, dramatic role: it decides whether an earned combat victory becomes permanent.

## Business and ecosystem impact

Market Dungeon is a consumer acquisition layer for Event Contracts. It gives players a reason to understand a live market because the settlement changes an outcome they already care about inside the game.

The current read-only build removes wallet, funding and approval friction so any judge or first-time player can complete the full integration safely. A future opt-in trading mode can convert that engagement into DreamDEX activity by offering an exact-amount Event Contract order before dungeon entry, with transaction simulation, maximum-loss disclosure and a separate confirmation for every write.

Every tier already introduces a fresh BTC Event Contract. Preferring the new 5-minute window lets settlement occur within the play session, while the same structure can support additional assets, intervals and seasonal campaigns. This turns new dreamDEX markets into reusable game content and gives the ecosystem a differentiated path to game-native users. The contest build does not claim current trading volume; it demonstrates the acquisition and retention loop that can precede it.

### Measured baseline and success targets

Vercel Web Analytics recorded **65 visitors and 187 page views from 27 August to 3 September 2026**, with **28 visitors referred by DoraHacks**. The anonymous Judge funnel recorded 17 start pageviews, 14 verified-completion pageviews and 2 Continue-on-dreamDEX pageviews. All 10 completions recorded after interval segmentation used the preferred 5-minute path; four earlier completions are not interval-classified.

This first window is a directional baseline: route totals are event volumes rather than deduplicated users, the schema changed during the window, and automated production smoke runs are included. It implies an 82% completion/start ratio, 14% Continue/completion ratio and 2.8 starts per start-route visitor, but those figures are not presented as clean human conversion or retention. Automated browsers are excluded from manual funnel events from this release onward.

After at least 30 human Judge starts, the next rolling seven-day window will be evaluated against four targets: **at least 70% verified completion**, **at least 25% Continue-on-dreamDEX intent**, **at least 1.5 starts per start-route visitor**, and **at least 80% 5-minute exposure among interval-classified completions**. Continue is still an external discovery action. Wallet connection, eligible opt-in orders and trading conversion are future scope and will be measured separately; Market Dungeon makes no current trading-volume claim.

## Two-minute judge path

1. Open the live demo and select **2-MIN JUDGE DEMO · SEALED MARKET REPLAY**.
2. Confirm that no selected replay market ID, address, strike, expiry or outcome is present before the choice. The visible opening line belongs to a separate live market, is labeled as context only, and does not identify the replay.
3. Choose `UP` or `DOWN`, then press **Lock Omen & Seal Replay**. The server now randomly selects a recent, finalized and traded market and binds its complete BTC/binary template, interval, trading window and origin with an encrypted token and salted commitment.
4. Note the full SHA-256 commitment, then defeat one wounded Tier 4 guard and the wounded final boss through normal combat. `Attack`, `Storm`, and `Potion` are recorded as a bounded structured action log.
5. Confirm that the exact market identity and outcome remain sealed after the boss reaches zero HP.
6. Press **Reveal Boss Fate**. The server first replays the combat log and refuses reveal unless both enemies were defeated. It then calls BinaryModule and BinarySettlement with both reads pinned to one canonical Somnia block hash, derives the winner from the returned payout vector, and rejects any mismatch with the hidden commitment.
7. Inspect the revealed block hash, payout vector, market key, contract links, and reproducible `eth_call` inputs/results. The browser independently re-fetches that exact block by hash and repeats both calls with EIP-1898 `{ blockHash, requireCanonical: true }`, requires exact byte matches, ABI-decodes them, and validates those bindings plus the combat digest and commitment before applying the result.
8. Inspect the generated 1200×675 run card with room depth, enemies defeated, gold, locked choice, outcome and verified status. **Share result** uses native PNG sharing where supported; **Share on X** downloads the card and opens a pre-filled post; **Download card** saves it directly. The separate **Copy proof JSON** and **Download proof JSON** actions export the canonical commitment input, full combat action transcript and digest, exact block hash, both contracts, and both raw RPC calls/results.

The replay is fast, but the settlement is not mocked.

## Onchain proof and safety

Before reveal, the interface exposes only the selected public interval, generic BTC / Somnia `5031` facts and a salted commitment. It prefers a balanced 5-minute replay pool and uses 15 minutes only when the 5-minute outcomes are not balanced; both pools require the same finalized, non-voided, positively traded profile and a maximum market age of seven days. After reveal, it exposes the direct BinarySettlement payout, RPC verification snapshot block number and hash, market key, deployed contract links, and reproducible RPC call inputs/results through the [Somnia explorer](https://explorer.somnia.network), plus server-verified combat, the combat transcript digest, the revealed salt, and the browser-verified version-2 commitment. The snapshot proves contract state at reveal time; it is not claimed to be the block containing the original finalization transaction. Before applying the outcome, the browser revalidates the sealed market provenance, independently re-fetches the block by hash, repeats both raw calls using the same canonical EIP-1898 block reference, requires byte-for-byte equality, and ABI-decodes every exposed settlement field including the module origin and trading window. The full live expedition applies the identical direct-proof gate to every terminal result, including voids, before awarding gold or advancing the run.

The hackathon build is intentionally read-only:

- no connected wallet;
- no token approval;
- no order submission;
- no redemption or other transaction; and
- no private key in the browser.

The Judge Demo sends no identifying market metadata before reveal. The selected market and locked direction are authenticated inside an AES-256-GCM seal under a server-only key; combat uses an unrelated public seed so damage rolls cannot identify the hidden market.

The browser presents **Reveal Boss Fate** only after boss defeat, and the API independently replays the structured action log before returning any settlement. The replay is stateless, capped at 64 actions and 8 KiB, and fails closed for invalid transitions, impossible potion use, player death, incomplete combat, or actions after completion. It proves a valid transcript under the public deterministic seed, not human input or elapsed play time. A short 15-second anti-peek hold still applies; the interface shows the remaining seconds and keeps reveal disabled until the server boundary opens.

## Technical architecture

- Next.js application with a deterministic client-side dungeon state machine.
- Server route for live dreamDEX market discovery.
- Interval-aware selection that prefers BTC 5m and falls back to BTC 15m without changing settlement semantics.
- Official `@somnia-chain/markets-sdk` integration for market-ID-keyed CLOB best bid/ask and live implied UP/DOWN odds.
- Separate Judge Replay start and reveal routes with CSPRNG selection, AES-256-GCM sealing, salted SHA-256 commitments, and deterministic server-side combat replay.
- dreamDEX GraphQL indexer for discovery, market metadata, reference question, and settlement consistency checks.
- EIP-1898 hash-pinned Somnia mainnet RPC reads of `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)` at one RPC verification snapshot block, with payout-derived outcome and fail-closed indexer/commitment comparison.
- `cache-control: private, no-store, max-age=0` for replay state.
- Responsive desktop and mobile layouts with a focused five-step judge flow, social-ready result cards for full runs and Judge replays, and a separate copy/download portable proof artifact.

## Links

- Live demo: https://market-dungeon.vercel.app
- Demo video (1:52): https://youtu.be/6IviQrMweZ4
- Immutable submission release: https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v8
- Source code: https://github.com/CryptoMickle/market-dungeon
- Integration and SDK/docs feedback: https://github.com/CryptoMickle/market-dungeon/blob/main/docs/DREAMDEX_INTEGRATION_REPORT.md

## Current scope

The contest build includes the full four-tier roguelite, 5m-first active-market integration with 15m fallback, official-SDK CLOB odds, EIP-1898 hash-pinned direct-RPC settlement verification at one RPC verification snapshot block, stateless server-verified Judge combat, social-ready run cards, portable proof JSON, the two-minute judge path, working block/contract links, a copyable market ID, and responsive presentation. Wallet writes are deliberately outside this submission's scope so judges can verify the complete integration without signing or risking assets. The repository also includes an implementation-specific [dreamDEX integration report](https://github.com/CryptoMickle/market-dungeon/blob/main/docs/DREAMDEX_INTEGRATION_REPORT.md) covering fields, discovery, RPC verification, security boundaries, documentation gaps, and recommended improvements.
