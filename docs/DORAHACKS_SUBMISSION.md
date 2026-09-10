# Market Dungeon — DoraHacks submission copy

Prepared for the current release on 10 September 2026. Publication evidence belongs in the [judge evidence pack](JUDGE_EVIDENCE_PACK.md); the previous v11 release and existing video do not establish the current deployment’s identity. The project owner has authorized the remaining release and DoraHacks work. Replacement video work is deferred.

## One-line pitch

**Defeat the boss. Predict the market. Survive both.**

A fantasy roguelite where a real dreamDEX Event Contract decides whether the boss you defeated stays down.

## Project description

Market Dungeon is a playable Delveworn spin-off built for the Somnia × dreamDEX Event Contracts Hackathon. The player chooses **Gold Awakens · BTC UP** or **Shadows Rise · BTC DOWN**, fights through the dungeon, and faces a second victory condition: the verified market settlement.

The recommended **Live Judge Demo** uses a fresh one-minute BTC/USDC Event Contract on Somnia Shannon Testnet. Players see the real target, lock their prediction before expiry, and fight one guard and one boss while the market runs. The market clock is not a combat deadline. After both encounters are cleared, the game verifies the same market’s final settlement. A correct prediction makes the combat victory permanent; a wrong prediction lets the fallen boss rise for one fatal last strike. A void preserves the combat victory without a prediction penalty.

**Full Expedition** demonstrates the complete game: 40 rooms, four tiers, shops, camps, random loot and all 15 Delveworn relics. Each tier starts with a fresh live five-minute BTC Event Contract on Somnia mainnet. Here, a wrong prediction resurrects the same boss at full strength and requires a new market before the rematch. The player keeps their remaining health and equipment, but spent potions and revives stay spent. A correct or voided settlement releases the ordinary boss reward and relic once.

**Historical Replay** remains available inside Judge Demo. It locks the player’s choice before cryptographically selecting and sealing a recent finalized Shannon market. It offers the same shortened combat and an independently reproducible historical proof. It is an explicit alternative, never a silent substitute for a locked live market.

No mode requests a wallet, token approval, order, redemption or transaction. The game makes real Event Contract outcomes accessible without requiring players to fund an account first.

## Why the Event Contract matters

Combat and prediction do different jobs. Attack, Storm, healing and equipment decide whether the player can defeat the enemy. The Event Contract decides whether that earned victory becomes permanent. Picking UP does not increase attack damage, and calling the market correctly cannot rescue a lost fight.

This turns market settlement into repeatable game content with a visible consequence. A boss reaching zero HP creates the anticipation; the verified outcome resolves it. Full Expedition makes a missed prediction costly through a full-strength rematch with depleted resources, while the Judge Demo presents the same two-condition idea in two encounters.

## Recommended judge path

