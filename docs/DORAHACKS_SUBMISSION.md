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

1. Open the live demo and select **2-MIN JUDGE DEMO · REAL MARKET REPLAY**.
2. Inspect the exact finalized BTC question, strike, full market ID, market address, pool address, and Somnia network. The winning outcome is not included in this setup response.
3. Choose and lock `UP` or `DOWN` against that exact market.
4. Defeat one wounded Tier 4 guard and the wounded final boss through normal combat.
5. Confirm that the outcome still reads as sealed after the boss reaches zero HP.
6. Press **Reveal Boss Fate**. Market Dungeon then fetches the settlement separately and resolves the locked prediction against the real recorded outcome.

The replay is fast, but the settlement is not mocked.

## Onchain proof and safety

The interface exposes clickable proof for the full market ID, market contract, and pool contract through the [Somnia explorer](https://explorer.somnia.network). It identifies Somnia mainnet chain ID `5031` before and after the reveal.

The hackathon build is intentionally read-only:

- no connected wallet;
- no token approval;
- no order submission;
- no redemption or other transaction; and
- no private key in the browser.

The Judge Demo setup response explicitly redacts the settlement outcome and payout fields. They are retrieved through a separate request only after the judge defeats the boss and presses **Reveal Boss Fate**.

## Technical architecture

- Next.js application with a deterministic client-side dungeon state machine.
- Server route for live and finalized dreamDEX market discovery.
- dreamDEX GraphQL indexer for market metadata, reference question, and settlement data.
- Somnia mainnet RPC verification for chain ID and pool parameters.
- `cache-control: no-store` for time-sensitive market state.
- Responsive desktop and mobile layouts with a focused five-step judge flow.

## Links

- Live demo: https://market-dungeon.vercel.app
- Three-minute demo video: https://youtu.be/YIoSSdMTsEM
- Source code: https://github.com/CryptoMickle/market-dungeon

## Current scope

The contest build includes the full four-tier roguelite, live active-market integration, finalized onchain settlement replay, the two-minute judge path, clickable Somnia proof, and responsive presentation. Wallet writes are deliberately outside this submission's scope so judges can verify the complete integration without signing or risking assets.
