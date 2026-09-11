# Market Dungeon · Somnia Agents prototype

This is a separate local prototype based on the published Market Dungeon build. **Somnia Agents** is its own mode, with **Somnia Agent Kevin** as a prediction rival. Ordinary Full Expedition and Judge Demo keep their original gameplay, so the existing demonstration video remains applicable to those modes. The mode can now also be enabled in a dedicated Vercel Preview. It remains disabled in production; this preview does not update the competition submission or its video.

## Try it

- **Home:** <http://localhost:3001/>. Opens with no mode selected. Select a name to see its explanation, then enter. No market or agent request starts on Home.
- **Full Expedition:** <http://localhost:3001/expedition>. The original forty-room game, without the rival. Quartermaster Kevin keeps his ordinary merchant role.
- **Judge Demo:** <http://localhost:3001/shannon/live-judge>. The original demo, with Live 1 Min and Historical Replay choices inside it. Neither demo sends agent requests.
- **Somnia Agents · New!:** <http://localhost:3001/somnia-agents>. The separate forty-room rival mode. Enter the dungeon and lock a real five-minute BTC market. Somnia Agent Kevin gets the same market; his status stays with the player header, and **Details** opens the full rivalry. Your boss result still depends on your own prediction.
- **Quick playground:** <http://localhost:3001/somnia-agents/playground>. Choose UP or DOWN, lock, and try simulated UP/DOWN/VOID results. The late-answer and no-answer scenarios show how Kevin sits out. This entire page is a simulation.
- The default **Try locally** (or **Simulated Kevin** on Vercel Preview) mode makes an independent random test choice. It does not run an AI or a Somnia agent. It lets you test the interaction without a wallet.
- Inside the Somnia Agents game, open Kevin’s **Details** and choose the real-agent option before locking an omen to request a validator-executed prediction on Shannon testnet. Use a browser with a wallet extension and testnet STT. The wallet asks you to approve each paid request; declining leaves the dungeon playable. Never use mainnet funds.
- The three mode choices appear only on Home. The Market Dungeon logo returns there from the game without preselecting a mode. Judge Demo offers Live 1 Min / Historical Replay on Home and during demo setup. Agent participation belongs exclusively to **Somnia Agents**; historical replay is excluded because its result already exists before the prediction.

To start again, double-click `Start Local Agents.command`, or run `npm run dev:agents` from this directory. Port 3001 keeps the prototype separate from the original localhost:3000 game. The Mac must stay awake and the server must remain running.

Somnia Agents uses a separate expedition save key, so switching modes does not overwrite progress in ordinary Full Expedition or Judge Demo. Home shows **Continue Run** for active saves and **View Last Run** for finished runs; a fresh expedition can be started from the result screen. Live Judge resumes its verified save in the same tab. Historical Replay preserves its original seal and actions across same-tab Home navigation, but a page reload or browser restart starts a new replay. The rival scorecard keeps simulator and real-agent results separate.

## What the genuine integration does

1. The player locks an omen using the existing expedition rules.
2. The browser sends only the attempt ID, public market ID and selected rival mode to the rival API. Player direction, combat state and arbitrary prompts are rejected.
3. The server fetches the exact active BTC five-minute market from the existing mainnet indexer and constructs an allowlisted snapshot bound to the round. Kevin's deadline is ten seconds before market expiry.
4. Real mode encodes the official LLM agent's `inferString` call with a fixed system prompt, no tools, and allowed outputs `UP`/`DOWN`. It reads the deposit and committee settings and prepares an unsigned testnet transaction. There is no server wallet or private key.
5. The player's browser wallet submits `createRequest` on Shannon. The adapter checks the specific transaction, request, input, committee majority, response and canonical finalization time. It never accepts a late answer or substitutes simulation for a failed real request.
6. Only the game's existing independently verified market settlement can produce a rivalry result. Equal calls tie; a void market has no winner. No combat stats, gold, relics or boss rules change.

The market runs on **Somnia mainnet (5031)**; the optional agent executes on **Shannon testnet (50312)**. These are separate roles. The agent does not verify the market settlement.

