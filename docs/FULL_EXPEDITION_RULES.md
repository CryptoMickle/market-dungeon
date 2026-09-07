# Full Expedition rules — active-market local candidate

Status: implemented and locally verified on 7 September 2026. This document
describes the unreleased working-tree candidate. The earlier public Preview is
rejected and does not represent these rules.

## Run structure

- One run contains 40 rooms in four tiers. Rooms 10, 20, 30 and 40 are bosses.
- A new run starts with 100 HP, three potions, zero gold, weapon level zero,
  armor level zero and no relic.
- Regular rooms use the frozen Delveworn 45% Zombie, 35% Goblin and 20% Orc
  distribution. Each tier uses its own Delveworn persona, artwork, flavor and
  Dungeon Log copy rather than repeating the Tier 1 character.
- Health, damage, critical hits, armor, potions, random loot, supply stops,
  camps and all 15 relics follow the ported Delveworn Practice rules. One relic
  can be active at a time and can be explicitly unequipped between rooms.
- A relic revive is usable once per run and remains spent through a boss
  rematch.

The exact formulas and deterministic parity vectors live in `app/gameplay/`
and `tests/delveworn-gameplay-parity.test.ts`.

## Active five-minute omen loop

1. Before Room 1—and again before Rooms 11, 21 and 31—the player chooses BTC
   UP or DOWN against a currently active dreamDEX BTC five-minute Event
   Contract. Its real opening/reference price and remaining time are visible.
2. The exact market ID and direction are stored with the browser-local run.
   This is a local game lock, not a server-signed Judge receipt and not a trade.
3. The five-minute interval continues while the player fights Rooms 1–10 of
   that tier. No initial waiting period is added.
4. When the boss reaches zero HP, settlement can be checked immediately if the
   interval has ended. If it is still active, the player waits only for the
   remaining time.
5. The result is applied only after the indexed terminal state matches a strict
   direct Somnia settlement proof and the browser independently reproduces the
   canonical block and both raw contract calls.

If no active five-minute market with a valid BTC opening reference is
available, the full run fails closed with a retry and a link to the historical
Judge Demo. It never silently substitutes a historical or 15-minute market.

### Settlement consequences

- **BLESSED:** the prediction matches. Ordinary boss gold, random loot and one
  relic are granted exactly once, then the next tier's fresh omen screen opens.
- **CURSED:** no boss reward is granted. Only the same boss returns at full
  scaled HP. Current HP, potions, gold, equipment, relics and spent revive are
  preserved; camp does not reopen. The player locks a different active
  five-minute market and fights the boss again while that interval runs.
- **VOID:** the player is not penalized; ordinary boss reward and progression
  are granted.
- **Pending, unavailable or not provable:** the defeated boss and run remain
  frozen without a win, loss or resource change. Verification can be retried.

There is no separate prediction-gold bonus and no hidden rematch limit.
Ordinary combat death still ends the run.

## Judge boundary

The separate `/judge` route remains the two-encounter historical Judge Replay.
It demonstrates a server-authenticated pre-selection lock, deterministic combat
replay, commitment verification and hash-pinned Somnia settlement proof in
about two minutes. It does not claim that its combat proof covers the local
40-room run. Conversely, the full expedition calls its omen lock local and
claims direct proof only for the final dreamDEX settlement.

## Persistence and sharing

- Full-run state uses `market-dungeon/full-run-session/v2`. The exact active
  five-minute market context must accompany every live attempt; malformed or
  mismatched state fails closed.
- Completed expeditions and relevant defeats can render the 1200×675 run card
  with actual room, enemies, gold and direction. The card is a social summary,
  not portable proof. Judge proof JSON and `/verify` remain Judge-only evidence.

## Verification record

At this checkpoint: 142/142 unit tests, the optimized production build and
38/38 Chromium checks pass (the one updated mobile assertion was corrected and
rerun after the full suite). Lint and TypeScript pass. No new Vercel Preview has
been created; physical iPhone and desktop acceptance plus live-provider smoke
remain release gates.
