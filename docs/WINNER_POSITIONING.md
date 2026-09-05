# Market Dungeon — frozen winner positioning

Status: **WIN-WB-01 complete; judge positioning and contest scope frozen**

Behavioral baseline: commit
`abfac8ed7b8333d67b0b9388c08c109864d99f5b`, frozen tag
`hackathon-submission-2026-v10`.

This document fixes the judge-facing thesis and scope for the final Event
Contracts Hackathon submission. It is a presentation contract, not permission
to change the released game, settlement proof, or security boundary.

## Ten-second thesis

Market Dungeon turns a dreamDEX BTC Event Contract into the second victory
condition of a complete fantasy roguelite: defeat the boss, predict the market
correctly, and survive both.

Category position: **the wallet-free consumer acquisition and education layer
for Event Contracts, backed by independently reproducible Somnia evidence**.

## Five judge claims

| Criterion | Frozen claim | Existing evidence |
| --- | --- | --- |
| Innovation & Originality — 20% | Event Contract settlement is load-bearing game logic, not a price widget or decorative side bet. Combat victory and the locked market prediction are independent conditions; both must pass. | Full four-tier expedition, Judge replay, deterministic combat transcript, and dual-condition result. |
| Technical Implementation — 25% | The released build combines official Markets SDK CLOB odds with EIP-1898 hash-pinned Somnia mainnet reads, a salted commitment, an authenticated server seal, a publicly verifiable Ed25519 lock receipt, deterministic server-side combat replay, and a portable browser-local verifier. | Frozen v10 release, integration report, unit and proof-kernel suites, deterministic browser suite, and Preview/Production live proof gates. |
| User Experience & Design — 20% | A judge can enter without a wallet, complete the focused replay in about two minutes, understand both victory conditions, and independently verify the result; the full game separately demonstrates four tiers, progression, merchants, inventory, and repeated markets. | `/judge`, `/verify`, full expedition, responsive layouts, result card, share and challenge actions. |
| Business & Ecosystem Impact — 20% | Market Dungeon creates a measurable Event Contract acquisition funnel: entry, prediction lock, verified completion, share or challenge, challenge completion, and Continue on dreamDEX. Each tier makes a new market reusable game content. | Legacy baseline with explicit limitations, clean-v2 measurement contract, and the challenge/Continue instrumentation. Human conversion remains a target until a qualified pilot is published. |
| Presentation & Demo — 15% | One final game-first film and one concise evidence hierarchy will show the same frozen release: the complete product, one uninterrupted Judge run, the Somnia result, independent verification, and the ecosystem loop. | Final video, captions, DoraHacks copy, release, README, pilot report, and validation records must be synchronized in the final publication block. |

## Product surfaces that must not be confused

- **Full expedition:** the complete four-tier roguelite. It prefers a fresh BTC
  5-minute Event Contract for each tier, falls back to 15 minutes when needed,
  and demonstrates progression, resources, merchants, combat, and repeated
  market exposure.
- **Judge replay:** a short, finalized historical replay selected only after the
  player locks a direction. It exists so a judge can see the entire commitment,
  combat, settlement, proof-export, and verification loop without waiting for a
  live market to expire.
- **Independent verifier:** a browser-local consumer of the exported proof. It
  recomputes the commitment and combat and re-fetches the recorded Somnia block
  and contract results. It does not turn the application server into an
  independent third party.

The final video and submission must show all three surfaces in that order of
importance: game, complete Judge loop, reproducible evidence.

## Claims boundary

The contest build is wallet-free and read-only. It does not connect a wallet,
request an approval, place an order, redeem a position, or claim current
trading volume. `Continue on dreamDEX` measures discovery intent, not a fill,
trader, referral conversion, or revenue event.

The Judge replay uses a finalized historical Event Contract. The full
expedition uses live market discovery and CLOB context. Neither surface may be
described as executing a trade.

Legacy analytics are directional event volumes, not deduplicated humans. Human
completion, comprehension, sharing, referral, and Continue rates remain
unvalidated until the clean-v2 pilot reports raw numerators, denominators,
participant counts, automation exclusions, and version identity.

## No-go list through final submission

Do not add or reopen:

- wallet connection, token approval, order placement, redemption, or any other
  Somnia/Shannon write path;
- new smart contracts, custody, delegation, session keys, or automated trading;
- hosted proof permalinks, persistent accounts, leaderboards, or a new backend;
- AI features, additional tiers, enemies, assets, balance work, or a replacement
  randomness protocol;
- a broad redesign or speculative feature added only to imitate another entry;
  or
- unsupported claims about users, unique visitors, trading conversion, volume,
  revenue, partners, endorsements, or third-party independence.

A surgical presentation or accessibility correction is permitted only when a
cold-judge test or the qualified pilot exposes a material blocker. Any such
change must pass the complete release gates and be identified as a new final
candidate before the video is captured.

## WIN-WB-01 acceptance record

- [x] Behavioral baseline and frozen tag are recorded.
- [x] A ten-second thesis and category position are frozen.
- [x] Exactly five judge-facing claims are defined, one per official criterion.
- [x] Full expedition and short Judge replay are explicitly distinguished.
- [x] Read-only, historical-replay, analytics, and trading-volume boundaries are explicit.
- [x] The no-go list prevents late feature expansion and contradictory claims.
- [x] Every current product claim maps to an existing route, release artifact,
      test surface, or measurement contract; future evidence is labeled as a
      gate rather than a completed result.

The next execution block is **WIN-WB-02: clean human pilot**. Evidence drafting
may run in parallel, but the final video remains after the final release freeze.
