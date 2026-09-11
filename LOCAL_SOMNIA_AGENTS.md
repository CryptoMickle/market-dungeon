# Market Dungeon · local Somnia Agents edition

This is a separate local prototype based on the published Market Dungeon build. **Somnia Agents** is its own mode, with **Somnia Agent Kevin** as a prediction rival. Ordinary Full Expedition and Judge Demo keep their original gameplay, so the existing demonstration video remains applicable to those modes. Nothing here has been deployed, pushed to GitHub or added to the competition submission.

## Try it

- **Home:** <http://localhost:3001/>. Opens with no mode selected. Select a name to see its explanation, then enter. No market or agent request starts on Home.
- **Full Expedition:** <http://localhost:3001/expedition>. The original forty-room game, without the rival. Quartermaster Kevin keeps his ordinary merchant role.
- **Judge Demo:** <http://localhost:3001/shannon/live-judge>. The original demo, with Live 1 Min and Historical Replay choices inside it. Neither demo sends agent requests.
- **Somnia Agents · New!:** <http://localhost:3001/somnia-agents>. The separate forty-room rival mode. Enter the dungeon and lock a real five-minute BTC market. Somnia Agent Kevin gets the same market; his status stays with the player header, and **Details** opens the full rivalry. Your boss result still depends on your own prediction.
- **Quick playground:** <http://localhost:3001/somnia-agents/playground>. Choose UP or DOWN, lock, and try simulated UP/DOWN/VOID results. The late-answer and no-answer scenarios show how Kevin sits out. This entire page is a simulation.
- The default **Try locally** mode makes an independent random test choice. It does not run an AI or a Somnia agent. It lets you test the interaction without a wallet.
- Inside the Somnia Agents game, open Kevin’s **Details** and choose the real-agent option before locking an omen to request a validator-executed prediction on Shannon testnet. Use a browser with a wallet extension and testnet STT. The wallet asks you to approve each paid request; declining leaves the dungeon playable. Never use mainnet funds.
- The three mode choices appear only on Home. The Market Dungeon logo returns there from the game without preselecting a mode. Judge Demo offers Live 1 Min / Historical Replay on Home and during demo setup. Agent participation belongs exclusively to **Somnia Agents**; historical replay is excluded because its result already exists before the prediction.

To start again, double-click `Start Local Agents.command`, or run `npm run dev:agents` from this directory. Port 3001 keeps the prototype separate from the original localhost:3000 game. The Mac must stay awake and the server must remain running.

Somnia Agents uses a separate expedition save key, so switching modes does not overwrite progress in ordinary Full Expedition or Judge Demo. Home shows **Continue Run** for active saves and **View Last Run** for finished runs; a fresh expedition can be started from the result screen. Live Judge resumes its verified save in the same tab. Historical Replay preserves its original seal and actions across same-tab Home navigation, but a page reload or browser restart starts a new replay. The rival scorecard keeps simulator and real-agent results separate.

## What the genuine integration does

1. The player locks an omen using the existing expedition rules.
2. The browser sends only the attempt ID, public market ID and selected rival mode to the local API. Player direction, combat state and arbitrary prompts are rejected.
3. The server fetches the exact active BTC five-minute market from the existing mainnet indexer and constructs an immutable, allowlisted snapshot. Kevin's deadline is ten seconds before market expiry.
4. Real mode encodes the official LLM agent's `inferString` call with a fixed system prompt, no tools, and allowed outputs `UP`/`DOWN`. It reads the deposit and committee settings and prepares an unsigned testnet transaction. There is no server wallet or private key.
5. The player's browser wallet submits `createRequest` on Shannon. The adapter checks the specific transaction, request, input, committee majority, response and canonical finalization time. It never accepts a late answer or substitutes simulation for a failed real request.
6. Only the game's existing independently verified market settlement can produce a rivalry result. Equal calls tie; a void market has no winner. No combat stats, gold, relics or boss rules change.

The market runs on **Somnia mainnet (5031)**; the optional agent executes on **Shannon testnet (50312)**. These are separate roles. The agent does not verify the market settlement.

The model sees the market question, target and timing. This first version does not supply a live price history or an odds strategy. There is no demonstrated prediction advantage, and validator consensus confirms execution, not financial accuracy.

## Local operation and limits

- `MARKET_DUNGEON_LOCAL_AGENTS=1` enables the additional local navigation button and the `/somnia-agents` and `/somnia-agents/playground` routes. `/` is the neutral common homepage; `/expedition` is the ordinary game. The feature is disabled when `VERCEL` is set. The API accepts only same-origin requests from a loopback host.
- `.local/somnia-agents/` stores immutable local rounds so reloads and preparation retries cannot reroll Kevin's choice. This directory and `.env.local` are ignored by Git. They contain local prototype state; there is no public leaderboard or anti-cheat claim.
- A genuine request requires testnet STT and gas. The unsigned quote was read successfully from Shannon on 11 September 2026: 0.24 STT at the then-current committee settings. The wallet shows the actual request; fees and availability may change.
- No funded agent transaction was sent while implementing this version. The wallet send flow is tested with a mock provider; request preparation and protocol reads are tested against the real testnet. A funded end-to-end run remains to be tried from your wallet.
- Shannon limits log reads to 1,000 blocks and the current platform deletes finalized requests. The adapter uses indexed, paginated log reads and reconstructs accepted responses from historical state and successful validator submissions. That recovery was exercised against existing public LLM request `13803304`; a reverted third submission was excluded. Unsupported nested submission paths fail closed.
- Reloads resume polling an already submitted hash, never resubmit a transaction. If a wallet fails to return a hash, check its activity before trying another paid request.
- Missing/late answers and RPC outages leave normal play available. A rivalry may remain unscored if the required evidence cannot be reproduced.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` cover the project and adapter. With the local server running on 3001, `npm run test:e2e:agents` exercises the playground and full-game integration in desktop Chromium and iPhone WebKit. Browser test markets/agent responses are fixtures; they are never written into the normal game's settlement logic.

Official references: [Somnia Agents](https://docs.somnia.network/agents), [LLM inference](https://docs.somnia.network/agents/base-agents/llm-inference), [contract interface](https://docs.somnia.network/agents/invoking-agents/from-solidity), [fees](https://docs.somnia.network/agents/invoking-agents/gas-fees), [official LLM agent](https://agents.testnet.somnia.network/agent/12847293847561029384).
