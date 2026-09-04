import type { Metadata } from 'next';
import Link from 'next/link';

import styles from './credits.module.css';

export const metadata: Metadata = {
  title: 'Privacy, Credits & AI Disclosure — Market Dungeon',
  description: 'How Market Dungeon handles analytics, local data, artwork, AI assistance, and demo-video music.',
};

export default function CreditsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <Link className={styles.back} href="/">← BACK TO MARKET DUNGEON</Link>
        <p className={styles.eyebrow}>PROJECT TRANSPARENCY</p>
        <h1>Privacy, credits &amp; AI disclosure</h1>
        <p className={styles.intro}>A concise record of what the live prototype measures and where its creative assets came from.</p>

        <section>
          <h2>Analytics and local data</h2>
          <p>Market Dungeon uses Vercel Web Analytics for aggregate page views and a versioned, anonymous Judge funnel. Version 2 separates entry, accepted replay lock, first reveal attempt, verified completion, definitive verification failure, sharing, challenge activity, and Continue-on-dreamDEX intent.</p>
          <p>The v2 labels use only closed categories such as interval, duration bucket, mode, direction, result, and failure or share-action type. Market Dungeon does not send wallet addresses, market IDs, commitments, proof contents, combat transcripts, names, or email addresses to analytics; exact timings and arbitrary query text are also excluded. WebDriver sessions and tests carrying the fixed <code>automation=1</code> marker are excluded. Remaining counts are non-WebDriver event volumes, not proof of unique people.</p>
          <p>The app has no account system and does not connect a wallet or submit a transaction. Persistent gold and the next-run potion count are stored only in this browser. During post-reveal verification, the browser contacts the public Somnia mainnet RPC directly to reproduce the displayed proof. The independent verifier reads proof JSON locally and never uploads the complete file. It sends only the public block reference, contract targets, and two read-only call inputs needed to reproduce the recorded state to that fixed RPC; proof data and results are not added to analytics. Continuing to dreamDEX opens that separate service in a new tab.</p>
          <Link href="/verify">OPEN INDEPENDENT PROOF VERIFIER ↗</Link>
          <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">VERCEL WEB ANALYTICS PRIVACY ↗</a>
        </section>

        <section>
          <h2>Artwork and asset provenance</h2>
          <p>Visual direction, character concepts, selection, editing, compression, and product integration were led by CryptoMickle. The checked-in hero, character, monster, coin, and social-preview artwork was created specifically for Delveworn and Market Dungeon through a human-directed workflow with generative-image assistance; no third-party game artwork is intentionally included.</p>
          <ul>
            <li><code>public/monsters/</code> — sixteen Delveworn enemy and boss scenes.</li>
            <li><code>public/characters/</code> — Quartermaster Kevin merchant artwork.</li>
            <li><code>public/assets/</code> — project hero compositions and the Delveworn gold coin.</li>
            <li><code>public/og.png</code> and <code>public/favicon.svg</code> — project social preview and interface mark.</li>
          </ul>
          <p>The MIT license covers the source code. Original visual assets are separate project assets and are not offered for reuse under the MIT grant unless explicitly marked otherwise.</p>
        </section>

        <section>
          <h2>AI assistance</h2>
          <p>Generative AI assisted artwork production, software implementation, copy development, test creation, and video-production tasks. CryptoMickle retained product direction and responsibility for final selection, editing, deployment, verification, and QA. AI assistance is not presented as an autonomous author, teammate, or source of onchain truth.</p>
        </section>

        <section>
          <h2>Demo-video music</h2>
          <p>The live web app contains no music. The baseline 1:52 v8 hackathon video uses “Dark Fantasy Ambient (Dungeon Synth music),” created by DeusLower / Vlad Bakutov and licensed under the Pixabay Content License. A replacement competition video remains paused until its Production capture and captions can be verified separately.</p>
          <div className={styles.links}>
            <a href="https://pixabay.com/music/ambient-dark-fantasy-ambient-dungeon-synth-music-281592/" target="_blank" rel="noopener noreferrer">MUSIC SOURCE ↗</a>
            <a href="https://pixabay.com/service/license-summary/" target="_blank" rel="noopener noreferrer">PIXABAY LICENSE ↗</a>
            <a href="https://youtu.be/6IviQrMweZ4" target="_blank" rel="noopener noreferrer">BASELINE V8 VIDEO ↗</a>
          </div>
        </section>

        <section>
          <h2>Project and ecosystem references</h2>
          <p>Somnia, dreamDEX, and DoraHacks names are used descriptively for the hackathon integration. Their respective marks and services remain the property of their owners.</p>
          <div className={styles.links}>
            <a href="https://github.com/CryptoMickle/market-dungeon" target="_blank" rel="noopener noreferrer">SOURCE CODE ↗</a>
            <a href="https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v10/docs/PROVENANCE_AND_PRIVACY.md" target="_blank" rel="noopener noreferrer">VERSIONED DISCLOSURE ↗</a>
          </div>
        </section>
      </article>
    </main>
  );
}
