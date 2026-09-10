# Delveworn gameplay core

This directory contains the isolated gameplay core being prepared for Market
Dungeon's full expedition. Its rule source is Delveworn practice mode at commit
`00932e83dc89af85b2f3986a08bca2c5b6e6bc1c`:

- `frontend/app/practice/engine.ts`
- `frontend/app/relics.ts`

The source repository remains unchanged. `delveworn-engine.ts` exposes one
state reducer and accepts an injected gameplay-only random source. UI text and
animation therefore cannot consume combat randomness. Golden tests in
`tests/delveworn-gameplay-parity.test.ts` cover the frozen formulas, boundary
values, merchant rules, ownership/duplicates, and all fifteen relics.

Approved Market Dungeon boundaries already represented here:

- a run ends after room 40;
- a new run starts at 100 HP, 3 potions, 0 gold, weapon 0, armor 0, and no relic;
- presentation logs are deliberately simplified and are not parity data.

Not integrated in G-02:

- the existing full-game React interface still uses its legacy local state;
- boss rewards are still granted immediately inside this isolated parity core;
- BLESSED/CURSED/VOID settlement gating and boss rematches belong to G-03;
- persistence, relic artwork, responsive UI, and recovery belong to G-04;
- Judge v1 remains unchanged.
