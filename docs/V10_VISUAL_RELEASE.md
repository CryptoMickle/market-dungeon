# Market Dungeon v10 — game-first Judge presentation

Status: **released at `hackathon-submission-2026-v10`; retained as the stable behavioral baseline**

v10 is a presentation-focused release built on the released v9 trust and
verification architecture. It changes hierarchy, density, and responsive
layout; it does not add wallet authority, contract writes, or a new onchain
claim.

## Judge-facing changes

- The opening Judge view is one focused 1280×720 action surface with a clear
  omen choice, lock action, five-step path, and concise trust signals.
- The sealed receipt is a compact, browser-verified summary by default while
  its complete algorithm, key fingerprint, commitment, and timing evidence
  remain available on demand.
- Combat prioritizes the enemy scene, player status, and actions while keeping
  replay state and progress visible without repeating the site chrome.
- The result leads with the two victory conditions and the social-ready
  1200×675 run card. Share and challenge actions are adjacent to the card;
  portable proof, dreamDEX context, and raw technical evidence follow in a
  clear disclosure hierarchy.
- Desktop and 390 px mobile retain the same claims and actions with deliberate
  responsive ordering.

## Preserved evidence boundary

- The direction is locked before the replay market is revealed.
- The server-authenticated Ed25519 receipt and salted commitment are unchanged.
- Combat remains deterministically replayed and server-verified.
- The two settlement reads remain pinned to one canonical Somnia block hash.
- The independent verifier still returns only `PASS`, `FAIL`, or
  `NOT PROVABLE` after reproducing the proof.
- Sharing remains separate from proof export and never places proof JSON in a
  social post.

## Release gates

The exact frozen commit must pass lint, TypeScript, unit tests, Shannon
proof-kernel tests, optimized production build, and the complete deterministic
browser suite. The identical commit must then pass a twenty-run, zero-retry
live Judge → proof export → independent verifier gate on Preview and again on
Production. Deployment origins, commit identity, receipt-key fingerprint,
test windows, and an exported-proof checksum belong in the GitHub release
evidence rather than in this frozen source file.

The final competition video is deliberately produced only after the final
release freeze. The published baseline video remains the public fallback until
one new Production capture, captions, and embed have been separately verified.