1. Open [Live Judge Demo](https://market-dungeon.vercel.app/shannon/live-judge). Choose BTC UP or DOWN against the visible target and press **Lock & Enter Dungeon** while the window is available.
2. Fight the guard, heal between encounters if needed, then defeat the boss. Attack is steady; Storm is unpredictable; an in-combat potion permits retaliation.
3. Let the game verify the same Event Contract after combat and settlement. One minute is the market interval, not a guaranteed end-to-end demo duration.
4. Read **You locked → Market result** and the separate combat/prediction conditions. Expand the evidence when needed.
5. Export the proof JSON and load it into the [Live Judge verifier](https://market-dungeon.vercel.app/shannon/live-judge/verify). It checks the signed choice, reproduces combat and independently re-fetches the recorded Shannon state.
6. Save a run card, open a social draft or invite a player to a fresh round. **Continue on dreamDEX** opens a separate BTC five-minute mainnet market. It neither transfers the testnet result nor submits a trade.

For the historical alternative, use [Historical Replay](https://market-dungeon.vercel.app/shannon/judge) and its separate [historical verifier](https://market-dungeon.vercel.app/shannon/verify). For the complete progression and boss rematches, use [Full Expedition](https://market-dungeon.vercel.app).

## Technical implementation and proof

The application uses Next.js, the official `@somnia-chain/markets-sdk` and fixed Somnia network profiles. The indexer discovers markets; the official SDK reads CLOB top-of-book data by exact market ID. Empty or unavailable quotes remain visibly unavailable rather than becoming invented 50/50 odds.

The Live Judge server signs a receipt binding the exact market, direction, independent combat seed and stated pre-expiry lock time. A canonical pre-expiry block snapshot includes the market binding, trading status, unresolved settlement and exact oracle question threshold. Reveal requires a valid deterministic guard-and-boss combat transcript and a finalized settlement for that same market.

Both server and browser verify `BinaryModule.markets(marketId)` and `BinarySettlement.getSettlement(marketKey)` at a canonical block hash using EIP-1898. The browser requires exact raw contract-result matches and derives the outcome from the verified payout. The portable proof includes the signed lock, pre-expiry snapshot, combat actions and final settlement. The separate verifier repeats these checks without a wallet or proof upload.

Historical Replay uses its own encrypted seal, salted commitment, receipt and proof format. Full Expedition independently reproduces direct settlement before changing progression, while honestly describing its direction lock and combat as local gameplay rather than Judge transcript proof.

The signed time is an application-server attestation, not an onchain player choice or an independent timestamp. Reproducible combat proves a valid transcript, not human input. The recorded block proves contract state, not the identity of the transaction that originally finalized it. Unavailable or contradictory proof cannot award a verified result.

## User experience

All modes share clear navigation, readable health and resource controls, dungeon humor and full-width mobile monster artwork. Boss knockout and return have visible staged animations. Each of the sixteen monsters and Quartermaster Kevin has a distinct intro sound; Attack, Storm, Potion and keyboard/mouse activation have action cues. Boss music stops when the fight ends. A persistent switch controls all sound, and there is no continuous dungeon drone.

Three self-reported user-test responses covering Full Expedition and Judge Demo informed clearer Bitcoin explanations, prediction consequences, market timers, action guidance, log access and image-sharing instructions. Further owner feedback drove mobile artwork and audio fixes. This is qualitative usability evidence, not a measured conversion study or broad native-device certification.

## Ecosystem impact and next steps

Market Dungeon is a consumer entry point to Event Contracts. Players learn the binary market model because its outcome changes a game result they care about. Fresh intervals support repeated play; result cards and fresh-run invitations support discovery; the optional dreamDEX link offers a next step into the external application.

The contest build does not claim trades, volume, validated referral conversion, partnerships or endorsements. Historical analytics definitions and older event counts are kept separate from Live Judge and from qualitative feedback. A larger recruited study should measure comprehension and verified completion before drawing conversion conclusions.

Future scope includes additional eligible assets, seasonal dungeon content and a separately consented wallet-enabled experiment. That mode would require its own eligibility checks and explicit transaction confirmations. It is not part of the submitted read-only game.

## Links and supporting material

- [Live Judge Demo — one-minute Shannon market](https://market-dungeon.vercel.app/shannon/live-judge)
- [Live Judge independent verifier](https://market-dungeon.vercel.app/shannon/live-judge/verify)
- [Full Expedition — live five-minute mainnet markets](https://market-dungeon.vercel.app)
- [Historical Replay — Shannon](https://market-dungeon.vercel.app/shannon/judge)
- [Historical Replay verifier — Shannon](https://market-dungeon.vercel.app/shannon/verify)
- [Source repository](https://github.com/CryptoMickle/market-dungeon)
- [Immutable v13 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v13)
- [Current release verification](RELEASE_2026-09-10.md)
- [Release evidence and known limits](JUDGE_EVIDENCE_PACK.md)
- [dreamDEX integration and SDK/documentation feedback](DREAMDEX_INTEGRATION_REPORT.md)
- [Privacy, credits and AI disclosure](https://market-dungeon.vercel.app/credits)
- [Existing video — earlier baseline, 1:52](https://youtu.be/6IviQrMweZ4)

The existing video remains available as an earlier demonstration. It does not depict the latest Live Judge flow. A replacement video is deferred; all current-product claims should be checked in the playable build and matching source release.
