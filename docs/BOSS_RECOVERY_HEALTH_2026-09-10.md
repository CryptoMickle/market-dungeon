# Boss recovery health - 10 September 2026

Patch target: **hackathon-submission-2026-v15**, following the [v14 iPhone controls patch](IPHONE_CONTROLS_2026-09-10.md).

Additional physical iPhone feedback showed the Full Expedition settlement-waiting potion button without the distant player header. Players could spend a potion without seeing their current health. This is qualitative owner feedback; the private phone image is not included.

## Change

- Current HP, potion count and a health bar sit immediately above the recovery decision on the boss settlement-waiting screen and before a cursed boss rematch.
- Full Expedition's recovery potion button displays the actual capped healing amount, such as +10 HP at 90/100, and remains disabled when empty or at full health.
- The same compact supplies component is used for ordinary expedition recovery, Live Judge recovery and Historical Replay recovery. The historical boss-verdict screen now also shows supplies before visiting Kevin. Supplies remain visible on desktop as well as mobile.
- Recovery touch controls are at least 48 pixels high. Existing combat, Kevin purchases, potion effects, market locks, boss outcomes and proof rules are unchanged.

## Validation

The focused [iPhone suite](../tests/e2e/iphone-controls.spec.ts) now has 12 scenarios at 375 x 640 and 390 x 700, including boss waiting and rematch. It checks health and the action in the same viewport after scrolling, 40 -> 65 -> 90 -> 100 HP updates, the final +10 HP amount, inventory consumption, full-health disabling and persisted recovery after reload. Both Judge paths also continue through boss knockout and rest.

All 12 scenarios passed locally in Chromium and all 12 in WebKit against the optimized build. Lint, type checking, the optimized build, 209 unit/integration tests and 7 Shannon kernel tests passed. Existing desktop/mobile potion scenarios additionally check current supplies and capped healing. Final CI and hosted validation, source and deployment identities are recorded in the v15 release notes after completion.

These are controlled browser tests of actual application code, not a new physical iPhone retest, live-provider settlement run or independent user study. The v13/v14 releases retain their earlier evidence. Generated test screenshots may be used as QA evidence and are distinct from the owner's phone image.
