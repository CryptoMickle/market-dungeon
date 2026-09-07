# Market Dungeon — judge evidence pack

Status: **v11 technical release recorded; human evidence remains unestablished;
new mobile sharing and these documentation corrections are local.**

Updated: 7 September 2026. This is the evidence source for submission copy and
the new hybrid video kit. See [release and recording status](RELEASE_STATUS_2026-09-07.md). Published release evidence must not
be attributed to the unshipped mobile patch.

## Shannon release update

V11 includes fixed `/shannon/judge` and `/shannon/verify` while preserving
mainnet `/judge` and `/verify`. Its corrected final commit passed 40/40 Preview
and 40/40 Production round-trips (20 per network in each environment), zero
retries. The initial failed Preview and its lowercase-indexer-filter correction
remain documented in [the Shannon release record](SHANNON_JUDGE_RELEASE_CANDIDATE.md).

The recorded security pass covered 61 focused tests and 1,575 malformed proofs.
It is project-controlled expert-assisted evidence, not a third-party audit.
The latest retained private ledger records one voluntary reply, zero qualified
participants, zero completed human sessions, and zero independent external
validators. The release's earlier zero-reply snapshot remains historical.
No fresh Discord check or telemetry extraction was performed for this update.

## Ten-second product claim

Market Dungeon turns a dreamDEX BTC Event Contract into the second victory
condition of a complete fantasy roguelite: defeat the boss, predict the market
correctly, and survive both.

The product position is a wallet-free consumer acquisition and education layer
for Event Contracts, backed by reproducible Somnia evidence.

## Judge-first evidence strip

| Evidence | Verified public state |
| --- | --- |
| Testnet Judge / verifier | `https://market-dungeon.vercel.app/shannon/judge` / `/shannon/verify` |
| Mainnet Judge / verifier | `https://market-dungeon.vercel.app/judge` / `/verify` |
| Published baseline | `hackathon-submission-2026-v11` → `f30b9a56532eb6e3147e7ae8473242545635d0ef` |
| Production identity | Exact v11 commit checked at the recorded release gate on 7 September 2026 |
| V11 local gates | Lint, TypeScript, 99/99 unit/integration, 7/7 Shannon kernel, build, 22/22 deterministic Chromium PASS |
| V11 Preview live gate | 40/40: 20 mainnet + 20 Shannon, zero retries |
| V11 Production live gate | 40/40: 20 mainnet + 20 Shannon, zero retries |
| Networks | Mainnet `5031`; Shannon `50312`; fixed separate profiles |
| Human pilot | No qualified session evidence established |
| Independent external validators | None established |
| New mobile sharing | Local patch; not covered by v11 live gates; physical iPhone verification pending |
| Final video | New hybrid kit prepared; final recordings, edit, approval and publication pending |

Source: [v11 public release record](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v11).
These are recorded release results; no new public live gate was executed during
this documentation update.

The project treats a frozen release tag as permanent and never moves or reuses
it. The full commit is the authoritative source identity; this is a project
release policy, not a claim that GitHub cryptographically prevents tag changes.

## Why the Event Contract is load-bearing

The run has two independent conditions:

1. **Combat condition:** the player must defeat the guard and boss through a
   valid deterministic action transcript and survive.
2. **Prediction condition:** the direction locked before replay selection must
   match the payout-derived dreamDEX settlement outcome.

Removing the Event Contract removes the final survival decision. Combat alone
cannot produce a blessed result, award prediction gold, or make the defeated
boss stay down. This is game logic, not decorative market data.

## What one exported proof establishes

The short Judge flow must be explained in this order:

1. The player chooses BTC UP or DOWN before the replay market is drawn.
2. The environment returns a signed receipt and salted commitment while market
   identity and outcome remain sealed.
3. The server accepts reveal only after replaying a valid guard-and-boss combat
   transcript.
4. The reveal binds the original commitment to the selected finalized market.
5. Both BinaryModule and BinarySettlement are read at the same canonical
   Somnia block hash using EIP-1898.
6. The payout vector, not the application label, determines UP, DOWN, or void.
7. The separate browser-local verifier recomputes the commitment and combat and
   freshly repeats the recorded Somnia reads before returning `PASS`, `FAIL`,
   or `NOT PROVABLE`.

