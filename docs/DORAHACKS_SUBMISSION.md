# Market Dungeon — DoraHacks Submission Copy

## One-line pitch

Market Dungeon turns a live dreamDEX BTC Event Contract into the second victory condition of a complete fantasy roguelite: defeat the boss, predict the market correctly, and survive both.

## Project description

Market Dungeon is a playable Delveworn spin-off built for the Somnia × dreamDEX Event Contracts Hackathon. Each dungeon tier locks a real BTC 15-minute Event Contract as an omen. The player chooses **Gold Awakens (UP)** or **Shadows Rise (DOWN)**, clears ten combat rooms, manages health, potions, gold, attack, and defense, and defeats the boss.

Combat victory is necessary but not sufficient. After the boss reaches zero HP, the finalized dreamDEX outcome determines whether the boss stays down. A correct prediction awards the boss reward plus prediction gold and opens the next tier. An incorrect prediction triggers the defeated boss's fatal last strike. Four tiers, fresh markets, persistent gold, merchants, and deterministic combat make the market outcome part of a real game loop instead of a decorative price widget.

## Why Event Contracts matter here

Market Dungeon keeps two independent conditions legible:

- **Skill condition:** the player must defeat every room and boss through deterministic game actions.
- **Prediction condition:** the selected dreamDEX market outcome must be correct.

Neither condition replaces the other. This gives the Event Contract a clear, dramatic role: it decides whether an earned combat victory becomes permanent.

## Two-minute judge path

1. Open the live demo and select **2-MIN JUDGE DEMO · SEALED MARKET REPLAY**.
2. Confirm that no selected-market ID, address, strike, expiry or outcome is present before the choice.
3. Choose `UP` or `DOWN`, then press **Lock Omen & Seal Replay**. The server now randomly selects a finalized market and binds it with an encrypted token and salted commitment.
4. Note the full SHA-256 commitment, then defeat one wounded Tier 4 guard and the wounded final boss through normal combat.
5. Confirm that the exact market identity and outcome remain sealed after the boss reaches zero HP.
6. Press **Reveal Boss Fate**. Market Dungeon reveals the full proof and salt, recomputes the commitment in the browser and resolves the server-locked prediction against the real recorded outcome.

The replay is fast, but the settlement is not mocked.

## Onchain proof and safety

Before reveal, the interface exposes only generic BTC 15-minute / Somnia `5031` facts and a salted commitment. After reveal, it exposes clickable proof for the full market ID, market contract, and pool contract through the [Somnia explorer](https://explorer.somnia.network), plus the revealed salt and browser-verified commitment.

The hackathon build is intentionally read-only:

- no connected wallet;
- no token approval;
- no order submission;
- no redemption or other transaction; and
- no private key in the browser.

The Judge Demo sends no identifying market metadata before reveal. The selected market and locked direction are authenticated inside an AES-256-GCM seal under a server-only key; combat uses an unrelated public seed so damage rolls cannot identify the hidden market.

The browser presents **Reveal Boss Fate** only after boss defeat. Because combat is intentionally client-side, the API does not claim to prove combat completion; it enforces a short 15-second anti-peek hold and cryptographically binds the already-chosen direction to the sealed replay.

## Technical architecture

- Next.js application with a deterministic client-side dungeon state machine.
- Server route for live dreamDEX market discovery.
- Separate Judge Replay start and reveal routes with CSPRNG selection, AES-256-GCM sealing and salted SHA-256 commitments.
- dreamDEX GraphQL indexer for market metadata, reference question, and settlement data.
- Somnia mainnet RPC verification for chain ID and pool parameters when live or revealed market details are hydrated.
- `cache-control: private, no-store, max-age=0` for replay state.
- Responsive desktop and mobile layouts with a focused five-step judge flow.

## Links

- Live demo: https://market-dungeon.vercel.app
- Three-minute demo video: https://youtu.be/YIoSSdMTsEM
- Source code: https://github.com/CryptoMickle/market-dungeon

## Current scope

The contest build includes the full four-tier roguelite, live active-market integration, finalized onchain settlement replay, the two-minute judge path, clickable Somnia proof, and responsive presentation. Wallet writes are deliberately outside this submission's scope so judges can verify the complete integration without signing or risking assets.
