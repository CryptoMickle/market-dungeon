# Full Expedition rules — local v2 candidate

Status: implemented and locally verified on 7 September 2026. This document
describes the unreleased working-tree candidate, not the currently deployed
Vercel build.

## Run structure

- A run contains 40 rooms and four tiers. Rooms 10, 20, 30 and 40 are bosses.
- A new run starts with 100 HP, three potions, zero gold, weapon level zero,
  armor level zero and no relic. The earlier cross-run gold/profile behavior is
  not used by this mode; its old browser key is left untouched.
- Non-boss rooms draw Zombie, Goblin or Orc at the frozen Delveworn
  probabilities. Enemy health, damage, combat, critical hits, armor, potions,
  loot, supply stops and camps follow the ported Delveworn Practice rules.
- All 15 Delveworn relics are available. One relic can be equipped at a time;
  duplicates are counted but effects do not stack. A relic revive is usable
  once per run and remains spent through a market-forced boss rematch.

The exact formulas and deterministic parity vectors live in
`app/gameplay/` and `tests/delveworn-gameplay-parity.test.ts`.

## Event Contract boss gate

1. Rooms before a boss remain playable without market availability.
2. At each boss gate, the player chooses BTC UP or DOWN first.
3. The server then selects a recent finalized dreamDEX Event Contract from a
   balanced historical pool. Its market identity and result remain inside an
   opaque seal until the boss is defeated. No wallet, order or transaction is
   requested.
4. The boss must be defeated through the full Delveworn combat rules before
   the sealed market can be revealed and checked against Somnia.

### Settlement consequences

- **BLESSED:** the prediction matches. The ordinary boss gold, random loot and
  one relic are granted exactly once, then the next tier opens.
- **CURSED:** the prediction misses. No boss reward is granted. The same boss
  returns at full scaled HP; the player retains current HP, potions, gold,
  equipment, relics and used-revive state. Camp does not reopen. A different
  Event Contract must be sealed before the rematch.
- **VOID:** the player is not penalized. Ordinary boss reward and progression
  are granted.
- **Unavailable, pending or not provable:** the run remains frozen without a
  win, loss, replacement result or resource change. The same reveal can be
  retried safely.

There is no separate 50-gold prediction bonus and no hidden rematch limit.
Ordinary combat death still ends the run.

## Proof and mode boundary

The full expedition uses local gameplay randomness and verified historical
Event Contract settlement. The separate `/judge` route remains the legacy
two-encounter `judge-combat/v1` proof walkthrough. Its deterministic combat
proof does not claim to prove the 40-room run. The full-run reveal response is
explicitly scoped to `historical-event-contract-settlement` and exports no
`combatProof` field.

The full-run candidate does not currently expose the earlier live-market mode.
That is a deliberate stability boundary for this unreleased candidate, not a
claim that live dreamDEX markets no longer exist. The Judge page may still show
separate live context when its public data source is available.

## Persistence and sharing

- Full-run state is stored in the versioned browser-local key
  `market-dungeon/full-run-session/v1` and validated before restore.
- A historical boss fight or pending settlement restores only together with
  its matching opaque seal. Malformed or impossible stored state fails closed.
- Completed expeditions, and defeats after at least one market lock, can render
  the existing 1200×675 run card with actual room, enemies, gold and direction.
  The card is a social summary, not portable proof. Judge proof JSON and the
  independent verifier remain separate Judge-only evidence.

## Verification record

At the local candidate checkpoint: 141/141 unit tests, 7/7 Shannon proof-kernel
tests and 38/38 Chromium tests passed; lint, TypeScript and the optimized
production build also passed. A 390×844 browser check found no horizontal
overflow and confirmed exact combat restoration after reload. Physical iPhone
acceptance, public Preview, live-provider smoke and independent human testing
remain external gates.
