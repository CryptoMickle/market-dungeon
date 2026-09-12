# Market Dungeon

**Defeat the boss. Predict the market. Survive both.**

Market Dungeon is a playable fantasy roguelite built for the Somnia × dreamDEX Event Contracts Hackathon. Pick a Bitcoin prediction, fight through the dungeon, and let the verified Event Contract settlement decide whether the defeated boss stays down.

[Watch the 2:08 demo on YouTube](https://youtu.be/PwvNWq-6JWU) · [Choose a mode](https://market-dungeon.vercel.app) · [Play Live Judge](https://market-dungeon.vercel.app/shannon/live-judge) · [Somnia Agent Kevin](https://market-dungeon.vercel.app/somnia-agents) · [DoraHacks](https://dorahacks.io/buidl/48083)

[![Market Dungeon — Defeat the boss. Predict the market. Survive both.](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-YouTube-Thumbnail.png)](https://youtu.be/PwvNWq-6JWU)

The game reads real dreamDEX markets and Somnia contract state. **Full Expedition and both Judge demos need no wallet or transaction.** The optional **Somnia Agent Kevin** mode adds a prediction rival: its default simulator is wallet-free and clearly marked **NO AI**; choosing a real Somnia Agents request requires an explicit MetaMask connection and approval of a quoted Shannon testnet STT deposit plus gas. The game places no dreamDEX order or redemption.

The **2:08 competition film (V3.1)**, available on YouTube with English closed captions, follows a real Live Judge round from choice and combat to market settlement and independent proof verification. It also shows Full Expedition, Historical Replay and actual iPhone play. [Download MP4 (1080p)](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-1080p.mp4) · [English captions (SRT)](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-EN.srt) · [Transcript](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-Transcript-EN.txt) · [Film details](docs/COMPETITION_VIDEO_2026-09-11.md).

## Choose your run

| Mode | Market | What you play | If your prediction is wrong |
| --- | --- | --- | --- |
| [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge) | Fresh BTC/USDC one-minute market on Shannon testnet, chain `50312` | One guard and one boss; combat runs alongside the market | The defeated boss rises for a final strike; the demo ends |
| [Historical Replay](https://market-dungeon.vercel.app/shannon/judge) | Hidden finalized Shannon BTC market, selected after your choice | Two shortened encounters and a sealed historical proof walkthrough | The demo ends after the verified verdict |
| [Full Expedition](https://market-dungeon.vercel.app/expedition) | Active BTC five-minute markets on Somnia mainnet, chain `5031` | 40 rooms, four tiers, shops, camps, loot and 15 relics | The same boss returns at full HP; lock a fresh market and rematch with your remaining resources |
| [Somnia Agent Kevin](https://market-dungeon.vercel.app/somnia-agents) | Same five-minute mainnet markets; optional agent execution on Shannon `50312` | The complete expedition with Kevin as a prediction rival; simulated by default, real testnet agent by choice | The same expedition rematch rules; Kevin’s score never changes combat, rewards or your boss outcome |

The neutral Home offers **Full Expedition**, **Judge Demo** and **Somnia Agent Kevin**, with no mode preselected. Selecting a mode reveals its explanation; requests start only after entering. Inside Judge Demo, choose **Live · 1 min** or **Historical Replay**. The logo returns Home, and Kevin’s prediction stays in the player header during his expedition. The existing mainnet historical routes `/judge` and `/verify` remain available for older links and proofs.

“One minute” describes the live market interval. Combat and final settlement can take longer, and reaching `00:00` never ends a fight or awards a result. Historical Replay targets a short walkthrough; no measured two-minute completion guarantee is claimed.

## Recommended judge walkthrough

1. Open [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge). Read the target and choose **Gold Awakens · BTC UP** or **Shadows Rise · BTC DOWN**. UP means at or above the exact target at settlement; DOWN means below it.
2. Lock your omen while the market has at least 20 seconds remaining. The signed receipt binds that exact market and direction. Its pre-expiry Somnia snapshot confirms an active, unresolved market and the oracle threshold.
3. Defeat the guard and boss using Attack, risky Storm and potions. Healing between encounters avoids retaliation. The prediction changes the boss’s final fate, not attack damage.
4. After combat, the game checks the same market automatically. A correct prediction leaves the boss down; an incorrect one triggers its final strike. A verified void preserves the combat victory without a prediction penalty. Pending or unavailable proof stays pending.
5. Expand **View verified run proof**, export the proof JSON and open [Live Judge verifier](https://market-dungeon.vercel.app/shannon/live-judge/verify). It checks the signed lock, reproduces combat and freshly repeats the recorded Somnia contract reads in the browser.
6. Save a run card, open an X draft, or invite a player to a fresh run. **Continue on dreamDEX** opens a separate BTC five-minute mainnet market; it does not transfer the testnet run or place an order.

Historical Replay is an explicit alternative when a live window or upstream service is unavailable. It never silently replaces the locked live result. Historical exports belong in [Shannon historical verifier](https://market-dungeon.vercel.app/shannon/verify), which preserves their original proof format.

## The complete dungeon

Full Expedition starts at 100 HP, three potions, zero gold, weapon zero, armor zero and no relic. Each ten-room tier begins with a fresh live five-minute omen. Victory requires both combat and a correct prediction. A void does not penalize the player.

After a correct or voided settlement, the boss reward and relic are granted once. A wrong prediction grants no reward and resurrects the same boss at full scaled HP. Remaining HP, potions, equipment, gold, relics and any spent revive carry into the rematch; camp does not reopen. A new run resets everything. A validated local save can resume the matching run and market after reload. See [Full Expedition rules](docs/FULL_EXPEDITION_RULES.md).

All modes share monster artwork, character humor, large mobile combat illustrations, boss defeat and resurrection effects, and a persistent sound switch. All sixteen monsters and Quartermaster Kevin have distinct synthesized intro cues. Click, Attack, Storm and Potion have action sounds, including keyboard activation. Storm’s irregular rising charge and pitch jumps suggest an uncertain spell. The boss score **The Throne Below** plays during active boss combat and stops at knockout, player death or departure. There is no continuous dungeon drone. Focus loss or an audio interruption pauses sound until another player interaction.

The two Judge variants now share a four-step presentation: **Lock omen → Guard → Boss → Fate**. Both show current HP beside recovery actions, an optional safe rest after the boss, the same final stats and sharing controls, and expandable proof details. Their underlying locks and verification formats remain distinct.

## Somnia Agent Kevin

Kevin gets the same public market question, target and timing as the player, without receiving the player’s direction or combat state. His call must be finalized at least ten seconds before market expiry to count. After the game independently verifies settlement, equal calls tie and a void has no winner. The simulator and real agent keep separate personal scorecards; neither affects damage, loot, relics or progression.

For a real request, open Kevin’s **Details**, select **Somnia Agents**, and **Connect MetaMask** before locking. On iPhone, approve the connection and Shannon network in MetaMask, then return to Safari. Connecting shares the selected address but sends no STT and does not lock automatically. Lock separately, approve the quoted testnet request, and return to the game. Loading screens explain each step and provide **Open MetaMask** when available. **Back to game** closes the screen without canceling the wallet request.

The server prepares an unsigned request to the official LLM agent; only the player’s wallet submits it. The adapter verifies the request, committee response and finalization cutoff. A failed, late or rejected request never silently becomes a simulated answer. The first version supplies no price history or odds strategy and claims no prediction advantage. See [Kevin integration, setup and limits](LOCAL_SOMNIA_AGENTS.md).

## What the proof establishes

| Boundary | Live Judge | Historical Replay | Full Expedition |
| --- | --- | --- | --- |
| Choice | Server-signed direction and exact active market before expiry | Direction locked before random selection; market hidden by authenticated encryption and a salted commitment | Direction and active market locked in validated browser-local state |
| Combat | Server replays a bounded deterministic transcript | Server replays a bounded deterministic transcript | Local gameplay randomness and progression; no Judge transcript-proof claim |
| Market | Pre-expiry pending-state snapshot plus post-expiry settlement | Direct settlement of the committed finalized market | Direct settlement of the locally locked active market |
| Independent reproduction | Live proof verifier | Network-specific historical verifier | Browser repeats direct settlement reads before applying the outcome |

All terminal settlement checks bind `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)` to one canonical block hash using EIP-1898. The browser re-fetches the block and exact raw contract results, ABI-decodes them and validates the bindings and payout-derived outcome.

A receipt authenticates the Market Dungeon server environment. Its stated choice time is server-attested, not an onchain player transaction, external timestamp or proof of server honesty. Deterministic combat proves that a transcript follows the published rules, not that a human played it. A snapshot proves contract state at that block; it does not identify the original finalization transaction. CLOB odds are market context and do not enter the settlement proof.

Kevin inherits Full Expedition’s local gameplay boundaries. A separately verified Shannon agent request establishes an eligible agent response, not a Judge combat proof, proof of human play, financial accuracy or a public anti-cheat leaderboard. The agent does not determine or verify dreamDEX settlement.

The detailed endpoints, deployment constants, SDK usage and documentation feedback are in [dreamDEX Integration Report](docs/DREAMDEX_INTEGRATION_REPORT.md). Release checks and evidence limits are in the [judge evidence pack](docs/JUDGE_EVIDENCE_PACK.md).

## Ecosystem value and evidence

Market Dungeon gives game players a reason to understand Event Contracts before funding a wallet: the result changes a victory they earned. Fresh markets become new game content, while result cards and invitations offer a path to another run. The optional dreamDEX link supports further discovery.

Three previously documented self-reported responses covering Full Expedition and Judge Demo informed clearer Bitcoin/omen explanations, timer copy, combat guidance, log discovery and sharing instructions. A later Android/Chrome response understood Attack versus Storm but missed the BTC choice and timer, found potions initially unclear and described repetition. One earlier respondent clarified that they used a computer; that is separate from the Android response and owner-recorded iPhone feedback. See [qualitative feedback and remaining questions](docs/USER_FEEDBACK_2026-09-11.md). These reports are not a clean conversion study or an independent security audit.

No current trading volume, verified referral conversion, unique-human completion rate or partner endorsement is claimed. The existing [clean-v2 measurement definitions](docs/PILOT_MEASUREMENT_V2.md) describe the historical funnel; they must not be treated as measured Live Judge or Kevin results. A larger consented study and a post-fix human retest remain future work.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the URL printed by the development server. The development setup hook generates a missing local `JUDGE_REPLAY_SEAL_KEY` in ignored `.env.local`, preserves unrelated configuration and never prints the secret. An existing invalid nonempty key stops setup instead of being replaced. `npm run setup:local` runs the same setup separately.

Preview and Production need separate stable secrets, each exactly 64 hexadecimal characters (32 bytes). Do not commit them. Key rotation invalidates in-flight seals and changes the trusted receipt key; older proof authentication requires the corresponding trusted historical key. The build does not automatically configure a deployment secret.

For Kevin locally, run `npm run dev:agents` on port 3001. Hosted Kevin is explicitly enabled per environment: `MARKET_DUNGEON_PREVIEW_AGENTS=1` for Vercel Preview or `MARKET_DUNGEON_PRODUCTION_AGENTS=1` for Production. Neither flag enables the other environment, and the simulation playground remains unavailable in Production. See the [operating guide](LOCAL_SOMNIA_AGENTS.md) before enabling paid testnet requests.

## Validate a release

```bash
npx playwright install chromium webkit
npm run release:verify
```

The release script runs lint, explicit TypeScript checks, unit tests, the Shannon proof kernel, an optimized webpack build and deterministic Chromium/WebKit tests. It then builds with Kevin enabled and checks that separate context in both browsers. CI also has a dedicated Agents UI job. These builds replace local `.next` output, so run the aggregate check separately from an active development session. Live-provider checks are separate and must use an explicit target:

```bash
# Historical mainnet and Shannon checks; each requires real upstream services.
LIVE_SMOKE_BASE_URL=https://market-dungeon.vercel.app npm run test:smoke:live -- tests/live/judge-demo-live.spec.ts tests/live/shannon-judge-live.spec.ts

# Opt-in live one-minute proof check: replace <release-commit> with the full SHA.
LIVE_SMOKE_BASE_URL=https://market-dungeon.vercel.app EXPECTED_COMMIT='REPLACE_WITH_FULL_RELEASE_SHA' LIVE_ONE_MINUTE=1 npm run test:smoke:live -- tests/live/live-judge-preview.spec.ts
```

Read [judge evidence pack](docs/JUDGE_EVIDENCE_PACK.md) for the exact source/deployment identity and recorded results. Fixture tests, real-provider tests and physical-device feedback are distinct evidence. `/api/build` exposes the deployment’s source commit for comparison with the release; a successful old release does not validate later changes.

## Source map

- `app/full-expedition.tsx`, `app/gameplay/`: the 40-room run and boss-rematch rules.
- `app/dungeon-home.tsx`, `app/judge-demo-ui.tsx`: neutral mode selection and the shared Judge presentation.
- `app/somnia-agents/`, `lib/somnia-agents/`: Kevin’s header status, wallet connection, request preparation, simulation and response verification.
- `app/live-judge.tsx`, `app/api/live-judge/`: live one-minute entry, signed locks, CLOB context and settlement.
- `app/live-judge-proof.ts`, `app/live-judge-verifier.tsx`: versioned live proof and independent verification.
- `app/market-dungeon.tsx`, `app/api/judge-replay/`, `app/api/shannon/judge-replay/`: historical Judge modes and sealed replay handlers.
- `app/judge-network.ts`, `app/api/dreamdex.ts`, `app/api/dreamdex-odds.ts`: fixed network profiles, indexer and read-only SDK/RPC integration.
- `app/onchain-settlement-proof.ts`, `app/verify-proof.ts`: fail-closed settlement and historical proof reproduction.
- `app/game-audio.tsx`, `app/mobile-battle.module.css`, `app/run-share-panel.tsx`: shared audio, mobile combat and result cards.
- `tests/e2e/`, `tests/live/`: deterministic browser scenarios and explicit-target live checks.

## Delivery, privacy and license

[Submission copy](docs/DORAHACKS_SUBMISSION.md) and the [judge evidence pack](docs/JUDGE_EVIDENCE_PACK.md) describe the current product and its evidence limits. The [v13 release record](docs/RELEASE_2026-09-10.md) establishes the earlier Live Judge feature and proof baseline. Later records cover [iPhone controls](docs/IPHONE_CONTROLS_2026-09-10.md), [HP beside recovery potions](docs/BOSS_RECOVERY_HEALTH_2026-09-10.md) and [CLOB read recovery](docs/CLOB_READ_RECOVERY_2026-09-10.md). The [v17 release record](docs/RELEASE_2026-09-11_KEVIN.md) tracks the Kevin and shared Judge update; compare its recorded source identity with `/api/build` when checking a deployment. The [v16 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v16) retains its earlier software and the existing film assets.

The [2:08 film record](docs/COMPETITION_VIDEO_2026-09-11.md) separates the finished video from its publication status. The [older 1:52 demonstration](https://youtu.be/6IviQrMweZ4) remains an archived baseline, with its original music attribution retained.

The game depends on public dreamDEX indexer and Somnia RPC availability. It keeps a pending result retryable instead of fabricating a price, odds or settlement. Browser-local run state and generated cards are separate from exported proof. Sharing actions do not prove a post was published or that an iPhone image reached Photos.

See [Privacy · Credits · AI Disclosure](https://market-dungeon.vercel.app/credits) and the [versioned disclosure](docs/PROVENANCE_AND_PRIVACY.md). Source is under the [MIT License](LICENSE). Original visual assets remain separate project assets and are not licensed for reuse under the MIT grant unless explicitly marked otherwise.
