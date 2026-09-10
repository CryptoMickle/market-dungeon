# Market Dungeon — submission positioning

Updated 10 September 2026 for the Live 1-minute Judge release. Earlier v10 positioning has been superseded by the implemented product; the read-only and evidence boundaries remain.

**Defeat the boss. Predict the market. Survive both.**

Market Dungeon gives Event Contracts a consequence inside a fantasy roguelite: combat earns the victory, and the verified market outcome decides whether it lasts. It is a wallet-free way to discover and understand dreamDEX.

## Three distinct experiences

- **Live 1-minute Judge** is the primary competition demo. Choose BTC UP/DOWN against a visible live Shannon testnet target, fight one guard and one boss, then verify the settled result. The timer is the market window, not a combat deadline. A wrong prediction ends this short demo.
- **Historical Replay** is the testnet fallback. Choose before the server draws and seals a finalized market; fight the two encounters and reveal its independently checked settlement. It is labeled historical and does not pretend to predict a live price.
- **Full Expedition** contains 40 rooms, four tiers, 16 monster personas, Kevin, shops, camps and 15 relics. It locks an active five-minute mainnet market before each tier. A wrong omen resurrects the same boss at full strength; a fresh market is required for its rematch. Its combat is locally random, not covered by Judge transcript proof.

## What supports the five judging criteria

| Criterion | Product evidence |
| --- | --- |
| Innovation & Originality — 20% | A settled Event Contract determines the permanence of a combat victory and creates boss rematches in Full Expedition. |
| Technical Implementation — 25% | Official SDK CLOB reads; fixed mainnet/testnet profiles; server-signed Judge locks; deterministic Judge combat validation; hash-pinned contract reads and portable proof verification. |
| User Experience & Design — 20% | Wallet-free entry, live short-round demo, clearly labeled historical fallback, responsive combat, readable mobile artwork, sound control, boss music and outcome animations. |
| Business & Ecosystem Impact — 20% | Repeated market discovery, game-based explanation, fresh challenge links and an explicit Continue on dreamDEX handoff. These demonstrate a product path, not measured trading conversion. |
| Presentation & Demo — 15% | Direct demo/verifier links, share cards, proof exports, source release, and implementation report. The retained video shows an earlier version; replacement is deferred. |

## Claim boundaries

No wallet connection, transaction, order, approval, redemption, custody, new smart contract or Somnia Agent is part of this release. Continue on dreamDEX opens a separate service. Mainnet and Shannon must remain explicit.

Signed receipts authenticate the application environment; they are not independent timestamps or proof that the server was honest. Transcript validation proves rule-valid deterministic Judge actions, not human input. Direct RPC verification establishes the recorded contract state, not a third-party audit. Preview proofs must be verified on the same Preview environment that issued them.

Three self-reported feedback responses informed onboarding and presentation fixes. They do not establish a measured completion, retention or conversion rate. The historical v2 analytics funnel does not yet instrument the newer Live Judge flow. Do not combine older automated traffic with human feedback.

The current validation and deployment evidence belongs to [the September 10 release](RELEASE_2026-09-10.md), not to earlier release tags. This release finishes the existing product and submission; speculative features and video work are outside it.