The Ed25519 receipt authenticates the Market Dungeon environment. It is not an
external timestamp, third-party endorsement, proof of human play, or proof that
the application server was honest. The fresh RPC reproduction makes the
onchain result independently checkable; it does not make the server that chose
the replay independent.

## Ecosystem value and measurable funnel

Market Dungeon's ecosystem contribution is a progression funnel rather than a
current trading-volume claim:

`entry → prediction lock → verified completion → share/challenge → fresh challenge`

The separate mainnet continuation can then open dreamDEX; it is not a Shannon
funnel stage.

- **Entry and education:** a player can learn the binary Event Contract model
  without first funding a wallet or approving a token.
- **Repeated discovery:** every full-game tier introduces another market, so
  market discovery becomes reusable game content instead of a one-time chart.
- **Comprehension:** the two conditions force the player to understand that
  combat performance and market settlement are separate inputs.
- **Distribution:** a verified result becomes a social card and a fixed fresh
  challenge link without publishing the sender's proof or market outcome.
- **Qualified continuation (mainnet only):** the terminal CTA opens the external
  dreamDEX application at its current BTC 5m/15m market. It does not route to
  Delveworn or Market Dungeon. Shannon does not show it. The event measures a
  click, not confirmed arrival, wallet connection, trade or conversion.

### Current evidence boundary

The legacy window recorded 65 visitors, 187 pageviews, 17 Judge-start events,
14 verified-completion events, and two Continue events. It spans an older
schema and includes project automation, so it is directional event volume only.
Its ratios must not be described as unique-human conversion.

Clean-v2 human completion, comprehension, challenge, and Continue results are
pending the qualified pilot in [`PILOT_RUN_2026-09-05.md`](PILOT_RUN_2026-09-05.md).
The final submission must replace `PENDING` with raw numerators and denominators
or state plainly that the gate was not established.

## 30/60/90-day ecosystem path

### 30 days — repeatable campaigns

- Add other eligible dreamDEX assets and intervals through the existing
  fail-closed discovery and settlement adapters.
- Package co-branded quests and seasonal enemies around specific Event
  Contract schedules.
- Expand the clean acquisition funnel and test challenge comprehension with a
  larger recruited sample.

### 60 days — optional eligible-user trading experiment

- Keep the current wallet-free game as the default entry.
- Prototype a separate opt-in route for eligible users only.
- Show exact maximum loss, simulation, allowance, order details, and a separate
  wallet confirmation for every write.
- Measure wallet connection, accepted intent, fill, settlement, and redemption
  separately; never infer them from Continue clicks.

### 90 days — measured partner campaigns

- Run a co-branded campaign only with explicit partner approval.
- Measure qualified entry, understanding, repeated play, challenge response,
  dreamDEX arrival, and—only where consent and eligibility permit—actual fill
  conversion.
- Evaluate the game as an acquisition channel against a normal market landing
  page rather than assuming uplift.

This roadmap is future scope. It is not part of the contest build and must not
be narrated as implemented functionality.

## Final-copy constraints

- Do not name or criticize competing projects on public submission surfaces.
- Do not claim a trade, trader, fill, volume, revenue, conversion, partner, or
  endorsement that has not been directly established.
- Do not call event volume unique users.
- Keep the full game and finalized Judge replay visibly distinct.
- Keep technical evidence below the product claim and two-condition result.
- Ensure DoraHacks, Production, README, release, video, and captions all identify
  one final source candidate.

## Pre-video readiness

- [x] Ten-second product claim frozen.
- [x] Existing release, test, contract, and workflow evidence compressed.
- [x] Load-bearing Event Contract role stated in plain language.
- [x] Proof trust boundaries stated without overclaiming independence.
- [x] Ecosystem funnel and 30/60/90-day path defined.
- [x] Human-pilot absence explicitly disclosed (not a passed human-testing gate).
- [x] Independent non-team validation absence explicitly disclosed.
- [x] Published v11 commit, tag and recorded technical gates inserted.
- [ ] New mobile patch device checks, release identity and live gates completed.
- [ ] Final video and captions linked after the release freeze.
