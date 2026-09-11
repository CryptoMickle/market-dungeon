# Market Dungeon · Somnia Agent Kevin integration and operating guide

**Somnia Agent Kevin** is a separate expedition mode with Kevin as a prediction rival. Ordinary Full Expedition and Judge Demo keep their own gameplay, so the existing demonstration video remains applicable to those modes. Local development, Vercel Preview and Production each require an explicit environment-specific enable flag. The [v17 release record](docs/RELEASE_2026-09-11_KEVIN.md) tracks publication and evidence; this update does not change the competition video.

## Try it

- **Home:** <http://localhost:3001/>. Opens with no mode selected. Select a name to see its explanation, then enter. No market or agent request starts on Home.
- **Full Expedition:** <http://localhost:3001/expedition>. The original forty-room game, without the rival. Quartermaster Kevin keeps his ordinary merchant role.
- **Judge Demo:** <http://localhost:3001/shannon/live-judge>. The original demo, with Live 1 Min and Historical Replay choices inside it. Neither demo sends agent requests.
- **Somnia Agent Kevin · New!:** <http://localhost:3001/somnia-agents>. The separate forty-room rival mode. Enter the dungeon and lock a real five-minute BTC market. Somnia Agent Kevin gets the same market; his status stays with the player header, and **Details** opens the full rivalry. Your boss result still depends on your own prediction.
- **Quick playground:** <http://localhost:3001/somnia-agents/playground>. Choose UP or DOWN, lock, and try simulated UP/DOWN/VOID results. The late-answer and no-answer scenarios show how Kevin sits out. This entire page is a simulation.
- The default **Try locally** (or **Simulated Kevin** when hosted) mode makes a random test choice independent of the player's choice. Hosted simulation derives a repeatable choice for the same attempt and market. It does not run an AI or a Somnia agent; the interface labels it **NO AI**. It lets you test the interaction without a wallet.
- Inside the Somnia Agent Kevin game, open Kevin’s **Details**, choose the real-agent option and press **Connect MetaMask**. On iPhone, keep the game in Safari, approve the connection in the MetaMask app, then return to Safari. Connecting does not lock an omen or send STT. Once connected, lock your omen separately; MetaMask then asks you to approve Kevin’s paid request on Shannon testnet. Declining that request leaves the dungeon playable. Use testnet STT, never mainnet funds.
- The three mode choices appear only on Home. The Market Dungeon logo returns there from the game without preselecting a mode. Judge Demo offers Live 1 Min / Historical Replay on Home and during demo setup. Agent participation belongs exclusively to **Somnia Agent Kevin**; historical replay is excluded because its result already exists before the prediction.

To start locally, double-click `Start Local Agents.command`, or run `npm run dev:agents` from this directory. Port 3001 keeps this development server separate from a localhost:3000 game. The Mac must stay awake and the local server must remain running. Hosted routes use the deployment origin instead; Production is `https://market-dungeon.vercel.app` and does not depend on the Mac. The playground is only for local/Preview testing and returns 404 in Production.

Somnia Agent Kevin uses a separate expedition save key, so switching modes does not overwrite progress in ordinary Full Expedition or Judge Demo. Home shows **Continue Run** for active saves and **View Last Run** for finished runs; a fresh expedition can be started from the result screen. Live Judge resumes its verified save in the same tab. Historical Replay preserves its original seal and actions across same-tab Home navigation, but a page reload or browser restart starts a new replay. The rival scorecard keeps simulator and real-agent results separate.

## What the genuine integration does

1. In real-agent mode, the player explicitly connects MetaMask before locking an omen. An unsuccessful connection leaves the omen unlocked, and connection success never locks automatically. The player then locks an omen using the existing expedition rules.
2. The browser sends only the attempt ID, public market ID and selected rival mode to the rival API. Player direction, combat state and arbitrary prompts are rejected.
3. The server fetches the exact active BTC five-minute market from the existing mainnet indexer and constructs an allowlisted snapshot bound to the round. Kevin's deadline is ten seconds before market expiry.
4. Real mode encodes the official LLM agent's `inferString` call with a fixed system prompt, no tools, and allowed outputs `UP`/`DOWN`. It reads the deposit and committee settings and prepares an unsigned testnet transaction. There is no server wallet or private key.
5. The player's browser wallet submits `createRequest` on Shannon. The adapter checks the specific transaction, request, input, committee majority, response and canonical finalization time. It never accepts a late answer or substitutes simulation for a failed real request.
6. Only the game's existing independently verified market settlement can produce a rivalry result. Equal calls tie; a void market has no winner. No combat stats, gold, relics or boss rules change.

The market runs on **Somnia mainnet (5031)**; the optional agent executes on **Shannon testnet (50312)**. These are separate roles. The agent does not verify the market settlement.

The model sees the market question, target and timing. This first version does not supply a live price history or an odds strategy. There is no demonstrated prediction advantage, and validator consensus confirms execution, not financial accuracy.

## Local operation and limits

