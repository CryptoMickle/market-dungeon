# Market Dungeon — judge evidence pack

Updated 11 September 2026. This document separates implemented behavior, project-controlled checks, recorded gameplay and human feedback. The [v13 release record](RELEASE_2026-09-10.md) establishes the Live Judge feature and proof baseline; later [iPhone controls](IPHONE_CONTROLS_2026-09-10.md), [recovery health](BOSS_RECOVERY_HEALTH_2026-09-10.md) and [CLOB read recovery](CLOB_READ_RECOVERY_2026-09-10.md) records cover subsequent changes. The [v17 release record](RELEASE_2026-09-11_KEVIN.md) tracks the Kevin and shared Judge update, including publication status. Compare its recorded source identity with deployment `/api/build`. The earlier [v16 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v16) retains its own software and film assets; an older successful release does not validate later changes.

## Product and entry points

**Defeat the boss. Predict the market. Survive both.** Market Dungeon makes verified dreamDEX settlement the second victory condition of a fantasy roguelite.

| Experience | Public route | Scope |
| --- | --- | --- |
| Neutral Home | [Choose a mode](https://market-dungeon.vercel.app) | Full Expedition, Judge Demo or Somnia Agent Kevin; explanation before entering |
| Recommended Live Judge | [One-minute demo](https://market-dungeon.vercel.app/shannon/live-judge) | Fresh BTC/USDC market, Shannon `50312`, one guard and one boss |
| Live proof verifier | [Verify live proof](https://market-dungeon.vercel.app/shannon/live-judge/verify) | Signed live lock, deterministic combat, pending-state snapshot and final settlement |
| Historical alternative | [Historical Replay](https://market-dungeon.vercel.app/shannon/judge) | Choice before hidden finalized-market selection on Shannon |
| Historical proof verifier | [Verify replay proof](https://market-dungeon.vercel.app/shannon/verify) | Historical seal/receipt/commitment and direct settlement reproduction |
| Full Expedition | [Complete game](https://market-dungeon.vercel.app/expedition) | 40 rooms, four tiers, 15 relics, active five-minute mainnet markets |
| Somnia Agent Kevin | [Prediction rival](https://market-dungeon.vercel.app/somnia-agents) | Separate expedition; simulated rival by default, optional wallet-approved Shannon agent request |
| Legacy mainnet historical routes | [/judge](https://market-dungeon.vercel.app/judge) · [/verify](https://market-dungeon.vercel.app/verify) | Preserved older proof and challenge links, chain `5031` |

The market clock is not a combat deadline. One minute describes the contract interval; settlement and the player’s fights can take longer. Historical Replay is an explicit alternative and cannot replace the outcome of a locked live run.

Both Judge variants share a four-step layout, guard recovery, optional post-boss rest, current HP and potion counts, result summary, sharing, dreamDEX handoff and collapsed technical proof details. Live still has a fresh target, countdown, optional CLOB context and automatic post-combat checks. Historical still hides the finalized market selected after your choice and requires a manual reveal after combat and the anti-peek hold. Shared presentation does not merge the proof formats.

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

## Kevin's separate evidence boundary

Somnia Agent Kevin inherits Full Expedition's local lock and combat rules. The default simulated rival is labeled **NO AI**, uses no wallet and creates no onchain agent request. Its local random or hosted deterministic test choice is not evidence of model inference.

The real option requires an explicit MetaMask connection followed by a separately approved Shannon `50312` request carrying the quoted testnet STT deposit plus gas. The server has no wallet or private key. It constructs a fixed prompt from the public mainnet `5031` market question, target and timing; player direction and combat state are excluded. The adapter checks the exact transaction, request, committee response and canonical finalization time against a cutoff ten seconds before market expiry. It does not use the model to establish settlement and does not replace failed requests with simulation.

The recorded agent checks cover mock-wallet interaction, real unsigned preparation and protocol reads, plus recovery of an existing public finalized LLM request. They do not establish a newly funded, end-to-end Kevin run from a physical iPhone. Kevin has no demonstrated prediction advantage. The browser-carried scorecard has no global first-transaction registry, durable distributed rate limit or public anti-cheat claim. Full protocol and operating limits are in the [Kevin guide](../LOCAL_SOMNIA_AGENTS.md).

## Technical checks and release identity

A release record must identify the public source revision, immutable release, Production deployment and `/api/build` match, along with the checks executed against that revision. The [v13 record](RELEASE_2026-09-10.md) and subsequent patch records preserve their own evidence. No counts from v11 or a prior Preview are silently carried forward.

Before this final release pass, the following targeted checks were recorded on the September 10 candidates:

- A real live Shannon round completed both fights, reached a verified `CURSED` result and exported a proof that passed the separate verifier after fresh RPC reads.
- A real historical Shannon round reached `BLESSED`, exported its proof and passed the historical verifier. Premature reveal and incomplete combat were rejected.
- Full Expedition loaded a real five-minute market and CLOB context, accepted a local omen and executed the first fight action. That check was not a new live 40-room playthrough.
- Mobile regressions exercised substantial monster artwork, readable captions, scrolling and usable touch targets in all three modes, including short phone viewports. These used controlled gameplay fixtures and real hosted assets.
- Shared audio checks covered audible Storm via Enter, unclipped output, subsequent silence and mute in all three modes, plus the Full Expedition action/mute path. Lint, types and optimized builds passed on the tested candidates.

These were project-controlled automated checks, not an independent security audit or proof of universal Safari, AirPods or native sharing behavior. Final current-revision results belong in the release record.

The September 11 shared Judge candidate subsequently passed 23 focused desktop browser checks and seven WebKit checks, plus six adjacent audio, navigation and mobile proof checks. Four independent visual scenarios inspected setup and Kevin recovery at desktop and short iPhone-sized viewports. These were controlled source-candidate checks; the [v17 record](RELEASE_2026-09-11_KEVIN.md) separately records the final build, hosted gate and Production checks. Emulated WebKit is not a physical-device MetaMask handoff test.

The [v11 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v11), commit `f30b9a56532eb6e3147e7ae8473242545635d0ef`, retains its own historical evidence: 20 mainnet plus 20 Shannon historical round-trips in both Preview and Production, with zero retries. Those counts describe v11, not the later live one-minute implementation.

The earlier [v12](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v12), commit `465ec20ffedda7f3d9841e20178097721384ec1a`, added RPC-only historical reveal and mobile sharing fixes, and retains its own 20-per-network Preview and Production historical checks. It does not contain the new Live 1-minute game. Both previous tags remain unchanged.

## Human feedback and measurement limits

Three previously documented self-reported feedback responses covered Full Expedition and Judge Demo. They informed clearer Bitcoin and prediction explanations, timer semantics, action guidance, Dungeon Log access and image-sharing instructions. A later Android/Chrome response reported reaching level/room 9 and dying, understood Attack versus Storm, but missed BTC and the clock, found potions initially unclear and described repetition. An earlier respondent separately corrected their device to a computer; their browser was not specified. The [September 11 feedback record](USER_FEEDBACK_2026-09-11.md) preserves these distinctions without publishing participant identities or private correspondence. No clean attempt denominator, verified duration or unique-user conversion rate is established, and these responses are not presented as independent tests of the latest build.

Subsequent owner feedback exposed tiny mobile monsters and a Storm sound associated with losing. The shared mobile layout now preserves full-width illustrations through normal scrolling, and the Storm cue uses irregular pitch movement with an unresolved ending. Targeted regressions followed those fixes. Physical-device feedback establishes the reported issue; browser viewport tests alone do not certify the subsequent fix on every device.

The older analytics baseline recorded 65 visitors and 187 page views during 27 August–3 September, including 28 visitors referred by DoraHacks. Its 17 start, 14 verified-completion and two Continue events include earlier automation and span a schema change. They remain legacy event volumes, not unique-human conversion, and are not combined with clean-v2 counts.

The [clean-v2 definitions](PILOT_MEASUREMENT_V2.md) cover the historical funnel. Live Judge has not established equivalent measured conversion evidence. No current trading-volume, referral-conversion, independent-validator or partnership claim follows from these checks or feedback.

## Ecosystem contribution

The implemented product path is:

`play → choose a prediction → win combat → verify the market → share or invite → play a fresh round`

**Continue on dreamDEX** is also available after verified Shannon results. It is explicitly labeled as a separate mainnet destination. It opens the external dreamDEX application, not another Market Dungeon page, and does not submit an order or carry over the testnet market. A click is not proof of arrival, funding, a fill or trading conversion.

Result cards summarize a run; portable proof JSON is a separate artifact. Saving an image and opening an X draft are separate actions. The app cannot confirm publication or that a downloaded image was saved to iPhone Photos. Invitations create fresh rounds rather than a shared-market duel.

Kevin now offers a separately selected wallet-enabled testnet path. Its availability does not establish adoption, forecasting accuracy or conversion. A larger consented study, post-fix human retesting and partner campaigns remain future scope; their effects require direct measurement and, where relevant, explicit partner approval.

## Submission and video

[DoraHacks BUIDL 48083](https://dorahacks.io/buidl/48083) should lead with the [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge), the source repository and the [integration report](DREAMDEX_INTEGRATION_REPORT.md). Full Expedition, Historical Replay and the optional Somnia Agent Kevin addition remain plainly distinguished. The Kevin update does not alter the existing film or claim that it demonstrates an agent transaction.

The finished **2:08 competition film (V3.1)** shows a real Live Judge run: BTC UP was locked, both fights were won, BTC settled DOWN, and the boss returned for its final strike. The exported proof passed the separate verifier. `PASS` establishes that the evidence matches; it does not turn the recorded prediction loss into a victory.

The same recorded run supplies the live outcome, verifier and exported card. Separate, labeled excerpts show Full Expedition, Historical Replay and owner-recorded iPhone play. Original character-art interludes and readable detail crops support the edit; they are not additional gameplay or human tests. The film is edited, not a continuous two-minute completion benchmark, and does not establish a complete 40-room run.

The [1080p film](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-1080p.mp4), [English SRT captions](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-EN.srt) and [transcript](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-Transcript-EN.txt) are published as additional v16 GitHub release assets. The revised [YouTube film](https://youtu.be/oTSAhrxywbw) is public, with 1080p playback and updated English closed captions checked; see the [film record](COMPETITION_VIDEO_2026-09-11.md). The project entry is [DoraHacks BUIDL 48083](https://dorahacks.io/buidl/48083). The older [1:52 baseline](https://youtu.be/6IviQrMweZ4) is retained as historical material, not the current Live Judge demonstration.

The event guidance checked on September 10 requested a working testnet prototype, GitHub repository and 2–3 minute demo video. The new film is within that duration. V3.1 updates the narration order and captions; it does not add a user test or change the recorded result. See [official event details](https://dorahacks.io/hackathon/event-contracts/detail).
