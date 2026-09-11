# Market Dungeon — DoraHacks description

Submission copy for [DoraHacks BUIDL 48083](https://dorahacks.io/buidl/48083). The video embed appears here as a linked thumbnail.

**Defeat the boss. Predict the market. Survive both.**

[PLAY THE LIVE 1-MINUTE JUDGE DEMO](https://market-dungeon.vercel.app/shannon/live-judge) · [WATCH THE 2:08 FILM](https://youtu.be/oTSAhrxywbw) · [CHOOSE A MODE](https://market-dungeon.vercel.app)

[![Watch the 2:08 Market Dungeon film](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-YouTube-Thumbnail.png)](https://youtu.be/oTSAhrxywbw)

A fantasy roguelite where a real dreamDEX Event Contract decides whether the boss you defeated stays down.

## Project description

Market Dungeon turns market settlement into a second victory condition. Choose **Gold Awakens · BTC UP** or **Shadows Rise · BTC DOWN**, fight through a dungeon, and see whether your earned combat victory survives the verified result.

The recommended **Live Judge Demo** uses a fresh one-minute BTC/USDC Event Contract on Somnia Shannon Testnet. Lock a prediction against the real target, fight one guard and one boss, and heal with Quartermaster Kevin between encounters. A correct prediction leaves the boss down. A wrong prediction brings it back for one fatal last strike. A verified void preserves the combat victory.

The market clock is not a combat deadline. Attack is steady, Storm is unpredictable, and potions used during combat allow retaliation. The prediction decides the boss’s final fate; it does not change attack damage or rescue a lost fight.

The **2:08 competition film** shows this with a real round: UP was chosen, both fights were won, the market settled DOWN, and the boss returned. Its exported proof then passed the independent verifier. PASS means the evidence matches, even when the player loses.

## More than a short demo

- **Full Expedition:** 40 rooms, four tiers, equipment, shops, camps and 15 relics. Each tier uses an active five-minute BTC Event Contract on Somnia mainnet. A wrong prediction resurrects the same boss at full HP; the player locks a new market and rematches using their remaining resources. Boss rewards and relics are released once after a correct or voided settlement.
- **Historical Replay:** a separate short demo inside Judge Demo. It locks the choice before randomly selecting and sealing a recent finalized Shannon market. It never silently replaces the result of a locked live round.
- **Somnia Agent Kevin · New:** a separate complete expedition with Kevin as a prediction rival. The default **Simulated Kevin · No AI** needs no wallet. Opt into **Somnia Agents** to connect MetaMask and approve an actual LLM-agent request on Shannon testnet, with a quoted STT deposit and gas. Kevin sees the public market snapshot, not your prediction, and his eligible reply stays in the player header. His score never changes your damage, rewards or boss fate.
- **Shared presentation:** sixteen monsters, character humor, distinct intro sounds, boss music and staged defeat/return effects. Mobile recovery controls show current HP before spending a potion. A persistent switch controls all sound.

Home starts neutrally with three choices: Full Expedition, Judge Demo and Somnia Agent Kevin. Selecting one reveals its explanation before entering. Live and Historical Judge now share four clear steps, recovery controls, final statistics and expandable proof details; their different market and proof rules stay explicit.

## Try it

1. Open [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge), choose BTC UP or DOWN, and lock the omen while the window is available.
2. Defeat the guard, prepare at Kevin’s camp, and fight the boss. Combat and the market run alongside each other; settlement can take longer than one minute.
3. Read **Your choice → Market result → Boss fate**. Expand **View verified run proof**, export the proof JSON and check it in the [Live Judge verifier](https://market-dungeon.vercel.app/shannon/live-judge/verify).
4. Save a run card or invite someone to a fresh round. **Continue on dreamDEX** opens a separate BTC five-minute mainnet market.

Full Expedition and both Judge demos need no wallet or transaction. Kevin’s optional real-agent path asks for connection before omen lock and paid testnet approval afterward; rejecting it leaves the dungeon playable without a real rival response. On iPhone, approve in MetaMask and return to Safari. The game places no dreamDEX order, and the dreamDEX link does not transfer a testnet position or place a trade.

## Technical implementation

Built with Next.js and the official `@somnia-chain/markets-sdk`, Market Dungeon discovers real markets through the indexer and reads CLOB quotes by exact market ID. Empty books and failed reads remain visibly unavailable; missing quotes are never replaced with invented probabilities.

The Live Judge server signs the exact market, direction, combat seed and stated lock time. A pre-expiry snapshot binds the active, unresolved market to its oracle target. The server and separate browser verifier reproduce the combat transcript and verify `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)` at one canonical block hash using EIP-1898. The result comes from the verified payout. Pending or contradictory evidence cannot award a verified outcome.

The lock is server-attested, not an onchain player transaction or independent timestamp. A valid combat transcript does not prove human play. Full Expedition checks settlement independently, while honestly treating its direction lock and combat as local gameplay. See the [integration report](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/docs/DREAMDEX_INTEGRATION_REPORT.md) and [evidence pack](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/docs/JUDGE_EVIDENCE_PACK.md).

For real Kevin, the server prepares an unsigned request to the official Somnia LLM agent; only the player’s wallet submits it. The adapter verifies the exact request, committee response and canonical finalization time, requiring an answer at least ten seconds before market expiry. Mainnet `5031` supplies the five-minute market; Shannon `50312` executes the agent. Failed or late requests never become simulated answers. The agent does not verify settlement, and this snapshot-only prompt claims no forecasting advantage. Hosted rival tickets support a personal scorecard, not a public anti-cheat leaderboard. [Integration and operating limits](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/LOCAL_SOMNIA_AGENTS.md).

## Why this helps dreamDEX

Players encounter Event Contracts through a result they care about: whether a boss they defeated stays down. Fresh intervals provide repeatable game content. Cards and invitations support discovery; the optional dreamDEX link offers a next step into the trading application without requiring funding before the first play.

Three previously documented self-reported responses informed clearer Bitcoin explanations, timers, combat guidance, log access and sharing instructions. A later Android/Chrome response understood Attack versus Storm but missed BTC and the clock, found potions initially confusing and described repetition. That feedback is included in the [qualitative record](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/docs/USER_FEEDBACK_2026-09-11.md), alongside an earlier respondent’s corrected computer device attribution. Later owner feedback drove mobile and audio improvements. These reports are not a measured conversion study or independent tests of the latest build. The iPhone footage is owner-recorded gameplay, not an additional recruited participant.

The build claims no trading volume, verified referral conversion, partnership or endorsement. A larger study, post-fix human retesting and evaluation of longer-run repetition remain future work. The new optional Kevin mode supplements the existing competition film; no replacement video is required to try it.

## Links

- [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge) · [Independent verifier](https://market-dungeon.vercel.app/shannon/live-judge/verify)
- [Full Expedition](https://market-dungeon.vercel.app/expedition) · [Somnia Agent Kevin](https://market-dungeon.vercel.app/somnia-agents) · [Historical Replay](https://market-dungeon.vercel.app/shannon/judge) · [Historical verifier](https://market-dungeon.vercel.app/shannon/verify)
- [Source repository](https://github.com/CryptoMickle/market-dungeon) · [v17 release and checks](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v17)
- [Watch on YouTube](https://youtu.be/oTSAhrxywbw) · [Download the 2:08 demo (1080p)](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-1080p.mp4) · [English captions (SRT)](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-EN.srt) · [Transcript](https://github.com/CryptoMickle/market-dungeon/releases/download/hackathon-submission-2026-v16/Market-Dungeon-Competition-V3-1-Transcript-EN.txt)
- [dreamDEX integration](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/docs/DREAMDEX_INTEGRATION_REPORT.md) · [Evidence and limits](https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v17/docs/JUDGE_EVIDENCE_PACK.md)
- [Privacy, credits and AI disclosure](https://market-dungeon.vercel.app/credits)
