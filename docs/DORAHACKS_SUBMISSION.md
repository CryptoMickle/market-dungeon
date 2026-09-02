# Market Dungeon — DoraHacks Submission Copy

## One-line pitch

Market Dungeon turns a live dreamDEX BTC Event Contract into the second victory condition of a complete fantasy roguelite: defeat the boss, predict the market correctly, and survive both.

## Project description

Market Dungeon is a playable Delveworn spin-off built for the Somnia × dreamDEX Event Contracts Hackathon. Each dungeon tier locks a real BTC 15-minute Event Contract as an omen. Before choosing, the player can inspect live UP/DOWN implied odds derived from that market's dreamDEX CLOB through the official Markets SDK. The player then chooses **Gold Awakens (UP)** or **Shadows Rise (DOWN)**, clears ten combat rooms, manages health, potions, gold, attack, and defense, and defeats the boss.

Combat victory is necessary but not sufficient. After the boss reaches zero HP, the finalized dreamDEX outcome determines whether the boss stays down. A correct prediction awards the boss reward plus prediction gold and opens the next tier. An incorrect prediction triggers the defeated boss's fatal last strike. Four tiers, fresh markets, persistent gold, merchants, and deterministic combat make the market outcome part of a real game loop instead of a decorative price widget.

## Why Event Contracts matter here

Market Dungeon keeps two independent conditions legible:

- **Skill condition:** the player must defeat every room and boss through deterministic game actions.
- **Prediction condition:** the selected dreamDEX market outcome must be correct.

Neither condition replaces the other. This gives the Event Contract a clear, dramatic role: it decides whether an earned combat victory becomes permanent.

## Business and ecosystem impact

Market Dungeon is a consumer acquisition layer for Event Contracts. It gives players a reason to understand a live market because the settlement changes an outcome they already care about inside the game.

The current read-only build removes wallet, funding and approval friction so any judge or first-time player can complete the full integration safely. A future opt-in trading mode can convert that engagement into DreamDEX activity by offering an exact-amount Event Contract order before dungeon entry, with transaction simulation, maximum-loss disclosure and a separate confirmation for every write.

Every tier already introduces a fresh BTC Event Contract. The same structure can support additional assets, intervals and seasonal campaigns, turning new dreamDEX markets into reusable game content and giving the ecosystem a differentiated path to game-native users. The contest build does not claim current trading volume; it demonstrates the acquisition and retention loop that can precede it.

## Two-minute judge path

1. Open the live demo and select **2-MIN JUDGE DEMO · SEALED MARKET REPLAY**.
2. Confirm that no selected-market ID, address, strike, expiry or outcome is present before the choice.
3. Choose `UP` or `DOWN`, then press **Lock Omen & Seal Replay**. The server now randomly selects a finalized market and binds it with an encrypted token and salted commitment.
4. Note the full SHA-256 commitment, then defeat one wounded Tier 4 guard and the wounded final boss through normal combat. `Attack`, `Storm`, and `Potion` are recorded as a bounded structured action log.
5. Confirm that the exact market identity and outcome remain sealed after the boss reaches zero HP.
6. Press **Reveal Boss Fate**. The server first replays the combat log and refuses reveal unless both enemies were defeated. It then calls BinaryModule and BinarySettlement at one fixed Somnia block, derives the winner from the returned payout vector, and rejects any mismatch with the hidden commitment.
7. Inspect the revealed block hash, payout vector, market key, contract links, and reproducible `eth_call` inputs. The browser validates those bindings plus the combat digest and commitment before applying the result.
8. Use **Share verified run** or **Copy result** to export the locked choice, actual outcome, market ID, commitment, direct Somnia settlement block, and demo link.

The replay is fast, but the settlement is not mocked.

## Onchain proof and safety

Before reveal, the interface exposes only generic BTC 15-minute / Somnia `5031` facts and a salted commitment. After reveal, it exposes the direct BinarySettlement payout, fixed block number and hash, market key, deployed contract links, and reproducible RPC call inputs through the [Somnia explorer](https://explorer.somnia.network), plus server-verified combat, the combat transcript digest, the revealed salt, and the browser-verified commitment.

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
- Official `@somnia-chain/markets-sdk` integration for market-ID-keyed CLOB best bid/ask and live implied UP/DOWN odds.
- Separate Judge Replay start and reveal routes with CSPRNG selection, AES-256-GCM sealing, salted SHA-256 commitments, and deterministic server-side combat replay.
- dreamDEX GraphQL indexer for discovery, market metadata, reference question, and settlement consistency checks.
- Fixed-block Somnia mainnet RPC reads of `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)`, with payout-derived outcome and fail-closed indexer/commitment comparison.
- `cache-control: private, no-store, max-age=0` for replay state.
- Responsive desktop and mobile layouts with a focused five-step judge flow and a share/copy verified result.

## Links

- Live demo: https://market-dungeon.vercel.app
- Demo video (2:34): https://youtu.be/7J07NkSf1qM
- Source code: https://github.com/CryptoMickle/market-dungeon
- Integration and SDK/docs feedback: https://github.com/CryptoMickle/market-dungeon/blob/main/docs/DREAMDEX_INTEGRATION_REPORT.md

## Current scope

The contest build includes the full four-tier roguelite, official-SDK CLOB odds, live active-market integration, fixed-block direct-RPC settlement verification, stateless server-verified Judge combat, shareable verified results, the two-minute judge path, clickable Somnia proof, and responsive presentation. Wallet writes are deliberately outside this submission's scope so judges can verify the complete integration without signing or risking assets. The repository also includes an implementation-specific [dreamDEX integration report](DREAMDEX_INTEGRATION_REPORT.md) covering fields, discovery, RPC verification, security boundaries, documentation gaps, and recommended improvements.
