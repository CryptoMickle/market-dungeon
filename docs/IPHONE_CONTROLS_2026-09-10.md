# iPhone controls follow-up — 10 September 2026

Patch release target: **hackathon-submission-2026-v14**. This record covers the mobile controls and recovery follow-up to [v13](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v13). The v13 feature, gameplay and proof baseline remains the preceding release; its completed checks are not presented as tests of this patch. Final source, deployment identities and completed validation belong in the v14 GitHub release notes.

## Feedback and changes

Physical iPhone feedback showed that browser controls reduced the usable screen height: reaching combat or next-room actions required scrolling, and Kevin's shop controls could be visible while the player's status was offscreen. This is qualitative owner feedback. No participant identities, correspondence or original phone images are copied into the public record.

- Combat in Full Expedition and both Judge variants now keeps the action controls in a bottom dock, with current player and enemy HP beside them. The monster illustration retains its full mobile width and can scroll completely above the dock.
- Full Expedition uses a compact loot summary and Kevin portrait. Health, potion count, gold, weapon level and armor level appear beside Kevin's purchases and update after purchases or safe healing. Ordinary room recovery also shows health and potions near its actions.
- Expedition entry positioning finishes before paint, so a delayed scroll reset cannot overwrite the player's first scroll toward the recovery controls.
- Judge recovery places current health and potions next to healing and continue controls. Live guard recovery and historical merchant recovery use compact Kevin portraits; his character copy remains. The historical cleared-room summary takes less space.

These changes affect mobile presentation. Combat rules, prices, healing effects, market locking, settlement proofs and sound behavior are preserved. Desktop layout is retained.

## Focused validation

The deterministic suite is [iphone-controls.spec.ts](../tests/e2e/iphone-controls.spec.ts). It uses **375 × 640** and **390 × 700** CSS viewports to model limited space with phone browser bars visible: three combat-mode scenarios and one Kevin scenario at each size, **eight scenarios per browser engine**.

The scenarios check that all combat buttons and current HP are in view on entry, after hits and during scrolling; touch targets are at least 44 × 44 pixels and not covered; hits do not move the combat page; artwork remains large and can be viewed above the dock; Judge recovery supplies remain visible with its actions; and Kevin's displayed resources update through rest, potion purchase, equipment purchases and safe healing before entering the boss.

| Engine | Recorded status |
| --- | --- |
| Chromium | Eight focused scenarios passed |
| WebKit with iPhone emulation | Eight focused scenarios passed |

The suite runs actual application code with controlled market/RPC fixtures and a validated test save for Full Expedition. It is project-controlled browser QA, not a physical Safari retest, live-provider settlement check or independent user study. The short viewports approximate available space; they do not reproduce every iOS browser-toolbar transition. Updated physical-device feedback remains useful.

The optimized local server speaks HTTP. Only the WebKit fixture's exact loopback document response omits the CSP `upgrade-insecure-requests` directive so its assets load over local HTTP. All other directives remain; hosted HTTPS deployments and the application's security headers are unchanged. Run with `PLAYWRIGHT_PRODUCTION=1 npm run test:e2e:iphone` after the optimized build.

Video is outside this patch's scope.
