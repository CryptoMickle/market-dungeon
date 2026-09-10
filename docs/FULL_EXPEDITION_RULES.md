# Full Expedition rules

Current rules reviewed against the September 10 source. Publication identity
and executed checks belong to [release verification](RELEASE_2026-09-10.md).
The game uses active five-minute Somnia mainnet markets; Judge Demo is a
separate shortened experience.

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
available, the full run offers retry or an explicit switch to Judge Demo. It
never silently substitutes a historical or 15-minute market. The market clock
is not a combat deadline: fighting can continue after the interval closes.

### Settlement consequences

- **BLESSED:** the prediction matches. Ordinary boss gold, random loot and a
  relic offer are granted once. Claiming the relic leads to the next tier’s
  fresh omen, or completes the expedition after Room 40.
- **CURSED:** no boss reward is granted. Only the same boss returns at full
  scaled HP. Current HP, potions, gold, equipment, relics and spent revive are
  preserved; camp does not reopen. The player locks a different active
  five-minute market and fights the boss again while that interval runs.
- **VOID:** the player is not penalized; ordinary boss reward and progression
  are granted.
- **Pending, unavailable or not provable:** boss rewards and progression remain
  pending without applying a prediction win or loss. Verification can be
  retried. The player may spend an owned potion to recover without retaliation
  while awaiting settlement; this does not change the locked omen or proof.

There is no separate prediction-gold bonus. Before locking a rematch, an owned
potion can also restore health without retaliation; equipment remains locked
until the boss is resolved. Ordinary combat death ends the run unless an
active, unspent relic revive applies.

## Judge boundary

The recommended `/shannon/live-judge` uses a fresh one-minute Shannon testnet
market and two encounters. Its signed lock binds the exact market before
expiry; a pending-state snapshot, deterministic combat transcript and final
settlement can be independently reproduced. One minute is the market interval,
not a guaranteed completion time.

Historical Replay at `/shannon/judge` remains an explicit alternative. It
demonstrates choice before hidden market selection, an authenticated seal and
commitment, deterministic combat and hash-pinned settlement. The older mainnet
`/judge` and `/verify` routes remain available. Both Judge variants end after a
verified prediction loss; Full Expedition instead requires a same-boss rematch.

Neither Judge proof claims to cover the local 40-room run. Full Expedition
describes its omen lock as local and independently proves the dreamDEX
settlement before applying it.

## Persistence and sharing

- Full-run state uses `market-dungeon/full-run-session/v2`. The exact active
  five-minute market context must accompany every live attempt; malformed or
  mismatched state fails closed.
- Completed expeditions and relevant defeats can render the 1200×675 run card
  with actual room, enemies, gold and direction. The card is a social summary,
  not portable proof. Live Judge proof JSON belongs in
  `/shannon/live-judge/verify`; Shannon historical proof uses `/shannon/verify`,
  and mainnet historical proof uses `/verify`.

## Verification record

See the [current release verification](RELEASE_2026-09-10.md) for exact source
identity, build, test and live-provider results. The [judge evidence pack](JUDGE_EVIDENCE_PACK.md)
separates automated checks, qualitative feedback and remaining physical-device
limits. Earlier checkpoint counts do not establish the current release’s status.
