# Market Dungeon — judge evidence pack

Updated 10 September 2026. This document separates implemented behavior, project-controlled checks and human feedback. The authoritative record for this release is [release verification](RELEASE_2026-09-10.md), with its matching [v13 source release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v13). Publication and final deployment checks must be recorded there after execution; an older successful release does not establish them.

## Product and entry points

**Defeat the boss. Predict the market. Survive both.** Market Dungeon makes verified dreamDEX settlement the second victory condition of a fantasy roguelite.

| Experience | Public route | Scope |
| --- | --- | --- |
| Recommended Live Judge | [One-minute demo](https://market-dungeon.vercel.app/shannon/live-judge) | Fresh BTC/USDC market, Shannon `50312`, one guard and one boss |
| Live proof verifier | [Verify live proof](https://market-dungeon.vercel.app/shannon/live-judge/verify) | Signed live lock, deterministic combat, pending-state snapshot and final settlement |
| Historical alternative | [Historical Replay](https://market-dungeon.vercel.app/shannon/judge) | Choice before hidden finalized-market selection on Shannon |
| Historical proof verifier | [Verify replay proof](https://market-dungeon.vercel.app/shannon/verify) | Historical seal/receipt/commitment and direct settlement reproduction |
| Full Expedition | [Complete game](https://market-dungeon.vercel.app) | 40 rooms, four tiers, 15 relics, active five-minute mainnet markets |
| Legacy mainnet historical routes | [/judge](https://market-dungeon.vercel.app/judge) · [/verify](https://market-dungeon.vercel.app/verify) | Preserved older proof and challenge links, chain `5031` |

The market clock is not a combat deadline. One minute describes the contract interval; settlement and the player’s fights can take longer. Historical Replay is an explicit alternative and cannot replace the outcome of a locked live run.

## Why settlement matters

The player must first win the fight. A correct market prediction then keeps the defeated boss down. Neither condition replaces the other, and the prediction does not alter attack damage.

Live Judge and Historical Replay end after a verified prediction loss. Full Expedition instead requires a full-strength rematch against the same boss, using a new five-minute market and the player’s remaining resources. A void preserves earned combat progress without a prediction penalty. An unavailable proof awards no verified outcome.

## What an exported proof establishes

| Claim | Live Judge | Historical Replay |
| --- | --- | --- |
| Player choice | Server-authenticated exact market and direction before stated expiry | Server-authenticated direction before hidden market selection |
| Pre-result evidence | Canonical pre-expiry snapshot of market binding, trading status, unresolved settlement and oracle target | Salted commitment and authenticated encrypted market seal |
| Combat | Server and verifier reproduce the submitted guard-and-boss transcript | Same deterministic combat check |
| Settlement | Exact locked market, verified after expiry | Exact committed finalized market |
| Independent reproduction | Signature, combat, pre-expiry reads and final contract reads | Signature, commitment, combat and final contract reads |

Settlement calls use the fixed BinaryModule and BinarySettlement contracts at the same canonical block hash. The browser checks chain identity, re-fetches that block, repeats the raw calls and validates the payout-derived outcome. The separate verifier loads proof JSON locally and reports `PASS`, `FAIL` or `NOT PROVABLE`.

The receipt authenticates the Market Dungeon environment; it is not an external timestamp, onchain player transaction, third-party endorsement or proof that the server was honest. A deterministic transcript does not prove human play or elapsed play time. The snapshot proves state at its recorded block, not the original finalization transaction. Full Expedition verifies its market settlement, but does not claim Judge-level proof for its local direction lock or random combat.

## Technical checks and release identity

The [current release record](RELEASE_2026-09-10.md) must identify the public source revision, immutable release, Production deployment and `/api/build` match. It also records the checks executed against that revision. No counts from v11 or a prior Preview are silently carried forward.

Before this final release pass, the following targeted checks were recorded on the September 10 candidates:

- A real live Shannon round completed both fights, reached a verified `CURSED` result and exported a proof that passed the separate verifier after fresh RPC reads.
- A real historical Shannon round reached `BLESSED`, exported its proof and passed the historical verifier. Premature reveal and incomplete combat were rejected.
- Full Expedition loaded a real five-minute market and CLOB context, accepted a local omen and executed the first fight action. That check was not a new live 40-room playthrough.
- Mobile regressions exercised substantial monster artwork, readable captions, scrolling and usable touch targets in all three modes, including short phone viewports. These used controlled gameplay fixtures and real hosted assets.
- Shared audio checks covered audible Storm via Enter, unclipped output, subsequent silence and mute in all three modes, plus the Full Expedition action/mute path. Lint, types and optimized builds passed on the tested candidates.

These were project-controlled automated checks, not an independent security audit or proof of universal Safari, AirPods or native sharing behavior. Final current-revision results belong in the release record.

The [v11 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v11), commit `f30b9a56532eb6e3147e7ae8473242545635d0ef`, retains its own historical evidence: 20 mainnet plus 20 Shannon historical round-trips in both Preview and Production, with zero retries. Those counts describe v11, not the later live one-minute implementation.

The immediately preceding public release is [v12](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v12), commit `465ec20ffedda7f3d9841e20178097721384ec1a`. It added RPC-only historical reveal and mobile sharing fixes, and retains its own 20-per-network Preview and Production historical checks. It does not contain the new Live 1-minute game. Both previous tags remain unchanged.

## Human feedback and measurement limits

Three self-reported feedback responses covered Full Expedition and Judge Demo. They informed clearer Bitcoin and prediction explanations, timer semantics, action guidance, Dungeon Log access and image-sharing instructions. Participant identities, private correspondence and raw responses are not published here. The responses do not establish a clean attempt denominator, verified duration or unique-user conversion rate, and are not presented as three independent tests of the later Live Judge mode.

Subsequent owner feedback exposed tiny mobile monsters and a Storm sound associated with losing. The shared mobile layout now preserves full-width illustrations through normal scrolling, and the Storm cue uses irregular pitch movement with an unresolved ending. Targeted regressions followed those fixes. Physical-device feedback establishes the reported issue; browser viewport tests alone do not certify the subsequent fix on every device.

The older analytics baseline recorded 65 visitors and 187 page views during 27 August–3 September, including 28 visitors referred by DoraHacks. Its 17 start, 14 verified-completion and two Continue events include earlier automation and span a schema change. They remain legacy event volumes, not unique-human conversion, and are not combined with clean-v2 counts.

The [clean-v2 definitions](PILOT_MEASUREMENT_V2.md) cover the historical funnel. Live Judge has not established equivalent measured conversion evidence. No current trading-volume, referral-conversion, independent-validator or partnership claim follows from these checks or feedback.

## Ecosystem contribution

The implemented product path is:

`play → choose a prediction → win combat → verify the market → share or invite → play a fresh round`

**Continue on dreamDEX** is also available after verified Shannon results. It is explicitly labeled as a separate mainnet destination. It opens the external dreamDEX application, not another Market Dungeon page, and does not submit an order or carry over the testnet market. A click is not proof of arrival, funding, a fill or trading conversion.

Result cards summarize a run; portable proof JSON is a separate artifact. Saving an image and opening an X draft are separate actions. The app cannot confirm publication or that a downloaded image was saved to iPhone Photos. Invitations create fresh rounds rather than a shared-market duel.

Additional assets, partner campaigns and a separately consented wallet-enabled mode remain future scope. Their effects require direct measurement and, where relevant, explicit partner approval.

## Submission and video

[DoraHacks entry](https://dorahacks.io/buidl/48083) should lead with the Live Judge URL and link the matching source release and [integration report](DREAMDEX_INTEGRATION_REPORT.md). Full Expedition and Historical Replay should remain plainly distinguished.

The existing [1:52 video](https://youtu.be/6IviQrMweZ4) shows an earlier baseline. Replacement video work is deferred by the project owner. It is not a recording of the current Live Judge flow and must not be counted as an updated 2–3 minute submission video.

The official hackathon page displayed an extended deadline of **11 September 2026 at 20:00** when checked on September 10; the display did not establish a timezone. Its submission guidance requires a working testnet prototype, GitHub repository and 2–3 minute demo video. The existing 1:52 baseline therefore remains a presentation requirement gap until the owner addresses video. See [official event details](https://dorahacks.io/hackathon/event-contracts/detail).
