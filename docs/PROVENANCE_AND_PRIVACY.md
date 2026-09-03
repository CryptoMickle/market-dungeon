# Market Dungeon — provenance, privacy, and AI disclosure

This document is the versioned disclosure behind the live prototype's **Privacy · Credits · AI Disclosure** page.

## Analytics and local data

Market Dungeon uses Vercel Web Analytics for aggregate page views and three anonymous funnel checkpoints:

- Judge Demo started;
- verified Judge Demo completed; and
- Continue on dreamDEX clicked.

The stable funnel labels contain only interval, mode, direction, and result. Market Dungeon does not send wallet addresses, market IDs, commitments, proof contents, combat transcripts, names, or email addresses to analytics. Automated browsers are excluded from the manual funnel events.

The application has no account system, wallet connection, approval, order, or transaction flow. Persistent gold and the next-run potion count are stored only in the player's browser. During post-reveal verification, the browser contacts the public Somnia mainnet RPC directly to reproduce the displayed proof. Continuing to dreamDEX opens that separate service in a new tab. See [Vercel's Web Analytics privacy documentation](https://vercel.com/docs/analytics/privacy-policy).

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

The live web app contains no music. The 1:52 [hackathon demo video](https://youtu.be/mZb3t6-mydo) uses **“Dark Fantasy Ambient (Dungeon Synth music)”**, created by **DeusLower / Vlad Bakutov** and licensed under the **Pixabay Content License**.

- [Music source](https://pixabay.com/music/ambient-dark-fantasy-ambient-dungeon-synth-music-281592/)
- [Pixabay Content License summary](https://pixabay.com/service/license-summary/)

## Project and ecosystem references

Somnia, dreamDEX, and DoraHacks names are used descriptively for the hackathon integration. Their respective marks and services remain the property of their owners.
