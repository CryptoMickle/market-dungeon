# Market Dungeon — judge evidence pack

Status: **WIN-WB-03 and WIN-WB-05 source package; pre-video draft**

This is the concise evidence source for the final DoraHacks page, README, video
script, and release notes. Deployment-derived evidence belongs in release notes
or attached artifacts after the final commit is frozen; it must not be invented
or copied into a tag before it exists.

## Ten-second product claim

Market Dungeon turns a dreamDEX BTC Event Contract into the second victory
condition of a complete fantasy roguelite: defeat the boss, predict the market
correctly, and survive both.

The product position is a wallet-free consumer acquisition and education layer
for Event Contracts, backed by reproducible Somnia evidence.

## Judge-first evidence strip

| Evidence | Verified public state |
| --- | --- |
| Live Judge entry | `https://market-dungeon.vercel.app/judge` |
| Browser-local verifier | `https://market-dungeon.vercel.app/verify` |
| Frozen source | `hackathon-submission-2026-v10` → `abfac8ed7b8333d67b0b9388c08c109864d99f5b` |
| Production build identity | `/api/build` returned the exact v10 commit at `2026-09-05T02:19Z` |
| Local release gates | Lint PASS; TypeScript PASS; 88/88 unit tests; 7/7 Shannon proof-kernel tests; optimized build PASS; 21/21 deterministic Chromium tests |
| Preview live gate | 20/20 Judge → proof download → standalone verifier PASS, zero retries, `2026-09-04T23:29:24Z`–`23:42:54Z` |
| Production live gate | 20/20 Judge → proof download → standalone verifier PASS, zero retries, `2026-09-04T23:48:29Z`–`2026-09-05T00:01:54Z` |
| Somnia mainnet | Chain `5031`; BinaryModule `0x3ecC694Cef705358864a646142ac17A90E29e388`; BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| Human pilot | Collection protocol ready; qualified results **PENDING** |
| Independent validators | Runbook ready; two non-team records **PENDING** |
| Final video | Captured only after the final release freeze; **PENDING** |

Public workflow evidence:

- Preview 20-run gate:
  `https://github.com/CryptoMickle/market-dungeon/actions/runs/33929683624`
- Production 20-run gate:
  `https://github.com/CryptoMickle/market-dungeon/actions/runs/33930849654`
- Main CI:
  `https://github.com/CryptoMickle/market-dungeon/actions/runs/33930662651`
- v10 release:
  `https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v10`

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

`entry → prediction lock → verified completion → share/challenge → challenge completion → Continue on dreamDEX`

- **Entry and education:** a player can learn the binary Event Contract model
  without first funding a wallet or approving a token.
- **Repeated discovery:** every full-game tier introduces another market, so
  market discovery becomes reusable game content instead of a one-time chart.
- **Comprehension:** the two conditions force the player to understand that
  combat performance and market settlement are separate inputs.
- **Distribution:** a verified result becomes a social card and a fixed fresh
  challenge link without publishing the sender's proof or market outcome.
- **Qualified continuation:** the terminal CTA sends interested players to the
  current dreamDEX market. It measures discovery intent only.

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
- [ ] Qualified human pilot results inserted or explicitly reported as unmet.
- [ ] Two independent non-team validation records linked or explicitly reported as unmet.
- [ ] Final commit, release tag, Production identity, and final live gates inserted.
- [ ] Final video and captions linked after the release freeze.
