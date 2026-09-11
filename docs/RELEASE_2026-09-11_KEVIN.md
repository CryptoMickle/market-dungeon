# Market Dungeon v17 — Kevin and shared Judge update

Implementation record for 11 September 2026 and tag `hackathon-submission-2026-v17`.

The [v17 release notes](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v17) are the authoritative publication and validation record: exact source revision, completed CI, immutable Production deployment, canonical `/api/build` match and executed hosted checks. The source tag identifies this implementation; the evidence below describes scope and limits, not a substitute for those completed checks.

## Product scope

- A neutral Home offers **Full Expedition**, **Judge Demo** and **Somnia Agent Kevin**. Nothing is preselected; each mode explains itself before entry. The Market Dungeon logo returns Home.
- Kevin is a separate expedition save with his prediction/status in the player header. The default simulator is labeled **NO AI**. An optional real Somnia Agents request uses the player's MetaMask wallet on Shannon testnet.
- Real-mode connection occurs before omen lock. It does not send STT or lock automatically. A later explicit lock prepares the quoted testnet request, and the player separately approves its deposit plus gas. Connection, preparation and approval screens explain the MetaMask handoff; dismissing them does not cancel a pending request.
- Mobile improvements keep substantial monster artwork and current HP beside recovery decisions. Desktop room and status information remains stable between encounters.
- Live and Historical Judge share a four-step header, UP/DOWN choices, guard recovery, inline post-boss rest, final stats, sharing, dreamDEX handoff and collapsed proof details. Historical manual reveal, hidden identity and sealed transcripts remain distinct from live target/countdown/CLOB and automatic settlement checks.

## Hosted configuration

Production Kevin requires `MARKET_DUNGEON_PRODUCTION_AGENTS=1` at build and runtime with Vercel's Production environment. The canonical origin is `https://market-dungeon.vercel.app`. Preview uses its separate `MARKET_DUNGEON_PREVIEW_AGENTS=1` gate and origin; local development uses `MARKET_DUNGEON_LOCAL_AGENTS=1`. Production cannot use the local filesystem adapter, and `/somnia-agents/playground` remains unavailable there.

Production and Preview require separate stable `JUDGE_REPLAY_SEAL_KEY` values. Hosted Kevin tickets are authenticated, encrypted and bound to the accepted origin. They do not transfer between environments or different accepted origins; a Production redeployment preserves tickets at the canonical origin when its stable key is retained. They do not establish a public anti-cheat ledger. No secret or wallet private key belongs in this record.

## Evidence recorded before the final release pass

These checks apply to the tested source candidates, not automatically to the final public deployment:

- Shared Judge regression checks: 23 focused desktop cases and seven WebKit cases passed.
- Six adjacent audio, navigation and mobile portable-proof cases passed; four independent visual scenarios inspected both Judge setups and Kevin recovery on desktop and a short iPhone-sized viewport.
- Scoped lint and TypeScript checks passed for those UI candidates.
- Kevin checks include controlled wallet-provider flows, loading-screen behavior, SDK desktop connection/QR inspection, real unsigned testnet request preparation and protocol reads, and recovery of existing public LLM request `13803304`.

The release script now explicitly includes a separate optimized Kevin-enabled build and Chromium/WebKit pass after the ordinary game checks; CI also has an independent Agents UI job. This documents the configured coverage, not a claim that the final aggregate run has already passed.

The earlier [v13 release](RELEASE_2026-09-10.md), later patch records and [v16 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v16) retain their own evidence. Their live-round counts are not reused as proof that v17 passed.

## Publication and validation

See the [authoritative release notes and attached validation](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v17) for the exact public build and results. [GitHub CI](https://github.com/CryptoMickle/market-dungeon/actions/workflows/ci.yml) records the optimized ordinary-game and Kevin-enabled test jobs separately. The [submission copy](DORAHACKS_SUBMISSION.md) records the intended DoraHacks description. Existing video, captions and media assets are unchanged by this release.

## Evidence and product limits

Full Expedition and Judge Demo are wallet-free; real Kevin is not. A newly funded end-to-end Kevin run on a physical iPhone is not established by the listed checks. Emulated WebKit and SDK QR checks are distinct from a real Safari-to-MetaMask approval session. Neither response verification nor committee consensus establishes forecasting accuracy.

The public mainnet market and optional Shannon agent have separate roles. Kevin sees the public question, target and timing, without player direction or combat state. Responses finalized after the ten-second cutoff are excluded. A failed real request never silently becomes simulated; the dungeon can continue without a rival response. An approved request may incur its testnet fee even if it is late or cannot be scored.

The hosted personal scorecard has no global first-transaction registry, durable distributed rate limit or public leaderboard. RPC/archive outages may prevent reproducing a response. Full Expedition's lock and combat remain local gameplay, not Judge transcript proof. See [Kevin's operating guide](../LOCAL_SOMNIA_AGENTS.md), [integration report](DREAMDEX_INTEGRATION_REPORT.md) and [evidence pack](JUDGE_EVIDENCE_PACK.md).

The [qualitative feedback update](USER_FEEDBACK_2026-09-11.md) includes a later Android/Chrome response and distinguishes an earlier computer-device correction from owner iPhone feedback. No post-fix human retest or improvement in retention/conversion is claimed.

## Existing video preserved

This release changes no video file, narration, caption, title, description, thumbnail or YouTube publication. The existing [film record](COMPETITION_VIDEO_2026-09-11.md) and v16 media assets remain the source of video evidence. The added Kevin mode is described in the product and documentation; the film is not presented as evidence of an agent request.
