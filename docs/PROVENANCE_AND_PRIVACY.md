# Market Dungeon — provenance, privacy, and AI disclosure

This document is the versioned disclosure behind the live prototype's **Privacy · Credits · AI Disclosure** page.

## Analytics and local data

Market Dungeon uses Vercel Web Analytics for aggregate page views and a closed, versioned anonymous funnel. Version 2 separates Judge entry from an accepted sealed replay, first reveal attempt, verified completion, definitive verification failure, sharing, challenge activity, and Continue-on-dreamDEX intent. `PASS`, `FAIL`, and `NOT PROVABLE` are reported separately; temporary RPC or service unavailability remains retryable rather than being mislabeled as failure.

The v2 labels contain only closed categories such as interval, duration bucket, mode, direction, result, and failure or share-action type. The challenge link uses the fixed `?challenge=1` marker and contains no player or run identifier. A challenge-created event means that an independently verified Judge result produced a valid link or artifact; it does not prove that an external post was published. Market Dungeon does not send wallet addresses, market IDs, commitments, proof contents, combat transcripts, names, or email addresses to analytics; exact timings and arbitrary query text are also excluded. WebDriver sessions and tests using the exact `automation=1` marker are suppressed. Remaining counts are non-WebDriver event volumes, not proof of unique people. Legacy `/funnel/...` counts are never combined with `/funnel/v2/...`; see the [clean-v2 measurement contract](PILOT_MEASUREMENT_V2.md).

The application has no account system, wallet connection, approval, order, or transaction flow. Persistent gold and the next-run potion count are stored only in the player's browser. During post-reveal verification, the browser contacts the public Somnia mainnet RPC directly to reproduce the displayed proof. The separate `/verify` route parses exported proof JSON locally and never uploads the complete file. Its public-key GET contains no proof data; its fixed Somnia RPC requests contain only the artifact's public block hash/reference, contract targets, and two read-only calldata inputs needed to reproduce the recorded state. The verification result is not sent to analytics. Continuing to dreamDEX opens that separate service in a new tab. See [Vercel's Web Analytics privacy documentation](https://vercel.com/docs/analytics/privacy-policy).

## Artwork and asset provenance

Visual direction, character concepts, selection, editing, compression, and product integration were led by CryptoMickle. The checked-in hero, character, monster, coin, and social-preview artwork was created specifically for Delveworn and Market Dungeon through a human-directed workflow with generative-image assistance; no third-party game artwork is intentionally included.

| Repository path | Contents |
|---|---|
| `public/monsters/` | Sixteen Delveworn enemy and boss scenes |
| `public/characters/` | Quartermaster Kevin merchant artwork |
| `public/assets/` | Project hero compositions and the Delveworn gold coin |
| `public/og.png` | Market Dungeon social preview |
| `public/favicon.svg` | Project interface mark |

The MIT license covers the source code. Original visual assets are separate project assets and are not offered for reuse under the MIT grant unless explicitly marked otherwise.

## AI assistance

Generative AI assisted artwork production, software implementation, copy development, test creation, and video-production tasks. CryptoMickle retained product direction and responsibility for final selection, editing, deployment, verification, and QA. AI assistance is not presented as an autonomous author, teammate, or source of onchain truth.

## Demo-video music

The live web app contains no music. The baseline 1:52 [v8 hackathon demo video](https://youtu.be/6IviQrMweZ4) uses **“Dark Fantasy Ambient (Dungeon Synth music)”**, created by **DeusLower / Vlad Bakutov** and licensed under the **Pixabay Content License**. A replacement competition video remains paused until its Production capture and captions can be verified separately; it is not part of the v10 source release.

- [Music source](https://pixabay.com/music/ambient-dark-fantasy-ambient-dungeon-synth-music-281592/)
- [Pixabay Content License summary](https://pixabay.com/service/license-summary/)

## Project and ecosystem references

Somnia, dreamDEX, and DoraHacks names are used descriptively for the hackathon integration. Their respective marks and services remain the property of their owners.