- `MARKET_DUNGEON_LOCAL_AGENTS=1` enables local Kevin and playground routes when `VERCEL` is not set. `/` is the neutral common homepage; `/expedition` is the ordinary game. The filesystem adapter accepts only same-origin requests from a loopback host and is disabled on Vercel.
- Hosted deployments require an explicit flag at build and runtime: `MARKET_DUNGEON_PREVIEW_AGENTS=1` with `VERCEL_ENV=preview`, or `MARKET_DUNGEON_PRODUCTION_AGENTS=1` with `VERCEL_ENV=production`. The flags do not enable one another. Production uses the fixed canonical origin `https://market-dungeon.vercel.app`; unrelated production aliases cannot create rival rounds. The playground stays hidden and returns 404 in Production.
- `.local/somnia-agents/` stores immutable local rounds so reloads and preparation retries cannot reroll Kevin's choice. This directory and `.env.local` are ignored by Git. They contain local prototype state; there is no public leaderboard or anti-cheat claim.
- A genuine request requires the currently quoted testnet STT deposit plus gas. The server reads the platform's fee and committee settings during preparation; the game and wallet show the request for approval. A fixed current fee is not promised.
- The recorded evidence does not include a newly funded end-to-end Kevin run. The wallet send flow is tested with a mock provider; request preparation and protocol reads are tested against the real testnet. These checks must not be described as a paid physical-device run.
- Shannon limits log reads to 1,000 blocks and the current platform deletes finalized requests. The adapter uses indexed, paginated log reads and reconstructs accepted responses from historical state and successful validator submissions. That recovery was exercised against existing public LLM request `13803304`; a reverted third submission was excluded. Unsupported nested submission paths fail closed.
- Reloads resume polling an already submitted hash, never resubmit a transaction. If a wallet fails to return a hash, check its activity before trying another paid request.
- Missing/late answers and RPC outages leave normal play available. A rivalry may remain unscored if the required evidence cannot be reproduced.

## Hosted operation and wallet handoff

The same neutral Home offers Somnia Agent Kevin when the appropriate hosted flag is enabled. Kevin stays in the status bar throughout the expedition. Simulated Kevin is clearly marked as random, with no AI or onchain agent. Open his Details before locking an omen to choose a genuine Shannon testnet request.

On iPhone, both the simulator and genuine requests can start in Safari. Select the real-agent option in Kevin’s Details and press **Connect MetaMask** to connect to the MetaMask app. Approve there and return to Safari; the omen stays unlocked until you separately press **Lock**. Connection shares the selected wallet address but sends no STT. After locking, approve Kevin’s testnet STT request in MetaMask and return to the game. An installed browser wallet can also provide the connection. The server has no wallet or private key and never sends a transaction. Simulated Kevin needs no wallet or STT.

The mobile connection uses pinned `@metamask/connect-evm` 2.1.1. Real-mode selection only preloads its code; the explicit Connect tap initializes the wallet session. A visible **Open MetaMask** link is provided if Safari blocks automatic app opening. Approve adding or switching to Shannon if requested. The SDK includes Ethereum in its connection permissions; Kevin's transaction remains pinned to Shannon, the official agent platform and a bounded deposit. Account or network changes invalidate the game's ready connection. Wallet analytics are disabled and the application CSP permits the specific MetaMask WebSocket endpoint.

Separate loading screens explain connection, preparing the quoted request, and approving the transaction. They include sound control and an **Open MetaMask** link when the SDK supplies one. **Back to game** dismisses the screen without canceling a pending wallet request; the header and Details retain its state and allow reopening it. Connection does not lock automatically. After returning from the wallet, an expired market must be refreshed before a new lock; no stale market is silently substituted into an existing round.

Hosted rounds use encrypted, authenticated browser-carried tickets instead of the Mac's filesystem. Tickets contain the server-read snapshot and prepared request, are bound to the deployment's accepted origin, and expire seven days after the market. Keys are derived with a separate protocol domain from that environment's existing `JUDGE_REPLAY_SEAL_KEY`; Preview and Production use separate secrets. The client saves each refreshed ticket and any submitted transaction hash before navigation; reloading verifies the same saved evidence and never resends a wallet transaction automatically.

Simulation choices are deterministic for the same attempt and market within a deployment, so retrying preparation or reaching a different server instance does not reroll the direction. Real results still require the existing testnet transaction and validator verification, including the cutoff; failures never become simulated answers.

This is a personal scorecard, not a public leaderboard or a distributed anti-cheat ledger. A retained older valid ticket can be replayed; there is no shared global first-transaction registry or distributed rate limit. A refreshed ticket binds its reported transaction and rejects a different hash. Neither the rival ticket nor its score changes the expedition's independently verified market settlement, rewards, or combat. Clearing browser storage loses the saved rivalry. Preview tickets belong to the exact immutable preview URL; Production tickets belong to the canonical production origin. Tickets do not transfer between these environments.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` cover the project and adapter. `npm run test:e2e:agents` exercises the playground and full-game integration in desktop Chromium and iPhone WebKit. `npm run release:verify:agents` first builds with Kevin enabled and runs those checks against an optimized server; the aggregate `npm run release:verify` includes that pass after the ordinary game checks. CI has an independent Agents UI job. Run builds separately from an active development session because they replace `.next`. Browser test markets/agent responses are fixtures; they are never written into the normal game's settlement logic.

Official references: [Somnia Agents](https://docs.somnia.network/agents), [LLM inference](https://docs.somnia.network/agents/base-agents/llm-inference), [contract interface](https://docs.somnia.network/agents/invoking-agents/from-solidity), [fees](https://docs.somnia.network/agents/invoking-agents/gas-fees), [official LLM agent](https://agents.testnet.somnia.network/agent/12847293847561029384).
