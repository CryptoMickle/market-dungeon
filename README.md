# Market Dungeon

Market Dungeon is a playable fantasy roguelite built for the **Somnia × dreamDEX Event Contracts Hackathon**. A live BTC 15-minute Event Contract becomes a dungeon omen: choose **Gold Awakens (UP)** or **Shadows Rise (DOWN)**, clear ten rooms, defeat the tier boss, and survive the finalized onchain outcome. Permanent victory requires both combat success and a correct prediction.

The current contest build is intentionally read-only. It reads live market and settlement data, verifies Somnia mainnet, and never requests a wallet signature, token approval, or trade.

## Live demo

**Play:** https://market-dungeon.vercel.app

**Watch the 3-minute hackathon demo:** https://youtu.be/YIoSSdMTsEM

### Full live expedition

1. Choose `GOLD AWAKENS` or `SHADOWS RISE` against the active BTC market.
2. Enter a tier and clear ten deterministic combat rooms.
3. Use potions and gold, including Quartermaster Kevin's shops after Room 5 and the boss.
4. Defeat the boss through normal combat, then reveal the dreamDEX result.
5. A correct prediction keeps the boss down, awards its gold plus a 50-gold prediction reward, and opens the next tier with a fresh BTC prediction.
6. An incorrect prediction triggers the defeated boss's fatal last strike and ends the run.
7. Clear all four tiers to win the full expedition.

Gold persists between runs. Potions have a hard maximum of five: a new run restores the three-potion starting amount, or preserves a higher remaining amount up to five. Attack and defense upgrades remain within the current run but reset for every new expedition.

### Two-minute Judge Demo

Select **2-MIN JUDGE DEMO · REAL MARKET REPLAY** on the start screen. This mode:

- loads the latest finalized BTC 15-minute Event Contract without sending its winning outcome to the browser;
- shows the exact question, opening strike, full market ID, market address, pool address, and Somnia network before the player chooses;
- lets the judge choose and lock `UP` or `DOWN` against that exact market;
- fast-forwards Tiers 1–3 and Rooms 1–8, then starts with one wounded Tier 4 guard before the wounded final boss;
- requires the player to defeat both the guard and boss through normal combat; and
- fetches the separate settlement response only after **Reveal Boss Fate**, then resolves whether the boss stays down or strikes back from that market's real recorded Somnia outcome.

It is a fast replay, not a mocked settlement.

#### Judge verification checklist

1. Open **Finalized replay proof** before combat and verify the full market ID, market address, pool address, and `Somnia mainnet · 5031`.
2. Choose `UP` or `DOWN`, then press **Lock Omen & Start Replay**.
3. Defeat the wounded guard and boss. The screen continues to state that the outcome is sealed.
4. Press **Reveal Boss Fate**. The result screen confirms that settlement was fetched after the reveal and keeps the same proof links visible.
5. No wallet, approval, order, or other transaction is requested at any point.

## Why Event Contracts fit the game

Market Dungeon combines skill and prediction without turning the prediction into an attack:

- **Dungeon result:** deterministic player actions, damage, healing, inventory, and room progression.
- **Market result:** dreamDEX decides whether a combat-defeated boss stays down permanently.

A correct prediction cannot replace combat victory, while combat victory alone cannot clear a tier. The two independent conditions meet only after the boss reaches zero HP.

## Architecture

```mermaid
flowchart LR
    P[Player] --> UI[Market Dungeon UI]
    UI -->|Start or judge setup| META[/api/market market metadata/]
    META --> IDX[dreamDEX GraphQL indexer]
    META --> RPC[Somnia mainnet RPC]
    IDX -->|Active or finalized BTC market| META
    RPC -->|Chain ID and pool parameters| META
    META -->|Finalized replay with outcome redacted| UI
    UI --> LOOP[Deterministic dungeon loop]
    UI -->|Reveal Boss Fate after boss HP reaches zero| SETTLE[/api/market settlement lookup/]
    SETTLE --> IDX
    SETTLE -->|winningOutcome / finalized / voided| GATE[Boss fate gate]
    LOOP -->|Boss HP reaches zero| GATE
    GATE -->|Combat + correct prediction| NEXT[Next tier and fresh market]
    GATE -->|Incorrect prediction| LOSS[Boss last strike]
```

### Trust boundaries

- The browser never receives a private key.
- The app sends no approval, order, redemption, or other transaction.
- Server responses use `cache-control: no-store` for time-sensitive market state.
- The API verifies Somnia chain ID `5031` before returning a playable market.
- Judge Demo data is selected from finalized, non-voided BTC markets with a recorded outcome.
- The Judge Demo setup response explicitly redacts `winningOutcome`, `payoutNumerators`, and `payoutDenominator`.
- Settlement fields are requested separately only after the defeated boss reaches the **Reveal Boss Fate** gate.

## Verified integration surface

Verified against Somnia mainnet on 27 August 2026:

| Surface | Value |
| --- | --- |
| Somnia chain ID | `5031` |
| Somnia explorer | `https://explorer.somnia.network` |
| dreamDEX indexer | `https://prd.smk.somnia.host/v1/graphql` |
| Somnia RPC | `https://api.infra.mainnet.somnia.network` |
| BinaryModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| USDso collateral | `0x00000022dA000002656c64D9eA6011ea952D008A` |
| Market filter | `BINARY` · `BTC` · `900` seconds |
| Settlement fields | `finalized`, `voided`, `winningOutcome`, `payoutNumerators`, `payoutDenominator` |

Active-market discovery uses dreamDEX's indexer. Opening strike resolution follows `MarketReferenceLink.referenceQuestionId` to `OracleAnswer.numericValue`. Pool tick, minimum quantity, and lot size are read directly through Somnia RPC.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

### Validation

```bash
npm run lint
npm run build
```

## Project structure

```text
app/
  api/market/route.ts   Live market discovery and finalized replay lookup
  globals.css           Responsive game presentation
  layout.tsx            Metadata and social preview configuration
  page.tsx              Complete ten-room game and Judge Demo state machine
public/
  assets/                Canonical gold coin and Market Dungeon homepage hero
  characters/            Travelling merchant artwork
  monsters/              Four progression tiers for each enemy class
docs/
  DORAHACKS_SUBMISSION.md Submission-ready project description and judge path
```

## Safety and current limitations

- Event Contracts use real assets on mainnet; this contest build does not trade.
- The interface must not be used to bypass dreamDEX eligibility or jurisdiction checks.
- A future wallet-enabled mode should use exact-amount approval, transaction simulation, explicit maximum-loss disclosure, and separate user confirmation for every write.
- Gold and the next-run potion count are stored only on the player's device; active combat and loadout state reset on refresh.
- Availability depends on the public dreamDEX indexer and Somnia RPC.

## Contest status

- Playable deployed experience: complete
- Live active-market integration: complete
- Finalized onchain settlement replay: complete
- Two-minute judge path: complete
- Clickable onchain proof before and after reveal: complete
- Desktop and 390 px mobile judge-flow QA: complete
- Four-tier dual-condition progression: complete
- Three-minute hackathon demo video: complete
- Wallet writes: intentionally disabled

## License

MIT