The model sees the market question, target and timing. This first version does not supply a live price history or an odds strategy. There is no demonstrated prediction advantage, and validator consensus confirms execution, not financial accuracy.

## Local operation and limits

- `MARKET_DUNGEON_LOCAL_AGENTS=1` enables the additional local navigation button and the `/somnia-agents` and `/somnia-agents/playground` routes. `/` is the neutral common homepage; `/expedition` is the ordinary game. The filesystem adapter is disabled when `VERCEL` is set. Its local API accepts only same-origin requests from a loopback host. An explicit `MARKET_DUNGEON_PREVIEW_AGENTS=1` flag, present at both build and runtime with `VERCEL_ENV=preview`, enables the separate hosted adapter. Production remains disabled.
- `.local/somnia-agents/` stores immutable local rounds so reloads and preparation retries cannot reroll Kevin's choice. This directory and `.env.local` are ignored by Git. They contain local prototype state; there is no public leaderboard or anti-cheat claim.
- A genuine request requires testnet STT and gas. The unsigned quote was read successfully from Shannon on 11 September 2026: 0.24 STT at the then-current committee settings. The wallet shows the actual request; fees and availability may change.
- No funded agent transaction was sent while implementing this version. The wallet send flow is tested with a mock provider; request preparation and protocol reads are tested against the real testnet. A funded end-to-end run remains to be tried from your wallet.
- Shannon limits log reads to 1,000 blocks and the current platform deletes finalized requests. The adapter uses indexed, paginated log reads and reconstructs accepted responses from historical state and successful validator submissions. That recovery was exercised against existing public LLM request `13803304`; a reverted third submission was excluded. Unsupported nested submission paths fail closed.
- Reloads resume polling an already submitted hash, never resubmit a transaction. If a wallet fails to return a hash, check its activity before trying another paid request.
- Missing/late answers and RPC outages leave normal play available. A rivalry may remain unscored if the required evidence cannot be reproduced.

## Vercel Preview

The same neutral Home now offers Somnia Agents when the dedicated preview flag is enabled. Kevin stays in the status bar throughout the expedition. Simulated Kevin is clearly marked as random, with no AI or onchain agent. Open his Details before locking an omen to choose a genuine Shannon testnet request.

On iPhone, the simulator works in ordinary Safari. Genuine requests need an injected browser wallet, such as the browser inside a compatible wallet app, and testnet STT. No WalletConnect connection is provided by this prototype. The wallet still asks the player to approve each request; the server has no wallet or private key and never sends a transaction.

Hosted rounds use encrypted, authenticated browser-carried tickets instead of the Mac's filesystem. Tickets contain the server-read snapshot and prepared request, are bound to the exact deployment origin, and expire seven days after the market. Keys are derived with a separate protocol domain from the existing Preview seal key. The client saves each refreshed ticket and any submitted transaction hash before navigation; reloading verifies the same saved evidence and never resends a wallet transaction automatically.

Simulation choices are deterministic for the same attempt and market within a deployment, so retrying preparation or reaching a different server instance does not reroll the direction. Real results still require the existing testnet transaction and validator verification, including the cutoff; failures never become simulated answers.

This remains a personal preview scorecard, not a public leaderboard or a distributed anti-cheat ledger. A retained older valid ticket can be replayed; there is no shared global first-transaction registry or distributed rate limit. A refreshed ticket binds its reported transaction and rejects a different hash. Neither the rival ticket nor its score changes the expedition's independently verified market settlement, rewards, or combat. Clearing browser storage loses the preview rivalry. The exact immutable preview URL must be used; unrelated aliases do not share its tickets.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` cover the project and adapter. With the local server running on 3001, `npm run test:e2e:agents` exercises the playground and full-game integration in desktop Chromium and iPhone WebKit. Browser test markets/agent responses are fixtures; they are never written into the normal game's settlement logic.

Official references: [Somnia Agents](https://docs.somnia.network/agents), [LLM inference](https://docs.somnia.network/agents/base-agents/llm-inference), [contract interface](https://docs.somnia.network/agents/invoking-agents/from-solidity), [fees](https://docs.somnia.network/agents/invoking-agents/gas-fees), [official LLM agent](https://agents.testnet.somnia.network/agent/12847293847561029384).
